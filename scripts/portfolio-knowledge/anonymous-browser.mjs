import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
/** @param {string[]} [extraArgs] */
export async function launchBrowser(extraArgs = []) {
  if (process.env.VERCEL && process.platform === "linux") {
    const { default: chromium } = await import("@sparticuz/chromium");
    return puppeteer.launch({ headless: true, executablePath: await chromium.executablePath(), args: [...chromium.args.filter(arg => arg !== "--single-process"), ...extraArgs], dumpio: true });
  }
  const executablePath = await puppeteer.executablePath();
  if (!existsSync(executablePath) && !process.env.PUPPETEER_EXECUTABLE_PATH &&
      !/^(1|true)$/iu.test(process.env.PUPPETEER_SKIP_DOWNLOAD ?? "")) {
    // Some npm setups block dependency install scripts. Use the browser version
    // pinned by the existing Puppeteer dependency in that case.
    const cli = fileURLToPath(new URL("../../node_modules/puppeteer/lib/puppeteer/node/cli.js", import.meta.url));
    const install = spawn(process.execPath, [cli, "browsers", "install", "chrome"], { stdio: "inherit", windowsHide: true });
    const [code] = await once(install, "exit");
    if (code !== 0) throw new Error("Puppeteer Chrome installation failed");
  }
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", ...extraArgs],
  });
}

export function localPreviewOrigin(value) {
  let url;
  try { url = new URL(value); } catch { /* Report the expected input below. */ }
  if (!url || url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.origin !== value) {
    throw new Error("Use a local preview origin such as http://127.0.0.1:5173");
  }
  return url.origin;
}

/** @param {(url: string) => Promise<Partial<import("puppeteer").ResponseForRequest>>} [loadResource] */
export async function withAnonymousPortfolioPage(browser, origin, url, visitPage, mode = "published", loadResource = undefined) {
  const localPreview = mode === "local-preview";
  const renderedPage = localPreview || mode === "hosted";
  if (localPreview) localPreviewOrigin(origin);
  if (mode === "hosted" && typeof loadResource !== "function") throw new Error("Hosted capture requires a restricted resource loader");
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      const destination = new URL(request.url());
      const allow = destination.origin === origin && request.method() === "GET" &&
        (request.isNavigationRequest() ? request.url() === url && request.frame() === page.mainFrame()
          : (renderedPage || destination.pathname.startsWith("/_next/static/")) && ["script", "stylesheet"].includes(request.resourceType()));
      try {
        if (!allow) await request.abort();
        else if (loadResource) await request.respond(await loadResource(request.url()));
        else await request.continue();
      } catch {
        if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => {});
      }
    });
    const response = await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    if (response?.status() !== 200 || page.url() !== url) throw new Error("Expected an anonymous HTTP 200 at the requested URL");

    if (/\b(?:noindex|none)\b/iu.test(response.headers()["x-robots-tag"] ?? "")) {
      throw new Error("Source is not indexed (X-Robots-Tag)");
    }
    if (renderedPage) {
      await page.waitForFunction(() => {
        const paragraphs = document.querySelectorAll("main :is(p,li,blockquote,pre,figcaption,dt,dd,tr)");
        return Array.from(paragraphs).some(element => element.innerText.trim() &&
          !element.closest('nav,footer,form,[hidden],[inert],[aria-hidden="true" i]') &&
          element.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }));
      }, { timeout: 10_000 });
    }
    return await visitPage(page);
  } finally {
    await context.close();
  }
}
