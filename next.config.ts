import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Todas las imágenes usan la calidad por defecto (75), suficiente para el
    // Hero tras reoptimizar y mucho más ligera en la primera carga.
    qualities: [75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
    ],
  },
};

export default nextConfig;
