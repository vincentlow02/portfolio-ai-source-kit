import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCorpus, normalizeKnowledgeSource, validateSourcePlan, type KnowledgeSource } from "../../lib/knowledge/contract";

import { parsePortfolioCorpus } from "../../lib/knowledge/corpus";
import { b2PublicCorpus } from "../../lib/portfolio-chat/b2";

const exampleNotes = new URL("../../examples/atlas-portfolio/notes/", import.meta.url);
const markdown = await readFile(new URL("lantern.md", exampleNotes), "utf8");
const mdx = await readFile(new URL("field-notes.mdx", exampleNotes), "utf8");
const json = JSON.parse(await readFile(new URL("./fixtures/lumen.json", import.meta.url), "utf8"));
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

test("publication checks the whole source plan before verifying or reading any source body", async () => {
  const protectedRoute = { access: "protected", url: "/work?lang=ja" } as const;
  const unreadable = { ...md, get text(): string { throw new Error("Attempted to read protected content"); } };
  assert.throws(() => validateSourcePlan([unreadable, protectedRoute]), /overlaps a protected route/);
  await assert.rejects(buildKnowledgeCorpus([unreadable, protectedRoute], "b1", async () => {
    assert.fail("Attempted to verify a conflicting source");
  }), /overlaps a protected route/);
});

test("a rebuilt snapshot removes revoked passages and rejects stale or corrupted input", async () => {
  const verify = async () => {};
  const before = await buildKnowledgeCorpus(docs, "previous-build", verify);
  const revoked = { access: "protected", url: "/work/lantern" } as const;
  const after = await buildKnowledgeCorpus([revoked, ...docs.slice(1)], "next-build", verify);
  assert.notEqual(after.contentHash, before.contentHash);
  assert.deepEqual(parsePortfolioCorpus(after), after);
  const afterSanitized = b2PublicCorpus(after, "next-build");
  assert.ok(afterSanitized.report.exclusions.some(entry => entry.pathname === revoked.url));
  assert.ok(!afterSanitized.chunks.some(chunk => chunk.sourceUrl.startsWith(revoked.url)));
  assert.ok(!afterSanitized.caseStudies.some(project => project.projectId === "lantern"));
  assert.throws(() => b2PublicCorpus(before, "next-build"), /Corpus build mismatch/);
  assert.throws(() => parsePortfolioCorpus({ ...after, chunks: after.chunks.map(chunk => ({ ...chunk, content: chunk.content + " Altered." })) }), /content hash does not match/);
  assert.throws(() => parsePortfolioCorpus({ ...after, schemaVersion: 2 }), /missing or invalid/);
  assert.throws(() => parsePortfolioCorpus({ ...after, chunks: [...after.chunks, before.chunks[0]] }), /inconsistent passages/);
  assert.throws(() => parsePortfolioCorpus({ ...after, chunks: [{...after.chunks[0], sourceUrl: "/missing#stale"}] }), /inconsistent passages/);
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

async function splitFixture(text: string, language: "en" | "zh" | "ja" = "zh", title = "研究") {
  const url = `/work/chunk-fixture?lang=${language}`;
  return buildKnowledgeCorpus([{access:"public",format:"json",page:{url,title:"Fixture",language,kind:"case-study",projectId:"fixture"},
    data:{sections:[{title,anchor:"research",text}]}}],"chunk-build",async () => {});
}

function assertGraphemeBoundaries(body: string, pieces: string[]) {
  const boundaries = new Set([0]);
  for (const {index,segment} of new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(body)) boundaries.add(index + segment.length);
  let offset=0;
  for (const piece of pieces) { offset += piece.length; assert.ok(boundaries.has(offset),`split at grapheme offset ${offset}`); }
}

for (const [language, body] of [
  ["zh", "研究工作需要仔细观察使用者的行为和体验。".repeat(150)],
  ["ja", "研究では利用者の行動や体験を丁寧に観察します。".repeat(150)],
  ["zh", "English words 中文、日本語。" + "研究資料と利用者の体験。".repeat(200) + " end with English words."],
  ["ja", ("研究👩🏽‍💻家族👨‍👩‍👧‍👦旗🇯🇵か\u3099。".repeat(200))],
] as const) {
  test(`${language} long text reconstructs exactly with grapheme-safe splits`, async () => {
    const corpus = await splitFixture(body,language);
    const chunks = corpus.chunks;
    const pieces = chunks.map(chunk => chunk.content.slice(chunk.content.indexOf("\n") + 1));
    assert.ok(chunks.length > 1);
    assert.equal(pieces.join(""),body.replace(/\s+/gu," ").trim());
    assertGraphemeBoundaries(body.replace(/\s+/gu," ").trim(),pieces);
    assert.ok(chunks.every(chunk => Buffer.byteLength(chunk.content) <= 3000 && chunk.sourceUrl === `/work/chunk-fixture?lang=${language}#research` && chunk.sectionId === "research" && chunk.projectId === "fixture"));
    const repeated = await splitFixture(body,language);
    assert.deepEqual(chunks.map(chunk => chunk.chunkId),repeated.chunks.map(chunk => chunk.chunkId));
  });
}

test("UTF-8 byte limit includes the title at below, exact and above boundaries", async () => {
  for (const [size, expectedChunks] of [[2997,1],[2998,1],[2999,2]] as const) {
    const body = "a".repeat(size);
    const corpus = await splitFixture(body,"en","T");
    assert.equal(corpus.chunks.length,expectedChunks);
    assert.ok(corpus.chunks.every(chunk => Buffer.byteLength(chunk.content) <= 3000));
    assert.equal(corpus.chunks.map(chunk => chunk.content.slice(2)).join(""),body);
  }
});

test("a grapheme that cannot fit and malformed Unicode fail explicitly", async () => {
  await assert.rejects(splitFixture("a" + "\u0301".repeat(1600),"en","T"),/grapheme longer/);
  await assert.rejects(splitFixture("x" + "\ud800", "en", "T"),/invalid Unicode/);
});

test("combining marks attached to whitespace remain in the same grapheme at a chunk boundary", async () => {
  const body = "a".repeat(2998) + " \u0301x";
  const corpus = await splitFixture(body,"en","T");
  const pieces = corpus.chunks.map(chunk => chunk.content.slice(2));
  assert.equal(pieces.join(""),body);
  assertGraphemeBoundaries(body,pieces);
  assert.ok(corpus.chunks.every(chunk => Buffer.byteLength(chunk.content) <= 3000));
});

test("oversized multilingual text uses the documented whitespace normalization", async () => {
  const body = "前文".repeat(600) + " \t\n  English words。 " + "後文".repeat(600);
  const corpus = await splitFixture(body,"zh");
  assert.equal(corpus.chunks.map(chunk => chunk.content.slice(chunk.content.indexOf("\n") + 1)).join(""),body.replace(/\s+/gu," ").trim());
});

for (const format of ["markdown", "mdx"] as const) {
  test(`${format} preserves existing English word-boundary reconstruction`, async () => {
    const body = Array(800).fill("accessible navigation").join(" ");
    const corpus = await buildKnowledgeCorpus([{...md,format,text:`# Research\n\n${body}`}],"english-build",async () => {});
    assert.ok(corpus.chunks.length > 1);
    assert.equal(corpus.chunks.map(chunk => chunk.content.slice(chunk.content.indexOf("\n") + 1)).join(" "),body);
    assert.ok(corpus.chunks.every(chunk => Buffer.byteLength(chunk.content) <= 3000 && chunk.sourceUrl === "/work/lantern#research"));
  });
}
