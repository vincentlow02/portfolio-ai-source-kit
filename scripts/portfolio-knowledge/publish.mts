import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { buildKnowledgeCorpus, validateSourcePlan, type KnowledgeSource } from "../../lib/knowledge/contract";
import { capturePublishedSource, verifyInBrowser } from "../../lib/knowledge/rendered";
import { embeddingTraceIncludes, prepareEmbeddingModel } from "../../lib/portfolio-chat/embedding-model.mjs";
import { launchBrowser } from "./anonymous-browser.mjs";

type PublicInput = Extract<KnowledgeSource, { format: "markdown" | "mdx" }>;
export type KnowledgeBuildConfig = {
  sources: Array<
    | { access: "protected"; url: string }
    | { access: "public"; format: "rendered"; page: PublicInput["page"] }
    | (Omit<PublicInput, "text"> & { file: string })
    | { access: "public"; format: "json"; page: PublicInput["page"]; file: string }
  >;
  /** Server routes that use the corpus. Relative case-only aliases are unsupported. */
  chatRoutes?: readonly string[];
};

const root = await realpath(process.cwd());
const next = join(root, "node_modules", "next", "dist", "bin", "next");
const artifact = join(root, ".portfolio-knowledge", "corpus.json");
const candidate = join(dirname(artifact), `corpus.${randomUUID()}.tmp`);
const idFile = join(root, ".next", "BUILD_ID");
const childEnv = { ...process.env, PORTFOLIO_AI_PUBLIC_ENABLED: "0", PORTFOLIO_AI_PROTECTED_PREVIEW: "0", PORTFOLIO_AI_ACCESS_TOKEN: "" };

async function contentFile(file: string) {
  if (isAbsolute(file)) throw new Error("Knowledge source files must be within the host directory");
  const path = await realpath(resolve(root, file));
  const link = relative(root, path);
  if (!link || link === ".." || link.startsWith(".." + sep) || isAbsolute(link)) throw new Error("Knowledge source file escapes the host directory");
  return readFile(path, "utf8");
}

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

async function traceArtifact(route: string) {
  if (!/^\/api\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u.test(route)) throw new Error("Invalid chat API trace route: " + route);
  const file = join(root, ".next", "server", "app", route.slice(1), "route.js.nft.json");
  const trace: { files: string[] } = JSON.parse(await readFile(file, "utf8"));
  const tracePath = (target: string) => relative(dirname(file), target).split(sep).join("/");
  const paths = new Set(trace.files.map(path => path.replaceAll("\\", "/")));
  if (!paths.has(tracePath(artifact))) throw new Error("Add the corpus to outputFileTracingIncludes for " + route);
  for (const modelFile of embeddingTraceIncludes.filter(file => file.startsWith("./.portfolio-knowledge/"))) {
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
  await prepareEmbeddingModel(root);
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
  for (const route of config.chatRoutes ?? ["/api/portfolio-chat"]) await traceArtifact(route);
  const server = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", "0"], { cwd: root, env: childEnv, stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  try {
    const origin = await previewOrigin(server);
    browser = await launchBrowser();
    const sources: KnowledgeSource[] = [];
    for (const input of config.sources) {
      if (input.access === "protected") {
        sources.push({ access: "protected", url: input.url });
      } else if (input.format === "rendered") {
        sources.push(await capturePublishedSource(browser, origin, input.page));
      } else if (input.format === "json") {
        sources.push({ ...input, data: JSON.parse(await contentFile(input.file)) });
      } else if (input.format === "mdx" || input.format === "markdown") {
        sources.push({ ...input, text: await contentFile(input.file) });
      } else {
        throw new Error("Unsupported knowledge source format");
      }
    }
    const corpus = await buildKnowledgeCorpus(sources, buildId, verifyInBrowser(browser, origin));
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
