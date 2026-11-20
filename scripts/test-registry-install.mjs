import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const ref = process.env.PORTFOLIO_AI_REGISTRY_REF;
if (!/^[0-9a-f]{40}$/u.test(ref ?? "")) throw new Error("PORTFOLIO_AI_REGISTRY_REF must be a full published Git commit SHA");
const fixture = await mkdtemp(join(tmpdir(), "portfolio-ai-registry-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:PORTFOLIO_|QWEN_|SUPABASE_|OPENAI_|AI_GATEWAY_|VERCEL(?:_|$)|NEXT_PUBLIC_|POSTHOG_|NODE_OPTIONS$)/iu.test(key)));
env.PUPPETEER_SKIP_DOWNLOAD = "true";
async function run(command, args, cwd) {
  const windows = process.platform === "win32";
  const executable = windows && command !== process.execPath ? "cmd.exe" : command;
  const commandArgs = windows && command !== process.execPath ? ["/d", "/s", "/c", [command, ...args].join(" ")] : args;
  const child = spawn(executable, commandArgs, { cwd, env, stdio: "inherit", windowsHide: true });
  const [status] = await once(child, "exit");
  assert.equal(status, 0, `${command} ${args.join(" ")} failed`);
}
async function integrateColdStart(host) {
  // A human-approved fixture source list is represented by the second example's
  // configuration. This deterministic adaptation tests the documented manual
  // steps, not the behavior of a live coding agent.
  for (const file of ["portfolio-knowledge.config.ts", "portfolio-assistant.server.ts"]) {
    await copyFile(join(root, "tests/second-portfolio", file), join(host, file), 1);
  }
  await mkdir(join(host, "app/api/studio-assistant/click"), { recursive: true });
  await copyFile(join(host, ".portfolio-ai/templates/chat-route.ts"), join(host, "app/api/studio-assistant/route.ts"), 1);
  await copyFile(join(host, ".portfolio-ai/templates/click-route.ts"), join(host, "app/api/studio-assistant/click/route.ts"), 1);
  const layoutPath = join(host, "app/layout.tsx");
  const layout = await readFile(layoutPath, "utf8");
  const props = `config={{ ownerName: "Avery Park", supportedLanguages: ["en"], endpoint: "/api/studio-assistant", clickEndpoint: "/api/studio-assistant/click", publishedPaths: ["/", "/projects/orbit"], suggestions: { en: ["How was Orbit Garden tested?"] } }}`;
  assert.ok(layout.includes("{children}"));
  await writeFile(layoutPath, 'import { PortfolioChatPanel } from "../components/portfolio-chat/portfolio-chat-panel";\n' + layout.replace("{children}", `<PortfolioChatPanel ${props}>{children}</PortfolioChatPanel>`));
  const configPath = join(host, "next.config.ts");
  const config = await readFile(configPath, "utf8");
  assert.ok(config.includes("poweredByHeader: false"));
  await writeFile(configPath, config.replace("poweredByHeader: false", 'poweredByHeader: false, outputFileTracingIncludes: { "/api/studio-assistant": ["./.portfolio-knowledge/corpus.json", "./.next/BUILD_ID"], "/api/studio-assistant/click": ["./.portfolio-knowledge/corpus.json", "./.next/BUILD_ID"] }'));
  const packagePath = join(host, "package.json");
  const pkg = JSON.parse(await readFile(packagePath, "utf8"));
  assert.equal(pkg.scripts.build, "next build");
  pkg.scripts.build = "tsx scripts/portfolio-knowledge/publish.mts";
  await writeFile(packagePath, JSON.stringify(pkg, null, 2) + "\n");
}
try {
  for (const [name, source, test] of [
    ["atlas", "examples/atlas-portfolio", "scripts/test-atlas-integration.mjs"],
    ["second", "tests/second-portfolio", "scripts/test-second-integration.mjs"],
    ["cold", "tests/cold-start", "scripts/test-second-integration.mjs"],
  ]) {
    const host = join(fixture, name);
    await cp(join(root, source), host, { recursive: true, filter: async path => {
      if (/^(?:node_modules|\.git|\.next|\.portfolio-knowledge|\.vercel|private|exports)$/iu.test(basename(path)) ||
          /^\.env(?!\.example$)/iu.test(basename(path))) return false;
      const entry = await lstat(path);
      if (!entry.isFile() && !entry.isDirectory()) throw new Error("Fixture contains a symbolic link or special file");
      return true;
    } });
    let original;
    if (name === "cold") {
      const paths = ["AGENTS.md", "app/layout.tsx", "next.config.ts"];
      original = await Promise.all(paths.map(path => readFile(join(host, path), "utf8")));
      for (const path of ["portfolio-knowledge.config.ts", "portfolio-assistant.server.ts", "app/api/studio-assistant/route.ts", "components/portfolio-chat/portfolio-chat-panel.tsx"]) {
        await assert.rejects(lstat(join(host, path)), { code: "ENOENT" });
      }
    }
    await run("npx", ["-y", "shadcn@4.23.0", "add", `vincentlow02/portfolio-ai-source-kit/portfolio-ai#${ref}`, "--yes"], host);
    if (name === "cold") {
      assert.deepEqual(await Promise.all(["AGENTS.md", "app/layout.tsx", "next.config.ts"].map(path => readFile(join(host, path), "utf8"))), original);
      await integrateColdStart(host);
      assert.equal(await readFile(join(host, "AGENTS.md"), "utf8"), original[0]);
      const layout = await readFile(join(host, "app/layout.tsx"), "utf8");
      assert.ok(layout.includes("Cold start host header") && layout.includes("Cold start host footer"));
      assert.match(await readFile(join(host, "next.config.ts"), "utf8"), /poweredByHeader: false/u);
      console.log("Cold-start manual adaptations: approved manifest, server settings, routes, layout, tracing and build script.");
    }
    await run("npm", ["run", "build"], host);
    await run("npm", ["run", "typecheck"], host);
    for (const path of [test, "scripts/copy-portfolio-kit.mjs", "scripts/portfolio-chat/mock-atlas.cjs", "scripts/portfolio-chat/mock-second.cjs"]) {
      await copyFile(join(root, path), join(host, path));
    }
    await run(process.execPath, [join(host, test), host], host);
  }
  console.log("All three hosts passed GitHub registry installation and mock integration tests.");
} finally {
  const target = resolve(fixture);
  if (dirname(target) === resolve(tmpdir()) && basename(target).startsWith("portfolio-ai-registry-")) {
    await rm(target, { recursive: true, force: true, maxRetries: 4 });
  }
}
