import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCorpus } from "../../lib/knowledge/contract";
import { buildB2Pack, parsePageContext, validateB2 } from "../../lib/portfolio-chat/b2";
import { createEvidenceRetriever, resolveContext } from "../../lib/portfolio-chat/retrieval";
import { createModelReply, excerptReply, validateWidgetQuestion } from "../../lib/portfolio-chat/source-reply";
import { prepareAnswer } from "../../lib/portfolio-chat/answer-engine";
import { verifySelection } from "../../lib/portfolio-chat/selection";

const observatory = "Visitors look at the night sky using two reflecting telescopes.";
const garden = "Volunteers grow mint and basil in the courtyard.";
const corpus = await buildKnowledgeCorpus([
  { access: "public", format: "rendered", page: { url: "/observatory", title: "Observatory", language: "en", kind: "page" },
    sections: [{ title: "Optical visits", anchor: "optics", text: observatory }] },
  { access: "public", format: "rendered", page: { url: "/garden", title: "Garden", language: "en", kind: "page" },
    sections: [{ title: "Herb beds", anchor: "herbs", text: garden }] },
], "fixture", async () => {});

const question = (content: string) => [{ role: "user" as const, content }];

test("unresolved pronouns clarify without selecting evidence in three languages", async () => {
  for (const [text, language] of [["How was it tested?", "en"], ["What does it do?", "en"], ["它是怎么测试的？", "zh"], ["它有什么功能？", "zh"], ["それはどうやってテストしましたか？", "ja"], ["それは何ですか？", "ja"]] as const) {
    const result = await prepareAnswer({ corpus, messages: question(text), language });
    assert.equal(result.answer?.clarification, true);
    assert.deepEqual(result.answer?.sources, []);
    const excerpt = await excerptReply(corpus, question(text), language);
    assert.deepEqual(excerpt.sources, []);
  }
});

test("clarification avoids reservation and respects explicit history and verified page context", async () => {
  const projects = await buildKnowledgeCorpus([
    { access:"public", format:"rendered", page:{url:"/work/alpha",title:"Alpha",language:"en",kind:"case-study",projectId:"alpha"}, sections:[{title:"Testing",anchor:"test",text:"Alpha was tested with volunteers."}] },
    { access:"public", format:"rendered", page:{url:"/work/beta",title:"Beta",language:"en",kind:"case-study",projectId:"beta"}, sections:[{title:"Testing",anchor:"test",text:"Beta was tested with gardeners."}] },
  ], "context-fixture", async () => {});
  const model = createModelReply(projects, { PORTFOLIO_AI_PROVIDER:"qwen", QWEN_API_KEY:"fixture-only", QWEN_BASE_URL:"https://fixture.invalid/v1", QWEN_MODEL:"qwen3.7-flash" });
  let reservations = 0;
  const reply = await model(question("How was it tested?"), "en", undefined, {reserve:async () => { reservations++; return true; }});
  assert.equal(reservations, 0);
  assert.match(reply.answer, /Which project/);
  const page = parsePageContext({pathname:"/work/alpha",lang:"en"}, projects);
  for (const [text, language] of [["How was it tested?","en"], ["它是怎么测试的？","zh"], ["それはどうやってテストしましたか？","ja"]] as const) {
    const pagePack = await buildB2Pack(projects, question(text), page, language);
    assert.equal(pagePack.ambiguous, false);
    assert.deepEqual(pagePack.projects, ["alpha"]);
    const history = [...question("Tell me about Alpha"), {role:"assistant" as const,content:"Alpha is a project."}, ...question(text)];
    assert.deepEqual(resolveContext(history, projects).projects, ["alpha"]);
    assert.equal(resolveContext(history, projects).ambiguous, false);
    const comparison = [...question("Compare Alpha and Beta"), {role:"assistant" as const,content:"Both were tested."}, ...question(text)];
    assert.equal((await buildB2Pack(projects, comparison, page, language)).ambiguous, true);
  }
  assert.equal(resolveContext(question("List all projects"), projects).ambiguous, false);
  assert.equal(resolveContext(question("Tell me about Alpha"), projects).ambiguous, false);
});

