import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // El Hero usa quality=100; Next 16 exige declarar todas las calidades
    // empleadas (75 es la de por defecto del resto de imágenes).
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
