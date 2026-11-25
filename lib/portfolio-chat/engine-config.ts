import type { PortfolioCorpus } from "../portfolio-knowledge";
import type { EmbeddingProvider } from "./embeddings";
import type { ResponseLanguage } from "./language";

export type PortfolioChatConfig = {
  ownerName: string;
  embedding?: EmbeddingProvider;
  allowedPublicModels?: readonly string[];
  ownerAliases?: readonly string[];
  projectAliases?: Readonly<Record<string, readonly string[]>>;
  profilePath?: string;
  projectDirectoryPath?: string;
  homePath?: string;
  protectedSourcePrefixes?: readonly string[];
  supportedLanguages?: readonly ResponseLanguage[];
  preferredProjectOrder?: readonly string[];
  featuredProjects?: readonly string[];
  preferredFollowUpProject?: string;
  preferredFollowUpLabel?: string;
  caseStudyPath?: (id: string) => string;
  requireCaseStudyUnder?: string;
  publicOverviewPath?: string;
  excludeProfileSection?: string;
  catalogParentProject?: string;
  aiProjectEvidence?: Partial<Record<ResponseLanguage, RegExp>>;
  exactClaimEvidence?: readonly RegExp[];
  audienceEvidenceTerms?: readonly string[];
  publicOriginAliases?: Readonly<Record<string, readonly string[]>>;
  privateProjectName?: string;
  allowSelfHostedPublic?: boolean;
  sessionCookieName?: string;
};

const sourceOrigin = "https://portfolio.invalid";
export function sourcePath(url: string): string {
  return new URL(url, sourceOrigin).pathname;
}

export function isInternalSource(url: string): boolean {
  if (!/^\/(?!\/)/u.test(url) || /[\\\s\u0000-\u001f\u007f]/u.test(url)) return false;
  try { return new URL(url, sourceOrigin).origin === sourceOrigin; } catch { return false; }
}

export function projectPath(corpus: PortfolioCorpus, config: PortfolioChatConfig, id: string, language?: ResponseLanguage) {
  const page = corpus.caseStudies.find(project => project.projectId === id && project.language === language) ??
    corpus.caseStudies.find(project => project.projectId === id);
  return page ? sourcePath(page.url) : config.caseStudyPath?.(id);
}

export function replaceOwnerMentions(text: string, config: PortfolioChatConfig) {
  const aliases = [...new Set([config.ownerName, ...(config.ownerAliases ?? [])].filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  return aliases.reduce((result, alias) => {
    const escaped = alias.replace(/[.*+?^$(){}|[\]\\]/gu, "\\$&");
    return result.replace(new RegExp("(?<![a-z0-9])" + escaped + "(?![a-z0-9])", "giu"), "portfolioowner");
  }, text);
}


/** Keep the existing tool-specific grounding protection and allow hosts to add their own terms. */
export function audienceEvidenceTerms(config: PortfolioChatConfig) {
  return [...new Set(["Notion", "Miro", ...(config.audienceEvidenceTerms ?? [])].map(term => term.trim().toLowerCase()).filter(Boolean))];
}

export const defaultPortfolioChatConfig: PortfolioChatConfig = { ownerName: "the portfolio owner", profilePath: "/" };

export function portfolioLanguageTerms(config: PortfolioChatConfig): string[] {
  const projects = Object.entries(config.projectAliases ?? {}).flatMap(([id, aliases]) => [id, id.replaceAll("-", " "), ...aliases]);
  return [config.ownerName, ...(config.ownerAliases ?? []), ...projects];
}
