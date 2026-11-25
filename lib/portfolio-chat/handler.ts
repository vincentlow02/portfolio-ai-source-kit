import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadPortfolioCorpus } from "../portfolio-knowledge";
import { validateMessages } from "./core";
import { configureModel } from "./provider";
import { isLocalDevRequest } from "./local-access";
import { analyticsSession, validPublicOrigin } from "./session";
import { recordEvent, reserveQuota, type AnalyticsEvent } from "./supabase";
import { resolveResponseLanguage } from "./language";
import { resolveGuardianReply } from "./guardian";
import { verifySelection } from "./selection";
import { b2PublicCorpus, parsePageContext } from "./b2";
import { excerptFromPack, generateAnswer, prepareAnswer, SelectionUnavailable } from "./answer-engine";
import { RequestTiming } from "./timing";
import { readPortfolioRequest } from "./request-body";
import { createRequestLimiter } from "./request-limits";
import { portfolioLanguageTerms, type PortfolioChatConfig } from "./engine-config";

function authorized(request: Request, config: PortfolioChatConfig): boolean {
  if (isLocalDevRequest(request, process.env)) return true;
  if (validPublicOrigin(request, process.env, config)) return true;
  const secret = process.env.PORTFOLIO_AI_ACCESS_TOKEN;
  const header = request.headers.get("authorization");
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!secret || secret.length < 32 || !supplied) return false;
  return timingSafeEqual(createHash("sha256").update(secret).digest(), createHash("sha256").update(supplied).digest());
}

