import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { parsePortfolioCorpus } from "../../lib/knowledge/corpus";
import { captureLocalPreviewSource, capturePublishedSource, captureSiteSource, verifyInBrowser } from "../../lib/knowledge/rendered";
import { hostedPortfolioOrigin } from "../../lib/knowledge/hosted-origin";
import { excerptReply } from "../../lib/portfolio-chat/source-reply";
import { launchBrowser, localPreviewOrigin } from "./anonymous-browser.mjs";
import { discoverPortfolioPaths } from "./discover-sources.mts";
import { loadKnowledgeSources } from "./source-plan";

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

test("hosted capture only loads an approved public page and its same-origin scripts", async () => {
  assert.throws(() => hostedPortfolioOrigin("https://127.0.0.1"), /public HTTPS domain/);
  assert.throws(() => hostedPortfolioOrigin("https://portfolio.example.com/extra"), /public HTTPS domain/);
  const origin = hostedPortfolioOrigin("https://portfolio.example.com");
  const allowed = new Set<string>();
  let measurements = "Public prototype measurements.";
  const load = async (url: string) => {
    allowed.add(url);
    if (url === origin + "/work/field-notes") return { status: 200, contentType: "text/html", body:
      '<!doctype html><html lang="en"><div id="app"></div><script src="/app.js"></script><script src="https://other.example.com/app.js"></script>' };
    if (url === origin + "/app.js") return { status: 200, contentType: "text/javascript", body:
      `document.querySelector("#app").innerHTML = "<main data-portfolio-project=field-notes><p>Project introduction.</p><h1>Field notes</h1><p>${measurements}</p></main>";` };
    if (url === origin + "/notes/accessibility") return { status: 200, contentType: "text/html", body:
      '<!doctype html><html lang="en"><main><h1>Field notes</h1><p>The first route prototype was sketched on paper and tested after sunset.</p><h2 id="lessons">Lessons</h2><p>Readable maps use clear landmarks.</p></main>' };
    throw new Error("Unexpected fixture resource");
  };
  const browser = await launchBrowser(["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>"]);
  try {
    const source = await captureSiteSource(browser, origin, "/work/field-notes", "hosted", load);
    const corpus = await buildKnowledgeCorpus([source], "hosted", verifyInBrowser(browser, origin, "hosted", load));
    assert.equal(corpus.chunks.length, 1);
    assert.equal(corpus.chunks[0].projectId, "field-notes");
    assert.match(corpus.chunks[0].content, /Project introduction.*Public prototype measurements/su);

    measurements = "The updated public prototype used a recycled steel frame.";
    const updated = await captureSiteSource(browser, origin, "/work/field-notes", "hosted", load);
    const refreshed = await buildKnowledgeCorpus([updated], "hosted", verifyInBrowser(browser, origin, "hosted", load));
    assert.notEqual(refreshed.contentHash, corpus.contentHash);
    assert.deepEqual(refreshed.pages, corpus.pages);
    assert.match(refreshed.chunks[0].content, /updated public prototype used a recycled steel frame/u);
    assert.doesNotMatch(refreshed.chunks[0].content, /Public prototype measurements/u);
    const answer = await excerptReply(refreshed, [{ role: "user", content: "recycled steel frame" }], "en");
    assert.match(answer.answer, /recycled steel frame/u);
    assert.deepEqual(answer.sources.map(source => source.url), ["/work/field-notes"]);
    assert.deepEqual([...allowed].sort(), [origin + "/app.js", origin + "/work/field-notes"]);

    const sources = await loadKnowledgeSources([
      { access: "public", format: "rendered", page: { url: "/work/field-notes", title: "Field notes", language: "en", kind: "case-study", projectId: "field-notes" } },
      { access: "public", format: "mdx", file: "examples/atlas-portfolio/notes/field-notes.mdx",
        page: { url: "/notes/accessibility", title: "Field notes", language: "en", kind: "blog" }, anchors: { Lessons: "lessons" } },
      { access: "protected", url: "/notes/private" },
    ], process.cwd(), page => capturePublishedSource(browser, origin, page, "hosted", load));
    const mixed = await buildKnowledgeCorpus(sources, "hosted", verifyInBrowser(browser, origin, "hosted", load));
    assert.deepEqual(new Set(mixed.pages.map(page => page.url)), new Set(["/work/field-notes", "/notes/accessibility"]));
    assert.ok(mixed.chunks.some(chunk => chunk.sourceUrl === "/notes/accessibility#lessons" && chunk.content.includes("clear landmarks")));
    assert.ok(!allowed.has(origin + "/notes/private"));
  } finally { await browser.close(); }
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
          '<p>We tested the prototype with volunteers.</p><p hidden>Draft-only information.</p>' +
          '<a title="Email" href="mailto:hello@example.com?subject=Introduction"><svg width="16" height="16"></svg></a>' +
          '<a title="LinkedIn" href="https://www.linkedin.com/in/portfolio-fixture/?tracking=test"><svg width="16" height="16"></svg></a>' +
          '<a title="GitHub" href="https://github.com/portfolio-fixture"><svg width="16" height="16"></svg></a>' +
          '<a href="https://example.com/publication">${"A ".repeat(102)}</a>' +
          '<a hidden href="mailto:draft@example.com">Hidden email</a></div></main>' +
          '<footer><a href="mailto:footer@example.com">Footer email</a></footer>';
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
      const project = await captureLocalPreviewSource(browser, origin, "/projects/prototype");
      const corpus = await buildKnowledgeCorpus([source, project], "local-preview", verifyInBrowser(browser, origin, "local-preview"));
      assert.equal(corpus.pages[0].title, "Project notes");
      assert.deepEqual(parsePortfolioCorpus(corpus).pages[0].publicLinks, [
        { label: "Email", href: "mailto:hello@example.com" },
        { label: "LinkedIn", href: "https://www.linkedin.com/in/portfolio-fixture/?tracking=test" },
        { label: "GitHub", href: "https://github.com/portfolio-fixture" },
        { label: "A ".repeat(100).trimEnd(), href: "https://example.com/publication" },
        { label: "Footer email", href: "mailto:footer@example.com" },
      ]);
      assert.equal(corpus.chunks[0].sourceUrl, "/projects#project");
      assert.equal(corpus.chunks[0].projectId, null);
      assert.equal(corpus.chunks[1].projectId, "prototype");
      assert.match(corpus.chunks[0].content, /tested the prototype with volunteers/);
      assert.doesNotMatch(corpus.chunks[0].content, /Draft-only/);
      assert.equal(backgroundRequests, 0);
      if (source.access !== "public") throw new Error("Expected a public fixture source");
      await assert.rejects(buildKnowledgeCorpus([{
        ...source, page: { ...source.page, publicLinks: [{ label: "Hidden email", href: "mailto:draft@example.com" }] },
      }], "local-preview", verifyInBrowser(browser, origin, "local-preview")), /Link is not visible/);
      await assert.rejects(captureLocalPreviewSource(browser, origin, "/drafts"), /X-Robots-Tag/);
      await assert.rejects(capturePublishedSource(browser, origin, { url: "/projects", title: "Project notes", language: "en", kind: "page" }), /Missing visible public main/);
    } finally {
      await browser.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("a new portfolio answers from the site and can curate its own knowledge sources", async t => {
  const pages = new Map([
    ["/", '<main><h1 id="profile">Rowan Field</h1><p>I design wayfinding maps for coastal communities.</p>' +
      '<a aria-label="Codeberg" href="https://codeberg.org/rowan-fixture"><svg width="16" height="16"></svg></a> ' +
      '<a href="/resume.pdf">Résumé</a> <a href="/drafts/notes">Draft notes</a> ' +
      '<a href="/work/trail-map">Trail Map</a> <a href="/case-studies/quiet-lab">Quiet Lab</a> ' +
      '<a href="/contact">Contact</a> <a href="/faq">FAQ</a></main>' +
      '<footer><a title="LinkedIn" href="https://ca.linkedin.com/in/rowan-fixture/"><svg width="16" height="16"></svg></a></footer>'],
    ["/work/trail-map", '<main><h1>Trail Map</h1><p>Accessible trail maps for ferry passengers.</p>' +
      '<h2 id="role">Project role</h2><p>The prototype was tested by the team.</p><p>My contributions: I designed the route symbols.</p></main>'],
    ["/case-studies/quiet-lab", '<main><h1>Quiet Lab</h1><p>A workshop space for sketching exhibit models.</p></main>'],
    ["/contact", '<main><h1>Contact</h1><p>Email me at hello@example.com.</p><p hidden>Email: draft@example.com.</p></main>'],
    ["/faq", '<main><h1>FAQ</h1><h2 id="project-handoffs">Project handoffs</h2>' +
      '<p>Vector maps are delivered as SVG files.</p><p>Meetings happen on Tuesdays.</p>' +
      '<a href="/examples/symbols.pdf">Map symbols</a></main>'],
  ]);
  const server = createServer((request, response) => {
    const page = pages.get(request.url ?? "");
    if (!page) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end('<!doctype html><html lang="en"><body>' + page + '</body></html>');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = "http://127.0.0.1:" + address.port;
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const verify = verifyInBrowser(browser, origin, "local-preview");
  const captureUrl = (path: string) => captureLocalPreviewSource(browser, origin, path);
  const paths = await discoverPortfolioPaths(browser, origin);
  assert.deepEqual(paths, [...pages.keys()].sort());
  const corpus = await buildKnowledgeCorpus(await Promise.all(paths.map(captureUrl)), "local-preview", verify);
  assert.deepEqual(corpus.caseStudies.map(project => project.title), ["Quiet Lab", "Trail Map"]);
  const ask = (content: string, knowledge = corpus) => excerptReply(knowledge, [{ role: "user", content }], "en");
  const profile = await ask("Who is the portfolio owner?");
  assert.match(profile.answer, /Rowan Field\s+I design wayfinding maps/u);
  assert.equal(profile.sources[0]?.url, "/#profile");
  const projects = await ask("What projects are featured here?");
  assert.match(projects.answer, /Quiet Lab[\s\S]*Trail Map/u);
  const work = await ask("What was his contribution to Trail Map?");
  assert.match(work.answer, /I designed the route symbols/u);
  assert.equal(work.sources[0]?.url, "/work/trail-map#role");
  const email = await ask("What is his email?");
  assert.match(email.answer, /hello@example\.com/u);
  assert.equal(email.sources[0]?.url, "/contact");
  const profileLink = await ask("What is his LinkedIn?");
  assert.match(profileLink.answer, /ca\.linkedin\.com\/in\/rowan-fixture/u);
  assert.equal(profileLink.sources[0]?.url, "/");
  const codeberg = await ask("Can you show me their Codeberg link?");
  assert.match(codeberg.answer, /https:\/\/codeberg\.org\/rowan-fixture/u);
  assert.equal(codeberg.sources[0]?.url, "/");
  assert.match((await ask("Where can I find the resume?")).answer, /\/resume\.pdf/u);

  const root = await mkdtemp(join(tmpdir(), "portfolio-knowledge-custom-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const unexpectedCapture = async () => { throw new Error("The plan should be rejected before capture"); };
  await assert.rejects(loadKnowledgeSources([
    { access: "public", format: "rendered", url: "/drafts/log" },
    { access: "protected", url: "/drafts" },
  ], root, unexpectedCapture, unexpectedCapture), /overlaps a protected route/u);
  const mixedSource = {
    access: "public", format: "rendered", url: "/drafts/log",
    page: { url: "/", title: "Rowan Field", language: "en", kind: "page" },
  } as const;
  await assert.rejects(loadKnowledgeSources([mixedSource], root, unexpectedCapture, unexpectedCapture), /either a URL or page metadata/u);
  const file = "faq.md";
  const manifest = [
    { access: "public", format: "markdown", file: "profile.md", page: { url: "/", title: "Rowan Field", language: "en", kind: "page" },
      anchors: { "Rowan Field": "profile" } },
    { access: "public", format: "rendered", url: "/contact" },
    { access: "public", format: "markdown", file, page: { url: "/faq", title: "FAQ", language: "en", kind: "page" },
      anchors: { "Project handoffs": "project-handoffs" } },
    { access: "protected", url: "/drafts" },
  ] as const;
  await writeFile(join(root, "profile.md"), "# Rowan Field\n\nI design wayfinding maps for coastal communities.\n");
  await writeFile(join(root, file), "## Project handoffs\n\nVector maps are delivered as SVG files.\n");
  const buildCustom = async () => buildKnowledgeCorpus(await loadKnowledgeSources(manifest, root,
    page => capturePublishedSource(browser, origin, page, "local-preview"), captureUrl), "local-preview", verify);
  const custom = await buildCustom();
  assert.deepEqual(custom.pages.map(page => page.url), ["/", "/contact", "/faq"]);
  assert.match((await ask("Who is the portfolio owner?", custom)).answer, /Rowan Field\s+I design wayfinding maps/u);
  assert.match((await ask("Do you have their Codeberg link?", custom)).answer, /https:\/\/codeberg\.org\/rowan-fixture/u);
  assert.match((await ask("SVG files", custom)).answer, /Vector maps are delivered as SVG files/u);
  const symbols = await ask("Where is the map symbols link?", custom);
  assert.match(symbols.answer, /\/examples\/symbols\.pdf/u);
  assert.equal(symbols.sources[0]?.url, "/faq");
  assert.doesNotMatch(custom.chunks.map(chunk => chunk.content).join(" "), /Tuesdays/u);
  assert.deepEqual(custom.report.exclusions, [{ pathname: "/drafts", reason: "protected" }]);
  assert.ok(custom.pages[0].publicLinks?.every(link => link.href !== "/drafts/notes"));
  await writeFile(join(root, file), "## Project handoffs\n\nUnpublished briefing notes are attached.\n");
  await assert.rejects(buildCustom(), /not visible/u);
});
