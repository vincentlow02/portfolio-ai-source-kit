import { APICallError, generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import { z, ZodError } from "zod";
import { b2Schema } from "./answer-schema";
import type { ChatMessage } from "./core";
import type { configureModel } from "./provider";

export type ConfiguredModel = NonNullable<ReturnType<typeof configureModel>>;

const objectSchema = b2Schema.extend({
  recommendedProjectIds: b2Schema.shape.recommendedProjectIds.default([]),
  followUpQuestions: b2Schema.shape.followUpQuestions.default([]),
});

export class GenerationError extends Error {
  constructor(readonly kind: "cancelled" | "timeout" | "provider" | "json" | "schema" | "empty", readonly status?: number) {
    super("Portfolio answer generation failed");
  }
}

export async function executeGeneration(
  provider: ConfiguredModel, system: string, messages: ChatMessage[],
  options: { objectMode?: boolean; signal?: AbortSignal; onUsage?: (usage: { inputTokens?: number; outputTokens?: number }) => void } = {},
) {
  const deadline = AbortSignal.timeout(45_000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const objectMode = provider.provider === "qwen" && options.objectMode;
  const instructions = objectMode
    ? `Return exactly one JSON object matching this schema.\n${JSON.stringify(z.toJSONSchema(objectSchema, { io: "input" }))}\n`
    : "";
  try {
    signal.throwIfAborted();
    const result = await generateText({
      model: provider.model, providerOptions: provider.providerOptions,
      system: instructions + system, messages, maxOutputTokens: 700, maxRetries: 0, abortSignal: signal,
      output: objectMode ? Output.json() : Output.object({ schema: b2Schema }),
    });
    options.onUsage?.(result.usage);
    signal.throwIfAborted();
    const output = (objectMode ? objectSchema : b2Schema).parse(result.output);
    return { output, usage: {
      model: provider.modelId, provider: provider.provider,
      inputTokens: result.usage.inputTokens ?? null, outputTokens: result.usage.outputTokens ?? null,
      cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? null,
    } };
  } catch (error) {
    if (options.signal?.aborted) throw new GenerationError("cancelled");
    if (deadline.aborted || error instanceof Error && error.name === "TimeoutError") throw new GenerationError("timeout");
    if (APICallError.isInstance(error)) throw new GenerationError("provider", error.statusCode);
    if (NoObjectGeneratedError.isInstance(error)) throw new GenerationError("json");
    if (NoOutputGeneratedError.isInstance(error)) throw new GenerationError("empty");
    if (error instanceof ZodError) throw new GenerationError("schema");
    throw new GenerationError("provider");
  }
}
