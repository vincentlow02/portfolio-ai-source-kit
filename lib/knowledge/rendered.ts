import type { Browser, Page, ResponseForRequest } from "puppeteer";
import type { z } from "zod";
import { withAnonymousPortfolioPage } from "../../scripts/portfolio-knowledge/anonymous-browser.mjs";
import { knowledgeLanguage, knowledgePath, type KnowledgeSource, type VerifyPublishedDocument, type pageMetadata } from "./contract";

function originUrl(origin: string, source: string) {
  const parsed = new URL(origin);
  if (!["https:", "http:"].includes(parsed.protocol) || origin !== parsed.origin ||
      (parsed.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname))) {
    throw new Error("Expected an HTTPS origin or local build preview");
  }
  knowledgePath(source);
  return origin + source;
}

async function inspectPublishedPage(page: Page, language: string, title: string, expected?: Parameters<VerifyPublishedDocument>[0]["sections"], localPreview = false) {
  return page.evaluate(({ language, title, expected, localPreview }) => {
    const robots = Array.from(document.querySelectorAll('meta[name="robots" i],meta[name="googlebot" i]'));
    if (document.documentElement.lang.toLowerCase().split("-")[0] !== language ||
        document.querySelector('[data-portfolio-access="protected"],input[type="password"]') ||
        robots.some(meta => /\b(?:noindex|none)\b/iu.test(meta.getAttribute("content") ?? ""))) {
      throw new Error("Source is protected, not indexed, or served in a different language");
    }
    const excluded = 'nav,footer,button,form,script,style,noscript,template,[hidden],[inert],[aria-hidden="true" i],[data-portfolio-access="protected"]';
    const dom = {
      normalize(text: string) { return text.replace(/\s+/gu, " ").trim(); },
      visible(node: HTMLElement) {
        return !node.closest(excluded) && node.getClientRects().length > 0 &&
          node.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
      },
      text(scope: HTMLElement) {
        // An element's innerText can fall back to hidden textContent. Read
        // rendered text ranges and keep excluded descendants out of both adapters.
        if (!this.visible(scope)) return "";
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let text = "";
        let previousBlock = null;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (!parent || !this.visible(parent)) continue;
          range.selectNodeContents(node);
          if (!range.getClientRects().length) continue;
          let block: HTMLElement = parent;
          while (block !== scope && block.parentElement && getComputedStyle(block).display.startsWith("inline")) {
            block = block.parentElement;
          }
          if (previousBlock && previousBlock !== block) text += " ";
          previousBlock = block;
          text += node.textContent;
        }
        return this.normalize(text);
      },
    };

    const main = document.querySelector("main");
    if (!(main instanceof HTMLElement) || !dom.visible(main)) throw new Error("Missing visible public main content");

    if (expected) {
      const missing = expected.find(({ anchor, text, title }) => {
        let published = dom.text(main);
        if (anchor) {
          const candidates = document.querySelectorAll("#" + CSS.escape(anchor));
          const target = candidates[0];
          if (candidates.length !== 1 || !(target instanceof HTMLElement) || !main.contains(target) || !dom.visible(target)) return true;
          published = dom.text(target);
          if (/^H[1-6]$/u.test(target.tagName)) {
            for (let sibling = target.nextElementSibling; sibling instanceof HTMLElement; sibling = sibling.nextElementSibling) {
              if (/^H[1-6]$/u.test(sibling.tagName) && sibling.tagName <= target.tagName) break;
              published += " " + dom.text(sibling);
            }
          }
        }
        const normalized = dom.normalize(published);
        const matchesTitle = normalized.includes(dom.normalize(title)) || (localPreview && !anchor && title === document.title.trim().slice(0, 200));
        return !matchesTitle ||
          !text.split(/\r?\n/u).filter(line => line.trim()).every(line => normalized.includes(dom.normalize(line)));
      });
      return { missing: missing?.title ?? null, sections: [] };
    }

    const sections: Array<{ title: string; anchor: string | null; text: string }> = [];
    let current = { title, anchor: null as string | null, text: "" };
    for (const node of main.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,dt,dd,tr")) {
      if (!dom.visible(node) || node.parentElement?.closest("li,blockquote,pre,tr")) continue;
      const text = dom.text(node);
      if (!text) continue;
      if (/^H[1-6]$/u.test(node.tagName)) {
        if (current.text.trim()) sections.push(current);
        const section = node.closest("section[id]");
        const anchor = node.id || (section?.querySelector("h1,h2,h3,h4,h5,h6") === node ? section.id : null);
        current = { title: text, anchor, text: "" };
      } else {
        current.text += (current.text ? "\n" : "") + text;
      }
    }
    if (current.text.trim()) sections.push(current);
    // A preamble and a repeated heading can share a title and page-level link.
    const pageSections = new Map<string, (typeof sections)[number]>();
    const merged = [];
    for (const section of sections) {
      const previous = section.anchor ? undefined : pageSections.get(section.title);
      if (previous) {
        previous.text += "\n" + section.text;
        continue;
      }
      merged.push(section);
      if (!section.anchor) pageSections.set(section.title, section);
    }
    return { missing: null, sections: merged };
  }, { language, title, expected, localPreview });
}

