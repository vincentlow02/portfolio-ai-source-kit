import test from "node:test";
import assert from "node:assert/strict";
import { validPublicOrigin } from "../../lib/portfolio-chat/origin";

const env = { NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_URL: "fixture.vercel.app", PORTFOLIO_AI_PROTECTED_PREVIEW: "1" };
const request = (origin = "https://fixture.vercel.app", site = "same-origin") => new Request("https://fixture.vercel.app/api/portfolio-chat", { headers: { origin, "sec-fetch-site": site } });
test("preview is explicitly opted in and bound to its deployment origin", () => {
  assert.equal(validPublicOrigin(request(), env), true);
  assert.equal(validPublicOrigin(request(), { ...env, PORTFOLIO_AI_PROTECTED_PREVIEW: "0" }), false);
  assert.equal(validPublicOrigin(request(), { ...env, VERCEL_URL: undefined }), false);
  assert.equal(validPublicOrigin(request("https://attacker.example"), env), false);
  assert.equal(validPublicOrigin(request(undefined, "cross-site"), env), false);
  assert.equal(validPublicOrigin(request(), { ...env, VERCEL_ENV: "production" }), false);
});

test("self-hosted public access requires server opt-in and its exact HTTPS origin", () => {
  const production = { NODE_ENV: "production", PORTFOLIO_AI_PUBLIC_ENABLED: "1", PORTFOLIO_AI_PUBLIC_ORIGIN: "https://fixture.vercel.app" };
  const config = { ownerName: "Morgan", allowSelfHostedPublic: true };
  assert.equal(validPublicOrigin(request(), production, config), true);
  assert.equal(validPublicOrigin(request(), production, { ownerName: "Morgan" }), false);
  assert.equal(validPublicOrigin(request("https://other.example"), production, config), false);
  assert.equal(validPublicOrigin(request(), { ...production, PORTFOLIO_AI_PUBLIC_ENABLED: "0" }, config), false);
});
