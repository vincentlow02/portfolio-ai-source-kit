import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyPortfolioKit } from "./copy-portfolio-kit.mjs";
import { launchBrowser } from "./portfolio-knowledge/anonymous-browser.mjs";

const sample = new URL("../examples/atlas-portfolio/", import.meta.url);
const mockPath = fileURLToPath(new URL("./portfolio-chat/mock-atlas.cjs", import.meta.url)).replaceAll("\\", "/");
const fixtureEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:PORTFOLIO_|QWEN_|SUPABASE_|OPENAI_|AI_GATEWAY_|VERCEL(?:_|$)|NEXT_PUBLIC_|POSTHOG_|NODE_OPTIONS$)/iu.test(key)));
const env = {
  ...fixtureEnv,
  NODE_ENV: undefined,
  VERCEL: undefined, VERCEL_ENV: undefined,
  PORTFOLIO_AI_PUBLIC_ENABLED: "0", PORTFOLIO_AI_PROTECTED_PREVIEW: "0",
  PORTFOLIO_AI_LOCAL_DEV: "1", PORTFOLIO_AI_LOOPBACK_BOUND: "1",
  PORTFOLIO_AI_ACCESS_TOKEN: "atlas-fixture-no-external-access-token",
  PORTFOLIO_AI_PROVIDER: "qwen", QWEN_MODEL: "qwen3.7-flash", QWEN_JSON_MODE: "schema",
  QWEN_BASE_URL: "https://atlas-model.invalid/v1", QWEN_API_KEY: "fixture-only",
  SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_atlas_fixture",
  TEST_ATLAS_QUOTA_MODE: undefined,
  PORTFOLIO_AI_QUOTA_PER_MINUTE: "10", PORTFOLIO_AI_QUOTA_PER_DAY: "20",
  PORTFOLIO_AI_DAILY_BUDGET_USD: "2", PORTFOLIO_AI_INPUT_USD_PER_MILLION: "1", PORTFOLIO_AI_OUTPUT_USD_PER_MILLION: "1",
  NODE_OPTIONS: '--require="' + mockPath + '"',
};

const host = process.argv[2] ?? await mkdtemp(join(tmpdir(), "portfolio-ai-atlas-"));
const fresh = !process.argv[2];

async function start(mode, overrides = {}) {
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", mode, "--hostname", "127.0.0.1", "--port", "0"],
    { cwd: host, env: {...env, ...overrides}, stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  try {
    const origin = await new Promise((resolve, reject) => {
      const fail = error => { clearTimeout(timer); reject(error); };
      const timer = setTimeout(() => fail(new Error("Atlas did not start")), 45_000);
      let output = "";
      app.stdout.on("data", chunk => {
        output = (output + chunk).slice(-4000);
        const url = output.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/u)?.[1];
        if (url && /Ready in/u.test(output)) { clearTimeout(timer); resolve(url); }
      });
      app.once("error", fail);
      app.once("exit", code => fail(new Error("Atlas exited with " + code)));
    });
    return { app, origin };
  } catch (error) {
    app.kill();
    throw error;
  }
}
async function stop(app) {
  if (app.exitCode === null && app.signalCode === null) {
    const stopped = once(app, "exit");
    app.kill();
    await stopped;
  }
}
async function cli(args) {
  const child = spawn(process.execPath, args, { cwd: host, env, stdio: "inherit", windowsHide: true });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error("Failed: " + args.join(" "));
}
function call(origin, question, extras, authorized = true) {
  return fetch(origin + "/api/studio-assistant", { method: "POST",
    headers: { "content-type": "application/json", ...(authorized ? { authorization: "Bearer " + env.PORTFOLIO_AI_ACCESS_TOKEN } : {}) },
    body: JSON.stringify({ messages: [{ role: "user", content: question }], ...extras }),
    signal: AbortSignal.timeout(45_000),
  });
}