type CaptureMode = "published" | "local-preview" | "hosted";
type LoadResource = (url: string) => Promise<Partial<ResponseForRequest>>;

export function verifyInBrowser(browser: Browser, origin: string, mode: CaptureMode = "published", loadResource?: LoadResource): VerifyPublishedDocument {
  return async ({ page: source, sections }) => {
    const url = originUrl(origin, source.url);
    await withAnonymousPortfolioPage(browser, origin, url, async (page: Page) => {
      const { missing } = await inspectPublishedPage(page, source.language, source.title, sections, mode !== "published");
      if (missing) throw new Error("Source text or section anchor is not visible in the published page: " + source.url + " (" + missing + ")");
    }, mode, loadResource);
  };
}

export async function capturePublishedSource(browser: Browser, origin: string, metadata: z.input<typeof pageMetadata>,
  mode: CaptureMode = "published", loadResource?: LoadResource): Promise<KnowledgeSource> {
  const url = originUrl(origin, metadata.url);
  return withAnonymousPortfolioPage(browser, origin, url, async (page: Page): Promise<KnowledgeSource> => {
    const { sections } = await inspectPublishedPage(page, metadata.language, metadata.title);
    return { access: "public", format: "rendered", page: metadata, sections };
  }, mode, loadResource);
}

export async function captureLocalPreviewSource(browser: Browser, origin: string, sourcePath: string): Promise<KnowledgeSource> {
  return captureSiteSource(browser, origin, sourcePath, "local-preview");
}

export async function captureSiteSource(browser: Browser, origin: string, sourcePath: string, mode: "local-preview" | "hosted", loadResource?: LoadResource): Promise<KnowledgeSource> {
  const url = originUrl(origin, sourcePath);
  return withAnonymousPortfolioPage(browser, origin, url, async (page: Page): Promise<KnowledgeSource> => {
    const language = knowledgeLanguage.parse(await page.evaluate(() => document.documentElement.lang.toLowerCase().split("-")[0]));
    const { title, project } = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll<HTMLElement>("main h1, main h2, main h3, main h4, main h5, main h6"));
      const heading = headings.find(element => !element.closest('[hidden],[inert],[aria-hidden="true" i]') &&
        element.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }));
      return {
        title: (heading?.innerText.trim() || document.title.trim()).slice(0, 200),
        project: document.querySelector("main")?.getAttribute("data-portfolio-project") ?? null,
      };
    });
    const { sections } = await inspectPublishedPage(page, language, title);
    const projectId = project ?? /^\/projects\/([^/]+)$/u.exec(knowledgePath(sourcePath))?.[1] ?? null;
    return {
      access: "public", format: "rendered",
      page: { url: sourcePath, title, language, kind: projectId === null ? "page" : "case-study", projectId },
      sections,
    };
  }, mode, loadResource);
}
