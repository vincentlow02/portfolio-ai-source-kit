import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCorpus, normalizeKnowledgeSource, type KnowledgeSource } from "../../lib/knowledge/contract";

const fixtures = new URL("./fixtures/", import.meta.url);
const markdown = await readFile(new URL("lantern.md", fixtures), "utf8");
const mdx = await readFile(new URL("field-notes.mdx", fixtures), "utf8");
const json = JSON.parse(await readFile(new URL("lumen.json", fixtures), "utf8"));
const md = { access: "public", format: "markdown", text: markdown, anchors: { Research: "research" },
  page: { url: "/work/lantern", title: "Lantern", language: "en", kind: "case-study", projectId: "lantern" } } as const;
const docs: readonly KnowledgeSource[] = [
  md,
  { access: "public", format: "mdx", text: mdx,
    page: { url: "/journal/field-notes", title: "Field notes", language: "en", kind: "blog" } },
  { access: "public", format: "json", data: json,
    page: { url: "/work/lumen?lang=zh", title: "Lumen", language: "zh", kind: "case-study", projectId: "lumen" } },
  { access: "public", format: "rendered", sections: [{ title: "Profile", text: "I design navigational tools." }],
    page: { url: "/profile", title: "Profile", language: "en", kind: "page" } },
  { access: "protected", url: "/work/under-wraps" },
];

test("fictional sources share the existing public corpus format and stable IDs", async () => {
  const urls: string[] = [];
  const verify = async ({ page }: { page: { url: string } }) => { urls.push(page.url); };
  const corpus = await buildKnowledgeCorpus(docs, "b1", verify);
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.pages.length, 4);
  assert.equal(corpus.caseStudies.length, 2);
  assert.equal(urls.length, 4);
  assert.deepEqual(corpus.report.exclusions, [{ pathname: "/work/under-wraps", reason: "protected" }]);
  const research = corpus.chunks.find(chunk => chunk.sectionId === "research")!;
  assert.equal(research.sourceUrl, "/work/lantern#research");
  assert.equal(research.projectId, "lantern");
  assert.match(research.content, /tactile signs/u);
  assert.ok(corpus.chunks.every(chunk => chunk.accessLevel === "public" && chunk.buildVersion === corpus.contentHash && Buffer.byteLength(chunk.content) <= 3000));
  assert.deepEqual(await buildKnowledgeCorpus([...docs].reverse(), "b1", verify), corpus);
  const changed = await buildKnowledgeCorpus([{ ...md, text: md.text.replace("six libraries", "eight libraries") }, ...docs.slice(1)], "b2", verify);
  assert.notEqual(changed.contentHash, corpus.contentHash);
  assert.equal(changed.chunks.find(chunk => chunk.sectionId === "research")!.chunkId, research.chunkId);
});

test("ambiguous, private, unverifiable and dynamic sources fail explicitly", async () => {
  const pass = async () => {};
  assert.throws(() => normalizeKnowledgeSource({ ...md, format: "mdx", text: "import X from './x'\n\n<X />" }), /Unsupported mdxjsEsm/);
  assert.throws(() => normalizeKnowledgeSource({ ...md, format: "mdx", text: "Value: {process.env.ENVIRONMENT}" }), /Unsupported mdxTextExpression/);
  assert.throws(() => normalizeKnowledgeSource({ ...md, page: { ...md.page, url: "//external.example" } }), /Invalid portfolio source URL/);
  assert.throws(() => normalizeKnowledgeSource({ ...md, page: { ...md.page, url: "/private/lantern" } }), /Invalid portfolio source URL/);
  assert.throws(() => normalizeKnowledgeSource({ ...md, page: { ...md.page, url: "/work/lantern?lang=ja" } }), /language does not match/);
  await assert.rejects(buildKnowledgeCorpus([md, md], "b1", pass), /Duplicate source URL/);
  await assert.rejects(buildKnowledgeCorpus([md, { access: "protected", url: "/work" }], "b1", pass), /overlaps a protected route/);
  await assert.rejects(buildKnowledgeCorpus([md], "b1", async () => { throw new Error("Public verification failed"); }), /Public verification failed/);
});

test("long sections split across the B2 byte budget without dropping text", async () => {
  const word = "研究記録";
  const body = Array(900).fill(word).join(" ");
  const data = { sections: [{ title: "Research", anchor: "research", text: body }] };
  const corpus = await buildKnowledgeCorpus([{ ...md, format: "json", data }], "b1", async () => {});
  assert.ok(corpus.chunks.length > 1);
  assert.ok(corpus.chunks.every(chunk => Buffer.byteLength(chunk.content) <= 3000));
  assert.equal(corpus.chunks.map(chunk => chunk.content.split("\n")[1]).join(" "), body);
});
