import { parseArgs } from "node:util";
import { hostedPortfolioOrigin } from "../../lib/knowledge/hosted-origin";
import { launchBrowser, localPreviewOrigin } from "./anonymous-browser.mjs";
import { discoverPortfolioPaths } from "./discover-sources.mts";
import { hostedResourceLoader, launchHostedPortfolioBrowser } from "./hosted-resource.mts";

async function discover() {
  const { values } = parseArgs({ options: {
    origin: { type: "string" },
    help: { type: "boolean", short: "h" },
  } });

  if (values.help) {
    console.log("Usage: npm run discover:portfolio -- --origin https://portfolio.example.com");
    console.log("For a local site, use an origin such as http://127.0.0.1:5173.");
    return;
  }
  if (!values.origin) throw new Error("Provide the portfolio origin with --origin");

  const local = values.origin.startsWith("http://");
  const origin = local ? localPreviewOrigin(values.origin) : hostedPortfolioOrigin(values.origin);
  const loadResource = local ? undefined : await hostedResourceLoader(origin);
  const browser = await (local ? launchBrowser() : launchHostedPortfolioBrowser());
  try {
    const paths = await discoverPortfolioPaths(browser, origin, loadResource);
    if (!paths.length) throw new Error("No eligible portfolio pages found. Check the site's public URLs and rendered main content.");
    console.log("Review these candidate pages and remove any paths you want to exclude.");
    for (const path of paths) console.log("  " + path);

    if (local) {
      const args = paths.map(path => "--path " + JSON.stringify(path));
      console.log("");
      console.log("Use your reviewed list to build the local preview.");
      console.log(["npm run preview:local -- --origin", origin, ...args].join(" "));
    } else {
      console.log("");
      console.log("Set these values in the Hosted assistant environment to approve your reviewed list.");
      console.log("PORTFOLIO_SITE_ORIGIN=" + origin);
      console.log("PORTFOLIO_SOURCE_PATHS=" + paths.join(","));
    }
  } finally {
    await browser.close();
  }
}

try {
  await discover();
} catch (error) {
  console.error("Portfolio discovery failed: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
