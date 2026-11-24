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

// Some specific factual requests need evidence for the requested kind of
// fact, not merely the same topic. This deliberately small multilingual gate
// is conservative and is not a general semantic-entailment classifier.
export function sourceMatchesSpecificIntent(query: string, source: string): boolean {
  const checks: Array<[RegExp, RegExp]> = [
    [/(?:\b(?:price|pricing|cost|costs|purchase|buy|buying|expensive)\b|価格|値段|費用|料金|いくら|購入|购买|購買|价格|價格|费用|費用|多少钱|多少錢)/iu,
      /(?:\b(?:price|pricing|cost|costs|purchase|buy|sold|free|budget|dollars?|euros?|yen|usd|sgd)\b|[$€£¥]\s*\d|\d[\d,.]*\s*(?:円|元)|[一二三四五六七八九十百千万]+(?:円|元)|価格|値段|費用|料金|無料|購入|购买|購買|价格|價格|费用|費用|免费|免費|美元)/iu],
    [/(?:\b(?:salary|salaries|wages?|payroll|compensation|payday)\b|給料|給与|賃金|工资|工資|薪水|薪资|薪資)/iu,
      /(?:\b(?:salary|salaries|wages?|payroll|compensation|paid|payday|earn(?:ed|s)?)\b|給料|給与|賃金|工资|工資|薪水|薪资|薪資)/iu],
    [/(?:\b(?:manufacturer|manufacturers|who manufactures|which company (?:makes|manufactures|sells))\b|製造.{0,15}会社|会社.{0,15}製造|哪.{0,8}(?:公司|企业).{0,8}(?:生产|製造|制造))/iu,
      /(?:\b(?:manufacturer|manufactured|manufactures|produced by|made by|sold by|supplier|vendor)\b|製造元|製造会社|製造した|メーカー|生产商|生產商|制造商|製造商|生产厂家)/iu],
    [/(?:\bhow many\b|(?:何|几|幾|多少)(?:人|名|个|個|枚|台|件|回|次|站|駅|所|月|日|位))/iu,
      /(?:(?<!\d)(?!(?:19|20)\d{2}(?!\d))\d+(?!\d)|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|several|dozens?)\b|[零〇一二两兩三四五六七八九十百千万]+(?:人|名|个|個|枚|台|件|回|次|站|駅|所|月|日|位)|数(?:人|名|个|個|枚|回)|複数)/iu],
    [/(?:いつから|何年|哪一年|哪年|\bwhen\s+(?:did|was|were)\b[^?]{0,100}\b(?:launch|launched|release|released|start|started|open|opened|complete|completed)\b)/iu,
      /(?:\b(?:19|20)\d{2}\b|[零〇一二三四五六七八九十百千\d]{2,}年|\b(?:launched|released|opened|started|since|before|after|during|first)\b|開始|开始|開業|开业|公開|公开|发布|發布)/iu],
    [/(?:いつから[^?？。]{0,35}(?:使わ|使い|使用|利用)|(?:何时|何時|什么时候|什麼時候)[^?？。]{0,20}(?:开始|開始)?(?:使用|利用)|\b(?:when|since when)\b[^?]{0,100}\b(?:start(?:ed)? using|began using|put into use|in use|used)\b)/iu,
      /(?:\b(?:used|using|in use|put into use|operated|in operation|deployed|adopted)\b|使わ|使い|使用|利用|運用|运用)/iu],
  ];
  const normalizedQuery = query.normalize("NFKC"), normalizedSource = source.normalize("NFKC");
  return checks.every(([intent, evidence]) => !intent.test(normalizedQuery) || evidence.test(normalizedSource));
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
  return reference.test(query) || pluralProjectReference(query) || validationFollowUp.test(query.trim()) || /\b(?:how (?:did|was|were) (?:the team|they|he|she|that)|why (?:did|was|were) (?:they|he|she|that)|(?:validate|test|design|choose) that|what about|tell me more)\b|为什么(?:这么做|这样做)|それはなぜ|(?:团队|他们).{0,10}(?:如何验证|如何测试)|どうやって(?:検証|テスト)/iu.test(query);
}

// Only an explicit plural reference may carry all subjects of an earlier
// comparison. Singular "it" remains ambiguous after multiple projects.
function pluralProjectReference(query: string) {
  return /\b(?:both projects?|both of (?:the )?projects?|both of them|(?:the|these|those) two projects?|their (?:research|stud(?:y|ies)|tests?|testing|designs?|roles?|participants?|projects?))\b|(?:两个|兩個|两项|兩項)(?:项目|項目|專案)|(?:两者|兩者)(?:的|分别|分別)|(?:両方|両者|それぞれ)の(?:プロジェクト|作品)/iu.test(query);
}

