import type { NextConfig } from "next";
const config: NextConfig = {
  outputFileTracingIncludes: {
    "/api/studio-assistant": ["./.portfolio-knowledge/corpus.json", "./.next/BUILD_ID"],
    "/api/studio-assistant/click": ["./.portfolio-knowledge/corpus.json", "./.next/BUILD_ID"],
  },
};
export default config;
