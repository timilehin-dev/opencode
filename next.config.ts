import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  serverExternalPackages: [
    "z-ai-web-dev-sdk",
    "@google/stitch-sdk",
    "pg",
  ],
  poweredByHeader: false,
};

export default nextConfig;
