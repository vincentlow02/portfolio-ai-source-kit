import { readFile } from "node:fs/promises";
import { join, toNamespacedPath } from "node:path";
import { Tokenizer } from "@huggingface/tokenizers";
import { InferenceSession, Tensor } from "onnxruntime-node";

const maximumTokens = 512;

async function loadEncoder() {
  const directory = join(process.cwd(), ".portfolio-knowledge/embedding-model");
  const [tokenizerJson, tokenizerConfig] = await Promise.all([
    readFile(join(directory, "tokenizer.json"), "utf8").then(text => JSON.parse(text)),
    readFile(join(directory, "tokenizer_config.json"), "utf8").then(text => JSON.parse(text)),
  ]);
  const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
  const padding = BigInt(tokenizer.token_to_id(tokenizerConfig.pad_token)!);
  const session = await InferenceSession.create(toNamespacedPath(join(directory, "model_quantized.onnx")), {
    executionProviders: ["cpu"], intraOpNumThreads: 2, interOpNumThreads: 1,
  });
  return { tokenizer, padding, session };
}

let encoder: ReturnType<typeof loadEncoder> | undefined;

export async function embedTexts(texts: string[]) {
  encoder ??= loadEncoder().catch(error => { encoder = undefined; throw error; });
  const { tokenizer, padding, session } = await encoder;
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
