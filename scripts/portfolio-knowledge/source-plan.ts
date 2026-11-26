import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { validateSourcePlan, type KnowledgeSource } from "../../lib/knowledge/contract";

type MarkdownSource = Extract<KnowledgeSource, { text: string }>;
type RenderedSource = Extract<KnowledgeSource, { format: "rendered" }>;

export type DeclaredSource =
  | Extract<KnowledgeSource, { access: "protected" }>
  | Pick<RenderedSource, "access" | "format" | "page">
  | { access: "public"; format: "rendered"; url: string }
  | (Omit<MarkdownSource, "text"> & { file: string })
  | (Omit<Extract<KnowledgeSource, { format: "json" }>, "data"> & { file: string });

export async function loadKnowledgeSources(
  sources: readonly DeclaredSource[],
  root: string,
  capture: (page: RenderedSource["page"]) => Promise<KnowledgeSource>,
  captureUrl?: (url: string) => Promise<KnowledgeSource>,
): Promise<KnowledgeSource[]> {
  if (!Array.isArray(sources) || !sources.length) throw new Error("Missing knowledge source configuration");
  validateSourcePlan(sources);
  const base = await realpath(root);
  const result: KnowledgeSource[] = [];
  for (const source of sources) {
    if (source.access === "protected") {
      result.push(source);
      continue;
    }
    if (source.format === "rendered") {
      if ("page" in source) {
        result.push(await capture(source.page));
      } else {
        if (!captureUrl) throw new Error("URL-only rendered sources require an automatic capture handler.");
        result.push(await captureUrl(source.url));
      }
      continue;
    }
    if (isAbsolute(source.file)) throw new Error("Knowledge source files must be within the host directory");
    const path = await realpath(resolve(base, source.file));
    const link = relative(base, path);
    if (!link || link === ".." || link.startsWith(".." + sep) || isAbsolute(link)) {
      throw new Error("Knowledge source file escapes the host directory");
    }
    const text = await readFile(path, "utf8");
    if (source.format === "json") result.push({ ...source, data: JSON.parse(text) });
    else if (source.format === "mdx" || source.format === "markdown") result.push({ ...source, text });
    else throw new Error("Unsupported knowledge source format");
  }
  return result;
}
