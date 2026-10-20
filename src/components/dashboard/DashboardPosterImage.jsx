"use client";

// Póster del dashboard: el MISMO en todas las filas (MainDashboardClient y
// Continuar viendo / Calendario en móvil). Elige la ruta con la preferencia del
// usuario, la caché de la fila y `fetchBestPoster` (escalera de idioma en lote).

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import NextImage from "next/image";
import {
  buildImg,
  fetchBestPoster,
  getArtworkPreference,
} from "@/lib/dashboard/media";

const shimmer = {
  animate: {
    backgroundPosition: ["200% 0", "-200% 0"],
    transition: {
      duration: 8,
      ease: "linear",
      repeat: Infinity,
    },
  },
};

// Pósters ya pintados en esta sesión: al volver a montarse (volver atrás,
// fila que se recrea) se muestran sin esqueleto ni animación de entrada.
const loadedPosterSrcs = new Set();

// Caché de rutas para las filas que no traen la suya (`posterCacheRef`).
const sharedPosterCache = { current: new Map() };

/* ====================================================================
 * Portada (2:3) — SOLO en móvil: “3 por fila” completas (sin recorte)
 * ==================================================================== */
export default function PosterImage({
  movie,
  cache = sharedPosterCache,
  heightClass,
  isMobile,
  posterOverride,
  eager = false,
}) {
  const [posterPath, setPosterPath] = useState(null);

  useEffect(() => {
    let abort = false;

    const load = async () => {
      if (!movie) return;
      const mediaType =
        movie.media_type === "tv" ||
        (movie.name && !movie.title) ||
        movie.first_air_date
          ? "tv"
          : "movie";
      const posterCacheKey = `${mediaType}:${movie.id}`;
      const reveal = (path) => {
        if (abort) return;
        cache.current.set(posterCacheKey, path);
        setPosterPath(path);
      };

      const { poster: userPoster } = getArtworkPreference(movie.id);
      if (userPoster) return reveal(userPoster);

      const cached = cache.current.get(posterCacheKey);
      if (cached) return reveal(cached);

      // Si todavía NO sabemos si hay override (porque aún no cargó el fetch batch),
      // no pintamos el poster base: eso provoca el cambio visible base → final.
      if (posterOverride === undefined) {
        if (!abort) setPosterPath(null);
        return;
      }

      if (posterOverride) return reveal(posterOverride);

      if (!abort) setPosterPath(null);

      // Solo se ELIGE la ruta (en lote, ver `fetchBestPoster`); la imagen la
      // descarga el propio <img>. Antes cada tarjeta la precargaba con
      // `new Image()` antes de pintarse, y eso ignora `loading="lazy"`: al
      // llegar el arte se bajaban a la vez los pósters de TODAS las filas y las
      // tarjetas visibles se repartían el ancho de banda con las de fuera.
      const preferred = await fetchBestPoster(movie.id, mediaType, {
        originalLanguage: movie.original_language,
      });
      const chosen =
        preferred ||
        movie.poster_path ||
        movie.backdrop_path ||
        movie.profile_path ||
        null;

      reveal(chosen);
    };

    load();
    return () => {
      abort = true;
    };
  }, [movie, cache, posterOverride]);

  const src = posterPath ? buildImg(posterPath, "w342") : null;
  const [loadedSrc, setLoadedSrc] = useState(null);
  const loaded = !!src && (loadedSrc === src || loadedPosterSrcs.has(src));
  // Ya estaba pintado al montar: sin animación de entrada.
  const [mountedLoaded] = useState(loaded);
  const markLoaded = () => {
    if (!src) return;
    loadedPosterSrcs.add(src);
    setLoadedSrc(src);
  };
  const loading = eager ? "eager" : "lazy";

  const boxClass = isMobile ? "aspect-[2/3]" : heightClass;

  // El esqueleto queda DEBAJO hasta que la imagen ha cargado; la imagen se
  // monta en cuanto se conoce su ruta para que el navegador la pida ya.
  const placeholder = loaded ? null : (
    <div
      className={`absolute inset-0 rounded-lg overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900`}
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        variants={shimmer}
        animate="animate"
        style={{ backgroundSize: "200% 100%" }}
      />
    </div>
  );

  if (!src) {
    return <div className={`relative w-full ${boxClass}`}>{placeholder}</div>;
  }

  if (!isMobile) {
    return (
      <div className="relative w-full h-full">
        {placeholder}
        <motion.div
          initial={mountedLoaded ? false : { opacity: 0, scale: 0.9 }}
          animate={loaded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3 }}
          className="relative w-full h-full"
        >
          {/* Sin realce propio al pasar el cursor: la respuesta al hover es la
              vista previa, que arranca con una copia exacta de este póster
              (`usePreviewMorph`). Un oscurecido o brillo de hover no estaría en
              esa copia y el primer fotograma de la vista previa saltaría. */}
          <NextImage
            key={src}
            src={src}
            alt={movie.title || movie.name}
            fill
            sizes="(min-width:1280px) 210px, (min-width:768px) 190px, 140px"
            className="object-cover rounded-lg"
            loading={loading}
            onLoad={markLoaded}
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${boxClass}`}>
      {placeholder}
      <motion.div
        initial={mountedLoaded ? false : { opacity: 0 }}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={{ duration: 0.4 }}
        className={`relative w-full ${boxClass} rounded-lg overflow-hidden bg-neutral-900`}
      >
        <NextImage
          key={`blur:${src}`}
          src={src}
          alt=""
          aria-hidden="true"
          fill
          sizes="33vw"
          className="object-cover blur-xl opacity-35 scale-110"
          loading={loading}
        />
        <NextImage
          key={src}
          src={src}
          alt={movie.title || movie.name}
          fill
          sizes="33vw"
          className="object-contain"
          loading={loading}
          onLoad={markLoaded}
        />
      </motion.div>
    </div>
  );
}
