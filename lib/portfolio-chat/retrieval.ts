import { create, insert, search } from "@orama/orama";
import { createTokenizer as chinese } from "@orama/tokenizers/mandarin";
import { createTokenizer as japanese } from "@orama/tokenizers/japanese";
import type { PortfolioCorpus, PortfolioChunk } from "../portfolio-knowledge";
import type { ChatMessage } from "./core";
import { defaultPortfolioChatConfig } from "./engine-config";

import type { PortfolioChatConfig } from "./engine-config";
export const comparisonQuestion = /compare|different|difference|相比|比较|区别|不同|比較|違い/iu;
export const validationFollowUp = /^(?:how did (?:the team|they|he|she) (?:validate|test) (?:that|it)|(?:团队|他们)(?:是)?如何(?:验证|测试)(?:的)?|どうやって(?:検証|テスト)しましたか)[?？。]?$/iu;
const reference = /(?:\bit\b|\bthat project\b|\bthe project\b|\bthat decision\b|\bthe other\b|\bhis (?:role|responsibilities|contributions?|research|work|design|findings|methods?)\b|\bwhat did he do\b|这个项目|该项目|它|那个项目|那个决定|他的职责|他的贡献|他的研究|他的工作|他的设计|他的发现|他的研究方法|そのプロジェクト|それ|このプロジェクト|その設計|その決定|彼の役割|彼の担当|彼の研究|その研究|その調査)/iu;

// Search may include labels to find their section; citation eligibility is
// decided separately by the B2 evidence pack.
function searchable(chunk: PortfolioChunk): boolean {
  const text = chunk.content.trim();
  return Boolean(text && !/^(?:next|previous|back|menu|close|read more|view project|下一页|上一页|返回|次へ|前へ)$/iu.test(text));
}

export function isSubstantivePassage(chunk: PortfolioChunk): boolean {
  const lines = chunk.content.trim().split("\n").map(line => line.trim()).filter(Boolean);
  if (lines.length < 2 || chunk.content.trim() === chunk.sectionTitle.trim()) return false;
  return lines.slice(1).some(line => searchable({ ...chunk, content: line }) &&
    !/^(?:\d+\s*\/|solution\s*\d+\s*\/|[\p{P}\p{S}\s]+$)/iu.test(line));
}

function names(text: string, corpus: PortfolioCorpus, config: PortfolioChatConfig): string[] {
  const lower = text.toLocaleLowerCase();
  const known = new Set(corpus.chunks.map((chunk) => chunk.projectId).filter((id): id is string => Boolean(id)));
  return [...known].filter((id) => {
    const terms = [...(config.projectAliases?.[id] ?? []), id, id.replaceAll("-", " "),
      ...corpus.caseStudies.filter((project) => project.projectId === id).map((project) => project.title.toLocaleLowerCase())];
    return terms.some((term) => {
    term = term.toLocaleLowerCase();
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return /[a-z]/u.test(term)
      ? new RegExp("(?<![a-z0-9])" + escaped + "(?![a-z0-9])", "iu").test(lower)
      : lower.includes(term);
    });
  });
}

function isContextualFollowUp(query: string) {
  return reference.test(query) || validationFollowUp.test(query.trim()) || /\b(?:how (?:did|was|were) (?:the team|they|he|she|that)|why (?:did|was|were) (?:they|he|she|that)|(?:validate|test|design|choose) that|what about|tell me more)\b|为什么(?:这么做|这样做)|それはなぜ|(?:团队|他们).{0,10}(?:如何验证|如何测试)|どうやって(?:検証|テスト)/iu.test(query);
}

// A bare reference cannot identify a project on its own. Keep this narrow so
// ordinary global questions and questions with a named subject still search.
export function unresolvedProjectReference(query: string) {
  return /^(?:how (?:was|is|did) (?:it|that)(?:\s+(?:tested|validated|built|designed|work))?|why (?:was|is|did) (?:it|that)(?:\s+\w+)*|(?:它|这|这个|该项目)(?:是)?(?:怎么|如何|为什么).{0,30}|(?:它|这|这个|该项目).{0,15}(?:如何|怎么)(?:测试|验证)|(?:それ|そのプロジェクト|このプロジェクト)(?:は|を)?(?:どう|どのように|なぜ).{0,30}|どうやって(?:検証|テスト)しましたか)[?？。!！\s]*$/iu.test(query.trim());
}

