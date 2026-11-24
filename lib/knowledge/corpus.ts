import { createHash } from "node:crypto";
import { z } from "zod";
import type { PortfolioChunk, PortfolioCorpus } from "../portfolio-knowledge";

const language = z.enum(["en", "zh", "ja"]);
const identity = z.string().min(1);
const project = identity.nullable();
const source = z.object({ url: identity, title: identity, language, projectId: project });
const corpusSchema = z.object({
  schemaVersion: z.literal(1),
  siteBuildId: identity,
  contentHash: identity,
  pages: z.array(source.extend({ kind: z.enum(["page", "blog", "case-study", "project-detail"]) })).min(1),
  caseStudies: z.array(source.extend({ projectId: identity })),
  media: z.array(z.object({ projectId: identity, thumbnailUrl: identity, alt: z.string() })),
  report: z.object({ exclusions: z.array(z.object({
    pathname: z.string().regex(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/u),
    reason: z.literal("protected"),
  })) }),
  chunks: z.array(z.object({
    chunkId: identity, pageTitle: identity, sectionId: identity.nullable(), sectionTitle: identity,
    language, content: identity, sourceUrl: identity, accessLevel: z.literal("public"), buildVersion: identity, projectId: project,
  })).min(1),
});

type CorpusIdentity = Pick<PortfolioCorpus, "pages" | "caseStudies" | "report"> & { chunks: Omit<PortfolioChunk, "buildVersion">[] };

export function corpusContentHash({ pages, caseStudies, chunks, report }: CorpusIdentity): string {
  return createHash("sha256").update(JSON.stringify({ pages, caseStudies, chunks, report })).digest("hex");
}

export function parsePortfolioCorpus(data: unknown): PortfolioCorpus {
  const parsed = corpusSchema.safeParse(data);
  if (!parsed.success) throw new Error("Portfolio knowledge artifact is missing or invalid. Rebuild the knowledge corpus.");
  const corpus = parsed.data;
  const pages = new Map(corpus.pages.map(page => [page.url, page]));
  const ids = new Set<string>();
  if (pages.size !== corpus.pages.length) throw new Error("Portfolio knowledge artifact contains duplicate source URLs");
  for (const chunk of corpus.chunks) {
    const [url] = chunk.sourceUrl.split("#", 1);
    const expectedUrl = chunk.sectionId === null ? url : url + "#" + encodeURIComponent(chunk.sectionId);
    const page = pages.get(url);
    if (ids.has(chunk.chunkId) || !page || page.language !== chunk.language || expectedUrl !== chunk.sourceUrl ||
        (page.projectId !== null && page.projectId !== chunk.projectId) || chunk.buildVersion !== corpus.contentHash) {
      throw new Error("Portfolio knowledge artifact contains inconsistent passages");
    }
    ids.add(chunk.chunkId);
  }
  // Hash the validated wire representation in schema v1 field order.
  const stored = data as PortfolioCorpus;
  const chunks = stored.chunks.map(({ buildVersion: _version, ...chunk }) => chunk);
  if (corpusContentHash({ ...stored, chunks }) !== corpus.contentHash) throw new Error("Portfolio knowledge artifact content hash does not match");
  return corpus;
}
