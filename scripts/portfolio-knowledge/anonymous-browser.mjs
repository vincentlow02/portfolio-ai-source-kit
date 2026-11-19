import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
export async function launchBrowser() {
  if (process.env.VERCEL && process.platform === "linux") {
    const { default: chromium } = await import("@sparticuz/chromium");
    return puppeteer.launch({ headless: true, executablePath: await chromium.executablePath(), args: chromium.args.filter(arg => arg !== "--single-process"), dumpio: true });
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
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function withAnonymousPortfolioPage(browser, origin, url, visitPage) {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const destination = new URL(request.url());
      const allow = destination.origin === origin && request.method() === "GET" &&
        (request.isNavigationRequest() ? request.url() === url && request.frame() === page.mainFrame()
          : destination.pathname.startsWith("/_next/static/") && ["script", "stylesheet"].includes(request.resourceType()));
      void (allow ? request.continue() : request.abort());
    });
    const response = await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    if (response?.status() !== 200 || page.url() !== url) throw new Error("Expected an anonymous HTTP 200 at the requested URL");

    if (/\b(?:noindex|none)\b/iu.test(response.headers()["x-robots-tag"] ?? "")) {
      throw new Error("Source is not indexed (X-Robots-Tag)");
    }
    return await visitPage(page);
  } finally {
    await context.close();
  }
}
