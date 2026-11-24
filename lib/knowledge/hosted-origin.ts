import { isIP } from "node:net";

export function hostedPortfolioOrigin(value: string | undefined): string {
  let url: URL;
  try { url = new URL(value?.trim() ?? ""); } catch { throw new Error("Set PORTFOLIO_SITE_ORIGIN to the public HTTPS origin of your portfolio"); }
  if (url.protocol !== "https:" || url.port || url.origin !== value?.trim() ||
      isIP(url.hostname) || !/^(?:[a-z0-9]+(?:-[a-z0-9]+)*\.)+[a-z]{2,63}$/u.test(url.hostname)) {
    throw new Error("PORTFOLIO_SITE_ORIGIN must be a public HTTPS domain with no path, port, or trailing slash");
  }
  return url.origin;
}
