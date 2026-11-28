import type { NextConfig } from "next";
import { embeddingTraceExcludes, embeddingTraceIncludes } from "./lib/portfolio-chat/embedding-model.mjs";
const config: NextConfig = {
  outputFileTracingIncludes: {
    "/api/studio-assistant": ["./.portfolio-knowledge/corpus.json", "./.next/BUILD_ID", ...embeddingTraceIncludes],
    "/api/studio-assistant/click": ["./.portfolio-knowledge/corpus.json", "./.next/BUILD_ID"],
  },
  outputFileTracingExcludes: { "/api/studio-assistant": embeddingTraceExcludes },
};
export default config;
