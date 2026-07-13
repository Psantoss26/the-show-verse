// /src/components/MainDashboardClient.jsx
"use client";

import { useRef, useEffect, useState, useMemo, useCallback, memo } from "react";
import useTrailerAutoDismiss from "@/hooks/useTrailerAutoDismiss";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Autoplay, FreeMode } from "swiper/modules";
import { AnimatePresence, motion, useInView } from "framer-motion";
import {
  useScrollRevealProps,
  useTopResetRevealProps,
} from "@/lib/hooks/useHasScrolled";
import { deriveSectionLabel } from "@/lib/dashboard/sectionLabel";
import { usePersonalizedFeatured } from "@/lib/dashboard/featuredPersonalize";
import "swiper/swiper-bundle.css";
import Link from "next/link";
import NextImage from "next/image";
import OptimizedImage from "@/components/OptimizedImage";
import {
  Play,
  X,
  FilmIcon,
  TvIcon,
  ChevronRight,
  Award,
  Loader2,
  Music2,
  Pause,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

import {
  markAsFavorite,
  markInWatchlist,
  getMovieDetails,
  getDetails,
  resolveImdbId,
} from "@/lib/api/tmdb";
import { getBackendItemStatus } from "@/lib/api/itemStatus";
import {
  traktGetItemStatus,
  traktGetShowWatched,
  traktSetRating,
} from "@/lib/api/traktClient";
import {
  getWatchedEpisodeCountForSeason,
  getAvailableEpisodeTotal,
} from "@/lib/hooks/useTraktEpisodesWatched";

import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import { fetchArtworkOverrides } from "@/lib/artworkApi";
import { formatDashboardAwards } from "@/lib/details/awardsText";
// Fila de acciones + fila meta/géneros COMPARTIDAS con DetailsClient/DetailModal:
// misma UI y estilo que la ficha rápida del dashboard.
import DetailActionsRow from "@/components/details/DetailActionsRow";
import DetailsMetaGenresRow from "@/components/details/DetailsMetaGenresRow";
import { DetailsRatingsBadges } from "@/components/details/DetailsScoreboardPanel";
import { formatCountShort } from "@/lib/details/formatters";
import EpisodeRatingsModal from "@/components/details/EpisodeRatingsModal";
import FeaturedHero from "@/components/FeaturedHero";
import ContinueWatchingSection from "@/components/ContinueWatchingSection";
import DashboardCalendarSection from "@/components/DashboardCalendarSection";
import DashboardBackdropRow from "@/components/dashboard/DashboardBackdropRow";
import DetailModalProvider, {
  useDetailModal,
} from "@/components/dashboard/DetailModalProvider";
import PreviewTrailerAudioButton, {
  usePreviewTrailerAudio,
} from "@/components/dashboard/PreviewTrailerAudioControl";
import { useEngineRows } from "@/components/dashboard/useEngineRows";

import {
  yearOf,
  ratingOf,
  getSpotlightBadge,
  formatRuntime,
  buildImg,
  PREVIEW_BACKDROP_SIZE,
  getMediaTypeForItem,
  getBackdropCacheKey,
  getPreviewBackdropFallback,
  GENRES,
  preloadImage,
  movieExtrasCache,
  movieBackdropCache,
  getArtworkPreference,
  fetchBestBackdrop,
  fetchBestBackdropNoLang,
  fetchBestPoster,
  fetchBestLogo,
  preparePreviewBackdrop,
  getBestTrailerCached,
} from "@/lib/dashboard/media";

// Constantes para evitar recreación de referencias
const EMPTY_ARRAY = [];
const EMPTY_OBJECT = {};
const DASHBOARD_RECOMMENDED_CACHE_KEY = "showverse:dashboard:recommended:v2";
const DASHBOARD_RECOMMENDED_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DASHBOARD_SECTION_CACHE_PREFIX = "showverse:dashboard:section:v1:";
const DASHBOARD_SECTION_CACHE_TTL_MS = 60 * 60 * 1000;
const DASHBOARD_FETCH_TIMEOUT_MS = 8500;
const INITIAL_VISIBLE_ENGINE_ROWS = 6;
const ENGINE_ROW_REVEAL_BATCH_SIZE = 4;
const spotlightBackdropCache = new Map();

function toItemsArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.items)) return value.items;
  return EMPTY_ARRAY;
}

function splitItemsByMediaType(items) {
  const movies = [];
  const shows = [];

  for (const item of Array.isArray(items) ? items : EMPTY_ARRAY) {
    if (!item?.id) continue;
    const type =
      item.media_type === "tv" ||
      (item.name && !item.title) ||
      item.first_air_date
        ? "tv"
        : "movie";
    if (type === "tv") shows.push({ ...item, media_type: "tv" });
    else movies.push({ ...item, media_type: "movie" });
  }

  return { movies, shows };
}

function normalizeRecommendedPayload(payload) {
  const items = toItemsArray(payload);
  const fallbackSplit = splitItemsByMediaType(items);
  const movies = Array.isArray(payload?.movies)
    ? payload.movies
    : fallbackSplit.movies;
  const shows = Array.isArray(payload?.shows)
    ? payload.shows
    : fallbackSplit.shows;

  return {
    items,
    movies,
    shows,
  };
}

function readRecommendedDashboardCache() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(DASHBOARD_RECOMMENDED_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > DASHBOARD_RECOMMENDED_CACHE_TTL_MS) {
      window.localStorage.removeItem(DASHBOARD_RECOMMENDED_CACHE_KEY);
      return null;
    }

    const normalized = normalizeRecommendedPayload(parsed?.payload);
    if (!normalized.movies.length && !normalized.shows.length) return null;
    return normalized;
  } catch {
    return null;
  }
}

function writeRecommendedDashboardCache(payload) {
  if (typeof window === "undefined") return;

  try {
    const normalized = normalizeRecommendedPayload(payload);
    if (!normalized.movies.length && !normalized.shows.length) return;
    window.localStorage.setItem(
      DASHBOARD_RECOMMENDED_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        payload: {
          items: normalized.items,
          movies: normalized.movies,
          shows: normalized.shows,
        },
      }),
    );
  } catch {}
}

function readDashboardSectionCache(key) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(
      `${DASHBOARD_SECTION_CACHE_PREFIX}${key}`,
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    if (
      !savedAt ||
      Date.now() - savedAt > DASHBOARD_SECTION_CACHE_TTL_MS ||
      !Array.isArray(parsed?.items)
    ) {
      window.localStorage.removeItem(`${DASHBOARD_SECTION_CACHE_PREFIX}${key}`);
      return null;
    }
    return parsed.items;
  } catch {
    return null;
  }
}

function writeDashboardSectionCache(key, items) {
  if (typeof window === "undefined" || !Array.isArray(items) || !items.length) {
    return;
  }

  try {
    window.localStorage.setItem(
      `${DASHBOARD_SECTION_CACHE_PREFIX}${key}`,
      JSON.stringify({
        savedAt: Date.now(),
        items,
      }),
    );
  } catch {}
}

async function fetchDashboardJson(url, { timeoutMs = DASHBOARD_FETCH_TIMEOUT_MS, ...init } = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/* =================== ANIMATION VARIANTS =================== */
const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const staggerContainer = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
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
    transition: {
      duration: 8,
      ease: "linear",
      repeat: Infinity,
    },
  },
};

/* --- Hook SIMPLE: layout móvil SOLO por anchura (NO por touch) --- */
const useIsMobileLayout = (breakpointPx = 768) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpointPx - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, [breakpointPx]);

  return isMobile;
};


const dashboardSegmentGroupClass =
  "flex isolate transform-gpu items-center gap-1 rounded-full p-1 bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.65)]";

const dashboardSegmentButtonClass = (active) =>
  [
    "relative isolate inline-flex min-h-8 items-center justify-center rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-200 sm:min-h-9 sm:px-4 sm:text-sm",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300/70",
    active
      ? "bg-white/10 bg-gradient-to-br from-white/20 via-white/10 to-white/5 text-white shadow-[0_8px_24px_-12px_rgba(255,255,255,0.45)]"
      : "text-zinc-400 hover:bg-white/5 hover:text-white",
  ].join(" ");

const dashboardPreviewCardClass = (heightClass, isSpotlight = false) =>
  [
    "relative isolate overflow-hidden text-white cursor-pointer transform-gpu",
    isSpotlight
      ? "rounded-2xl bg-neutral-950 ring-1 ring-inset ring-white/10 shadow-[0_24px_64px_-18px_rgba(0,0,0,0.95)]"
      : "flex flex-col rounded-xl border border-white/10 bg-[#141414]/95 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] backdrop-blur-xl",
    "transition-all duration-300",
    isSpotlight ? heightClass : "",
  ].join(" ");

const dashboardPreviewMediaClass =
  "relative aspect-video w-full shrink-0 overflow-hidden bg-neutral-900";

const dashboardPreviewInfoClass =
  "w-full border-t border-white/5 bg-[#141414]/95 px-4 py-3.5 backdrop-blur-md sm:px-5 sm:py-4";

const dashboardPreviewBackdropFadeStyle = {
  WebkitMaskImage:
    "radial-gradient(ellipse at center, black 76%, rgba(0,0,0,0.98) 90%, rgba(0,0,0,0.9) 100%)",
  maskImage:
    "radial-gradient(ellipse at center, black 76%, rgba(0,0,0,0.98) 90%, rgba(0,0,0,0.9) 100%)",
};

const EXPANDABLE_SECTION_HREFS = {
  Tendencias: "/dashboard/tendencias",
  "Tendencias ahora mismo": "/dashboard/tendencias",
  Populares: "/dashboard/populares",
  "Lo que más se está viendo": "/dashboard/populares",
  Recomendados: "/dashboard/recomendados",
  "Recomendaciones de hoy para ti": "/dashboard/recomendados",
  "Creemos que te van a encantar": "/dashboard/recomendados",
  "Más esperadas": "/dashboard/mas-esperadas",
};

function ExpandableSectionTitle({ title, href, className = "" }) {
  const content = (
    <>
      <span>{title}</span>
      <span className="text-amber-500">.</span>
      {href && (
        <ChevronRight className="ml-1 h-5 w-5 translate-x-[-4px] text-amber-400 opacity-0 transition duration-200 group-hover/title:translate-x-0 group-hover/title:opacity-100 sm:h-6 sm:w-6" />
      )}
    </>
  );

  if (!href) {
    return (
      <h3
        className={`text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent ${className}`}
      >
        {content}
      </h3>
    );
  }

  return (
    <Link
      href={href}
      className={`group/title inline-flex w-fit items-center text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent transition-all duration-200 hover:from-amber-100 hover:via-white hover:to-amber-200 active:scale-[0.98] active:opacity-90 ${className}`}
      aria-label={`Ver todos los títulos de ${title}`}
    >
      {content}
    </Link>
  );
}


function runWhenBrowserIdle(callback, { timeout = 1500, delay = 250 } = {}) {
  if (typeof window === "undefined") return () => {};

  if (typeof window.requestIdleCallback === "function") {
    const idleId = window.requestIdleCallback(callback, { timeout });
    return () => {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
    };
  }

  const timeoutId = window.setTimeout(callback, delay);
  return () => window.clearTimeout(timeoutId);
}


/* ====================================================================
 * Portada (2:3) — SOLO en móvil: “3 por fila” completas (sin recorte)
 * ==================================================================== */
function PosterImage({ movie, cache, heightClass, isMobile, posterOverride }) {
  const [posterPath, setPosterPath] = useState(null);
  const [ready, setReady] = useState(false);

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

      const { poster: userPoster } = getArtworkPreference(movie.id);
      if (userPoster) {
        const url = buildImg(userPoster, "w342");
        await preloadImage(url);
        if (!abort) {
          cache.current.set(posterCacheKey, userPoster);
          setPosterPath(userPoster);
          setReady(true);
        }
        return;
      }

      const cached = cache.current.get(posterCacheKey);
      if (cached) {
        const url = buildImg(cached, "w342");
        await preloadImage(url);
        if (!abort) {
          setPosterPath(cached);
          setReady(true);
        }
        return;
      }

      // Si todavía NO sabemos si hay override (porque aún no cargó el fetch batch),
      // no pintamos el poster base: eso provoca el cambio visible base → final.
      if (posterOverride === undefined) {
        if (!abort) {
          setPosterPath(null);
          setReady(false);
        }
        return;
      }

      if (posterOverride) {
        const url = buildImg(posterOverride, "w342");
        await preloadImage(url);
        if (!abort) {
          cache.current.set(posterCacheKey, posterOverride);
          setPosterPath(posterOverride);
          setReady(true);
        }
        return;
      }

      if (!abort) {
        setPosterPath(null);
        setReady(false);
      }

      const preferred = await fetchBestPoster(movie.id, mediaType);
      const chosen =
        preferred ||
        movie.poster_path ||
        movie.backdrop_path ||
        movie.profile_path ||
        null;

      const url = chosen ? buildImg(chosen, "w342") : null;
      await preloadImage(url);
      if (!abort) {
        cache.current.set(posterCacheKey, chosen);
        setPosterPath(chosen);
        setReady(!!chosen);
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [movie, cache, posterOverride]);

  const boxClass = isMobile ? "aspect-[2/3]" : heightClass;

  if (!ready || !posterPath) {
    return (
      <div
        className={`relative w-full ${boxClass} rounded-lg overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900`}
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
          variants={shimmer}
          animate="animate"
          style={{ backgroundSize: "200% 100%" }}
        />
      </div>
    );
  }

  if (!isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="relative group/poster w-full h-full"
      >
        <NextImage
          src={buildImg(posterPath, "w342")}
          alt={movie.title || movie.name}
          fill
          sizes="(min-width:1280px) 210px, (min-width:768px) 190px, 140px"
          className="object-cover rounded-lg transition-all duration-300 group-hover/poster:brightness-110"
          loading="lazy"
        />
        <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/poster:opacity-100 transition-opacity duration-300" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={`relative w-full ${boxClass} rounded-lg overflow-hidden bg-neutral-900`}
    >
      <NextImage
        src={buildImg(posterPath, "w342")}
        alt=""
        aria-hidden="true"
        fill
        sizes="33vw"
        className="object-cover blur-xl opacity-35 scale-110"
        loading="lazy"
      />
      <NextImage
        src={buildImg(posterPath, "w342")}
        alt={movie.title || movie.name}
        fill
        sizes="33vw"
        className="object-contain"
        loading="lazy"
      />
    </motion.div>
  );
}

function getInitialDashboardPreviewBackdrop(
  movie,
  backdropOverride,
  isSpotlight = false,
) {
  if (!movie?.id) return null;

  const mediaType = getMediaTypeForItem(movie);
  if (isSpotlight) {
    return (
      spotlightBackdropCache.get(getBackdropCacheKey(movie, mediaType)) || null
    );
  }

  const { backdrop: userBackdrop } = getArtworkPreference(movie.id);
  if (userBackdrop) return userBackdrop;
  if (backdropOverride) return backdropOverride;

  const cachedBackdrop = movieBackdropCache.get(
    getBackdropCacheKey(movie, mediaType),
  );

  return cachedBackdrop || null;
}

/* ====================================================================
 * Vista previa inline tipo Amazon (backdrop horizontal) + TRAILER
 * ==================================================================== */
