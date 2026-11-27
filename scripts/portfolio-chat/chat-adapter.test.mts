import test from "node:test";
import assert from "node:assert/strict";
import { requestPortfolioChat, type ChatTurn } from "../../components/portfolio-chat/chat-adapter";
import { validateMessages } from "../../lib/portfolio-chat/core";
import { readPortfolioRequest } from "../../lib/portfolio-chat/request-body";

test("adapter sends conversation and page context once without credentials", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, "/api/portfolio-chat");
    assert.deepEqual(JSON.parse(String(options?.body)), { messages: [{ role: "user", content: "Hello" }], pageContext: { pathname: "/about-me", lang: "en" } });
    assert.equal(new Headers(options?.headers).has("authorization"), false);
    return Response.json({ answer: "Hello", insufficient: false, sources: [], recommendations: [] });
  };
  assert.equal((await requestPortfolioChat([{ role: "user", content: "Hello" }], { pathname: "/about-me", lang: "en" }, undefined, fetcher)).answer, "Hello");
  assert.equal(calls, 1);
});

test("adapter keeps the latest complete turns, page and quote when UTF-8 history exceeds the server limit", async () => {
  const messages: ChatTurn[] = Array.from({ length: 4 }, (_, index): ChatTurn[] => [
    { role: "user", content: `问题${index} ${"研".repeat(1890)}` },
    { role: "assistant", content: `回答${index} ${"查".repeat(1890)}` },
  ]).flat();
  messages.push({ role: "user", content: "这段在说什么？" });
  const pageContext = { pathname: "/work/lantern", lang: "zh" as const };
  const selectionContext = { pagePath: pageContext.pathname, text: "引".repeat(1150), sectionId: "research" };
  const previousSuggestions = Array.from({ length: 36 }, (_, index) => `追问${index} ${"问".repeat(170)}`);
  assert.ok(Buffer.byteLength(JSON.stringify({ messages, pageContext, previousSuggestions, selectionContext })) > 32_000);

  const fetcher: typeof fetch = async (_url, options) => {
    const request = new Request("https://portfolio.example/api/portfolio-chat", { method: "POST", body: options?.body });
    const result = await readPortfolioRequest(request, 32_000) as { messages: ChatTurn[]; pageContext: unknown; selectionContext: unknown; previousSuggestions: string[] };
    assert.deepEqual(validateMessages(result.messages), messages.slice(-5));
    assert.deepEqual(result.pageContext, pageContext);
    assert.deepEqual(result.selectionContext, selectionContext);
    assert.ok(result.previousSuggestions.length > 0 && result.previousSuggestions.length < previousSuggestions.length);
    assert.deepEqual(result.previousSuggestions, previousSuggestions.slice(-result.previousSuggestions.length));
    return Response.json({ answer: "回答", insufficient: false, sources: [], recommendations: [] });
  };
  await requestPortfolioChat(messages, pageContext, undefined, fetcher, previousSuggestions, selectionContext);
  assert.equal(messages.length, 9);
  assert.equal(previousSuggestions.length, 36);
});

test("adapter fails safely on authorization and malformed responses", async () => {
  await assert.rejects(requestPortfolioChat([], { pathname: "/" }, undefined, async () => new Response(null, { status: 401 })), /temporarily unavailable/);
  await assert.rejects(requestPortfolioChat([], { pathname: "/" }, undefined, async () => Response.json({ answer: "bad" })), /invalid response/);
});

test("rate limiting is reported without retrying", async () => {
  let calls = 0;
  await assert.rejects(requestPortfolioChat([], { pathname: "/" }, undefined, async () => { calls++; return new Response(null, { status: 429 }); }), /Too many requests/);
  assert.equal(calls, 1);
});

test("adapter preserves server language and rejects invalid language metadata", async () => {
  const response = { answer:"中文回答", language:"zh", insufficient:false, sources:[], recommendations:[] };
  assert.equal((await requestPortfolioChat([], {pathname:"/",lang:"ja"}, undefined, async () => Response.json(response))).language, "zh");
  await assert.rejects(requestPortfolioChat([], {pathname:"/"}, undefined, async () => Response.json({...response,language:"unknown"})), /invalid response/);
});

test("adapter rejects malformed nested items and unsafe recommendation destinations", async () => {
  const response = { answer: "answer", insufficient: false, sources: [], recommendations: [] };
  for (const malformed of [
    { ...response, sources: [null] },
    { ...response, recommendations: [{ type: "section", projectId: "lantern", title: "Notes", url: "//example.invalid", caseStudyUrl: "/work/lantern", thumbnailUrl: null, alt: "" }] },
    { ...response, language: ["en"] },
  ]) {
    await assert.rejects(requestPortfolioChat([], undefined, undefined, async () => Response.json(malformed)), /invalid response/);
  }
});
