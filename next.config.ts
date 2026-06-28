import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Optimización de imágenes de Vercel DESACTIVADA a propósito.
    //
    // Casi todas las imágenes de la app son posters/backdrops de TMDb, que ya
    // se sirven en tamaños listos (w185, w342, w500, w780, w1280, original)
    // desde el CDN de TMDb. Pasarlas por el optimizador de Vercel (/_next/image)
    // duplicaba el coste: Image Optimization (por imagen origen) + Fast Origin
    // Transfer (Vercel descarga de TMDb, transforma y reenvía al usuario). Con
    // `unoptimized` el navegador carga la imagen DIRECTAMENTE del CDN de TMDb
    // (cero coste en Vercel), usando el tamaño que ya elige cada componente vía
    // `buildImg(path, size)`. El resto de la app ya usaba <img>/OptimizedImage;
    // esto alinea los pocos `next/image` restantes con esa misma estrategia.
    unoptimized: true,
    // Inocuos con `unoptimized` (no hay optimizador que los lea); se conservan
    // por si en el futuro se reactiva la optimización para imágenes concretas.
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
