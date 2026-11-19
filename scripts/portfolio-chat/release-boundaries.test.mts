import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCorpus, type KnowledgeSource } from "../../lib/knowledge/contract";
import { b2Prompt, buildB2Pack, parsePageContext, validateB2 } from "../../lib/portfolio-chat/b2";
import { readPortfolioRequest } from "../../lib/portfolio-chat/request-body";

const source = (url: string, title: string, language: "en" | "ja", kind: "case-study" | "project-detail", text: string): KnowledgeSource => ({
  access: "public", format: "json", page: { url, title, language, kind, projectId: "lantern" },
  data: { sections: [{ title, text }] },
});
const marker = "</portfolio_data>";
const corpus = await buildKnowledgeCorpus([
  source("/a-lantern", "Lantern", "en", "case-study", "A public map for finding accessible routes. Example literal: " + marker),
  source("/lantern/process", "Design notes", "en", "project-detail", "The design team tested tactile signage."),
  source("/works/rantern", "ランタン", "ja", "case-study", "段差の少ない経路を案内する地図です。"),
], "fixture", async () => {});
const user = (content: string) => ({ role: "user" as const, content });

test("generic project details retain project context and localized overview chooses its own route", async () => {
  const detail = parsePageContext({ pathname: "/lantern/process", lang: "en" }, corpus);
  assert.equal(detail?.projectId, "lantern");
  const pack = await buildB2Pack(corpus, [user("Lanternとは何ですか？")], null, "ja");
  assert.equal(pack.intent, "PROJECT_OVERVIEW");
  assert.equal(pack.entries[0].chunk.sourceUrl, "/works/rantern");
});

test("evidence delimiters stay inside data and fabricated claims cannot acquire citations", async () => {
  const messages = [user("What is Lantern?")];
  const pack = await buildB2Pack(corpus, messages, null, "en");
  const prompt = b2Prompt(corpus, pack);
  assert.equal(prompt.split(marker).length - 1, 1);
  const evidence = prompt.split("\n").filter(line => line.startsWith('{"key"')).map(line => JSON.parse(line));
  assert.ok(evidence.some(entry => entry.text.includes(marker)));
  const result = validateB2({
    language: "en", insufficient: false, claims: [{ text: "Fabricated evidence", evidenceKeys: ["E999"] }], recommendedProjectIds: [],
  }, corpus, pack);
  assert.equal(result.insufficient, true);
  assert.deepEqual(result.sources, []);
});

test("shared body reader limits size and releases a stalled caller on cancellation", async () => {
  await assert.rejects(readPortfolioRequest(new Request("http://localhost", { method: "POST", body: "x".repeat(2049) + "\n" }), 2048), /too large/);
  const abort = new AbortController();
  const body = new ReadableStream({ start() {} });
  const request = new Request("http://localhost", { method: "POST", body, signal: abort.signal, duplex: "half" } as RequestInit);
  const reading = readPortfolioRequest(request, 2048);
  abort.abort();
  await assert.rejects(reading, /cancelled/);
});
