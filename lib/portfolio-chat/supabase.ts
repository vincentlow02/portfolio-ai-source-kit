import "server-only";

type Environment = Record<string, string | undefined>;
export type AnalyticsEvent = {
  session_id: string;
  event_type: "chat" | "recommendation_click";
  page_path: string;
  project_id?: string | null;
  question_category?: "about" | "project" | "comparison" | "other" | null;
  answer_status?: "answered" | "insufficient" | "clarification" | "error" | null;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  latency_ms?: number | null;
};

function config(env: Environment) {
  const key = env.SUPABASE_SECRET_KEY?.trim();
  const url = new URL(env.SUPABASE_URL ?? "");
  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !key || (!key.startsWith("sb_secret_") && !key.startsWith("eyJ"))) throw new Error("Invalid Supabase configuration");
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return { url, headers };
}

export async function supabasePost(env: Environment, endpoint: string, body: object): Promise<Response> {
  const { url, headers } = config(env);
  return fetch(new URL(endpoint, url), { method: "POST", headers, body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000) });
}

export async function reserveQuota(env: Environment): Promise<boolean> {
  const minute = Number(env.PORTFOLIO_AI_QUOTA_PER_MINUTE), day = Number(env.PORTFOLIO_AI_QUOTA_PER_DAY);
  const budget = Number(env.PORTFOLIO_AI_DAILY_BUDGET_USD), inputPrice = Number(env.PORTFOLIO_AI_INPUT_USD_PER_MILLION), outputPrice = Number(env.PORTFOLIO_AI_OUTPUT_USD_PER_MILLION);
  if (!Number.isInteger(minute) || minute < 1 || minute > 10000 || !Number.isInteger(day) || day < 1 || day > 1000000 || !Number.isFinite(budget) || budget <= 0 || !Number.isFinite(inputPrice) || inputPrice <= 0 || !Number.isFinite(outputPrice) || outputPrice <= 0) throw new Error("Invalid quota configuration");
  // The request body is capped at 32 KB, evidence at 18 KB, and output at 700 tokens.
  // Reserve for 100k input tokens at the uncached rate, plus 700 output tokens.
  const reservation = Math.ceil((100000 * inputPrice + 700 * outputPrice) * 1000000 / 1000000) / 1000000;
  if (!Number.isFinite(reservation) || reservation <= 0 || reservation > budget) throw new Error("Quota reservation exceeds budget");
  const response = await supabasePost(env, "/rest/v1/rpc/vincent_ai_reserve_quota", { p_minute_limit: minute, p_daily_limit: day, p_daily_budget_usd: budget, p_request_reservation_usd: reservation });
  if (!response.ok) throw new Error("Quota service unavailable");
  const allowed: unknown = await response.json();
  if (typeof allowed !== "boolean") throw new Error("Invalid quota response");
  return allowed;
}

export async function recordEvent(event: AnalyticsEvent, env: Environment): Promise<void> {
  try { await supabasePost(env, "/rest/v1/vincent_ai_events", event); } catch { /* Analytics is best effort. */ }
}
