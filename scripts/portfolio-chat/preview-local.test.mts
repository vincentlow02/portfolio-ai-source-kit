import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { on, once } from "node:events";
import { mkdir, mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { buildKnowledgeCorpus } from "../../lib/knowledge/contract";
import { excerptReply } from "../../lib/portfolio-chat/source-reply";

const portfolioOrigin = "http://127.0.0.1:5173";
const article = "The prototype used a recycled steel frame.";

async function startPreview(t: TestContext, model = false) {
  const corpus = await buildKnowledgeCorpus([{
    access: "public", format: "rendered",
    page: { url: "/projects", title: "Projects", language: "en", kind: "page" },
    sections: [{ title: "Materials", anchor: "materials", text: article }],
  }], "local-preview", async () => {});
  const root = await mkdtemp(join(tmpdir(), "portfolio-chat-preview-"));
  const directory = join(root, ".portfolio-knowledge");
  const file = join(directory, "local-preview.json");
  await mkdir(directory);
  await writeFile(file, JSON.stringify({ origin: portfolioOrigin, corpus }));
  const dependencies = new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
  const script = fileURLToPath(new URL("./preview-local.mts", import.meta.url));
  const fixture = fileURLToPath(new URL("./mock-local-preview.cjs", import.meta.url));
  const prefix = model ? ["--require", fixture] : [];
  const args = model ? ["--model"] : [];
  const child = spawn(process.execPath, [...prefix, "--import", dependencies, script, "--port", "0", ...args], {
    cwd: root, stdio: ["ignore", "pipe", "inherit"], windowsHide: true, env: {
      ...process.env,
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
    await unlink(file);
    await rmdir(directory);
    await rmdir(root);
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
  const { chatUrl, request } = await startPreview(t);
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
  assert.equal((await request("recycled steel", portfolioOrigin)).status, 403);
  assert.equal((await fetch(new URL(".portfolio-knowledge/local-preview.json", chatUrl))).status, 404);
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
  const authFailure = await request("Simulate an authentication failure.");
  assert.equal(authFailure.status, 502);
  const message = (await authFailure.json()).error;
  assert.match(message, /HTTP 401/);
  assert.doesNotMatch(message, /synthetic private provider details/);
  const invalidResponse = await request("Simulate an answer with unexpected fields.");
  assert.equal(invalidResponse.status, 502);
  const invalidMessage = (await invalidResponse.json()).error;
  assert.match(invalidMessage, /unexpected answer fields/);
  assert.doesNotMatch(invalidMessage, /synthetic invalid answer/);
});
