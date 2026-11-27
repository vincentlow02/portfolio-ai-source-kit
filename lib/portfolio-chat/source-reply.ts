import type { PortfolioChunk, PortfolioCorpus } from "../portfolio-knowledge";
import { answerLinkParts } from "./answer-markdown";
import { buildB2Pack, parsePageContext, startingProjectReply } from "./b2";
import { excerptFromPack, generateAnswer, prepareAnswer } from "./answer-engine";
import { validateAnswer, validateMessages, type ChatMessage } from "./core";
import { resolvePublishedLinkReply } from "./link-reply";
import { resolveGuardianReply } from "./guardian";
import { GenerationError } from "./generation";
import type { ResponseLanguage } from "./language";
import { configureModel } from "./provider";
import { isSubstantivePassage } from "./retrieval";
import { verifySelection } from "./selection";
import type { RequestTiming } from "./timing";

type VerifiedQuote = ReturnType<typeof verifySelection>;
type PageContext = ReturnType<typeof parsePageContext>;

function canSuggestSource(chunk: PortfolioChunk, corpus: PortfolioCorpus) {
  return chunk.accessLevel === "public" && chunk.buildVersion === corpus.contentHash &&
    corpus.pages.some(page => page.url === chunk.sourceUrl.split("#")[0]) &&
    isSubstantivePassage(chunk) && chunk.sectionTitle.length >= 3 && chunk.sectionTitle.length <= 100 &&
    !/[<>\r\n]|https?:\/\//iu.test(chunk.sectionTitle);
}

function widgetFollowUpQuestion(chunk: PortfolioChunk, language: ResponseLanguage) {
  const title = chunk.pageTitle.slice(0, 100).toWellFormed();
  const section = chunk.sectionTitle;
  return {
    en: `What does ${title} say about ${section}?`,
    zh: `「${title}」的「${section}」部分讲了什么？`,
    ja: `「${title}」の「${section}」には何が書かれていますか？`,
  }[language];
}

export function widgetFollowUpReply(corpus: PortfolioCorpus, chunk: PortfolioChunk) {
  const answer = validateAnswer({ language: chunk.language, insufficient: false, answer: "Matching portfolio passage.",
    sourceIds: [chunk.chunkId], recommendedProjectIds: [] }, corpus);
  return { ...answer, answer: chunk.content.slice(chunk.content.indexOf("\n") + 1), insufficient: false };
}

export function widgetResponse(result: { answer: string; sources: ReadonlyArray<{ section: string; url: string }>; followUpQuestions?: string[]; excerptFallback?: true }, origin: string,
  context?: { corpus: PortfolioCorpus; language: ResponseLanguage }) {
  const answerParts = answerLinkParts(result.answer, origin);
  // Open widgets can keep using their original script after the server restarts.
  const answer = answerParts?.map(part => {
    if (typeof part === "string") return part;
    const destination = part.href.startsWith("mailto:") ? decodeURIComponent(part.href.slice("mailto:".length)) : part.href;
    return destination === part.text ? part.text : `${part.text} (${destination})`;
  }).join("") ?? result.answer;
  let followUps = result.followUpQuestions;
  const followUpSourceIds: string[] = [];
  if (context) {
    const pages = new Set(result.sources.map(source => source.url.split("#")[0]));
    const sections = new Set(result.sources.map(source => source.section));
    followUps = [];
    if (pages.size === 1) for (const chunk of context.corpus.chunks) {
      if (!pages.has(chunk.sourceUrl.split("#")[0]) || sections.has(chunk.sectionTitle) || !canSuggestSource(chunk, context.corpus)) continue;
      sections.add(chunk.sectionTitle);
      followUps.push(widgetFollowUpQuestion(chunk, context.language));
      followUpSourceIds.push(chunk.chunkId);
      if (followUps.length === 2) break;
    }
  }
  return {
    answer,
    ...(answerParts && { answerParts }),
    ...(result.excerptFallback && { excerptFallback: true }),
    sources: result.sources.map(source => ({ section: source.section, href: new URL(source.url, origin).href })),
    ...(followUps?.length ? { followUpQuestions: followUps } : {}),
    ...(followUpSourceIds.length ? { followUpSourceIds } : {}),
  };
}