test("the default retrieves an approved English excerpt for a Chinese question", async () => {
  const reply = await excerptReply(corpus, question("哪里可以用望远镜观察夜空？"), "zh");
  assert.equal(reply.answer, observatory);
  assert.deepEqual(reply.sources.map(source => source.url), ["/observatory#optics"]);
});

test("evidence assembly preserves a qualified cross-language named-project match", async () => {
  const fixture = await buildKnowledgeCorpus([
    {access:"public",format:"rendered",page:{url:"/work/cairn",title:"Cairn",language:"en",kind:"case-study",projectId:"cairn"},sections:[
      {title:"Delivery",anchor:"delivery",text:"The exhibit stores audio descriptions on the kiosk itself, allowing visitors to listen when the network is disconnected."},
      {title:"Design",anchor:"design",text:"Large raised buttons give visitors tactile controls while a soft light confirms a selection."}]},
  ], "assembly-regression", async () => {});
  const pack = await buildB2Pack(fixture, question("Cairn の音声ガイドはオフラインでどう動きますか？"), null, "ja", undefined, undefined, {ownerName:"Example"});
  assert.ok(pack.entries.some(entry => entry.chunk.sourceUrl === "/work/cairn#delivery"));
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
  const selection = verifySelection({pagePath:"/garden",sectionId:"herbs",text:"mint and basil"},corpus,parsePageContext({pathname:"/garden",lang:"en"},corpus));
  const selectedAnswer = await prepareAnswer({corpus,messages:question("What is it?"),language:"en",selection});
  assert.equal(selectedAnswer.answer?.clarification, undefined);
  assert.ok(selectedAnswer.pack.entries.some(entry => entry.chunk.chunkId === selection.chunk.chunkId));
});

test("context carries one topic, resolves comparisons and resets on a named project switch", async () => {
  const projects = await buildKnowledgeCorpus([
    { access: "public", format: "rendered", page: { url: "/work/observatory", title: "Observatory", language: "en", kind: "case-study", projectId: "observatory" },
      sections: [{ title: "Optical visits", anchor: "optics", text: observatory }] },
    { access: "public", format: "rendered", page: { url: "/work/garden", title: "Garden", language: "en", kind: "case-study", projectId: "garden" },
      sections: [{ title: "Herb beds", anchor: "herbs", text: garden }] },
  ], "fixture", async () => {});
  const prior = [...question("Which reflecting telescopes did Observatory use?"), {role:"assistant" as const, content: "Two reflecting telescopes."}];
  const followUp = resolveContext([...prior, ...question("Why did they do that?")], projects);
  assert.deepEqual(followUp.projects, ["observatory"]);
  assert.match(followUp.topic, /reflecting telescopes/u);
  const comparison = await buildB2Pack(projects, [...prior, ...question("Compare it to Garden")], null);
  assert.deepEqual(comparison.projects, ["observatory", "garden"]);
  assert.deepEqual(resolveContext([...prior, ...question("How is it different from Garden?")], projects).projects, ["observatory", "garden"]);
  assert.deepEqual(new Set(comparison.entries.map(entry => entry.chunk.projectId)), new Set(["observatory", "garden"]));
  const ambiguous = resolveContext([...question("Compare Garden and Observatory"), prior[1], ...question("Why did they do that?")], projects);
  assert.equal(ambiguous.ambiguous, true);
  assert.deepEqual(ambiguous.projects, []);
  assert.equal(ambiguous.topic, "");
  const switched = resolveContext([...prior, ...question("What about the herbs at Garden?")], projects);
  assert.deepEqual(switched.projects, ["garden"]);
  assert.equal(switched.topic, "");
});

