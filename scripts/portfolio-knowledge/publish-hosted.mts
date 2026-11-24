import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildKnowledgeCorpus, knowledgePath } from "../../lib/knowledge/contract";
import { hostedPortfolioOrigin } from "../../lib/knowledge/hosted-origin";
import { captureSiteSource, verifyInBrowser } from "../../lib/knowledge/rendered";
import { prepareEmbeddingModel } from "../../lib/portfolio-chat/embedding-model.mjs";
import { launchBrowser } from "./anonymous-browser.mjs";
import { hostedResourceLoader } from "./hosted-resource.mts";

try { process.loadEnvFile(".env.local"); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const origin = hostedPortfolioOrigin(process.env.PORTFOLIO_SITE_ORIGIN);
const paths = (process.env.PORTFOLIO_SOURCE_PATHS ?? "").split(/[,\n]/u).map(value => value.trim()).filter(Boolean);
if (!paths.length || new Set(paths).size !== paths.length) throw new Error("Set PORTFOLIO_SOURCE_PATHS to a comma-separated list of unique, approved public paths");
for (const path of paths) knowledgePath(path);

await prepareEmbeddingModel();
const loadResource = await hostedResourceLoader(origin);
// Only the pinned HTTPS loader can fetch resources for the anonymous browser.
const browser = await launchBrowser([
  "--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>", "--disable-quic",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
]);
try {
  const sources = [];
  for (const path of paths) {
    try {
      await loadResource(origin + path);
      sources.push(await captureSiteSource(browser, origin, path, "hosted", loadResource));
    }
    catch (error) { throw new Error(`Could not capture the approved source ${path}`, { cause: error }); }
  }
  const corpus = await buildKnowledgeCorpus(sources, "hosted", verifyInBrowser(browser, origin, "hosted", loadResource));
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
} finally {
  await browser.close();
}