function InlinePreviewCard({
  movie,
  heightClass,
  backdropOverride,
  isSpotlight = false,
}) {
  const { session, account } = useAuth();
  const { openDetailModal } = useDetailModal();
  const mediaType = getMediaTypeForItem(movie);

  const [extras, setExtras] = useState({
    runtime: null,
    awards: null,
    imdbRating: null,
    overview: null,
  });
  const mediaIdentity = `${mediaType}:${movie?.id || "empty"}`;
  const [stableBackdropState, setStableBackdropState] = useState(() => ({
    mediaIdentity,
    value: backdropOverride,
  }));
  const stableBackdropOverride =
    stableBackdropState.mediaIdentity === mediaIdentity
      ? stableBackdropState.value
      : backdropOverride;
  const [backdropPath, setBackdropPath] = useState(() =>
    getInitialDashboardPreviewBackdrop(
      movie,
      stableBackdropOverride,
      isSpotlight,
    ),
  );
  const [backdropReady, setBackdropReady] = useState(() => !!backdropPath);

  const [loadingStates, setLoadingStates] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  const [logoPath, setLogoPath] = useState(null);
  const [soundtrackTrack, setSoundtrackTrack] = useState(null);
  const [soundtrackLoading, setSoundtrackLoading] = useState(false);
  const [soundtrackPlaying, setSoundtrackPlaying] = useState(false);
  const [soundtrackOpen, setSoundtrackOpen] = useState(false);
  const [soundtrackError, setSoundtrackError] = useState("");
  const audioRef = useRef(null);
  const soundtrackAbortRef = useRef(null);

  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const trailerIframeRef = useRef(null);
  const {
    muted: trailerMuted,
    toggle: handleToggleTrailerAudio,
    sync: syncTrailerAudio,
  } = usePreviewTrailerAudio(trailerIframeRef, { volume: 30 });

  // Si el tráiler está restringido (edad/embedding) o no disponible, ocultarlo
  // (fallback al backdrop) en vez de mostrar el error de YouTube en la tarjeta.
  useTrailerAutoDismiss({
    open: showTrailer,
    iframeRef: trailerIframeRef,
    videoKey: trailer?.key,
    onUnavailable: () => setShowTrailer(false),
  });

  // Datos enriquecidos para la fila meta compartida (<DetailsMetaGenresRow>):
  // estado TMDb crudo, géneros [{id,name}], temporadas y duración de respaldo.
  // Espejo de useDetailModalData para que el diseño coincida con DetailModal.
  const [previewDetails, setPreviewDetails] = useState({
    status: null,
    genreObjects: [],
    seasons: [],
    runtimeFallback: null,
  });

  // Estado de Trakt para el control de "visto" (<TraktWatchedControl>): conexión,
  // visto, plays, badge de progreso (%) para series, y flag de carga.
  const [traktInfo, setTraktInfo] = useState({
    connected: false,
    watched: false,
    plays: 0,
    badge: null,
    loading: false,
  });

  // Puntuación del usuario (Trakt) para el <StarRating> de la fila de acciones.
  const [rating, setRating] = useState(null);
  const [ratingLoading, setRatingLoading] = useState(false);

  // Modal de valoración de episodios (solo series).
  const [episodeRatingsOpen, setEpisodeRatingsOpen] = useState(false);

  useEffect(() => {
    setStableBackdropState((prev) =>
      prev.mediaIdentity === mediaIdentity
        ? prev
        : { mediaIdentity, value: backdropOverride },
    );
  }, [mediaIdentity, backdropOverride]);

  useEffect(() => {
    setShowTrailer(false);
    setTrailer(null);
    setTrailerLoading(false);
    soundtrackAbortRef.current?.abort();
    soundtrackAbortRef.current = null;
    audioRef.current?.pause();
    setSoundtrackTrack(null);
    setSoundtrackLoading(false);
    setSoundtrackPlaying(false);
    setSoundtrackOpen(false);
    setSoundtrackError("");
  }, [movie?.id]);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!movie || !session || !account?.id) {
        setFavorite(false);
        setWatchlist(false);
        return;
      }
      try {
        setLoadingStates(true);
        const type = movie.media_type || "movie";
        const st = await getBackendItemStatus({ type, tmdbId: movie.id });
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
  }, [mediaType, movie, session, account]);

  useEffect(() => {
    let cancel = false;
    setLogoPath(null);
    if (!isSpotlight || !movie?.id) return;

    fetchBestLogo(movie.id, mediaType, ["en", "es", null])
      .then((path) => {
        if (!cancel) setLogoPath(path || null);
      })
      .catch(() => {
        if (!cancel) setLogoPath(null);
      });

    return () => {
      cancel = true;
    };
  }, [isSpotlight, mediaType, movie?.id]);

  useEffect(() => {
    if (!soundtrackOpen) return;

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      soundtrackAbortRef.current?.abort();
      soundtrackAbortRef.current = null;
      audioRef.current?.pause();
      setSoundtrackLoading(false);
      setSoundtrackPlaying(false);
      setSoundtrackOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [soundtrackOpen]);

  useEffect(() => {
    let abort = false;
    if (!movie) return;

    const loadAll = async () => {
      const revealBackdrop = (path) => {
        if (abort) return;
        setBackdropPath(path);
        setBackdropReady(!!path);
      };

      const backdropCacheKey = getBackdropCacheKey(movie, mediaType);
      if (isSpotlight) {
        const cachedBackdrop = spotlightBackdropCache.get(backdropCacheKey);
        if (cachedBackdrop !== undefined) {
          revealBackdrop(cachedBackdrop);
        } else {
          try {
            // Preferimos backdrop textless; si el título no tiene uno (frecuente
            // en "Más esperadas"/estrenos), caemos al backdrop/póster del propio
            // item en lugar de dejarlo NEGRO (mismo fallback que la rama normal).
            const preferred = await fetchBestBackdropNoLang(movie.id, mediaType, {
              allowLanguageFallback: false,
            });
            const chosen = preferred || getPreviewBackdropFallback(movie);
            spotlightBackdropCache.set(backdropCacheKey, chosen);
            revealBackdrop(chosen);
          } catch {
            const fallback = getPreviewBackdropFallback(movie);
            spotlightBackdropCache.set(backdropCacheKey, fallback);
            revealBackdrop(fallback);
          }
        }
      } else {
        const { backdrop: userBackdrop } = getArtworkPreference(movie.id);
        if (userBackdrop) {
          movieBackdropCache.set(backdropCacheKey, userBackdrop);
          revealBackdrop(userBackdrop);
        } else if (stableBackdropOverride) {
          movieBackdropCache.set(backdropCacheKey, stableBackdropOverride);
          revealBackdrop(stableBackdropOverride);
        } else {
          const cachedBackdrop = movieBackdropCache.get(backdropCacheKey);
          if (cachedBackdrop !== undefined) {
            revealBackdrop(cachedBackdrop);
          } else {
            try {
              const preferred = await fetchBestBackdrop(movie.id, mediaType);
              const chosen = preferred || getPreviewBackdropFallback(movie);

              movieBackdropCache.set(backdropCacheKey, chosen);

              revealBackdrop(chosen);
            } catch {
              const fallback = getPreviewBackdropFallback(movie);
              movieBackdropCache.set(backdropCacheKey, fallback);
              revealBackdrop(fallback);
            }
          }
        }
      }

      const cachedExtras = movieExtrasCache.get(movie.id);
      if (cachedExtras) {
        if (!abort) setExtras(cachedExtras);
      } else {
        // imdb_id + nota IMDb se resuelven AL PRINCIPIO y en PARALELO con los
        // detalles (runtime/overview): así la nota NO espera a la ficha. Se pinta
        // en cuanto llega (setState incremental) y las promesas se comparten con
        // la ruta de premios (mismo imdb_id) y con el objeto cacheado (misma
        // nota), sin duplicar llamadas.
        const imdbIdPromise = resolveImdbId(movie, mediaType);
        const imdbRatingPromise = imdbIdPromise.then((imdb) =>
          imdb
            ? fetchImdbRatingByImdb(imdb)
                .then((ds) =>
                  typeof ds?.rating === "number" ? ds.rating : null,
                )
                .catch(() => null)
            : null,
        );
        imdbRatingPromise.then((rating) => {
          if (rating != null && !abort) {
            setExtras((prev) => ({ ...prev, imdbRating: rating }));
          }
        });

        try {
          let runtime = null;
          let overview = null;
          try {
            if (mediaType === "movie") {
              const details = await getMovieDetails(movie.id);
              runtime = details?.runtime ?? null;
              overview =
                (typeof details?.overview === "string" &&
                  details.overview.trim()) ||
                null;
            } else {
              // Para series, obtener info de la API de TV
              const response = await fetch(
                `https://api.themoviedb.org/3/tv/${movie.id}?append_to_response=external_ids&api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
              );
              if (response.ok) {
                const details = await response.json();
                overview =
                  (typeof details?.overview === "string" &&
                    details.overview.trim()) ||
                  null;
                // Para series mostramos temporadas y episodios (mismo formato
                // que FeaturedHero).
                if (details.number_of_seasons) {
                  runtime = `${details.number_of_seasons} Temp.`;
                  if (details.number_of_episodes) {
                    runtime += ` · ${details.number_of_episodes} Eps.`;
                  }
                }
              }
            }
          } catch {}

          // Premios (OMDb): reutiliza el imdb_id ya resuelto (no re-pide).
          let awards = null;
          try {
            const imdb = await imdbIdPromise;
            if (imdb) {
              const omdb = await fetchOmdbByImdb(imdb).catch(() => null);
              const rawAwards = omdb?.Awards;
              if (
                rawAwards &&
                typeof rawAwards === "string" &&
                rawAwards.trim()
              ) {
                awards = formatDashboardAwards(rawAwards);
              }
            }
          } catch {}

          const imdbRating = await imdbRatingPromise;
          const next = { runtime, awards, imdbRating, overview };
          movieExtrasCache.set(movie.id, next);
          if (!abort) setExtras(next);
        } catch {
          if (!abort)
            setExtras({
              runtime: null,
              awards: null,
              imdbRating: null,
              overview: null,
            });
        }
      }
    };

    loadAll();
    return () => {
      abort = true;
    };
  }, [isSpotlight, mediaType, movie, stableBackdropOverride]);

  // Carga perezosa (en hover == al montar) de los datos que alimentan la fila
  // meta compartida. También se usa en spotlight para el mismo diseño de estado
  // y géneros que FeaturedHero/DetailModal.
  useEffect(() => {
    if (!movie?.id) return undefined;

    let cancelled = false;
    const isTv = mediaType === "tv";

    // Detalles TMDb (espejo de useDetailModalData): estado crudo, géneros y
    // temporadas + una duración/duración-de-temporadas de respaldo.
    const detailsPromise = getDetails(mediaType, movie.id).catch(() => null);

    (async () => {
      try {
        const details = await detailsPromise;
        if (cancelled || !details) return;

        let genreObjects = [];
        if (Array.isArray(details?.genres) && details.genres.length) {
          genreObjects = details.genres
            .filter((g) => g && g.name)
            .map((g) => ({ id: g.id ?? g.name, name: g.name }));
        } else {
          const ids = movie.genre_ids || [];
          genreObjects = (Array.isArray(ids) ? ids : [])
            .map((gid) => (GENRES[gid] ? { id: gid, name: GENRES[gid] } : null))
            .filter(Boolean);
        }

        // Etiqueta de duración: minutos para películas; "N Temp. · M Eps." para
        // series (mismo formato que useDetailModalData / DetailModal).
        let runtimeFallback = null;
        if (isTv) {
          if (details?.number_of_seasons) {
            runtimeFallback = `${details.number_of_seasons} Temp.`;
            if (details?.number_of_episodes) {
              runtimeFallback += ` · ${details.number_of_episodes} Eps.`;
            }
          }
        } else {
          runtimeFallback = formatRuntime(details?.runtime) || null;
        }

        setPreviewDetails({
          status: details?.status || null,
          genreObjects,
          seasons: Array.isArray(details?.seasons) ? details.seasons : [],
          runtimeFallback,
        });
      } catch {
        // sin detalles: la fila meta se queda con el año que ya trae el item
      }
    })();

    // Estado de Trakt del título (visto/plays/puntuación) y, para series, el
    // badge de progreso (%) calculado con las temporadas de TMDb.
    (async () => {
      try {
        setTraktInfo((prev) => ({ ...prev, loading: true }));
        setRatingLoading(true);

        const status = await traktGetItemStatus({
          type: isTv ? "show" : "movie",
          tmdbId: movie.id,
        });
        if (cancelled) return;

        const connected = !!status?.connected;
        const ratingValue =
          status?.rating == null || !Number.isFinite(Number(status.rating))
            ? null
            : Number(status.rating);
        setRating(ratingValue);
        setRatingLoading(false);

        if (!isTv) {
          setTraktInfo({
            connected,
            watched: !!status?.watched,
            plays: Number(status?.plays || 0),
            badge: null,
            loading: false,
          });
          return;
        }

        // Series: sin conexión, no hay progreso que mostrar.
        if (!connected) {
          setTraktInfo({
            connected: false,
            watched: false,
            plays: 0,
            badge: null,
            loading: false,
          });
          return;
        }

        // Series conectada: episodios vistos + temporadas -> % de progreso.
        const [watchedRes, details] = await Promise.all([
          traktGetShowWatched({ tmdbId: movie.id }).catch(() => null),
          detailsPromise,
        ]);
        if (cancelled) return;

        const watchedBySeason = watchedRes?.watchedBySeason || {};
        const seasonsList = Array.isArray(details?.seasons)
          ? details.seasons
          : [];
        const usable = seasonsList.filter(
          (s) => typeof s?.season_number === "number" && s.season_number > 0,
        );
        const totalEpisodes = usable.reduce(
          (acc, s) => acc + getAvailableEpisodeTotal(s),
          0,
        );
        const watchedEpisodes = usable.reduce((acc, s) => {
          const total = getAvailableEpisodeTotal(s);
          return (
            acc +
            getWatchedEpisodeCountForSeason(watchedBySeason, s.season_number, total)
          );
        }, 0);
        const pct =
          totalEpisodes > 0
            ? Math.min(
                100,
                Math.max(0, Math.round((watchedEpisodes / totalEpisodes) * 100)),
              )
            : 0;
        const badge = pct > 0 ? `${pct}%` : null;

        const hasAnyWatched = Object.values(watchedBySeason || {}).some(
          (eps) => Array.isArray(eps) && eps.length > 0,
        );

        setTraktInfo({
          connected: true,
          watched: hasAnyWatched,
          plays: 0,
          badge,
          loading: false,
        });
      } catch {
        if (!cancelled) {
          setTraktInfo((prev) => ({ ...prev, loading: false }));
          setRatingLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSpotlight, mediaType, movie?.id]);

  const cardRef = useRef(null);

  const openPreviewModal = () => {
    openDetailModal?.(movie);
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
    if (requireLogin() || updating || !movie) return;
    try {
      setUpdating(true);
      setError("");
      const next = !favorite;
      setFavorite(next);
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: movie.id,
        favorite: next,
        title: movie.title || movie.name,
        posterPath: movie.poster_path || movie.backdrop_path || null,
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
    if (requireLogin() || updating || !movie) return;
    try {
      setUpdating(true);
      setError("");
      const next = !watchlist;
      setWatchlist(next);
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: movie.id,
        watchlist: next,
        title: movie.title || movie.name,
        posterPath: movie.poster_path || movie.backdrop_path || null,
      });
    } catch {
      setWatchlist((v) => !v);
      setError("No se pudo actualizar pendientes.");
    } finally {
      setUpdating(false);
    }
  };

  const closeSoundtrackOverlay = (e) => {
    e?.stopPropagation();
    soundtrackAbortRef.current?.abort();
    soundtrackAbortRef.current = null;
    audioRef.current?.pause();
    setSoundtrackLoading(false);
    setSoundtrackPlaying(false);
    setSoundtrackOpen(false);
  };

  // Puntuación optimista en Trakt (StarRating). El StarRating no expone el evento
  // de click: la propagación al onClick de la card la corta el contenedor de la
  // fila de acciones (ver más abajo). Revierte la nota local si el guardado falla.
  const handleRatePreview = async (value) => {
    if (!traktInfo.connected) {
      requireLogin();
      return false;
    }
    if (ratingLoading || !movie) return false;

    const previousRating = rating;
    const optimisticRating = value == null ? null : Number(value);

    try {
      setRatingLoading(true);
      setError("");
      setRating(optimisticRating);
      const res = await traktSetRating({
        type: mediaType === "tv" ? "show" : "movie",
        tmdbId: movie.id,
        rating: value,
      });
      const saved =
        res?.rating == null || !Number.isFinite(Number(res.rating))
          ? optimisticRating
          : Number(res.rating);
      setRating(saved);
      return true;
    } catch {
      setRating(previousRating);
      setError("No se pudo guardar la puntuación.");
      return false;
    } finally {
      setRatingLoading(false);
    }
  };

  const handleToggleTrailer = async (e) => {
    e?.stopPropagation?.();
    closeSoundtrackOverlay();

    if (showTrailer) {
      setShowTrailer(false);
      return;
    }

    try {
      setTrailerLoading(true);
      setError("");

      const t = await getBestTrailerCached(movie.id, mediaType);

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

  // Autoplay del tráiler ~1s después del hover. Esta tarjeta se MONTA al hacer
  // hover, así que un temporizador al montar equivale a "poco después del hover".
  // Si dejas de hacer hover antes, la tarjeta se desmonta y el cleanup cancela el
  // temporizador (no arranca). El ref lee el estado más reciente para no cerrar
  // un tráiler que ya hayas abierto manualmente dentro de esa ventana.
  const autoTrailerRef = useRef(null);
  autoTrailerRef.current = {
    showTrailer,
    trailerLoading,
    play: handleToggleTrailer,
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      const s = autoTrailerRef.current;
      if (s && !s.showTrailer && !s.trailerLoading) s.play();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleToggleSoundtrack = async (e) => {
    e.stopPropagation();
    if (soundtrackLoading) return;

    if (soundtrackOpen) {
      closeSoundtrackOverlay();
      return;
    }

    if (showTrailer) setShowTrailer(false);
    setSoundtrackOpen(true);
    setSoundtrackError("");

    if (soundtrackTrack?.previewUrl) return;

    const controller = new AbortController();
    soundtrackAbortRef.current?.abort();
    soundtrackAbortRef.current = controller;
    setSoundtrackLoading(true);

    try {
      const title = movie.title || movie.name || "";
      const params = new URLSearchParams({
        title,
        type: mediaType,
        country: "ES",
        tmdbId: String(movie.id),
      });
      const originalTitle = movie.original_title || movie.original_name;
      if (originalTitle && originalTitle !== title) {
        params.set("originalTitle", originalTitle);
      }
      const year = yearOf(movie);
      if (year) params.set("year", String(year));

      const response = await fetch(`/api/soundtrack?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Soundtrack HTTP ${response.status}`);

      const data = await response.json();
      const track = Array.isArray(data?.tracks)
        ? data.tracks.find((item) => item?.previewUrl)
        : null;

      if (!track?.previewUrl) {
        setSoundtrackError(
          "No se encontró una canción con preview para este título.",
        );
        return;
      }

      setSoundtrackTrack({
        id: track.id || track.previewUrl,
        previewUrl: track.previewUrl,
        trackName: track.trackName || track.name || "Soundtrack",
        artistName: track.artistName || "",
        artworkUrl: track.artworkUrl || "",
        source: track.source || "",
      });
    } catch (requestError) {
      if (requestError?.name !== "AbortError") {
        setSoundtrackError("No se pudo cargar el soundtrack.");
      }
    } finally {
      if (soundtrackAbortRef.current === controller) {
        soundtrackAbortRef.current = null;
        setSoundtrackLoading(false);
      }
    }
  };

  const handleToggleSoundtrackPlayback = async (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !soundtrackTrack?.previewUrl) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    audio.volume = 0.3;
    try {
      await audio.play();
    } catch {
      setSoundtrackPlaying(false);
    }
  };

  const bgSrc = backdropPath
    ? buildImg(backdropPath, PREVIEW_BACKDROP_SIZE)
    : null;
  const logoSrc = logoPath ? buildImg(logoPath, "w500") : null;
  const tmdbRating = ratingOf(movie);
  const hasTmdbRating = tmdbRating !== "–";

  const genreObjects = (() => {
    const ids =
      movie.genre_ids ||
      (Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : []);
    return (Array.isArray(ids) ? ids : [])
      .map((id) => (GENRES[id] ? { id, name: GENRES[id] } : null))
      .filter(Boolean);
  })();

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

  return (
    <>
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      ref={cardRef}
      className={dashboardPreviewCardClass(heightClass, isSpotlight)}
      onClick={openPreviewModal}
    >
      <div
        className={
          isSpotlight
            ? "absolute inset-0 h-full w-full overflow-hidden bg-neutral-950"
            : dashboardPreviewMediaClass
        }
      >
        {!showTrailer && !backdropReady && (
          <div className="relative w-full h-full bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 overflow-hidden">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
              variants={shimmer}
              animate="animate"
              style={{ backgroundSize: "200% 100%" }}
            />
          </div>
        )}

        {!showTrailer && bgSrc && (
          <NextImage
            key={bgSrc}
            src={bgSrc}
            alt={movie.title || movie.name}
            fill
            sizes={
              isSpotlight
                ? "(min-width:1280px) 924px, (min-width:768px) 818px, (min-width:640px) 711px, 604px"
                : "(min-width:1280px) 480px, (min-width:768px) 430px, 100vw"
            }
            className={`object-cover transition-opacity duration-200 ${
              isSpotlight ? "" : "scale-[1.015]"
            } ${
              backdropReady ? "opacity-100" : "opacity-0"
            }`}
            style={
              isSpotlight ? undefined : dashboardPreviewBackdropFadeStyle
            }
            loading="eager"
            fetchPriority="high"
            onLoad={() => setBackdropReady(true)}
            onError={() => {
              if (isSpotlight) {
                spotlightBackdropCache.set(
                  getBackdropCacheKey(movie, mediaType),
                  null,
                );
                setBackdropReady(false);
                return;
              }
              const fallback = getPreviewBackdropFallback(movie);
              if (fallback && fallback !== backdropPath) {
                movieBackdropCache.set(getBackdropCacheKey(movie, mediaType), fallback);
                setBackdropPath(fallback);
                setBackdropReady(true);
                return;
              }
              setBackdropReady(false);
            }}
          />
        )}

        {showTrailer && (
          <>
            {(trailerLoading || !trailerSrc) && (
              <div className="absolute inset-0 bg-neutral-900 animate-pulse" />
            )}

            {trailerSrc && (
              <div className="absolute inset-0 overflow-hidden">
                <iframe
                  key={trailer.key}
                  ref={trailerIframeRef}
                  className="absolute left-1/2 top-1/2
                                    w-[140%] h-[180%]
                                    -translate-x-1/2 -translate-y-1/2
                                    pointer-events-none"
                  src={trailerSrc}
                  title={`Trailer - ${movie.title || movie.name}`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen={false}
                  onLoad={syncTrailerAudio}
                />
                <PreviewTrailerAudioButton
                  muted={trailerMuted}
                  onToggle={handleToggleTrailerAudio}
                />
              </div>
            )}
          </>
        )}

        {isSpotlight ? (
          <>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/65 via-black/20 to-transparent" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24
                        bg-gradient-to-b from-transparent via-black/35 to-black/70"
          />
        )}
      </div>

      <div
        className={
          isSpotlight
            ? "absolute inset-0 z-10 h-full w-full"
            : dashboardPreviewInfoClass
        }
      >
        {isSpotlight ? (
          <div className="flex h-full items-end p-5 md:p-6 xl:p-8">
            <div className="min-w-0 max-w-[88%] sm:max-w-[82%] md:max-w-[72%] xl:max-w-[68%]">
              {logoSrc ? (
                <div className="relative mb-5 h-16 w-full max-w-[17rem] md:mb-6 md:h-20 md:max-w-[19rem] xl:h-24 xl:max-w-[21rem]">
                  <NextImage
                    src={logoSrc}
                    alt={movie.title || movie.name}
                    fill
                    sizes="(min-width:1280px) 336px, 272px"
                    className="object-contain object-left drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)]"
                    loading="eager"
                  />
                </div>
              ) : (
                <h3 className="mb-5 text-balance text-2xl font-black leading-none tracking-[-0.03em] text-white drop-shadow-lg sm:text-3xl md:mb-6">
                  {movie.title || movie.name}
                </h3>
              )}

              <motion.div
                className="mb-3 w-full sm:w-auto"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                onClick={(e) => e.stopPropagation()}
              >
                <DetailActionsRow
                  size="lg"
                  className="labeled-row"
                  showSeparator={false}
                  onTrailer={handleToggleTrailer}
                  trailerAvailable
                  trailerLoading={trailerLoading}
                  trailerLabel="Ver trailer"
                  trailerPlaying={showTrailer}
                  onSoundtrack={handleToggleSoundtrack}
                  soundtrackAvailable
                  favorite={favorite}
                  favoriteLoading={loadingStates || updating}
                  onToggleFavorite={handleToggleFavorite}
                  watchlist={watchlist}
                  watchlistLoading={loadingStates || updating}
                  onToggleWatchlist={handleToggleWatchlist}
                />
              </motion.div>

              {extras?.awards && (
                <div className="mb-2.5 flex items-center gap-2 text-xs font-bold text-emerald-300 drop-shadow-md sm:text-sm">
                  <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="line-clamp-1">{extras.awards}</span>
                </div>
              )}

              <div className="mb-2 flex w-full max-w-full flex-wrap items-center justify-start gap-x-2 gap-y-1.5">
                {(() => {
                  const badge = getSpotlightBadge(movie);
                  return badge ? (
                    <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[0.62rem] font-black uppercase tracking-wide text-black sm:text-[0.68rem]">
                      {badge}
                    </span>
                  ) : null;
                })()}
                <DetailsMetaGenresRow
                  yearIso={yearOf(movie)}
                  displayRuntimeValue={
                    previewDetails.runtimeFallback ||
                    (typeof extras?.runtime === "number"
                      ? formatRuntime(extras.runtime)
                      : extras?.runtime)
                  }
                  status={previewDetails.status}
                  genres={
                    previewDetails.genreObjects.length
                      ? previewDetails.genreObjects
                      : genreObjects
                  }
                />
              </div>

              <DetailsRatingsBadges
                tmdb={
                  hasTmdbRating
                    ? {
                        value: tmdbRating,
                        sub: formatCountShort(movie.vote_count),
                      }
                    : null
                }
                imdb={
                  typeof extras?.imdbRating === "number"
                    ? { value: extras.imdbRating.toFixed(1), sub: null }
                    : null
                }
              />

              {error && (
                <p className="mt-2 line-clamp-1 text-xs text-red-300">
                  {error}
                </p>
              )}
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.25, ease: "easeOut" }}
            className="h-full"
          >
            {/* Fila de acciones COMPARTIDA con DetailsClient/DetailModal. Va
                envuelta en un contenedor que corta la propagación al onClick de
                la card (que abre la ficha rápida): así los clics en los botones
                accionan su función y no abren el modal a la vez. Cada handler
                además llama a e.stopPropagation() por robustez. */}
            <div
              className="mb-3"
              onClick={(e) => e.stopPropagation()}
            >
              <DetailActionsRow
                onTrailer={handleToggleTrailer}
                trailerAvailable
                trailerLoading={trailerLoading}
                trailerLabel="Ver tráiler"
                trailerPlaying={showTrailer}
                onSoundtrack={handleToggleSoundtrack}
                soundtrackAvailable
                onEpisodeRatings={
                  mediaType === "tv"
                    ? (e) => {
                        e?.stopPropagation?.();
                        setEpisodeRatingsOpen(true);
                      }
                    : undefined
                }
                episodeRatingsOpen={episodeRatingsOpen}
                trakt={{
                  connected: traktInfo.connected,
                  watched: traktInfo.watched,
                  plays: traktInfo.plays,
                  badge: traktInfo.badge,
                  busy: false,
                  loading: traktInfo.loading,
                  onOpen: (e) => {
                    e?.stopPropagation?.();
                    openDetailModal?.(movie);
                  },
                }}
                rate={{
                  rating,
                  max: 10,
                  loading: ratingLoading,
                  onRate: handleRatePreview,
                  connected: traktInfo.connected,
                  onConnect: () => requireLogin(),
                }}
                favorite={favorite}
                favoriteLoading={loadingStates || updating}
                onToggleFavorite={handleToggleFavorite}
                watchlist={watchlist}
                watchlistLoading={loadingStates || updating}
                onToggleWatchlist={handleToggleWatchlist}
              />
            </div>

            {extras?.awards && (
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold text-emerald-300 drop-shadow-md sm:text-xs">
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
              </div>
            )}

            {/* Fila meta + géneros COMPARTIDA con DetailModal/DetailsClient:
                badge contextual · año · duración · estado · géneros. Misma
                composición que FeaturedHero para las tarjetas x1.6. */}
            <div className="mb-2 flex w-full max-w-full flex-wrap items-center justify-start gap-x-2 gap-y-1.5">
              {(() => {
                const badge = getSpotlightBadge(movie);
                return badge ? (
                  <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[0.62rem] font-black uppercase tracking-wide text-black sm:text-[0.68rem]">
                    {badge}
                  </span>
                ) : null;
              })()}
              <DetailsMetaGenresRow
                yearIso={yearOf(movie)}
                displayRuntimeValue={previewDetails.runtimeFallback}
                status={previewDetails.status}
                genres={previewDetails.genreObjects}
              />
            </div>

            {/* Puntuaciones TMDb · IMDb con el MISMO componente compartido que
                usa DetailModal (mismo diseño). Orden espejo del modal:
                acciones → premios → meta → puntuaciones. */}
            <DetailsRatingsBadges
              tmdb={
                hasTmdbRating
                  ? {
                      value: tmdbRating,
                      sub: formatCountShort(movie.vote_count),
                    }
                  : null
              }
              imdb={
                typeof extras?.imdbRating === "number"
                  ? { value: extras.imdbRating.toFixed(1), sub: null }
                  : null
              }
            />

            {error && (
              <p className="mt-1.5 line-clamp-1 text-[11px] text-red-400">
                {error}
              </p>
            )}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {soundtrackOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-[inherit] p-4"
            role="dialog"
            aria-label={`Soundtrack de ${movie.title || movie.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            {bgSrc && (
              <NextImage
                src={bgSrc}
                alt=""
                aria-hidden="true"
                fill
                sizes="(min-width:1280px) 924px, (min-width:768px) 818px, (min-width:640px) 711px, 604px"
                className="scale-110 object-cover opacity-55 blur-2xl"
              />
            )}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" />

            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex min-h-32 w-full max-w-[32rem] items-center gap-4 overflow-hidden rounded-[1.75rem] bg-black/45 bg-gradient-to-br from-white/15 via-white/[0.06] to-black/35 p-4 pr-12 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.16),0_24px_50px_-18px_rgba(0,0,0,0.95)] backdrop-blur-3xl sm:gap-5 sm:p-5 sm:pr-14"
            >
              <button
                type="button"
                onClick={closeSoundtrackOverlay}
                autoFocus
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-white/70 transition hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:h-10 sm:w-10"
                aria-label="Cerrar soundtrack"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>

              {soundtrackLoading ? (
                <div
                  className="flex min-h-24 w-full items-center justify-center gap-3 text-zinc-300"
                  aria-live="polite"
                >
                  <Loader2 className="h-7 w-7 animate-spin text-amber-300" />
                  <span className="text-sm font-semibold">
                    Buscando música...
                  </span>
                </div>
              ) : soundtrackTrack ? (
                <>
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_18px_35px_-14px_rgba(0,0,0,0.95)] sm:h-32 sm:w-32">
                    {soundtrackTrack.artworkUrl ? (
                      <OptimizedImage
                        src={soundtrackTrack.artworkUrl}
                        alt={`Portada de ${soundtrackTrack.trackName}`}
                        decoding="async"
                        fetchPriority="high"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Music2
                          className="h-10 w-10 text-amber-300/60"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="mb-1 truncate text-[0.62rem] font-bold uppercase tracking-[0.18em] text-white/45 sm:text-[0.68rem]">
                      {movie.title || movie.name}
                    </p>
                    <h4 className="line-clamp-2 text-base font-black leading-tight text-white drop-shadow-md sm:text-xl">
                      {soundtrackTrack.trackName}
                    </h4>
                    {soundtrackTrack.artistName && (
                      <p className="mt-1 line-clamp-1 text-xs font-medium text-white/65 sm:text-sm">
                        {soundtrackTrack.artistName}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleToggleSoundtrackPlayback}
                      className="mt-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-[0_10px_30px_-12px_rgba(255,255,255,0.35)] backdrop-blur-xl transition hover:scale-105 hover:bg-white/20 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                      aria-label={
                        soundtrackPlaying
                          ? "Pausar canción"
                          : "Reproducir canción"
                      }
                    >
                      {soundtrackPlaying ? (
                        <Pause className="h-5 w-5 fill-current" />
                      ) : (
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      )}
                    </button>

                    <audio
                      ref={audioRef}
                      src={soundtrackTrack.previewUrl}
                      autoPlay
                      loop
                      preload="metadata"
                      className="hidden"
                      onLoadedMetadata={(event) => {
                        event.currentTarget.volume = 0.3;
                      }}
                      onPlay={() => setSoundtrackPlaying(true)}
                      onPause={() => setSoundtrackPlaying(false)}
                    />
                  </div>
                </>
              ) : (
                <div
                  className="flex min-h-24 w-full flex-col items-center justify-center gap-2 text-center text-zinc-300"
                  aria-live="polite"
                >
                  <Music2 className="h-8 w-8 text-amber-300/50" />
                  <p className="max-w-72 text-sm font-medium">
                    {soundtrackError ||
                      "No se encontró música para este título."}
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>

    {/* Valoración de episodios (solo series) — mismo modal que la ficha
        completa y DetailModal. Fuera del área clicable de la card. */}
    {mediaType === "tv" && (
      <EpisodeRatingsModal
        open={episodeRatingsOpen}
        onClose={() => setEpisodeRatingsOpen(false)}
        showId={Number(movie.id)}
        title={movie.title || movie.name}
      />
    )}
    </>
  );
}

function InlinePreviewCardAnticipated({
  movie,
  heightClass,
  backdropOverride,
  index,
  totalCount,
  activeIndex,
  alignment,
}) {
  const { session, account } = useAuth();
  const { openDetailModal } = useDetailModal();
  const mediaType = getMediaTypeForItem(movie);

  const mediaIdentity = `${mediaType}:${movie?.id || "empty"}`;
  const [stableBackdropState, setStableBackdropState] = useState(() => ({
    mediaIdentity,
    value: backdropOverride,
  }));
  const stableBackdropOverride =
    stableBackdropState.mediaIdentity === mediaIdentity
      ? stableBackdropState.value
      : backdropOverride;
  const [backdropPath, setBackdropPath] = useState(() =>
    getInitialDashboardPreviewBackdrop(movie, stableBackdropOverride),
  );
  const [backdropReady, setBackdropReady] = useState(() => !!backdropPath);
  const [logoPath, setLogoPath] = useState(
    () => movie?.logoPath || movie?.logo_path || null,
  );

  const [loadingStates, setLoadingStates] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  // Datos para el panel de info COMPARTIDO (mismo que InlinePreviewCard): fila
  // meta (estado · géneros · duración de respaldo) + premios. Sin Trakt,
  // puntuaciones ni soundtrack: son títulos por estrenar ("Más esperadas").
  const [previewDetails, setPreviewDetails] = useState({
    status: null,
    genreObjects: [],
    runtimeFallback: null,
  });
  const [extras, setExtras] = useState({ awards: null });

  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const trailerIframeRef = useRef(null);
  const {
    muted: trailerMuted,
    toggle: handleToggleTrailerAudio,
    sync: syncTrailerAudio,
  } = usePreviewTrailerAudio(trailerIframeRef, { volume: 30 });

  // Tráiler restringido/no disponible → ocultarlo (fallback al backdrop).
  useTrailerAutoDismiss({
    open: showTrailer,
    iframeRef: trailerIframeRef,
    videoKey: trailer?.key,
    onUnavailable: () => setShowTrailer(false),
  });

  useEffect(() => {
    setStableBackdropState((prev) =>
      prev.mediaIdentity === mediaIdentity
        ? prev
        : { mediaIdentity, value: backdropOverride },
    );
  }, [mediaIdentity, backdropOverride]);

  useEffect(() => {
    setShowTrailer(false);
    setTrailer(null);
    setTrailerLoading(false);
  }, [movie?.id]);

  useEffect(() => {
    let cancelled = false;
    const seedLogoPath = movie?.logoPath || movie?.logo_path || null;
    setLogoPath(seedLogoPath);
    if (!movie?.id) return undefined;

    fetchBestLogo(movie.id, mediaType, ["en", null, "es"])
      .then((path) => {
        if (!cancelled) setLogoPath(path || seedLogoPath || null);
      })
      .catch(() => {
        if (!cancelled) setLogoPath(seedLogoPath || null);
      });

    return () => {
      cancelled = true;
    };
  }, [mediaType, movie?.id, movie?.logoPath, movie?.logo_path]);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!movie || !session || !account?.id) {
        setFavorite(false);
        setWatchlist(false);
        return;
      }
      try {
        setLoadingStates(true);
        const st = await getBackendItemStatus({ type: mediaType, tmdbId: movie.id });
        if (!cancel) {
          setFavorite(!!st.favorite);
          setWatchlist(!!st.watchlist);
        }
      } catch {
      } finally {
        if (!cancel) setLoadingStates(false);
      }
    };
    load();
    return () => {
      cancel = true;
    };
  }, [mediaType, movie, session, account]);

  // Carga (best-effort) de los datos que alimentan el panel compartido: detalles
  // TMDb (estado · géneros · duración) + premios.
  useEffect(() => {
    if (!movie?.id) return undefined;
    let cancelled = false;
    const isTv = mediaType === "tv";

    (async () => {
      // imdb_id resuelto una sola vez para premios (OMDb). Las puntuaciones no se
      // muestran en "Más esperadas", así que no se pide la nota IMDb.
      const imdbIdPromise = resolveImdbId(movie, mediaType);

      // Detalles TMDb: estado crudo, géneros [{id,name}] y duración de respaldo.
      try {
        const details = await getDetails(mediaType, movie.id).catch(() => null);
        if (!cancelled && details) {
          let genreObjects = [];
          if (Array.isArray(details?.genres) && details.genres.length) {
            genreObjects = details.genres
              .filter((g) => g && g.name)
              .map((g) => ({ id: g.id ?? g.name, name: g.name }));
          } else {
            const ids = movie.genre_ids || [];
            genreObjects = (Array.isArray(ids) ? ids : [])
              .map((gid) => (GENRES[gid] ? { id: gid, name: GENRES[gid] } : null))
              .filter(Boolean);
          }

          let runtimeFallback = null;
          if (isTv) {
            if (details?.number_of_seasons) {
              runtimeFallback = `${details.number_of_seasons} Temp.`;
              if (details?.number_of_episodes) {
                runtimeFallback += ` · ${details.number_of_episodes} Eps.`;
              }
            }
          } else {
            runtimeFallback = formatRuntime(details?.runtime) || null;
          }

          setPreviewDetails({
            status: details?.status || null,
            genreObjects,
            runtimeFallback,
          });
        }
      } catch {}

      // Premios (OMDb): reutiliza el imdb_id ya resuelto (no re-pide).
      try {
        const imdb = await imdbIdPromise;
        let awards = null;
        if (imdb) {
          const omdb = await fetchOmdbByImdb(imdb).catch(() => null);
          const rawAwards = omdb?.Awards;
          awards =
            rawAwards && typeof rawAwards === "string" && rawAwards.trim()
              ? formatDashboardAwards(rawAwards)
              : null;
        }
        if (!cancelled) setExtras({ awards });
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [mediaType, movie?.genre_ids, movie?.id, movie?.imdb_id]);

  useEffect(() => {
    let abort = false;
    if (!movie) return;

    const loadAll = async () => {
      const revealBackdrop = (path) => {
        if (abort) return;
        setBackdropPath(path);
        setBackdropReady(!!path);
      };

      // Backdrop (igual que tu preview normal)
      const { backdrop: userBackdrop } = getArtworkPreference(movie.id);
      const mediaTypeForBackdrop = getMediaTypeForItem(movie);
      const backdropCacheKey = getBackdropCacheKey(movie, mediaTypeForBackdrop);
      if (userBackdrop) {
        movieBackdropCache.set(backdropCacheKey, userBackdrop);
        revealBackdrop(userBackdrop);
      } else if (stableBackdropOverride) {
        movieBackdropCache.set(backdropCacheKey, stableBackdropOverride);
        revealBackdrop(stableBackdropOverride);
      } else {
        const cachedBackdrop = movieBackdropCache.get(backdropCacheKey);
        if (cachedBackdrop !== undefined) {
          revealBackdrop(cachedBackdrop);
        } else {
          try {
            const preferred = await fetchBestBackdrop(
              movie.id,
              mediaTypeForBackdrop,
            );
            const chosen = preferred || getPreviewBackdropFallback(movie);

            movieBackdropCache.set(backdropCacheKey, chosen);

            revealBackdrop(chosen);
          } catch {
            const fallback = getPreviewBackdropFallback(movie);
            movieBackdropCache.set(backdropCacheKey, fallback);
            revealBackdrop(fallback);
          }
        }
      }

    };

    loadAll();
    return () => {
      abort = true;
    };
  }, [movie, stableBackdropOverride]);

  const openPreviewModal = () => {
    openDetailModal?.({ ...movie, logo_path: logoPath || movie?.logo_path || null });
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
    if (requireLogin() || updating || !movie) return;
    try {
      setUpdating(true);
      setError("");
      const next = !favorite;
      setFavorite(next);
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: movie.id,
        favorite: next,
        title: movie.title || movie.name,
        posterPath: movie.poster_path || movie.backdrop_path || null,
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
    if (requireLogin() || updating || !movie) return;
    try {
      setUpdating(true);
      setError("");
      const next = !watchlist;
      setWatchlist(next);
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: movie.id,
        watchlist: next,
        title: movie.title || movie.name,
        posterPath: movie.poster_path || movie.backdrop_path || null,
      });
    } catch {
      setWatchlist((v) => !v);
      setError("No se pudo actualizar pendientes.");
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleTrailer = async (e) => {
    e?.stopPropagation?.();
    if (showTrailer) {
      setShowTrailer(false);
      return;
    }

    try {
      setTrailerLoading(true);
      setError("");
      const t = await getBestTrailerCached(movie.id, mediaType);
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

  // Autoplay del tráiler ~1s tras el hover (la tarjeta se monta al hacer hover;
  // el cleanup lo cancela si dejas de hacer hover antes).
  const autoTrailerRef = useRef(null);
  autoTrailerRef.current = {
    showTrailer,
    trailerLoading,
    play: handleToggleTrailer,
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      const s = autoTrailerRef.current;
      if (s && !s.showTrailer && !s.trailerLoading) s.play();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const bgSrc = backdropPath
    ? buildImg(backdropPath, PREVIEW_BACKDROP_SIZE)
    : null;
  const logoSrc = logoPath ? buildImg(logoPath, "w500") : null;
  // Géneros como objetos [{id,name}] para <DetailsMetaGenresRow> (fallback
  // síncrono mientras cargan los detalles TMDb en previewDetails).
  const syncGenreObjects = (() => {
    const ids =
      movie.genre_ids ||
      (Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : []);
    return (Array.isArray(ids) ? ids : [])
      .map((gid) => (GENRES[gid] ? { id: gid, name: GENRES[gid] } : null))
      .filter(Boolean);
  })();

  // Determinar la alineación horizontal de la tarjeta absoluta.
  // IMPORTANTE: el posicionamiento se hace con valores de framer-motion (x/y),
  // NO con clases -translate de Tailwind, porque framer sobrescribe el
  // `transform` al animar la escala y rompería el centrado.
  let alignmentClass = "left-1/2";
  let alignX = "-50%"; // centrado: desplaza media anchura propia
  let originX = "center";

  if (alignment === "left") {
    alignmentClass = "left-0";
    alignX = "0%";
    originX = "left";
  } else if (alignment === "right") {
    alignmentClass = "right-0";
    alignX = "0%";
    originX = "right";
  }
  // Ancla la IMAGEN sobre la tarjeta (marginTop = -½ alto de imagen) + origen de
  // la escala en ese centro. Ancho FIJO (300/350/410/450) → responsive por CSS,
  // SIN ref (evita el aviso "Accessing element.ref" de React 19 en hijos de
  // AnimatePresence con ref). `_` en el valor arbitrario de origin = espacio.
  const previewAnchorClass = `-mt-[84px] sm:-mt-[98px] md:-mt-[115px] xl:-mt-[127px] ${
    {
      center:
        "origin-[center_84px] sm:origin-[center_98px] md:origin-[center_115px] xl:origin-[center_127px]",
      left: "origin-[left_84px] sm:origin-[left_98px] md:origin-[left_115px] xl:origin-[left_127px]",
      right:
        "origin-[right_84px] sm:origin-[right_98px] md:origin-[right_115px] xl:origin-[right_127px]",
    }[originX]
  }`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, x: alignX }}
      animate={{ opacity: 1, scale: 1.18, x: alignX }}
      exit={{
        opacity: 0,
        scale: 0.92,
        x: alignX,
        transition: { duration: 0.14, ease: "easeInOut" },
      }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 22,
        mass: 0.7,
      }}
      className={`absolute top-1/2 ${alignmentClass} w-[300px] sm:w-[350px] md:w-[410px] xl:w-[450px] ${previewAnchorClass} rounded-xl text-white cursor-pointer bg-[#141414]/95 backdrop-blur-xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 z-50 hidden sm:flex flex-col overflow-hidden`}
      onClick={openPreviewModal}
      style={{ willChange: "transform, opacity" }}
    >
      {/* Backdrop de 16:9 */}
      <div className="relative w-full aspect-video overflow-hidden bg-neutral-900">
        {!showTrailer && !backdropReady && (
          <div className="absolute inset-0 bg-neutral-900 animate-pulse" />
        )}

        {!showTrailer && bgSrc && (
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: 1.08 }}
            transition={{ duration: 4, ease: "easeOut" }}
            className="absolute inset-0 w-full h-full"
          >
            <NextImage
              key={bgSrc}
              src={bgSrc}
              alt={movie.title || movie.name}
              fill
              sizes="(min-width:1280px) 450px, (min-width:768px) 410px, 350px"
              className={`scale-[1.015] object-cover transition-opacity duration-200 ${
                backdropReady ? "opacity-100" : "opacity-0"
              }`}
              style={dashboardPreviewBackdropFadeStyle}
              loading="eager"
              fetchPriority="high"
              onLoad={() => setBackdropReady(true)}
              onError={() => {
                const fallback = getPreviewBackdropFallback(movie);
                if (fallback && fallback !== backdropPath) {
                  movieBackdropCache.set(getBackdropCacheKey(movie, mediaType), fallback);
                  setBackdropPath(fallback);
                  setBackdropReady(true);
                  return;
                }
                setBackdropReady(false);
              }}
            />
          </motion.div>
        )}

        {showTrailer && (
          <>
            {trailerLoading && (
              <div className="absolute inset-0 bg-neutral-900 animate-pulse" />
            )}
            {trailer?.key && (
              <div className="absolute inset-0 overflow-hidden">
                <iframe
                  key={trailer.key}
                  ref={trailerIframeRef}
                  className="absolute left-1/2 top-1/2 w-[140%] h-[180%] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=0&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1`}
                  title={`Trailer - ${movie.title || movie.name}`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen={false}
                  onLoad={syncTrailerAudio}
                />
                <PreviewTrailerAudioButton
                  muted={trailerMuted}
                  onToggle={handleToggleTrailerAudio}
                />
              </div>
            )}
          </>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent via-black/35 to-black/70"
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4">
          {logoSrc ? (
            <div className="relative h-12 w-full max-w-[14rem]">
              <NextImage
                src={logoSrc}
                alt={movie.title || movie.name || ""}
                fill
                sizes="224px"
                className="object-contain object-left drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)]"
                loading="eager"
              />
            </div>
          ) : (
            <h3 className="line-clamp-2 max-w-[90%] text-xl font-black leading-none text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
              {movie.title || movie.name}
            </h3>
          )}
        </div>
      </div>

      {/* Panel de info (debajo del backdrop) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.25, ease: "easeOut" }}
        className="w-full bg-[#141414]/95 backdrop-blur-md px-3.5 py-3 sm:px-4 sm:py-3.5 border-t border-white/5"
      >
        {/* Fila de acciones COMPARTIDA (mismo estilo que las demás previews):
            tráiler + favorito + pendiente. Sin trakt/puntuar/soundtrack/episodios
            (irrelevantes en títulos por estrenar), por eso showSeparator={false}.
            El contenedor corta la propagación al onClick de la card. */}
        <div className="mb-3" onClick={(e) => e.stopPropagation()}>
          <DetailActionsRow
            onTrailer={handleToggleTrailer}
            trailerAvailable
            trailerLoading={trailerLoading}
            trailerLabel="Ver tráiler"
            trailerPlaying={showTrailer}
            favorite={favorite}
            favoriteLoading={loadingStates || updating}
            onToggleFavorite={handleToggleFavorite}
            watchlist={watchlist}
            watchlistLoading={loadingStates || updating}
            onToggleWatchlist={handleToggleWatchlist}
            showSeparator={false}
          />
        </div>

        {extras?.awards && (
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold text-emerald-300 drop-shadow-md sm:text-xs">
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
          </div>
        )}

        {/* Fila meta + géneros COMPARTIDA: badge contextual · año · duración ·
            estado · géneros, igual que FeaturedHero. */}
        <div className="mb-2 flex w-full max-w-full flex-wrap items-center justify-start gap-x-2 gap-y-1.5">
          {(() => {
            const badge = getSpotlightBadge(movie);
            return badge ? (
              <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[0.62rem] font-black uppercase tracking-wide text-black sm:text-[0.68rem]">
                {badge}
              </span>
            ) : null;
          })()}
          <DetailsMetaGenresRow
            yearIso={yearOf(movie)}
            displayRuntimeValue={previewDetails.runtimeFallback}
            status={previewDetails.status}
            genres={
              previewDetails.genreObjects.length
                ? previewDetails.genreObjects
                : syncGenreObjects
            }
          />
        </div>

        {error && (
          <p className="mt-1.5 line-clamp-1 text-[11px] text-red-400">
            {error}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ---------- Fila con filtro de tiempo (semana/mes/año) ---------- */
const RowWithTimeFilter = memo(function RowWithTimeFilter({
  title,
  weeklyData,
  monthlyData,
  yearlyData,
  isMobile,
  hydrated,
  posterCacheRef,
  posterOverrides,
  backdropOverrides,
  overridesReady,
  eager = false,
}) {
  const [selectedPeriod, setSelectedPeriod] = useState("weekly");

  const periodMap = useMemo(
    () => ({
      weekly: { label: "Semana", data: toItemsArray(weeklyData) },
      monthly: { label: "Mes", data: toItemsArray(monthlyData) },
      yearly: { label: "Año", data: toItemsArray(yearlyData) },
    }),
    [weeklyData, monthlyData, yearlyData],
  );

  // Filtrar solo los períodos que tienen datos
  const availablePeriods = useMemo(
    () => Object.entries(periodMap).filter(([_, { data }]) => data?.length > 0),
    [periodMap],
  );

  // Verificar si el período seleccionado está disponible, si no, cambiar al primero disponible
  useEffect(() => {
    const isCurrentPeriodAvailable = availablePeriods.some(
      ([key]) => key === selectedPeriod,
    );
    if (!isCurrentPeriodAvailable && availablePeriods.length > 0) {
      setSelectedPeriod(availablePeriods[0][0]);
    }
  }, [availablePeriods, selectedPeriod]);

  const currentData = useMemo(
    () => periodMap[selectedPeriod]?.data || EMPTY_ARRAY,
    [periodMap, selectedPeriod],
  );

  if (availablePeriods.length === 0) return null;

  return (
    <div className="relative">
      {/* Título con selector de período */}
      <div className="mb-5 px-1 sm:px-0">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-px w-8 bg-amber-500" />
          <span className="text-amber-400 font-bold uppercase tracking-widest text-[10px]">
            TRAKT
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent">
            {title}
            <span className="text-amber-500">.</span>
          </h3>

          {/* Selector de período */}
          <div className={dashboardSegmentGroupClass}>
            {availablePeriods.map(([key, { label, data }]) => (
              <button
                key={key}
                onClick={() => setSelectedPeriod(key)}
                className={dashboardSegmentButtonClass(selectedPeriod === key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Componente Row con los datos seleccionados */}
      <Row
        title={title}
        items={currentData}
        isMobile={isMobile}
        hydrated={hydrated}
        posterCacheRef={posterCacheRef}
        posterOverrides={posterOverrides}
        backdropOverrides={backdropOverrides}
        overridesReady={overridesReady}
        eager={eager}
        hideTitle={true}
      />
    </div>
  );
});

/* ---------- Fila con filtro de fuente (Trakt/TMDb) ---------- */
const RowWithSourceFilter = memo(function RowWithSourceFilter({
  title,
  traktData,
  tmdbData,
  isMobile,
  hydrated,
  posterCacheRef,
  posterOverrides,
  backdropOverrides,
  overridesReady,
  eager = false,
}) {
  // selectedSource es la preferencia del usuario; puede que la fuente esté vacía
  const [selectedSource, setSelectedSource] = useState("trakt");

  const sourceMap = useMemo(
    () => ({
      trakt: { label: "Trakt", data: toItemsArray(traktData) },
      tmdb: { label: "TMDb", data: toItemsArray(tmdbData) },
    }),
    [traktData, tmdbData],
  );

  // Filtrar solo las fuentes que tienen datos
  const availableSources = useMemo(
    () => Object.entries(sourceMap).filter(([_, { data }]) => data?.length > 0),
    [sourceMap],
  );

  // Fuente efectiva: preferencia del usuario si tiene datos, si no la primera disponible
  // Se calcula de forma derivada para que Row reciba datos desde el primer render
  const effectiveSource = useMemo(() => {
    if (sourceMap[selectedSource]?.data?.length > 0) return selectedSource;
    return availableSources[0]?.[0] || selectedSource;
  }, [sourceMap, selectedSource, availableSources]);

  const currentData = useMemo(
    () => sourceMap[effectiveSource]?.data || EMPTY_ARRAY,
    [sourceMap, effectiveSource],
  );

  if (availableSources.length === 0) return null;

  return (
    <div className="relative">
      {/* Título con selector de fuente */}
      <div className="mb-5 px-1 sm:px-0">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-px w-8 bg-amber-500" />
          <span className="text-amber-400 font-bold uppercase tracking-widest text-[10px]">
            {effectiveSource === "trakt" ? "TRAKT" : "TMDB"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <ExpandableSectionTitle
            title={title}
            href={EXPANDABLE_SECTION_HREFS[title]}
          />

          {/* Selector de fuente */}
          <div className={dashboardSegmentGroupClass}>
            {availableSources.map(([key, { label, data }]) => (
              <button
                key={key}
                onClick={() => setSelectedSource(key)}
                className={dashboardSegmentButtonClass(effectiveSource === key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Componente Row con los datos seleccionados */}
      <Row
        title={title}
        items={currentData}
        isMobile={isMobile}
        hydrated={hydrated}
        posterCacheRef={posterCacheRef}
        posterOverrides={posterOverrides}
        backdropOverrides={backdropOverrides}
        overridesReady={overridesReady}
        eager={eager}
        hideTitle={true}
      />
    </div>
  );
});

/* ---------- Fila reusable ---------- */
/* ---------- Fila reusable ---------- */
// Exportado para reutilizarlo como FUENTE ÚNICA en los dashboards de películas y
// series (misma fila póster + preview al hover que Inicio). Usa useDetailModal()
// internamente → el consumidor debe estar dentro de un <DetailModalProvider>.
export function Row({
  title,
  items,
  isMobile,
  hydrated,
  posterCacheRef,
  posterOverrides,
  backdropOverrides,
  overridesReady,
  previewKind = "default", // 4C: selector de preview
  eager = false,
  hideTitle = false, // Ocultar título cuando se usa con RowWithTimeFilter
  labelText, // Label superior para la sección
  sectionHref,
  reserveWhileEmpty = false,
  spotlight = false, // Fila DESTACADA (×1,6). La elige el padre (una por dashboard).
}) {
  const normalizedItems = Array.isArray(items) ? items : EMPTY_ARRAY;
  const hasItems = normalizedItems.length > 0;

  // Etiqueta superior representativa (centralizada). Respeta la que llega como
  // prop; si no, la deriva del título (todas las filas tienen etiqueta).
  labelText = deriveSectionLabel(title, labelText);
  const resolvedSectionHref =
    sectionHref === false
      ? undefined
      : sectionHref || EXPANDABLE_SECTION_HREFS[title];

  const swiperRef = useRef(null);
  const rowRef = useRef(null);
  const hoverIntentRef = useRef(0);
  const { openDetailModal } = useDetailModal();
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [anticipatedAnimatingOutId, setAnticipatedAnimatingOutId] = useState(null);
  const [hoveredAlignment, setHoveredAlignment] = useState("center");
  const hoverTimeoutRef = useRef(null);
  // Cierre DIFERIDO de la vista previa. Al salir de una tarjeta no se cierra al
  // instante: se programa el cierre con un pequeño retardo. Si el cursor entra en
  // otra tarjeta dentro de ese margen, handleMouseEnterItem cancela el cierre y la
  // vista previa pasa de una tarjeta a otra SIN que `hoveredIndex` llegue a null,
  // por lo que las vecinas no rehacen su posición inicial (evita el salto).
  const closeTimeoutRef = useRef(null);
  const PREVIEW_CLOSE_DELAY_MS = 180;

  // Limpiar temporizadores al desmontar
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnterItem = (e, itemKey, index, m, backdropOverride) => {
    if (isMobile) return;
    // Cancela cualquier cierre diferido pendiente: al entrar en otra tarjeta la
    // vista previa se mueve directamente de una a otra sin pasar por "cerrada",
    // manteniendo el empuje de las vecinas (sin salto).
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    if (rowRef.current && e.currentTarget) {
      const slideRect = e.currentTarget.getBoundingClientRect();
      const rowRect = rowRef.current.getBoundingClientRect();
      // El preview mide ~2.9x el ancho del póster (su imagen 16:9 tiene el alto
      // de la tarjeta), así que CENTRADO sobresale ~previewWidth/2 ≈ 1.5-1.65x el
      // ancho de la tarjeta a cada lado del centro. Detectamos si, centrado, se
      // saldría de la fila para alinearlo hacia dentro (izq/der) y empujar solo
      // hacia dentro (funciona con cualquier nº de tarjetas por fila).
      const overflowHalf = slideRect.width * 1.6;
      const slideCenter = slideRect.left + slideRect.width / 2;
      const margin = 8;
      const wouldClipLeft = slideCenter - overflowHalf < rowRect.left + margin;
      const wouldClipRight = slideCenter + overflowHalf > rowRect.right - margin;
      setHoveredAlignment(
        wouldClipLeft ? "left" : wouldClipRight ? "right" : "center",
      );
    }

    const hoverToken = hoverIntentRef.current + 1;
    hoverIntentRef.current = hoverToken;
    setHoveredIndex(index);

    const revealWhenReady = () => {
      preparePreviewBackdrop(m, backdropOverride).finally(() => {
        if (hoverIntentRef.current === hoverToken) {
          setHoveredId(itemKey);
          setHoveredIndex(index);
        }
      });
    };

    if (previewKind === "anticipated") {
      hoverTimeoutRef.current = setTimeout(revealWhenReady, 120);
    } else {
      revealWhenReady();
    }
  };

  const handleMouseLeaveItem = (itemKey) => {
    if (isMobile) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // Cierre DIFERIDO: mantenemos abierta la vista previa (y el empuje de las
    // vecinas) durante un instante. Si el cursor entra en otra tarjeta dentro de
    // ese margen, handleMouseEnterItem cancela este cierre y la preview cambia de
    // tarjeta sin resetear posiciones. Si no, se cierra al agotarse el retardo.
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      hoverIntentRef.current += 1;
      setHoveredId((prev) => {
        if (prev === itemKey) {
          if (previewKind === "anticipated") {
            setAnticipatedAnimatingOutId(itemKey);
          }
          return null;
        }
        return prev;
      });
      setHoveredIndex(null);
      setHoveredAlignment("center");
    }, PREVIEW_CLOSE_DELAY_MS);
  };
  // Montamos la fila un poco ANTES de que entre en pantalla (margen positivo) para
  // que el Swiper esté listo sin huecos al hacer scroll, pero NO todas a la vez.
  const isInView = eager
    ? true
    : useInView(rowRef, { once: true, margin: "600px" });
  // Revelado: la fila se monta antes (isInView, para tener el Swiper listo) pero
  // solo se anima al entrar en la ventana y SOLO tras hacer scroll.
  const revealProps = useScrollRevealProps();
  const [preloadedBackdrops, setPreloadedBackdrops] = useState(new Set());

  // Precargar backdrops cuando el usuario está sobre la fila
  useEffect(() => {
    if (!isHoveredRow || !hasItems || isMobile) return;

    const preloadBackdrops = async () => {
      const toPreload = normalizedItems
        .slice(0, 5)
        .filter((m) => !preloadedBackdrops.has(m.id));

      for (const movie of toPreload) {
        const backdropOverride = backdropOverrides?.[movie.id];
        await preparePreviewBackdrop(movie, backdropOverride);
        setPreloadedBackdrops((prev) => new Set([...prev, movie.id]));
      }
    };

    const timer = setTimeout(preloadBackdrops, 300);
    return () => clearTimeout(timer);
  }, [
    isHoveredRow,
    hasItems,
    normalizedItems,
    isMobile,
    backdropOverrides,
    preloadedBackdrops,
  ]);

  const hasActivePreview = !!hoveredId;
  // Fila DESTACADA (×1,6): la elige el padre (exactamente una por dashboard) y
  // la pasa por `spotlight`. Nunca en la variante "anticipated".
  const isSpotlight = spotlight && previewKind !== "anticipated";
  const heightClassDesktop = isSpotlight
    ? "h-[340px] sm:h-[400px] md:h-[460px] xl:h-[520px]"
    : "h-[220px] sm:h-[260px] md:h-[300px] xl:h-[340px]";
  const spotlightPosterWidthClass =
    "w-[200px] sm:w-[220px] md:w-[300px] xl:w-[340px]";
  const normalPosterWidthClass =
    "w-[140px] sm:w-[140px] md:w-[190px] xl:w-[210px]";
  const spotlightPreviewWidthClass =
    "w-[604px] sm:w-[711px] md:w-[818px] xl:w-[924px]";
  // Ancho del preview = alto de la tarjeta póster × 16/9, para que su imagen
  // backdrop (16:9) mida JUSTO el alto de las tarjetas (220/260/300/340).
  const normalPreviewWidthClass =
    "w-[391px] sm:w-[462px] md:w-[533px] xl:w-[604px]";
  const posterBoxClass = isMobile ? "aspect-[2/3]" : heightClassDesktop;

  if (!hasItems) {
    if (!reserveWhileEmpty) return null;

    return (
      <div
        aria-hidden="true"
        className="relative pointer-events-none select-none min-h-[285px] sm:min-h-[315px] md:min-h-[360px] xl:min-h-[405px]"
      />
    );
  }

  // Montaje perezoso: hasta que la fila se acerca al viewport NO montamos el
  // Swiper (caro: ~28 slides + imágenes). Reservamos su altura y mostramos el
  // título, de modo que la carga inicial sea ligera y el scroll vertical responda
  // de inmediato. El Swiper se monta al acercarse (margin del useInView).
  if (!isInView) {
    return (
      // Placeholder: reserva la altura, pero OCULTO (mismas revealProps que la
      // fila montada). Si no, el título de una fila que asome bajo el hero se
      // vería al cargar/recargar antes de que la fila se monte.
      <motion.div
        ref={rowRef}
        {...revealProps}
        variants={fadeInUp}
        className="relative"
      >
        {!hideTitle && (
          <div className="mb-5 px-1 sm:px-0">
            {labelText && (
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-px w-8 bg-amber-500" />
                <span className="text-amber-400 font-bold uppercase tracking-widest text-[10px]">
                  {labelText}
                </span>
              </div>
            )}
            <ExpandableSectionTitle
              title={title}
              href={resolvedSectionHref}
            />
          </div>
        )}
        <div
          aria-hidden="true"
          className={
            isMobile
              ? isSpotlight
                ? "min-h-[300px]"
                : "min-h-[200px]"
              : heightClassDesktop
          }
        />
      </motion.div>
    );
  }

  const updateNav = (swiper) => {
    if (!swiper) return;
    const hasOverflow = !swiper.isLocked;
    setCanPrev(hasOverflow && !swiper.isBeginning);
    setCanNext(hasOverflow && !swiper.isEnd);
    setActiveIndex(swiper.activeIndex);
  };

  const handleSwiper = (swiper) => {
    swiperRef.current = swiper;
    updateNav(swiper);
  };

  const handlePrevClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const swiper = swiperRef.current;
    if (!swiper) return;
    // Avanzar 3 slides en lugar de 1 para desktop
    const slidesToMove = isMobile ? 1 : 3;
    for (let i = 0; i < slidesToMove; i++) {
      swiper.slidePrev();
    }
  };

  const handleNextClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const swiper = swiperRef.current;
    if (!swiper) return;
    // Avanzar 3 slides en lugar de 1 para desktop
    const slidesToMove = isMobile ? 1 : 3;
    for (let i = 0; i < slidesToMove; i++) {
      swiper.slideNext();
    }
  };

  const showPrev = (isHoveredRow || hasActivePreview) && canPrev;
  const showNext = (isHoveredRow || hasActivePreview) && canNext;

  const breakpointsRow = {
    0: { slidesPerView: isSpotlight ? 2 : 3, spaceBetween: isSpotlight ? 14 : 12 },
    640: { slidesPerView: isSpotlight ? 2.2 : 4, spaceBetween: isSpotlight ? 18 : 14 },
    768: { slidesPerView: "auto", spaceBetween: isSpotlight ? 24 : 14 },
    1024: { slidesPerView: "auto", spaceBetween: isSpotlight ? 30 : 18 },
    1280: { slidesPerView: "auto", spaceBetween: isSpotlight ? 36 : 20 },
  };

  // No incluimos `hydrated` en la key: hacerlo remonta el Swiper al hidratar y
  // bloquea el primer desliz. La config solo cambia con el layout (móvil/desktop).
  const swiperKey = `${title}-${isMobile ? "m" : "d"}`;

  return (
    <motion.div
      ref={rowRef}
      {...revealProps}
      variants={fadeInUp}
      // Las previews superpuestas no pueden convivir con `content-visibility`:
      // el navegador puede recortar el popover al límite de la sección.
      // Con preview activo elevamos el z-index de TODA la fila (como en backdrop)
      // para que el preview quede SIEMPRE superpuesto y la fila siguiente no lo
      // tape / recorte por abajo.
      className={`relative group ${hasActivePreview ? "z-[100]" : ""} ${
        previewKind === "anticipated" || hasActivePreview
          ? ""
          : "sv-deferred-row"
      }`}
    >
      {!hideTitle && (
        <motion.div variants={scaleIn} className="mb-5 px-1 sm:px-0">
          {labelText && (
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-px w-8 bg-amber-500" />
              <span className="text-amber-400 font-bold uppercase tracking-widest text-[10px]">
                {labelText}
              </span>
            </div>
          )}
          <ExpandableSectionTitle
            title={title}
            href={resolvedSectionHref}
          />
        </motion.div>
      )}

      <div
        className={`relative ${hasActivePreview ? "z-30" : ""}`}
        onMouseEnter={() => setIsHoveredRow(true)}
        onMouseLeave={() => {
          if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
          }
          // Al salir de la fila entera cerramos ya (sin diferir) y cancelamos
          // cualquier cierre diferido pendiente de las tarjetas.
          if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
          }
          hoverIntentRef.current += 1;
          setIsHoveredRow(false);
          setHoveredId((prev) => {
            if (prev) {
              if (previewKind === "anticipated") {
                setAnticipatedAnimatingOutId(prev);
              }
            }
            return null;
          });
          setHoveredIndex(null);
        }}
      >
        <div>
          <Swiper
            key={swiperKey}
            slidesPerView={isSpotlight ? 2 : 3}
            spaceBetween={isSpotlight ? 14 : 12}
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
            className={`group relative ${
              previewKind === "anticipated"
                ? "!py-20 sm:!py-24 md:!py-28 !-my-20 sm:!-my-24 md:!-my-28"
                : hasActivePreview
                  ? "!overflow-visible"
                  : ""
            }`}
            wrapperClass={previewKind === "anticipated" || hasActivePreview ? "flex items-center" : ""}
            breakpoints={breakpointsRow}
          >
            {normalizedItems.map((m, i) => {
              const itemType =
                m.media_type === "tv" ||
                (m.name && !m.title) ||
                m.first_air_date
                  ? "tv"
                  : "movie";
              const itemKey = `${itemType}:${m.id}:${i}`;
              const isActive = hydrated && !isMobile && hoveredId === itemKey;
              const isAnimatingOut = anticipatedAnimatingOutId === itemKey;
              const isLast = i === normalizedItems.length - 1;
              const isSecondToLast = i === normalizedItems.length - 2;
              const isThirdToLast = i === normalizedItems.length - 3;
              const isNearEnd = isLast || isSecondToLast || isThirdToLast;

              const base =
                "relative flex-shrink-0 transition-all duration-300 ease-in-out";

              const isStandardPopoverPreview =
                isActive && previewKind !== "anticipated" && !isSpotlight;

              const sizeClasses = isMobile
                ? "w-full"
                : (isActive && previewKind !== "anticipated")
                  ? `${isSpotlight ? spotlightPreviewWidthClass : normalPosterWidthClass} z-20`
                  : `${isSpotlight ? spotlightPosterWidthClass : normalPosterWidthClass} z-10`;
              // Caja de la tarjeta: SIEMPRE altura fija (posterBoxClass), también
              // en la vista previa destacada. Si la activa usa una altura
              // derivada del aspecto (aspect-video / h-full), al cerrar el
              // `transition-all` anima la altura y desplaza la sección inferior.
              // Con altura fija la fila nunca cambia de alto.
              const itemBoxClass = posterBoxClass;

              const zOverflowClasses = previewKind === "anticipated"
                ? isActive
                  ? "z-[90] overflow-visible"
                  : isAnimatingOut
                    ? "z-[80] overflow-visible"
                    : "overflow-hidden"
                : isActive
                  ? "overflow-visible"
                  : "overflow-hidden";

              // Empuje de vecinos para hacer hueco al preview que se abre.
              let transformClass = "";
              if (
                !isMobile &&
                hoveredIndex !== null &&
                hoveredIndex >= 0 &&
                previewKind !== "anticipated"
              ) {
                if (isSpotlight) {
                  // Spotlight: si el activo está en los últimos 3, desplaza el
                  // activo (y los previos) a la izquierda para no salirse.
                  const activeIndex = hoveredIndex;
                  const totalItems = normalizedItems.length;
                  if (activeIndex >= totalItems - 3 && i <= activeIndex) {
                    if (activeIndex === totalItems - 1) {
                      transformClass =
                        "sm:-translate-x-[300px] md:-translate-x-[420px] xl:-translate-x-[470px]";
                    } else if (activeIndex === totalItems - 2) {
                      transformClass =
                        "sm:-translate-x-[210px] md:-translate-x-[290px] xl:-translate-x-[320px]";
                    } else if (activeIndex === totalItems - 3) {
                      transformClass =
                        "sm:-translate-x-[105px] md:-translate-x-[145px] xl:-translate-x-[160px]";
                    }
                  }
                } else if (i !== hoveredIndex) {
                  // Filas póster normales: los vecinos se APARTAN para dejar el
                  // hueco justo del preview (ancho = alto tarjeta × 16/9).
                  //   HALF = (anchoPreview − anchoTarjeta)/2  (alineado CENTRO,
                  //          simétrico a ambos lados).
                  //   FULL = anchoPreview − anchoTarjeta      (pegado a un BORDE:
                  //          empuja solo hacia dentro, el doble).
                  const HALF_L =
                    "sm:-translate-x-[161px] md:-translate-x-[172px] xl:-translate-x-[197px]";
                  const HALF_R =
                    "sm:translate-x-[161px] md:translate-x-[172px] xl:translate-x-[197px]";
                  const FULL_L =
                    "sm:-translate-x-[322px] md:-translate-x-[343px] xl:-translate-x-[394px]";
                  const FULL_R =
                    "sm:translate-x-[322px] md:translate-x-[343px] xl:translate-x-[394px]";
                  if (hoveredAlignment === "left") {
                    if (i > hoveredIndex) transformClass = FULL_R;
                  } else if (hoveredAlignment === "right") {
                    if (i < hoveredIndex) transformClass = FULL_L;
                  } else {
                    transformClass = i < hoveredIndex ? HALF_L : HALF_R;
                  }
                }
              }

              const hasPosterOverride = Object.prototype.hasOwnProperty.call(
                posterOverrides || {},
                m.id,
              );
              const hasBackdropOverride = Object.prototype.hasOwnProperty.call(
                backdropOverrides || {},
                m.id,
              );

              // 4B: NO bloquees PosterImage si ya sabemos que NO hay override.
              // - undefined => aún no listo (loader)
              // - null => listo pero sin override
              // - string => override real
              const posterOverride = !overridesReady
                ? undefined
                : hasPosterOverride
                  ? posterOverrides[m.id]
                  : null;

              const backdropOverride = !overridesReady
                ? undefined
                : hasBackdropOverride
                  ? backdropOverrides[m.id]
                  : null;

              const slideZIndexClass = previewKind === "anticipated"
                ? (isActive ? "!relative !z-[100] !overflow-visible" : isAnimatingOut ? "!relative !z-[50] !overflow-visible" : "!relative !z-10")
                : (isActive ? "!relative !z-20 !overflow-visible" : "!relative !z-10");

              let standardPreviewAlignmentClass = "left-1/2";
              let standardPreviewX = "-50%";
              let standardPreviewOriginX = "center";
              if (hoveredAlignment === "left") {
                standardPreviewAlignmentClass = "left-0";
                standardPreviewX = "0%";
                standardPreviewOriginX = "left";
              } else if (hoveredAlignment === "right") {
                standardPreviewAlignmentClass = "right-0";
                standardPreviewX = "0%";
                standardPreviewOriginX = "right";
              }
              // Imagen alineada al borde SUPERIOR de la tarjeta (el panel va con
              // top-0), así ocupa su MISMO alto; la info cuelga debajo. El origen
              // de la escala va en el CENTRO de la tarjeta (alto/2 =
              // 110/130/150/170px) para crecer desde ahí. Valores responsive por
              // CSS, SIN ref (framer + React 19 avisan si un hijo de
              // AnimatePresence lleva ref). `_` en el origin arbitrario = espacio.
              const standardPreviewAnchorClass = {
                center:
                  "origin-[center_110px] sm:origin-[center_130px] md:origin-[center_150px] xl:origin-[center_170px]",
                left: "origin-[left_110px] sm:origin-[left_130px] md:origin-[left_150px] xl:origin-[left_170px]",
                right:
                  "origin-[right_110px] sm:origin-[right_130px] md:origin-[right_150px] xl:origin-[right_170px]",
              }[standardPreviewOriginX];

              return (
                <SwiperSlide
                  key={itemKey}
                  className={
                    isMobile
                      ? "select-none"
                      : `!w-auto select-none ${slideZIndexClass} ${
                          isSpotlight ? "!flex !items-center" : ""
                        }`
                  }
                >
                  <div
                    className={`${base} ${sizeClasses} ${itemBoxClass} ${transformClass} ${zOverflowClasses}`}
                    onMouseEnter={(e) => handleMouseEnterItem(e, itemKey, i, m, backdropOverride)}
                    onMouseLeave={() => handleMouseLeaveItem(itemKey)}
                  >
                    <AnimatePresence
                      initial={false}
                      mode="popLayout"
                      onExitComplete={() => {
                        setAnticipatedAnimatingOutId((prev) => (prev === itemKey ? null : prev));
                      }}
                    >
                      {isActive ? (
                        previewKind === "anticipated" ? (
                          <InlinePreviewCardAnticipated
                            key="preview-anticipated"
                            movie={m}
                            heightClass={heightClassDesktop}
                            backdropOverride={backdropOverride}
                            index={i}
                            totalCount={normalizedItems.length}
                            activeIndex={activeIndex}
                            alignment={hoveredAlignment}
                          />
                          ) : (
                            <motion.div
                              key="preview-normal"
                              initial={
                                isStandardPopoverPreview
                                  ? {
                                      opacity: 0,
                                      scale: 0.92,
                                      x: standardPreviewX,
                                    }
                                  : { opacity: 0, scale: 0.98 }
                              }
                              animate={
                                isStandardPopoverPreview
                                  ? {
                                      opacity: 1,
                                      scale: 1,
                                      x: standardPreviewX,
                                    }
                                  : { opacity: 1, scale: 1 }
                              }
                              exit={{
                                opacity: 0,
                                scale: isStandardPopoverPreview ? 0.92 : 0.95,
                                ...(isStandardPopoverPreview
                                  ? { x: standardPreviewX }
                                  : {}),
                                transition: { duration: 0.12 },
                              }}
                              transition={{
                                duration: 0.25,
                                ease: [0.4, 0, 0.2, 1],
                              }}
                              className={
                                isStandardPopoverPreview
                                  ? `absolute top-0 ${standardPreviewAlignmentClass} ${normalPreviewWidthClass} ${standardPreviewAnchorClass} z-[80] hidden sm:block`
                                  : "hidden sm:block h-full w-full"
                              }
                              style={{ willChange: "transform, opacity" }}
                            >
                            <InlinePreviewCard
                              movie={m}
                              heightClass={
                                isSpotlight ? "h-full" : heightClassDesktop
                              }
                              backdropOverride={backdropOverride}
                              isSpotlight={isSpotlight}
                            />
                          </motion.div>
                        )
                      ) : (
                        <motion.div
                          key="poster"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={
                            previewKind === "anticipated"
                              ? { opacity: 0, transition: { duration: 0 } }
                              : {
                                  opacity: 0,
                                  scale: 0.98,
                                  transition: { duration: 0.12 },
                                }
                          }
                          transition={{
                            duration: 0.18,
                            ease: [0.4, 0, 0.2, 1],
                          }}
                          className="w-full h-full"
                          style={{ willChange: "transform, opacity" }}
                        >
                          <button
                            type="button"
                            className="block h-full w-full cursor-pointer text-left"
                            onClick={() => openDetailModal?.(m)}
                            aria-label={`Abrir vista previa de ${m.title || m.name || "este título"}`}
                          >
                            <PosterImage
                              movie={m}
                              cache={posterCacheRef}
                              heightClass={posterBoxClass}
                              isMobile={isMobile}
                              posterOverride={posterOverride}
                            />
                          </button>
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
              onClick={handlePrevClick}
              className="absolute inset-y-0 -left-6 w-32 z-30
                  hidden sm:flex items-center justify-start
                  bg-gradient-to-r from-black/90 via-black/70 to-transparent
                  hover:from-black/95 hover:via-black/80
                  transition-all duration-300 pointer-events-auto group/nav"
            >
              <motion.span
                className="ml-12 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] group-hover/nav:scale-110 transition-transform"
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
              onClick={handleNextClick}
              className="absolute inset-y-0 -right-6 w-32 z-30
                  hidden sm:flex items-center justify-end
                  bg-gradient-to-l from-black/90 via-black/70 to-transparent
                  hover:from-black/95 hover:via-black/80
                  transition-all duration-300 pointer-events-auto group/nav"
            >
              <motion.span
                className="mr-12 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] group-hover/nav:scale-110 transition-transform"
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

function TraktMixedRow({ title, items, isMobile, hydrated }) {
  const { openDetailModal } = useDetailModal();

  if (!items || items.length === 0) return null;

  // Etiqueta superior representativa (centralizada): todas las filas la tienen.
  const labelText = deriveSectionLabel(title);

  const rowRef = useRef(null);
  const isInView = useInView(rowRef, { once: true, margin: "-100px" });

  const breakpointsRow = {
    0: { slidesPerView: 3, spaceBetween: 12 },
    640: { slidesPerView: 4, spaceBetween: 14 },
    768: { slidesPerView: "auto", spaceBetween: 14 },
    1024: { slidesPerView: "auto", spaceBetween: 18 },
    1280: { slidesPerView: "auto", spaceBetween: 20 },
  };

  const heightClassDesktop = "h-[220px] sm:h-[260px] md:h-[300px] xl:h-[340px]";
  const posterBoxClass = isMobile ? "aspect-[2/3]" : heightClassDesktop;
  const swiperKey = `trakt-${title}-${hydrated ? "h" : "s"}-${isMobile ? "m" : "d"}`;

  const formatMeta = (m) => {
    const year = (m?.release_date || m?.first_air_date || "").slice(0, 4);
    if (m?.media_type === "tv") {
      const eps = m?.number_of_episodes;
      return `${year || "—"}${eps ? ` • ${eps} eps.` : ""}`;
    }
    const rt = m?.runtime;
    return `${year || "—"}${rt ? ` • ${formatRuntime(rt)}` : ""}`;
  };

  return (
    <motion.div
      ref={rowRef}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeInUp}
      className="relative group"
    >
      <motion.div variants={scaleIn} className="mb-5 px-1 sm:px-0">
        {labelText && (
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-px w-8 bg-emerald-500" />
            <span className="text-emerald-400 font-bold uppercase tracking-widest text-[10px]">
              {labelText}
            </span>
          </div>
        )}
        <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent">
          {title}
          <span className="text-emerald-500">.</span>
        </h3>
      </motion.div>

      <div className={!hydrated ? "pointer-events-none touch-none" : ""}>
        <Swiper
          key={swiperKey}
          slidesPerView={3}
          spaceBetween={12}
          loop={false}
          watchOverflow={true}
          grabCursor={!isMobile}
          allowTouchMove={true}
          preventClicks={true}
          preventClicksPropagation={true}
          threshold={5}
          modules={[Navigation]}
          breakpoints={breakpointsRow}
          className="group relative"
        >
            {items.map((m) => {
              const type = m?.media_type || "movie";
              const poster = m?.poster_path
              ? buildImg(m.poster_path, "w342")
              : "/default-poster.png";

            return (
              <SwiperSlide
                key={`${type}-${m.id}`}
                className={isMobile ? "select-none" : "!w-auto select-none"}
              >
                <div
                  className={`relative flex-shrink-0 transition-all duration-300 ease-in-out ${isMobile ? "w-full" : "w-[140px] sm:w-[140px] md:w-[190px] xl:w-[210px]"} ${posterBoxClass}`}
                >
                    <button
                      type="button"
                      className="block h-full w-full cursor-pointer text-left"
                      onClick={() => openDetailModal?.(m)}
                      aria-label={`Abrir vista previa de ${m.title || m.name || "este título"}`}
                    >
                      <div className="w-full h-full">
                      <NextImage
                        src={poster}
                        alt={m.title || m.name || ""}
                        width={342}
                        height={513}
                        className={`w-full ${posterBoxClass} object-cover rounded-lg`}
                        loading="lazy"
                      />
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-300">
                        {type === "tv" ? (
                          <TvIcon className="w-3.5 h-3.5" />
                        ) : (
                          <FilmIcon className="w-3.5 h-3.5" />
                        )}
                        <span className="line-clamp-1">{formatMeta(m)}</span>
                      </div>
                      </div>
                    </button>
                </div>
              </SwiperSlide>
            );
          })}
        </Swiper>
      </div>
    </motion.div>
  );
}

/* ---------- Sección "Más esperadas" con selector Películas/Series ---------- */
const AnticipatedSection = memo(function AnticipatedSection({
  movieItems,
  tvItems,
  isMobile,
  hydrated,
  posterCacheRef,
  posterOverrides,
  backdropOverrides,
  overridesReady,
}) {
  const [activeTab, setActiveTab] = useState("movies");
  const hasMovieItems = Array.isArray(movieItems) && movieItems.length > 0;
  const hasTvItems = Array.isArray(tvItems) && tvItems.length > 0;

  // null = aún cargando; [] = cargado y vacío → ocultar sección
  const loading = movieItems === null && tvItems === null;
  const empty = !loading && !hasMovieItems && !hasTvItems;

  useEffect(() => {
    if (activeTab === "movies" && !hasMovieItems && hasTvItems) {
      setActiveTab("series");
      return;
    }
    if (activeTab === "series" && !hasTvItems && hasMovieItems) {
      setActiveTab("movies");
    }
  }, [activeTab, hasMovieItems, hasTvItems]);

  const items =
    activeTab === "movies"
      ? hasMovieItems
        ? movieItems
        : (tvItems ?? [])
      : hasTvItems
        ? tvItems
        : (movieItems ?? []);

  if (empty) return null;

  // Número de skeletons para que el placeholder tenga la misma altura aprox.
  const SKELETON_COUNT = isMobile ? 3 : 6;
  const skeletonWidth = isMobile
    ? "calc((100% - 24px) / 3)"
    : "calc(16.666% - 10px)";

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      variants={fadeInUp}
      viewport={{ once: true, margin: "-50px" }}
    >
      {/* Título con selector */}
      <div className="flex items-center justify-between mb-5 px-1 sm:px-0">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-px w-8 bg-amber-500" />
            <span className="text-amber-400 font-bold uppercase tracking-widest text-[10px]">
              PRÓXIMAMENTE
            </span>
          </div>
          <ExpandableSectionTitle
            title="Más esperadas"
            href={EXPANDABLE_SECTION_HREFS["Más esperadas"]}
          />
        </div>

        {!loading && (
          <div className={dashboardSegmentGroupClass}>
            {movieItems?.length > 0 && (
              <button
                onClick={() => setActiveTab("movies")}
                className={dashboardSegmentButtonClass(activeTab === "movies")}
              >
                Películas
              </button>
            )}
            {tvItems?.length > 0 && (
              <button
                onClick={() => setActiveTab("series")}
                className={dashboardSegmentButtonClass(activeTab === "series")}
              >
                Series
              </button>
            )}
          </div>
        )}
      </div>

      {/* Skeleton mientras carga */}
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 rounded-xl bg-neutral-900 animate-pulse"
              style={{
                width: skeletonWidth,
                aspectRatio: "2/3",
              }}
            />
          ))}
        </div>
      ) : (
        <Row
          title=""
          hideTitle={true}
          items={items}
          isMobile={isMobile}
          hydrated={hydrated}
          posterCacheRef={posterCacheRef}
          posterOverrides={posterOverrides}
          backdropOverrides={backdropOverrides}
          overridesReady={overridesReady}
          previewKind="anticipated"
          eager={true}
        />
      )}
    </motion.div>
  );
});

/* ---------- Sección "Recomendados" con selector Películas/Series ---------- */
const RecommendedSection = memo(function RecommendedSection({
  movieItems,
  tvItems,
  isMobile,
  hydrated,
  posterCacheRef,
  posterOverrides,
  backdropOverrides,
  overridesReady,
}) {
  const [activeTab, setActiveTab] = useState("movies");
  const hasMovieItems = Array.isArray(movieItems) && movieItems.length > 0;
  const hasTvItems = Array.isArray(tvItems) && tvItems.length > 0;

  const loading = movieItems === null && tvItems === null;
  const empty = !loading && !hasMovieItems && !hasTvItems;

  useEffect(() => {
    if (activeTab === "movies" && !hasMovieItems && hasTvItems) {
      setActiveTab("series");
      return;
    }
    if (activeTab === "series" && !hasTvItems && hasMovieItems) {
      setActiveTab("movies");
    }
  }, [activeTab, hasMovieItems, hasTvItems]);

  const items =
    activeTab === "movies"
      ? hasMovieItems
        ? movieItems
        : (tvItems ?? [])
      : hasTvItems
        ? tvItems
        : (movieItems ?? []);

  if (empty) return null;

  const SKELETON_COUNT = isMobile ? 3 : 6;
  const skeletonWidth = isMobile
    ? "calc((100% - 24px) / 3)"
    : "calc(16.666% - 10px)";

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      variants={fadeInUp}
      viewport={{ once: true, margin: "-50px" }}
    >
      <div className="flex items-center justify-between mb-5 px-1 sm:px-0">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-px w-8 bg-amber-500" />
            <span className="text-amber-400 font-bold uppercase tracking-widest text-[10px]">
              TRAKT
            </span>
          </div>
          <ExpandableSectionTitle
            title="Recomendados"
            href={EXPANDABLE_SECTION_HREFS["Recomendados"]}
          />
        </div>

        {!loading && (
          <div className={dashboardSegmentGroupClass}>
            {hasMovieItems && (
              <button
                onClick={() => setActiveTab("movies")}
                className={dashboardSegmentButtonClass(activeTab === "movies")}
              >
                Películas
              </button>
            )}
            {hasTvItems && (
              <button
                onClick={() => setActiveTab("series")}
                className={dashboardSegmentButtonClass(activeTab === "series")}
              >
                Series
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 rounded-xl bg-neutral-900 animate-pulse"
              style={{
                width: skeletonWidth,
                aspectRatio: "2/3",
              }}
            />
          ))}
        </div>
      ) : (
        <Row
          title=""
          hideTitle={true}
          items={items}
          isMobile={isMobile}
          hydrated={hydrated}
          posterCacheRef={posterCacheRef}
          posterOverrides={posterOverrides}
          backdropOverrides={backdropOverrides}
          overridesReady={overridesReady}
          eager={true}
        />
      )}
    </motion.div>
  );
});

/* ---------- Carrusel hero (backdrops) ---------- */
function TopRatedHero({
  movieItems,
  tvItems,
  isMobile,
  hydrated,
  backdropOverrides,
}) {
  const [activeTab, setActiveTab] = useState("movies");
  const { openDetailModal } = useDetailModal();
  const items = activeTab === "movies" ? movieItems : tvItems;

  if (
    (!movieItems || movieItems.length === 0) &&
    (!tvItems || tvItems.length === 0)
  )
    return null;

  const swiperRef = useRef(null);
  const heroRef = useRef(null);
  const [isHoveredHero, setIsHoveredHero] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  // "Mejor valoradas" es la sección que va justo tras el hero: debe permanecer
  // oculta al cargar (aunque asome) y revelarse con animación al hacer scroll.
  const revealProps = useTopResetRevealProps(heroRef);

  const [heroBackdrops, setHeroBackdrops] = useState(null);
  const [heroExtraBackdrops, setHeroExtraBackdrops] = useState(null);

  // Cargar backdrops para AMBAS listas para evitar flash al cambiar de tab
  const allItems = useMemo(() => {
    const combined = [...(movieItems || []), ...(tvItems || [])];
    const seen = new Set();
    return combined.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [movieItems, tvItems]);

  useEffect(() => {
    if (!allItems || allItems.length === 0) return;

    let canceled = false;

    const load = async () => {
      try {
        const entries = await Promise.all(
          allItems.map(async (movie) => {
            const id = movie?.id;
            if (!id) return [null, null, null];

            // Siempre buscar el mejor backdrop EN (nunca usar backdrop_path directamente)
            const mediaType =
              movie.media_type === "tv" ||
              (movie.name && !movie.title) ||
              movie.first_air_date
                ? "tv"
                : "movie";

            const override = backdropOverrides?.[id] || null;
            const { backdrop: userBackdrop } = getArtworkPreference(id);
            let chosen = override || userBackdrop || null;
            if (!chosen) chosen = await fetchBestBackdrop(id, mediaType);
            if (!chosen)
              chosen = movie?.backdrop_path || movie?.poster_path || null;

            let extra = await fetchBestBackdrop(id, mediaType, { offset: 1 });
            if (extra === chosen) extra = null;

            if (chosen) await preloadImage(buildImg(chosen, "w780"));
            if (extra) await preloadImage(buildImg(extra, "w780"));
            return [id, chosen, extra];
          }),
        );

        if (canceled) return;

        const map = {};
        const extraMap = {};
        for (const [id, path, extraPath] of entries) {
          if (!id) continue;
          map[id] = path;
          if (extraPath) extraMap[id] = extraPath;
        }

        setHeroBackdrops(map);
        setHeroExtraBackdrops(extraMap);
      } catch (err) {
        if (canceled) return;
        console.error("Error cargando backdrops del hero", err);

        const map = {};
        for (const movie of allItems) {
          map[movie.id] = movie.backdrop_path || movie.poster_path || null;
        }
        setHeroBackdrops(map);
        setHeroExtraBackdrops({});
      }
    };

    load();

    return () => {
      canceled = true;
    };
  }, [allItems, backdropOverrides]);

  const updateNav = (swiper) => {
    if (!swiper) return;
    const hasOverflow = !swiper.isLocked;
    setCanPrev(hasOverflow && !swiper.isBeginning);
    setCanNext(hasOverflow && !swiper.isEnd);
  };

  const handleSwiper = (swiper) => {
    swiperRef.current = swiper;
    updateNav(swiper);
  };

  const handlePrevClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const swiper = swiperRef.current;
    if (!swiper) return;
    // Para el hero, avanzar 1 slide (ya que son imágenes grandes)
    swiper.slidePrev();
  };

  const handleNextClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const swiper = swiperRef.current;
    if (!swiper) return;
    // Para el hero, avanzar 1 slide (ya que son imágenes grandes)
    swiper.slideNext();
  };

  const showPrev = isHoveredHero && canPrev;
  const showNext = isHoveredHero && canNext;

  // Sin `hydrated` en la key (remontaría el Swiper al hidratar y bloquearía el
  // primer desliz). Solo cambia con el tab y el layout.
  const heroKey = `hero-${activeTab}-${isMobile ? "m" : "d"}`;

  return (
    <motion.div
      ref={heroRef}
      {...revealProps}
      variants={fadeInUp}
      className="relative group mb-10 sm:mb-14"
    >
      {/* Título de la sección con selector Películas / Series */}
      <motion.div variants={scaleIn} className="mb-5 px-1 sm:px-0">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-px w-8 bg-amber-500" />
          <span className="text-amber-400 font-bold uppercase tracking-widest text-[10px]">
            DESTACADAS
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent">
            Mejor valoradas<span className="text-amber-500">.</span>
          </h3>

          <div className={dashboardSegmentGroupClass}>
            {movieItems?.length > 0 && (
              <button
                onClick={() => setActiveTab("movies")}
                className={dashboardSegmentButtonClass(activeTab === "movies")}
              >
                Películas
              </button>
            )}
            {tvItems?.length > 0 && (
              <button
                onClick={() => setActiveTab("series")}
                className={dashboardSegmentButtonClass(activeTab === "series")}
              >
                Series
              </button>
            )}
          </div>
        </div>
      </motion.div>

      <div
        className="relative"
        onMouseEnter={() => setIsHoveredHero(true)}
        onMouseLeave={() => setIsHoveredHero(false)}
      >
        <>
          <div>
            <Swiper
              key={heroKey}
              slidesPerView={isMobile ? 1 : 3}
              spaceBetween={isMobile ? 12 : 16}
              autoplay={hydrated ? { delay: 5000 } : false}
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
              modules={[Navigation, Autoplay, FreeMode]}
              className="group relative"
              breakpoints={{
                0: { slidesPerView: 1, spaceBetween: 12 },
                1024: { slidesPerView: isMobile ? 1 : 3, spaceBetween: 16 },
              }}
            >
              {items.map((movie, index) => {
                const heroBackdrop =
                  heroBackdrops !== null
                    ? (heroBackdrops[movie.id] ?? null)
                    : null; // null mientras carga → muestra placeholder neutral
                const heroExtraBackdrop =
                  heroExtraBackdrops !== null
                    ? (heroExtraBackdrops[movie.id] ?? null)
                    : null;
                const slideClass = isMobile
                  ? "!w-full select-none"
                  : "select-none";

                const mediaType =
                  movie.media_type === "tv" ||
                  (movie.name && !movie.title) ||
                  movie.first_air_date
                    ? "tv"
                    : "movie";

                  if (!heroBackdrop) {
                    return (
                      <SwiperSlide key={`${mediaType}:${movie.id}:${index}`} className={slideClass}>
                        <button
                          type="button"
                          className="block w-full cursor-pointer text-left"
                          onClick={() => openDetailModal?.(movie)}
                          aria-label={`Abrir vista previa de ${movie.title || movie.name || "este título"}`}
                        >
                          <div className="relative rounded-xl bg-neutral-900 aspect-[16/9]" />
                        </button>
                      </SwiperSlide>
                    );
                  }
  
                  return (
                    <SwiperSlide key={`${mediaType}:${movie.id}:${index}`} className={slideClass}>
                      <button
                        type="button"
                        className="block w-full cursor-pointer text-left"
                        onClick={() => openDetailModal?.(movie)}
                        aria-label={`Abrir vista previa de ${movie.title || movie.name || "este título"}`}
                      >
                        <motion.div className="relative cursor-pointer overflow-hidden rounded-xl aspect-[16/9] bg-neutral-900 group/hero">
                        <NextImage
                          src={buildImg(heroBackdrop, "w780")}
                          alt=""
                          aria-hidden="true"
                          fill
                          sizes="(min-width:1536px) 1100px, (min-width:1280px) 900px, (min-width:1024px) 800px, 95vw"
                          className="object-cover blur-2xl opacity-35 scale-110"
                          // Carga ansiosa en las primeras diapositivas (above the
                          // fold): en móvil el principal va en object-contain y
                          // este fondo difuminado puede ser el LCP, así que no
                          // debe quedar en lazy.
                          loading={index < (isMobile ? 1 : 3) ? "eager" : "lazy"}
                        />
                        <NextImage
                          src={buildImg(heroBackdrop, "w1280")}
                          sizes="(min-width:1536px) 1100px, (min-width:1280px) 900px, (min-width:1024px) 800px, 95vw"
                          alt={movie.title || movie.name}
                          fill
                          className={`rounded-xl ${
                            isMobile ? "object-contain" : "object-cover"
                          } transition-[opacity,transform] duration-700 ease-out group-hover/hero:scale-105 ${
                            heroExtraBackdrop
                              ? "group-hover/hero:opacity-0"
                              : ""
                          } motion-reduce:transition-none`}
                          {...(index === 0
                            ? { priority: true, fetchPriority: "high" }
                            : {
                                loading:
                                  index < (isMobile ? 1 : 3) ? "eager" : "lazy",
                              })}
                        />
                        {heroExtraBackdrop && (
                          <NextImage
                            src={buildImg(heroExtraBackdrop, "w1280")}
                            sizes="(min-width:1536px) 1100px, (min-width:1280px) 900px, (min-width:1024px) 800px, 95vw"
                            alt=""
                            aria-hidden="true"
                            fill
                            className={`rounded-xl ${
                              isMobile ? "object-contain" : "object-cover"
                            } opacity-0 transition-[opacity,transform] duration-700 ease-out group-hover/hero:scale-105 group-hover/hero:opacity-100 motion-reduce:transition-none`}
                            loading={
                              index < (isMobile ? 1 : 3) ? "eager" : "lazy"
                            }
                          />
                        )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover/hero:opacity-100 transition-opacity duration-300" />
                        </motion.div>
                      </button>
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
                onClick={handlePrevClick}
                className="absolute inset-y-0 -left-6 w-32 z-20
                                hidden sm:flex items-center justify-start
                                bg-gradient-to-r from-black/70 via-black/40 via-30% via-black/20 via-60% to-transparent
                                hover:from-black/85 hover:via-black/55 hover:via-30% hover:via-black/30 hover:via-60%
                                transition-all duration-500 pointer-events-auto group/nav backdrop-blur-[2px]"
              >
                <motion.span
                  className="ml-11 text-5xl font-bold text-white drop-shadow-[0_0_20px_rgba(0,0,0,0.8)] group-hover/nav:scale-110 transition-transform"
                  whileHover={{ x: -5 }}
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
                onClick={handleNextClick}
                className="absolute inset-y-0 -right-6 w-32 z-20
                                hidden sm:flex items-center justify-end
                                bg-gradient-to-l from-black/70 via-black/40 via-30% via-black/20 via-60% to-transparent
                                hover:from-black/85 hover:via-black/55 hover:via-30% hover:via-black/30 hover:via-60%
                                transition-all duration-500 pointer-events-auto group/nav backdrop-blur-[2px]"
              >
                <motion.span
                  className="mr-11 text-5xl font-bold text-white drop-shadow-[0_0_20px_rgba(0,0,0,0.8)] group-hover/nav:scale-110 transition-transform"
                  whileHover={{ x: 5 }}
                >
                  ›
                </motion.span>
              </motion.button>
            )}
          </AnimatePresence>
        </>
      </div>
    </motion.div>
  );
}

/* =================== MainDashboard (CLIENTE) =================== */
export default function MainDashboardClient({ initialData, initialEngineRows = EMPTY_ARRAY }) {
  const isMobile = useIsMobileLayout(768);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const posterCacheRef = useRef(new Map());
  const seededMoviesAnticipated = Array.isArray(
    initialData?.traktMoviesAnticipated,
  )
    ? initialData.traktMoviesAnticipated
    : null;
  const seededShowsAnticipated = Array.isArray(
    initialData?.traktShowsAnticipated,
  )
    ? initialData.traktShowsAnticipated
    : null;
  const hasRenderableInitialAnticipatedData =
    (seededMoviesAnticipated?.length || 0) > 0 ||
    (seededShowsAnticipated?.length || 0) > 0;
  const seededRecommended = Array.isArray(initialData?.traktRecommended)
    ? initialData.traktRecommended
    : null;
  const splitSeededRecommended = splitItemsByMediaType(seededRecommended);
  const seededRecommendedMovies = Array.isArray(
    initialData?.traktRecommendedMovies,
  )
    ? initialData.traktRecommendedMovies
    : seededRecommended
      ? splitSeededRecommended.movies
      : null;
  const seededRecommendedShows = Array.isArray(
    initialData?.traktRecommendedShows,
  )
    ? initialData.traktRecommendedShows
    : seededRecommended
      ? splitSeededRecommended.shows
      : null;

  // ⚡ Estado para secciones lazy (se cargan progresivamente en el cliente)
  const [lazySections, setLazySections] = useState({
    // Secciones Trakt (todas lazy — no bloquean SSR)
    traktTrending: [],
    traktPopular: [],
    // null = aún cargando (muestra skeleton); [] = cargado pero vacío (oculta sección)
    traktMoviesAnticipated: hasRenderableInitialAnticipatedData
      ? (seededMoviesAnticipated ?? [])
      : null,
    traktShowsAnticipated: hasRenderableInitialAnticipatedData
      ? (seededShowsAnticipated ?? [])
      : null,
    traktRecommended: seededRecommended,
    traktRecommendedMovies: seededRecommendedMovies,
    traktRecommendedShows: seededRecommendedShows,
    traktPlayedWeekly: [],
    traktPlayedMonthly: [],
    traktWatchedWeekly: [],
    traktWatchedMonthly: [],
    traktCollectedWeekly: [],
    traktCollectedMonthly: [],
  });

  // Combinar datos iniciales (SSR) con secciones lazy (cliente)
  const dashboardData = useMemo(
    () => ({
      ...(initialData || {}),
      ...lazySections,
    }),
    [initialData, lazySections],
  );

  // Filas de la engine de dashboards (recomendaciones personalizadas + genérico
  // rotativo, ya deduplicado por el backend; sin Trakt). Sustituyen a las filas
  // genéricas repetitivas anteriores.
  const { rows: engineRows } = useEngineRows("home", {
    initialRows: initialEngineRows,
  });
  const [visibleEngineRowCount, setVisibleEngineRowCount] = useState(
    INITIAL_VISIBLE_ENGINE_ROWS,
  );
  const renderableEngineRows = useMemo(
    () => engineRows.filter((row) => row.key !== "top_rated"),
    [engineRows],
  );

  useEffect(() => {
    if (visibleEngineRowCount >= renderableEngineRows.length) return undefined;

    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      setVisibleEngineRowCount((count) =>
        Math.min(
          renderableEngineRows.length,
          count + ENGINE_ROW_REVEAL_BATCH_SIZE,
        ),
      );
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [renderableEngineRows.length, visibleEngineRowCount]);

  const visibleEngineRows = renderableEngineRows.slice(
    0,
    visibleEngineRowCount,
  );

  // Conserva el diseño y comportamiento que tenía "Estrenos y novedades":
  // una única fila destacada ×1,6 con la preview normal del dashboard.
  const spotlightRowTitle = useMemo(() => {
    const titles = renderableEngineRows
      .filter((row) => Array.isArray(row.items) && row.items.length > 0)
      .map((row) => row.title);
    return titles.includes("Más esperadas") ? "Más esperadas" : null;
  }, [renderableEngineRows]);

  const allMovieIds = useMemo(() => {
    const keys = [
      "topRatedMovies",
      "topRatedTV",
      "popular",
      "trending",
      "awarded",
      "dramaTV",
      // Nuevas secciones Trakt
      "traktTrending",
      "traktPopular",
      "traktRecommended",
      "traktRecommendedMovies",
      "traktRecommendedShows",
      "traktAnticipated",
      "traktMoviesAnticipated",
      "traktShowsAnticipated",
      "traktPlayedWeekly",
      "traktPlayedMonthly",
      "traktWatchedWeekly",
      "traktWatchedMonthly",
      "traktCollectedWeekly",
      "traktCollectedMonthly",
    ];
    const set = new Set();
    for (const k of keys) {
      const arr = dashboardData?.[k] || [];
      for (const m of arr) if (m?.id) set.add(m.id);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [dashboardData]);

  const [posterOverrides, setPosterOverrides] = useState({});
  const [backdropOverrides, setBackdropOverrides] = useState({});
  const [overridesReady, setOverridesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadOverrides = async () => {
      if (!allMovieIds.length) {
        if (!cancelled) {
          setPosterOverrides({});
          setBackdropOverrides({});
          setOverridesReady(true);
        }
        return;
      }

      if (!cancelled) setOverridesReady(false);

      try {
        const [posters, backdrops] = await Promise.all([
          fetchArtworkOverrides({
            type: "movie",
            kind: "poster",
            ids: allMovieIds,
          }).catch(() => ({})),
          fetchArtworkOverrides({
            type: "movie",
            kind: "backdrop",
            ids: allMovieIds,
          }).catch(() => ({})),
        ]);

        if (cancelled) return;
        setPosterOverrides(posters || {});
        setBackdropOverrides(backdrops || {});
      } catch (err) {
        if (cancelled) return;
        console.error("Error cargando overrides (dashboard)", err);
        setPosterOverrides({});
        setBackdropOverrides({});
      } finally {
        if (!cancelled) setOverridesReady(true);
      }
    };

    const cancelIdle = runWhenBrowserIdle(loadOverrides);

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [allMovieIds]);


  // (Eliminado) Cargadores de Trakt: las filas ahora vienen de la engine.

  // Reduce en el hero los títulos ya vistos / en favoritos (criterio cliente).
  const featuredItems = usePersonalizedFeatured(
    dashboardData.featured || EMPTY_ARRAY,
  );

  if (!dashboardData || Object.keys(dashboardData).length === 0) {
    return <div className="h-screen bg-black" />;
  }

  return (
    <DetailModalProvider>
    <motion.div
      className="relative -mt-16 min-h-screen overflow-hidden bg-black text-white selection:bg-amber-500/30"
      initial="hidden"
      animate="visible"
      variants={fadeInUp}
    >
      <div className="relative z-10">
        <div
          className="relative isolate z-20 sm:-mb-12 sm:pb-12"
          style={{ contain: "layout paint" }}
        >
          <FeaturedHero
            items={featuredItems}
            isMobile={isMobile}
            deferInitialBackdrop
          />
        </div>

        <div className="px-4 pt-4 pb-6 sm:px-6 sm:pt-11 sm:pb-8">
          <TopRatedHero
            movieItems={dashboardData.topRatedMovies || EMPTY_ARRAY}
            tvItems={dashboardData.topRatedTV || EMPTY_ARRAY}
            isMobile={isMobile}
            hydrated={hydrated}
            backdropOverrides={backdropOverrides}
          />

          <motion.div
            className="space-y-14 sm:space-y-16 mt-10 sm:mt-14"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
          {/* Continuar viendo (backend/BBDD propios: historial + próximo episodio) */}
          <ContinueWatchingSection isMobile={isMobile} hydrated={hydrated} />

          {/* Filas de la engine: recomendaciones personalizadas + contenido
              genérico rotativo, deduplicado por el backend (sin Trakt). Se usa el
              componente Row (con vista previa al hover y flechas de desplazamiento).
              Se omite "Mejor valoradas" porque ya se muestra arriba en TopRatedHero.
              El bloque "Calendario" + "Más esperadas" se saca de su posición natural
              y se coloca ARRIBA, justo tras la 1ª fila ("Recomendaciones de hoy para
              ti"), para dar prioridad a los próximos episodios y estrenos. */}
          {(() => {
            // Fila destacada "Más esperadas" (key `anticipated`) buscada en TODAS las
            // filas (no solo las reveladas) para poder mostrarla siempre en el bloque.
            const anticipatedRow = renderableEngineRows.find(
              (row) =>
                row.key === "anticipated" &&
                Array.isArray(row.items) &&
                row.items.length > 0,
            );

            // Bloque Calendario + Más esperadas que se inserta arriba.
            const calendarBlock = [
              <DashboardCalendarSection
                key="__calendar__"
                isMobile={isMobile}
                hydrated={hydrated}
              />,
            ];
            if (anticipatedRow) {
              calendarBlock.push(
                <Row
                  key={anticipatedRow.key}
                  title={anticipatedRow.title}
                  items={anticipatedRow.items}
                  isMobile={isMobile}
                  hydrated={hydrated}
                  posterCacheRef={posterCacheRef}
                  posterOverrides={posterOverrides}
                  backdropOverrides={backdropOverrides}
                  overridesReady={overridesReady}
                  spotlight={
                    !!spotlightRowTitle &&
                    anticipatedRow.title === spotlightRowTitle
                  }
                />,
              );
            }

            const nodes = [];
            let blockInserted = false;
            // Alternancia backdrop/poster de las filas genéricas: la 1ª
            // (Recomendaciones, idx 0) sigue en poster; de la 2ª en adelante
            // alternan empezando por backdrop (idx 1). Continúa el patrón
            // CW(backdrop)·Recom(poster)·Calendario(backdrop)·Más esperadas(poster)·…
            // Las filas "spotlight" (Estrenos) conservan su preview grande en poster.
            let genericIndex = -1;
            for (const row of visibleEngineRows) {
              // "Más esperadas" se pinta en el bloque superior, no en su sitio.
              if (row.key === "anticipated") continue;
              genericIndex += 1;
              const isSpotlight =
                !!spotlightRowTitle && row.title === spotlightRowTitle;
              const useBackdrop = genericIndex % 2 === 1 && !isSpotlight;
              nodes.push(
                useBackdrop ? (
                  <DashboardBackdropRow
                    key={row.key}
                    title={row.title}
                    href={EXPANDABLE_SECTION_HREFS[row.title]}
                    items={row.items}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    backdropOverrides={backdropOverrides}
                  />
                ) : (
                  <Row
                    key={row.key}
                    title={row.title}
                    items={row.items}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                    spotlight={isSpotlight}
                  />
                ),
              );
              // Justo tras la 1ª fila (Recomendaciones de hoy para ti) va el bloque.
              if (!blockInserted) {
                nodes.push(...calendarBlock);
                blockInserted = true;
              }
            }
            // Sin filas todavía: el bloque abre la lista.
            if (!blockInserted) nodes.unshift(...calendarBlock);
            return nodes;
          })()}
          </motion.div>
        </div>
      </div>
    </motion.div>
    </DetailModalProvider>
  );
}
