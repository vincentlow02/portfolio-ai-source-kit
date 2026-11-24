import type { PortfolioCorpus } from "../portfolio-knowledge";
import type { parsePageContext } from "./b2";
import { isSubstantivePassage } from "./retrieval";

/** The client quote is a hint, never a source until it matches published corpus text. */
export function verifySelection(value: unknown, corpus: PortfolioCorpus, page: ReturnType<typeof parsePageContext>) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !page) throw new Error("Invalid selection");
  const selection = value as Record<string, unknown>;
  if (Object.keys(selection).some(key => !["pagePath", "text", "sectionId"].includes(key)) || selection.pagePath !== page.path || typeof selection.text !== "string" || selection.text.trim().length < 3 || selection.text.length > 1200 || (selection.sectionId !== null && selection.sectionId !== undefined && typeof selection.sectionId !== "string")) throw new Error("Invalid selection");
  const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
  const text = normalize(selection.text);
  const chunk = corpus.chunks.find(c => c.accessLevel === "public" && isSubstantivePassage(c) && new URL(c.sourceUrl, "http://localhost").pathname === page.path && (!page.lang || c.language === page.lang) && (!selection.sectionId || c.sectionId === selection.sectionId) && corpus.pages.some(p => p.url === c.sourceUrl.split("#")[0]) && normalize(c.content).includes(text));
  if (!chunk) throw new Error("Selection not in public corpus");
  return { chunk, text };
}

/** Attribute the selected quotation itself, without claiming it supports other statements. */
export function attachSelectedQuotation<T extends { answer: string; insufficient: boolean; sources: Array<{id: string; title: string; section: string; url: string; projectId: string | null}>; claims: Array<{text: string; evidenceKeys: string[]}> }>(
  response: T, selection: ReturnType<typeof verifySelection>, evidenceKey: string,
  language: "en" | "zh" | "ja",
): T {
  if (response.insufficient || response.sources.some(source => source.id === selection.chunk.chunkId)) return response;
  const labels = { en: "Selected text", zh: "选中的内容", ja: "選択した内容" };
  const text = `${labels[language]}: “${selection.text}”`;
  const chunk = selection.chunk;
  return { ...response, answer: `${text}\n\n${response.answer}`, claims: [{text, evidenceKeys:[evidenceKey]}, ...response.claims],
    sources: [{id:chunk.chunkId, title:chunk.pageTitle, section:chunk.sectionTitle, url:chunk.sourceUrl, projectId:chunk.projectId}, ...response.sources] };
}
