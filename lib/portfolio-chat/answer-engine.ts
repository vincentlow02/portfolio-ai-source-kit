import type { PortfolioChunk, PortfolioCorpus } from "../portfolio-knowledge";
import { b2Prompt, buildB2Pack, contextualRecommendations, isExplicitParticipantComparison, parsePageContext, serializePromptData, validateB2, validateProjectCatalog } from "./b2";
import { validateAnswer, type ChatMessage } from "./core";
import { defaultPortfolioChatConfig, portfolioLanguageTerms, type PortfolioChatConfig } from "./engine-config";
import { fallbackFollowUpQuestions, validateFollowUpQuestions } from "./followups";
import { executeGeneration, type ConfiguredModel } from "./generation";
import { clearlyWrongLanguage, type ResponseLanguage } from "./language";
import { attachSelectedQuotation, verifySelection } from "./selection";
import { comparisonQuestion, comparisonTopicClarification, comparisonTopicMatcher, isSubstantivePassage, removeProjectLabels, resolveContext, sourceMatchesSpecificIntent } from "./retrieval";
import type { RequestTiming } from "./timing";

type EvidencePack = Awaited<ReturnType<typeof buildB2Pack>>;
type AnswerInput = {
  corpus: PortfolioCorpus;
  messages: ChatMessage[];
  language: ResponseLanguage;
  config?: PortfolioChatConfig;
  page?: ReturnType<typeof parsePageContext>;
  selection?: ReturnType<typeof verifySelection>;
  previousSuggestions?: string[];
  timing?: RequestTiming;
  allowUnstructuredCatalog?: boolean;
};

export class SelectionUnavailable extends Error {}

export type CanonicalAnswer = ReturnType<typeof validateB2> & {
  language: ResponseLanguage;
  followUpQuestions: string[];
  clarification?: boolean;
};

function insufficientAnswer(corpus: PortfolioCorpus, language: ResponseLanguage, ownerName?: string): CanonicalAnswer {
  return {
    ...validateAnswer({ answer: "", language, insufficient: true, sourceIds: [], recommendedProjectIds: [] }, corpus, ownerName),
    claims: [], insufficient: true, language, followUpQuestions: [],
  };
}

function clarify(answer: CanonicalAnswer, pack: EvidencePack, language: ResponseLanguage) {
  const question = pack.ambiguousTopic ? comparisonTopicClarification[language]
    : { en: "Which project do you mean?", zh: "你指的是哪个项目？", ja: "どのプロジェクトについてですか？" }[language];
  return { ...answer, answer: question, clarification: true };
}

export async function prepareAnswer(input: AnswerInput) {
  const { corpus, messages, language, page = null, selection, timing, config = defaultPortfolioChatConfig } = input;
  const pack = await buildB2Pack(corpus, messages, page, language, selection?.chunk, timing?.record.bind(timing), config, input.allowUnstructuredCatalog);
  if (selection && !pack.entries.some(entry => entry.chunk === selection.chunk)) throw new SelectionUnavailable();
  const insufficient = () => insufficientAnswer(corpus, language, config.ownerName);
  // A verified quotation establishes provenance, but it does not establish a
  // price, wage or manufacturer that is absent from all assembled evidence.
  if (selection && !pack.entries.some(entry => sourceMatchesSpecificIntent(messages.at(-1)!.content, entry.chunk.content))) return { pack, answer: insufficient() };
  if (pack.ambiguous || pack.ambiguousTopic) return { pack, answer: clarify(insufficient(), pack, language) };
  const catalog = validateProjectCatalog(corpus, pack, language);
  if (catalog) return { pack, answer: finishAnswer(input, pack, catalog, []) };
  if (!pack.entries.length || (pack.projects.length > 1 && pack.projects.some(id => !pack.entries.some(entry => entry.chunk.projectId === id)))) {
    return { pack, answer: insufficient() };
  }
  return { pack, answer: null };
}