export function createPortfolioChatHandler(config: PortfolioChatConfig) {
  const languageTerms = portfolioLanguageTerms(config);
  const enterRequest = createRequestLimiter(10, 2);

  return async function POST(request: Request) {
  const timingEnabled = process.env.PORTFOLIO_AI_TIMING === "1";
  const timing = new RequestTiming(timingEnabled);
  try {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (!authorized(request, config)) {
    const origin = process.env.PORTFOLIO_AI_PUBLIC_ORIGIN;
    console.warn("Portfolio AI authorization rejected", {
      production: process.env.NODE_ENV === "production",
      vercelProduction: process.env.VERCEL_ENV === "production",
      publicEnabled: process.env.PORTFOLIO_AI_PUBLIC_ENABLED === "1",
      originConfigured: Boolean(origin),
      requestOriginMatches: Boolean(origin && request.headers.get("origin") === origin),
      requestUrlMatches: Boolean(origin && new URL(request.url).origin === origin),
      sameOrigin: request.headers.get("sec-fetch-site") === "same-origin",
    });
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  const session = process.env.PORTFOLIO_AI_ANALYTICS === "1" ? analyticsSession(request, config.sessionCookieName) : null;
  if (session?.setCookie) headers["Set-Cookie"] = session.setCookie;
  const release = enterRequest();
  if (!release) return Response.json({ error: "Rate limit exceeded" }, { status: 429, headers });
  try {
  let messages;
  let pageContext: unknown;
  let selectionContext: unknown;
  let previousSuggestions: string[] | undefined;
  try {
    const body = await readPortfolioRequest(request, 32_000);
    if (!body || typeof body !== "object" || Object.keys(body).some((key) => key !== "messages" && key !== "pageContext" && key !== "previousSuggestions" && key !== "selectionContext")) throw new Error("Invalid request");
    messages = validateMessages((body as { messages?: unknown }).messages);
    pageContext = (body as { pageContext?: unknown }).pageContext;
    selectionContext = (body as { selectionContext?: unknown }).selectionContext;
    const prior = (body as { previousSuggestions?: unknown }).previousSuggestions;
    if (prior !== undefined && (!Array.isArray(prior) || prior.length > 36 || prior.some(q => typeof q !== "string" || q.length > 180))) throw new Error("Invalid suggestions");
    previousSuggestions = prior as string[] | undefined;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400, headers });
  }
  const latestUserMessage = [...messages].reverse().find(message => message.role === "user");
  const guardianReply = latestUserMessage ? resolveGuardianReply(latestUserMessage.content, config.supportedLanguages?.[0], { ...config, languageTerms }) : null;
  if (guardianReply) return Response.json({ answer: guardianReply.answer, language: guardianReply.language, sources: [], recommendations: [], claims: [], insufficient: true, followUpQuestions: [] }, { headers });
  const started = performance.now();
  let providerModel: string | null = null;
  let recordedUsage: { inputTokens?: number; outputTokens?: number } | undefined;
  let safePath = "/";
  let safeProject: string | null = null;
  let category: AnalyticsEvent["question_category"] = "other";
  const log = (status: AnalyticsEvent["answer_status"], usage?: { inputTokens?: number; outputTokens?: number }) =>
    session && recordEvent({ session_id: session.id, event_type: "chat", page_path: safePath, project_id: safeProject, question_category: category, answer_status: status, model: providerModel, input_tokens: usage?.inputTokens ?? null, output_tokens: usage?.outputTokens ?? null, latency_ms: Math.min(120000, Math.round(performance.now() - started)) }, process.env);
  try {
    const safeCorpus = await timing.measure("knowledge", async () => {
      const corpus = await loadPortfolioCorpus();
      return b2PublicCorpus(corpus, (await readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim(), config);
    });
      let page;
      try { page = parsePageContext(pageContext, safeCorpus, config); } catch { return Response.json({ error: "Invalid page context" }, { status: 400, headers }); }
      safePath = page?.path ?? "/";
      const detected = resolveResponseLanguage(messages, page?.lang, languageTerms);
      const language = config.supportedLanguages?.length && !config.supportedLanguages.includes(detected) ? (page?.lang ?? config.supportedLanguages[0]) : detected;
      let selection: ReturnType<typeof verifySelection> | undefined;
      try { if (selectionContext !== undefined) selection = verifySelection(selectionContext, safeCorpus, page); } catch { return Response.json({ error: "Invalid selection" }, { status: 400, headers }); }
      const input = { corpus: safeCorpus, messages, page, language, selection, config, previousSuggestions, timing: timingEnabled ? timing : undefined };
      const { pack, answer } = await prepareAnswer(input);
      safeProject = pack.projects.length === 1 ? pack.projects[0] : null;
      category = pack.intent === "COMPARISON" ? "comparison" : pack.intent === "PERSONAL_OVERVIEW" || safePath === config.profilePath && !pack.projects.length ? "about" : pack.intent.startsWith("PROJECT_") || pack.projects.length ? "project" : "other";
      const evidence = { selectedCount: pack.entries.length, bytes: pack.bytes, fallback: pack.fallback, projectIds: pack.projects };
      const latencyMs = () => Math.round(performance.now() - started);
      if (answer) {
        await log(answer.clarification ? "clarification" : answer.insufficient ? "insufficient" : "answered");
        const metadata = answer.clarification ? {} : {
          evidence, usage: { model: null, provider: null, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, latencyMs: latencyMs() },
        };
        return Response.json({ ...answer, ...metadata }, { headers });
      }
      const configured = configureModel(process.env);
      if (!configured) {
        const excerpt = excerptFromPack(input, pack);
        await log(excerpt.insufficient ? "insufficient" : "answered");
        return Response.json({ ...excerpt, evidence, usage: {
          model: null, provider: null, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, latencyMs: latencyMs(),
        } }, { headers });
      }
      const allowedModel = config.allowedPublicModels?.includes(configured.provider + "/" + configured.modelId) ??
        (configured.provider === "qwen" && /^qwen3\.7-flash(?:-\d{4}-\d{2}-\d{2})?$/u.test(configured.modelId));
      if ((process.env.PORTFOLIO_AI_PUBLIC_ENABLED === "1" || process.env.PORTFOLIO_AI_PROTECTED_PREVIEW === "1") && !allowedModel) {
        console.warn("Portfolio AI provider configuration is missing or invalid.");
        return Response.json({ error: "AI service is not configured" }, { status: 503, headers });
      }
      providerModel = configured.modelId;
      request.signal.throwIfAborted();
      let reserved = false;
      try { reserved = await reserveQuota(process.env); } catch { await log("error"); return Response.json({ error: "AI quota unavailable" }, { status: 503, headers }); }
      if (!reserved) { await log("error"); return Response.json({ error: "AI quota exceeded" }, { status: 429, headers }); }
      const result = await generateAnswer(input, pack, configured, process.env.QWEN_JSON_MODE?.trim() === "object", request.signal, usage => { recordedUsage = usage; });
      await log(result.answer.insufficient ? "insufficient" : "answered", recordedUsage);
      return Response.json({ ...result.answer, evidence, usage: { ...result.usage, latencyMs: latencyMs() } }, { headers });
  } catch (error) {
    if (error instanceof SelectionUnavailable) return Response.json({ error: "Selection unavailable" }, { status: 400, headers });
    await log("error", recordedUsage);
    return Response.json({ error: "Unable to produce a validated answer" }, { status: 502, headers });
  }
  } finally {
    release();
  }
  } finally {
    timing.finish();
  }
};
}
