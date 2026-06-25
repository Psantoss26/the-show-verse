import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Calidades que usa la app: 75 (por defecto cuando no se especifica),
    // 92 (ContinueWatchingSection) y 100 (FeaturedHero). Toda calidad usada por
    // un <Image> debe estar declarada aquí o Next avisa en consola.
    qualities: [75, 92, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
    ],
  },
};

export default nextConfig;
