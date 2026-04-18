import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera una carpeta .next/standalone con todo lo necesario para Docker
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
    ],
  },
};

export default nextConfig;
