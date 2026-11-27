import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { on, once } from "node:events";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { embeddingModelDirectory } from "../../lib/portfolio-chat/embedding-model.mjs";
import { launchBrowser } from "../portfolio-knowledge/anonymous-browser.mjs";
import { excerptReply, widgetResponse } from "../../lib/portfolio-chat/source-reply";

const portfolioOrigin = "http://127.0.0.1:5173";
const article = "The prototype used a recycled steel frame.";
const project: KnowledgeSource = {
  access: "public", format: "rendered",
  page: { url: "/work/lantern", title: "Lantern", projectId: "lantern", language: "en", kind: "case-study" },
  sections: [{ title: "Lantern", text: "Seasonal tide tables organize volunteer walks." }],
};

async function startPreview(t: TestContext, model = false, origin = portfolioOrigin, extraSources: KnowledgeSource[] = [],
  retrievalMode = "hybrid") {
  const corpus = await buildKnowledgeCorpus([{
    access: "public", format: "rendered",
    page: { url: "/projects", title: "Projects", language: "en", kind: "page" },
    sections: [{ title: "Materials", anchor: "materials", text: article }],
  }, ...extraSources], "local-preview", async () => {});
  const root = await mkdtemp(join(tmpdir(), "portfolio-chat-preview-"));
  const directory = join(root, ".portfolio-knowledge");
  const file = join(directory, "local-preview.json");
  await mkdir(directory);
  await writeFile(file, JSON.stringify({ origin, corpus }));
  if (retrievalMode === "hybrid") await cp(embeddingModelDirectory, join(root, embeddingModelDirectory), { recursive: true });
  const dependencies = new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
  const script = fileURLToPath(new URL("./preview-local.mts", import.meta.url));
  const fixture = fileURLToPath(new URL("./mock-local-preview.cjs", import.meta.url));
  const prefix = model ? ["--require", fixture] : [];
  const args = model ? ["--model"] : [];
  const child = spawn(process.execPath, [...prefix, "--import", dependencies, script, "--port", "0", ...args], {
    cwd: root, stdio: ["ignore", "pipe", "inherit"], windowsHide: true, env: {
      ...process.env,
      PORTFOLIO_RETRIEVAL_MODE: retrievalMode,
      ...(model ? {
        PORTFOLIO_AI_PROVIDER: "qwen", QWEN_API_KEY: "test-preview-credential", QWEN_BASE_URL: "https://preview-fixture.invalid/v1",
        QWEN_JSON_MODE: "object", QWEN_MODEL: "qwen3.7-flash", QWEN_ENABLE_THINKING: "false",
      } : {}),
    },
  });
  const done = once(child, "exit");
  const lines = createInterface({ input: child.stdout });
  t.after(async () => {
    lines.close();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await done;
    await rm(root, { recursive: true, force: true, maxRetries: 4 });
  });
  for await (const [line] of on(lines, "line", { close: ["close"], signal: AbortSignal.timeout(10_000) })) {
    const chatUrl = /^Local chat preview: (http:\/\/127\.0\.0\.1:\d+\/)$/u.exec(line)?.[1];
    if (!chatUrl) continue;
    const request = (content: string, origin = new URL(chatUrl).origin, selectionContext?: object) => fetch(new URL("api/preview", chatUrl), {
      method: "POST",
      headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content }], selectionContext }),
    });
    return { chatUrl, request };
  }
  throw new Error("Chat preview should start");
}