// A carried multi-project comparison must keep every explicit topic word in
// each source body. Unknown terms are matched literally; a small multilingual
// map covers common testing vocabulary. This is conservative, not entailment.
export function comparisonTopicMatcher(query: string): { hasTopic: boolean; matches: (source: string) => boolean } {
  const stop = new Set(["what","how","were","was","are","is","did","do","does","both","the","these","those","projects","project","of","them","they","their","about","and","or","in","on","with","each","respectively","compare","different","difference","比较","比較","区别","區別","違い","这","這","那","呢","个","個","项","項","项目","項目","專案","两者","兩者","分别","分別","的","如何","怎么","怎麼","什么","什麼","両方","両者","それぞれ","プロジェクト","作品","の","は","が","を","に","どう","どの","よう","し","しま","まし","した","です","ます","か"]);
  const testWords = new Set(["test","tests","tested","testing","validate","validated","validation","验证","驗證","测试","測試","検証","テスト"]);
  const locationWords = new Set(["where","哪里","哪裡","何处","何處","地点","地點","どこ","場所"]);
  const timeWords = new Set(["when","何时","何時","何年","什么时候","什麼時候","いつ"]);
  const personWords = new Set(["who","谁","誰"]);
  const reasonWords = new Set(["why","为什么","為什麼","为何","為何","なぜ"]);
  const queryText=query.normalize("NFKC").toLocaleLowerCase()
    .replace(/\b(?:the|these|those) two projects?\b/gu,"both projects")
    .replace(/(?:这|這)?(?:两个|兩個|两项|兩項)(?:项目|項目|專案)/gu,"项目");
  const asksTestingPurpose=/\bwhat\b[^?]{0,100}\btest(?:ed|ing)?\s+for\b/iu.test(queryText);
  const language=/[\u3040-\u30ff]/u.test(queryText)?"ja":/[\u3400-\u9fff]/u.test(queryText)?"zh":"en";
  const terms=[...new Intl.Segmenter(language,{granularity:"word"}).segment(queryText)]
    .filter(part=>part.isWordLike).map(part=>part.segment).filter(term=>!stop.has(term));
  const matches=(source:string)=>{
    const sourceBody=source.normalize("NFKC").toLocaleLowerCase().split("\n").slice(1).join("\n");
    // Avoid combining anchors across clearly distinct clauses. This still
    // does not establish a semantic relationship within one clause.
    const sentences=sourceBody.split(/(?<=[。！？])|(?<=[.!?])\s+|\n+|[;；]|\b(?:and|or|but|however|whereas|although|while)\b|但是|然而|一方|ただし/iu).filter(Boolean);
    return sentences.some(sentence=>(!asksTestingPurpose || /\btest(?:ed|ing)?\s+for\b/iu.test(sentence)) && terms.every(term=>{
    if(testWords.has(term)) return /\b(?:test(?:s|ed|ing)?|validat(?:e|ed|ion|ing)|evaluat(?:e|ed|ion|ing))\b|验证|驗證|测试|測試|検証|テスト/iu.test(sentence);
    if(locationWords.has(term)) return /\b(?:location|venue|located|site)\b|地点|地點|場所|位于|位於/iu.test(sentence);
    if(timeWords.has(term)) return /\b(?:19|20)\d{2}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\d{2,4}年/iu.test(sentence);
    if(personWords.has(term)) return /\b(?:people|person|users?|participants?|volunteers?|researchers?|team|staff|they|we|i)\b|参与者|參與者|志愿者|志願者|参加者|チーム|担当者/iu.test(sentence);
    if(reasonWords.has(term)) return /\b(?:because|since|therefore|so that|in order to)\b|因为|因為|所以|ため|理由/iu.test(sentence);
    if (/^\d+$/u.test(term)) return new RegExp("(?<!\\d)"+term+"(?!\\d)","u").test(sentence);
    if (/^[a-z]+$/u.test(term)) {
      const stem=term.length>4 ? term.replace(/(?:ing|ed|es|s)$/u,"") : term;
      return new RegExp("(?<![a-z])"+stem+"(?:s|es|ed|ing)?(?![a-z])","iu").test(sentence);
    }
    return sentence.includes(term);
    }));
  };
  return {hasTopic:terms.length>0,matches};
}

