import { generateText, Output } from "ai";
import { z } from "zod";
import type { PortfolioCorpus } from "../portfolio-knowledge";
import { b2Prompt, b2Schema, parsePageContext, validateB2, type buildB2Pack } from "./b2";
import { validateAnswer, validateMessages, type ChatMessage } from "./core";
import { defaultPortfolioChatConfig } from "./engine-config";
import { validateFollowUpQuestions } from "./followups";
import { resolveGuardianReply } from "./guardian";
import { clearlyWrongLanguage, type ResponseLanguage } from "./language";
import { configureModel } from "./provider";
import { isSubstantivePassage, retrieveEvidence } from "./retrieval";
import { verifySelection } from "./selection";

type VerifiedQuote = ReturnType<typeof verifySelection>;

export function widgetResponse(result: { answer: string; sources: ReadonlyArray<{ section: string; url: string }>; followUpQuestions?: string[] }, origin: string) {
  return {
    answer: result.answer,
    sources: result.sources.map(source => ({ section: source.section, href: new URL(source.url, origin).href })),
    ...(result.followUpQuestions?.length ? { followUpQuestions: result.followUpQuestions } : {}),
  };
}

export function validateWidgetQuestion(body: unknown, corpus: PortfolioCorpus) {
  const input = body as { messages?: unknown; selectionContext?: unknown } | null;
  const messages = validateMessages(input?.messages);
  if (input?.selectionContext === undefined) return { messages, quote: undefined };
  if (!input.selectionContext || typeof input.selectionContext !== "object" || Array.isArray(input.selectionContext)) throw new Error("Invalid selection");
  const { lang, ...selection } = input.selectionContext as Record<string, unknown>;
  const page = parsePageContext({ pathname: selection.pagePath, lang }, corpus);
  return { messages, quote: verifySelection(selection, corpus, page) };
}

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

  return async (messages: ChatMessage[], language: ResponseLanguage, quote?: VerifiedQuote) => {
    const guardian = resolveGuardianReply(messages.at(-1)!.content, language);
    if (guardian) return { answer: guardian.answer, sources: [] };
    const insufficient = () => validateAnswer({
      answer: "", language, insufficient: true, sourceIds: [], recommendedProjectIds: [],
    }, corpus);
    const { scores, fallback } = await retrieveEvidence(corpus, messages);
    const ranked = corpus.chunks.filter(isSubstantivePassage)
      .sort((a, b) => (scores.get(b.chunkId) ?? 0) - (scores.get(a.chunkId) ?? 0));
    const candidates = quote ? [quote.chunk, ...ranked.filter(chunk => chunk.chunkId !== quote.chunk.chunkId)] : ranked;
    const entries: Awaited<ReturnType<typeof buildB2Pack>>["entries"] = [];
    let bytes = 0;
    for (const chunk of candidates) {
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
      system: `${responseInstructions}\n${b2Prompt(corpus, pack, language)}${quote ? "\nThe visitor selected text from E1. Use that evidence for questions about the selected text." : ""}`, messages,
      maxOutputTokens: 700, maxRetries: 0, abortSignal: AbortSignal.timeout(45_000),
      output: jsonObjectMode ? Output.json() : Output.object({ schema: b2Schema }),
    });
    const output = (jsonObjectMode ? jsonObjectSchema : b2Schema).parse(result.output);
    if (output.language !== language || output.claims.some(claim => clearlyWrongLanguage(claim.text, language))) return insufficient();
    const answer = validateB2(output, corpus, pack);
    if (answer.insufficient) return answer;
    return { ...answer, followUpQuestions: validateFollowUpQuestions(output.followUpQuestions, messages, [], corpus, false, language) };
  };
}

export async function excerptReply(corpus: PortfolioCorpus, messages: ChatMessage[], language: ResponseLanguage, quote?: VerifiedQuote) {
  const retrieval = quote ? undefined : await retrieveEvidence(corpus, messages);
  const match = quote?.chunk ?? retrieval?.chunks[0];
  const result = validateAnswer({
    language, insufficient: !match, answer: "Matching portfolio passage.",
    sourceIds: match ? [match.chunkId] : [], recommendedProjectIds: [],
  }, corpus);
  if (!match) return result;
  const page = match.sourceUrl.split("#")[0];
  const topics = [...new Set(corpus.chunks.filter(chunk => chunk.sourceUrl.split("#")[0] === page && chunk.sectionTitle !== match.sectionTitle &&
    chunk.buildVersion === corpus.contentHash && chunk.accessLevel === "public" && isSubstantivePassage(chunk))
    .map(chunk => chunk.sectionTitle))].filter(title => title.length >= 3 && title.length <= 100 && !/[<>\r\n]|https?:\/\//iu.test(title));
  const questions = topics.slice(0, 2).map(title => ({ en: `What about ${title}?`, zh: `可以介绍「${title}」吗？`, ja: `「${title}」について教えてください。` })[language]);
  return { ...result, answer: match.content.slice(match.content.indexOf("\n") + 1), followUpQuestions: questions };
}
