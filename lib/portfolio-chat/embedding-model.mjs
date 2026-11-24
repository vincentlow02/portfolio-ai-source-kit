import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

export const embeddingModelDirectory = ".portfolio-knowledge/embedding-model";
const modelUrl = new URL("https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/2c4055b12046f11709e9df2c122e59ffbdc2f900/");
const assets = [
  ["tokenizer_config.json", "tokenizer_config.json", "3f5961b9ac86288cccdb97f32fb848d6187c78e1603958c53f3ea1f296b7d8a2"],
  ["tokenizer.json", "tokenizer.json", "b60b6b43406a48bf3638526314f3d232d97058bc93472ff2de930d43686fa441"],
  ["onnx/model_quantized.onnx", "model_quantized.onnx", "66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc"],
];

const nativeBinaries = "./node_modules/onnxruntime-node/bin/napi-v3";
export const embeddingTraceIncludes = [
  ...assets.map(([, name]) => `./${embeddingModelDirectory}/${name}`),
  `${nativeBinaries}/${process.platform}/${process.arch}/*`,
];
export const embeddingTraceExcludes = [
  `${nativeBinaries}/!(${process.platform})/**/*`,
  `${nativeBinaries}/${process.platform}/!(${process.arch})/**/*`,
  `${nativeBinaries}/**/*{cuda,tensorrt}*`,
];

async function hasChecksum(file, checksum) {
  const hash = createHash("sha256");
  try {
    for await (const chunk of createReadStream(file)) hash.update(chunk);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  return hash.digest("hex") === checksum;
}

export async function prepareEmbeddingModel(root = process.cwd()) {
  const directory = join(root, embeddingModelDirectory);
  await mkdir(directory, { recursive: true });
  for (const [source, name, checksum] of assets) {
    const output = join(directory, name);
    if (await hasChecksum(output, checksum)) continue;
    const temporary = join(directory, `${randomUUID()}.part`);
    console.log(`Downloading retrieval model file ${name}...`);
    const response = await fetch(new URL(source, modelUrl), { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error(`Unable to download ${name} (HTTP ${response.status})`);
    try {
      await pipeline(response.body, createWriteStream(temporary, { flags: "wx" }));
      if (!await hasChecksum(temporary, checksum)) throw new Error(`Checksum mismatch for ${name}`);
      await rename(temporary, output).catch(async error => {
        if (!await hasChecksum(output, checksum)) throw error;
      });
    } finally {
      await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  }
}
