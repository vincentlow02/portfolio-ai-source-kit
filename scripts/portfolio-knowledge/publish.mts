import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { buildKnowledgeCorpus, validateSourcePlan } from "../../lib/knowledge/contract";
import { capturePublishedSource, captureSiteSource, verifyInBrowser } from "../../lib/knowledge/rendered";
import { embeddingModelFiles, prepareEmbeddingModel } from "../../lib/portfolio-chat/embedding-model.mjs";
import { embeddingProvider, indexPortfolioCorpus, type EmbeddingProvider } from "../../lib/portfolio-chat/embeddings";
import { launchBrowser } from "./anonymous-browser.mjs";
import { loadKnowledgeSources, type DeclaredSource } from "./source-plan";

export type KnowledgeBuildConfig = {
  sources: readonly DeclaredSource[];
  /** Server routes that use the corpus. Relative case-only aliases are unsupported. */
  chatRoutes?: readonly string[];
  embedding?: EmbeddingProvider;
};

const root = await realpath(process.cwd());
try { process.loadEnvFile(join(root, ".env.local")); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const next = join(root, "node_modules", "next", "dist", "bin", "next");
const artifact = join(root, ".portfolio-knowledge", "corpus.json");
const candidate = join(dirname(artifact), `corpus.${randomUUID()}.tmp`);
const idFile = join(root, ".next", "BUILD_ID");
const childEnv = { ...process.env, PORTFOLIO_AI_PUBLIC_ENABLED: "0", PORTFOLIO_AI_PROTECTED_PREVIEW: "0", PORTFOLIO_AI_ACCESS_TOKEN: "" };

async function previewOrigin(server: ReturnType<typeof spawn>) {
  return new Promise<string>((res, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out starting the built portfolio")), 30_000);
    const fail = (error: unknown) => { clearTimeout(timeout); reject(error); };
    server.once("error", fail);
    server.once("exit", code => fail(new Error("Portfolio preview exited: " + code)));
    let output = "";
    server.stdout?.on("data", chunk => {
      output = (output + chunk.toString()).slice(-4000);
      const url = output.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/u)?.[1];
      if (url && /Ready in/u.test(output)) { clearTimeout(timeout); res(url); }
    });
  });
}

async function traceArtifact(route: string, localEmbedding: boolean) {
  if (!/^\/api\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u.test(route)) throw new Error("Invalid chat API trace route: " + route);
  const file = join(root, ".next", "server", "app", route.slice(1), "route.js.nft.json");
  const trace: { files: string[] } = JSON.parse(await readFile(file, "utf8"));
  const tracePath = (target: string) => relative(dirname(file), target).split(sep).join("/");
  const paths = new Set(trace.files.map(path => path.replaceAll("\\", "/")));
  if (!paths.has(tracePath(artifact))) throw new Error("Add the corpus to outputFileTracingIncludes for " + route);
  for (const modelFile of localEmbedding ? embeddingModelFiles : []) {
    if (!paths.has(tracePath(join(root, modelFile)))) {
      throw new Error("Add embeddingTraceIncludes to outputFileTracingIncludes for " + route);
    }
  }
  if (!paths.has(tracePath(idFile))) {
    trace.files.push(tracePath(idFile));
    await writeFile(file, JSON.stringify(trace));
  }
}

const configFile = resolve(root, process.argv[2] ?? "portfolio-knowledge.config.ts");
const { default: config }: { default: KnowledgeBuildConfig } = await import(pathToFileURL(configFile).href);
let placeholder = false;
try {
  if (!Array.isArray(config?.sources) || !config.sources.length) throw new Error("Missing knowledge source configuration");
  validateSourcePlan(config.sources);
  const provider = embeddingProvider(config.embedding);
  const localEmbedding = Boolean(provider && !config.embedding);
  if (localEmbedding) await prepareEmbeddingModel(root);
  await mkdir(dirname(artifact), { recursive: true });
  try {
    await writeFile(artifact, "{}\n", { flag: "wx" });
    placeholder = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const compile = spawn(process.execPath, [next, "build"], { cwd: root, env: childEnv, stdio: "inherit", windowsHide: true });
  const [code] = await once(compile, "exit");
  if (code !== 0) throw new Error("Next.js build failed");
  const buildId = (await readFile(idFile, "utf8")).trim();
  for (const route of config.chatRoutes ?? ["/api/portfolio-chat"]) await traceArtifact(route, localEmbedding);
  const server = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", "0"], { cwd: root, env: childEnv, stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  try {
    const origin = await previewOrigin(server);
    browser = await launchBrowser();
    const sources = await loadKnowledgeSources(config.sources, root, page => capturePublishedSource(browser!, origin, page),
      url => captureSiteSource(browser!, origin, url, "published"));
    const verified = await buildKnowledgeCorpus(sources, buildId, verifyInBrowser(browser, origin));
    const corpus = await indexPortfolioCorpus(verified, provider);
    await writeFile(candidate, JSON.stringify(corpus) + "\n", { flag: "wx" });
    const previous = placeholder ? undefined : await readFile(artifact);
    await rename(candidate, artifact);
    try {
      // Probe the real completed bytes while the build preview is bound to loopback.
      const response = await fetch(origin + "/.portfolio-knowledge/corpus.json", { redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (response.status !== 404) throw new Error("The corpus artifact must not be publicly served");
    } catch (error) {
      if (previous) {
        await writeFile(candidate, previous, { flag: "wx" });
        await rename(candidate, artifact);
      }
      throw error;
    }
    placeholder = false;
    console.log("Portfolio knowledge:", { pages: corpus.pages.length, chunks: corpus.chunks.length, excluded: corpus.report.exclusions.length });
  } finally {
    try { await browser?.close(); } finally { server.kill(); }
  }
} catch (error) {
  if (placeholder) await rm(artifact, { force: true });
  throw error;
} finally {
  await rm(candidate, { force: true });
}
