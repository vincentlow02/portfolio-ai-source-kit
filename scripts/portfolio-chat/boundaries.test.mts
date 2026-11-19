import test from "node:test";
import assert from "node:assert/strict";
import type { PortfolioCorpus } from "../../lib/portfolio-knowledge";
import { retrieveEvidence } from "../../lib/portfolio-chat/retrieval";
import { RequestTiming } from "../../lib/portfolio-chat/timing";

test("retrieval works with a fictional public portfolio", async () => {
  const url = "/projects/atlas?lang=en";
  const corpus: PortfolioCorpus = {
    schemaVersion: 1, siteBuildId: "fictional-build", contentHash: "fictional-hash",
    pages: [{ url, title: "Atlas", language: "en", projectId: "atlas", kind: "case-study" }],
    caseStudies: [{ url, title: "Atlas", language: "en", projectId: "atlas" }],
    media: [], report: { exclusions: [] },
    chunks: [{ chunkId: "fictional-atlas", projectId: "atlas", pageTitle: "Atlas", sectionId: null,
      sectionTitle: "Atlas", language: "en", sourceUrl: url, accessLevel: "public",
      buildVersion: "fictional-hash", content: "Atlas\nA fictional accessibility mapping project." }],
  };
  const found = await retrieveEvidence(corpus, [{ role: "user", content: "Tell me about Atlas" }]);
  assert.deepEqual(found.projects, ["atlas"]);
  assert.deepEqual(found.chunks.map(chunk => chunk.chunkId), ["fictional-atlas"]);
});

test("timing is opt-in and logs only aggregate numeric fields", async () => {
  const messages: string[] = [];
  const original = console.info;
  console.info = (value: string) => { messages.push(value); };
  try {
    const off = new RequestTiming(false);
    await off.measure("knowledge", async () => 1);
    off.finish();
    assert.equal(messages.length, 0);
    const on = new RequestTiming(true);
    await on.measure("knowledge", async () => 1);
    on.record("retrieval", 2);
    on.record("assembly", 3);
    on.record("model", 4);
    on.usage(12, 5);
    on.finish();
    const event = JSON.parse(messages[0]);
    assert.deepEqual(Object.keys(event).sort(), ["apiOverheadMs", "event", "evidenceAssemblyMs", "inputTokens", "knowledgeMs", "modelMs", "outputTokens", "retrievalMs", "totalMs"].sort());
    assert.equal(event.event, "portfolio_ai_timing");
    assert.equal(event.inputTokens, 12);
    assert.equal(event.outputTokens, 5);
    for (const [key, value] of Object.entries(event)) if (key !== "event") assert.equal(typeof value, "number");
  } finally { console.info = original; }
});
