import "server-only";

import { supabasePost } from "./portfolio-chat/supabase";

export type HostedQuestionLog = {
  created_at: string;
  question: string;
  page_path: string | null;
  answer_status: "answered" | "excerpt_fallback" | "insufficient" | "error";
};

export function hostedQuestionLogEnabled() {
  const env = process.env;
  const onVercel = env.VERCEL === "1" || env.VERCEL_ENV !== undefined;
  const production = onVercel ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production";
  return production &&
    env.PORTFOLIO_HOSTED_QUESTION_LOG === "1" &&
    Boolean(env.PORTFOLIO_HOSTED_QUESTION_LOG_SUPABASE_URL?.trim() && env.PORTFOLIO_HOSTED_QUESTION_LOG_SUPABASE_SECRET_KEY?.trim());
}

export function redactHostedQuestion(question: string) {
  return question.normalize("NFKC")
    .replace(/[\u0000\u200b-\u200d\u2060\ufeff]/gu, "")
    .replace(/[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]{1,64}@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, "[redacted]")
    .replace(/(?<!\d)\+?\(?\d[\d ().-]{6,}\d(?!\d)/gu, value => value.replace(/\D/gu, "").length >= 9 ? "[redacted]" : value)
    .replace(/\b(?:(?:sk-|sb_secret_|ghp_|github_pat_)[\w-]{8,}|Bearer[ \t]+[\w.-]{8,})/giu, "[redacted]")
    .trim().slice(0, 2000).toWellFormed();
}

export async function writeHostedQuestionLog(event: HostedQuestionLog) {
  const env = {
    SUPABASE_URL: process.env.PORTFOLIO_HOSTED_QUESTION_LOG_SUPABASE_URL?.trim(),
    SUPABASE_SECRET_KEY: process.env.PORTFOLIO_HOSTED_QUESTION_LOG_SUPABASE_SECRET_KEY,
  };
  try {
    const response = await supabasePost(env, "/rest/v1/portfolio_ai_question_log", event);
    if (response.ok) return;
  } catch { /* The reply has already been sent. */ }
  console.warn("Portfolio AI could not save a question record. Check the Hosted question log configuration.");
}
