import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { captureLocalPreviewSource, capturePublishedSource, verifyInBrowser } from "../../lib/knowledge/rendered";
import { launchBrowser, localPreviewOrigin } from "./anonymous-browser.mjs";

test("anonymous publication validation rejects hidden DOM, protected markers and indexing exclusions", async () => {
  const publicText = "Public paragraph with <strong>visible words</strong>.";
  const hiddenText = "Synthetic draft paragraph.";
  const server = createServer((req, res) => {
    if (req.url === "/header") res.setHeader("X-Robots-Tag", "googlebot: noindex, nofollow");
    res.setHeader("Content-Type", "text/html");
    const attrs = req.url === "/hidden" ? 'style="display:none"' : req.url === "/protected" ? 'data-portfolio-access="protected"' : "";
    const head = req.url === "/meta" ? '<meta name="robots" content="none">' : "";
    res.end('<!DOCTYPE html><html lang="en"><head>' + head + '</head><body><main ' + attrs + '>' +
      '<h1>Audit fixture</h1><section id="public"><h2>Visible evidence</h2><p>' + publicText + '</p>' +
      '<p aria-hidden="true">' + hiddenText + '</p><p style="opacity:0">Invisible note.</p></section></main></body></html>');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test origin");
  const origin = "http://127.0.0.1:" + address.port;
  const browser = await launchBrowser();
  const source = (url: string, text: string, anchor: string | null = null): KnowledgeSource => ({
    access: "public", format: "json", page: { title: "Audit fixture", language: "en", kind: "page", url },
    data: { sections: [{ title: anchor ? "Visible evidence" : "Audit fixture", text, anchor }] },
  });

  try {
    const verify = verifyInBrowser(browser, origin);
    const content = "Public paragraph with visible words.";
    const publicPage = await buildKnowledgeCorpus([source("/visible", content, "public")], "fixture", verify);
    assert.equal(publicPage.chunks[0].sourceUrl, "/visible#public");
    for (const [url, error] of [
      ["/hidden", /visible public main/], ["/protected", /protected|excluded/],
      ["/meta", /not indexed/], ["/header", /X-Robots-Tag/],
    ] as const) {
      await assert.rejects(buildKnowledgeCorpus([source(url, content)], "fixture", verify), error);
    }
    await assert.rejects(buildKnowledgeCorpus([source("/visible", hiddenText)], "fixture", verify), /not visible/);
    await assert.rejects(buildKnowledgeCorpus([source("/visible", "Invisible note.", "public")], "fixture", verify), /not visible/);
    const rendered = await capturePublishedSource(browser, origin, { url: "/visible", title: "Audit fixture", language: "en", kind: "page" });
    const corpus = await buildKnowledgeCorpus([rendered], "fixture", verify);
    assert.equal(corpus.chunks.length, 1);
    assert.match(corpus.chunks[0].content, /Public paragraph with visible words/);
    assert.doesNotMatch(corpus.chunks[0].content, /Synthetic draft|Invisible note/);
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("local preview reads a client-rendered page without allowing external origins or background fetches", async () => {
  assert.throws(() => localPreviewOrigin("https://portfolio.example"), /local preview origin/);
  assert.throws(() => localPreviewOrigin("http://127.0.0.1:5173/projects"), /local preview origin/);
  let backgroundRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === "/src/portfolio.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(`
        document.querySelector('#app').innerHTML = '<main><div class="entrance"><h1 id="project">Project notes</h1>' +
          '<p>We tested the prototype with volunteers.</p><p hidden>Draft-only information.</p></div></main>';
        fetch('/api/content').catch(() => {});
      `);
    } else if (req.url === "/api/content") {
      backgroundRequests++;
      res.end("Draft-only information.");
    } else {
      res.setHeader("Content-Type", "text/html");
      if (req.url === "/drafts") res.setHeader("X-Robots-Tag", "noindex");
      res.end('<!DOCTYPE html><html lang="en"><style>@keyframes appear { from { opacity: 0; } to { opacity: 1; } } ' +
        '.entrance { animation: appear 500ms 250ms both; }</style><div id="app"></div><script type="module" src="/src/portfolio.js"></script></html>');
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test origin");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const browser = await launchBrowser();
    try {
      const source = await captureLocalPreviewSource(browser, origin, "/projects");
      const corpus = await buildKnowledgeCorpus([source], "local-preview", verifyInBrowser(browser, origin, "local-preview"));
      assert.equal(corpus.pages[0].title, "Project notes");
      assert.equal(corpus.chunks[0].sourceUrl, "/projects#project");
      assert.match(corpus.chunks[0].content, /tested the prototype with volunteers/);
      assert.doesNotMatch(corpus.chunks[0].content, /Draft-only/);
      assert.equal(backgroundRequests, 0);
      await assert.rejects(captureLocalPreviewSource(browser, origin, "/drafts"), /X-Robots-Tag/);
      await assert.rejects(capturePublishedSource(browser, origin, { url: "/projects", title: "Project notes", language: "en", kind: "page" }), /Missing visible public main/);
    } finally {
      await browser.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
