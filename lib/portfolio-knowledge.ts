import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
type Locale = "en" | "zh" | "ja";

export type PortfolioSource = {
  url: string;
  title: string;
  language: Locale;
  projectId: string | null;
};

/** A published, versioned passage and its canonical source in the existing corpus. */
export type KnowledgeDocument = {
  chunkId: string;
  pageTitle: string;
  sectionId: string | null;
  sectionTitle: string;
  language: Locale;
  content: string;
  sourceUrl: string;
  accessLevel: "public";
  buildVersion: string;
};

export type PortfolioChunk = KnowledgeDocument & { projectId: string | null };

export type PortfolioCorpus = {
  schemaVersion: 1;
  siteBuildId: string;
  contentHash: string;
  pages: Array<PortfolioSource & { kind: "page" | "blog" | "case-study" | "project-detail" }>;
  caseStudies: Array<PortfolioSource & { projectId: string }>;
  media: Array<{ projectId: string; thumbnailUrl: string; alt: string }>;
  report: { exclusions: Array<{ pathname: string; reason: "protected" }> };
  chunks: PortfolioChunk[];
};

export async function loadPortfolioCorpus(): Promise<PortfolioCorpus> {
  const file = path.join(process.cwd(), ".portfolio-knowledge", "corpus.json");
  const data = JSON.parse(await readFile(file, "utf8")) as Partial<PortfolioCorpus>;
  if (data.schemaVersion !== 1 || !data.siteBuildId || !data.contentHash ||
      !data.pages?.length || !data.caseStudies || !data.chunks?.length || !Array.isArray(data.report?.exclusions) ||
      data.chunks.some((chunk) => chunk.accessLevel !== "public" || chunk.buildVersion !== data.contentHash)) {
    throw new Error("Portfolio knowledge artifact is missing or invalid. Run npm run build.");
  }
  return data as PortfolioCorpus;
}
