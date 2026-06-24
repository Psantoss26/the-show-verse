// /src/components/MainDashboardClient.jsx
"use client";

import { useRef, useEffect, useState, useMemo, useCallback, memo } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Autoplay, FreeMode } from "swiper/modules";
import { AnimatePresence, motion, useInView } from "framer-motion";
import "swiper/swiper-bundle.css";
import Link from "next/link";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import {
  Heart,
  HeartOff,
  BookmarkPlus,
  BookmarkMinus,
  Play,
  X,
  FilmIcon,
  TvIcon,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

import {
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getMovieDetails,
  getExternalIds,
} from "@/lib/api/tmdb";

import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import { fetchArtworkOverrides } from "@/lib/artworkApi";
import { formatDashboardAwards } from "@/lib/details/awardsText";
import LiquidButton from "@/components/LiquidButton";
import FeaturedHero from "@/components/FeaturedHero";
import ContinueWatchingSection from "@/components/ContinueWatchingSection";

import {
  yearOf,
  ratingOf,
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
  fetchBestPoster,
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

const dashboardPreviewCardClass = (heightClass) =>
  [
    "relative isolate grid grid-rows-[76%_24%] overflow-hidden rounded-lg text-white cursor-pointer transform-gpu",
    "bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-[50px]",
    "shadow-[0_15px_40px_-10px_rgba(0,0,0,0.8)]",
    "transition-all duration-300",
    heightClass,
  ].join(" ");

const dashboardPreviewMediaClass =
  "relative h-full w-full overflow-hidden bg-transparent";

const dashboardPreviewInfoClass =
  "relative h-full w-full overflow-hidden bg-black/10 bg-gradient-to-br from-white/5 via-transparent to-black/20 backdrop-blur-[50px]";

const dashboardPreviewBackdropFadeStyle = {
  WebkitMaskImage:
    "radial-gradient(ellipse at center, black 76%, rgba(0,0,0,0.98) 90%, rgba(0,0,0,0.9) 100%)",
  maskImage:
    "radial-gradient(ellipse at center, black 76%, rgba(0,0,0,0.98) 90%, rgba(0,0,0,0.9) 100%)",
};

const EXPANDABLE_SECTION_HREFS = {
  Tendencias: "/dashboard/tendencias",
  Populares: "/dashboard/populares",
  Recomendados: "/dashboard/recomendados",
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
      className={`group/title inline-flex w-fit items-center text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent transition hover:from-amber-100 hover:via-white hover:to-amber-200 ${className}`}
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

      // Si todavía NO sabemos si hay override (porque aún no cargó el fetch batch),
      // pintamos con el poster base y dejamos que el override lo sustituya después.
      if (posterOverride === undefined) {
        const existingPoster =
          movie.poster_path ||
          movie.backdrop_path ||
          movie.profile_path ||
          null;
        if (!abort) {
          if (existingPoster) cache.current.set(posterCacheKey, existingPoster);
          setPosterPath(existingPoster);
          setReady(!!existingPoster);
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

      const existingPoster =
        movie.poster_path || movie.backdrop_path || movie.profile_path || null;
      if (existingPoster) {
        const url = buildImg(existingPoster, "w342");
        await preloadImage(url);
        if (!abort) {
          cache.current.set(posterCacheKey, existingPoster);
          setPosterPath(existingPoster);
          setReady(true);
        }
        return;
      }

      setReady(false);
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

/* ====================================================================
 * Vista previa inline tipo Amazon (backdrop horizontal) + TRAILER
 * ==================================================================== */
function InlinePreviewCard({ movie, heightClass, backdropOverride }) {
  const { session, account } = useAuth();
  const router = useRouter();

  const [extras, setExtras] = useState({
    runtime: null,
    awards: null,
    imdbRating: null,
  });
  const [backdropPath, setBackdropPath] = useState(null);
  const [backdropReady, setBackdropReady] = useState(false);

  const [loadingStates, setLoadingStates] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const trailerIframeRef = useRef(null);

  useEffect(() => {
    setShowTrailer(false);
    setTrailer(null);
    setTrailerLoading(false);
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
        const st = await getMediaAccountStates(type, movie.id, session);
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
  }, [movie, session, account]);

  useEffect(() => {
    let abort = false;
    if (!movie) return;

    const loadAll = async () => {
      const revealBackdrop = (path) => {
        if (abort) return;
        setBackdropPath(path);
        setBackdropReady(!!path);
      };

      const { backdrop: userBackdrop } = getArtworkPreference(movie.id);
      const mediaType = getMediaTypeForItem(movie);
      const backdropCacheKey = getBackdropCacheKey(movie, mediaType);
      if (userBackdrop) {
        movieBackdropCache.set(backdropCacheKey, userBackdrop);
        revealBackdrop(userBackdrop);
      } else if (backdropOverride) {
        movieBackdropCache.set(backdropCacheKey, backdropOverride);
        revealBackdrop(backdropOverride);
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

      const cachedExtras = movieExtrasCache.get(movie.id);
      if (cachedExtras) {
        if (!abort) setExtras(cachedExtras);
      } else {
        try {
          let runtime = null;
          try {
            if (mediaType === "movie") {
              const details = await getMovieDetails(movie.id);
              runtime = details?.runtime ?? null;
            } else {
              // Para series, obtener info de la API de TV
              const response = await fetch(
                `https://api.themoviedb.org/3/tv/${movie.id}?append_to_response=external_ids&api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
              );
              if (response.ok) {
                const details = await response.json();
                // Para series mostramos temporadas y episodios
                if (details.number_of_seasons) {
                  runtime = `${details.number_of_seasons} Temp.`;
                  if (details.number_of_episodes) {
                    runtime += ` / ${details.number_of_episodes} Eps.`;
                  }
                }
              }
            }
          } catch {}

          let awards = null;
          let imdbRating = null;
          try {
            let imdb = movie?.imdb_id;
            if (!imdb) {
              const ext = await getExternalIds(mediaType, movie.id);
              imdb = ext?.imdb_id || null;
            }
            if (imdb) {
              const [omdb, imdbDataset] = await Promise.all([
                fetchOmdbByImdb(imdb),
                fetchImdbRatingByImdb(imdb),
              ]);
              const rawAwards = omdb?.Awards;
              if (
                rawAwards &&
                typeof rawAwards === "string" &&
                rawAwards.trim()
              ) {
                awards = formatDashboardAwards(rawAwards);
              }
              if (typeof imdbDataset?.rating === "number") {
                imdbRating = imdbDataset.rating;
              }
            }
          } catch {}

          const next = { runtime, awards, imdbRating };
          movieExtrasCache.set(movie.id, next);
          if (!abort) setExtras(next);
        } catch {
          if (!abort)
            setExtras({ runtime: null, awards: null, imdbRating: null });
        }
      }
    };

    loadAll();
    return () => {
      abort = true;
    };
  }, [movie, backdropOverride]);

  const mediaType =
    movie.media_type === "tv" ||
    (movie.name && !movie.title) ||
    movie.first_air_date
      ? "tv"
      : "movie";
  const href = `/details/${mediaType}/${movie.id}`;

  const cardRef = useRef(null);
  const prefetchedRef = useRef(false);

  const prefetchHref = () => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    router.prefetch(href);
    if (typeof window !== "undefined") {
      // Calienta la caché de ruta completa (ISR) para que el push sea inmediato.
      fetch(href, { priority: "low" }).catch(() => {});
    }
  };

  // Prefetch al entrar en viewport (como hace <Link>), clave en móvil donde no
  // hay hover: al pulsar, el destino ya está precargado y la navegación es
  // instantánea sin estados de carga.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            prefetchHref();
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href]);

  const navigateToDetails = () => {
    router.push(href);
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
    e.stopPropagation();

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

  const bgSrc = backdropPath
    ? buildImg(backdropPath, PREVIEW_BACKDROP_SIZE)
    : null;

  const genres = (() => {
    const ids =
      movie.genre_ids ||
      (Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : []);
    const names = ids.map((id) => GENRES[id]).filter(Boolean);
    return names.slice(0, 2).join(" • ");
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
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      ref={cardRef}
      className={dashboardPreviewCardClass(heightClass)}
      onClick={navigateToDetails}
      onMouseEnter={prefetchHref}
      onFocus={prefetchHref}
      onTouchStart={prefetchHref}
    >
      <div className={dashboardPreviewMediaClass}>
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
            sizes="(min-width:1280px) 480px, (min-width:768px) 430px, 100vw"
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
                movieBackdropCache.set(getBackdropCacheKey(movie), fallback);
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

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24
                      bg-gradient-to-b from-transparent via-black/35 to-black/70"
        />
      </div>

      <div className={dashboardPreviewInfoClass}>
        <div className="h-full px-4 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3 text-[11px] sm:text-xs text-neutral-200">
              {yearOf(movie) && <span>{yearOf(movie)}</span>}
              {extras?.runtime && (
                <span>• {formatRuntime(extras.runtime)}</span>
              )}

              <span className="inline-flex items-center gap-1.5">
                <NextImage
                  src="/logo-TMDb.png"
                  alt="TMDb"
                  className="h-3 w-auto"
                  width={36}
                  height={12}
                  loading="lazy"
                />
                <span className="font-medium">{ratingOf(movie)}</span>
              </span>

              {typeof extras?.imdbRating === "number" && (
                <span className="inline-flex items-center gap-1.5">
                  <NextImage
                    src="/logo-IMDb.svg"
                    alt="IMDb"
                    className="h-4 w-auto"
                    width={34}
                    height={16}
                    loading="lazy"
                  />
                  <span className="font-medium">
                    {extras.imdbRating.toFixed(1)}
                  </span>
                </span>
              )}
            </div>

            {genres && (
              <div className="mt-1 text-[11px] sm:text-xs text-neutral-100/90 line-clamp-1">
                {genres}
              </div>
            )}

            {extras?.awards && (
              <div className="mt-1 text-[10px] sm:text-[11px] leading-tight text-emerald-300">
                {extras.awards}
              </div>
            )}

            {error && (
              <p className="mt-1 text-[11px] text-red-400 line-clamp-1">
                {error}
              </p>
            )}
          </div>

          <motion.div
            className="flex items-center gap-2 sm:gap-3 flex-shrink-0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <LiquidButton
              onClick={handleToggleTrailer}
              loading={trailerLoading}
              active
              activeColor="yellow"
              groupId="dashboard-preview-actions"
              title={showTrailer ? "Cerrar trailer" : "Ver trailer"}
              className="!h-9 !w-9 !bg-white !text-black sm:!h-10 sm:!w-10 [&_svg]:!h-5 [&_svg]:!w-5"
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
              groupId="dashboard-preview-actions"
              title={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              className="!h-9 !w-9 sm:!h-10 sm:!w-10 [&_svg]:!h-5 [&_svg]:!w-5"
            >
              <Heart className={favorite ? "fill-current" : ""} />
            </LiquidButton>

            <LiquidButton
              onClick={handleToggleWatchlist}
              loading={loadingStates || updating}
              active={watchlist}
              activeColor="blue"
              groupId="dashboard-preview-actions"
              title={watchlist ? "Quitar de pendientes" : "Añadir a pendientes"}
              className="!h-9 !w-9 sm:!h-10 sm:!w-10 [&_svg]:!h-5 [&_svg]:!w-5"
            >
              <BookmarkPlus className={watchlist ? "fill-current" : ""} />
            </LiquidButton>
          </motion.div>
        </div>
      </div>
    </motion.div>
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
  const router = useRouter();

  const [extras, setExtras] = useState({
    runtime: null,
    country: null,
  });
  const [backdropPath, setBackdropPath] = useState(null);
  const [backdropReady, setBackdropReady] = useState(false);

  const [loadingStates, setLoadingStates] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const trailerIframeRef = useRef(null);

  useEffect(() => {
    setShowTrailer(false);
    setTrailer(null);
    setTrailerLoading(false);
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
        const mediaType =
          movie.media_type === "tv" ||
          (movie.name && !movie.title) ||
          movie.first_air_date
            ? "tv"
            : "movie";
        const st = await getMediaAccountStates(mediaType, movie.id, session);
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
  }, [movie, session, account]);

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
      } else if (backdropOverride) {
        movieBackdropCache.set(backdropCacheKey, backdropOverride);
        revealBackdrop(backdropOverride);
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

      // Detectar tipo de media
      const mediaType =
        movie.media_type === "tv" ||
        (movie.name && !movie.title) ||
        movie.first_air_date
          ? "tv"
          : "movie";

      // Extras: runtime/temporadas + país
      try {
        let runtime = null;
        let country = null;

        if (mediaType === "movie") {
          const details = await getMovieDetails(movie.id).catch(() => null);
          runtime = details?.runtime ?? null;
          country = details?.production_countries?.[0]?.name || null;
        } else {
          // Para series
          const response = await fetch(
            `https://api.themoviedb.org/3/tv/${movie.id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
          );
          if (response.ok) {
            const details = await response.json();
            if (details.number_of_seasons) {
              runtime = `${details.number_of_seasons} Temp.`;
              if (details.number_of_episodes) {
                runtime += ` / ${details.number_of_episodes} Eps.`;
              }
            }
            country =
              details?.origin_country?.[0] ||
              details?.production_countries?.[0]?.name ||
              null;
          }
        }

        if (!abort) setExtras({ runtime, country });
      } catch {
        if (!abort) setExtras({ runtime: null, country: null });
      }
    };

    loadAll();
    return () => {
      abort = true;
    };
  }, [movie, backdropOverride]);

  const mediaType =
    movie.media_type === "tv" ||
    (movie.name && !movie.title) ||
    movie.first_air_date
      ? "tv"
      : "movie";
  const href = `/details/${mediaType}/${movie.id}`;

  const cardRef = useRef(null);
  const prefetchedRef = useRef(false);

  const prefetchHref = () => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    router.prefetch(href);
    if (typeof window !== "undefined") {
      // Calienta la caché de ruta completa (ISR) para que el push sea inmediato.
      fetch(href, { priority: "low" }).catch(() => {});
    }
  };

  // Prefetch al entrar en viewport (como hace <Link>), clave en móvil donde no
  // hay hover: al pulsar, el destino ya está precargado y la navegación es
  // instantánea sin estados de carga.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            prefetchHref();
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href]);

  const navigateToDetails = () => {
    router.push(href);
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
    e.stopPropagation();
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

  const bgSrc = backdropPath
    ? buildImg(backdropPath, PREVIEW_BACKDROP_SIZE)
    : null;

  const genres = (() => {
    const ids =
      movie.genre_ids ||
      (Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : []);
    const names = ids.map((id) => GENRES[id]).filter(Boolean);
    return names.slice(0, 2).join(" • ");
  })();

  const release = movie?.release_date || null;
  const releaseText = release
    ? new Date(release).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : yearOf(movie) || "—";

  // Determinar la alineación horizontal de la tarjeta absoluta.
  // IMPORTANTE: el posicionamiento se hace con valores de framer-motion (x/y),
  // NO con clases -translate de Tailwind, porque framer sobrescribe el
  // `transform` al animar la escala y rompería el centrado.
  let alignmentClass = "left-1/2";
  let alignX = "-50%"; // centrado: desplaza media anchura propia
  let transformOrigin = "center center";

  if (alignment === "left") {
    alignmentClass = "left-0";
    alignX = "0%";
    transformOrigin = "left center";
  } else if (alignment === "right") {
    alignmentClass = "right-0";
    alignX = "0%";
    transformOrigin = "right center";
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, x: alignX, y: "-50%" }}
      animate={{ opacity: 1, scale: 1.18, x: alignX, y: "-50%" }}
      exit={{
        opacity: 0,
        scale: 0.92,
        x: alignX,
        y: "-50%",
        transition: { duration: 0.14, ease: "easeInOut" },
      }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 22,
        mass: 0.7,
      }}
      ref={cardRef}
      className={`absolute top-1/2 ${alignmentClass} w-[300px] sm:w-[350px] md:w-[410px] xl:w-[450px] rounded-xl text-white cursor-pointer bg-[#141414]/95 backdrop-blur-xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 z-50 hidden sm:flex flex-col overflow-hidden`}
      onClick={navigateToDetails}
      onMouseEnter={prefetchHref}
      onFocus={prefetchHref}
      style={{ willChange: "transform, opacity", transformOrigin }}
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
                  movieBackdropCache.set(getBackdropCacheKey(movie), fallback);
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
      </div>

      {/* Panel de info (debajo del backdrop) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.25, ease: "easeOut" }}
        className="w-full bg-[#141414]/95 backdrop-blur-md px-3.5 py-3 sm:px-4 sm:py-3.5 border-t border-white/5"
      >
        <div className="h-full flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* META NUEVA SOLO PARA MÁS ESPERADAS */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-neutral-200">
              <span className="font-semibold text-white">{releaseText}</span>
              {extras?.runtime && (
                <span className="text-neutral-300">• {formatRuntime(extras.runtime)}</span>
              )}
              {extras?.country && (
                <span className="text-neutral-300">• {extras.country}</span>
              )}
            </div>

            {genres && (
              <div className="mt-0.5 text-[11px] sm:text-xs text-neutral-100/90 line-clamp-1">
                {genres}
              </div>
            )}

            {error && (
              <p className="mt-0.5 text-[11px] text-red-400 line-clamp-1">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
            <LiquidButton
              onClick={handleToggleTrailer}
              loading={trailerLoading}
              active
              activeColor="yellow"
              groupId="dashboard-preview-actions"
              title={showTrailer ? "Cerrar trailer" : "Ver trailer"}
              className="!h-9 !w-9 !bg-white !text-black [&_svg]:!h-5 [&_svg]:!w-5"
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
              groupId="dashboard-preview-actions"
              title={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              className="!h-9 !w-9 [&_svg]:!h-5 [&_svg]:!w-5"
            >
              <Heart className={favorite ? "fill-current" : ""} />
            </LiquidButton>

            <LiquidButton
              onClick={handleToggleWatchlist}
              loading={loadingStates || updating}
              active={watchlist}
              activeColor="blue"
              groupId="dashboard-preview-actions"
              title={watchlist ? "Quitar de pendientes" : "Añadir a pendientes"}
              className="!h-9 !w-9 [&_svg]:!h-5 [&_svg]:!w-5"
            >
              <BookmarkPlus className={watchlist ? "fill-current" : ""} />
            </LiquidButton>
          </div>
        </div>
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
function Row({
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
}) {
  const normalizedItems = Array.isArray(items) ? items : EMPTY_ARRAY;
  const hasItems = normalizedItems.length > 0;

  // Detectar si es una fila de género específico
  const isGenreRow =
    ![
      "Recomendado",
      "Recomendados",
      "Tendencias",
      "Más esperadas",
      "Populares",
      "Taquillazos imprescindibles",
      "Premiadas y nominadas",
      "Historias de venganza",
      "Populares en EE.UU.",
      "Películas de culto",
      "Infravaloradas",
      "En ascenso",
    ].includes(title) &&
    !title.includes("década") &&
    !title.includes("Clásicos") &&
    !title.includes("Favoritas") &&
    !title.includes("Hits");

  // Determinar etiqueta específica según el título (si no viene como prop)
  if (!labelText) {
    if (title === "Más esperadas") {
      labelText = "ANTICIPADAS";
    } else if (title === "Populares") {
      labelText = "POPULARES";
    } else if (title === "Tendencias") {
      labelText = "TENDENCIAS";
    } else if (isGenreRow) {
      labelText = "GÉNERO";
    }
  }

  const swiperRef = useRef(null);
  const rowRef = useRef(null);
  const hoverIntentRef = useRef(0);
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [anticipatedAnimatingOutId, setAnticipatedAnimatingOutId] = useState(null);
  const [hoveredAlignment, setHoveredAlignment] = useState("center");
  const hoverTimeoutRef = useRef(null);

  // Limpiar temporizador al desmontar
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnterItem = (e, itemKey, index, m, backdropOverride) => {
    if (isMobile) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    if (rowRef.current && e.currentTarget) {
      const slideRect = e.currentTarget.getBoundingClientRect();
      const rowRect = rowRef.current.getBoundingClientRect();
      // El popover es ~2.3x el ancho del póster; centrado sobresale ~0.65x el
      // ancho de la tarjeta a cada lado. Detectamos si, centrado, se saldría de
      // los límites de la fila para alinearlo hacia dentro (funciona con
      // cualquier número de tarjetas por fila, no solo 6).
      const overflowHalf = slideRect.width * 1.2;
      const slideCenter = slideRect.left + slideRect.width / 2;
      const margin = 8;
      const wouldClipLeft = slideCenter - overflowHalf < rowRect.left + margin;
      const wouldClipRight = slideCenter + overflowHalf > rowRect.right - margin;
      setHoveredAlignment(
        wouldClipLeft ? "left" : wouldClipRight ? "right" : "center",
      );
    }

    if (previewKind === "anticipated") {
      // Iniciar precarga de imagen de fondo de inmediato
      preparePreviewBackdrop(m, backdropOverride);

      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredId(itemKey);
        setHoveredIndex(index);
      }, 250);
    } else {
      const hoverToken = hoverIntentRef.current + 1;
      hoverIntentRef.current = hoverToken;
      setHoveredIndex(index);
      preparePreviewBackdrop(m, backdropOverride).finally(() => {
        if (hoverIntentRef.current === hoverToken) {
          setHoveredId(itemKey);
        }
      });
    }
  };

  const handleMouseLeaveItem = (itemKey) => {
    if (isMobile) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
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
  };
  const isInView = eager
    ? true
    : useInView(rowRef, { once: true, margin: "-100px" });
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
  const heightClassDesktop = "h-[220px] sm:h-[260px] md:h-[300px] xl:h-[340px]";
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
    0: { slidesPerView: 3, spaceBetween: 12 },
    640: { slidesPerView: 4, spaceBetween: 14 },
    768: { slidesPerView: "auto", spaceBetween: 14 },
    1024: { slidesPerView: "auto", spaceBetween: 18 },
    1280: { slidesPerView: "auto", spaceBetween: 20 },
  };

  const swiperKey = `${title}-${hydrated ? "h" : "s"}-${isMobile ? "m" : "d"}`;

  return (
    <motion.div
      ref={rowRef}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeInUp}
      // En "Más esperadas" la vista previa se superpone fuera de la fila, así
      // que NO usamos `sv-deferred-row` (content-visibility recortaría el
      // overflow del popover por arriba/abajo). El resto de filas sí lo usan.
      className={`relative group ${previewKind === "anticipated" ? "" : "sv-deferred-row"}`}
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
            href={sectionHref || EXPANDABLE_SECTION_HREFS[title]}
          />
        </motion.div>
      )}

      <div
        className="relative"
        onMouseEnter={() => setIsHoveredRow(true)}
        onMouseLeave={() => {
          if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
          }
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
        <div className={!hydrated ? "pointer-events-none touch-none" : ""}>
          <Swiper
            key={swiperKey}
            slidesPerView={3}
            spaceBetween={12}
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
            className={`group relative ${previewKind === "anticipated" ? "!py-20 sm:!py-24 md:!py-28 !-my-20 sm:!-my-24 md:!-my-28" : ""}`}
            wrapperClass={previewKind === "anticipated" ? "flex items-center" : ""}
            breakpoints={breakpointsRow}
          >
            {normalizedItems.map((m, i) => {
              const itemType =
                m.media_type === "tv" ||
                (m.name && !m.title) ||
                m.first_air_date
                  ? "tv"
                  : "movie";
              const itemKey = `${itemType}:${m.id}`;
              const isActive = hydrated && !isMobile && hoveredId === itemKey;
              const isAnimatingOut = anticipatedAnimatingOutId === itemKey;
              const isLast = i === normalizedItems.length - 1;
              const isSecondToLast = i === normalizedItems.length - 2;
              const isThirdToLast = i === normalizedItems.length - 3;
              const isNearEnd = isLast || isSecondToLast || isThirdToLast;

              const base =
                "relative flex-shrink-0 transition-all duration-300 ease-in-out";

              const sizeClasses = isMobile
                ? "w-full"
                : (isActive && previewKind !== "anticipated")
                  ? "w-[320px] sm:w-[320px] md:w-[430px] xl:w-[480px] z-20"
                  : "w-[140px] sm:w-[140px] md:w-[190px] xl:w-[210px] z-10";

              const zOverflowClasses = (previewKind === "anticipated" && (isActive || isAnimatingOut))
                ? "z-[90] overflow-visible"
                : isActive
                  ? "overflow-visible"
                  : "overflow-hidden";

              // Determinar si el item activo está cerca del borde y calcular transformación
              let transformClass = "";
              if (!isMobile && hoveredIndex !== null && hoveredIndex >= 0 && previewKind !== "anticipated") {
                const activeIndex = hoveredIndex;
                const totalItems = normalizedItems.length;

                // Si el item activo está en los últimos 3 items, desplazar todo hacia la izquierda
                if (activeIndex >= totalItems - 3) {
                  if (i <= activeIndex) {
                    // Items antes o igual al activo se desplazan a la izquierda
                    if (activeIndex === totalItems - 1) {
                      transformClass =
                        "sm:-translate-x-[190px] md:-translate-x-[260px] xl:-translate-x-[290px]";
                    } else if (activeIndex === totalItems - 2) {
                      transformClass =
                        "sm:-translate-x-[130px] md:-translate-x-[180px] xl:-translate-x-[200px]";
                    } else if (activeIndex === totalItems - 3) {
                      transformClass =
                        "sm:-translate-x-[65px] md:-translate-x-[90px] xl:-translate-x-[100px]";
                    }
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

              return (
                <SwiperSlide
                  key={itemKey}
                  className={isMobile ? "select-none" : `!w-auto select-none ${previewKind === "anticipated" ? "!overflow-visible" : ""}`}
                >
                  <div
                    className={`${base} ${sizeClasses} ${posterBoxClass} ${transformClass} ${zOverflowClasses}`}
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
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{
                              opacity: 0,
                              scale: 0.95,
                              transition: { duration: 0.12 },
                            }}
                            transition={{
                              duration: 0.25,
                              ease: [0.4, 0, 0.2, 1],
                            }}
                            className="hidden sm:block w-full h-full"
                            style={{ willChange: "transform, opacity" }}
                          >
                            <InlinePreviewCard
                              movie={m}
                              heightClass={heightClassDesktop}
                              backdropOverride={backdropOverride}
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
                          <Link
                            href={`/details/${m.media_type === "tv" || (m.name && !m.title) || m.first_air_date ? "tv" : "movie"}/${m.id}`}
                            prefetch
                          >
                            <PosterImage
                              movie={m}
                              cache={posterCacheRef}
                              heightClass={posterBoxClass}
                              isMobile={isMobile}
                              posterOverride={posterOverride}
                            />
                          </Link>
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
              className="absolute inset-y-0 left-0 w-32 z-30
                  hidden sm:flex items-center justify-start
                  bg-gradient-to-r from-black/90 via-black/70 to-transparent
                  hover:from-black/95 hover:via-black/80
                  transition-all duration-300 pointer-events-auto group/nav"
            >
              <motion.span
                className="ml-6 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] group-hover/nav:scale-110 transition-transform"
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
              className="absolute inset-y-0 right-0 w-32 z-30
                  hidden sm:flex items-center justify-end
                  bg-gradient-to-l from-black/90 via-black/70 to-transparent
                  hover:from-black/95 hover:via-black/80
                  transition-all duration-300 pointer-events-auto group/nav"
            >
              <motion.span
                className="mr-6 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] group-hover/nav:scale-110 transition-transform"
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
  if (!items || items.length === 0) return null;

  // Detectar si es una fila de género específico
  const isGenreRow =
    ![
      "Recomendado",
      "Recomendados",
      "Tendencias",
      "Más esperadas",
      "Populares",
      "Taquillazos imprescindibles",
      "Premiadas y nominadas",
      "Historias de venganza",
      "Populares en EE.UU.",
      "Películas de culto",
      "Infravaloradas",
      "En ascenso",
    ].includes(title) &&
    !title.includes("década") &&
    !title.includes("Clásicos") &&
    !title.includes("Favoritas") &&
    !title.includes("Hits");

  // Determinar etiqueta específica según el título
  let labelText = null;
  if (title === "Más esperadas") {
    labelText = "ANTICIPADAS";
  } else if (title === "Populares") {
    labelText = "POPULARES";
  } else if (title === "Tendencias") {
    labelText = "TENDENCIAS";
  } else if (isGenreRow) {
    labelText = "GÉNERO";
  }

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
            const href = `/details/${type}/${m.id}`;
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
                  <Link href={href}>
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
                  </Link>
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
  const isInView = useInView(heroRef, { once: true, margin: "0px" });

  const [heroBackdrops, setHeroBackdrops] = useState(null);

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
            if (!id) return [null, null];

            const override = backdropOverrides?.[id] || null;
            if (override) {
              await preloadImage(buildImg(override, "w780"));
              return [id, override];
            }

            const { backdrop: userBackdrop } = getArtworkPreference(id);
            if (userBackdrop) {
              await preloadImage(buildImg(userBackdrop, "w780"));
              return [id, userBackdrop];
            }

            // Siempre buscar el mejor backdrop EN (nunca usar backdrop_path directamente)
            const mediaType =
              movie.media_type === "tv" ||
              (movie.name && !movie.title) ||
              movie.first_air_date
                ? "tv"
                : "movie";
            let chosen = await fetchBestBackdrop(id, mediaType);
            if (!chosen)
              chosen = movie?.backdrop_path || movie?.poster_path || null;
            if (chosen) await preloadImage(buildImg(chosen, "w780"));
            return [id, chosen];
          }),
        );

        if (canceled) return;

        const map = {};
        for (const [id, path] of entries) {
          if (!id) continue;
          map[id] = path;
        }

        setHeroBackdrops(map);
      } catch (err) {
        if (canceled) return;
        console.error("Error cargando backdrops del hero", err);

        const map = {};
        for (const movie of allItems) {
          map[movie.id] = movie.backdrop_path || movie.poster_path || null;
        }
        setHeroBackdrops(map);
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

  const heroKey = `hero-${activeTab}-${hydrated ? "h" : "s"}-${isMobile ? "m" : "d"}`;

  return (
    <motion.div
      ref={heroRef}
      initial="hidden"
      animate="visible"
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
          <div className={!hydrated ? "pointer-events-none touch-none" : ""}>
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
                    <SwiperSlide key={movie.id} className={slideClass}>
                      <Link href={`/details/${mediaType}/${movie.id}`} prefetch>
                        <div className="relative rounded-xl bg-neutral-900 aspect-[16/9]" />
                      </Link>
                    </SwiperSlide>
                  );
                }

                return (
                  <SwiperSlide key={movie.id} className={slideClass}>
                    <Link href={`/details/${mediaType}/${movie.id}`} prefetch>
                      <motion.div className="relative cursor-pointer overflow-hidden rounded-xl aspect-[16/9] bg-neutral-900 group/hero">
                        <NextImage
                          src={buildImg(heroBackdrop, "w780")}
                          alt=""
                          aria-hidden="true"
                          fill
                          sizes="(min-width:1536px) 1100px, (min-width:1280px) 900px, (min-width:1024px) 800px, 95vw"
                          className="object-cover blur-2xl opacity-35 scale-110"
                          loading="lazy"
                        />
                        <NextImage
                          src={buildImg(heroBackdrop, "w1280")}
                          sizes="(min-width:1536px) 1100px, (min-width:1280px) 900px, (min-width:1024px) 800px, 95vw"
                          alt={movie.title || movie.name}
                          fill
                          className={`rounded-xl ${
                            isMobile ? "object-contain" : "object-cover"
                          } transition-transform duration-700 ease-out group-hover/hero:scale-105`}
                          {...(index === 0
                            ? { priority: true, fetchPriority: "high" }
                            : {
                                loading:
                                  index < (isMobile ? 1 : 3) ? "eager" : "lazy",
                              })}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover/hero:opacity-100 transition-opacity duration-300" />
                      </motion.div>
                    </Link>
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
                className="absolute inset-y-0 left-0 w-32 z-20
                                hidden sm:flex items-center justify-start
                                bg-gradient-to-r from-black/70 via-black/40 via-30% via-black/20 via-60% to-transparent
                                hover:from-black/85 hover:via-black/55 hover:via-30% hover:via-black/30 hover:via-60%
                                transition-all duration-500 pointer-events-auto group/nav backdrop-blur-[2px]"
              >
                <motion.span
                  className="ml-5 text-5xl font-bold text-white drop-shadow-[0_0_20px_rgba(0,0,0,0.8)] group-hover/nav:scale-110 transition-transform"
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
                className="absolute inset-y-0 right-0 w-32 z-20
                                hidden sm:flex items-center justify-end
                                bg-gradient-to-l from-black/70 via-black/40 via-30% via-black/20 via-60% to-transparent
                                hover:from-black/85 hover:via-black/55 hover:via-30% hover:via-black/30 hover:via-60%
                                transition-all duration-500 pointer-events-auto group/nav backdrop-blur-[2px]"
              >
                <motion.span
                  className="mr-5 text-5xl font-bold text-white drop-shadow-[0_0_20px_rgba(0,0,0,0.8)] group-hover/nav:scale-110 transition-transform"
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
export default function MainDashboardClient({ initialData }) {
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

  // ⚡ Carga anticipada: «Más esperadas» visible sin scroll — carga inmediata al montar
  useEffect(() => {
    let cancelled = false;

    if (hasRenderableInitialAnticipatedData) {
      return () => {
        cancelled = true;
      };
    }

    const loadAnticipatedBucket = async ({ key, url }) => {
      const cached = readDashboardSectionCache(key);
      if (cached && !cancelled) {
        setLazySections((prev) => ({
          ...prev,
          [key]: cached,
        }));
      }

      try {
        const items = await fetchDashboardJson(url, {
          priority: "high",
          cache: "default",
          timeoutMs: 6500,
        }).catch(() => cached || []);
        if (cancelled) return;
        const fetchedItems = Array.isArray(items) ? items : [];
        const safeItems =
          fetchedItems.length === 0 && cached?.length ? cached : fetchedItems;
        writeDashboardSectionCache(key, safeItems);
        setLazySections((prev) => ({
          ...prev,
          [key]: safeItems,
        }));
      } catch (err) {
        console.error(`❌ Error cargando ${key}:`, err);
        if (!cancelled && !cached) {
          setLazySections((prev) => ({
            ...prev,
            [key]: [],
          }));
        }
      }
    };

    loadAnticipatedBucket({
      key: "traktMoviesAnticipated",
      url: "/api/trakt/dashboard/movies-anticipated?limit=18",
    });
    loadAnticipatedBucket({
      key: "traktShowsAnticipated",
      url: "/api/trakt/dashboard/shows-anticipated?limit=18",
    });

    return () => {
      cancelled = true;
    };
  }, [hasRenderableInitialAnticipatedData]);

  // ⚡ Carga independiente: Recomendados no espera al resto de secciones Trakt.
  useEffect(() => {
    let cancelled = false;
    let usedCachedRecommended = false;

    const loadRecommended = async () => {
      try {
        const cached = readRecommendedDashboardCache();
        if (cached && !cancelled) {
          usedCachedRecommended = true;
          setLazySections((prev) => ({
            ...prev,
            traktRecommended: cached.items,
            traktRecommendedMovies: cached.movies,
            traktRecommendedShows: cached.shows,
          }));
        }

        const recommended = await fetch(
          "/api/trakt/dashboard/recommended?limit=18",
          {
            cache: "default",
            priority: "high",
          },
        ).then((r) => {
          if (!r.ok) throw new Error(`Recommended HTTP ${r.status}`);
          return r.json();
        });
        const normalized = normalizeRecommendedPayload(recommended);

        if (cancelled) return;
        if (!normalized.movies.length && !normalized.shows.length && cached) {
          return;
        }
        writeRecommendedDashboardCache(recommended);
        setLazySections((prev) => ({
          ...prev,
          traktRecommended: normalized.items,
          traktRecommendedMovies: normalized.movies,
          traktRecommendedShows: normalized.shows,
        }));
      } catch (err) {
        console.error("❌ Error cargando recomendados:", err);
        if (!cancelled && !usedCachedRecommended) {
          setLazySections((prev) => ({
            ...prev,
            traktRecommended: [],
            traktRecommendedMovies: [],
            traktRecommendedShows: [],
          }));
        }
      }
    };

    loadRecommended();

    return () => {
      cancelled = true;
    };
  }, []);

  // ⚡ Carga diferida: resto de secciones Trakt (below-the-fold)
  useEffect(() => {
    let cancelled = false;
    const sectionRequests = [
      {
        key: "traktTrending",
        url: "/api/trakt/dashboard/trending?limit=18",
      },
      {
        key: "traktPopular",
        url: "/api/trakt/dashboard/popular?limit=18",
      },
      {
        key: "traktPlayedWeekly",
        url: "/api/trakt/dashboard/played?period=weekly&limit=18",
      },
      {
        key: "traktPlayedMonthly",
        url: "/api/trakt/dashboard/played?period=monthly&limit=18",
      },
      {
        key: "traktWatchedWeekly",
        url: "/api/trakt/dashboard/watched?period=weekly&limit=18",
      },
      {
        key: "traktWatchedMonthly",
        url: "/api/trakt/dashboard/watched?period=monthly&limit=18",
      },
      {
        key: "traktCollectedWeekly",
        url: "/api/trakt/dashboard/collected?period=weekly&limit=18",
      },
      {
        key: "traktCollectedMonthly",
        url: "/api/trakt/dashboard/collected?period=monthly&limit=18",
      },
    ];

    const loadSection = async ({ key, url }) => {
      if (cancelled) return;
      const cached = readDashboardSectionCache(key);
      if (cached && !cancelled) {
        setLazySections((prev) => ({
          ...prev,
          [key]: cached,
        }));
      }

      try {
        const items = await fetchDashboardJson(url, {
          priority: "low",
          cache: "default",
          timeoutMs: 9000,
        }).catch(() => cached || []);
        if (cancelled) return;
        const fetchedItems = Array.isArray(items) ? items : [];
        const safeItems =
          fetchedItems.length === 0 && cached?.length ? cached : fetchedItems;
        writeDashboardSectionCache(key, safeItems);
        setLazySections((prev) => ({
          ...prev,
          [key]: safeItems,
        }));
      } catch (err) {
        console.error(`❌ Error cargando ${key}:`, err);
        if (!cancelled && !cached) {
          setLazySections((prev) => ({
            ...prev,
            [key]: [],
          }));
        }
      }
    };

    const cancelIdle = runWhenBrowserIdle(loadLazySections, {
      timeout: 3000,
      delay: 1000,
    });
    function loadLazySections() {
      sectionRequests.forEach((request, index) => {
        window.setTimeout(() => {
          loadSection(request);
        }, index * 120);
      });
    }

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []); // Solo ejecutar una vez al montar

  if (!dashboardData || Object.keys(dashboardData).length === 0) {
    return <div className="h-screen bg-black" />;
  }

  return (
    <motion.div
      className="relative -mt-16 min-h-screen overflow-hidden bg-black text-white selection:bg-amber-500/30"
      initial="hidden"
      animate="visible"
      variants={fadeInUp}
    >
      <div className="relative z-10">
        <div className="relative isolate" style={{ contain: "layout paint" }}>
          <FeaturedHero
            items={dashboardData.featured || EMPTY_ARRAY}
            isMobile={isMobile}
          />
        </div>

        <div className="px-4 pt-4 pb-6 sm:px-6 sm:pt-12 sm:pb-8">
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

          {/* Trakt: Más esperadas con selector Películas/Series */}
          <AnticipatedSection
            movieItems={
              dashboardData.traktMoviesAnticipated === null
                ? null
                : (dashboardData.traktMoviesAnticipated ?? EMPTY_ARRAY)
            }
            tvItems={
              dashboardData.traktShowsAnticipated === null
                ? null
                : (dashboardData.traktShowsAnticipated ?? EMPTY_ARRAY)
            }
            isMobile={isMobile}
            hydrated={hydrated}
            posterCacheRef={posterCacheRef}
            posterOverrides={posterOverrides}
            backdropOverrides={backdropOverrides}
            overridesReady={overridesReady}
          />

          {/* Trakt: Recomendados con selector Películas/Series */}
          <RecommendedSection
            movieItems={
              dashboardData.traktRecommendedMovies === null
                ? null
                : (dashboardData.traktRecommendedMovies ?? EMPTY_ARRAY)
            }
            tvItems={
              dashboardData.traktRecommendedShows === null
                ? null
                : (dashboardData.traktRecommendedShows ?? EMPTY_ARRAY)
            }
            isMobile={isMobile}
            hydrated={hydrated}
            posterCacheRef={posterCacheRef}
            posterOverrides={posterOverrides}
            backdropOverrides={backdropOverrides}
            overridesReady={overridesReady}
          />

          {/* Tendencias unificadas (Trakt/TMDb) */}
          <RowWithSourceFilter
            title="Tendencias"
            traktData={dashboardData.traktTrending || EMPTY_ARRAY}
            tmdbData={dashboardData.trending || EMPTY_ARRAY}
            isMobile={isMobile}
            hydrated={hydrated}
            posterCacheRef={posterCacheRef}
            posterOverrides={posterOverrides}
            backdropOverrides={backdropOverrides}
            overridesReady={overridesReady}
          />

          {/* Populares unificados (Trakt/TMDb) */}
          <RowWithSourceFilter
            title="Populares"
            traktData={dashboardData.traktPopular || EMPTY_ARRAY}
            tmdbData={dashboardData.popular || EMPTY_ARRAY}
            isMobile={isMobile}
            hydrated={hydrated}
            posterCacheRef={posterCacheRef}
            posterOverrides={posterOverrides}
            backdropOverrides={backdropOverrides}
            overridesReady={overridesReady}
            eager={true}
          />

          <Row
            title="Premiadas y nominadas"
            labelText="GALARDONADAS"
            items={dashboardData.awarded}
            isMobile={isMobile}
            hydrated={hydrated}
            posterCacheRef={posterCacheRef}
            posterOverrides={posterOverrides}
            backdropOverrides={backdropOverrides}
            overridesReady={overridesReady}
          />

          <Row
            title="Dramas que enganchan"
            items={dashboardData.dramaTV}
            isMobile={isMobile}
            hydrated={hydrated}
            posterCacheRef={posterCacheRef}
            posterOverrides={posterOverrides}
            backdropOverrides={backdropOverrides}
            overridesReady={overridesReady}
          />

          {/* Trakt: Más reproducidas (con selector de período) */}
          <RowWithTimeFilter
            title="Más reproducidas"
            weeklyData={dashboardData.traktPlayedWeekly || EMPTY_ARRAY}
            monthlyData={dashboardData.traktPlayedMonthly || EMPTY_ARRAY}
            yearlyData={EMPTY_ARRAY}
            isMobile={isMobile}
            hydrated={hydrated}
            posterCacheRef={posterCacheRef}
            posterOverrides={posterOverrides}
            backdropOverrides={backdropOverrides}
            overridesReady={overridesReady}
          />

          {/* Trakt: Más vistas (con selector de período) */}
          <RowWithTimeFilter
            title="Más vistas"
            weeklyData={dashboardData.traktWatchedWeekly || EMPTY_ARRAY}
            monthlyData={dashboardData.traktWatchedMonthly || EMPTY_ARRAY}
            yearlyData={EMPTY_ARRAY}
            isMobile={isMobile}
            hydrated={hydrated}
            posterCacheRef={posterCacheRef}
            posterOverrides={posterOverrides}
            backdropOverrides={backdropOverrides}
            overridesReady={overridesReady}
          />

          {/* Trakt: Más coleccionadas (con selector de período) */}
          <RowWithTimeFilter
            title="Más coleccionadas"
            weeklyData={dashboardData.traktCollectedWeekly || EMPTY_ARRAY}
            monthlyData={dashboardData.traktCollectedMonthly || EMPTY_ARRAY}
            yearlyData={EMPTY_ARRAY}
            isMobile={isMobile}
            hydrated={hydrated}
            posterCacheRef={posterCacheRef}
            posterOverrides={posterOverrides}
            backdropOverrides={backdropOverrides}
            overridesReady={overridesReady}
          />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
