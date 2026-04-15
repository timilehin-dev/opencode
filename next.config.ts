import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "z-ai-web-dev-sdk",
    "@google/stitch-sdk",
  ],
};

export default nextConfig;