export function validateWidgetQuestion(body: unknown, corpus: PortfolioCorpus) {
  const input = body as { messages?: unknown; pageContext?: unknown; selectionContext?: unknown; followUpSourceId?: unknown } | null;
  const messages = validateMessages(input?.messages);
  const page = parsePageContext(input?.pageContext, corpus);
  if (input?.followUpSourceId !== undefined) {
    const id = input.followUpSourceId;
    if (typeof id !== "string" || !/^[a-f0-9]{24}$/u.test(id) || messages.length !== 1 || input.selectionContext !== undefined) throw new Error("Invalid follow-up");
    const chunk = corpus.chunks.find(candidate => candidate.chunkId === id);
    const languages = ["en", "zh", "ja"] as const;
    if (!chunk || !canSuggestSource(chunk, corpus) || !languages.some(language => widgetFollowUpQuestion(chunk, language) === messages[0].content)) throw new Error("Invalid follow-up");
    return { messages, page, quote: undefined, followUp: chunk };
  }
  if (input?.selectionContext === undefined) return { messages, page, quote: undefined, followUp: undefined };
  if (!input.selectionContext || typeof input.selectionContext !== "object" || Array.isArray(input.selectionContext)) throw new Error("Invalid selection");
  const { lang, ...selection } = input.selectionContext as Record<string, unknown>;
  const selectionPage = parsePageContext({ pathname: selection.pagePath, lang }, corpus);
  return { messages, page: selectionPage, quote: verifySelection(selection, corpus, selectionPage), followUp: undefined };
}

export class WidgetQuotaError extends Error {
  constructor(readonly status: 429 | 503) { super("Widget quota reservation failed"); }
}

const generationFallbackReasons = {
  cancelled: null, timeout: "model_timeout", provider: "model_provider",
  json: "model_format", schema: "model_format", empty: "model_format",
} as const;

function directWidgetReply(corpus: PortfolioCorpus, question: string, language: ResponseLanguage,
  quote?: VerifiedQuote, page?: PageContext) {
  const guardian = resolveGuardianReply(question, language);
  if (guardian) return { answer: guardian.answer, sources: [], recommendations: [], insufficient: guardian.insufficient ?? true };
  if (quote) return null;
  return resolvePublishedLinkReply(corpus, question, language, { page }) ?? startingProjectReply(corpus, question, language);
}

export function createModelReply(corpus: PortfolioCorpus, env: Record<string, string | undefined> = process.env) {
  const provider = configureModel(env);
  if (!provider) throw new Error("Configure a supported model provider before enabling model replies");
  const objectMode = env.QWEN_JSON_MODE?.trim() === "object";

  return async (messages: ChatMessage[], language: ResponseLanguage, quote?: VerifiedQuote,
    options: { page?: PageContext; signal?: AbortSignal; reserve?: () => Promise<boolean>; fallbackToExcerpt?: boolean; timing?: RequestTiming } = {}) => {
    const direct = directWidgetReply(corpus, messages.at(-1)!.content, language, quote, options.page);
    if (direct) {
      options.timing?.answer("direct");
      return direct;
    }
    const input = { corpus, messages, language, page: options.page, selection: quote, allowUnstructuredCatalog: true, timing: options.timing };
    const { pack, answer } = await prepareAnswer(input);
    if (answer) {
      options.timing?.answer("direct");
      return answer;
    }
    options.signal?.throwIfAborted();
    try {
      if (options.reserve) {
        let allowed: boolean;
        try { allowed = await options.reserve(); } catch { throw new WidgetQuotaError(503); }
        if (allowed !== true) throw new WidgetQuotaError(429);
      }
      const { answer } = await generateAnswer(input, pack, provider, objectMode, options.signal);
      options.timing?.answer("model");
      return answer;
    } catch (error) {
      const reason = error instanceof WidgetQuotaError ? (error.status === 429 ? "quota_denied" : "quota_unavailable") :
        error instanceof GenerationError ? generationFallbackReasons[error.kind] : null;
      if (!reason || (reason !== "model_format" && !options.fallbackToExcerpt)) throw error;
      options.signal?.throwIfAborted();
      const excerpt = excerptFromPack(input, pack);
      options.timing?.answer("excerpt", reason);
      return excerpt.sources.length ? { ...excerpt, excerptFallback: true as const } : excerpt;
    }
  };
}

export async function excerptReply(corpus: PortfolioCorpus, messages: ChatMessage[], language: ResponseLanguage,
  quote?: VerifiedQuote, page?: PageContext, timing?: RequestTiming) {
  const direct = directWidgetReply(corpus, messages.at(-1)!.content, language, quote, page);
  if (direct) {
    timing?.answer("direct");
    return direct;
  }
  const pack = await buildB2Pack(corpus, messages, page ?? null, language, quote?.chunk, timing?.record.bind(timing), undefined, true);
  const answer = excerptFromPack({ corpus, messages, language, page, selection: quote }, pack);
  timing?.answer("excerpt");
  return answer;
}
