import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadPortfolioCorpus } from "../portfolio-knowledge";
import { b2PublicCorpus, parsePageContext } from "./b2";
import { isLocalDevRequest } from "./local-access";
import { analyticsSession, defaultSessionCookie, validPublicOrigin } from "./session";
import { recordEvent } from "./supabase";
import { readPortfolioRequest } from "./request-body";

import type { PortfolioChatConfig } from "./engine-config";

export function createPortfolioClickHandler(config: PortfolioChatConfig) {
  return async function POST(request: Request) {
  if (!isLocalDevRequest(request, process.env) && !validPublicOrigin(request, process.env, config)) return new Response(null, { status: 401 });
  if (process.env.PORTFOLIO_AI_ANALYTICS !== "1") return new Response(null, { status: 204 });
  const cookie = config.sessionCookieName ?? defaultSessionCookie;
  if (!request.headers.get("cookie")?.split(";").some(part => part.trim().startsWith(cookie + "="))) return new Response(null, { status: 204 });
  let body: Record<string, unknown>;
  try {
    const value = await readPortfolioRequest(request, 2048);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid event body");
    body = value as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    if (Object.keys(body).some(key => !["projectId", "url", "pageContext"].includes(key)) || typeof body.projectId !== "string" || typeof body.url !== "string" || body.url.length > 500) return new Response(null, {status: 400});
    const corpus = b2PublicCorpus(await loadPortfolioCorpus(), (await readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim(), config);
    const page = parsePageContext(body.pageContext, corpus, config);
    const publicProject = corpus.caseStudies.some(project => project.projectId === body.projectId);
    const validTarget = corpus.caseStudies.some(project => project.projectId === body.projectId && project.url === body.url) || corpus.chunks.some(chunk => chunk.projectId === body.projectId && chunk.sourceUrl === body.url && chunk.sectionId && corpus.pages.some(p => p.url === chunk.sourceUrl.split("#")[0]));
    if (!publicProject || !validTarget) return new Response(null, {status: 400});
    await recordEvent({ session_id: analyticsSession(request, cookie).id, event_type: "recommendation_click", page_path: page?.path ?? "/", project_id: body.projectId }, process.env);
  } catch { /* Analytics must not affect navigation. */ }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
}
