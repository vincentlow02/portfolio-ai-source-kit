import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { knowledgePath } from "../../lib/knowledge/contract";

export async function readApprovedPreviewPaths(file: string, origin: string): Promise<string[] | undefined> {
  let saved: { origin?: unknown; approvedPaths?: unknown } | null;
  try {
    saved = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  const paths = saved?.approvedPaths;
  if (saved?.origin !== origin || !Array.isArray(paths) || !paths.length ||
      new Set(paths).size !== paths.length || paths.some(path => typeof path !== "string")) return;
  try {
    for (const path of paths) knowledgePath(path);
    return paths;
  } catch {
    return;
  }
}

export function parsePageSelection(answer: string, paths: readonly string[]): string[] | null {
  const value = answer.trim().toLowerCase();
  if (!value) return [];
  if (value === "all") return [...paths];

  const numbers = value.split(",").map(number => number.trim());
  if (numbers.some(number => !/^[1-9]\d*$/u.test(number) || Number(number) > paths.length)) return null;

  const selected = new Set(numbers.map(Number));
  return paths.filter((_, index) => selected.has(index + 1));
}

export async function confirmDiscoveredPaths(origin: string, paths: readonly string[]): Promise<string[]> {
  console.log(`\nPages found on ${origin}\n`);
  paths.forEach((path, index) => console.log(`  ${index + 1}. ${path}`));
  const prompt = createInterface({ input: stdin, output: stdout });
  const closed = new AbortController();
  prompt.once("close", () => closed.abort());
  try {
    for (;;) {
      const answer = await prompt.question("\nEnter all or page numbers such as 1,3. Press Enter to cancel. ", { signal: closed.signal });
      const selected = parsePageSelection(answer, paths);
      if (selected) return selected;
      console.log(`Enter all or numbers from 1 to ${paths.length}.`);
    }
  } catch (error) {
    if (closed.signal.aborted) return [];
    throw error;
  } finally {
    prompt.close();
  }
}
