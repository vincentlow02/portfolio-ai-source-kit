import type { NextConfig } from "next";
import { embeddingTraceExcludes, embeddingTraceIncludes } from "./lib/portfolio-chat/embedding-model.mjs";

const config: NextConfig = {
  outputFileTracingIncludes: {
    "/**": [
      "./.portfolio-knowledge/hosted.json",
      "./scripts/portfolio-chat/local-preview/*",
      "./scripts/portfolio-chat/local-preview/icons/*.svg",
      "./components/portfolio-chat/portfolio-chat-panel.module.css",
      "./node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
      ...embeddingTraceIncludes,
    ],
  },
  outputFileTracingExcludes: { "/**": embeddingTraceExcludes },
};

export default config;
