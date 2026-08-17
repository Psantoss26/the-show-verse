import type { NextConfig } from "next";

// SELLO DE BUILD PARA EL SERVICE WORKER.
//
// El SW nombraba sus cachés con una constante escrita a mano (`VERSION = "v2"`).
// Como nadie la sube en cada despliegue, `activate` nunca borraba nada y las
// cachés acumulaban documentos y chunks de TODOS los builds anteriores. Al
// primer fallo de red o 5xx del origen (rutina con el NAS detrás del túnel), el
// SW servía un documento viejo y, con él, los chunks de aquel build —que seguían
// ahí en cache-first—: la app arrancaba ENTERA en una versión antigua. Eso es lo
// que hacía reaparecer el navbar de antes, con las secciones como iconos fijos y
// sin desplegable.
//
// Con un sello que cambia en cada build, el SW estrena nombre de caché por
// despliegue y `activate` se lleva los anteriores. `env` se inlinea en tiempo de
// build, así que cliente y SW ven el mismo valor.
//
// Se respeta un valor externo si el despliegue ya aporta uno estable (Vercel
// expone el SHA del commit); si no, la fecha del build sirve igual.
const SW_BUILD =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
  process.env.SOURCE_COMMIT?.slice(0, 12) ||
  String(Date.now());

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SW_BUILD: SW_BUILD,
  },
  // Salida "standalone" para autoalojar en Docker (imagen mínima con server.js).
  // Vercel la ignora sin problema, así que es seguro para ambos despliegues.
  output: "standalone",
  experimental: {
    viewTransition: true,
  },
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