test("local chat returns a source excerpt and links only to an approved portfolio page", async t => {
  const { chatUrl, request } = await startPreview(t, false, portfolioOrigin, [{
    access: "public", format: "rendered",
    page: { url: "/", title: "Profile", language: "en", kind: "page", publicContacts: {
      email: "hello@example.com", linkedIn: "https://www.linkedin.com/in/portfolio-fixture/",
    } },
    sections: [{ title: "Profile", text: "A designer who makes maps." }],
  }]);
  const chatPage = await fetch(chatUrl);
  assert.equal(chatPage.status, 200);
  assert.ok(chatPage.headers.get("Content-Security-Policy")?.endsWith(`frame-ancestors ${portfolioOrigin}`));
  assert.equal((await fetch(new URL("embed.js", chatUrl))).status, 200);
  assert.equal((await fetch(new URL("widget/sparkles.svg", chatUrl))).headers.get("Content-Type"), "image/svg+xml");
  const reply = await request("recycled steel");
  assert.equal(reply.status, 200);
  assert.deepEqual(await reply.json(), {
    answer: article, sources: [{ section: "Materials", href: `${portfolioOrigin}/projects#materials` }],
  });
  const unsupported = await request("Which spacecraft flew past Neptune?");
  assert.equal(unsupported.status, 200);
  const result = await unsupported.json();
  assert.match(result.answer, /does not provide enough information/);
  assert.deepEqual(result.sources, []);
  const quote = { pagePath: "/projects", sectionId: "materials", text: "recycled steel frame" };
  const quoted = await request("Explain this quote", undefined, quote);
  assert.equal(quoted.status, 200);
  assert.deepEqual(await quoted.json(), {
    answer: article, sources: [{ section: "Materials", href: `${portfolioOrigin}/projects#materials` }],
  });
  assert.equal((await request("Explain this quote", undefined, { ...quote, text: "unpublished notes" })).status, 400);
  for (const [question, value] of [
    ["can i know his linkedin", "https://www.linkedin.com/in/portfolio-fixture/"],
    ["what his email", "hello@example.com"],
  ]) {
    const contact = await request(question);
    assert.equal(contact.status, 200);
    const result = await contact.json();
    assert.ok(result.answer.includes(value));
    assert.deepEqual(result.sources, [{ section: "Profile", href: portfolioOrigin + "/" }]);
  }
  const ownEmail = await (await request("what your email")).json();
  assert.equal(ownEmail.answer, "hello@example.com");
  assert.deepEqual(ownEmail.answerParts, [{ text: "hello@example.com", href: "mailto:hello@example.com" }]);
  assert.equal((await request("recycled steel", portfolioOrigin)).status, 403);
  assert.equal((await fetch(new URL(".portfolio-knowledge/local-preview.json", chatUrl))).status, 404);
});

test("keyword-only preview works without model files and declines unsupported details", async t => {
  const { request } = await startPreview(t, false, portfolioOrigin, [project], "keyword");
  const supported = await request("steel recycled frame");
  assert.equal(supported.status, 200);
  assert.equal((await supported.json()).answer, article);
  const unsupported = await request("What was the budget for the recycled steel prototype?");
  assert.equal(unsupported.status, 200);
  assert.deepEqual((await unsupported.json()).sources, []);
  const start = await (await request("Which project should I explore first?")).json();
  assert.match(start.answer, /Start with Lantern/);
  assert.equal(start.sources[0].href, `${portfolioOrigin}/work/lantern`);
});

test("the widget renders visible web and email links without unsafe destinations", () => {
  const text = "Open [the guide](</files/guide.pdf>), https://docs.example.org/guide, or email hello@example.com. [Invalid](javascript:void(0))";
  const reply = widgetResponse({ answer: text, sources: [] }, portfolioOrigin);
  assert.deepEqual(reply.answerParts?.filter(part => typeof part !== "string"), [
    { text: "the guide", href: `${portfolioOrigin}/files/guide.pdf` },
    { text: "https://docs.example.org/guide", href: "https://docs.example.org/guide" },
    { text: "hello@example.com", href: "mailto:hello@example.com" },
  ]);
  assert.equal(reply.answer, `Open the guide (${portfolioOrigin}/files/guide.pdf), https://docs.example.org/guide, or email hello@example.com. [Invalid](javascript:void(0))`);
});

