import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildKnowledgeCorpus, knowledgePath } from "../../lib/knowledge/contract";
import { hostedPortfolioOrigin } from "../../lib/knowledge/hosted-origin";
import { capturePublishedSource, captureSiteSource, verifyInBrowser } from "../../lib/knowledge/rendered";
import { prepareEmbeddingModel } from "../../lib/portfolio-chat/embedding-model.mjs";
import { indexPortfolioCorpus } from "../../lib/portfolio-chat/embeddings";
import { hostedResourceLoader, launchHostedPortfolioBrowser } from "./hosted-resource.mts";
import { loadKnowledgeSources, type DeclaredSource } from "./source-plan";
import { printIndexedSources } from "./source-report";

try { process.loadEnvFile(".env.local"); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const origin = hostedPortfolioOrigin(process.env.PORTFOLIO_SITE_ORIGIN);
const manifest = process.env.PORTFOLIO_KNOWLEDGE_CONFIG?.trim();
const paths = (process.env.PORTFOLIO_SOURCE_PATHS ?? "").split(/[,\n]/u).map(value => value.trim()).filter(Boolean);
if ((manifest && paths.length) || (!manifest && (!paths.length || new Set(paths).size !== paths.length))) {
  throw new Error("Choose a knowledge manifest or a list of unique approved paths");
}
for (const path of paths) knowledgePath(path);

await prepareEmbeddingModel();
const loadResource = await hostedResourceLoader(origin);
const browser = await launchHostedPortfolioBrowser();
try {
  const sources = manifest
    ? await loadKnowledgeSources((await import(pathToFileURL(resolve(manifest)).href)).default?.sources as DeclaredSource[],
      process.cwd(), page => capturePublishedSource(browser, origin, page, "hosted", loadResource),
      url => captureSiteSource(browser, origin, url, "hosted", loadResource))
    : [];
  for (const path of paths) {
    try {
      await loadResource(origin + path);
      sources.push(await captureSiteSource(browser, origin, path, "hosted", loadResource));
    } catch (error) { throw new Error(`Could not capture the approved source ${path}`, { cause: error }); }
  }
  const verified = await buildKnowledgeCorpus(sources, "hosted", verifyInBrowser(browser, origin, "hosted", loadResource));
  const corpus = await indexPortfolioCorpus(verified);
  const directory = join(process.cwd(), ".portfolio-knowledge");
  const temporary = join(directory, `hosted.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify({ origin, corpus }) + "\n", { flag: "wx" });
    await rename(temporary, join(directory, "hosted.json"));
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
  console.log(`Hosted knowledge built from ${corpus.pages.length} approved pages and ${corpus.chunks.length} passages.`);
  printIndexedSources(corpus, origin);
} finally {
  await browser.close();
}
