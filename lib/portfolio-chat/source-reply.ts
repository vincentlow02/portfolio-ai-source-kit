import type { PortfolioCorpus } from "../portfolio-knowledge";
import { buildB2Pack, parsePageContext } from "./b2";
import { generateAnswer, prepareAnswer } from "./answer-engine";
import { validateAnswer, validateMessages, type ChatMessage } from "./core";
import { resolveGuardianReply } from "./guardian";
import type { ResponseLanguage } from "./language";
import { configureModel } from "./provider";
import { isSubstantivePassage, resolveContext, retrieveEvidence, sourceMatchesSpecificIntent } from "./retrieval";
import { verifySelection } from "./selection";

type VerifiedQuote = ReturnType<typeof verifySelection>;

export function widgetResponse(result: { answer: string; sources: ReadonlyArray<{ section: string; url: string }>; followUpQuestions?: string[] }, origin: string) {
  return {
    answer: result.answer,
    sources: result.sources.map(source => ({ section: source.section, href: new URL(source.url, origin).href })),
    ...(result.followUpQuestions?.length ? { followUpQuestions: result.followUpQuestions } : {}),
  };
}

export function validateWidgetQuestion(body: unknown, corpus: PortfolioCorpus) {
  const input = body as { messages?: unknown; selectionContext?: unknown } | null;
  const messages = validateMessages(input?.messages);
  if (input?.selectionContext === undefined) return { messages, quote: undefined };
  if (!input.selectionContext || typeof input.selectionContext !== "object" || Array.isArray(input.selectionContext)) throw new Error("Invalid selection");
  const { lang, ...selection } = input.selectionContext as Record<string, unknown>;
  const page = parsePageContext({ pathname: selection.pagePath, lang }, corpus);
  return { messages, quote: verifySelection(selection, corpus, page) };
}

export class WidgetQuotaError extends Error {
  constructor(readonly status: 429 | 503) { super("Widget quota reservation failed"); }
}

export function createModelReply(corpus: PortfolioCorpus, env: NodeJS.ProcessEnv = process.env) {
  const provider = configureModel(env);
  if (!provider) throw new Error("Configure a supported model provider before enabling model replies");
  const objectMode = env.QWEN_JSON_MODE?.trim() === "object";

  return async (messages: ChatMessage[], language: ResponseLanguage, quote?: VerifiedQuote,
    options: { signal?: AbortSignal; reserve?: () => Promise<boolean> } = {}) => {
    const guardian = resolveGuardianReply(messages.at(-1)!.content, language);
    if (guardian) return { answer: guardian.answer, sources: [] };
    const input = { corpus, messages, language, selection: quote, allowUnstructuredCatalog: true };
    const { pack, answer } = await prepareAnswer(input);
    if (answer) return answer;
    options.signal?.throwIfAborted();
    if (options.reserve) {
      let allowed: boolean;
      try { allowed = await options.reserve(); } catch { throw new WidgetQuotaError(503); }
      if (allowed !== true) throw new WidgetQuotaError(429);
    }
    return (await generateAnswer(input, pack, provider, objectMode, options.signal)).answer;
  };
}

export async function excerptReply(corpus: PortfolioCorpus, messages: ChatMessage[], language: ResponseLanguage, quote?: VerifiedQuote) {
  const guardian = resolveGuardianReply(messages.at(-1)!.content, language);
  if (guardian) return { answer: guardian.answer, sources: [], recommendations: [] };
  const context = !quote ? resolveContext(messages, corpus) : undefined;
  if (context?.ambiguous) return { answer: { en: "Which project do you mean?", zh: "你指的是哪个项目？", ja: "どのプロジェクトについてですか？" }[language], sources: [], recommendations: [] };
  // A plural comparison must not be answered with only one project's excerpt.
  // Assemble a bounded public passage for each subject or return insufficient.
  if (context?.carryComparison) {
    if (context.projects.length > 18) return validateAnswer({language,insufficient:true,answer:"",sourceIds:[],recommendedProjectIds:[]},corpus);
    const pack = await buildB2Pack(corpus, messages, null, language, undefined, undefined, undefined, true);
    const matches = context.projects.map(id => pack.entries.find(entry => entry.chunk.projectId === id)?.chunk);
    if (matches.some(chunk => !chunk)) return validateAnswer({language,insufficient:true,answer:"",sourceIds:[],recommendedProjectIds:[]},corpus);
    const chunks = matches.filter((chunk): chunk is NonNullable<typeof chunk> => Boolean(chunk));
    const result = validateAnswer({language,insufficient:false,answer:"Matching portfolio passages.",sourceIds:chunks.map(chunk=>chunk.chunkId),recommendedProjectIds:[]},corpus);
    return {...result,answer:chunks.map(chunk=>`${chunk.projectId}: ${chunk.content.slice(chunk.content.indexOf("\n")+1)}`).join("\n\n"),followUpQuestions:[]};
  }
  const retrieval = quote ? undefined : await retrieveEvidence(corpus, messages);
  const match = quote && sourceMatchesSpecificIntent(messages.at(-1)!.content, quote.chunk.content) ? quote.chunk : quote ? undefined : retrieval?.chunks[0];
  const result = validateAnswer({
    language, insufficient: !match, answer: "Matching portfolio passage.",
    sourceIds: match ? [match.chunkId] : [], recommendedProjectIds: [],
  }, corpus);
  if (!match) return result;
  const page = match.sourceUrl.split("#")[0];
  const topics = [...new Set(corpus.chunks.filter(chunk => chunk.sourceUrl.split("#")[0] === page && chunk.sectionTitle !== match.sectionTitle &&
    chunk.buildVersion === corpus.contentHash && chunk.accessLevel === "public" && isSubstantivePassage(chunk))
    .map(chunk => chunk.sectionTitle))].filter(title => title.length >= 3 && title.length <= 100 && !/[<>\r\n]|https?:\/\//iu.test(title));
  const questions = topics.slice(0, 2).map(title => ({ en: `What about ${title}?`, zh: `可以介绍「${title}」吗？`, ja: `「${title}」について教えてください。` })[language]);
  return { ...result, answer: match.content.slice(match.content.indexOf("\n") + 1), followUpQuestions: questions };
}
