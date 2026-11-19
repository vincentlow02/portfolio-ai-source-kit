import type { PortfolioChatConfig } from "./engine-config";
import { defaultPortfolioChatConfig } from "./engine-config";

export function validPublicOrigin(request: Request, env: Record<string, string | undefined>, config: PortfolioChatConfig = defaultPortfolioChatConfig): boolean {
  if (env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") !== "same-origin") return false;
  const production = env.VERCEL_ENV === "production" || (!env.VERCEL_ENV && config.allowSelfHostedPublic === true);
  const origin = production && env.PORTFOLIO_AI_PUBLIC_ENABLED === "1"
    ? env.PORTFOLIO_AI_PUBLIC_ORIGIN?.trim().replace(/\/$/u, "")
    : env.VERCEL_ENV === "preview" && env.PORTFOLIO_AI_PROTECTED_PREVIEW === "1" && env.VERCEL_URL
      ? `https://${env.VERCEL_URL}` : undefined;
  // Preview access relies on Vercel Deployment Protection, not these headers.
  try {
    const expected = new URL(origin ?? "");
    const actual = new URL(request.url);
    const approvedAlias = production && config.publicOriginAliases?.[expected.origin]?.includes(actual.origin);
    return expected.protocol === "https:" && expected.origin === origin && (actual.origin === expected.origin || approvedAlias === true) && request.headers.get("origin") === actual.origin;
  } catch { return false; }
}
