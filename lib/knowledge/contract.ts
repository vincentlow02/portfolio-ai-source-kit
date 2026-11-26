import { createHash } from "node:crypto";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkGfm from "remark-gfm";
import { z } from "zod";
import type { PortfolioCorpus, PortfolioChunk } from "../portfolio-knowledge";
import { corpusContentHash } from "./corpus";
import { isExcludedLink } from "./link-url";
import { publicContactsSchema, publicLinksSchema, type PublicLink } from "./published-links";

export const knowledgeLanguage = z.enum(["en", "zh", "ja"]);
const projectId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80);
const anchor = z.string().regex(/^[A-Za-z0-9_-]+$/u).max(160);
export const pageMetadata = z.strictObject({
  url: z.string().max(240),
  title: z.string().trim().min(1).max(200),
  language: knowledgeLanguage,
  kind: z.enum(["page", "blog", "case-study", "project-detail"]),
  projectId: projectId.nullable().default(null),
  publicContacts: publicContactsSchema.optional(),
  publicLinks: publicLinksSchema.optional(),
});

const section = z.strictObject({
  title: z.string().trim().min(1).max(200),
  anchor: anchor.nullable().default(null),
  text: z.string().trim().min(1).max(160_000),
  projectId: projectId.optional(),
});
const sections = z.array(section).min(1).max(500);
export type KnowledgeSection = z.output<typeof section>;
export type KnowledgePage = z.output<typeof pageMetadata>;
export type KnowledgeDocument =
  | { access: "protected"; url: string }
  | { access: "public"; page: KnowledgePage; sections: KnowledgeSection[] };

export type KnowledgeSource =
  | { access: "protected"; url: string }
  | {
      access: "public";
      page: z.input<typeof pageMetadata>;
    } & (
      | { format: "markdown" | "mdx"; text: string; anchors?: Readonly<Record<string, string>> }
      | { format: "json"; data: unknown }
      | { format: "rendered"; sections: unknown }
    );

const base = "https://portfolio.invalid";
const forbidden = /^\/(?:api|_next|private|\.portfolio-knowledge)(?:\/|$)/u;

export function knowledgePath(url: string, allowProtectedNamespace = false): string {
  const match = /^(\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?)(?:\?lang=(en|zh|ja))?$/u.exec(url);
  if (!match || match[0] !== url || url.length > 240 || (!allowProtectedNamespace && forbidden.test(match[1]))) {
    throw new Error("Invalid portfolio source URL: " + url);
  }
  return match[1];
}

function publishedPage(value: unknown): KnowledgePage {
  const page = pageMetadata.parse(value);
  knowledgePath(page.url);
  const requested = new URL(page.url, base).searchParams.get("lang");
  if (requested && requested !== page.language) throw new Error("Source URL language does not match metadata");
  if ((page.kind === "case-study" || page.kind === "project-detail") && !page.projectId) {
    throw new Error("Project sources require a project ID");
  }
  return page;
}

type SourceApproval =
  | { access: "protected"; url: string }
  | { access: "public"; page: unknown }
  | { access: "public"; format: "rendered"; url: string };

/** Validate declared access and identities before opening files or capturing pages. */
export function validateSourcePlan(sources: readonly SourceApproval[]): string[] {
  const excluded = new Set<string>();
  const published: Array<KnowledgePage | { url: string }> = [];
  for (const source of sources) {
    if (source.access === "protected") excluded.add(knowledgePath(source.url, true));
    else if (source.access === "public" && "page" in source) {
      if ("url" in source) throw new Error("A public source must use either a URL or page metadata");
      published.push(publishedPage(source.page));
    }
    else if (source.access === "public" && source.format === "rendered") {
      knowledgePath(source.url);
      published.push({ url: source.url });
    }
    else throw new Error("A source must declare its publication state");
  }
  if (!published.length) throw new Error("No public knowledge sources are configured");
  const urls = new Set<string>();
  const studies = new Set<string>();
  for (const page of published) {
    const pathname = knowledgePath(page.url);
    if ([...excluded].some(path => path === "/" || pathname === path || pathname.startsWith(path + "/"))) {
      throw new Error("Public source overlaps a protected route: " + page.url);
    }
    if (urls.has(page.url)) throw new Error("Duplicate source URL: " + page.url);
    urls.add(page.url);
    if (!("kind" in page) || page.kind !== "case-study") continue;
    const key = page.projectId + "|" + page.language;
    if (studies.has(key)) throw new Error("Duplicate case study for " + key);
    studies.add(key);
  }
  return [...excluded].sort();
}

