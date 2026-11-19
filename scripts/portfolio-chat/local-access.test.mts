import test from "node:test";
import assert from "node:assert/strict";
import { isLocalDevRequest } from "../../lib/portfolio-chat/local-access";

test("local bypass requires explicit dev opt-in, loopback host and same-origin browser request", () => {
  const env = { NODE_ENV: "development", PORTFOLIO_AI_LOCAL_DEV: "1", PORTFOLIO_AI_LOOPBACK_BOUND: "1" };
  const request = (host: string, origin: string, site = "same-origin") => new Request("http://127.0.0.1:3000/api/portfolio-chat", { headers: { host, origin, "sec-fetch-site": site } });
  const local = request("127.0.0.1:3000", "http://127.0.0.1:3000");
  assert.equal(isLocalDevRequest(local, env), true);
  assert.equal(isLocalDevRequest(local, {...env, NODE_ENV: "production"}), false);
  assert.equal(isLocalDevRequest(local, {...env, VERCEL: "1"}), false);
  assert.equal(isLocalDevRequest(local, {...env, PORTFOLIO_AI_LOCAL_DEV: "0"}), false);
  assert.equal(isLocalDevRequest(local, {...env, PORTFOLIO_AI_LOOPBACK_BOUND: "0"}), false);
  assert.equal(isLocalDevRequest(request("example.com:3000", "http://example.com:3000"), env), false);
  assert.equal(isLocalDevRequest(request("127.0.0.1:3000", "http://evil.example", "cross-site"), env), false);
});
