import type { KnowledgeBuildConfig } from "./scripts/portfolio-knowledge/publish.mts";
export default {
  chatRoutes: ["/api/studio-assistant", "/api/studio-assistant/click"],
  sources: [
    { access: "public", format: "rendered", page: { url: "/", title: "Avery Park", language: "en", kind: "page" } },
    { access: "public", format: "rendered", page: { url: "/projects/orbit", title: "Orbit Garden", language: "en", kind: "case-study", projectId: "orbit" } },
    { access: "protected", url: "/drafts" },
  ],
} satisfies KnowledgeBuildConfig;
