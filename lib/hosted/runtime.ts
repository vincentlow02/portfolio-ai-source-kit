import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePortfolioCorpus } from "../knowledge/corpus";
import { hostedPortfolioOrigin } from "../knowledge/hosted-origin";
import { b2PublicCorpus } from "../portfolio-chat/b2";
import { createModelReply } from "../portfolio-chat/source-reply";

async function loadHostedAssistant() {
  const artifact = join(process.cwd(), ".portfolio-knowledge", "hosted.json");
  const stored = JSON.parse(await readFile(artifact, "utf8")) as { origin?: unknown; corpus?: unknown };
  const origin = hostedPortfolioOrigin(process.env.PORTFOLIO_SITE_ORIGIN);
  if (stored.origin !== origin) throw new Error("Hosted corpus does not match the deployment");

  const corpus = b2PublicCorpus(parsePortfolioCorpus(stored.corpus), "hosted");
  if (!corpus.chunks.length) throw new Error("The hosted corpus has no eligible passages");

  let model;
  if (process.env.PORTFOLIO_HOSTED_MODEL === "1") {
    try {
      model = createModelReply(corpus, { ...process.env, QWEN_JSON_MODE: process.env.QWEN_JSON_MODE ?? "object" });
    } catch {
      console.warn("Portfolio AI will use excerpts. Check the hosted model configuration.");
    }
  }
  return { origin, corpus, model };
}

let assistant: ReturnType<typeof loadHostedAssistant> | undefined;

export function getHostedAssistant() {
  assistant ??= loadHostedAssistant().catch(error => {
    assistant = undefined;
    throw error;
  });
  return assistant;
}
