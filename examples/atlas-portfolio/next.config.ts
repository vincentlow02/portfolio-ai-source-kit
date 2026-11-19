import type { NextConfig } from "next";

const config: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ] }];
  },
  outputFileTracingIncludes: {
    "/api/studio-assistant": ["./.portfolio-knowledge/corpus.json", "./.next/BUILD_ID"],
    "/api/studio-assistant/click": ["./.portfolio-knowledge/corpus.json", "./.next/BUILD_ID"],
  },
};
export default config;