type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  value?: string;
  alt?: string | null;
  depth?: number;
  position?: { start: { line: number } };
};

const containers = new Set(["root", "heading", "paragraph", "blockquote", "list", "listItem", "emphasis", "strong", "delete", "link", "linkReference", "table", "tableRow", "tableCell"]);
const breakBetween = new Set(["root", "blockquote", "list", "listItem", "table", "tableRow"]);

function staticText(node: MarkdownNode): string {
  if (["text", "code", "inlineCode"].includes(node.type)) return node.value ?? "";
  if (["image", "imageReference"].includes(node.type)) return node.alt ?? "";
  if (node.type === "break") return " ";
  if (["definition", "thematicBreak"].includes(node.type)) return "";
  if (!containers.has(node.type)) {
    throw new Error("Unsupported " + node.type + " at line " + (node.position?.start.line ?? "?") + ". Use rendered capture for dynamic content.");
  }
  return (node.children ?? []).map(staticText).join(breakBetween.has(node.type) ? " " : "");
}

function markdownSections(source: Extract<KnowledgeSource, { text: string }>, title: string): KnowledgeSection[] {
  if (!source.text.trim() || source.text.length > 500_000) throw new Error("Empty or oversized Markdown source");
  if (/^(?:\uFEFF)?---\r?\n/u.test(source.text)) {
    throw new Error("Frontmatter is unsupported in source bodies. Declare metadata on the source configuration.");
  }
  const parser = unified().use(remarkParse).use(remarkGfm);
  if (source.format === "mdx") parser.use(remarkMdx);
  const tree: MarkdownNode = parser.parse(source.text);
  const result: z.input<typeof section>[] = [];
  const usedAnchors = new Set<string>();
  let current = { title, anchor: null as string | null, body: [] as string[] };
  const flush = () => {
    if (current.body.length) result.push({ title: current.title, anchor: current.anchor, text: current.body.join("\n") });
  };
  for (const node of tree.children ?? []) {
    const body = staticText(node).replace(/\s+/gu, " ").trim();
    if (node.type === "heading") {
      if (!body) throw new Error("Empty Markdown heading at line " + node.position?.start.line);
      flush();
      const sectionAnchor = source.anchors && Object.hasOwn(source.anchors, body) ? source.anchors[body] : null;
      if (sectionAnchor) {
        if (usedAnchors.has(body)) throw new Error("Ambiguous Markdown heading: " + body);
        usedAnchors.add(body);
      }
      current = { title: body, anchor: sectionAnchor, body: [] };
    } else if (body) {
      current.body.push(body);
    }
  }
  flush();
  if (Object.keys(source.anchors ?? {}).some(title => !usedAnchors.has(title))) throw new Error("Configured Markdown anchor has no matching heading");
  return sections.parse(result);
}

