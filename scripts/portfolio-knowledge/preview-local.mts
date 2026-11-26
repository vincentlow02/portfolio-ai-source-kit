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
import { discoverPortfolioSources } from "./discover-sources.mts";
import { confirmDiscoveredPaths, readApprovedPreviewPaths } from "./local-source-selection";
import { loadKnowledgeSources, type DeclaredSource } from "./source-plan";
import { printDiscoveryReport, printIndexedSources } from "./source-report";

const { values } = parseArgs({ options: {
  origin: { type: "string" },
  path: { type: "string", multiple: true },
  manifest: { type: "string" },
  discover: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} });

async function previewLocal() {
  const origin = localPreviewOrigin(values.origin);
  const explicitPaths = values.path ?? [];
  if ([Boolean(values.manifest), Boolean(values.discover), explicitPaths.length > 0].filter(Boolean).length > 1) {
    throw new Error("Choose --discover, --manifest, or one or more --path options");
  }
  if (new Set(explicitPaths).size !== explicitPaths.length) throw new Error("Provide each page path only once");
  for (const path of explicitPaths) knowledgePath(path);
  try { process.loadEnvFile(".env.local"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

  const directory = join(process.cwd(), ".portfolio-knowledge");
  const output = join(directory, "local-preview.json");
  const savedPaths = !values.manifest && !values.discover && !explicitPaths.length
    ? await readApprovedPreviewPaths(output, origin)
    : undefined;
  let paths = savedPaths ?? explicitPaths;
  const discover = !values.manifest && !paths.length;
  if (discover && !process.stdin.isTTY) {
    throw new Error("Run preview:local in a terminal to review discovered pages, or pass --path or --manifest");
  }

  const browser = await launchBrowser();
  try {
    if (discover) {
      const report = await discoverPortfolioSources(browser, origin);
      printDiscoveryReport(origin, report);
      const candidates = report.candidates.map(page => page.path);
      if (!candidates.length) throw new Error("No eligible portfolio pages found. Check the homepage or pass a known page with --path");
      paths = await confirmDiscoveredPaths(candidates);
      if (!paths.length) {
        console.log("No sources approved. Run preview:local again when ready.");
        return;
      }
    } else if (savedPaths) {
      console.log(`Using ${savedPaths.length} previously approved pages. Run with --discover to review the list again.`);
    }

    const sources = values.manifest
      ? await loadKnowledgeSources((await import(pathToFileURL(resolve(values.manifest)).href)).default?.sources as DeclaredSource[],
        process.cwd(), page => capturePublishedSource(browser, origin, page, "local-preview"),
        url => captureLocalPreviewSource(browser, origin, url))
      : [];
    for (const path of paths) {
      try {
        sources.push(await captureLocalPreviewSource(browser, origin, path));
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Could not read the page";
        throw new Error(`Could not capture approved page ${path}. ${reason}`, { cause: error });
      }
    }
    const verified = await buildKnowledgeCorpus(sources, "local-preview", verifyInBrowser(browser, origin, "local-preview"));
    await prepareEmbeddingModel();
    const corpus = await indexPortfolioCorpus(verified);
    await mkdir(directory, { recursive: true });
    const pending = join(directory, `local-preview.${randomUUID()}.tmp`);
    try {
      await writeFile(pending, JSON.stringify({ origin, corpus, ...(values.manifest ? {} : { approvedPaths: paths }) }, null, 2) + "\n", { flag: "wx" });
      await rename(pending, output);
    } finally {
      await unlink(pending).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
    console.log(`Local knowledge preview: ${corpus.pages.length} pages, ${corpus.chunks.length} passages.`);
    printIndexedSources(corpus, origin);
    console.log("Saved to .portfolio-knowledge/local-preview.json");
  } finally {
    await browser.close();
  }
}

if (values.help) {
  console.log("Usage: npm run preview:local -- --origin http://127.0.0.1:5173 [--discover | --path /projects | --manifest ./portfolio-knowledge.config.ts]");
} else {
  try {
    await previewLocal();
  } catch (error) {
    console.error(`Local preview failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
