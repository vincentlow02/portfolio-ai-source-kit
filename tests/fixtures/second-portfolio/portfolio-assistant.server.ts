import "server-only";
import type { PortfolioChatConfig } from "./lib/portfolio-chat/engine-config";
export const assistantConfig = {
  ownerName: "Avery Park", ownerAliases: ["Avery"], profilePath: "/", supportedLanguages: ["en"],
  projectAliases: { orbit: ["Orbit Garden"] }, protectedSourcePrefixes: ["/drafts"],
} satisfies PortfolioChatConfig;