test("the embedded widget sends one question with its portfolio quote or current approved page", async t => {
  let embedUrl = "";
  const research = "The Lantern team tested tactile signs at six libraries.";
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><title>Portfolio fixture</title>
      <main><section id="case-study" style="margin-top: 80px">
        <h2 id="research">Research</h2><p id="passage">${research}</p>
      </section></main><script src="${embedUrl}" defer></script>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.close(); server.closeAllConnections(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const { chatUrl } = await startPreview(t, false, origin, [{
    access: "public", format: "rendered",
    page: { url: "/projects/lantern", title: "Lantern", language: "en", kind: "case-study", projectId: "lantern",
      publicLinks: [{ label: "Lantern demo", href: "/prototype.pdf" }] },
    sections: [{ title: "Research", anchor: "research", text: research }],
  }]);
  embedUrl = new URL("embed.js", chatUrl).href;
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 800 });
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(String(error)));
  await page.goto(`${origin}/projects/lantern?tracking=example#research`);
  assert.deepEqual(pageErrors, []);
  const action = "portfolio-ai-preview >>> .selection-action";
  const askAboutSelection = async () => {
    await page.$eval("#passage", passage => {
      const range = document.createRange();
      range.selectNodeContents(passage);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.waitForSelector(action, { visible: true });
    assert.equal(await page.$eval(action, button => button.textContent?.trim()), "Ask AI Kit");
    await page.click(action);
  };
  await askAboutSelection();
  const panel = await page.waitForFrame(frame => frame.url() === chatUrl);
  await panel.waitForSelector("#quote", { visible: true });
  assert.equal(await panel.$eval("#quote-text", quote => quote.textContent), research);
  assert.equal(await panel.$eval("#question", input => input === document.activeElement), true);
  await page.setViewport({ width: 1280, height: 800 });
  const send = async () => {
    const sent = page.waitForRequest(request => new URL(request.url()).pathname === "/api/preview" && request.method() === "POST");
    await panel.click('form button[type="submit"]');
    const request = await sent;
    await panel.waitForSelector("#output .assistant");
    return request.fetchPostData().then(data => JSON.parse(data!));
  };
  const ask = async (text: string) => {
    await panel.type("#question", text);
    return send();
  };

  const question = "How was it tested?";
  await panel.type("#question", question);
  await panel.click("#remove-quote");
  await panel.waitForSelector("#quote", { hidden: true });
  assert.equal(await panel.$eval("#question", input => (input as HTMLTextAreaElement).value), question);
  await askAboutSelection();
  await panel.waitForSelector("#quote", { visible: true });
  assert.deepEqual(await send(), {
    messages: [{ role: "user", content: question }],
    selectionContext: { pagePath: "/projects/lantern", sectionId: "case-study", text: research },
  });
  await panel.waitForSelector("#quote", { hidden: true });
  await panel.waitForSelector(".user #asked-quote", { visible: true });
  assert.equal(await panel.$eval("#asked-quote-text", quote => quote.textContent), research);
  assert.equal(await panel.$eval("#output p", answer => answer.textContent), research);
  assert.equal(await panel.$eval(".sources a", link => link.getAttribute("href")), `${origin}/projects/lantern#research`);

  const first = await ask("How was it tested?");
  assert.deepEqual(first, {
    messages: [{ role: "user", content: "How was it tested?" }],
    pageContext: { pathname: "/projects/lantern" },
  });
  await panel.waitForSelector("#asked-quote", { hidden: true });
  assert.equal(await panel.$eval(".sources a", link => link.getAttribute("href")), `${origin}/projects/lantern#research`);
  await ask("Open the demo link");
  const answerLink = "#output p a";
  assert.equal(await panel.$eval(answerLink, link => link.getAttribute("href")), `${origin}/prototype.pdf`);
  const opened = browser.waitForTarget(target => target.type() === "page" && target.url() === `${origin}/prototype.pdf`);
  await panel.click(answerLink);
  await (await (await opened).page())?.close();
  await page.evaluate(() => history.pushState(null, "", "/projects"));
  const second = await ask("recycled steel");
  assert.deepEqual(second, {
    messages: [{ role: "user", content: "recycled steel" }],
    pageContext: { pathname: "/projects" },
  });
  await page.evaluate(() => history.pushState(null, "", "/unapproved"));
  assert.deepEqual(await ask("How was it tested?"), { messages: first.messages });
  assert.match(await panel.$eval("#output p", reply => reply.textContent ?? ""), /which project do you mean/iu);

  await page.setRequestInterception(true);
  page.on("request", async request => {
    if (new URL(request.url()).pathname === "/api/preview" && request.method() === "POST") {
      await request.respond({ status: 429, contentType: "text/plain", body: "Too Many Requests" });
    } else await request.continue();
  });
  await ask("What projects are featured?");
  assert.equal(await panel.$eval("#output p", reply => reply.textContent), "Too many requests. Please try again later.");

  await panel.click("#reset");
  assert.ok(await panel.waitForSelector("#welcome", { visible: true }));
});

