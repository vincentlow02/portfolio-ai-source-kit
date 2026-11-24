import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { parseArgs } from "node:util";
import { APICallError, NoObjectGeneratedError, NoOutputGeneratedError } from "ai";
import { ZodError } from "zod";
import type { PortfolioCorpus } from "../../lib/portfolio-knowledge";
import { b2PublicCorpus } from "../../lib/portfolio-chat/b2";
import { validateMessages } from "../../lib/portfolio-chat/core";
import { resolveResponseLanguage } from "../../lib/portfolio-chat/language";
import { readPortfolioRequest } from "../../lib/portfolio-chat/request-body";
import { createModelReply, excerptReply } from "../../lib/portfolio-chat/source-reply";
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
  const preview = JSON.parse(text) as { origin: string; corpus: PortfolioCorpus };
  const portfolioOrigin = localPreviewOrigin(preview.origin);
  if (preview.corpus?.schemaVersion !== 1 || !preview.corpus.contentHash ||
      !preview.corpus.pages?.length || !preview.corpus.chunks?.length) throw new Error("Invalid local knowledge preview");
  const corpus = b2PublicCorpus(preview.corpus, "local-preview");
  corpus.chunks = corpus.chunks.filter(chunk => chunk.accessLevel === "public" &&
    chunk.buildVersion === corpus.contentHash && corpus.pages.some(page => page.url === chunk.sourceUrl.split("#")[0]));
  if (!corpus.chunks.length) throw new Error("The preview has no eligible passages");
  if (useModel) {
    try { process.loadEnvFile(".env.local"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const modelReply = useModel ? createModelReply(corpus) : undefined;

  const assets = new Map(await Promise.all([
    ["/", "preview.html", "text/html; charset=utf-8"],
    ["/preview.js", "preview.js", "text/javascript; charset=utf-8"],
    ["/preview.css", "preview.css", "text/css; charset=utf-8"],
    ["/embed.js", "embed.js", "text/javascript; charset=utf-8"],
    ["/embed.css", "embed.css", "text/css; charset=utf-8"],
  ].map(async ([route, name, contentType]) => [route, {
    contentType, body: await readFile(new URL(`./local-preview/${name}`, import.meta.url), "utf8"),
  }] as const)));

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
      response.setHeader("Content-Type", asset.contentType);
      if (request.url === "/") {
        response.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors ${portfolioOrigin}`);
      }
      response.end(request.url === "/" ? asset.body.replace("{{mode}}", modelReply ? "Model preview" : "Local preview · Finds matching passages") : asset.body);
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

    let messages;
    try {
      const body = await readQuestion(request, origin);
      messages = validateMessages(body?.messages);
    } catch {
      sendJson(response, 400, { error: "Enter a question of up to 2,000 characters." });
      return;
    }
    try {
      const language = resolveResponseLanguage(messages, corpus.pages[0]?.language);
      const result = modelReply ? await modelReply(messages, language) : await excerptReply(corpus, messages, language);
      sendJson(response, 200, {
        answer: result.answer,
        sources: result.sources.map(source => ({ section: source.section, href: new URL(source.url, portfolioOrigin).href })),
      });
    } catch (error) {
      const message = modelReply ? describeModelFailure(error) : "The preview could not look up that question.";
      if (modelReply) console.warn(`Model preview: ${message}`);
      sendJson(response, 502, { error: message });
    }
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
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === 401 || status === 403) return `Model service rejected access (HTTP ${status}). Check the API key, endpoint region, and workspace permissions.`;
    if (status === 400) return "Model service rejected the request (HTTP 400). Check the model name and supported JSON mode.";
    if (status === 404) return "Model or endpoint not found (HTTP 404). Check the base URL and model availability in your region.";
    if (status === 429) return "Model service rate limit or quota reached (HTTP 429). Check usage and billing in the provider console.";
    if (typeof status === "number") return `Model service returned HTTP ${status}. Check the provider status and configuration.`;
    return "The model service could not be reached. Check the base URL and connection from the machine running the kit.";
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    if (error.finishReason === "length") return "The model stopped before completing its JSON answer. Try a more focused question.";
    return "The model response could not be read as JSON. Check the selected model and JSON mode.";
  }
  if (NoOutputGeneratedError.isInstance(error)) return "The model returned no answer text.";
  if (error instanceof ZodError) {
    return "The model returned JSON with unexpected answer fields. Check the model’s support for JSON output.";
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "The model request timed out. Try again when the model service is responding.";
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
  return readPortfolioRequest(new Request(`${origin}/api/preview`, init), 8_000) as Promise<{ messages?: unknown } | null>;
}

function sendJson(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}