// A bare reference cannot identify a project on its own. Keep this narrow so
// ordinary global questions and questions with a named subject still search.
export function unresolvedProjectReference(query: string) {
  return /^(?:(?:what|where|when|why|how|who)\s+(?:was|is|did|does|can|will|were)\s+(?:it|that|this)(?:\s+[\p{L}\p{N}'-]+){0,8}|(?:它|该项目|这个项目|这个(?=是|有|怎么|如何|为什么|什么)|这(?=是|有|怎么|如何|为什么|什么))(?:是|有|被|在)?[^?？。!！]{0,30}(?:什么|什么样|怎么|如何|为什么|何时|哪里|哪儿|谁)[^?？。!！]{0,15}|(?:它|该项目|这个项目|这(?=是|怎么|如何|为什么))(?:是)?(?:怎么|如何|为什么).{0,30}|(?:それ|そのプロジェクト|このプロジェクト)(?:は|を|が)?(?:どう|どのように|なぜ|何|どこ|いつ|誰).{0,30}|どうやって(?:検証|テスト)しましたか)[?？。!！\s]*$/iu.test(query.trim());
}

export function resolveContext(messages: ChatMessage[], corpus: PortfolioCorpus, config = defaultPortfolioChatConfig) {
  const query = messages.at(-1)?.content ?? "";
  const explicit = names(query, corpus, config);
  const contextual = isContextualFollowUp(query);
  const priorQuestions = contextual ? messages.slice(0, -1).reverse().filter(message => message.role === "user") : [];
  const priorQuestion = priorQuestions.find(message => names(message.content, corpus, config).length > 0);
  const prior = priorQuestion ? names(priorQuestion.content, corpus, config) : [];
  const comparesPrior = explicit.length === 1 && prior.length === 1 && prior[0] !== explicit[0] &&
    comparisonQuestion.test(query) && reference.test(query);
  const selectsOneProject = /\b(?:which (?:one|of)|which project|either project)\b|(?:哪一个|哪一個|哪个|哪個|哪项|哪項)|(?:どちら|どのプロジェクト)/iu.test(query);
  const carryComparison = !explicit.length && prior.length > 1 && Boolean(priorQuestion && comparisonQuestion.test(priorQuestion.content)) &&
    pluralProjectReference(query) && !reference.test(query.replace(/それぞれ/gu, "")) && !selectsOneProject;
  const projects = comparesPrior ? [prior[0], explicit[0]] : explicit.length ? explicit : prior.length === 1 || carryComparison ? prior : [];
  const ambiguous = !explicit.length && (contextual && prior.length > 1 && !carryComparison || prior.length === 0 && unresolvedProjectReference(query));
  const previous = priorQuestions[0]?.content;
  // Carry a small topic hint only for elliptical questions. A fresh named
  // project or a specific follow-up can be retrieved from its own wording.
  const topic = previous && !explicit.length && !ambiguous &&
    (validationFollowUp.test(query.trim()) || /\b(?:why (?:was|were|did) (?:it|that|they)|tell me more|what about (?:it|that))\b|为什么(?:这么做|这样做)|それはなぜ/iu.test(query))
    ? searchTerms(previous, projects, corpus, config)
      .replace(/\b(?:problems?|solve|addresses?|did|use|uses)\b/giu, " ").replace(/\s+/gu, " ").trim().slice(0, 120) : "";
  return { projects, explicit, ambiguous, topic, carryComparison, multiplePriorProjects: contextual && !explicit.length && prior.length > 1 && !carryComparison };
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

export function removeProjectLabels(query: string, projects: readonly string[], corpus: PortfolioCorpus, config: PortfolioChatConfig): string {
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
  return terms.replace(/\s+/gu, " ").trim();
}

function searchTerms(query: string, projects: string[], corpus: PortfolioCorpus, config: PortfolioChatConfig): string {
  return removeProjectLabels(query, projects, corpus, config).replace(/\b(?:what|how|why|which|did|does|the|and|about|compare|tell|project|projects|is|it)\b/giu, " ")
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
  return async (corpus: PortfolioCorpus, messages: ChatMessage[], config = defaultPortfolioChatConfig, timing?: RetrievalTiming, scopedProjects?: readonly string[]): Promise<RetrievalResult> => {
    const context = resolveContext(messages, corpus, config);
    const projects = scopedProjects ? [...scopedProjects] : context.projects;
    const { topic } = context;
    const currentQuestion = messages.at(-1)?.content ?? "";
    const question = topic ? currentQuestion + " " + topic : currentQuestion;
    const terms = searchTerms(question, projects, corpus, config);
    const pages = new Set(corpus.pages.map(page => page.url));
    const approved = corpus.chunks.filter(chunk => chunk.accessLevel === "public" &&
      chunk.buildVersion === corpus.contentHash && pages.has(chunk.sourceUrl.split("#")[0]) && searchable(chunk));
    const key = [corpus.contentHash, ...approved.map(chunk => chunk.chunkId)].join("|");
    const passages = approved.filter(isSubstantivePassage);
    const candidates = passages.filter(chunk => (!projects.length || projects.includes(chunk.projectId ?? "")) && sourceMatchesSpecificIntent(currentQuestion, chunk.content));
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
