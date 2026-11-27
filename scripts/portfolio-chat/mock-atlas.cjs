/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload runs before Next. */
const assert = require("node:assert/strict");
const { appendFileSync } = require("node:fs");
const delegate = globalThis.fetch;
const mark = kind => {
  if (process.env.TEST_ATLAS_REQUEST_LOG) appendFileSync(process.env.TEST_ATLAS_REQUEST_LOG, kind + "\n");
};
let firewallChecks = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "assistant-fixture.vercel.app") {
    mark("firewall");
    assert.equal(url.pathname, "/.well-known/vercel/rate-limit-api/portfolio-ai-qwen");
    assert.equal(init.method, "GET");
    assert.equal(init.body, undefined);
    assert.match(new Headers(init.headers).get("x-vercel-rate-limit-key"), /^portfolio-ai-qwen-[a-f0-9]{64}$/u);
    const mode = process.env.TEST_ATLAS_FIREWALL_MODE;
    return new Response(null, { status: mode === "missing" ? 404 : mode === "unavailable" ? 503 : ++firewallChecks === 1 ? 204 : 429 });
  }
  if (url.hostname === "question-log-fixture.supabase.co") {
    assert.equal(url.pathname, "/rest/v1/portfolio_ai_question_log");
    assert.equal(init.method, "POST");
    assert.equal(new Headers(init.headers).get("apikey"), "sb_secret_question_log_fixture");
    mark("question-log " + JSON.stringify(JSON.parse(init.body)));
    return new Response(null, { status: 201 });
  }
  if (url.hostname === "fixture.supabase.co") {
    mark("supabase");
    assert.equal(init.headers.apikey, "sb_secret_atlas_fixture");
    if (url.pathname.endsWith("/rpc/vincent_ai_reserve_quota")) {
      const quota = JSON.parse(init.body);
      assert.equal(quota.p_minute_limit, 10);
      assert.equal(quota.p_daily_limit, 20);
      assert.equal(quota.p_daily_budget_usd, 2);
      assert.equal(quota.p_request_reservation_usd, 0.1007);
      if (process.env.TEST_ATLAS_QUOTA_MODE === "exhausted") return Response.json(false);
      if (process.env.TEST_ATLAS_QUOTA_MODE === "unavailable") return new Response(null, {status:503});
      return Response.json(true);
    }
    const event = JSON.parse(init.body);
    assert.ok(!("messages" in event) && !("answer" in event));
    return new Response(null, { status: 201 });
  }
  if (url.hostname !== "atlas-model.invalid") return delegate(input, init);
  mark("qwen");
  assert.ok(!process.env.TEST_ATLAS_QUOTA_MODE, "model must not be called when shared quota fails");
  if (process.env.TEST_ATLAS_PROVIDER_UNAVAILABLE) return new Response(null, { status: 503 });
  const request = JSON.parse(init.body);
  const prompt = request.messages.find(message => message.role === "system").content;
  const query = request.messages.filter(message => message.role === "user").at(-1).content;
  assert.ok(!/(?:undisclosed|requires access)/iu.test(prompt));
  const entries = prompt.split("\n").flatMap(line => {
    try { const item = JSON.parse(line); return item.key && item.text ? [item] : []; } catch { return []; }
  });
  const lantern = entries.find(entry => entry.project === "lantern" && /six libraries/u.test(entry.text));
  const lanternOverview = entries.find(entry => entry.project === "lantern" && /step-free routes/u.test(entry.text));
  const signal = entries.find(entry => entry.project === "signal" && /colored arrival indicators/u.test(entry.text));
  if (query.includes("Cancellation fixture")) await new Promise(resolve => setTimeout(resolve, 2200));
  const claim = (text, evidence) => ({ text, evidenceKeys: [evidence.key] });
  const claims = [];
  if (/compare/iu.test(query) && lanternOverview) claims.push(claim("Lantern helps people find step-free routes through public buildings.", lanternOverview));
  else if (/lantern|tactile|libraries/u.test(query.toLowerCase()) && lantern) claims.push(claim("The Lantern team tested tactile signs at six libraries.", lantern));
  if (/signal/u.test(query.toLowerCase()) && signal) claims.push(claim("Signal uses colored arrival indicators.", signal));
  const output = { language: "en", insufficient: claims.length === 0, claims, recommendedProjectIds: [],
    followUpQuestions: claims.length ? ["What did the Lantern team test?"] : [] };
  return Response.json({ id: "fixture-atlas", object: "chat.completion", created: 1700000000, model: "qwen3.7-flash",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 600, completion_tokens: 70, total_tokens: 670 } });
};
