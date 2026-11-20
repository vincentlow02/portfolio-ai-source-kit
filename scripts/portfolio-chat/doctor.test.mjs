import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { diagnose } from "./doctor.mjs";

test("doctor reports readiness without using or exposing credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "portfolio-doctor-"));
  const canary = "secret-canary-should-never-appear";
  try {
    const files = ["components/portfolio-chat/portfolio-chat-panel.tsx", "lib/portfolio-chat/handler.ts", "scripts/portfolio-knowledge/publish.mts", "portfolio-knowledge.config.ts", "portfolio-assistant.server.ts", "app/api/studio-assistant/route.ts"];
    for (const path of files) { await mkdir(join(root, path, ".."), { recursive: true }); await writeFile(join(root, path), "fixture"); }
    await mkdir(join(root, ".next"), { recursive: true });
    await mkdir(join(root, ".portfolio-knowledge"), { recursive: true });
    await writeFile(join(root, ".next/BUILD_ID"), "fixture-build");
    await writeFile(join(root, ".portfolio-knowledge/corpus.json"), JSON.stringify({schemaVersion:1,siteBuildId:"fixture-build",contentHash:"fixture-hash",pages:[{}],chunks:[{}]}));
    const env = { QWEN_API_KEY:canary, QWEN_BASE_URL:"https://fixture.invalid/v1", SUPABASE_URL:"https://fixture.supabase.co", SUPABASE_SECRET_KEY:"sb_secret_"+canary,
      PORTFOLIO_AI_QUOTA_PER_MINUTE:"10", PORTFOLIO_AI_QUOTA_PER_DAY:"20", PORTFOLIO_AI_DAILY_BUDGET_USD:"2", PORTFOLIO_AI_INPUT_USD_PER_MILLION:"1", PORTFOLIO_AI_OUTPUT_USD_PER_MILLION:"1" };
    const checks = await diagnose(root, env);
    assert.deepEqual(checks.map(item => item.status), ["present", "build-matched", "configured-locally", "configured-locally", "public-disabled"]);
    assert.ok(!JSON.stringify(checks).includes(canary));
    const output = await promisify(execFile)(process.execPath, [fileURLToPath(new URL("./doctor.mjs", import.meta.url))], {cwd:root, env:{...process.env,...env}});
    assert.ok(!(`${output.stdout}${output.stderr}`).includes(canary));
    assert.match(output.stdout, /No network requests were made/u);
    assert.equal((await diagnose(root, {...env,PORTFOLIO_AI_PROVIDER:"openai",OPENAI_API_KEY:canary,PORTFOLIO_AI_PUBLIC_ENABLED:"1"}))[2].status, "configured-locally");
    assert.equal((await diagnose(root, {...env,PORTFOLIO_AI_PROVIDER:"openai",OPENAI_API_KEY:canary,PORTFOLIO_AI_MODEL:"unverified-model",PORTFOLIO_AI_PUBLIC_ENABLED:"1"}))[2].status, "missing-or-unsupported");
    assert.equal((await diagnose(root, {...env,PORTFOLIO_AI_DAILY_BUDGET_USD:"0.001"}))[3].status, "missing-or-invalid");
    await writeFile(join(root, ".next/BUILD_ID"), "other-build");
    assert.equal((await diagnose(root, env))[1].status, "missing-or-stale");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("doctor does not claim readiness for unresolved variables or unsafe public origin", async () => {
  const root = await mkdtemp(join(tmpdir(), "portfolio-doctor-"));
  try {
    await writeFile(join(root, ".env.local"), 'QWEN_API_KEY=$MY_KEY\nQWEN_BASE_URL=https://fixture.invalid/v1\nPORTFOLIO_AI_PUBLIC_ENABLED=1\nPORTFOLIO_AI_PUBLIC_ORIGIN=http://fixture.invalid\n');
    const checks = await diagnose(root, {});
    assert.equal(checks[2].status, "missing-or-unsupported");
    assert.equal(checks[4].status, "invalid-public-origin");
  } finally { await rm(root, { recursive: true, force: true }); }
});
