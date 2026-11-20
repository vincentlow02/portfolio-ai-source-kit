import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./portfolio-knowledge/anonymous-browser.mjs";

const host = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Provide the installed second portfolio directory");
const mock = fileURLToPath(new URL("./portfolio-chat/mock-second.cjs", import.meta.url)).replaceAll("\\", "/");
const fixtureEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:PORTFOLIO_|QWEN_|SUPABASE_|OPENAI_|AI_GATEWAY_|VERCEL(?:_|$)|NEXT_PUBLIC_|POSTHOG_|NODE_OPTIONS$)/iu.test(key)));
const env = { ...fixtureEnv, PORTFOLIO_AI_PUBLIC_ENABLED: "0", PORTFOLIO_AI_LOCAL_DEV: "1", PORTFOLIO_AI_LOOPBACK_BOUND: "1",
  PORTFOLIO_AI_ACCESS_TOKEN: "second-fixture-no-external-access-token", PORTFOLIO_AI_PROVIDER: "qwen", QWEN_MODEL: "qwen3.7-flash",
  QWEN_JSON_MODE: "schema", QWEN_BASE_URL: "https://second-model.invalid/v1", QWEN_API_KEY: "fixture-only",
  SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_atlas_fixture", PORTFOLIO_AI_QUOTA_PER_MINUTE: "10",
  PORTFOLIO_AI_QUOTA_PER_DAY: "20", PORTFOLIO_AI_DAILY_BUDGET_USD: "2", PORTFOLIO_AI_INPUT_USD_PER_MILLION: "1",
  PORTFOLIO_AI_OUTPUT_USD_PER_MILLION: "1", NODE_OPTIONS: '--require="' + mock + '"' };
async function start(mode, extra = {}) {
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", mode, "--hostname", "127.0.0.1", "--port", "0"],
    { cwd: host, env: { ...env, ...extra }, stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Second portfolio did not start")), 45_000);
      let text = "";
      app.stdout.on("data", chunk => { text = (text + chunk).slice(-4000); const url = text.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/u)?.[1];
        if (url && /Ready in/u.test(text)) { clearTimeout(timer); resolve(url); } });
      app.once("error", reject); app.once("exit", code => reject(new Error("Second portfolio exited: " + code)));
    });
    return { app, origin };
  } catch (error) { app.kill(); throw error; }
}
async function stop(app) { if (app.exitCode === null && app.signalCode === null) { const exit = once(app, "exit"); app.kill(); await exit; } }
function call(origin, extras = {}, authorized = true) {
  return fetch(origin + "/api/studio-assistant", { method: "POST", headers: { "content-type": "application/json",
    ...(authorized ? { authorization: "Bearer " + env.PORTFOLIO_AI_ACCESS_TOKEN } : {}) },
    body: JSON.stringify({ messages: [{ role: "user", content: "How was Orbit Garden tested?" }], ...extras }), signal: AbortSignal.timeout(45_000) });
}
const corpus = JSON.parse(await readFile(resolve(host, ".portfolio-knowledge/corpus.json"), "utf8"));
assert.ok(!JSON.stringify(corpus).includes("Private fixture sentinel"));
assert.ok(corpus.chunks.some(chunk => chunk.sourceUrl.startsWith("/projects/orbit")));
const prod = await start("start");
try {
  assert.equal((await call(prod.origin, {}, false)).status, 401);
  assert.equal((await call(prod.origin, { pageContext: { pathname: "/drafts", lang: "en" } })).status, 400);
  const response = await call(prod.origin, { pageContext: { pathname: "/projects/orbit", lang: "en" } });
  assert.equal(response.status, 200);
  const answer = await response.json();
  assert.match(answer.answer, /twelve visitors/u);
  assert.ok(answer.sources.some(source => source.url.startsWith("/projects/orbit")));
  assert.equal((await fetch(prod.origin + "/.portfolio-knowledge/corpus.json")).status, 404);
} finally { await stop(prod.app); }
for (const [mode, status] of [["exhausted", 429], ["unavailable", 503]]) {
  const quota = await start("start", { TEST_SECOND_QUOTA_MODE: mode });
  try { assert.equal((await call(quota.origin)).status, status); } finally { await stop(quota.app); }
}
if (process.env.TEST_COLD_ADAPTERS === "1") {
  const failedProvider = await start("start", { TEST_COLD_PROVIDER_FAILURE: "1" });
  try { assert.equal((await call(failedProvider.origin)).status, 503); } finally { await stop(failedProvider.app); }
  console.log("Custom model and quota adapters fail closed; analytics failure does not block chat.");
}
const dev = await start("dev");
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812 });
  await page.goto(dev.origin + "/projects/orbit", { waitUntil: "networkidle0", timeout: 60_000 });
  await page.click('button[aria-label="Open Avery Park AI"]');
  await page.type("aside textarea", "How was Orbit Garden tested?");
  await page.click('aside button[aria-label="Send message"]');
  await page.waitForFunction(() => document.querySelector("aside")?.innerText.includes("twelve visitors"), { timeout: 45_000 });
  await page.click("aside summary");
  await page.waitForSelector('aside a[href^="/projects/orbit"]');
  await page.click('aside button[aria-label="Reset conversation"]');
  console.log("Second portfolio passed mobile chat, reset, citations, protected content, authorization and fail-closed quota tests.");
} finally { try { await browser?.close(); } finally { await stop(dev.app); } }
