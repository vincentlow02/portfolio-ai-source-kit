import type { PortfolioCorpus } from "../portfolio-knowledge";
import { answerLinkParts } from "./answer-markdown";
import { buildB2Pack, parsePageContext } from "./b2";
import { excerptFromPack, generateAnswer, prepareAnswer } from "./answer-engine";
import { validateMessages, type ChatMessage } from "./core";
import { resolvePublishedLinkReply } from "./link-reply";
import { resolveGuardianReply } from "./guardian";
import { GenerationError } from "./generation";
import type { ResponseLanguage } from "./language";
import { configureModel } from "./provider";
import { verifySelection } from "./selection";
import type { RequestTiming } from "./timing";

type VerifiedQuote = ReturnType<typeof verifySelection>;
type PageContext = ReturnType<typeof parsePageContext>;

export function widgetResponse(result: { answer: string; sources: ReadonlyArray<{ section: string; url: string }>; followUpQuestions?: string[] }, origin: string) {
  const answerParts = answerLinkParts(result.answer, origin);
  // Open widgets can keep using their original script after the server restarts.
  const answer = answerParts?.map(part => {
    if (typeof part === "string") return part;
    const destination = part.href.startsWith("mailto:") ? decodeURIComponent(part.href.slice("mailto:".length)) : part.href;
    return destination === part.text ? part.text : `${part.text} (${destination})`;
  }).join("") ?? result.answer;
  return {
    answer,
    ...(answerParts && { answerParts }),
    sources: result.sources.map(source => ({ section: source.section, href: new URL(source.url, origin).href })),
    ...(result.followUpQuestions?.length ? { followUpQuestions: result.followUpQuestions } : {}),
  };
}

export function validateWidgetQuestion(body: unknown, corpus: PortfolioCorpus) {
  const input = body as { messages?: unknown; pageContext?: unknown; selectionContext?: unknown } | null;
  const messages = validateMessages(input?.messages);
  const page = parsePageContext(input?.pageContext, corpus);
  if (input?.selectionContext === undefined) return { messages, page, quote: undefined };
  if (!input.selectionContext || typeof input.selectionContext !== "object" || Array.isArray(input.selectionContext)) throw new Error("Invalid selection");
  const { lang, ...selection } = input.selectionContext as Record<string, unknown>;
  const selectionPage = parsePageContext({ pathname: selection.pagePath, lang }, corpus);
  return { messages, page: selectionPage, quote: verifySelection(selection, corpus, selectionPage) };
}

export class WidgetQuotaError extends Error {
  constructor(readonly status: 429 | 503) { super("Widget quota reservation failed"); }
}

export function createModelReply(corpus: PortfolioCorpus, env: NodeJS.ProcessEnv = process.env) {
  const provider = configureModel(env);
  if (!provider) throw new Error("Configure a supported model provider before enabling model replies");
  const objectMode = env.QWEN_JSON_MODE?.trim() === "object";

  return async (messages: ChatMessage[], language: ResponseLanguage, quote?: VerifiedQuote,
    options: { page?: PageContext; signal?: AbortSignal; reserve?: () => Promise<boolean>; fallbackToExcerpt?: boolean; timing?: RequestTiming } = {}) => {
    const question = messages.at(-1)!.content;
    const guardian = resolveGuardianReply(question, language);
    if (guardian) return { answer: guardian.answer, sources: [] };
    const link = !quote && resolvePublishedLinkReply(corpus, question, language, { page: options.page });
    if (link) return link;
    const input = { corpus, messages, language, page: options.page, selection: quote, allowUnstructuredCatalog: true, timing: options.timing };
    const { pack, answer } = await prepareAnswer(input);
    if (answer) return answer;
    options.signal?.throwIfAborted();
    try {
      if (options.reserve) {
        let allowed: boolean;
        try { allowed = await options.reserve(); } catch { throw new WidgetQuotaError(503); }
        if (allowed !== true) throw new WidgetQuotaError(429);
      }
      return (await generateAnswer(input, pack, provider, objectMode, options.signal)).answer;
    } catch (error) {
      if (!options.fallbackToExcerpt || !(error instanceof WidgetQuotaError || error instanceof GenerationError && error.kind !== "cancelled")) throw error;
      options.signal?.throwIfAborted();
      return excerptFromPack(input, pack);
    }
  };
}

export async function excerptReply(corpus: PortfolioCorpus, messages: ChatMessage[], language: ResponseLanguage,
  quote?: VerifiedQuote, page?: PageContext, timing?: RequestTiming) {
  const question = messages.at(-1)!.content;
  const guardian = resolveGuardianReply(question, language);
  if (guardian) return { answer: guardian.answer, sources: [], recommendations: [] };
  const link = !quote && resolvePublishedLinkReply(corpus, question, language, { page });
  if (link) return link;
  const pack = await buildB2Pack(corpus, messages, page ?? null, language, quote?.chunk, timing?.record.bind(timing), undefined, true);
  return excerptFromPack({ corpus, messages, language, page, selection: quote }, pack);
}
