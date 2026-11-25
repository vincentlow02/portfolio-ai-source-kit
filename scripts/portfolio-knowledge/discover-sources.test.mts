import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import type { ResponseForRequest } from "puppeteer";
import { launchBrowser } from "./anonymous-browser.mjs";
import { discoverPortfolioPaths } from "./discover-sources.mts";

const html = (body: string, language = "en") =>
  '<!doctype html><html lang="' + language + '"><title>Portfolio example</title><main>' + body + '</main></html>';

test("local discovery follows rendered navigation when the portfolio has no sitemap", async t => {
  const server = createServer((request, response) => {
    if (request.url === "/portfolio.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end('document.querySelector("main").innerHTML = ' +
        JSON.stringify('<p>Welcome to this portfolio.</p><a href="/projects">Projects</a>'));
      return;
    }
    response.setHeader("Content-Type", "text/html");
    if (request.url === "/") {
      response.end(html('<script src="/portfolio.js"></script>'));
    } else if (request.url === "/projects") {
      response.end(html('<p>Project notes and selected work.</p><a href="/projects/prototype#notes">Prototype</a>'));
    } else if (request.url === "/projects/prototype") {
      response.end(html('<p>A prototype collecting public field observations.</p><a href="/">Home</a>'));
    } else {
      response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.close(); server.closeAllConnections(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await launchBrowser();
  t.after(() => browser.close());
  assert.deepEqual(await discoverPortfolioPaths(browser, "http://127.0.0.1:" + address.port), [
    "/", "/projects", "/projects/prototype",
  ]);
});

test("hosted discovery reviews public sitemap and link candidates through the supplied loader", async t => {
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
    "/pages.xml": { contentType: "text/xml", body: sitemap(["/projects/prototype?lang=ja", "/header", "/not-html", "/redirect", "/private/notes"]) },
    "/extra.xml": { contentType: "application/xml", body: sitemap(["/only-in-sitemap"]) },
    "/": { contentType: "text/html", body: html('<p>Portfolio introduction and links.</p>' +
      '<a href="/projects/prototype/">Prototype</a><a href="/draft-notes">Draft notes</a><a href="/members">Members</a>' +
      '<a href="/admin">Admin</a><a href="/download.pdf">Download</a><a href="/nofollow" rel="nofollow">No follow</a>' +
      '<a href="/internal-view" hidden>Hidden</a><a href="https://outside.example/work">Another site</a>') },
    "/projects/prototype": { contentType: "text/html", body: html('<p>English prototype summary.</p>') },
    "/projects/prototype?lang=ja": { contentType: "text/html", body: html('<p>設計概要を記録した公開ページです。</p>', "ja") },
    "/only-in-sitemap": { contentType: "text/html", body: html('<p>Public notes available directly.</p>') },
    "/draft-notes": { contentType: "text/html", body: html('<meta name="robots" content="noindex"><p>Draft notes.</p><a href="/skip-child">Skip</a>') },
    "/members": { contentType: "text/html", body: html('<p>Members only.</p><input type="password"><a href="/skip-child">Skip</a>') },
    "/header": { contentType: "text/html", headers: { "X-Robots-Tag": "noindex" }, body: html("<p>Excluded notes.</p>") },
    "/not-html": { contentType: "text/plain", body: html("<p>Not an HTML response.</p>") },
    "/redirect": { status: 302, headers: { Location: "/redirected" } },
  };

  const browser = await launchBrowser(["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>"]);
  t.after(() => browser.close());
  const paths = await discoverPortfolioPaths(browser, origin, async value => {
    assert.equal(new URL(value).origin, origin);
    const path = value.slice(origin.length);
    visited.add(path);
    const asset = assets[path];
    if (!asset) throw new Error("Unexpected fixture request");
    return { status: 200, ...asset };
  });
  assert.deepEqual(paths, ["/", "/only-in-sitemap", "/projects/prototype", "/projects/prototype?lang=ja"]);
  assert.deepEqual([...visited].sort(), Object.keys(assets).sort());
});
