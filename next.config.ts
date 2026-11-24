import type { NextConfig } from "next";

const config: NextConfig = {
  outputFileTracingIncludes: {
    "/**": [
      "./.portfolio-knowledge/hosted.json",
      "./scripts/portfolio-chat/local-preview/*",
      "./scripts/portfolio-chat/local-preview/icons/*.svg",
      "./components/portfolio-chat/portfolio-chat-panel.module.css",
      "./node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
    ],
  },
};

export default config;
