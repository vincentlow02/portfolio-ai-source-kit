import type { PortfolioCorpus } from "../portfolio-knowledge";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type B2Intent = "PERSONAL_OVERVIEW" | "PROJECT_OVERVIEW" | "PROJECT_ROLE" | "PROJECT_RESEARCH" | "PROJECT_LIST" | "COMPARISON" | "OTHER";
export type ModelAnswer = {
  answer: string;
  language: "en" | "zh" | "ja";
  insufficient: boolean;
  sourceIds: string[];
  recommendedProjectIds: string[];
};

export function validateMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) throw new Error("Invalid conversation");
  const messages = value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid message");
    const message = item as Record<string, unknown>;
    if (Object.keys(message).some((key) => key !== "role" && key !== "content") ||
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string" || !message.content.trim() || message.content.length > 2000) {
      throw new Error("Invalid message");
    }
    return { role: message.role, content: message.content.trim() };
  });
  if (messages[0].role !== "user" || messages.at(-1)?.role !== "user" ||
      messages.some((message, index) => index > 0 && message.role === messages[index - 1].role)) {
    throw new Error("Invalid conversation order");
  }
  return messages as ChatMessage[];
}

export function resolveRecommendations(ids: string[], corpus: PortfolioCorpus, language: "en" | "zh" | "ja", evidenceProjects?: Set<string | null>) {
  if (ids.length > 2) throw new Error("Too many recommendations");
  return [...new Set(ids)].map((id) => {
    if (evidenceProjects && !evidenceProjects.has(id)) throw new Error("Recommendation lacks project evidence");
    const candidates = corpus.caseStudies.filter((project) => project.projectId === id);
    const project = candidates.find((item) => item.language === language) ?? candidates.find((item) => item.language === "en");
    if (!project || !corpus.pages.some((page) => page.url === project.url && page.kind === "case-study")) {
      throw new Error("Project is not publicly recommendable");
    }
    const media = corpus.media?.find((item) => item.projectId === id);
    if (media && (!/^\/images\/[a-zA-Z0-9_./-]+$/u.test(media.thumbnailUrl) ||
        new URL(media.thumbnailUrl, "http://localhost").pathname !== media.thumbnailUrl)) {
      throw new Error("Invalid project media");
    }
    return { projectId: id, title: project.title, caseStudyUrl: project.url,
      thumbnailUrl: media?.thumbnailUrl ?? null, alt: media?.alt ?? "" };
  });
}

export function validateAnswer(output: ModelAnswer, corpus: PortfolioCorpus, ownerName?: string) {
  const fallbacks = {
    en: "{owner}published portfolio does not provide enough information to answer that.",
    zh: "{owner}公开作品集没有提供足够的信息来回答这个问题。",
    ja: "{owner}公開ポートフォリオには、この質問に答えるための十分な情報がありません。",
  };
  if (output.insufficient) return { answer: fallbacks[output.language].replace("{owner}", () => ownerName ? { en: ownerName + "'s ", zh: ownerName + " 的", ja: ownerName + "の" }[output.language] : { en: "The ", zh: "这份", ja: "この" }[output.language]), sources: [], recommendations: [] };
  const ids = [...new Set(output.sourceIds)];
  if (!ids.length || ids.length > 18 || output.recommendedProjectIds.length > 2) throw new Error("Invalid model references");
  const sources = ids.map((id) => {
    const chunk = corpus.chunks.find((item) => item.chunkId === id);
    if (!chunk) throw new Error("Unknown source ID");
    const pageUrl = chunk.sourceUrl.split("#")[0];
    if (!corpus.pages.some((page) => page.url === pageUrl)) throw new Error("Unknown source URL");
    return { id, title: chunk.pageTitle, section: chunk.sectionTitle, url: chunk.sourceUrl, projectId: chunk.projectId };
  });
  if (!output.answer.trim() || /(?:https?:\/\/|www\.|\]\s*\(|\/(?:api|projects|images|private)\/)/iu.test(output.answer)) {
    throw new Error("Invalid answer text");
  }
  const recommendations = resolveRecommendations(output.recommendedProjectIds, corpus, output.language,
    new Set(sources.map((source) => source.projectId)));
  return { answer: output.answer.trim(), sources, recommendations };
}
