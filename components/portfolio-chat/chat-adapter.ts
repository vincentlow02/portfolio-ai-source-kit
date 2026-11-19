export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ChatPageContext = { pathname: string; lang?: "en" | "zh" | "ja"; sectionId?: string };
export type ChatSource = { id: string; title: string; section: string; url: string; projectId: string | null };
export type ChatRecommendation = { type: "project" | "section"; projectId: string; title: string; url: string; caseStudyUrl: string; thumbnailUrl: string | null; alt: string };
export type ChatResponse = { answer: string; insufficient: boolean; language?: "en" | "zh" | "ja"; sources: ChatSource[]; recommendations: ChatRecommendation[]; followUpQuestions?: string[] };

/** The endpoint remains authenticated. This adapter never receives server credentials. */
export async function requestPortfolioChat(messages: ChatTurn[], pageContext: ChatPageContext | undefined, signal?: AbortSignal, fetcher: typeof fetch = fetch, previousSuggestions?: string[], selectionContext?: { pagePath: string; text: string; sectionId: string | null }, endpoint = "/api/portfolio-chat"): Promise<ChatResponse> {
  if (!isSameOriginPath(endpoint)) throw new Error("Invalid portfolio chat endpoint.");
  const response = await fetcher(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, pageContext, ...(previousSuggestions ? { previousSuggestions } : {}), ...(selectionContext ? { selectionContext } : {}) }), signal, cache: "no-store",
  });
  if (!response.ok) throw new Error(response.status === 400 && selectionContext ? "This selection could not be verified. Please select a shorter passage on the current page." : response.status === 429 ? "Too many requests. Please try again later." : "The assistant is temporarily unavailable.");
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== "object" || !("answer" in data) || typeof data.answer !== "string" || !("insufficient" in data) || typeof data.insufficient !== "boolean" || !("sources" in data) || !Array.isArray(data.sources) || !data.sources.every(isSource) || !("recommendations" in data) || !Array.isArray(data.recommendations) || !data.recommendations.every(isRecommendation)) throw new Error("The assistant returned an invalid response.");
  if ("followUpQuestions" in data && (!Array.isArray(data.followUpQuestions) || data.followUpQuestions.length > 3 || data.followUpQuestions.some(item => typeof item !== "string"))) throw new Error("The assistant returned an invalid response.");
  if ("language" in data && !["en", "zh", "ja"].includes(data.language as string)) throw new Error("The assistant returned an invalid response.");
  return data as ChatResponse;
}

export function isSameOriginPath(url: string): boolean {
  return /^\/(?!\/)/u.test(url) && !/[\\\s\u0000-\u001f\u007f]/u.test(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLink(value: unknown): value is string {
  return typeof value === "string" && isSameOriginPath(value);
}

function isSource(value: unknown): value is ChatSource {
  return isRecord(value) && typeof value.id === "string" && typeof value.title === "string" &&
    typeof value.section === "string" && isLink(value.url) && (value.projectId === null || typeof value.projectId === "string");
}

function isRecommendation(value: unknown): value is ChatRecommendation {
  return isRecord(value) && (value.type === "project" || value.type === "section") &&
    typeof value.projectId === "string" && typeof value.title === "string" && typeof value.alt === "string" &&
    isLink(value.url) && isLink(value.caseStudyUrl) && (value.thumbnailUrl === null || isLink(value.thumbnailUrl));
}
