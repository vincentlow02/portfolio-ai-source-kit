import { generateText, Output } from "ai";
import { z } from "zod";
import type { PortfolioCorpus } from "../../../lib/portfolio-knowledge";
import { b2Prompt, b2Schema, b2Substantive, validateB2, type buildB2Pack } from "../../../lib/portfolio-chat/b2";
import { validateAnswer, type ChatMessage } from "../../../lib/portfolio-chat/core";
import { defaultPortfolioChatConfig } from "../../../lib/portfolio-chat/engine-config";
import { resolveGuardianReply } from "../../../lib/portfolio-chat/guardian";
import { clearlyWrongLanguage, type ResponseLanguage } from "../../../lib/portfolio-chat/language";
import { configureModel } from "../../../lib/portfolio-chat/provider";
import { retrieveEvidence } from "../../../lib/portfolio-chat/retrieval";

const jsonObjectSchema = b2Schema.extend({
  recommendedProjectIds: b2Schema.shape.recommendedProjectIds.default([]),
  followUpQuestions: b2Schema.shape.followUpQuestions.default([]),
});

export function createModelReply(corpus: PortfolioCorpus) {
  try { process.loadEnvFile(".env.local"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const provider = configureModel(process.env);
  if (!provider) throw new Error("Configure a model provider in the kit's .env.local before using --model");
  const jsonObjectMode = provider.provider === "qwen" && process.env.QWEN_JSON_MODE?.trim() === "object";
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

    // Local capture provides public passages without project-specific manifest metadata.
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
