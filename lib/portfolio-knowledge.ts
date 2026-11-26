import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parsePortfolioCorpus } from "./knowledge/corpus";
import type { PublicContacts, PublicLink } from "./knowledge/published-links";
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

export type PassageEmbeddingIndex = {
  version: 1;
  model: string;
  contentHash: string;
  dimensions: number;
  /** Normalized little-endian float32 vectors encoded as base64 by chunk ID. */
  vectors: Record<string, string>;
};

export type PortfolioCorpus = {
  schemaVersion: 1;
  siteBuildId: string;
  contentHash: string;
  pages: Array<PortfolioSource & {
    kind: "page" | "blog" | "case-study" | "project-detail";
    publicContacts?: PublicContacts;
    publicLinks?: PublicLink[];
  }>;
  caseStudies: Array<PortfolioSource & { projectId: string }>;
  media: Array<{ projectId: string; thumbnailUrl: string; alt: string }>;
  report: { exclusions: Array<{ pathname: string; reason: "protected" }> };
  chunks: PortfolioChunk[];
  embeddingIndex?: PassageEmbeddingIndex;
};

export async function loadPortfolioCorpus(): Promise<PortfolioCorpus> {
  const file = path.join(process.cwd(), ".portfolio-knowledge", "corpus.json");
  return parsePortfolioCorpus(JSON.parse(await readFile(file, "utf8")));
}
