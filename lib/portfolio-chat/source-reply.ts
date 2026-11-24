import { generateText, Output } from "ai";
import { z } from "zod";
import type { PortfolioCorpus } from "../portfolio-knowledge";
import { b2Prompt, b2Schema, b2Substantive, validateB2, type buildB2Pack } from "./b2";
import { validateAnswer, type ChatMessage } from "./core";
import { defaultPortfolioChatConfig } from "./engine-config";
import { resolveGuardianReply } from "./guardian";
import { clearlyWrongLanguage, type ResponseLanguage } from "./language";
import { configureModel } from "./provider";
import { retrieveEvidence } from "./retrieval";

const jsonObjectSchema = b2Schema.extend({
  recommendedProjectIds: b2Schema.shape.recommendedProjectIds.default([]),
  followUpQuestions: b2Schema.shape.followUpQuestions.default([]),
});

export function createModelReply(corpus: PortfolioCorpus, env: NodeJS.ProcessEnv = process.env) {
  const provider = configureModel(env);
  if (!provider) throw new Error("Configure a supported model provider before enabling model replies");
  const jsonObjectMode = provider.provider === "qwen" && env.QWEN_JSON_MODE?.trim() === "object";
  const responseInstructions = jsonObjectMode
    ? `Return exactly one JSON object matching this schema.\n${JSON.stringify(z.toJSONSchema(jsonObjectSchema, { io: "input" }))}`
    : "Return a JSON object matching the requested response shape.";

  return async (messages: ChatMessage[], language: ResponseLanguage) => {
    const guardian = resolveGuardianReply(messages.at(-1)!.content, language);
    if (guardian) return { answer: guardian.answer, sources: [] };
    const insufficient = () => validateAnswer({
      answer: "", language, insufficient: true, sourceIds: [], recommendedProjectIds: [],
    }, corpus);
    const { scores, fallback } = await retrieveEvidence(corpus, messages);
    const ranked = corpus.chunks.filter(b2Substantive)
      .sort((a, b) => (scores.get(b.chunkId) ?? 0) - (scores.get(a.chunkId) ?? 0));
    const entries: Awaited<ReturnType<typeof buildB2Pack>>["entries"] = [];
    let bytes = 0;
    for (const chunk of ranked) {
      if (entries.length === 18) break;
      const size = Buffer.byteLength(chunk.content);
      if (size > 3000 || bytes + size > 18000) continue;
      bytes += size;
      entries.push({ key: `E${entries.length + 1}`, chunk });
    }
    if (!entries.length) return insufficient();

    // Site capture provides public passages without project-specific manifest metadata.
    const pack: Awaited<ReturnType<typeof buildB2Pack>> = {
      config: defaultPortfolioChatConfig, intent: "OTHER", projects: [], ambiguous: false,
      catalog: null, topic: null, topicQualified: false, allowProjectEvidence: false, entries, bytes, fallback,
    };
    const result = await generateText({
      model: provider.model, providerOptions: provider.providerOptions,
      system: `${responseInstructions}\n${b2Prompt(corpus, pack, language)}`, messages,
      maxOutputTokens: 700, maxRetries: 0, abortSignal: AbortSignal.timeout(45_000),
      output: jsonObjectMode ? Output.json() : Output.object({ schema: b2Schema }),
    });
    const output = (jsonObjectMode ? jsonObjectSchema : b2Schema).parse(result.output);
    if (output.language !== language || output.claims.some(claim => clearlyWrongLanguage(claim.text, language))) return insufficient();
    return validateB2(output, corpus, pack);
  };
}

export async function excerptReply(corpus: PortfolioCorpus, messages: ChatMessage[], language: ResponseLanguage) {
  const { scores, terms } = await retrieveEvidence(corpus, messages);
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const phrase = normalize(terms);
  const ranked = corpus.chunks.filter(chunk => b2Substantive(chunk))
    .sort((a, b) => (scores.get(b.chunkId) ?? 0) - (scores.get(a.chunkId) ?? 0));
  const exact = phrase.includes(" ") && /\p{L}/u.test(phrase)
    ? ranked.find(chunk => ` ${normalize(chunk.content)} `.includes(` ${phrase} `))
    : undefined;
  const match = exact ?? ranked.find(chunk => (scores.get(chunk.chunkId) ?? 0) > 0);
  const result = validateAnswer({
    language, insufficient: !match, answer: "Matching portfolio passage.",
    sourceIds: match ? [match.chunkId] : [], recommendedProjectIds: [],
  }, corpus);
  return { ...result, answer: match ? match.content.slice(match.content.indexOf("\n") + 1) : result.answer };
}
