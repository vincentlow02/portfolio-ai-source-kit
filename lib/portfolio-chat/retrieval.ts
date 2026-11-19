import { create, insert, search } from "@orama/orama";
import { createTokenizer as chinese } from "@orama/tokenizers/mandarin";
import { createTokenizer as japanese } from "@orama/tokenizers/japanese";
import type { PortfolioCorpus, PortfolioChunk } from "../portfolio-knowledge";
import type { ChatMessage } from "./core";
import { defaultPortfolioChatConfig } from "./engine-config";

import type { PortfolioChatConfig } from "./engine-config";
const reference = /(?:\bit\b|\bthat project\b|\bthe project\b|\bthat decision\b|\bthe other\b|\bhis (?:role|responsibilities|contributions?|research|work|design|findings|methods?)\b|\bwhat did he do\b|这个项目|该项目|它|那个项目|那个决定|他的职责|他的贡献|他的研究|他的工作|他的设计|他的发现|他的研究方法|そのプロジェクト|それ|このプロジェクト|その設計|その決定|彼の役割|彼の担当|彼の研究|その研究|その調査)/iu;

// Search may include labels to find their section; citation eligibility is
// decided separately by the B2 evidence pack.
export function searchable(chunk: PortfolioChunk): boolean {
  const text = chunk.content.trim();
  return Boolean(text && !/^(?:next|previous|back|menu|close|read more|view project|下一页|上一页|返回|次へ|前へ)$/iu.test(text));
}

function names(text: string, corpus: PortfolioCorpus, config: PortfolioChatConfig): string[] {
  const lower = text.toLocaleLowerCase();
  const known = new Set(corpus.chunks.map((chunk) => chunk.projectId).filter((id): id is string => Boolean(id)));
  return [...known].filter((id) => {
    const terms = [...(config.projectAliases?.[id] ?? []), id, id.replaceAll("-", " "),
      ...corpus.caseStudies.filter((project) => project.projectId === id).map((project) => project.title.toLocaleLowerCase())];
    return terms.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return /[a-z]/u.test(term)
      ? new RegExp("(?<![a-z0-9])" + escaped + "(?![a-z0-9])", "iu").test(lower)
      : lower.includes(term);
    });
  });
}

export function resolveProjects(messages: ChatMessage[], corpus: PortfolioCorpus, config = defaultPortfolioChatConfig): string[] {
  const last = messages.at(-1)?.content ?? "";
  const current = names(last, corpus, config);
  if (current.length) {
    if (current.length === 1 && reference.test(last)) {
      const prior = [...messages.slice(0, -1)].reverse().filter((message) => message.role === "user")
        .map((message) => names(message.content, corpus, config)).find((ids) => ids.length > 0);
      if (prior?.length === 1 && prior[0] !== current[0]) return [prior[0], current[0]];
    }
    return current;
  }
  if (!reference.test(last)) return [];
  const previous = [...messages.slice(0, -1)].reverse().filter((message) => message.role === "user")
    .map((message) => names(message.content, corpus, config)).find((ids) => ids.length > 0);
  return previous?.length === 1 ? previous : [];
}

export function resolveContext(messages: ChatMessage[], corpus: PortfolioCorpus, config = defaultPortfolioChatConfig) {
  const query = messages.at(-1)?.content ?? "";
  const prior = [...messages.slice(0, -1)].reverse().filter((message) => message.role === "user")
    .map((message) => names(message.content, corpus, config)).find((ids) => ids.length > 0) ?? [];
  return {
    projects: resolveProjects(messages, corpus, config),
    ambiguous: reference.test(query) && names(query, corpus, config).length <= 1 && prior.length > 1,
  };
}

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
let cache: { hash: string; indexes: Map<string, Index> } | undefined;

function indexesFor(corpus: PortfolioCorpus) {
  if (cache?.hash === corpus.contentHash) return cache.indexes;
  const indexes = new Map<string, Index>();
  for (const chunk of corpus.chunks) {
    if (!searchable(chunk) || chunk.accessLevel !== "public" ||
        !corpus.pages.some((page) => page.url === chunk.sourceUrl.split("#")[0])) continue;
    const key = (chunk.projectId ?? "") + "|" + chunk.language;
    if (!indexes.has(key)) indexes.set(key, createIndex(chunk.language));
    insert(indexes.get(key)!, {
      chunkId: chunk.chunkId, text: chunk.content, title: chunk.sectionTitle, projectId: chunk.projectId ?? "",
    });
  }
  cache = { hash: corpus.contentHash, indexes };
  return indexes;
}

export async function retrieveEvidence(corpus: PortfolioCorpus, messages: ChatMessage[], config = defaultPortfolioChatConfig) {
  const { projects, ambiguous } = resolveContext(messages, corpus, config);
  const query = messages.at(-1)?.content ?? "";
  const terms = searchTerms(query, projects, corpus, config);
  const indexes = indexesFor(corpus);
  const scores = new Map<string, number>();
  for (const [key, index] of indexes) {
    const projectId = key.split("|")[0];
    if (!terms || (projects.length && !projects.includes(projectId))) continue;
    const results = await search(index, {
      term: terms, mode: "fulltext", properties: ["text", "title"], boost: { title: 1.25 },
      limit: corpus.chunks.length, threshold: 1,
    });
    const best = results.hits[0]?.score ?? 0;
    for (const hit of results.hits) scores.set(hit.document.chunkId, best > 0 ? hit.score / best : 0);
  }
  const relevant = corpus.chunks.filter((chunk) => !projects.length || projects.includes(chunk.projectId ?? ""));
  const select = (chunks: PortfolioChunk[]) => {
    const ranked = chunks.filter((chunk) => searchable(chunk) && scores.has(chunk.chunkId));
    const peak = Math.max(0, ...ranked.map((chunk) => scores.get(chunk.chunkId) ?? 0));
    return ranked.filter((chunk) => (scores.get(chunk.chunkId) ?? 0) >= peak * 0.3);
  };
  let fallback = false;
  let selected: PortfolioChunk[];
  const broad = /(?:\bwhat is\b|\btell me about\b|\bcompare\b|\bdifferent from\b|\bdifference between\b|是什么|介绍|比较|有什么不同|区别|違い|比較|どんな|とは)/iu.test(query);
  if (projects.length) {
    selected = projects.flatMap((id) => {
      const all = relevant.filter((chunk) => chunk.projectId === id);
      const matches = select(all);
      if (broad || !terms || matches.length < 2) { fallback = true; return all; }
      return matches;
    });
  } else {
    selected = select(relevant);
    if (selected.length < 3 || /(?:\bprojects?\b|项目|プロジェクト|作品)/iu.test(query)) {
      fallback = true;
      selected = relevant;
    }
  }
  if (!selected.length) { fallback = true; selected = corpus.chunks; }
  return { projects, fallback, chunks: selected, scores, ambiguous, terms };
}