export function resolveContext(messages: ChatMessage[], corpus: PortfolioCorpus, config = defaultPortfolioChatConfig) {
  const query = messages.at(-1)?.content ?? "";
  const explicit = names(query, corpus, config);
  const contextual = isContextualFollowUp(query);
  const priorQuestions = contextual ? messages.slice(0, -1).reverse().filter(message => message.role === "user") : [];
  const prior = priorQuestions.map(message => names(message.content, corpus, config)).find(ids => ids.length > 0) ?? [];
  const comparesPrior = explicit.length === 1 && prior.length === 1 && prior[0] !== explicit[0] &&
    comparisonQuestion.test(query) && reference.test(query);
  const projects = comparesPrior ? [prior[0], explicit[0]] : explicit.length ? explicit : prior.length === 1 ? prior : [];
  const ambiguous = !explicit.length && (contextual && prior.length > 1 || prior.length === 0 && unresolvedProjectReference(query));
  const previous = priorQuestions[0]?.content;
  // Carry a small topic hint only for elliptical questions. A fresh named
  // project or a specific follow-up can be retrieved from its own wording.
  const topic = previous && !explicit.length && !ambiguous &&
    (validationFollowUp.test(query.trim()) || /\b(?:why (?:was|were|did) (?:it|that|they)|tell me more|what about (?:it|that))\b|为什么(?:这么做|这样做)|それはなぜ/iu.test(query))
    ? searchTerms(previous, projects, corpus, config)
      .replace(/\b(?:problems?|solve|addresses?|did|use|uses)\b/giu, " ").replace(/\s+/gu, " ").trim().slice(0, 120) : "";
  return { projects, explicit, ambiguous, topic, multiplePriorProjects: contextual && !explicit.length && prior.length > 1 };
}

export function resolveProjects(messages: ChatMessage[], corpus: PortfolioCorpus, config = defaultPortfolioChatConfig): string[] {
  return resolveContext(messages, corpus, config).projects;
}

export type RetrievalResult = {
  projects: string[];
  candidates: PortfolioChunk[];
  qualifiedMatches: PortfolioChunk[];
  /** Only qualified matches have scoring priority. */
  scores: Map<string, number>;
  /** Compatibility alias for callers using the original result shape. */
  chunks: PortfolioChunk[];
  fallback: boolean;
};

function searchTerms(query: string, projects: string[], corpus: PortfolioCorpus, config: PortfolioChatConfig): string {
  let terms = query;
  for (const id of projects) {
    const labels = [...(config.projectAliases?.[id] ?? []), id, id.replaceAll("-", " "),
      ...corpus.caseStudies.filter((item) => item.projectId === id).map((item) => item.title)];
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      terms = terms.replace(new RegExp(/[a-z]/iu.test(label)
        ? "(?<![a-z0-9])" + escaped + "(?![a-z0-9])" : escaped, "giu"), " ");
    }
  }
  return terms.replace(/\b(?:what|how|why|which|did|does|the|and|about|compare|tell|project|projects|is|it)\b/giu, " ")
    .replace(/(?:什么|如何|为什么|哪些|这个项目|那个项目|比较|介绍|教えて|について|ですか|何ですか|プロジェクト|違い|比較)/gu, " ")
    .replace(/\s+/gu, " ").trim();
}

function createIndex(language: "en" | "zh" | "ja") {
  const schema = { chunkId: "string", text: "string", title: "string", projectId: "string" } as const;
  return language === "en" ? create({ schema, language: "english" })
    : create({ schema, components: { tokenizer: language === "zh" ? chinese() : japanese() } });
}
type Index = ReturnType<typeof createIndex>;
let keywordCache: { key: string; indexes: Map<string, Index> } | undefined;

function keywordIndexes(chunks: PortfolioChunk[], key: string) {
  if (keywordCache?.key === key) return keywordCache.indexes;
  const indexes = new Map<string, Index>();
  for (const chunk of chunks) {
    const group = (chunk.projectId ?? "") + "|" + chunk.language;
    if (!indexes.has(group)) indexes.set(group, createIndex(chunk.language));
    insert(indexes.get(group)!, {
      chunkId: chunk.chunkId, text: chunk.content, title: chunk.sectionTitle, projectId: chunk.projectId ?? "",
    });
  }
  keywordCache = { key, indexes };
  return indexes;
}

async function scoreKeywords(indexes: Map<string, Index>, terms: string, projects: string[], limit: number) {
  const scores = new Map<string, number>();
  for (const [key, index] of indexes) {
    const projectId = key.split("|")[0];
    if (!terms || (projects.length && !projects.includes(projectId))) continue;
    const results = await search(index, {
      term: terms, mode: "fulltext", properties: ["text", "title"], boost: { title: 1.25 },
      limit, threshold: 1,
    });
    const best = results.hits[0]?.score ?? 0;
    for (const hit of results.hits) scores.set(hit.document.chunkId, best > 0 ? hit.score / best : 0);
  }
  return scores;
}

type EmbedTexts = (texts: string[]) => Promise<number[][]>;

async function embedPassages(chunks: PortfolioChunk[], embed: EmbedTexts) {
  const vectors = new Map<string, number[]>();
  const batchSize = 8;
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const batch = chunks.slice(offset, offset + batchSize);
    const rows = await embed(batch.map(chunk => chunk.content));
    if (rows.length !== batch.length) throw new Error("Could not embed the approved passages");
    batch.forEach((chunk, index) => vectors.set(chunk.chunkId, rows[index]));
  }
  return vectors;
}

