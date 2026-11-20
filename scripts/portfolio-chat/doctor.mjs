#!/usr/bin/env node
// Static checks only: this command never contacts a model, database or website.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function read(path) { try { return await readFile(path, "utf8"); } catch { return null; } }
function localEnv(text) {
  const result = {};
  for (const line of (text ?? "").split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/u, "").trim();
    result[match[1]] = value;
  }
  return result;
}
function set(env, name) { const value = env[name]?.trim(); return !!value && !value.includes("$"); }
function positive(env, name) { const value = Number(env[name]); return set(env, name) && Number.isFinite(value) && value > 0; }
function httpsUrl(value, supabase = false) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash &&
      (!supabase || (url.hostname.endsWith(".supabase.co") && url.pathname === "/"));
  } catch { return false; }
}

export async function diagnose(root, processEnv = process.env) {
  const env = { ...localEnv(await read(join(root, ".env.local"))), ...processEnv };
  const checks = [];
  const report = (name, status, detail) => checks.push({ name, status, detail });
  const installed = ["components/portfolio-chat/portfolio-chat-panel.tsx", "lib/portfolio-chat/handler.ts",
    "scripts/portfolio-knowledge/publish.mts", "portfolio-knowledge.config.ts", "portfolio-assistant.server.ts"];
  const present = await Promise.all(installed.map(path => read(join(root, path))));
  const appRoute = await read(join(root, "app/api/studio-assistant/route.ts")) ?? await read(join(root, "src/app/api/studio-assistant/route.ts"));
  report("installation", present.every(x => x !== null) && appRoute !== null ? "present" : "incomplete",
    "Checks standard kit files and the example chat route; custom paths require manual review.");
  const corpusText = await read(join(root, ".portfolio-knowledge/corpus.json"));
  const buildId = (await read(join(root, ".next/BUILD_ID")))?.trim();
  let corpus;
  try { corpus = JSON.parse(corpusText ?? "null"); } catch { /* invalid corpus */ }
  report("corpus", corpus?.schemaVersion === 1 && buildId && corpus.siteBuildId === buildId && typeof corpus.contentHash === "string" && corpus.contentHash.length > 0 && Array.isArray(corpus.pages) && corpus.pages.length > 0 && Array.isArray(corpus.chunks) && corpus.chunks.length > 0 ? "build-matched" : "missing-or-stale",
    "A matching build ID is necessary but does not establish source approval, privacy or citation quality.");
  const provider = env.PORTFOLIO_AI_PROVIDER?.trim() || "qwen";
  let providerReady = false;
  if (provider === "qwen") providerReady = set(env, "QWEN_API_KEY") && set(env, "QWEN_BASE_URL") && httpsUrl(env.QWEN_BASE_URL) &&
    !/(?:^|[.-])(?:coding|token-plan)(?:[.-]|$)/iu.test(new URL(env.QWEN_BASE_URL).hostname) &&
    !env.QWEN_API_KEY.trim().startsWith("sk-sp-") && !/\/chat\/completions\/?$/iu.test(new URL(env.QWEN_BASE_URL).pathname) &&
    ["schema", "object"].includes(env.QWEN_JSON_MODE?.trim() || "schema") &&
    ["", "true", "false"].includes(env.QWEN_ENABLE_THINKING?.trim() || "");
  else if (provider === "openai") providerReady = set(env, "OPENAI_API_KEY");
  else if (provider === "gateway") providerReady = set(env, "AI_GATEWAY_API_KEY");
  const publicMode = env.PORTFOLIO_AI_PUBLIC_ENABLED === "1" || env.PORTFOLIO_AI_PROTECTED_PREVIEW === "1";
  if (publicMode && !((provider === "qwen" && /^qwen3\.7-flash(?:-\d{4}-\d{2}-\d{2})?$/u.test(env.QWEN_MODEL?.trim() || "qwen3.7-flash")) ||
      (provider === "openai" && (env.PORTFOLIO_AI_MODEL?.trim() || "gpt-4o-mini") === "gpt-4o-mini"))) providerReady = false;
  report("provider", providerReady ? "configured-locally" : "missing-or-unsupported", "Static configuration only; credentials, model support and connectivity were not tested.");
  const minute = Number(env.PORTFOLIO_AI_QUOTA_PER_MINUTE), day = Number(env.PORTFOLIO_AI_QUOTA_PER_DAY);
  const budget = Number(env.PORTFOLIO_AI_DAILY_BUDGET_USD), input = Number(env.PORTFOLIO_AI_INPUT_USD_PER_MILLION), output = Number(env.PORTFOLIO_AI_OUTPUT_USD_PER_MILLION);
  const reservation = Math.ceil((100000 * input + 700 * output) * 1000000 / 1000000) / 1000000;
  const quotaReady = set(env, "SUPABASE_URL") && httpsUrl(env.SUPABASE_URL, true) && set(env, "SUPABASE_SECRET_KEY") &&
    /^(?:sb_secret_|eyJ)/u.test(env.SUPABASE_SECRET_KEY.trim()) && Number.isInteger(minute) && minute >= 1 && minute <= 10000 &&
    Number.isInteger(day) && day >= 1 && day <= 1000000 && ["PORTFOLIO_AI_DAILY_BUDGET_USD", "PORTFOLIO_AI_INPUT_USD_PER_MILLION", "PORTFOLIO_AI_OUTPUT_USD_PER_MILLION"].every(key => positive(env, key)) &&
    Number.isFinite(reservation) && reservation <= budget;
  report("quota", quotaReady ? "configured-locally" : "missing-or-invalid", "Static configuration only; migration, atomic reservations and database access were not tested.");
  const originReady = env.PORTFOLIO_AI_PUBLIC_ENABLED !== "1" || (set(env, "PORTFOLIO_AI_PUBLIC_ORIGIN") && httpsUrl(env.PORTFOLIO_AI_PUBLIC_ORIGIN) && new URL(env.PORTFOLIO_AI_PUBLIC_ORIGIN).pathname === "/");
  report("safety", !originReady ? "invalid-public-origin" : publicMode ? "review-required" : "public-disabled",
    "Review approved sources, protection, actual deployment access, abuse limits and citations manually; an origin check is not authentication.");
  return checks;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checks = await diagnose(process.cwd());
  for (const check of checks) console.log(`${check.name}: ${check.status} — ${check.detail}`);
  console.log("No network requests were made. No credentials or content were displayed.");
}
