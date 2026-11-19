import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { capturePublishedSource, verifyInBrowser } from "../../lib/knowledge/rendered";
import { launchBrowser } from "./anonymous-browser.mjs";

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
