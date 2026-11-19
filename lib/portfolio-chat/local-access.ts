export function isLocalDevRequest(request: Request, env: Record<string, string | undefined>): boolean {
  if (env.NODE_ENV !== "development" || env.PORTFOLIO_AI_LOCAL_DEV !== "1" || env.PORTFOLIO_AI_LOOPBACK_BOUND !== "1" || env.VERCEL || env.VERCEL_ENV) return false;
  const host = request.headers.get("host");
  return Boolean(host && /^127\.0\.0\.1:\d+$/u.test(host) && request.headers.get("origin") === `http://${host}` && request.headers.get("sec-fetch-site") === "same-origin");
}