try {
  if (fresh) {
    await cp(sample, host, { recursive: true, filter: async path => {
      if (/^(?:node_modules|\.git|\.next|\.portfolio-knowledge|\.vercel|private|exports)$/iu.test(basename(path)) ||
          /^\.env(?!\.example$)/iu.test(basename(path))) return false;
      const entry = await lstat(path);
      if (!entry.isFile() && !entry.isDirectory()) throw new Error("Atlas fixture must not contain symbolic links or special files");
      return true;
    } });
    await copyPortfolioKit(host);
    const isWindows = process.platform === "win32";
    const child = spawn(isWindows ? "cmd.exe" : "npm", isWindows ? ["/d", "/s", "/c", "npm ci --no-audit --no-fund"] : ["ci", "--no-audit", "--no-fund"], {
      cwd: host, env: { ...fixtureEnv, PUPPETEER_SKIP_DOWNLOAD: "true" }, stdio: "inherit", windowsHide: true,
    });
    const [status] = await once(child, "exit");
    assert.equal(status, 0, "independent npm ci");
    await cli(["node_modules/tsx/dist/cli.mjs", "scripts/portfolio-knowledge/publish.mts"]);
    await cli(["node_modules/next/dist/bin/next", "typegen"]);
    await cli(["node_modules/typescript/bin/tsc", "--noEmit"]);
  }
  const corpus = JSON.parse(await readFile(join(host, ".portfolio-knowledge", "corpus.json"), "utf8"));
  assert.equal(corpus.pages.length, 4);
  assert.ok(corpus.chunks.some(chunk => chunk.sourceUrl === "/work/lantern#research"));
  assert.ok(!JSON.stringify(corpus.chunks).includes("undisclosed"));
  assert.deepEqual(corpus.report.exclusions, [{ pathname: "/work/undisclosed", reason: "protected" }]);

  const production = await start("start");
  try {
    const origin = production.origin;
    const pageContext = { pathname: "/work/lantern", lang: "en" };
    assert.equal((await call(origin, "Tell me about Lantern", { pageContext }, false)).status, 401);
    assert.equal((await call(origin, "Tell me about Lantern", { pageContext: { pathname: "/work/undisclosed", lang: "en" } })).status, 400);
    const quote = { pagePath: "/work/lantern", text: "The team tested tactile signs at six libraries.", sectionId: "research" };
    assert.equal((await call(origin, "What are the tactile signs?", { pageContext, selectionContext: { ...quote, text: "An invented passage" } })).status, 400);
    const reply = await call(origin, "Which libraries tested tactile signs?", { pageContext, selectionContext: quote });
    assert.equal(reply.status, 200);
    const answer = await reply.json();
    assert.match(answer.answer, /six libraries/u);
    assert.ok(answer.sources.some(source => source.url === "/work/lantern#research"));
    const comparison = await call(origin, "How does this project compare to Signal?", { pageContext });
    assert.equal(comparison.status, 200);
    const compared = await comparison.json();
    assert.equal(compared.insufficient, false);
    assert.deepEqual(new Set(compared.sources.map(source => source.projectId)), new Set(["lantern", "signal"]));
    const listed = await (await call(origin, "What projects has Morgan worked on?", {})).json();
    assert.equal(listed.insufficient, false);
    assert.deepEqual(new Set(listed.sources.map(source => source.projectId)), new Set(["lantern", "signal"]));
    assert.equal((await fetch(origin + "/.portfolio-knowledge/corpus.json")).status, 404);
    const declined = await (await call(origin, "Tell me about waterfalls in Antarctica", { pageContext: { pathname: "/", lang: "en" } })).json();
    assert.equal(declined.insufficient, true);
    assert.equal(declined.sources.length, 0);
    console.log("Independent production route passed authorization, privacy, highlight validation, two-project citations and insufficient-evidence checks.");
  } finally { await stop(production.app); }

  for (const [quotaMode, expectedStatus] of [["exhausted",429],["unavailable",503]]) {
    const quota = await start("start", {TEST_ATLAS_QUOTA_MODE:quotaMode});
    try {
      assert.equal((await call(quota.origin,"Tell me about Lantern",{})).status,expectedStatus);
    } finally { await stop(quota.app); }
  }
  console.log("Shared quota exhaustion and service errors fail closed without a model call.");

  const openaiEnv = { PORTFOLIO_AI_PROVIDER: "openai", OPENAI_API_KEY: "fixture-only", PORTFOLIO_AI_MODEL: "gpt-4o-mini" };
  const openai = await start("start", openaiEnv);
  try {
    const response = await call(openai.origin, "How did Lantern test tactile signs?", { pageContext: { pathname: "/work/lantern", lang: "en" } });
    assert.equal(response.status, 200);
    const answer = await response.json();
    assert.match(answer.answer, /six libraries/u);
    assert.ok(answer.sources.some(source => source.url === "/work/lantern#research"));
  } finally { await stop(openai.app); }
  for (const [extra, status] of [[{TEST_ATLAS_QUOTA_MODE:"unavailable"},503], [{TEST_OPENAI_MODE:"invalid"},502]]) {
    const app = await start("start", {...openaiEnv,...extra});
    try { assert.equal((await call(app.origin,"Tell me about Lantern",{})).status,status); } finally { await stop(app.app); }
  }
  console.log("OpenAI mock passed protected evaluation, citations, invalid output and quota failure checks.");

  const concurrency = await start("start");
  try {
    const pending = [call(concurrency.origin, "Cancellation fixture one", {}), call(concurrency.origin, "Cancellation fixture two", {})];
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal((await call(concurrency.origin, "A third simultaneous request", {})).status, 429);
    assert.deepEqual((await Promise.all(pending)).map(response => response.status), [200,200]);
    assert.equal((await call(concurrency.origin, "Tell me about Lantern", {})).status, 200);
    console.log("Concurrent request limit and recovery passed with the fake provider.");
  } finally { await stop(concurrency.app); }

  const development = await start("dev");
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 950 });
    await page.goto(development.origin + "/work/lantern", { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForSelector('button[aria-label="Open Morgan Reed AI"]', { visible: true, timeout: 30_000 });
    await page.evaluate(() => {
      const paragraph = document.querySelector("#research p");
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    const highlight = await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim() === "Ask Morgan Reed AI"), { timeout: 12_000 });
    await highlight.asElement().click();
    assert.match(await page.$eval("aside", node => node.innerText), /tested tactile signs/u);
    await page.type("aside textarea", "What are the tactile signs?");
    await page.click('aside button[aria-label="Send message"]');
    await page.waitForFunction(() => document.querySelector("aside")?.innerText.includes("The Lantern team tested tactile signs at six libraries."), { timeout: 45_000 });
    await page.click("aside summary");
    await page.waitForSelector('aside a[href="/work/lantern#research"]');
    await page.click('aside a[href="/work/lantern#research"]');
    await page.waitForFunction(() => location.hash === "#research");
    await page.click('aside button[aria-label="What did the Lantern team test?"]');
    await page.waitForFunction(() => document.querySelectorAll('aside [aria-label="Morgan Reed AI response"]').length === 2, { timeout: 45_000 });
    assert.match(await page.$eval("aside", node => node.innerText), /six libraries/u);
    await page.type("aside textarea", "Cancellation fixture");
    await page.click('aside button[aria-label="Send message"]');
    const cancel = await page.waitForFunction(() => Array.from(document.querySelectorAll("aside button")).find(button => button.textContent.trim() === "Cancel"));
    await cancel.asElement().click();
    assert.equal(await page.$("aside [role='status']"), null);
    await page.type("aside textarea", "How did the Lantern team test tactile signs?");
    await page.click('aside button[aria-label="Send message"]');
    await page.waitForFunction(() => document.querySelectorAll('aside [aria-label="Morgan Reed AI response"]').length === 3, { timeout: 45_000 });
    console.log("Independent browser passed highlight-to-ask, source navigation, follow-up, cancellation and recovery.");
  } finally {
    try { await browser?.close(); } finally { await stop(development.app); }
  }
} finally {
  const target = resolve(host);
  if (fresh && dirname(target) === resolve(tmpdir()) && basename(target).startsWith("portfolio-ai-atlas-")) {
    await rm(target, { recursive: true, force: true, maxRetries: 4 });
  }
}
