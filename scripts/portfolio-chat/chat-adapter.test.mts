import test from "node:test";
import assert from "node:assert/strict";
import { requestPortfolioChat } from "../../components/portfolio-chat/chat-adapter";

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
