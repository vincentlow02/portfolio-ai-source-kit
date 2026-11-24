import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { copyFile, cp, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const local = process.argv.includes("--local");
const ref = process.env.PORTFOLIO_AI_REGISTRY_REF;
if (!local && !/^[0-9a-f]{40}$/u.test(ref ?? "")) throw new Error("PORTFOLIO_AI_REGISTRY_REF must be a full published Git commit SHA");
const fixture = await mkdtemp(join(tmpdir(), "portfolio-ai-registry-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:PORTFOLIO_|QWEN_|SUPABASE_|OPENAI_|AI_GATEWAY_|VERCEL(?:_|$)|NEXT_PUBLIC_|POSTHOG_|NODE_OPTIONS$)/iu.test(key)));
env.PUPPETEER_SKIP_DOWNLOAD = "true";
env.ONNXRUNTIME_NODE_INSTALL_CUDA = "skip";
async function run(command, args, cwd) {
  const windows = process.platform === "win32";
  const executable = windows && command !== process.execPath ? "cmd.exe" : command;
  const commandArgs = windows && command !== process.execPath ? ["/d", "/s", "/c", [command, ...args].join(" ")] : args;
  const child = spawn(executable, commandArgs, { cwd, env, stdio: "inherit", windowsHide: true });
  const [status] = await once(child, "exit");
  assert.equal(status, 0, `${command} ${args.join(" ")} failed`);
}
let registry;
try {
  let sourceUrl = `vincentlow02/portfolio-ai-source-kit/portfolio-ai#${ref}`;
  if (local) {
    const output = join(fixture, "registry");
    await run("npx", ["-y", "shadcn@4.23.0", "build", "--output", output], root);
    const item = await readFile(join(output, "portfolio-ai.json"));
    registry = createServer((request, response) => {
      if (request.url === "/portfolio-ai.json") {
        response.setHeader("Content-Type", "application/json");
        response.end(item);
      } else {
        response.statusCode = 404;
        response.end();
      }
    });
    registry.listen(0, "127.0.0.1");
    await once(registry, "listening");
    sourceUrl = `http://127.0.0.1:${registry.address().port}/portfolio-ai.json`;
  }
  for (const [name, source, test] of [
    ["atlas", "examples/atlas-portfolio", "scripts/test-atlas-integration.mjs"],
    ["second", "tests/second-portfolio", "scripts/test-second-integration.mjs"],
  ]) {
    const host = join(fixture, name);
    await cp(join(root, source), host, { recursive: true, filter: async path => {
      if (/^(?:node_modules|\.git|\.next|\.portfolio-knowledge|\.vercel|private|exports)$/iu.test(basename(path)) ||
          /^\.env(?!\.example$)/iu.test(basename(path))) return false;
      const entry = await lstat(path);
      if (!entry.isFile() && !entry.isDirectory()) throw new Error("Fixture contains a symbolic link or special file");
      return true;
    } });
    await run("npx", ["-y", "shadcn@4.23.0", "add", sourceUrl, "--yes"], host);
    await run("npm", ["run", "build"], host);
    await run("npm", ["run", "typecheck"], host);
    for (const path of [test, "scripts/copy-portfolio-kit.mjs", "scripts/portfolio-chat/mock-atlas.cjs", "scripts/portfolio-chat/mock-second.cjs"]) {
      await copyFile(join(root, path), join(host, path));
    }
    await run(process.execPath, [join(host, test), host], host);
  }
  console.log(`Both independent hosts passed the ${local ? "local" : "GitHub"} registry installation and mock integration tests.`);
} finally {
  if (registry?.listening) await new Promise(resolve => registry.close(resolve));
  const target = resolve(fixture);
  if (dirname(target) === resolve(tmpdir()) && basename(target).startsWith("portfolio-ai-registry-")) {
    await rm(target, { recursive: true, force: true, maxRetries: 4 });
  }
}
