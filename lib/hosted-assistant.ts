import "server-only";

import { checkRateLimit } from "@vercel/firewall";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hostedPortfolioOrigin } from "./knowledge/hosted-origin";
import { parsePortfolioCorpus } from "./knowledge/corpus";
import { b2PublicCorpus } from "./portfolio-chat/b2";
import { GenerationError } from "./portfolio-chat/generation";
import { resolveResponseLanguage } from "./portfolio-chat/language";
import { readPortfolioRequest } from "./portfolio-chat/request-body";
import { createModelReply, excerptReply, validateWidgetQuestion, widgetResponse, WidgetQuotaError } from "./portfolio-chat/source-reply";
import { reserveQuota } from "./portfolio-chat/supabase";
import { readWidgetAsset, widgetAssets, widgetFramePolicy } from "./portfolio-chat/widget-assets";

import { createRequestLimiter } from "./portfolio-chat/request-limits";

const enterHostedRequest = createRequestLimiter(60, 2);
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

async function reserveHostedModelQuota() {
  if (process.env.SUPABASE_URL || process.env.SUPABASE_SECRET_KEY) return reserveQuota(process.env);

  // The generated deployment URL can require Vercel authentication even in production.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production" || process.env.NODE_ENV !== "production" ||
      !host || !/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/u.test(host)) return false;

  const { rateLimited, error } = await checkRateLimit("portfolio-ai-qwen", {
    headers: { host },
    rateLimitKey: "portfolio-ai-qwen",
    timeout: 2_000,
  });
  return rateLimited === false && error === undefined;
}

async function loadHostedAssistant() {
  const artifact = join(process.cwd(), ".portfolio-knowledge", "hosted.json");
  const stored = JSON.parse(await readFile(artifact, "utf8")) as { origin?: unknown; corpus?: unknown };
  const origin = hostedPortfolioOrigin(process.env.PORTFOLIO_SITE_ORIGIN);
  if (stored.origin !== origin) throw new Error("Hosted corpus does not match the deployment");
  const corpus = b2PublicCorpus(parsePortfolioCorpus(stored.corpus), "hosted");
  if (!corpus.chunks.length) throw new Error("The hosted corpus has no eligible passages");
  let model;
  if (process.env.PORTFOLIO_HOSTED_MODEL === "1") {
    try {
      model = createModelReply(corpus, { ...process.env, PORTFOLIO_AI_PROVIDER: "qwen", QWEN_JSON_MODE: process.env.QWEN_JSON_MODE ?? "object" });
    } catch {
      console.warn("Portfolio AI will use Hybrid retrieval. Check the hosted Qwen configuration.");
    }
  }
  return { origin, corpus, model };
}

let assistant: ReturnType<typeof loadHostedAssistant> | undefined;
function getAssistant() {
  assistant ??= loadHostedAssistant().catch(error => { assistant = undefined; throw error; });
  return assistant;
}

export async function serveHostedAsset(request: Request) {
  const path = new URL(request.url).pathname;
  const asset = widgetAssets.get(path);
  if (!asset) return new Response("Not found", { status: 404, headers });
  try {
    const { origin, corpus, model } = await getAssistant();
    const body = await readWidgetAsset(process.cwd(), path, {
      origin, paths: corpus.pages.map(page => page.url), mode: model ? "Model preview" : "Hybrid retrieval",
    });
    return new Response(typeof body === "string" || !body ? body : new Uint8Array(body), { headers: {
      ...headers,
      "Content-Type": asset.type,
      ...(path === "/" ? { "Content-Security-Policy": widgetFramePolicy(origin) } : {}),
      ...(path === "/widget/geist.woff2" ? { "Access-Control-Allow-Origin": origin } : {}),
    } });
  } catch {
    return new Response("Portfolio AI is unavailable.", { status: 503, headers });
  }
}

export async function answerHostedQuestion(request: Request) {
  if (new URL(request.url).pathname !== "/api/preview") return new Response("Not found", { status: 404, headers });
  // Next can build request.url with an internal hostname behind a reverse proxy.
  const host = request.headers.get("Host");
  const site = request.headers.get("Origin");
  const local = host && /^127\.0\.0\.1:\d+$/u.test(host);
  const sameOrigin = host && (site === `https://${host}` || (local && site === `http://${host}`));
  if (!sameOrigin || request.headers.get("Sec-Fetch-Site") !== "same-origin") {
    return Response.json({ error: "Open the portfolio chat before asking a question." }, { status: 403, headers });
  }
  const release = enterHostedRequest();
  if (!release) return Response.json({ error: "The request limit has been reached. Try again later." }, { status: 429, headers });
  try {
    let body;
    try {
      body = await readPortfolioRequest(request, 16000);
    } catch {
      return Response.json({ error: "Enter a question of up to 2,000 characters." }, { status: 400, headers });
    }
    const { origin, corpus, model } = await getAssistant();
    let question;
    try { question = validateWidgetQuestion(body, corpus); }
    catch { return Response.json({ error: "Enter a question or select verified public text." }, { status: 400, headers }); }
    const { messages, page, quote } = question;
    const language = resolveResponseLanguage(messages, corpus.pages[0]?.language);
    let result;
    try {
      result = await model?.(messages, language, quote, { page, signal: request.signal, reserve: reserveHostedModelQuota });
    } catch (error) {
      if (!(error instanceof WidgetQuotaError || error instanceof GenerationError && error.kind !== "cancelled")) throw error;
    }
    request.signal.throwIfAborted();
    result ??= await excerptReply(corpus, messages, language, quote, page);
    return Response.json(widgetResponse(result, origin), { headers });
  } catch {
    return Response.json({ error: "Portfolio AI could not answer this question." }, { status: 503, headers });
  } finally { release(); }
}
