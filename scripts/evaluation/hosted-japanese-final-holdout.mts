import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { KnowledgeSource } from "../../lib/knowledge/contract";
import type { ChatMessage } from "../../lib/portfolio-chat/core";

// Frozen before the first run. Fictional portfolio text, reviewed by the
// author of these cases. This harness never calls a generative provider.
const root = process.env.PORTFOLIO_EVAL_ROOT ?? process.cwd();
const { buildKnowledgeCorpus } = await import(pathToFileURL(resolve(root, "lib/knowledge/contract.ts")).href);
const { prepareAnswer } = await import(pathToFileURL(resolve(root, "lib/portfolio-chat/answer-engine.ts")).href);
const { excerptReply } = await import(pathToFileURL(resolve(root, "lib/portfolio-chat/source-reply.ts")).href);

function project(id: string, title: string, sections: Array<{ title: string; anchor: string; text: string }>): KnowledgeSource {
  return { access: "public", format: "rendered", page: { url: `/work/${id}`, title, projectId: id, language: "en", kind: "case-study" }, sections };
}

const sources = [
  project("switchyard", "Switchyard", [
    { title: "Prototype evaluation", anchor: "trial", text: "The research team tested the gate display with passengers during a station trial. The feedback informed a larger transfer indicator." },
    { title: "Delivery", anchor: "release", text: "The display receives schedule changes from the local control room and continues to show the last received schedule when disconnected." },
  ]),
  project("reverie", "Reverie", [
    { title: "Gallery trial", anchor: "trial", text: "The tactile prototype was evaluated in a gallery workshop. Arts educators used the feedback to improve audio labels." },
    { title: "Design role", anchor: "role", text: "My role: I storyboarded the entrance sequence. A specialist audio team recorded the spoken descriptions." },
  ]),
  project("kiln", "Kiln", [
    { title: "Field trial", anchor: "trial", text: "Six studio workers tested the adjustable jig during a ceramics workshop. The team observed shorter setup times." },
    { title: "Fabrication", anchor: "fabrication", text: "The jig uses reclaimed plywood for the base and replaceable steel guides." },
  ]),
  project("bracken", "Bracken", [
    { title: "Research plan", anchor: "plan", text: "The team plans to test the market kiosk at three farms. Recruiting has started." },
    { title: "Prototype", anchor: "prototype", text: "The kiosk groups market stalls by available produce and dietary needs." },
  ]),
  project("wildwood", "Wildwood", [
    { title: "Status", anchor: "status", text: "The audit disputed that the team tested the wayfinding tool with visitors. No trial results were published." },
  ]),
  project("chervil", "Chervil", [
    { title: "Research status", anchor: "status", text: "The team never tested the ordering app in a community workshop." },
  ]),
  project("skyline", "Skyline", [
    { title: "Unrelated session", anchor: "session", text: "The team designed a queue card and ran a planning workshop. The pilot is scheduled for next season." },
  ]),
  { access: "protected", url: "/private" } satisfies KnowledgeSource,
];

const corpus = await buildKnowledgeCorpus(sources, "hosted-japanese-final-holdout-v1", async () => {});
const cases = [
  { id: "p1", prior: "Compare Switchyard and Reverie", q: "両方のプロジェクトはどう検証されましたか？", expected: ["/work/switchyard#trial", "/work/reverie#trial"] },
  { id: "p2", prior: "Kiln と Reverie を比べて", q: "それぞれの作品はどのようにテストされましたか？", expected: ["/work/kiln#trial", "/work/reverie#trial"] },
  { id: "p3", prior: "Compare Kiln and Switchyard", q: "両者のプロジェクトはどのように検証されましたか？", expected: ["/work/kiln#trial", "/work/switchyard#trial"] },
  { id: "p4", prior: "Compare Switchyard and Reverie", q: "How were both projects tested?", language: "en", expected: ["/work/switchyard#trial", "/work/reverie#trial"] },
  { id: "p5", prior: "对比 Kiln 和 Switchyard", q: "这两个项目分别如何测试？", language: "zh", expected: ["/work/kiln#trial", "/work/switchyard#trial"] },
  { id: "n1", prior: "Compare Bracken and Wildwood", q: "両方のプロジェクトはどう検証されましたか？", expected: [] },
  { id: "n2", prior: "Compare Chervil and Skyline", q: "両方の作品はどうテストされましたか？", expected: [] },
  { id: "n3", prior: "Compare Kiln and Wildwood", q: "両方のプロジェクトはどう検証されましたか？", expected: [] },
  { id: "n4", prior: "Compare Switchyard and Reverie", q: "両方のプロジェクトは火星でどう検証されましたか？", expected: [] },
  { id: "n5", prior: "Compare Switchyard and Reverie", q: "両方のプロジェクトはどう検証されませんでしたか？", expected: [] },
  { id: "n6", prior: "Compare Kiln and Switchyard", q: "両方のプロジェクトは潜水艦でどうテストされましたか？", expected: [] },
  { id: "n7", prior: "Compare Reverie and Switchyard", q: "両方のプロジェクトはどう検証されましたか？費用も教えてください。", expected: [] },
];

const rows = [];
for (const item of cases) {
  const language = item.language ?? "ja";
  const messages: ChatMessage[] = [{ role: "user", content: item.prior }, { role: "assistant", content: "Two separate projects." }, { role: "user", content: item.q }];
  const start = performance.now();
  const result = await prepareAnswer({ corpus, messages, language, config: { ownerName: "Example" } });
  const preparationMs = performance.now() - start;
  const excerpt = await excerptReply(corpus, messages, language);
  rows.push({ ...item, projects: result.pack.projects, modelPathEligible: result.answer === null,
    pack: result.pack.entries.map(({ chunk }: { chunk: { sourceUrl: string; chunkId: string } }) => ({ url: chunk.sourceUrl, id: chunk.chunkId })),
    excerptSources: excerpt.sources.map(({ url }: { url: string }) => url), preparationMs, excerptMs: performance.now() - start - preparationMs });
}
console.log(JSON.stringify({ corpusHash: corpus.contentHash, realModelCalls: 0, rows }, null, 2));
