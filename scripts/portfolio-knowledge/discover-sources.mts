import type { Browser, Page, ResponseForRequest } from "puppeteer";
import { knowledgePath, normalizeKnowledgeSource, validateSourcePlan } from "../../lib/knowledge/contract";
import { hostedPortfolioOrigin } from "../../lib/knowledge/hosted-origin";
import { captureSitePage } from "../../lib/knowledge/rendered";
import { localPreviewOrigin, withAnonymousPortfolioPage } from "./anonymous-browser.mjs";

type LoadResource = (url: string) => Promise<Partial<ResponseForRequest>>;
type Candidate = Pick<Extract<ReturnType<typeof normalizeKnowledgeSource>, { access: "public" }>, "access" | "page">;

const maxPages = 50;
const maxSitemaps = 8;
const batchSize = 4;
const maxMetadataBytes = 1024 * 1024;
const utilityRoute = /^\/(?:admin|account|auth|dashboard|drafts?|login|logout|preview|register|settings|sign-?in|sign-?out|sign-?up)(?:\/|$)/iu;
const sitemapPath = /^\/(?:[a-z0-9_-]+\/)*(?:[a-z0-9._-]+\.xml|sitemap(?:[-_][a-z0-9_-]+)?)$/iu;
const reservedPath = /^\/(?:api|_next|private|\.portfolio-knowledge)(?:\/|$)/iu;

function sameOriginUrl(value: string, origin: string) {
  try {
    const url = new URL(value, origin);
    if (url.origin === origin && !url.username && !url.password) return url;
  } catch { /* A malformed link is not a candidate. */ }
}

function pagePath(value: string, origin: string) {
  const url = sameOriginUrl(value, origin);
  if (!url || utilityRoute.test(url.pathname)) return;
  const pathname = url.pathname.replace(/\/$/u, "") || "/";
  const path = pathname + url.search;
  try {
    knowledgePath(path);
    return path;
  } catch { /* The URL is outside the supported knowledge paths. */ }
}

async function readMetadata(url: string, contentType: RegExp, loadResource?: LoadResource) {
  try {
    if (loadResource) {
      const resource = await loadResource(url);
      if (resource.status !== 200 || !contentType.test(resource.contentType ?? "") || !resource.body) return "";
      if (typeof resource.body === "string") return Buffer.byteLength(resource.body) <= maxMetadataBytes ? resource.body : "";
      return resource.body.byteLength <= maxMetadataBytes ? Buffer.from(resource.body).toString("utf8") : "";
    }

    const response = await fetch(url, {
      redirect: "error", signal: AbortSignal.timeout(5_000), headers: { "User-Agent": "PortfolioAI/1.0" },
    });
    if (response.status !== 200 || !contentType.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel();
      return "";
    }
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks).toString("utf8");
      bytes += value.byteLength;
      if (bytes > maxMetadataBytes) {
        await reader.cancel();
        return "";
      }
      chunks.push(value);
    }
  } catch {
    return "";
  }
}

async function sitemapPaths(browser: Browser, origin: string, loadResource?: LoadResource) {
  const paths = new Set<string>();
  const sitemaps = new Set<string>();
  function queue(value: string) {
    const url = sameOriginUrl(value, origin);
    if (url && !url.hash && !url.search && url.href.length <= 1024 && sitemapPath.test(url.pathname) &&
        !reservedPath.test(url.pathname) && !utilityRoute.test(url.pathname) && sitemaps.size < maxSitemaps) {
      sitemaps.add(url.href);
    }
  }

  const robots = await readMetadata(origin + "/robots.txt", /^text\/plain(?:;|$)/iu, loadResource);
  queue("/sitemap.xml");
  for (const match of robots.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gimu)) queue(match[1]);

  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    const pending = sitemaps.values();
    for (const url of pending) {
      const xml = await readMetadata(url, /^(?:application\/xml|text\/xml|text\/plain)(?:;|$)/iu, loadResource);
      if (!xml || /<!DOCTYPE/iu.test(xml)) continue;
      const { index, locations } = await page.evaluate((source, limit) => {
        const root = new DOMParser().parseFromString(source, "application/xml").documentElement;
        const index = root.localName === "sitemapindex";
        const locations: string[] = [];
        if (index || root.localName === "urlset") for (const child of root.children) {
          if (child.localName !== (index ? "sitemap" : "url")) continue;
          const location = Array.from(child.children).find(item => item.localName === "loc")?.textContent?.trim();
          if (location) locations.push(location);
          if (locations.length >= limit) break;
        }
        return { index, locations };
      }, xml, maxPages * 4);
      for (const location of locations) {
        if (index) queue(location);
        else {
          const path = pagePath(location, origin);
          if (path && paths.size < maxPages - 1) paths.add(path);
        }
      }
    }
  } finally {
    await context.close();
  }
  return paths;
}

async function inspectCandidate(browser: Browser, origin: string, path: string, loadResource?: LoadResource) {
  return withAnonymousPortfolioPage(browser, origin, origin + path, async (page: Page) => {
    const links = await page.evaluate(limit => {
      const flags = Array.from(document.querySelectorAll('meta[name="robots" i],meta[name="googlebot" i]'))
        .map(meta => meta.getAttribute("content") ?? "").join(" ");
      if (/\b(?:noindex|none)\b/iu.test(flags) || document.querySelector('[data-portfolio-access="protected"], input[type="password"]')) return null;
      if (/\bnofollow\b/iu.test(flags)) return [];
      const links: string[] = [];
      for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        if (link.closest('[download],[rel~="nofollow" i],[hidden],[inert],[aria-hidden="true" i]') ||
            !link.getClientRects().length ||
            !link.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;
        if (link.href) links.push(link.href);
        if (links.length >= limit) break;
      }
      return links;
    }, maxPages * 4);
    if (links === null) return { links: [], source: null };
    try {
      const source = normalizeKnowledgeSource(await captureSitePage(page, path));
      const candidate: Candidate | null = source.access === "public" ? { access: source.access, page: source.page } : null;
      return { links, source: candidate };
    } catch {
      return { links, source: null };
    }
  }, loadResource ? "hosted" : "local-preview", loadResource, {
    navigationTimeout: 8_000, contentTimeout: 3_500, allowEmpty: true, requireHtml: true,
  });
}

export async function discoverPortfolioPaths(browser: Browser, value: string, loadResource?: LoadResource): Promise<string[]> {
  const origin = loadResource ? hostedPortfolioOrigin(value) : localPreviewOrigin(value);
  const queued = ["/", ...Array.from(await sitemapPaths(browser, origin, loadResource)).filter(path => path !== "/")];
  const seen = new Set(queued);
  const candidates: Candidate[] = [];

  for (let index = 0; index < queued.length;) {
    const paths = queued.slice(index, index + batchSize);
    index += paths.length;
    const batch = await Promise.allSettled(paths.map(path => inspectCandidate(browser, origin, path, loadResource)));
    for (const result of batch) {
      if (result.status !== "fulfilled") continue;
      const { source, links } = result.value;
      if (source) {
        try {
          validateSourcePlan([...candidates, source]);
          candidates.push(source);
        } catch { /* The plan supports one source per project and language. */ }
      }
      for (const link of links) {
        if (queued.length >= maxPages) break;
        const path = pagePath(link, origin);
        if (!path || seen.has(path)) continue;
        seen.add(path);
        queued.push(path);
      }
    }
  }
  return candidates.map(source => source.page.url).sort();
}
