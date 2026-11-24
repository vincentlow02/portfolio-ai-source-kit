import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hostedPortfolioOrigin } from "./knowledge/hosted-origin";
import type { PortfolioCorpus } from "./portfolio-knowledge";
import { b2PublicCorpus } from "./portfolio-chat/b2";
import { validateMessages } from "./portfolio-chat/core";
import { resolveResponseLanguage } from "./portfolio-chat/language";
import { readPortfolioRequest } from "./portfolio-chat/request-body";
import { createModelReply, excerptReply } from "./portfolio-chat/source-reply";
import { reserveQuota } from "./portfolio-chat/supabase";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const files: Record<string, { name: string; type: string }> = {
  "/": { name: "preview.html", type: "text/html; charset=utf-8" },
  "/preview.js": { name: "preview.js", type: "text/javascript; charset=utf-8" },
  "/preview.css": { name: "preview.css", type: "text/css; charset=utf-8" },
  "/embed.js": { name: "embed.js", type: "text/javascript; charset=utf-8" },
  "/embed.css": { name: "embed.css", type: "text/css; charset=utf-8" },
};

async function loadHostedAssistant() {
  const artifact = join(process.cwd(), ".portfolio-knowledge", "hosted.json");
  const stored = JSON.parse(await readFile(artifact, "utf8")) as { origin: string; corpus: PortfolioCorpus };
  const origin = hostedPortfolioOrigin(process.env.PORTFOLIO_SITE_ORIGIN);
  if (stored.origin !== origin || stored.corpus?.schemaVersion !== 1 || !stored.corpus.contentHash) throw new Error("Hosted corpus does not match the deployment");
  const corpus = b2PublicCorpus(stored.corpus, "hosted");
  corpus.chunks = corpus.chunks.filter(chunk => chunk.accessLevel === "public" &&
    chunk.buildVersion === corpus.contentHash && corpus.pages.some(page => page.url === chunk.sourceUrl.split("#")[0]));
  if (!corpus.chunks.length) throw new Error("The hosted corpus has no eligible passages");
  const model = process.env.PORTFOLIO_HOSTED_MODEL === "1"
    ? createModelReply(corpus, { ...process.env, PORTFOLIO_AI_PROVIDER: "qwen", QWEN_JSON_MODE: process.env.QWEN_JSON_MODE ?? "object" })
    : undefined;
  return { origin, corpus, model };
}

let assistant: ReturnType<typeof loadHostedAssistant> | undefined;
function getAssistant() {
  assistant ??= loadHostedAssistant().catch(error => { assistant = undefined; throw error; });
  return assistant;
}

export async function serveHostedAsset(request: Request) {
  const path = new URL(request.url).pathname;
  const asset = Object.hasOwn(files, path) ? files[path] : undefined;
  if (!asset) return new Response("Not found", { status: 404, headers });
  try {
    const { origin, model } = await getAssistant();
    const body = await readFile(join(process.cwd(), "scripts", "portfolio-chat", "local-preview", asset.name), "utf8");
    if (path !== "/") return new Response(body, { headers: { ...headers, "Content-Type": asset.type } });
    return new Response(body.replace("{{mode}}", model ? "Ask about this portfolio" : "Find passages in this portfolio"), { headers: {
      ...headers,
      "Content-Type": asset.type,
      "Content-Security-Policy": `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors ${origin}`,
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
  let messages;
  try {
    const body = await readPortfolioRequest(request, 8000) as { messages?: unknown } | null;
    messages = validateMessages(body?.messages);
  } catch {
    return Response.json({ error: "Enter a question of up to 2,000 characters." }, { status: 400, headers });
  }
  try {
    const { origin, corpus, model } = await getAssistant();
    if (model) {
      let allowed: boolean;
      try { allowed = await reserveQuota(process.env); }
      catch { return Response.json({ error: "The model quota service is unavailable." }, { status: 503, headers }); }
      if (!allowed) return Response.json({ error: "The request limit has been reached. Try again later." }, { status: 429, headers });
    }
    const language = resolveResponseLanguage(messages, corpus.pages[0]?.language);
    const result = model ? await model(messages, language) : await excerptReply(corpus, messages, language);
    return Response.json({
      answer: result.answer,
      sources: result.sources.map(source => ({ section: source.section, href: new URL(source.url, origin).href })),
    }, { headers });
  } catch {
    return Response.json({ error: "Portfolio AI could not answer this question." }, { status: 503, headers });
  }
}
