import type { Browser, Page, ResponseForRequest } from "puppeteer";
import { knowledgeLanguage, knowledgePath, normalizeKnowledgeSource, validateSourcePlan } from "../../lib/knowledge/contract";
import { hostedPortfolioOrigin } from "../../lib/knowledge/hosted-origin";
import { captureSitePage } from "../../lib/knowledge/rendered";
import { localPreviewOrigin, withAnonymousPortfolioPage } from "./anonymous-browser.mjs";

type LoadResource = (url: string) => Promise<Partial<ResponseForRequest>>;
type Candidate = Pick<Extract<ReturnType<typeof normalizeKnowledgeSource>, { access: "public" }>, "access" | "page"> & { sections: number };

const skipReason = {
  restricted: "Restricted or utility route.",
  url: "Unsupported page URL.",
  query: "Unsupported query parameters on this link (values omitted).",
  noindex: "Excluded by noindex.",
  protected: "Protected page or login required.",
  language: "Unsupported or missing HTML language (supported: en, zh, ja).",
  text: "No readable text in a visible <main>.",
  html: "Expected an HTML page.",
  access: "Direct anonymous access failed (expected HTTP 200 without redirect).",
  timeout: "Page did not load in time.",
  duplicate: "Duplicate case study for the same project and language.",
  languageMismatch: "Page language does not match its URL.",
  metadata: "Invalid page or section metadata.",
} as const;

type SkipReason = typeof skipReason[keyof typeof skipReason];
type Inspection = { links: string[]; limitReached?: boolean } & ({ source: Candidate } | { reason: SkipReason });
type DiscoveryReport = {
  candidates: { path: string; title: string; language: Candidate["page"]["language"]; sections: number }[];
  skipped: { path: string; reason: SkipReason }[];
  limitReached: boolean;
};

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
    if ((url.protocol === "https:" || url.protocol === "http:") && url.origin === origin && !url.username && !url.password) return url;
  } catch { /* A malformed link is not a candidate. */ }
}

function pagePath(value: string, origin: string) {
  const url = sameOriginUrl(value, origin);
  if (!url) return;
  const pathname = url.pathname.replace(/\/$/u, "") || "/";
  if (utilityRoute.test(pathname) || reservedPath.test(pathname)) return { path: pathname, reason: skipReason.restricted };
  if (url.search) {
    const language = url.searchParams.get("lang");
    if (url.search !== `?lang=${language}` || !knowledgeLanguage.safeParse(language).success) {
      return { path: pathname, reason: skipReason.query };
    }
  }
  const path = pathname + url.search;
  try {
    knowledgePath(path);
    return { path };
  } catch {
    return { path: pathname, reason: skipReason.url };
  }
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

async function readSitemaps(browser: Browser, origin: string, offerLink: (value: string) => void, loadResource?: LoadResource) {
  const sitemaps = new Set<string>();
  let limitReached = false;
  function queue(value: string) {
    const url = sameOriginUrl(value, origin);
    if (url && !url.hash && !url.search && url.href.length <= 1024 && sitemapPath.test(url.pathname) &&
        !reservedPath.test(url.pathname) && !utilityRoute.test(url.pathname) && !sitemaps.has(url.href)) {
      if (sitemaps.size >= maxSitemaps) { limitReached = true; return; }
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
      const sitemap = await page.evaluate((source, limit) => {
        const root = new DOMParser().parseFromString(source, "application/xml").documentElement;
        const index = root.localName === "sitemapindex";
        const locations: string[] = [];
        if (index || root.localName === "urlset") for (const child of root.children) {
          if (child.localName !== (index ? "sitemap" : "url")) continue;
          const location = Array.from(child.children).find(item => item.localName === "loc")?.textContent?.trim();
          if (!location) continue;
          if (locations.length >= limit) return { index, locations, limitReached: true };
          locations.push(location);
        }
        return { index, locations, limitReached: false };
      }, xml, maxPages * 4);
      limitReached ||= sitemap.limitReached;
      for (const location of sitemap.locations) {
        if (sitemap.index) queue(location);
        else offerLink(location);
      }
    }
  } finally {
    await context.close();
  }
  return limitReached;
}

async function inspectCandidate(browser: Browser, origin: string, path: string, loadResource?: LoadResource): Promise<Inspection> {
  return withAnonymousPortfolioPage(browser, origin, origin + path, async (page: Page): Promise<Inspection> => {
    const details = await page.evaluate(limit => {
      const flags = Array.from(document.querySelectorAll('meta[name="robots" i],meta[name="googlebot" i]'))
        .map(meta => meta.getAttribute("content") ?? "").join(" ");
      const links: string[] = [];
      const language = document.documentElement.lang.toLowerCase().split("-")[0];
      if (/\b(?:noindex|none)\b/iu.test(flags)) return { links, language, blocked: "noindex" } as const;
      if (document.querySelector('[data-portfolio-access="protected"], input[type="password"]')) return { links, language, blocked: "protected" } as const;
      if (/\bnofollow\b/iu.test(flags)) return { links, language };
      for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        if (link.closest('[download],[rel~="nofollow" i],[hidden],[inert],[aria-hidden="true" i]') ||
            !link.getClientRects().length ||
            !link.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;
        if (!link.href) continue;
        if (links.length >= limit) return { links, language, limitReached: true };
        links.push(link.href);
      }
      return { links, language };
    }, maxPages * 4);
    const { links, limitReached } = details;
    const result = { links, limitReached };
    if (details.blocked) return { ...result, reason: skipReason[details.blocked] };
    if (!knowledgeLanguage.safeParse(details.language).success) return { ...result, reason: skipReason.language };
    try {
      const rendered = await captureSitePage(page, path);
      if (rendered.access === "public" && rendered.format === "rendered" &&
          Array.isArray(rendered.sections) && !rendered.sections.length) return { ...result, reason: skipReason.text };
      const source = normalizeKnowledgeSource(rendered);
      return source.access === "public"
        ? { ...result, source: { access: source.access, page: source.page, sections: source.sections.length } }
        : { ...result, reason: skipReason.protected };
    } catch (error) {
      if (error instanceof Error && error.message.includes("Missing visible public main content")) return { ...result, reason: skipReason.text };
      if (error instanceof Error && error.message === "Source URL language does not match metadata") return { ...result, reason: skipReason.languageMismatch };
      return { ...result, reason: skipReason.metadata };
    }
  }, loadResource ? "hosted" : "local-preview", loadResource, {
    navigationTimeout: 8_000, contentTimeout: 3_500, allowEmpty: true, requireHtml: true,
  });
}

function navigationReason(error: unknown): SkipReason {
  // Keep output independent of browser errors that can contain site-supplied URLs.
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return skipReason.timeout;
    if (error.message === "Expected an HTML source") return skipReason.html;
    if (error.message === "Source is not indexed (X-Robots-Tag)") return skipReason.noindex;
  }
  return skipReason.access;
}

