import { constants } from "node:fs";
import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export const kitFiles = [
  "PORTFOLIO_AI_LICENSE",
  "components/portfolio-chat/chat-adapter.ts",
  "components/portfolio-chat/labels.ts",
  "components/portfolio-chat/portfolio-chat-panel.module.css",
  "components/portfolio-chat/portfolio-chat-panel.tsx",
  "lib/knowledge/contract.ts",
  "lib/knowledge/rendered.ts",
  "lib/portfolio-knowledge.ts",
  ...["b2", "click-handler", "core", "engine-config", "followups", "guardian", "handler", "language",
    "local-access", "origin", "provider", "request-body", "retrieval", "selection", "services", "session", "supabase", "timing"]
    .map(file => "lib/portfolio-chat/" + file + ".ts"),
  "scripts/portfolio-chat/dev-server.mjs",
  "scripts/portfolio-chat/doctor.mjs",
  "scripts/portfolio-knowledge/anonymous-browser.mjs",
  "scripts/portfolio-knowledge/publish.mts",
  "supabase/migrations/202611100001_vincent_ai_analytics.sql",
];

export async function copyPortfolioKit(destination) {
  for (const path of kitFiles) {
    const target = join(destination, path);
    try {
      await access(target);
      throw new Error("The host already contains " + path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const path of kitFiles) {
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, path), target, constants.COPYFILE_EXCL);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Provide the host portfolio directory");
  const destination = resolve(process.argv[2]);
  await access(join(destination, "package.json"));
  await copyPortfolioKit(destination);
  console.log("Copied Portfolio AI source files into " + destination);
}
