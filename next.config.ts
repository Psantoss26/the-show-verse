import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // El resto de imágenes usan 75 (por defecto). Mantenemos 100 declarada para
    // no romper chunks cacheados que aún la pidan; el Hero ya usa 75.
    qualities: [75, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
    ],
  },
};

export default nextConfig;
