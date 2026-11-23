import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buildKnowledgeCorpus, knowledgePath } from "../../lib/knowledge/contract";
import { captureLocalPreviewSource, verifyInBrowser } from "../../lib/knowledge/rendered";
import { launchBrowser, localPreviewOrigin } from "./anonymous-browser.mjs";

const { values } = parseArgs({ options: {
  origin: { type: "string" },
  path: { type: "string", multiple: true },
  help: { type: "boolean", short: "h" },
} });

if (values.help) {
  console.log("Usage: npm run preview:local -- --origin http://127.0.0.1:5173 --path /projects");
} else {
  try {
    const origin = localPreviewOrigin(values.origin);
    const paths = values.path ?? [];
    if (!paths.length) throw new Error("Provide at least one approved page with --path");
    if (new Set(paths).size !== paths.length) throw new Error("Provide each page path only once");
    for (const source of paths) knowledgePath(source);

    const browser = await launchBrowser();
    try {
      const sources = [];
      for (const source of paths) sources.push(await captureLocalPreviewSource(browser, origin, source));
      const corpus = await buildKnowledgeCorpus(sources, "local-preview", verifyInBrowser(browser, origin, "local-preview"));
      const directory = join(process.cwd(), ".portfolio-knowledge");
      const output = join(directory, "local-preview.json");
      const pending = join(directory, `local-preview.${randomUUID()}.tmp`);
      await mkdir(directory, { recursive: true });
      try {
        await writeFile(pending, JSON.stringify({ origin, corpus }, null, 2) + "\n", { flag: "wx" });
        await rename(pending, output);
      } finally {
        await unlink(pending).catch(error => { if (error.code !== "ENOENT") throw error; });
      }
      console.log(`Local knowledge preview: ${corpus.pages.length} pages, ${corpus.chunks.length} passages.`);
      for (const page of corpus.pages) console.log(new URL(page.url, origin).href);
      console.log("Saved to .portfolio-knowledge/local-preview.json");
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error(`Local preview failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
