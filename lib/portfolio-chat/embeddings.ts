import { readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join, toNamespacedPath } from "node:path";
import type { PortfolioChunk, PortfolioCorpus } from "../portfolio-knowledge";
import { embeddingModelDirectory, embeddingModelId, retrievalMode } from "./embedding-model.mjs";

const maximumTokens = 512;

export type EmbeddingPurpose = "query" | "passage";
export type EmbeddingCalibration = { cosine: number; assistedCosine: number; fused: number; keywordWeight?: number };
export type EmbeddingProvider = {
  id: string;
  dimensions: number;
  calibration: EmbeddingCalibration;
  embed(texts: string[], purpose: EmbeddingPurpose): Promise<number[][]>;
};

async function loadEncoder() {
  // The integration traces the pinned model files explicitly.
  const directory = join(/* turbopackIgnore: true */ process.cwd(), embeddingModelDirectory);
  const [tokenizerJson, tokenizerConfig, { Tokenizer }, { InferenceSession, Tensor }] = await Promise.all([
    readFile(join(directory, "tokenizer.json"), "utf8").then(text => JSON.parse(text)),
    readFile(join(directory, "tokenizer_config.json"), "utf8").then(text => JSON.parse(text)),
    import("@huggingface/tokenizers"),
    import("onnxruntime-node"),
  ]);
  const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
  const padding = BigInt(tokenizer.token_to_id(tokenizerConfig.pad_token)!);
  const session = await InferenceSession.create(toNamespacedPath(join(directory, "model_quantized.onnx")), {
    executionProviders: ["cpu"], intraOpNumThreads: Math.min(2, availableParallelism()), interOpNumThreads: 1,
  });
  return { tokenizer, padding, session, Tensor };
}

async function encode(encoder: Awaited<ReturnType<typeof loadEncoder>>, texts: string[]) {
  const { tokenizer, padding, session, Tensor } = encoder;
  const sequences = texts.map(text => tokenizer.encode(text, { add_special_tokens: true }).ids.slice(0, maximumTokens));
  const length = Math.max(...sequences.map(tokens => tokens.length));
  const shape = [sequences.length, length];
  const ids = new BigInt64Array(sequences.length * length).fill(padding);
  const mask = new BigInt64Array(ids.length);
  for (const [index, tokens] of sequences.entries()) {
    const start = index * length;
    ids.set(tokens.map(BigInt), start);
    mask.fill(BigInt(1), start, start + tokens.length);
  }
  const { last_hidden_state: hidden } = await session.run({
    input_ids: new Tensor("int64", ids, shape),
    attention_mask: new Tensor("int64", mask, shape),
    token_type_ids: new Tensor("int64", new BigInt64Array(ids.length), shape),
  });
  if (!(hidden.data instanceof Float32Array)) throw new Error("Unexpected embedding model output");
  const data = hidden.data;
  const width = hidden.dims[2];
  return sequences.map((tokens, row) => {
    // Normalizing the masked sum gives the same direction as normalized mean pooling.
    const vector = Array<number>(width).fill(0);
    for (let position = 0; position < tokens.length; position++) {
      const start = (row * length + position) * width;
      for (let column = 0; column < width; column++) vector[column] += data[start + column];
    }
    const norm = Math.hypot(...vector);
    if (!norm || !Number.isFinite(norm)) throw new Error("Invalid embedding model output");
    return vector.map(component => component / norm);
  });
}

let encoder: ReturnType<typeof loadEncoder> | undefined;
const localEmbedding: EmbeddingProvider = {
  id: embeddingModelId,
  dimensions: 384,
  calibration: { cosine: 0.365, assistedCosine: 0.30, fused: 0.50 },
  async embed(texts) {
    if (!texts.length) return [];
    encoder ??= loadEncoder().catch(error => { encoder = undefined; throw error; });
    return encode(await encoder, texts);
  },
};

export function embeddingProvider(custom?: EmbeddingProvider): EmbeddingProvider | null {
  return retrievalMode() === "keyword" ? null : custom ?? localEmbedding;
}

/** Compatibility helper for direct retrieval diagnostics. Use the provider for indexing. */
export function embedTexts(texts: string[], purpose: EmbeddingPurpose = "query") {
  const provider = embeddingProvider();
  if (!provider) throw new Error("Keyword retrieval does not use an embedding provider");
  return provider.embed(texts, purpose);
}

export async function embedPassageVectors(chunks: readonly PortfolioChunk[], embed: (texts: string[]) => Promise<number[][]>) {
  const vectors = new Map<string, number[]>();
  for (let offset = 0; offset < chunks.length; offset += 8) {
    const batch = chunks.slice(offset, offset + 8);
    const rows = await embed(batch.map(chunk => chunk.content));
    if (rows.length !== batch.length) throw new Error("Could not embed the approved passages");
    batch.forEach((chunk, index) => vectors.set(chunk.chunkId, rows[index]));
  }
  return vectors;
}

export async function indexPortfolioCorpus(corpus: PortfolioCorpus, provider = embeddingProvider()): Promise<PortfolioCorpus> {
  if (!provider) return corpus;
  const { id, dimensions } = provider;
  if (!id || id.length > 200 || !Number.isInteger(dimensions) || dimensions < 1 || dimensions > 4096) {
    throw new Error("Invalid embedding provider identity or dimensions");
  }
  const vectors = await embedPassageVectors(corpus.chunks, texts => provider.embed(texts, "passage"));
  const encoded = Object.fromEntries(Array.from(vectors, ([id, vector]) => {
    if (vector.length !== dimensions || vector.some(value => !Number.isFinite(value)) ||
        Math.abs(Math.hypot(...vector) - 1) > 0.01) throw new Error("Expected normalized passage embeddings");
    const bytes = Buffer.alloc(dimensions * 4);
    vector.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
    return [id, bytes.toString("base64")];
  }));
  return { ...corpus, embeddingIndex: { version: 1, contentHash: corpus.contentHash, model: id, dimensions, vectors: encoded } };
}

export function publishedPassageVectors(corpus: PortfolioCorpus, chunks: readonly PortfolioChunk[], provider: EmbeddingProvider) {
  const index = corpus.embeddingIndex;
  if (!index || index.contentHash !== corpus.contentHash || index.model !== provider.id || index.dimensions !== provider.dimensions) return;
  const vectors = new Map<string, number[]>();
  for (const { chunkId } of chunks) {
    if (!Object.hasOwn(index.vectors, chunkId)) return;
    const bytes = Buffer.from(index.vectors[chunkId], "base64");
    if (bytes.length !== provider.dimensions * 4) return;
    const vector = Array.from({ length: provider.dimensions }, (_, offset) => bytes.readFloatLE(offset * 4));
    if (vector.some(value => !Number.isFinite(value)) || Math.abs(Math.hypot(...vector) - 1) > 0.01) return;
    vectors.set(chunkId, vector);
  }
  return vectors;
}
