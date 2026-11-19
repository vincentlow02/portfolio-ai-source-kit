import type { Browser, Page } from "puppeteer";
import type { z } from "zod";
import { withAnonymousPortfolioPage } from "../../scripts/portfolio-knowledge/anonymous-browser.mjs";
import { knowledgePath, type KnowledgeSource, type VerifyPublishedDocument, type pageMetadata } from "./contract";

function originUrl(origin: string, source: string) {
  const parsed = new URL(origin);
  if (!["https:", "http:"].includes(parsed.protocol) || origin !== parsed.origin ||
      (parsed.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname))) {
    throw new Error("Expected an HTTPS origin or local build preview");
  }
  knowledgePath(source);
  return origin + source;
}

async function inspectPublishedPage(page: Page, language: string, title: string, expected?: Parameters<VerifyPublishedDocument>[0]["sections"]) {
  return page.evaluate(({ language, title, expected }) => {
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
        return !normalized.includes(dom.normalize(title)) ||
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
    return { missing: null, sections };
  }, { language, title, expected });
}

export function verifyInBrowser(browser: Browser, origin: string): VerifyPublishedDocument {
  return async ({ page: source, sections }) => {
    const url = originUrl(origin, source.url);
    await withAnonymousPortfolioPage(browser, origin, url, async (page: Page) => {
      const { missing } = await inspectPublishedPage(page, source.language, source.title, sections);
      if (missing) throw new Error("Source text or section anchor is not visible in the published page: " + source.url + " (" + missing + ")");
    });
  };
}

export async function capturePublishedSource(browser: Browser, origin: string, metadata: z.input<typeof pageMetadata>): Promise<KnowledgeSource> {
  const url = originUrl(origin, metadata.url);
  return withAnonymousPortfolioPage(browser, origin, url, async (page: Page): Promise<KnowledgeSource> => {
    const { sections } = await inspectPublishedPage(page, metadata.language, metadata.title);
    return { access: "public", format: "rendered", page: metadata, sections };
  });
}