test("source excerpts prefer a full phrase over a number shared by another project", async () => {
  const corpus = await buildKnowledgeCorpus([
    { access: "public", format: "rendered", page: { url: "/measurements", title: "Measurements", language: "en", kind: "page" },
      sections: [{ title: "500 samples", text: "The sensor recorded 500 samples." }] },
    { access: "public", format: "rendered", page: { url: "/research", title: "Research", language: "en", kind: "page" },
      sections: [{ title: "Market data", text: "The analysis used the F&X 500 index alongside rolling averages and public economic indicators." }] },
  ], "fixture", async () => {});
  const reply = await excerptReply(corpus, [{ role: "user", content: "F&X 500" }], "en");
  assert.match(reply.answer, /F&X 500/u);
  assert.deepEqual(reply.sources.map(source => source.url), ["/research"]);
});

test("local model preview sends differently worded questions with evidence and rejects invalid citations", async t => {
  const { request } = await startPreview(t, true);
  for (const question of ["What was the frame made from?", "Which material did the team choose?", "这个原型用了什么材料？"]) {
    const reply = await request(question);
    assert.equal(reply.status, 200);
    const result = await reply.json();
    assert.match(result.answer, /recycled steel|再生钢/u);
    assert.deepEqual(result.sources, [{ section: "Materials", href: `${portfolioOrigin}/projects#materials` }]);
  }
  for (const question of ["Which spacecraft flew past Neptune?", "Where is the imaginary laboratory?"]) {
    const reply = await request(question);
    assert.equal(reply.status, 200);
    const result = await reply.json();
    assert.match(result.answer, /does not provide enough information/);
    assert.deepEqual(result.sources, []);
  }
  // Failure probes still ask for relevant evidence so they reach the provider.
  // The unrelated questions above must independently abstain before generation.
  const wrongCitation = await request("Where is the imaginary laboratory for the recycled steel frame?");
  assert.equal(wrongCitation.status, 200);
  assert.deepEqual((await wrongCitation.json()).sources, []);
  const authFailure = await request("Simulate an authentication failure. What was the recycled steel frame made from?");
  assert.equal(authFailure.status, 502);
  const message = (await authFailure.json()).error;
  assert.match(message, /HTTP 401/);
  assert.doesNotMatch(message, /synthetic private provider details/);
  for (const issue of ["Simulate an answer with unexpected fields.", "Simulate too many recommendations."]) {
    const invalidResponse = await request(`${issue} What was the recycled steel frame made from?`);
    assert.equal(invalidResponse.status, 200);
    assert.deepEqual(await invalidResponse.json(), {
      answer: article,
      excerptFallback: true,
      sources: [{ section: "Materials", href: `${portfolioOrigin}/projects#materials` }],
    });
  }
});
