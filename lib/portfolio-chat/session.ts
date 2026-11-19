import "server-only";
import { randomUUID } from "node:crypto";

export const defaultSessionCookie = "portfolio_ai_session";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export function analyticsSession(request: Request, cookieName = defaultSessionCookie) {
  const existing = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const id = existing && uuid.test(existing) ? existing : randomUUID();
  const setCookie = existing === id ? null : `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  return { id, setCookie };
}

export { validPublicOrigin } from "./origin";
