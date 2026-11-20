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
async function run(command, args, cwd, extra = {}) {
  const windows = process.platform === "win32";
  const executable = windows && command !== process.execPath ? "cmd.exe" : command;
  const commandArgs = windows && command !== process.execPath ? ["/d", "/s", "/c", [command, ...args].join(" ")] : args;
  const child = spawn(executable, commandArgs, { cwd, env: { ...env, ...extra }, stdio: "inherit", windowsHide: true });
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
  const route = join(host, "app/api/studio-assistant/route.ts");
  const routeText = await readFile(route, "utf8");
  const adapterFixture = `import { configureModel } from "../../../lib/portfolio-chat/provider";\nimport type { PortfolioServices } from "../../../lib/portfolio-chat/services";\nconst adapters: Partial<PortfolioServices> = process.env.TEST_COLD_ADAPTERS === "1" ? {\n  modelProvider: { configure: env => { if (process.env.TEST_COLD_PROVIDER_FAILURE === "1") throw new Error("fixture failure"); const config = configureModel(env); return config && process.env.TEST_COLD_PROVIDER_REJECT === "1" ? { ...config, provider: "custom-fixture" } : config; }, allowsPublic: model => { if (process.env.TEST_COLD_PUBLIC_POLICY === "throw") throw new Error("fixture failure"); return process.env.TEST_COLD_PUBLIC_POLICY === "allow" && model.provider === "custom-fixture"; } },\n  quota: { reserve: async () => { if (process.env.TEST_SECOND_QUOTA_MODE === "unavailable") throw new Error("fixture failure"); if (process.env.TEST_SECOND_QUOTA_MODE === "invalid") return null as unknown as boolean; return process.env.TEST_SECOND_QUOTA_MODE !== "exhausted"; } },\n  analytics: { record: async () => { throw new Error("fixture failure"); } },\n} : {};\n`;
  assert.ok(routeText.includes("createPortfolioChatHandler(assistantConfig)"));
  await writeFile(route, adapterFixture + routeText.replace("createPortfolioChatHandler(assistantConfig)", "createPortfolioChatHandler(assistantConfig, adapters)"));
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
      const paths = ["AGENTS.md", "app/layout.tsx", "next.config.ts", ".agents/skills/host-existing/SKILL.md"];
      original = await Promise.all(paths.map(path => readFile(join(host, path), "utf8")));
      for (const path of ["portfolio-knowledge.config.ts", "portfolio-assistant.server.ts", "app/api/studio-assistant/route.ts", "components/portfolio-chat/portfolio-chat-panel.tsx"]) {
        await assert.rejects(lstat(join(host, path)), { code: "ENOENT" });
      }
    }
    await run("npx", ["-y", "shadcn@4.23.0", "add", `vincentlow02/portfolio-ai-source-kit/portfolio-ai#${ref}`, "--yes"], host);
    if (name === "cold") {
      assert.deepEqual(await Promise.all(["AGENTS.md", "app/layout.tsx", "next.config.ts", ".agents/skills/host-existing/SKILL.md"].map(path => readFile(join(host, path), "utf8"))), original);
      await integrateColdStart(host);
      assert.equal(await readFile(join(host, "AGENTS.md"), "utf8"), original[0]);
      assert.equal(await readFile(join(host, ".agents/skills/host-existing/SKILL.md"), "utf8"), original[3]);
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
    await run(process.execPath, [join(host, test), host], host, name === "cold" ? { TEST_COLD_ADAPTERS: "1" } : {});
  }
  const conflict = join(fixture, "conflict");
  await cp(join(root, "tests/cold-start"), conflict, { recursive: true });
  await mkdir(join(conflict, "components/portfolio-chat"), { recursive: true });
  await mkdir(join(conflict, ".agents/skills/portfolio-ai-install"), { recursive: true });
  const existingFile = join(conflict, "components/portfolio-chat/chat-adapter.ts");
  const existingSkill = join(conflict, ".agents/skills/portfolio-ai-install/SKILL.md");
  await writeFile(existingFile, "// existing host file\n");
  await writeFile(existingSkill, "existing owner skill\n");
  const address = `vincentlow02/portfolio-ai-source-kit/portfolio-ai#${ref}`;
  const windows = process.platform === "win32";
  const command = windows ? "cmd.exe" : "npx";
  const args = windows ? ["/d", "/s", "/c", `npx -y shadcn@4.23.0 add ${address} --yes`] : ["-y", "shadcn@4.23.0", "add", address, "--yes"];
  const child = spawn(command, args, { cwd: conflict, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let transcript = "";
  child.stdout.on("data", chunk => { transcript += chunk; });
  child.stderr.on("data", chunk => { transcript += chunk; });
  const timer = setTimeout(() => child.kill(), 180_000);
  const [status] = await once(child, "exit");
  clearTimeout(timer);
  assert.equal(status, 0);
  assert.match(transcript, /already exists.*overwrite/iu);
  assert.equal(await readFile(existingFile, "utf8"), "// existing host file\n");
  assert.equal(await readFile(existingSkill, "utf8"), "existing owner skill\n");
  await assert.rejects(lstat(join(conflict, "lib/portfolio-chat/handler.ts")), { code: "ENOENT" });
  const conflictPackage = JSON.parse(await readFile(join(conflict, "package.json"), "utf8"));
  assert.ok(conflictPackage.dependencies?.["@orama/orama"], "dependency installation should be recorded before the prompt");
  console.log("Noninteractive conflict reproduced: existing files preserved; exit status alone did not establish installation.");
  console.log("All three hosts passed GitHub registry installation and mock integration tests.");
} finally {
  const target = resolve(fixture);
  if (dirname(target) === resolve(tmpdir()) && basename(target).startsWith("portfolio-ai-registry-")) {
    await rm(target, { recursive: true, force: true, maxRetries: 4 });
  }
}
