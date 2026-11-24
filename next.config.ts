import type { NextConfig } from "next";

const config: NextConfig = {
  outputFileTracingIncludes: {
    "/**": ["./.portfolio-knowledge/hosted.json", "./scripts/portfolio-chat/local-preview/*"],
  },
};

export default config;
