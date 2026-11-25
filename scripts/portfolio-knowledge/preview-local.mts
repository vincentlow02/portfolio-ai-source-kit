import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { buildKnowledgeCorpus, knowledgePath } from "../../lib/knowledge/contract";
import { captureLocalPreviewSource, capturePublishedSource, verifyInBrowser } from "../../lib/knowledge/rendered";
import { prepareEmbeddingModel } from "../../lib/portfolio-chat/embedding-model.mjs";
import { indexPortfolioCorpus } from "../../lib/portfolio-chat/embeddings";
import { launchBrowser, localPreviewOrigin } from "./anonymous-browser.mjs";
import { loadKnowledgeSources, type DeclaredSource } from "./source-plan";

const { values } = parseArgs({ options: {
  origin: { type: "string" },
  path: { type: "string", multiple: true },
  manifest: { type: "string" },
  help: { type: "boolean", short: "h" },
} });

if (values.help) {
  console.log("Usage: npm run preview:local -- --origin http://127.0.0.1:5173 [--path /projects | --manifest ./portfolio-knowledge.config.ts]");
} else {
  try {
    const origin = localPreviewOrigin(values.origin);
    const paths = values.path ?? [];
    if (values.manifest ? paths.length : !paths.length) throw new Error("Choose --manifest or one or more approved --path options");
    if (new Set(paths).size !== paths.length) throw new Error("Provide each page path only once");
    for (const source of paths) knowledgePath(source);
    try { process.loadEnvFile(".env.local"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const browser = await launchBrowser();
    try {
      const sources = values.manifest
        ? await loadKnowledgeSources((await import(pathToFileURL(resolve(values.manifest)).href)).default?.sources as DeclaredSource[],
          process.cwd(), page => capturePublishedSource(browser, origin, page, "local-preview"))
        : [];
      for (const source of paths) sources.push(await captureLocalPreviewSource(browser, origin, source));
      const verified = await buildKnowledgeCorpus(sources, "local-preview", verifyInBrowser(browser, origin, "local-preview"));
      await prepareEmbeddingModel();
      const corpus = await indexPortfolioCorpus(verified);
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
