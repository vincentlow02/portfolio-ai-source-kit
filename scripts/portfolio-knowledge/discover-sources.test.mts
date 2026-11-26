import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer, type RequestListener } from "node:http";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { ResponseForRequest } from "puppeteer";
import { buildKnowledgeCorpus } from "../../lib/knowledge/contract";
import { captureLocalPreviewSource, captureSiteSource, verifyInBrowser } from "../../lib/knowledge/rendered";
import { excerptReply, widgetResponse } from "../../lib/portfolio-chat/source-reply";
import { launchBrowser } from "./anonymous-browser.mjs";
import { discoverPortfolioSources } from "./discover-sources.mts";

const html = (body: string, language = "en") =>
  '<!doctype html><html lang="' + language + '"><title>Portfolio example</title><main>' + body + '</main></html>';

async function listen(t: TestContext, handle: RequestListener) {
  const server = createServer(handle);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.close(); server.closeAllConnections(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return "http://127.0.0.1:" + address.port;
}

test("a client-routed portfolio discovers its rendered pages and cites a custom project route", async t => {
  const path = "/lab/river-kit";
  const pages: Record<string, string> = {
    "/": '<main><h1>River Studio</h1><p>A portfolio of transit design experiments.</p><a href="' + path + '">River Kit</a></main>',
    [path]: '<main data-portfolio-project="river-kit"><h1>River Kit</h1><p>A field guide for river crossings.</p>' +
      '<section id="labels"><h2>Tactile labels</h2><p>Reusable silicone labels mark the ferry stops.</p></section></main>',
  };
  const origin = await listen(t, (request, response) => {
    if (request.url === "/portfolio.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end("const pages = " + JSON.stringify(pages) + "; document.querySelector('#site').innerHTML = pages[location.pathname];");
      return;
    }
    response.setHeader("Content-Type", "text/html");
    if (!Object.hasOwn(pages, request.url ?? "")) { response.writeHead(404).end(); return; }
    response.end('<!doctype html><html lang="en"><title>River Studio</title><div id="site"></div><script src="/portfolio.js"></script></html>');
  });
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const report = await discoverPortfolioSources(browser, origin);
  assert.deepEqual(report.candidates, [
    { path: "/", title: "River Studio", language: "en", sections: 1 },
    { path, title: "River Kit", language: "en", sections: 2 },
  ]);
  assert.deepEqual(report.skipped, []);
  assert.equal(report.limitReached, false);
  const sources = await Promise.all(report.candidates.map(({ path }) => captureLocalPreviewSource(browser, origin, path)));
  const corpus = await buildKnowledgeCorpus(sources, "local-preview", verifyInBrowser(browser, origin, "local-preview"));
  assert.deepEqual(corpus.caseStudies.map(project => [project.projectId, project.url]), [["river-kit", path]]);
  const reply = await excerptReply(corpus, [{ role: "user", content: "Reusable silicone labels" }], "en");
  assert.match(reply.answer, /Reusable silicone labels mark the ferry stops/u);
  assert.equal(widgetResponse(reply, origin).sources[0]?.href, origin + path + "#labels");
});

test("hosted discovery explains skipped routes and cites a static page found only in the sitemap", async t => {
  const origin = "https://example.com";
  const visited = new Set<string>();
  const sitemap = (paths: string[]) => '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    paths.map(path => '<url><loc>' + origin + path + '</loc></url>').join("") + '</urlset>';
  const assets: Record<string, Partial<ResponseForRequest>> = {
    "/robots.txt": { contentType: "text/plain", body: "User-agent: *\nSitemap: " + origin + "/extra.xml\n" },
    "/sitemap.xml": { contentType: "application/xml", body:
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      '<sitemap><loc>' + origin + '/pages.xml</loc></sitemap>' +
      '<sitemap><loc>https://outside.example/pages.xml</loc></sitemap>' +
      '<sitemap><loc>' + origin + '/private/pages.xml</loc></sitemap></sitemapindex>' },
    "/pages.xml": { contentType: "text/xml", body: sitemap(["/projects/prototype?lang=ja", "/header", "/not-html", "/redirect", "/private/notes", "/foreign", "/missing-main"]) },
    "/extra.xml": { contentType: "application/xml", body: sitemap(["/only-in-sitemap"]) },
    "/": { contentType: "text/html", body: html('<p>Portfolio introduction and links.</p>' +
      '<a href="/projects/prototype/">Prototype</a><a href="/draft-notes">Draft notes</a><a href="/members">Members</a>' +
      '<a href="/admin">Admin</a><a href="/download.pdf">Download</a><a href="/nofollow" rel="nofollow">No follow</a>' +
      '<a href="/internal-view" hidden>Hidden</a><a href="https://outside.example/work">Another site</a>' +
      '<a href="/work/prototype">Duplicate</a><a href="/unsupported?token=fixture-token">Unsupported query</a>' +
      '<a href="/only-in-sitemap?token=fixture-token-2">Query variant of an approved path</a>') },
    "/projects/prototype": { contentType: "text/html", body: html('<p>English prototype summary.</p>') },
    "/projects/prototype?lang=ja": { contentType: "text/html", body: html('<p>設計概要を記録した公開ページです。</p>', "ja") },
    "/only-in-sitemap": { contentType: "text/html", body: html('<h1>Print Studio</h1><p>Indigo linocut prints hang in the studio gallery.</p>') },
    "/work/prototype": { contentType: "text/html", body: html('<p>Another English prototype summary.</p>') },
    "/foreign": { contentType: "text/html", body: html('<p>Ein öffentliches Portfolio.</p>', "de") },
    "/missing-main": { contentType: "text/html", body: '<!doctype html><html lang="en"><title>Missing main</title><p>Text outside the main landmark.</p></html>' },
    "/draft-notes": { contentType: "text/html", body: html('<meta name="robots" content="noindex"><p>Draft notes.</p><a href="/skip-child">Skip</a>') },
    "/members": { contentType: "text/html", body: html('<p>Members only.</p><input type="password"><a href="/skip-child">Skip</a>') },
    "/header": { contentType: "text/html", headers: { "X-Robots-Tag": "noindex" }, body: html("<p>Excluded notes.</p>") },
    "/not-html": { contentType: "text/plain", body: html("<p>Not an HTML response.</p>") },
    "/redirect": { status: 302, headers: { Location: "/redirected" } },
  };

  const browser = await launchBrowser(["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>"]);
  t.after(() => browser.close());
  const load = async (value: string) => {
    assert.equal(new URL(value).origin, origin);
    const path = value.slice(origin.length);
    visited.add(path);
    const asset = assets[path];
    if (!asset) throw new Error("Unexpected fixture request");
    return { status: 200, ...asset };
  };
  const report = await discoverPortfolioSources(browser, origin, load);
  assert.deepEqual(report.candidates.map(page => page.path), ["/", "/only-in-sitemap", "/projects/prototype", "/projects/prototype?lang=ja"]);
  assert.deepEqual([...visited].sort(), Object.keys(assets).sort());
  assert.equal(report.limitReached, false);
  const skipped = new Map(report.skipped.map(({ path, reason }) => [path, reason]));
  assert.match(skipped.get("/admin") ?? "", /restricted|utility/iu);
  assert.match(skipped.get("/private/notes") ?? "", /restricted|utility/iu);
  assert.match(skipped.get("/download.pdf") ?? "", /unsupported.*url/iu);
  assert.match(skipped.get("/draft-notes") ?? "", /noindex/iu);
  assert.match(skipped.get("/header") ?? "", /noindex/iu);
  assert.match(skipped.get("/members") ?? "", /protected|login/iu);
  assert.match(skipped.get("/redirect") ?? "", /anonymous|redirect/iu);
  assert.match(skipped.get("/not-html") ?? "", /html/iu);
  assert.match(skipped.get("/foreign") ?? "", /language/iu);
  assert.match(skipped.get("/missing-main") ?? "", /main/iu);
  assert.match(skipped.get("/work/prototype") ?? "", /duplicate/iu);
  assert.equal(skipped.get("/unsupported"), "Unsupported query parameters on this link (values omitted).");
  assert.equal(skipped.get("/only-in-sitemap"), "Unsupported query parameters on this link (values omitted).");
  assert.doesNotMatch(JSON.stringify(report), /fixture-token|outside\.example|internal-view|skip-child|nofollow/u);

  const path = report.candidates.find(page => page.path === "/only-in-sitemap")!.path;
  const source = await captureSiteSource(browser, origin, path, "hosted", load);
  const corpus = await buildKnowledgeCorpus([source], "hosted", verifyInBrowser(browser, origin, "hosted", load));
  const reply = await excerptReply(corpus, [{ role: "user", content: "Indigo linocut prints" }], "en");
  assert.match(reply.answer, /Indigo linocut prints hang in the studio gallery/u);
  assert.equal(widgetResponse(reply, origin).sources[0]?.href, origin + path);
});

test("single-page onboarding keeps fragment links inside one page and reports what can be approved", async t => {
  const origin = await listen(t, (request, response) => {
    if (request.url !== "/") { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(html('<h1>Fieldline Atelier</h1><nav><a href="#glazes">Glazing notes</a></nav>' +
      '<section id="glazes"><h2>Glazing notes</h2><p>Wood ash glaze gives the cups a matte finish.</p></section>' +
      '<a href="/signin">Sign in</a>'));
  });
  const script = fileURLToPath(new URL("./discover-portfolio.mts", import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", script, "--origin", origin], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), timeout: 25_000, windowsHide: true,
  });
  assert.match(stdout, /^Sources found on http:\/\/127\.0\.0\.1:\d+\s*$/mu);
  assert.match(stdout, /1\. \/ — Fieldline Atelier \[en\], 1 section/u);
  assert.match(stdout, /Skipped \(1\)/u);
  assert.match(stdout, /\/signin.*(?:restricted|utility)/iu);
  assert.match(stdout, /npm run preview:local -- --origin http:\/\/127\.0\.0\.1:\d+ --path "\/"/u);
  assert.doesNotMatch(stdout, /\/#glazes/u);

  const browser = await launchBrowser();
  t.after(() => browser.close());
  const source = await captureLocalPreviewSource(browser, origin, "/");
  const corpus = await buildKnowledgeCorpus([source], "local-preview", verifyInBrowser(browser, origin, "local-preview"));
  const reply = await excerptReply(corpus, [{ role: "user", content: "Wood ash glaze" }], "en");
  assert.match(reply.answer, /Wood ash glaze gives the cups a matte finish/u);
  assert.equal(widgetResponse(reply, origin).sources[0]?.href, origin + "/#glazes");
});
