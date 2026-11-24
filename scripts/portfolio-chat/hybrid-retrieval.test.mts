import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCorpus } from "../../lib/knowledge/contract";
import { createEvidenceRetriever } from "../../lib/portfolio-chat/retrieval";
import { excerptReply, validateWidgetQuestion } from "../../lib/portfolio-chat/source-reply";

const observatory = "Visitors look at the night sky using two reflecting telescopes.";
const garden = "Volunteers grow mint and basil in the courtyard.";
const corpus = await buildKnowledgeCorpus([
  { access: "public", format: "rendered", page: { url: "/observatory", title: "Observatory", language: "en", kind: "page" },
    sections: [{ title: "Optical visits", anchor: "optics", text: observatory }] },
  { access: "public", format: "rendered", page: { url: "/garden", title: "Garden", language: "en", kind: "page" },
    sections: [{ title: "Herb beds", anchor: "herbs", text: garden }] },
], "fixture", async () => {});

const question = (content: string) => [{ role: "user" as const, content }];

test("the default retrieves an approved English excerpt for a Chinese question", async () => {
  const reply = await excerptReply(corpus, question("哪里可以用望远镜观察夜空？"), "zh");
  assert.equal(reply.answer, observatory);
  assert.deepEqual(reply.sources.map(source => source.url), ["/observatory#optics"]);
});

test("retrieval combines keyword and semantic scores for approved current passages", async () => {
  const optics = corpus.chunks.find(chunk => chunk.sectionId === "optics")!;
  const herbs = corpus.chunks.find(chunk => chunk.sectionId === "herbs")!;
  const vector = (cosine: number) => [cosine, Math.sqrt(1 - cosine * cosine)];
  const search = createEvidenceRetriever(async texts => texts.map(text => {
    assert.doesNotMatch(text, /old build|unapproved/u);
    if (text.includes(observatory)) return vector(0.52);
    if (text.includes(garden)) return vector(0.4);
    if (text.includes("Neptune")) return [-1, 0];
    return [1, 0];
  }));
  const fixture = {
    ...corpus,
    chunks: [...corpus.chunks,
      { ...optics, chunkId: "old", buildVersion: "old", content: "Stale\nThis paragraph is from an old build." },
      { ...herbs, chunkId: "unlisted", sourceUrl: "/unlisted", content: "Unlisted\nThis paragraph is unapproved." }],
  };
  const related = await search(fixture, question("Which courtyard contains edible plants?"));
  assert.equal(related.chunks[0].chunkId, herbs.chunkId);
  assert.ok(related.scores.get(herbs.chunkId)! > related.scores.get(optics.chunkId)!);
  const unrelated = await search(fixture, question("Where is Neptune located?"));
  assert.deepEqual(unrelated.chunks, []);
});

test("hybrid preserves exact terms and verified selections", async () => {
  const exact = await excerptReply(corpus, question("telescopes"), "en");
  assert.equal(exact.answer, observatory);
  const { messages, quote } = validateWidgetQuestion({
    messages: question("Explain"),
    selectionContext: { pagePath: "/garden", sectionId: "herbs", text: "mint and basil" },
  }, corpus);
  const selected = await excerptReply(corpus, messages, "en", quote);
  assert.equal(selected.answer, garden);
});
