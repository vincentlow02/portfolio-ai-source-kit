/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload runs before Next. */
const assert = require("node:assert/strict");
const delegate = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "fixture.supabase.co") {
    assert.equal(init.headers.apikey, "sb_secret_atlas_fixture");
    if (url.pathname.endsWith("/rpc/vincent_ai_reserve_quota")) return Response.json(true);
    const event = JSON.parse(init.body);
    assert.ok(!("messages" in event) && !("answer" in event));
    return new Response(null, { status: 201 });
  }
  if (url.hostname !== "atlas-model.invalid") return delegate(input, init);
  const request = JSON.parse(init.body);
  const prompt = request.messages.find(message => message.role === "system").content;
  const query = request.messages.filter(message => message.role === "user").at(-1).content;
  assert.ok(!/(?:undisclosed|requires access)/iu.test(prompt));
  const entries = prompt.split("\n").flatMap(line => {
    try { const item = JSON.parse(line); return item.key && item.text ? [item] : []; } catch { return []; }
  });
  const lantern = entries.find(entry => entry.project === "lantern" && /six libraries/u.test(entry.text));
  const signal = entries.find(entry => entry.project === "signal" && /colored arrival indicators/u.test(entry.text));
  if (query.includes("Cancellation fixture")) await new Promise(resolve => setTimeout(resolve, 2200));
  const claim = (text, evidence) => ({ text, evidenceKeys: [evidence.key] });
  const claims = [];
  if (/lantern|tactile|libraries|compare/u.test(query.toLowerCase()) && lantern) claims.push(claim("The Lantern team tested tactile signs at six libraries.", lantern));
  if (/signal/u.test(query.toLowerCase()) && signal) claims.push(claim("Signal uses colored arrival indicators.", signal));
  const output = { language: "en", insufficient: claims.length === 0, claims, recommendedProjectIds: [],
    followUpQuestions: claims.length ? ["What did the Lantern team test?"] : [] };
  return Response.json({ id: "fixture-atlas", object: "chat.completion", created: 1700000000, model: "qwen3.7-flash",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 600, completion_tokens: 70, total_tokens: 670 } });
};
