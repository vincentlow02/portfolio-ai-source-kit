import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { GenerationError } from "../../lib/portfolio-chat/generation";
import { createRequestLimiter } from "../../lib/portfolio-chat/request-limits";
import { parsePortfolioCorpus } from "../../lib/knowledge/corpus";
import { b2PublicCorpus } from "../../lib/portfolio-chat/b2";
import { prepareEmbeddingModel } from "../../lib/portfolio-chat/embedding-model.mjs";
import { resolveResponseLanguage } from "../../lib/portfolio-chat/language";
import { readPortfolioRequest } from "../../lib/portfolio-chat/request-body";
import { createModelReply, excerptReply, validateWidgetQuestion, widgetFollowUpReply, widgetResponse } from "../../lib/portfolio-chat/source-reply";
import { readWidgetAsset, widgetAssets, widgetFramePolicy } from "../../lib/portfolio-chat/widget-assets";
import { RequestTiming } from "../../lib/portfolio-chat/timing";
import { localPreviewOrigin } from "../portfolio-knowledge/anonymous-browser.mjs";

const { values } = parseArgs({ options: {
  port: { type: "string", default: "4174" },
  model: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} });

if (values.help) {
  console.log("Usage: npm run preview:chat -- [--port 4174] [--model]");
} else {
  try {
    const port = Number(values.port);
    if (!/^\d+$/u.test(values.port) || !Number.isInteger(port) || port > 65535) throw new Error("Invalid port");
    await servePreview(port, Boolean(values.model));
  } catch (error) {
    console.error(`Chat preview failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

async function servePreview(port: number, useModel: boolean) {
  const artifact = ".portfolio-knowledge/local-preview.json";
  const text = await readFile(artifact, "utf8").catch(error => {
    if (error.code === "ENOENT") throw new Error("Run npm run preview:local and approve the source pages first");
    throw error;
  });
  const preview = JSON.parse(text) as { origin?: string; corpus?: unknown };
  const portfolioOrigin = localPreviewOrigin(preview.origin);
  const corpus = b2PublicCorpus(parsePortfolioCorpus(preview.corpus), "local-preview");
  if (!corpus.chunks.length) throw new Error("The preview has no eligible passages");
  try { process.loadEnvFile(".env.local"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await prepareEmbeddingModel();
  const modelReply = useModel ? createModelReply(corpus) : undefined;

  const kitRoot = fileURLToPath(new URL("../../", import.meta.url));
  const assets = new Map(await Promise.all([...widgetAssets].map(async ([route, { type }]) => [route, {
    type, body: await readWidgetAsset(kitRoot, route, {
      origin: portfolioOrigin, paths: corpus.pages.map(page => page.url),
    }),
  }] as const)));

  const enterRequest = createRequestLimiter(60, 2);
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    const address = server.address();
    if (!address || typeof address === "string" || request.headers.host !== `127.0.0.1:${address.port}`) {
      sendJson(response, 403, { error: "Use the loopback preview URL." });
      return;
    }
    const origin = `http://${request.headers.host}`;
    const asset = request.url && assets.get(request.url);
    if (request.method === "GET" && asset) {
      response.setHeader("Content-Type", asset.type);
      if (request.url === "/") response.setHeader("Content-Security-Policy", widgetFramePolicy(portfolioOrigin));
      if (request.url === "/widget/geist.woff2") response.setHeader("Access-Control-Allow-Origin", portfolioOrigin);
      response.end(asset.body);
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/preview") {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    if (request.headers.origin !== origin || request.headers["sec-fetch-site"] !== "same-origin") {
      sendJson(response, 403, { error: "Open the preview before asking a question." });
      return;
    }

    const release = enterRequest();
    if (!release) { sendJson(response, 429, {error: "Too many requests. Please try again later."}); return; }
    const timing = new RequestTiming(process.env.PORTFOLIO_AI_TIMING === "1");
    try {
    let question;
    try {
      question = validateWidgetQuestion(await readQuestion(request, origin), corpus);
    } catch {
      sendJson(response, 400, { error: "Enter a question of up to 2,000 characters." });
      return;
    }
    try {
      const { messages, page, quote, followUp } = question;
      const language = resolveResponseLanguage(messages, corpus.pages[0]?.language);
      const controller = new AbortController();
      response.once("close", () => controller.abort());
      const result = followUp ? widgetFollowUpReply(corpus, followUp) : modelReply
        ? await modelReply(messages, language, quote, { page, signal: controller.signal, timing })
        : await excerptReply(corpus, messages, language, quote, page, timing);
      sendJson(response, 200, widgetResponse(result, portfolioOrigin, { corpus, language }));
    } catch (error) {
      const message = modelReply ? describeModelFailure(error) : "The preview could not look up that question.";
      if (modelReply) console.warn(`Model preview: ${message}`);
      if (!response.destroyed) sendJson(response, 502, { error: message });
    }
    } finally { release(); timing.finish(); }
  });

  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start the preview");
  const url = `http://127.0.0.1:${address.port}/`;
  console.log(`Local chat preview: ${url}`);
  console.log(`Portfolio source: ${portfolioOrigin}`);
  console.log(`<script src="${url}embed.js" defer></script>`);
}

function describeModelFailure(error: unknown): string {
  if (error instanceof GenerationError && error.kind === "provider") {
    const status = error.status;
    if (status === 401 || status === 403) return `Model service rejected access (HTTP ${status}). Check the API key, endpoint region, and workspace permissions.`;
    if (status === 400) return "Model service rejected the request (HTTP 400). Check the model name and supported JSON mode.";
    if (status === 404) return "Model or endpoint not found (HTTP 404). Check the base URL and model availability in your region.";
    if (status === 429) return "Model service rate limit or quota reached (HTTP 429). Check usage and billing in the provider console.";
    if (typeof status === "number") return `Model service returned HTTP ${status}. Check the provider status and configuration.`;
    return "The model service could not be reached. Check the base URL and connection from the machine running the kit.";
  }
  if (error instanceof GenerationError && (error.kind === "timeout" || error.kind === "cancelled")) {
    return "The model request timed out or was cancelled.";
  }
  return "The preview could not process the model response. Check the kit and model configuration.";
}

function readQuestion(request: IncomingMessage, origin: string) {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "Content-Length": request.headers["content-length"] ?? "0" },
    body: Readable.toWeb(request) as ReadableStream<Uint8Array>,
    duplex: "half",
  };
  return readPortfolioRequest(new Request(`${origin}/api/preview`, init), 16_000);
}

function sendJson(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}
