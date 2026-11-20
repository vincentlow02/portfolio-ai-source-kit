const assert = require("node:assert/strict");
const delegate = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "fixture.supabase.co") {
    if (process.env.TEST_COLD_ADAPTERS === "1") throw new Error("Cold-start fixture must use its custom quota and analytics adapters");
    if (url.pathname.endsWith("/rpc/vincent_ai_reserve_quota")) {
      if (process.env.TEST_SECOND_QUOTA_MODE === "exhausted") return Response.json(false);
      if (process.env.TEST_SECOND_QUOTA_MODE === "unavailable") return new Response(null, { status: 503 });
      return Response.json(true);
    }
    const event = JSON.parse(init.body);
    assert.ok(!("messages" in event) && !("answer" in event));
    return new Response(null, { status: 201 });
  }
  if (url.hostname !== "second-model.invalid") return delegate(input, init);
  assert.ok(!process.env.TEST_SECOND_QUOTA_MODE, "model must not be called when quota fails");
  const body = JSON.parse(init.body);
  const prompt = body.messages.find(message => message.role === "system").content;
  assert.ok(!prompt.includes("Private fixture sentinel"));
  const entries = prompt.split("\n").flatMap(line => {
    try { const entry = JSON.parse(line); return entry.key && entry.text ? [entry] : []; } catch { return []; }
  });
  const evidence = entries.find(entry => entry.project === "orbit" && entry.text.includes("twelve visitors"));
  const output = { language: "en", insufficient: !evidence, claims: evidence ? [{ text: "The Orbit Garden team tested seating with twelve visitors.", evidenceKeys: [evidence.key] }] : [],
    recommendedProjectIds: [], followUpQuestions: evidence ? ["How was Orbit Garden tested?"] : [] };
  return Response.json({ id: "second-fixture", object: "chat.completion", created: 1700000000, model: "qwen3.7-flash",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 600, completion_tokens: 70, total_tokens: 670 } });
};
