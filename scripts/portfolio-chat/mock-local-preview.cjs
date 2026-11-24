const assert = require("node:assert/strict");

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assert.equal(url.hostname, "preview-fixture.invalid");
  const request = JSON.parse(init.body);
  const prompt = request.messages.find(message => message.role === "system").content;
  const question = request.messages.at(-1).content;
  assert.equal(request.response_format.type, "json_object");
  assert.equal(request.enable_thinking, false);
  const schema = JSON.parse(prompt.split("\n")[1]);
  assert.deepEqual(schema.required, ["language", "insufficient", "claims"]);
  assert.deepEqual(schema.properties.claims.items.required, ["text", "evidenceKeys"]);
  if (question.startsWith("Simulate an authentication failure.")) {
    return Response.json({ error: { code: "invalid_api_key", message: "synthetic private provider details" } }, { status: 401 });
  }
  const passage = prompt.split("\n").flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  }).find(entry => entry.text?.includes("recycled steel frame"));
  assert.ok(passage?.key, "The provider should receive captured portfolio evidence");
  const inChinese = question === "这个原型用了什么材料？";
  const answerable = inChinese || /(?:frame made from|material did the team choose)/u.test(question);
  const invalid = question.includes("imaginary laboratory");
  const malformed = question.startsWith("Simulate an answer with unexpected fields.");
  const output = malformed ? { text: "synthetic invalid answer" } : {
    language: inChinese ? "zh" : "en", insufficient: !answerable && !invalid,
    claims: answerable ? [{ text: inChinese ? "这个原型使用了再生钢框架。" : "The frame was made from recycled steel.", evidenceKeys: [passage.key] }]
      : invalid ? [{ text: "The laboratory is located in Berlin.", evidenceKeys: ["E99"] }] : [],
  };
  return Response.json({
    id: "local-preview-fixture", object: "chat.completion", created: 1700000000, model: "qwen3.7-flash",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 600, completion_tokens: 70, total_tokens: 670 },
  });
};