export async function discoverPortfolioSources(browser: Browser, value: string, loadResource?: LoadResource): Promise<DiscoveryReport> {
  const origin = loadResource ? hostedPortfolioOrigin(value) : localPreviewOrigin(value);
  const queued = ["/"];
  const seen = new Set(queued);
  const accepted: Candidate[] = [];
  const skipped: DiscoveryReport["skipped"] = [];
  const rejectedLinks = new Set<string>();
  let limitReached = false;

  function offerLink(value: string) {
    const candidate = pagePath(value, origin);
    if (!candidate) return;
    const { path, reason } = candidate;
    if (reason) {
      if (path.length > 240 || rejectedLinks.has(path)) return;
      if (rejectedLinks.size >= maxPages) { limitReached = true; return; }
      rejectedLinks.add(path);
      skipped.push({ path, reason });
      return;
    }
    if (seen.has(path)) return;
    if (queued.length >= maxPages) { limitReached = true; return; }
    seen.add(path);
    queued.push(path);
  }

  const sitemapsLimited = await readSitemaps(browser, origin, offerLink, loadResource);
  limitReached ||= sitemapsLimited;

  for (let index = 0; index < queued.length;) {
    const paths = queued.slice(index, index + batchSize);
    index += paths.length;
    const batch = await Promise.allSettled(paths.map(path => inspectCandidate(browser, origin, path, loadResource)));
    for (const [batchIndex, result] of batch.entries()) {
      const path = paths[batchIndex];
      if (result.status !== "fulfilled") {
        skipped.push({ path, reason: navigationReason(result.reason) });
        continue;
      }
      const inspection = result.value;
      limitReached ||= Boolean(inspection.limitReached);
      if ("source" in inspection) {
        try {
          validateSourcePlan([...accepted, inspection.source]);
          accepted.push(inspection.source);
        } catch (error) {
          const duplicateProject = error instanceof Error && error.message.startsWith("Duplicate case study for ");
          skipped.push({ path, reason: duplicateProject ? skipReason.duplicate : skipReason.metadata });
        }
      } else {
        skipped.push({ path, reason: inspection.reason });
      }
      for (const link of inspection.links) offerLink(link);
    }
  }
  const candidates = accepted.map(({ page, sections }) => ({ path: page.url, title: page.title, language: page.language, sections }));
  const comparePaths = (a: { path: string }, b: { path: string }) => a.path < b.path ? -1 : Number(a.path > b.path);
  return { candidates: candidates.sort(comparePaths), skipped: skipped.sort(comparePaths), limitReached };
}

export async function discoverPortfolioPaths(browser: Browser, value: string, loadResource?: LoadResource): Promise<string[]> {
  return (await discoverPortfolioSources(browser, value, loadResource)).candidates.map(candidate => candidate.path);
}