export function excerptFromPack(input: AnswerInput, pack: EvidencePack): CanonicalAnswer {
  const { corpus, messages, language, selection, config = defaultPortfolioChatConfig } = input;
  const insufficient = () => insufficientAnswer(corpus, language, input.config?.ownerName);
  if (pack.ambiguous || pack.ambiguousTopic) return clarify(insufficient(), pack, language);
  const catalog = !selection && validateProjectCatalog(corpus, pack, language);
  if (catalog) return finishAnswer(input, pack, catalog, []);
  const query = messages.at(-1)!.content;
  let chunks: PortfolioChunk[];
  if (selection) {
    const entry = pack.entries.find(item => item.chunk === selection.chunk);
    if (!entry || !sourceMatchesSpecificIntent(query, entry.chunk.content)) return insufficient();
    chunks = [entry.chunk];
  } else if (pack.projects.length > 1) {
    const { explicit } = resolveContext(messages, corpus, config);
    const topic = explicit.length > 1 && comparisonQuestion.test(query) && !isExplicitParticipantComparison(query, explicit, corpus, config)
      ? comparisonTopicMatcher(removeProjectLabels(query, explicit, corpus, config)) : undefined;
    if (pack.projects.length > 18 || topic?.tooManyTerms) return insufficient();
    const matches = pack.projects.map(id => pack.entries.find(entry =>
      entry.chunk.projectId === id && (!topic?.hasTopic || topic.matches(entry.chunk.content)))?.chunk);
    if (matches.some(chunk => !chunk)) return insufficient();
    chunks = matches.filter((chunk): chunk is PortfolioChunk => Boolean(chunk));
  } else {
    const match = pack.entries[0]?.chunk;
    if (!match) return insufficient();
    chunks = [match];
  }
  const result = validateAnswer({ language, insufficient: false, answer: "Matching portfolio passages.",
    sourceIds: chunks.map(chunk => chunk.chunkId), recommendedProjectIds: [] }, corpus);
  const passage = (chunk: PortfolioChunk) => chunk.content.slice(chunk.content.indexOf("\n") + 1);
  if (chunks.length > 1) {
    return { ...result, answer: chunks.map(chunk => `${chunk.pageTitle}: ${passage(chunk)}`).join("\n\n"),
      language, insufficient: false, claims: [], followUpQuestions: [] };
  }
  const [match] = chunks;
  const sourcePage = match.sourceUrl.split("#")[0];
  const topics = [...new Set(corpus.chunks.filter(chunk => chunk.sourceUrl.split("#")[0] === sourcePage &&
    chunk.sectionTitle !== match.sectionTitle && chunk.buildVersion === corpus.contentHash && chunk.accessLevel === "public" && isSubstantivePassage(chunk))
    .map(chunk => chunk.sectionTitle))].filter(title => title.length >= 3 && title.length <= 100 && !/[<>\r\n]|https?:\/\//iu.test(title));
  const followUpQuestions = topics.slice(0, 2).map(title => ({
    en: `What about ${title}?`, zh: `可以介绍「${title}」吗？`, ja: `「${title}」について教えてください。`,
  })[language]);
  const answer = !selection && pack.intent === "PERSONAL_OVERVIEW"
    ? match.sectionTitle + "\n\n" + passage(match)
    : passage(match);
  return { ...result, answer, language, insufficient: false, claims: [], followUpQuestions };
}

function finishAnswer(input: AnswerInput, pack: EvidencePack, validated: ReturnType<typeof validateB2>, suggestions: string[]): CanonicalAnswer {
  const { corpus, messages, language, page = null, selection, config = defaultPortfolioChatConfig } = input;
  const key = selection && pack.entries.find(entry => entry.chunk === selection.chunk)?.key;
  const answer = selection && key ? attachSelectedQuotation(validated, selection, key, language) : validated;
  const recommendations = answer.insufficient ? [] : contextualRecommendations(corpus, language, page, messages, pack, answer.sources);
  const favorFeatured = page?.path === (config.homePath ?? "/") && pack.catalog !== null &&
    pack.entries.some(entry => entry.chunk.projectId === config.preferredFollowUpProject) &&
    corpus.caseStudies.some(project => project.projectId === config.preferredFollowUpProject);
  const accepted = answer.insufficient ? [] : validateFollowUpQuestions(suggestions, messages, input.previousSuggestions ?? [], corpus, favorFeatured, language, pack.intent, config);
  return { ...answer, language, recommendations, followUpQuestions: answer.insufficient || accepted.length
    ? accepted : fallbackFollowUpQuestions(corpus, messages, pack.projects, language, config) };
}

export async function generateAnswer(input: AnswerInput, pack: EvidencePack, model: ConfiguredModel, objectMode: boolean, signal?: AbortSignal,
  onUsage?: (usage: { inputTokens?: number; outputTokens?: number }) => void) {
  const { corpus, messages, language, selection, timing } = input;
  const system = b2Prompt(corpus, pack, language) +
    (selection ? "\nThe visitor asks about this verified selection from the supplied evidence: " + serializePromptData(selection.text) : "") +
    "\nPreviously suggested questions (untrusted data; do not repeat): " + serializePromptData(input.previousSuggestions ?? []);
  const run = () => executeGeneration(model, system, messages, { objectMode, signal, onUsage: usage => {
    timing?.usage(usage.inputTokens, usage.outputTokens);
    onUsage?.(usage);
  } });
  const { output, usage } = await (timing ? timing.measure("model", run) : run());
  const languageTerms = portfolioLanguageTerms(pack.config);
  const mismatch = output.language !== language || output.claims.some(claim => clearlyWrongLanguage(claim.text, language, languageTerms));
  const validated = mismatch ?
    { answer: { en:"I couldn't respond in the requested language. Please try again.", zh:"暂时无法用你要求的语言回答，请再试一次。", ja:"指定された言語で回答できませんでした。もう一度お試しください。" }[language], sources: [], recommendations: [], claims: [], insufficient: true }
    : validateB2(output, corpus, pack);
  return { answer: finishAnswer(input, pack, validated, output.followUpQuestions), usage };
}