export function normalizeKnowledgeSource(source: KnowledgeSource): KnowledgeDocument {
  if (source.access === "protected") return { access: "protected", url: knowledgePath(source.url, true) };
  if (source.access !== "public") throw new Error("A source must declare its publication state");
  const page = publishedPage(source.page);
  switch (source.format) {
    case "markdown":
    case "mdx":
      return { access: "public", page, sections: markdownSections(source, page.title) };
    case "json":
      return { access: "public", page, sections: z.strictObject({ sections }).parse(source.data).sections };
    case "rendered":
      return { access: "public", page, sections: sections.parse(source.sections) };
    default:
      throw new Error("Unsupported knowledge source format");
  }
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function contentPieces(title: string, text: string) {
  const malformed = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
  if (malformed.test(title) || malformed.test(text)) {
    throw new Error("A source contains invalid Unicode");
  }
  const limit = 3000 - Buffer.byteLength(title + "\n");
  const words = text.split(/\s+/u);
  const normalized = words.join(" ");
  // A fixed locale avoids host locale changing segmentation or chunk IDs.
  const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
  const oversized = words.some(word => Buffer.byteLength(word) > limit);
  let hasCombinedWhitespace = false;
  if (!oversized && Buffer.byteLength(normalized) > limit) for (const {segment} of graphemes.segment(normalized)) {
    if (/\s/u.test(segment) && /\S/u.test(segment)) { hasCombinedWhitespace = true; break; }
  }
  // Preserve the existing word-boundary and whitespace behavior for inputs
  // that already fit. Oversized tokens require language-aware segmentation.
  if (hasCombinedWhitespace || oversized) {
    const wordSegments = new Intl.Segmenter("en", { granularity: "word" });
    const output: string[] = [];
    let current = "";
    let bytes = 0;
    const append = (piece: string) => {
      const size = Buffer.byteLength(piece);
      if (size > limit) throw new Error("A source contains a grapheme longer than the evidence limit");
      if (bytes + size > limit) { output.push(title + "\n" + current); current = ""; bytes = 0; }
      current += piece;
      bytes += size;
    };
    let separator = "";
    for (const { segment } of wordSegments.segment(normalized)) {
      if (/^\s+$/u.test(segment)) { separator += segment; continue; }
      const piece = separator + segment;
      separator = "";
      if (Buffer.byteLength(piece) <= limit) append(piece);
      else for (const { segment: grapheme } of graphemes.segment(piece)) append(grapheme);
    }
    if (current) output.push(title + "\n" + current);
    return output;
  }
  const output: string[] = [];
  let current = "";
  let bytes = 0;
  for (const word of words) {
    const size = Buffer.byteLength(word);
    if (bytes && bytes + 1 + size > limit) {
      output.push(title + "\n" + current);
      current = "";
      bytes = 0;
    }
    current += bytes ? " " + word : word;
    bytes += (bytes ? 1 : 0) + size;
  }
  if (current) output.push(title + "\n" + current);
  return output;
}

export type VerifyPublishedDocument = (document: Extract<KnowledgeDocument, { access: "public" }>) => Promise<PublicLink[] | void>;

export async function buildKnowledgeCorpus(
  sources: readonly KnowledgeSource[],
  buildId: string,
  verifyPublished: VerifyPublishedDocument,
): Promise<PortfolioCorpus> {
  if (!buildId.trim()) throw new Error("Missing portfolio build ID");
  const excluded = validateSourcePlan(sources);
  const published = sources.map(normalizeKnowledgeSource).flatMap(document => document.access === "public" ? [document] : [])
    .sort((a, b) => a.page.url.localeCompare(b.page.url, "en"));
  const pages: PortfolioCorpus["pages"] = [];
  const caseStudies: PortfolioCorpus["caseStudies"] = [];
  const chunks: Omit<PortfolioChunk, "buildVersion">[] = [];
  for (const document of published) {
    const { page } = document;
    if (page.kind === "case-study" && page.projectId) {
      caseStudies.push({ url: page.url, title: page.title, language: page.language, projectId: page.projectId });
    }
    const ids = new Set<string>();
    for (const entry of document.sections) {
      const owner = entry.projectId ?? page.projectId;
      if (page.projectId && owner !== page.projectId) throw new Error("Section project does not match its project page");
      const identity = entry.anchor ?? entry.title;
      if (ids.has(identity)) throw new Error("Duplicate section identity on " + page.url + ": " + identity);
      ids.add(identity);
      for (const [index, content] of contentPieces(entry.title, entry.text).entries()) {
        chunks.push({
          chunkId: hash([page.url, page.language, owner, identity, index]).slice(0, 24),
          pageTitle: page.title,
          sectionId: entry.anchor,
          sectionTitle: entry.title,
          language: page.language,
          content,
          sourceUrl: entry.anchor ? page.url + "#" + encodeURIComponent(entry.anchor) : page.url,
          accessLevel: "public",
          projectId: owner,
        });
      }
    }
    const publishedLinks = await verifyPublished(document);
    const links = page.publicLinks ?? publishedLinks;
    pages.push(links?.length ? { ...page, publicLinks: links.filter(link => !isExcludedLink(link.href, excluded)) } : page);
  }
  if (new Set(chunks.map(chunk => chunk.chunkId)).size !== chunks.length) throw new Error("Duplicate chunk ID");
  const report = { exclusions: excluded.map(pathname => ({ pathname, reason: "protected" as const })) };
  const contentHash = corpusContentHash({ pages, caseStudies, chunks, report });
  return {
    schemaVersion: 1, siteBuildId: buildId, contentHash, pages, caseStudies, media: [], report,
    chunks: chunks.map(chunk => ({ ...chunk, buildVersion: contentHash })),
  };
}
