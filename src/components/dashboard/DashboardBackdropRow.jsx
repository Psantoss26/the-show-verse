"use client";

// /src/components/dashboard/DashboardBackdropRow.jsx
// Fila del dashboard de Inicio con tarjetas LANDSCAPE (16:9) para contenido
// genérico (películas + series mezcladas). Comparte el lenguaje visual de
// "Continuar viendo" (ContinueWatchingSection) y "Calendario"
// (DashboardCalendarSection): tarjeta base con backdrop + degradado inferior y,
// en escritorio, una vista previa estilo Netflix al hacer hover con backdrop
// ampliado + panel de info + botones (trailer / favorito / pendientes).
//
// La carga es ligera: el backdrop se resuelve enseguida (compartiendo la misma
// caché que el resto del dashboard) y los extras/logo/trailer solo se piden al
// hacer hover, ya que la tarjeta de vista previa se monta en ese momento.

import { useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper/modules";
import { AnimatePresence, motion } from "framer-motion";
import "swiper/swiper-bundle.css";
import Link from "next/link";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import {
  Play,
  Heart,
  BookmarkPlus,
  X,
  Award,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { getBackendItemStatus } from "@/lib/api/itemStatus";
import {
  markAsFavorite,
  markInWatchlist,
  getMovieDetails,
  getExternalIds,
} from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import { formatDashboardAwards } from "@/lib/details/awardsText";
import { useScrollRevealProps } from "@/lib/hooks/useHasScrolled";
import LiquidButton from "@/components/LiquidButton";
import { useDetailModal } from "@/components/dashboard/DetailModalProvider";

import {
  buildImg,
  fetchBestBackdrop,
  GENRES,
  PREVIEW_BACKDROP_SIZE,
  getBackdropCacheKey,
  movieBackdropCache,
  getPreviewBackdropFallback,
  getArtworkPreference,
  ratingOf,
  yearOf,
  formatRuntime,
  getMediaTypeForItem,
  getBestTrailerCached,
  movieExtrasCache,
  preloadImage,
} from "@/lib/dashboard/media";

/* =================== CONSTANTES / VARIANTES =================== */
const EMPTY_ARRAY = [];
// Mismo tamaño de backdrop que las previews del resto del dashboard, para que
// las imágenes ya cacheadas se reutilicen sin volver a descargar.
const BACKDROP_SIZE = PREVIEW_BACKDROP_SIZE;
// Set a nivel de módulo con las URLs de backdrop ya cargadas: evita el shimmer
// cuando una imagen ya se pintó antes (al volver a montar la tarjeta).
const loadedBackdropSrcs = new Set();

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

const shimmer = {
  animate: {
    backgroundPosition: ["200% 0", "-200% 0"],
    transition: { duration: 8, ease: "linear", repeat: Infinity },
  },
};

// Fundido de bordes del backdrop (idéntico al de las previews del dashboard).
const dashboardPreviewBackdropFadeStyle = {
  WebkitMaskImage:
    "radial-gradient(ellipse at center, black 76%, rgba(0,0,0,0.98) 90%, rgba(0,0,0,0.9) 100%)",
  maskImage:
    "radial-gradient(ellipse at center, black 76%, rgba(0,0,0,0.98) 90%, rgba(0,0,0,0.9) 100%)",
};

/* =================== HELPERS =================== */
const detailsHref = (item) =>
  `/details/${getMediaTypeForItem(item)}/${item?.id}`;

const genresText = (item) => {
  const ids =
    item?.genre_ids ||
    (Array.isArray(item?.genres) ? item.genres.map((g) => g.id) : []);
  const names = (Array.isArray(ids) ? ids : [])
    .map((id) => GENRES[id])
    .filter(Boolean);
  return names.slice(0, 2).join(" • ");
};

// Backdrop inicial (síncrono) para pintar algo desde el primer render sin
// esperar a la petición: preferencia del usuario → override → caché → backdrop
// que ya trae el propio item.
function getInitialItemBackdrop(item, backdropOverride) {
  if (!item?.id) return null;
  const mediaType = getMediaTypeForItem(item);
  const key = getBackdropCacheKey(item, mediaType);
  const { backdrop: userBackdrop } = getArtworkPreference(item.id, mediaType);
  if (userBackdrop) return userBackdrop;
  if (backdropOverride) return backdropOverride;
  const cached = movieBackdropCache.get(key);
  if (cached !== undefined) return cached;
  return getPreviewBackdropFallback(item);
}

// Resuelve el mejor backdrop del título compartiendo `movieBackdropCache` con el
// resto del dashboard. Mismo criterio que InlinePreviewCard (rama no-spotlight).
function useItemBackdrop(item, backdropOverride) {
  const mediaType = getMediaTypeForItem(item);
  const [backdropPath, setBackdropPath] = useState(() =>
    getInitialItemBackdrop(item, backdropOverride),
  );

  useEffect(() => {
    let abort = false;
    if (!item?.id) return undefined;

    const type = getMediaTypeForItem(item);
    const key = getBackdropCacheKey(item, type);
    const reveal = (path) => {
      if (!abort) setBackdropPath(path);
    };

    const { backdrop: userBackdrop } = getArtworkPreference(item.id, type);
    if (userBackdrop) {
      movieBackdropCache.set(key, userBackdrop);
      reveal(userBackdrop);
      return () => {
        abort = true;
      };
    }
    if (backdropOverride) {
      movieBackdropCache.set(key, backdropOverride);
      reveal(backdropOverride);
      return () => {
        abort = true;
      };
    }
    const cached = movieBackdropCache.get(key);
    if (cached !== undefined) {
      reveal(cached);
      return () => {
        abort = true;
      };
    }

    (async () => {
      try {
        const preferred = await fetchBestBackdrop(item.id, type);
        const chosen = preferred || getPreviewBackdropFallback(item);
        movieBackdropCache.set(key, chosen);
        if (chosen) await preloadImage(buildImg(chosen, BACKDROP_SIZE));
        reveal(chosen);
      } catch {
        const fallback = getPreviewBackdropFallback(item);
        movieBackdropCache.set(key, fallback);
        reveal(fallback);
      }
    })();

    return () => {
      abort = true;
    };
  }, [item, backdropOverride]);

  return { backdropPath, mediaType };
}

/* ====================================================================
 * Tarjeta base (sin hover): backdrop 16:9 + degradado inferior con título
 * y badge de nota. Shimmer mientras carga la imagen.
 * ==================================================================== */
function BackdropBaseCard({ item, backdropOverride }) {
  const { backdropPath } = useItemBackdrop(item, backdropOverride);
  const bgSrc = backdropPath ? buildImg(backdropPath, BACKDROP_SIZE) : null;

  const [imgReady, setImgReady] = useState(() =>
    bgSrc ? loadedBackdropSrcs.has(bgSrc) : false,
  );
  useEffect(() => {
    setImgReady(bgSrc ? loadedBackdropSrcs.has(bgSrc) : false);
  }, [bgSrc]);
  const markImageReady = () => {
    if (bgSrc) loadedBackdropSrcs.add(bgSrc);
    setImgReady(true);
  };

  const title = item?.title || item?.name || "";

  // Tarjeta backdrop LIMPIA: sin título ni nota encima de la portada (esa info va
  // solo en el pop-out al hover). El backdrop ya suele traer su propio logo/título.
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-neutral-900">
      {!imgReady && (
        <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900">
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
            variants={shimmer}
            animate="animate"
            style={{ backgroundSize: "200% 100%" }}
          />
        </div>
      )}

      {bgSrc && (
        <NextImage
          key={bgSrc}
          src={bgSrc}
          alt={title}
          fill
          sizes="(min-width:1280px) 338px, (min-width:768px) 300px, 224px"
          className={`object-cover transition-opacity duration-200 ${
            imgReady ? "opacity-100" : "opacity-0"
          }`}
          loading="eager"
          onLoad={markImageReady}
        />
      )}
    </div>
  );
}

/* ====================================================================
 * Tarjeta hover (solo escritorio): vista previa estilo Netflix con backdrop
 * ampliado (16:9) + panel de info (logo/título · metadatos · acciones).
 * Acciones GENÉRICAS: ▶ trailer · ❤ favorito · 🔖 pendientes.
 * ==================================================================== */
function BackdropPreviewCard({
  item,
  backdropOverride,
  index,
  totalCount,
  activeIndex,
  perView = 6,
  onPreviewMouseEnter,
  onPreviewMouseLeave,
}) {
  const { session, account } = useAuth();
  const router = useRouter();
  const { openDetailModal } = useDetailModal();
  const mediaType = getMediaTypeForItem(item);
  const { backdropPath } = useItemBackdrop(item, backdropOverride);

  const [extras, setExtras] = useState(
    () =>
      movieExtrasCache.get(item?.id) || {
        runtime: null,
        awards: null,
        imdbRating: null,
        overview: null,
      },
  );

  const [loadingStates, setLoadingStates] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const trailerIframeRef = useRef(null);

  const prefetchedRef = useRef(false);
  const href = detailsHref(item);

  // Estado favorito/pendientes en el backend.
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!item || !session || !account?.id) {
        setFavorite(false);
        setWatchlist(false);
        return;
      }
      try {
        setLoadingStates(true);
        const st = await getBackendItemStatus({
          type: mediaType,
          tmdbId: item.id,
        });
        if (!cancel) {
          setFavorite(!!st.favorite);
          setWatchlist(!!st.watchlist);
        }
      } catch {
        // silencio
      } finally {
        if (!cancel) setLoadingStates(false);
      }
    };
    load();
    return () => {
      cancel = true;
    };
  }, [item, session, account, mediaType]);

  // Extras: duración/temporadas, premios (OMDb), nota IMDb y sinopsis. Mismo
  // criterio y forma de caché que InlinePreviewCard, para compartir la caché.
  useEffect(() => {
    let abort = false;
    if (!item?.id) return undefined;

    const cachedExtras = movieExtrasCache.get(item.id);
    if (cachedExtras) {
      setExtras(cachedExtras);
      return undefined;
    }

    (async () => {
      try {
        let runtime = null;
        let overview = null;
        try {
          if (mediaType === "movie") {
            const details = await getMovieDetails(item.id);
            runtime = details?.runtime ?? null;
            overview =
              (typeof details?.overview === "string" &&
                details.overview.trim()) ||
              null;
          } else {
            const response = await fetch(
              `https://api.themoviedb.org/3/tv/${item.id}?append_to_response=external_ids&api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
            );
            if (response.ok) {
              const details = await response.json();
              overview =
                (typeof details?.overview === "string" &&
                  details.overview.trim()) ||
                null;
              if (details.number_of_seasons) {
                runtime = `${details.number_of_seasons} Temp.`;
                if (details.number_of_episodes) {
                  runtime += ` · ${details.number_of_episodes} Eps.`;
                }
              }
            }
          }
        } catch {}

        let awards = null;
        let imdbRating = null;
        try {
          let imdb = item?.imdb_id;
          if (!imdb) {
            const ext = await getExternalIds(mediaType, item.id);
            imdb = ext?.imdb_id || null;
          }
          if (imdb) {
            const [omdb, imdbDataset] = await Promise.all([
              fetchOmdbByImdb(imdb),
              fetchImdbRatingByImdb(imdb),
            ]);
            const rawAwards = omdb?.Awards;
            if (rawAwards && typeof rawAwards === "string" && rawAwards.trim()) {
              awards = formatDashboardAwards(rawAwards);
            }
            if (typeof imdbDataset?.rating === "number") {
              imdbRating = imdbDataset.rating;
            }
          }
        } catch {}

        const next = { runtime, awards, imdbRating, overview };
        movieExtrasCache.set(item.id, next);
        if (!abort) setExtras(next);
      } catch {
        if (!abort) {
          setExtras({
            runtime: null,
            awards: null,
            imdbRating: null,
            overview: null,
          });
        }
      }
    })();

    return () => {
      abort = true;
    };
  }, [item, mediaType]);

  const prefetchHref = () => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    router.prefetch(href);
  };

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = `/login?next=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
      return true;
    }
    return false;
  };

  const handleToggleFavorite = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating || !item) return;
    try {
      setUpdating(true);
      setError("");
      const next = !favorite;
      setFavorite(next);
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: item.id,
        favorite: next,
        title: item.title || item.name,
        posterPath: item.poster_path || item.backdrop_path || null,
      });
    } catch {
      setFavorite((v) => !v);
      setError("No se pudo actualizar favoritos.");
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleWatchlist = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating || !item) return;
    try {
      setUpdating(true);
      setError("");
      const next = !watchlist;
      setWatchlist(next);
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: item.id,
        watchlist: next,
        title: item.title || item.name,
        posterPath: item.poster_path || item.backdrop_path || null,
      });
    } catch {
      setWatchlist((v) => !v);
      setError("No se pudo actualizar pendientes.");
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleTrailer = async (e) => {
    e.stopPropagation();
    if (showTrailer) {
      setShowTrailer(false);
      return;
    }
    try {
      setTrailerLoading(true);
      setError("");
      const t = await getBestTrailerCached(item.id, mediaType);
      if (!t?.key) {
        setTrailer(null);
        setShowTrailer(false);
        setError("No hay trailer disponible para este título.");
        return;
      }
      setTrailer(t);
      setShowTrailer(true);
    } catch {
      setTrailer(null);
      setShowTrailer(false);
      setError("No se pudo cargar el trailer.");
    } finally {
      setTrailerLoading(false);
    }
  };

  const bgSrc = backdropPath ? buildImg(backdropPath, BACKDROP_SIZE) : null;
  const title = item?.title || item?.name || "";
  const tmdbRating = ratingOf(item);
  const hasTmdbRating = tmdbRating !== "–";
  const genres = genresText(item);

  const trailerSrc = trailer?.key
    ? `https://www.youtube-nocookie.com/embed/${trailer.key}` +
      `?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` +
      `&controls=0&iv_load_policy=3&disablekb=1&fs=0` +
      `&enablejsapi=1&origin=${
        typeof window !== "undefined"
          ? encodeURIComponent(window.location.origin)
          : ""
      }`
    : null;

  // Alineación de la vista previa según la tarjeta y las visibles del breakpoint.
  const activeIdx = typeof activeIndex === "number" ? activeIndex : 0;
  const visibleCount = Number.isFinite(perView) && perView > 0 ? perView : 6;
  const isLeftBoundary = index === activeIdx || index === 0;
  const isRightBoundary =
    index === activeIdx + visibleCount - 1 || index === totalCount - 1;

  let alignmentClass = "left-1/2 -translate-x-1/2";
  let transformOrigin = "center center";
  if (isLeftBoundary) {
    alignmentClass = "left-0";
    transformOrigin = "left center";
  } else if (isRightBoundary) {
    alignmentClass = "right-0";
    transformOrigin = "right center";
  }

  const previewWidthPercent =
    visibleCount <= 3
      ? 160
      : visibleCount === 4
        ? 158
        : visibleCount === 5
          ? 156
          : 154;
  const previewScale = 1.04;
  const previewMaxWidth =
    visibleCount >= 6 ? "min(156%, 560px)" : `${previewWidthPercent}%`;
  const previewImageSizes =
    visibleCount <= 3
      ? "(min-width:1280px) 620px, (min-width:768px) 540px, 440px"
      : visibleCount === 4
        ? "(min-width:1280px) 560px, (min-width:768px) 500px, 420px"
        : "(min-width:1536px) 560px, (min-width:1280px) 500px, 420px";

  const previewBtnClass = "!h-9 !w-9 sm:!h-10 sm:!w-10 [&_svg]:!h-5 [&_svg]:!w-5";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 0 }}
      animate={{ opacity: 1, scale: previewScale, y: -8 }}
      exit={{
        opacity: 0,
        scale: 0.9,
        y: 0,
        transition: { duration: 0.15, ease: "easeInOut" },
      }}
      transition={{ type: "spring", stiffness: 180, damping: 20, mass: 0.8 }}
      className={`absolute top-1/2 -translate-y-1/2 ${alignmentClass} z-50 flex cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141414]/95 text-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] backdrop-blur-xl`}
      onClick={() => router.push(href)}
      onMouseEnter={(event) => {
        onPreviewMouseEnter?.(event);
        prefetchHref();
      }}
      onMouseLeave={onPreviewMouseLeave}
      onFocus={prefetchHref}
      style={{
        width: previewMaxWidth,
        willChange: "transform, opacity",
        transformOrigin,
      }}
    >
      {/* Backdrop ampliado 16:9 (+ trailer al pulsar ▶) */}
      <div className="relative aspect-video w-full overflow-hidden bg-neutral-900">
        {!showTrailer && !bgSrc && (
          <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
              variants={shimmer}
              animate="animate"
              style={{ backgroundSize: "200% 100%" }}
            />
          </div>
        )}

        {!showTrailer && bgSrc && (
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: 1.08 }}
            transition={{ duration: 4, ease: "easeOut" }}
            className="absolute inset-0 h-full w-full"
          >
            <NextImage
              key={bgSrc}
              src={bgSrc}
              alt={title}
              fill
              sizes={previewImageSizes}
              className="object-cover"
              style={dashboardPreviewBackdropFadeStyle}
              loading="eager"
            />
          </motion.div>
        )}

        {showTrailer && (
          <>
            {(trailerLoading || !trailerSrc) && (
              <div className="absolute inset-0 animate-pulse bg-neutral-900" />
            )}
            {trailerSrc && (
              <div className="absolute inset-0 overflow-hidden">
                <iframe
                  key={trailer.key}
                  ref={trailerIframeRef}
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[180%] w-[140%] -translate-x-1/2 -translate-y-1/2"
                  src={trailerSrc}
                  title={`Trailer - ${title}`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen={false}
                  onLoad={() => {
                    try {
                      const win = trailerIframeRef.current?.contentWindow;
                      if (!win) return;
                      const target = "https://www.youtube-nocookie.com";
                      const cmd = (func, args = []) =>
                        win.postMessage(
                          JSON.stringify({ event: "command", func, args }),
                          target,
                        );
                      setTimeout(() => {
                        cmd("unMute");
                        cmd("setVolume", [30]);
                      }, 120);
                    } catch {}
                  }}
                />
              </div>
            )}
          </>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      </div>

      {/* Panel de info: logo/título · metadatos · acciones */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.25, ease: "easeOut" }}
        className="w-full border-t border-white/5 bg-[#141414]/95 px-4 py-3.5 backdrop-blur-md sm:px-5 sm:py-4"
      >
        <div className="mb-2.5 min-w-0">
          {/* Título en texto normal (como en "Continuar viendo"), sin logo. */}
          <h3 className="truncate text-base font-black leading-tight text-white sm:text-lg">
            {title}
          </h3>
        </div>

        {/* Fila de acciones: trailer + favorito + pendientes */}
        <div className="mb-3 flex items-center gap-2 sm:gap-2.5">
          <LiquidButton
            onClick={handleToggleTrailer}
            loading={trailerLoading}
            active
            activeColor="yellow"
            groupId="dashboard-backdrop-actions"
            title={showTrailer ? "Cerrar trailer" : "Ver trailer"}
            className={`!bg-white !text-black ${previewBtnClass}`}
          >
            {showTrailer ? (
              <X className="text-black" />
            ) : (
              <Play className="ml-0.5 fill-current text-black" />
            )}
          </LiquidButton>

          <LiquidButton
            onClick={handleToggleFavorite}
            loading={loadingStates || updating}
            active={favorite}
            activeColor="red"
            groupId="dashboard-backdrop-actions"
            title={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
            className={previewBtnClass}
          >
            <Heart className={favorite ? "fill-current" : ""} />
          </LiquidButton>

          <LiquidButton
            onClick={handleToggleWatchlist}
            loading={loadingStates || updating}
            active={watchlist}
            activeColor="blue"
            groupId="dashboard-backdrop-actions"
            title={watchlist ? "Quitar de pendientes" : "Añadir a pendientes"}
            className={previewBtnClass}
          >
            <BookmarkPlus className={watchlist ? "fill-current" : ""} />
          </LiquidButton>

          {openDetailModal && (
            <LiquidButton
              onClick={(e) => {
                e.stopPropagation();
                openDetailModal(item);
              }}
              groupId="dashboard-backdrop-actions"
              title="Ver detalles"
              aria-label="Ver detalles"
              className={previewBtnClass}
            >
              <ChevronDown />
            </LiquidButton>
          )}
        </div>

        {/* Premios (hueco reservado para que la carga tardía no dé saltos) */}
        <div className="mb-1.5 flex min-h-[1.1rem] items-center gap-2 text-[11px] font-bold text-emerald-300 drop-shadow-md sm:text-xs">
          {extras?.awards && (
            <motion.span
              key={extras.awards}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="flex min-w-0 items-center gap-1.5"
            >
              <Award className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-1">{extras.awards}</span>
            </motion.span>
          )}
        </div>

        {/* Metadatos: año · duración/temporadas · nota TMDb · nota IMDb */}
        <div className="flex flex-nowrap items-center gap-x-2 overflow-hidden text-[11px] font-semibold text-zinc-200 sm:text-xs">
          {(() => {
            const parts = [];
            if (yearOf(item))
              parts.push(<span key="year">{yearOf(item)}</span>);
            if (extras?.runtime)
              parts.push(
                <span key="runtime">
                  {typeof extras.runtime === "number"
                    ? formatRuntime(extras.runtime)
                    : extras.runtime}
                </span>,
              );
            if (hasTmdbRating)
              parts.push(
                <span key="tmdb" className="inline-flex items-center gap-1.5">
                  <NextImage
                    src="/logo-TMDb.png"
                    alt="TMDb"
                    width={2560}
                    height={1846}
                    sizes="28px"
                    className="h-2.5 w-auto"
                    loading="lazy"
                  />
                  <span className="font-bold">{tmdbRating}</span>
                </span>,
              );
            if (typeof extras?.imdbRating === "number")
              parts.push(
                <span key="imdb" className="inline-flex items-center gap-1.5">
                  <NextImage
                    src="/logo-IMDb.svg"
                    alt="IMDb"
                    width={575}
                    height={290}
                    sizes="34px"
                    className="h-3 w-auto"
                    loading="lazy"
                  />
                  <span className="font-bold">
                    {extras.imdbRating.toFixed(1)}
                  </span>
                </span>,
              );
            return parts.reduce((acc, part, i) => {
              if (i === 0) return [part];
              return [
                ...acc,
                <span
                  key={`sep-${i}`}
                  className="select-none text-[0.8em] font-bold text-zinc-500/70"
                  aria-hidden="true"
                >
                  •
                </span>,
                part,
              ];
            }, []);
          })()}
        </div>

        {/* Géneros (hueco reservado igual que la fila de premios) */}
        <div className="mt-1.5 flex min-h-[1.1rem] flex-nowrap items-center gap-x-3 overflow-hidden text-[11px] text-zinc-200 sm:text-xs">
          {genres && <span className="truncate">{genres}</span>}
        </div>

        {error && (
          <p className="mt-1.5 line-clamp-1 text-[11px] text-red-400">{error}</p>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ====================================================================
 * Fila: cabecera (título + punto ámbar + chevron) + carrusel de tarjetas
 * landscape. En escritorio, hover → vista previa estilo Netflix.
 * ==================================================================== */
export default function DashboardBackdropRow({
  title,
  href,
  items,
  isMobile,
  hydrated,
  backdropOverrides = {},
}) {
  const router = useRouter();
  const revealProps = useScrollRevealProps();

  const swiperRef = useRef(null);
  const rowRef = useRef(null);
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [animatingOutId, setAnimatingOutId] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [perView, setPerView] = useState(6);
  const hoverCloseTimeoutRef = useRef(null);
  const hoveredIdRef = useRef(null);

  useEffect(() => {
    return () => {
      if (hoverCloseTimeoutRef.current) {
        clearTimeout(hoverCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    hoveredIdRef.current = hoveredId;
  }, [hoveredId]);

  const displayItems = Array.isArray(items) ? items : EMPTY_ARRAY;
  if (displayItems.length === 0) return null;

  const clearHoverCloseTimer = () => {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  };

  const openPreview = (itemKey, index) => {
    clearHoverCloseTimer();
    const prev = hoveredIdRef.current;
    if (prev && prev !== itemKey) {
      setAnimatingOutId(prev);
    } else {
      setAnimatingOutId((prevOut) => (prevOut === itemKey ? null : prevOut));
    }
    hoveredIdRef.current = itemKey;
    setHoveredId(itemKey);
    if (typeof index === "number") setHoveredIndex(index);
  };

  const closePreview = (itemKey) => {
    if (hoveredIdRef.current !== itemKey) return;
    hoveredIdRef.current = null;
    setAnimatingOutId(itemKey);
    setHoveredId(null);
    setHoveredIndex(null);
  };

  const handleMouseEnterItem = (itemKey, index) => {
    if (isMobile) return;
    clearHoverCloseTimer();
    openPreview(itemKey, index);
  };

  const handleMouseLeaveItem = (itemKey) => {
    if (isMobile) return;
    clearHoverCloseTimer();
    hoverCloseTimeoutRef.current = window.setTimeout(() => {
      closePreview(itemKey);
    }, 120);
  };

  const updateNav = (swiper) => {
    if (!swiper) return;
    const hasOverflow = !swiper.isLocked;
    setCanPrev(hasOverflow && !swiper.isBeginning);
    setCanNext(hasOverflow && !swiper.isEnd);
    setActiveIndex(swiper.activeIndex);
    const spv = swiper?.params?.slidesPerView;
    if (typeof spv === "number" && Number.isFinite(spv)) setPerView(spv);
  };

  const handleSwiper = (swiper) => {
    swiperRef.current = swiper;
    updateNav(swiper);
  };

  const moveSlides = (dir) => {
    const swiper = swiperRef.current;
    if (!swiper) return;
    const count = isMobile ? 1 : Math.max(1, perView - 1);
    for (let i = 0; i < count; i += 1) {
      if (dir < 0) swiper.slidePrev();
      else swiper.slideNext();
    }
  };

  const hasActivePreview = !!hoveredId;
  const isHoveringFirstVisible =
    hoveredIndex !== null && hoveredIndex <= activeIndex;
  const isHoveringLastVisible =
    hoveredIndex !== null &&
    hoveredIndex >= activeIndex + Math.floor(perView) - 1;

  const showPrev =
    (isHoveredRow || hasActivePreview) && canPrev && !isHoveringFirstVisible;
  const showNext =
    (isHoveredRow || hasActivePreview) && canNext && !isHoveringLastVisible;

  const breakpoints = isMobile
    ? {
        0: { slidesPerView: 2, spaceBetween: 10 },
        640: { slidesPerView: 2, spaceBetween: 12 },
      }
    : {
        768: { slidesPerView: 3, spaceBetween: 14 },
        1024: { slidesPerView: 4, spaceBetween: 16 },
        1280: { slidesPerView: 5, spaceBetween: 18 },
        1536: { slidesPerView: 6, spaceBetween: 20 },
      };

  const swiperKey = `backdrop-row-${hydrated ? "h" : "s"}-${
    isMobile ? "m" : "d"
  }`;

  const Header = (
    <motion.div
      variants={scaleIn}
      className="relative z-20 mb-5 px-1 pointer-events-none sm:px-0"
    >
      {href ? (
        <Link
          href={href}
          className="group/title pointer-events-auto inline-flex w-fit items-center bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-xl font-black tracking-tighter text-transparent transition-all duration-200 hover:from-amber-100 hover:via-white hover:to-amber-200 active:scale-[0.98] active:opacity-90 sm:text-2xl md:text-3xl"
          aria-label={`Ver todos los títulos de ${title}`}
        >
          <span>{title}</span>
          <span className="text-amber-500">.</span>
          <ChevronRight className="ml-1 h-5 w-5 translate-x-[-4px] text-amber-400 opacity-0 transition duration-200 group-hover/title:translate-x-0 group-hover/title:opacity-100 sm:h-6 sm:w-6" />
        </Link>
      ) : (
        <h3 className="inline-flex w-fit items-center bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-xl font-black tracking-tighter text-transparent sm:text-2xl md:text-3xl">
          <span>{title}</span>
          <span className="text-amber-500">.</span>
        </h3>
      )}
    </motion.div>
  );

  return (
    <motion.div
      ref={rowRef}
      {...revealProps}
      variants={fadeInUp}
      className={`group relative ${hasActivePreview ? "z-[100]" : ""}`}
    >
      {Header}

      <div
        className={`relative ${hasActivePreview ? "z-30" : ""}`}
        onMouseEnter={() => setIsHoveredRow(true)}
        onMouseLeave={() => {
          setIsHoveredRow(false);
          const currentHoveredId = hoveredIdRef.current;
          if (currentHoveredId) handleMouseLeaveItem(currentHoveredId);
        }}
      >
        <div className={!hydrated ? "pointer-events-none touch-none" : ""}>
          <Swiper
            key={swiperKey}
            slidesPerView={isMobile ? 2 : 3}
            spaceBetween={isMobile ? 10 : 16}
            onSwiper={handleSwiper}
            onSlideChange={updateNav}
            onResize={updateNav}
            onReachBeginning={updateNav}
            onReachEnd={updateNav}
            loop={false}
            watchOverflow={true}
            grabCursor={!isMobile}
            simulateTouch={true}
            allowTouchMove={true}
            preventClicks={true}
            preventClicksPropagation={true}
            threshold={isMobile ? 2 : 5}
            touchRatio={isMobile ? 1.5 : 1}
            freeMode={
              !isMobile
                ? { enabled: true, momentum: true, momentumRatio: 0.5 }
                : false
            }
            modules={[Navigation, FreeMode]}
            // Padding vertical amplio (con margen negativo que lo compensa) para
            // reservar el hueco de la vista previa sin que se recorte; el Swiper
            // es pointer-events-none en escritorio para no robar hover/clic a las
            // filas vecinas y las tarjetas los reactivan (pointer-events-auto).
            className={`group relative !py-14 sm:!py-16 md:!py-44 !-my-14 sm:!-my-16 md:!-my-44 ${
              isMobile ? "" : "pointer-events-none"
            }`}
            wrapperClass="flex items-center"
            breakpoints={breakpoints}
          >
            {displayItems.map((item, i) => {
              const itemKey = `${getMediaTypeForItem(item)}:${item.id}`;
              const isActive = hydrated && !isMobile && hoveredId === itemKey;
              const isAnimatingOut = animatingOutId === itemKey;
              const backdropOverride = backdropOverrides[item.id];

              const base =
                "relative flex-shrink-0 transition-all duration-300 ease-in-out";

              return (
                <SwiperSlide
                  key={itemKey}
                  className={`${
                    isMobile
                      ? "select-none"
                      : "select-none pointer-events-auto"
                  } ${
                    isActive
                      ? "!relative !z-[100] !overflow-visible"
                      : isAnimatingOut
                        ? "!relative !z-[50] !overflow-visible"
                        : "!relative !z-10"
                  }`}
                >
                  <div
                    className={`${base} aspect-video w-full ${
                      isActive || isAnimatingOut
                        ? "overflow-visible"
                        : "overflow-hidden"
                    }`}
                    onMouseEnter={() => handleMouseEnterItem(itemKey, i)}
                    onMouseLeave={() => {
                      if (!isActive) handleMouseLeaveItem(itemKey);
                    }}
                  >
                    <AnimatePresence
                      initial={false}
                      mode="popLayout"
                      onExitComplete={() => {
                        setAnimatingOutId((prev) =>
                          prev === itemKey ? null : prev,
                        );
                      }}
                    >
                      {isActive ? (
                        <div
                          key="preview"
                          className="hidden sm:block"
                          onMouseEnter={() => openPreview(itemKey, i)}
                        >
                          <BackdropPreviewCard
                            item={item}
                            backdropOverride={backdropOverride}
                            index={i}
                            totalCount={displayItems.length}
                            activeIndex={activeIndex}
                            perView={perView}
                            onPreviewMouseEnter={() => openPreview(itemKey, i)}
                            onPreviewMouseLeave={() => closePreview(itemKey)}
                          />
                        </div>
                      ) : (
                        <motion.div
                          key="base"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{
                            opacity: 0,
                            scale: 0.98,
                            transition: { duration: 0.12 },
                          }}
                          transition={{
                            duration: 0.18,
                            ease: [0.4, 0, 0.2, 1],
                          }}
                          className="h-full w-full cursor-pointer"
                          style={{ willChange: "transform, opacity" }}
                          onClick={() => router.push(detailsHref(item))}
                        >
                          <BackdropBaseCard
                            item={item}
                            backdropOverride={backdropOverride}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </SwiperSlide>
              );
            })}
          </Swiper>
        </div>

        <AnimatePresence>
          {showPrev && !isMobile && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveSlides(-1);
              }}
              className="absolute inset-y-14 left-0 z-30 hidden w-32 items-center justify-start bg-gradient-to-r from-black/90 via-black/70 to-transparent transition-all duration-300 hover:from-black/95 hover:via-black/80 sm:inset-y-16 sm:flex md:inset-y-44 group/nav"
            >
              <motion.span
                className="ml-6 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] transition-transform group-hover/nav:scale-110"
                whileHover={{ x: -4 }}
              >
                ‹
              </motion.span>
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showNext && !isMobile && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveSlides(1);
              }}
              className="absolute inset-y-14 right-0 z-30 hidden w-32 items-center justify-end bg-gradient-to-l from-black/90 via-black/70 to-transparent transition-all duration-300 hover:from-black/95 hover:via-black/80 sm:inset-y-16 sm:flex md:inset-y-44 group/nav"
            >
              <motion.span
                className="mr-6 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] transition-transform group-hover/nav:scale-110"
                whileHover={{ x: 4 }}
              >
                ›
              </motion.span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
