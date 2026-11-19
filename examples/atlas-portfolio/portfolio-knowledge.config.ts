import type { KnowledgeBuildConfig } from "./scripts/portfolio-knowledge/publish.mts";

export default {
  chatRoutes: ["/api/studio-assistant", "/api/studio-assistant/click"],
  sources: [
    { access: "public", format: "rendered", page: { url: "/", title: "Morgan Reed", language: "en", kind: "page" } },
    { access: "public", format: "markdown", file: "notes/lantern.md", anchors: { Research: "research" },
      page: { url: "/work/lantern", title: "Lantern", language: "en", kind: "case-study", projectId: "lantern" } },
    { access: "public", format: "json", file: "notes/signal.json",
      page: { url: "/case-studies/signal", title: "Signal", language: "en", kind: "case-study", projectId: "signal" } },
    { access: "public", format: "mdx", file: "notes/field-notes.mdx",
      page: { url: "/journal/field-notes", title: "Field notes", language: "en", kind: "blog" } },
    { access: "protected", url: "/work/undisclosed" },
  ],
} satisfies KnowledgeBuildConfig;
