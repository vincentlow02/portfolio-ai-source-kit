import "server-only";
import type { PortfolioChatConfig } from "./lib/portfolio-chat/engine-config";

export const assistantConfig = {
  ownerName: "Morgan Reed",
  ownerAliases: ["Morgan"],
  profilePath: "/",
  supportedLanguages: ["en"],
  projectAliases: { lantern: ["Lantern Map"], signal: ["Signal Display"] },
  protectedSourcePrefixes: ["/work/undisclosed"],
} satisfies PortfolioChatConfig;