test("concurrent cold requests share embeddings and a failure falls back to unique literal public evidence", async () => {
  let corpusBatches = 0;
  let unavailable = true;
  const search = createEvidenceRetriever(async texts => {
    if (texts.length > 1) {
      corpusBatches++;
      await new Promise(resolve => setImmediate(resolve));
      if (unavailable) throw new Error("Encoder unavailable");
    }
    return texts.map(() => [1, 0]);
  });
  const [exact, broad] = await Promise.all([
    search(corpus, question("reflecting telescopes")),
    search(corpus, question("Which equipment did visitors use?")),
  ]);
  assert.equal(corpusBatches, 1);
  assert.equal(exact.fallback, true);
  assert.deepEqual(exact.qualifiedMatches.map(chunk => chunk.sourceUrl), ["/observatory#optics"]);
  assert.equal(broad.fallback, true);
  assert.deepEqual(broad.qualifiedMatches, []);
  unavailable = false;
  const recovered = await search(corpus, question("Which equipment did visitors use?"));
  assert.equal(corpusBatches, 2);
  assert.equal(recovered.fallback, false);
});

test("a resolved corpus embedding with invalid dimensions is rebuilt on the next request", async () => {
  let corpusBatches = 0;
  const search = createEvidenceRetriever(async texts => {
    if (texts.length > 1 && ++corpusBatches === 1) return texts.map(() => [1]);
    return texts.map(() => [1, 0]);
  });
  const messages = question("Which equipment did visitors use?");
  assert.equal((await search(corpus, messages)).fallback, true);
  assert.equal((await search(corpus, messages)).fallback, false);
  assert.equal(corpusBatches, 2);
});

test("specific research and materials questions reject unrelated public sections and forged claims", async () => {
  const project = await buildKnowledgeCorpus([{
    access: "public", format: "rendered",
    page: { url: "/work/lantern", title: "Lantern", language: "en", kind: "case-study", projectId: "lantern" },
    sections: [
      { title: "Research", anchor: "research", text: "The Lantern team interviewed ferry passengers to test tactile signage." },
      { title: "Display trial", anchor: "display", text: "The team tested LED displays by counting missed departures." },
      { title: "Materials", anchor: "materials", text: "The prototype was built from corrugated cardboard." },
    ],
  }], "fixture", async () => {});
  for (const query of ["Lantern survey on Neptune's orbital period?", "Which materials form Jupiter's core?",
    "What did the Lantern research find about Neptune's orbital period?"]) {
    const pack = await buildB2Pack(project, question(query), null);
    assert.deepEqual(pack.entries, [], query);
  }
  const followup = async (topic: string) => buildB2Pack(project, [
    ...question(`How does Lantern use ${topic}?`), { role: "assistant", content: "The project uses that design." },
    ...question("How did he validate that?"),
  ], null);
  const tactile = await followup("tactile signage");
  const display = await followup("LED displays");
  assert.equal(tactile.entries[0]?.chunk.sectionId, "research");
  assert.equal(display.entries[0]?.chunk.sectionId, "display");
  assert.notDeepEqual(tactile.entries, display.entries);
  const result = validateB2({ language: "en", insufficient: false, recommendedProjectIds: [],
    claims: [{ text: "Lantern found that Neptune's orbital period is 165 years.", evidenceKeys: [tactile.entries[0].key] }],
  }, project, tactile);
  assert.equal(result.insufficient, true);
});

test("a widget can retrieve explicitly relevant public catalog prose without structured project metadata", async () => {
  const brochure = await buildKnowledgeCorpus([{
    access: "public", format: "rendered",
    page: { url: "/work", title: "Public portfolio", language: "en", kind: "page" },
    sections: [{ title: "Projects", anchor: "projects", text: "This design portfolio lists three projects: a transit map, a library kiosk, and an accessible lighting prototype." }],
  }], "local-preview", async () => {});
  const messages = question("List the projects in this design portfolio.");
  const pack = await buildB2Pack(brochure, messages, null, "en", undefined, undefined, undefined, true);
  assert.equal(pack.catalog, null);
  assert.equal(pack.entries[0]?.chunk.sourceUrl, "/work#projects");
});
