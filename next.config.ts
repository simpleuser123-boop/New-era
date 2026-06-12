import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["obligations-titans-sheep-hosted.trycloudflare.com"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