function exactMatch(candidates: PortfolioChunk[], terms: string, question: string, keywords: Map<string, number>, requireUnique = false) {
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const phrase = normalize(terms);
  const literal = phrase.includes(" ") || (phrase.length >= 2 && phrase === normalize(question));
  if (!literal || !/\p{L}/u.test(phrase)) return;
  const matches = candidates.filter(chunk => ` ${normalize(chunk.content)} `.includes(` ${phrase} `));
  if (requireUnique && (phrase.length < 8 || matches.length !== 1)) return undefined;
  return matches.sort((a, b) => (keywords.get(b.chunkId) ?? 0) - (keywords.get(a.chunkId) ?? 0))[0];
}

export type RetrievalPhase = "keyword" | "corpusEmbedding" | "queryEmbedding" | "semantic";
export type RetrievalTiming = (phase: RetrievalPhase, milliseconds: number) => void;
export const defaultRetrievalProfile = { cosine: 0.365, assistedCosine: 0.30, fused: 0.50, keywordWeight: 0.20 };

export function createEvidenceRetriever(embed: EmbedTexts, profile = defaultRetrievalProfile) {
  let cache: { key: string; vectors: ReturnType<typeof embedPassages> } | undefined;
  return async (corpus: PortfolioCorpus, messages: ChatMessage[], config = defaultPortfolioChatConfig, timing?: RetrievalTiming): Promise<RetrievalResult> => {
    const { projects, topic } = resolveContext(messages, corpus, config);
    const currentQuestion = messages.at(-1)?.content ?? "";
    const question = topic ? currentQuestion + " " + topic : currentQuestion;
    const terms = searchTerms(question, projects, corpus, config);
    const pages = new Set(corpus.pages.map(page => page.url));
    const approved = corpus.chunks.filter(chunk => chunk.accessLevel === "public" &&
      chunk.buildVersion === corpus.contentHash && pages.has(chunk.sourceUrl.split("#")[0]) && searchable(chunk));
    const key = [corpus.contentHash, ...approved.map(chunk => chunk.chunkId)].join("|");
    const passages = approved.filter(isSubstantivePassage);
    const candidates = passages.filter(chunk => !projects.length || projects.includes(chunk.projectId ?? ""));
    const scores = new Map<string, number>();
    if (!question || !candidates.length) return { projects, candidates, scores, chunks: [], qualifiedMatches: [], fallback: true };

    const keywordStarted = timing ? performance.now() : 0;
    const keywords = await scoreKeywords(keywordIndexes(approved, key), terms, projects, approved.length);
    timing?.("keyword", performance.now() - keywordStarted);
    const corpusStarted = timing ? performance.now() : 0;
    if (cache?.key !== key) {
      const vectors = embedPassages(passages, embed).catch(error => {
        if (cache?.vectors === vectors) cache = undefined;
        throw error;
      });
      cache = { key, vectors };
    }
    let vectors: Awaited<ReturnType<typeof embedPassages>>;
    let query: number[];
    try {
      const pending = cache.vectors;
      vectors = await pending;
      timing?.("corpusEmbedding", performance.now() - corpusStarted);
      const queryStarted = timing ? performance.now() : 0;
      [query] = await embed([question]);
      timing?.("queryEmbedding", performance.now() - queryStarted);
      if (!query?.length || candidates.some(chunk => vectors.get(chunk.chunkId)?.length !== query.length)) {
        if (cache?.vectors === pending) cache = undefined;
        throw new Error("Invalid portfolio embedding dimensions");
      }
    } catch {
      // When the encoder is unavailable, only a unique verbatim phrase is safe.
      const literal = exactMatch(candidates, terms, currentQuestion, keywords, true);
      const chunks = literal ? [literal] : [];
      if (literal) scores.set(literal.chunkId, 2);
      return { projects, candidates, scores, chunks, qualifiedMatches: chunks, fallback: true };
    }
    const semanticStarted = timing ? performance.now() : 0;
    if (!query?.length) throw new Error("Invalid question embedding");
    for (const { chunkId } of candidates) {
      const vector = vectors.get(chunkId)!;
      const similarity = vector.reduce((sum, component, index) => sum + component * query[index], 0);
      const score = similarity + profile.keywordWeight * (keywords.get(chunkId) ?? 0);
      // Full-text support can admit a match just below the semantic cutoff.
      if (similarity >= profile.cosine || (similarity >= profile.assistedCosine && score >= profile.fused)) scores.set(chunkId, score);
    }
    const exact = exactMatch(candidates, terms, question, keywords);
    if (exact) scores.set(exact.chunkId, 2);
    const chunks = candidates.filter(chunk => scores.has(chunk.chunkId))
      .sort((a, b) => scores.get(b.chunkId)! - scores.get(a.chunkId)!);
    timing?.("semantic", performance.now() - semanticStarted);
    return { projects, candidates, scores, chunks, qualifiedMatches: chunks, fallback: !chunks.length };
  };
}

export const retrieveEvidence = createEvidenceRetriever(async texts => (await import("./embeddings")).embedTexts(texts));
