import "server-only";

import { checkRateLimit } from "@vercel/firewall";
import { after } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hostedQuestionLogEnabled, redactHostedQuestion, writeHostedQuestionLog, type HostedQuestionLog } from "./hosted-question-log";
import { hostedPortfolioOrigin } from "./knowledge/hosted-origin";
import { parsePortfolioCorpus } from "./knowledge/corpus";
import { b2PublicCorpus } from "./portfolio-chat/b2";
import { resolveResponseLanguage } from "./portfolio-chat/language";
import { readPortfolioRequest } from "./portfolio-chat/request-body";
import { createModelReply, excerptReply, validateWidgetQuestion, widgetFollowUpReply, widgetResponse } from "./portfolio-chat/source-reply";
import { reserveQuota } from "./portfolio-chat/supabase";
import { createRequestLimiter } from "./portfolio-chat/request-limits";
import { RequestTiming } from "./portfolio-chat/timing";
import { readWidgetAsset, widgetAssets, widgetFramePolicy } from "./portfolio-chat/widget-assets";

const enterHostedRequest = createRequestLimiter(60, 2);
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

async function reserveHostedModelQuota() {
  if (process.env.SUPABASE_URL || process.env.SUPABASE_SECRET_KEY) return reserveQuota(process.env);

  // The generated deployment URL can require Vercel authentication even in production.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production" || process.env.NODE_ENV !== "production" ||
      !host || !/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/u.test(host)) throw new Error("Hosted model quota is unavailable");

  const { rateLimited, error } = await checkRateLimit("portfolio-ai-qwen", {
    headers: { host },
    rateLimitKey: "portfolio-ai-qwen",
    timeout: 2_000,
  });
  if (error !== undefined) throw new Error("Hosted model quota is unavailable");
  return rateLimited === false;
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
      model = createModelReply(corpus, { ...process.env, QWEN_JSON_MODE: process.env.QWEN_JSON_MODE ?? "object" });
    } catch {
      console.warn("Portfolio AI will use excerpts. Check the hosted model configuration.");
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
    let config;
    if (path === "/" || path === "/embed.js") {
      const { origin, corpus } = await getAssistant();
      config = { origin, paths: corpus.pages.map(page => page.url), questionLogEnabled: hostedQuestionLogEnabled() };
    }
    const body = await readWidgetAsset(process.cwd(), path, config);
    return new Response(typeof body === "string" || !body ? body : new Uint8Array(body), { headers: {
      ...headers,
      ...(!config && { "Cache-Control": "public, max-age=300, s-maxage=300" }),
      "Content-Type": asset.type,
      ...(path === "/" && config && { "Content-Security-Policy": widgetFramePolicy(config.origin) }),
      ...(path === "/widget/geist.woff2" && { "Access-Control-Allow-Origin": hostedPortfolioOrigin(process.env.PORTFOLIO_SITE_ORIGIN) }),
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
  const timing = new RequestTiming(process.env.PORTFOLIO_AI_TIMING === "1");
  const release = enterHostedRequest();
  if (!release) {
    timing.finish({ httpStatus: 429 });
    return Response.json({ error: "The request limit has been reached. Try again later." }, { status: 429, headers });
  }
  let httpStatus = 503;
  let answerStatus: HostedQuestionLog["answer_status"] | undefined;
  let modelUnavailable = false;
  let questionLog: HostedQuestionLog | undefined;
  try {
    let body;
    try {
      body = await readPortfolioRequest(request, 16000);
    } catch {
      httpStatus = 400;
      return Response.json({ error: "Enter a question of up to 2,000 characters." }, { status: 400, headers });
    }
    const { origin, corpus, model } = await timing.measure("knowledge", getAssistant);
    let question;
    try { question = validateWidgetQuestion(body, corpus); }
    catch {
      httpStatus = 400;
      return Response.json({ error: "Enter a question or select verified public text." }, { status: 400, headers });
    }
    const { messages, page, quote, followUp } = question;
    if (hostedQuestionLogEnabled()) {
      const question = redactHostedQuestion(messages.at(-1)!.content);
      if (question) questionLog = { created_at: new Date().toISOString(), question, page_path: page?.path ?? null, answer_status: "error" };
    }
    const language = resolveResponseLanguage(messages, corpus.pages[0]?.language);
    request.signal.throwIfAborted();
    if (followUp) timing.answer("excerpt");
    modelUnavailable = !followUp && !model && process.env.PORTFOLIO_HOSTED_MODEL === "1";
    const result = followUp ? widgetFollowUpReply(corpus, followUp) : model
      ? await model(messages, language, quote, { page, signal: request.signal, reserve: reserveHostedModelQuota, fallbackToExcerpt: true, timing })
      : await excerptReply(corpus, messages, language, quote, page, timing);
    const response = Response.json(widgetResponse(result, origin, { corpus, language }), { headers });
    answerStatus = "excerptFallback" in result && result.excerptFallback ? "excerpt_fallback" :
      "insufficient" in result && result.insufficient ? "insufficient" : "answered";
    if (questionLog) questionLog.answer_status = answerStatus;
    httpStatus = response.status;
    return response;
  } catch {
    return Response.json({ error: "Portfolio AI could not answer this question." }, { status: 503, headers });
  } finally {
    release();
    timing.finish({ httpStatus, answerStatus: answerStatus ?? (httpStatus === 503 ? "error" : undefined), modelUnavailable });
    const event = questionLog;
    if (event) after(() => writeHostedQuestionLog(event));
  }
}
