import type { NextConfig } from "next";
import { embeddingTraceExcludes, embeddingTraceIncludes } from "./lib/portfolio-chat/embedding-model.mjs";

const config: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ] }];
  },
  outputFileTracingIncludes: {
    "/api/studio-assistant": ["./.portfolio-knowledge/corpus.json", "./.next/BUILD_ID", ...embeddingTraceIncludes],
    "/api/studio-assistant/click": ["./.portfolio-knowledge/corpus.json", "./.next/BUILD_ID"],
  },
  outputFileTracingExcludes: { "/api/studio-assistant": embeddingTraceExcludes },
};
export default config;
