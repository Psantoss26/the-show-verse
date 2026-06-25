// /src/components/ContinueWatchingSection.jsx
"use client";

import { useRef, useEffect, useState, memo } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper/modules";
import { AnimatePresence, motion } from "framer-motion";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { Heart, BookmarkPlus } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { traktGetInProgress } from "@/lib/api/traktClient";
import {
  getVideos,
  markAsFavorite,
  markInWatchlist,
} from "@/lib/api/tmdb";
import { getBackendItemStatus } from "@/lib/api/itemStatus";
import {
  uniqBy,
  isPlayableVideo,
  rankVideo,
  videoEmbedUrl,
} from "@/lib/details/videos";
import LiquidButton from "@/components/LiquidButton";
import {
  buildImg,
  fetchBestBackdrop,
  getArtworkPreference,
  movieBackdropCache,
  getBackdropCacheKey,
  getPreviewBackdropFallback,
} from "@/lib/dashboard/media";

const EMPTY_ARRAY = [];
const MAX_ITEMS = 20;

// Caché local para que la sección NO desaparezca al recargar: se pinta al
// instante lo último conocido mientras se refresca en segundo plano.
const CONTINUE_WATCHING_CACHE_KEY = "showverse:dashboard:continue-watching:v1";
const CONTINUE_WATCHING_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
// Tras recargar, el token/cookies del backend pueden no estar listos y el
// endpoint devuelve vacío momentáneamente: reintentamos antes de ocultar.
const CONTINUE_WATCHING_RETRY_DELAYS = [800, 1600, 3000, 5000];

function readContinueWatchingCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONTINUE_WATCHING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    if (
      !savedAt ||
      Date.now() - savedAt > CONTINUE_WATCHING_CACHE_TTL_MS ||
      !Array.isArray(parsed?.shows) ||
      parsed.shows.length === 0
    ) {
      return null;
    }
    return parsed.shows;
  } catch {
    return null;
  }
}

function writeContinueWatchingCache(shows) {
  if (typeof window === "undefined") return;
  try {
    if (Array.isArray(shows) && shows.length > 0) {
      window.localStorage.setItem(
        CONTINUE_WATCHING_CACHE_KEY,
        JSON.stringify({ savedAt: Date.now(), shows }),
      );
    } else {
      window.localStorage.removeItem(CONTINUE_WATCHING_CACHE_KEY);
    }
  } catch {
    // ignorar (modo privado / cuota)
  }
}

function mapInProgressItems(items) {
  // Deduplicar por tmdbId: una misma serie puede tener varios episodios en curso,
  // pero solo mostramos una tarjeta por serie (y evitamos keys `tv:<id>` repetidas).
  // Se conserva la primera aparición (la fuente viene ordenada por más reciente).
  const seen = new Set();
  return (Array.isArray(items) ? items : EMPTY_ARRAY)
    .filter((it) => {
      if (!it?.tmdbId) return false;
      if (seen.has(it.tmdbId)) return false;
      seen.add(it.tmdbId);
      return true;
    })
    .slice(0, MAX_ITEMS)
    .map((it) => {
      const season = Number(it?.nextEpisode?.season);
      const number = Number(it?.nextEpisode?.number);
      const hasNextEpisode =
        Number.isFinite(season) &&
        season > 0 &&
        Number.isFinite(number) &&
        number > 0;

      return {
        id: it.tmdbId,
        title: it.title,
        backdrop_path: it.backdrop_path || null,
        poster_path: it.poster_path || null,
        overview: it.overview || null,
        genres: Array.isArray(it.genres) ? it.genres : EMPTY_ARRAY,
        pct: it.pct,
        completed: it.completed,
        aired: it.aired,
        nextEpisode: hasNextEpisode ? it.nextEpisode : null,
        lastEpisode: it.lastEpisode,
        lastWatchedAt: it.lastWatchedAt,
      };
    });
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

/* =================== STYLE CONSTANTS =================== */
// Tamaños base (backdrop horizontal ~16:9) y alto de fila compartido.
const ROW_HEIGHT = "h-[126px] sm:h-[146px] md:h-[168px] xl:h-[190px]";
const CONTINUE_WATCHING_BACKDROP_SIZE = "w1280";
const CONTINUE_WATCHING_IMAGE_QUALITY = 92;
const CONTINUE_WATCHING_TRAILER_LANGUAGES = ["es-ES", "en-US"];

let youtubeIframeApiPromise = null;
const previewTrailerVideosCache = new Map();

const cwPreviewCardClass =
  "relative isolate grid h-full w-full grid-rows-[72%_28%] overflow-hidden rounded-lg text-white cursor-pointer transform-gpu " +
  "bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-[50px] " +
  "shadow-[0_15px_40px_-10px_rgba(0,0,0,0.8)] transition-all duration-300";

const cwBackdropFadeStyle = {
  WebkitMaskImage:
    "radial-gradient(ellipse at center, black 76%, rgba(0,0,0,0.98) 90%, rgba(0,0,0,0.9) 100%)",
  maskImage:
    "radial-gradient(ellipse at center, black 76%, rgba(0,0,0,0.98) 90%, rgba(0,0,0,0.9) 100%)",
};

function normalizePreviewVideos(rawVideos) {
  const source = Array.isArray(rawVideos) ? rawVideos : EMPTY_ARRAY;
  const merged = uniqBy(source, (v) => `${v?.site}:${v?.key}`).filter(
    isPlayableVideo,
  );
  merged.sort((a, b) => rankVideo(a) - rankVideo(b));
  return merged;
}

function getVideoIdentity(video) {
  return video?.site && video?.key ? `${video.site}:${video.key}` : "";
}

async function fetchPreviewTrailerVideos(tvId) {
  if (!tvId) return EMPTY_ARRAY;
  const cacheKey = `tv:${tvId}`;
  const cached = previewTrailerVideosCache.get(cacheKey);
  if (cached) return cached;

  const request = Promise.all(
    CONTINUE_WATCHING_TRAILER_LANGUAGES.map((language) =>
      getVideos("tv", tvId, language).catch(() => ({ results: EMPTY_ARRAY })),
    ),
  ).then((responses) =>
    normalizePreviewVideos(
      responses.flatMap((data) =>
        Array.isArray(data?.results) ? data.results : EMPTY_ARRAY,
      ),
    ),
  ).then((videos) => {
    previewTrailerVideosCache.set(cacheKey, videos);
    return videos;
  });

  previewTrailerVideosCache.set(cacheKey, request);
  return request;
}

function prewarmPreviewTrailer(tvId) {
  if (!tvId || typeof window === "undefined") return;
  resolvePreviewTrailerVideos(tvId).catch(() => {});
  loadYouTubeIframeApi().catch(() => {});
}

function readCachedPreviewTrailerVideos(tvId) {
  if (!tvId) return null;
  const cached = previewTrailerVideosCache.get(`tv:${tvId}`);
  return Array.isArray(cached) ? cached : null;
}

async function resolvePreviewTrailerVideos(tvId) {
  const videos = await fetchPreviewTrailerVideos(tvId);
  previewTrailerVideosCache.set(`tv:${tvId}`, videos);
  return videos;
}

function pickNextPreviewTrailer(videos, currentVideo, skippedKeys) {
  if (!Array.isArray(videos) || !videos.length) return null;
  const currentKey = getVideoIdentity(currentVideo);
  const currentIndex = videos.findIndex(
    (candidate) => getVideoIdentity(candidate) === currentKey,
  );

  for (let i = 1; i <= videos.length; i += 1) {
    const candidate = videos[(Math.max(currentIndex, 0) + i) % videos.length];
    const candidateKey = getVideoIdentity(candidate);
    if (candidateKey && !skippedKeys.has(candidateKey)) {
      return candidate;
    }
  }
  return null;
}

function buildPreviewTrailerSrc(video) {
  const embedUrl = videoEmbedUrl(video, true);
  if (!embedUrl) return null;

  if (video.site === "YouTube") {
    const origin =
      typeof window !== "undefined"
        ? encodeURIComponent(window.location.origin)
        : "";
    return (
      `https://www.youtube.com/embed/${video.key}` +
      `?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` +
      `&controls=0&iv_load_policy=3&disablekb=1&fs=0` +
      `&start=5&enablejsapi=1&widget_referrer=${origin}&origin=${origin}`
    );
  }

  if (video.site === "Vimeo") {
    const separator = embedUrl.includes("?") ? "&" : "?";
    return `${embedUrl}${separator}muted=1&controls=0#t=5s`;
  }

  return embedUrl;
}

function loadYouTubeIframeApi() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (existingScript) return;

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });

  return youtubeIframeApiPromise;
}

/* =================== HELPERS =================== */
function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function nextEpisodeHref(show) {
  const ep = show?.nextEpisode;
  if (ep && Number.isFinite(ep.season) && Number.isFinite(ep.number)) {
    return `/details/tv/${show.id}/season/${ep.season}/episode/${ep.number}`;
  }
  return `/details/tv/${show.id}`;
}

function genresText(show) {
  const names = Array.isArray(show?.genres) ? show.genres : EMPTY_ARRAY;
  return names.slice(0, 2).join(" • ");
}

// Carga una variante del backdrop EN de la serie, separada del criterio normal
// del dashboard para que Continuar viendo no repita siempre la misma imagen.
function useShowBackdrop(show) {
  const [backdropPath, setBackdropPath] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;
    if (!show?.id) return;

    const reveal = (path) => {
      if (abort) return;
      setBackdropPath(path);
      setReady(!!path);
    };

    const load = async () => {
      const movie = {
        id: show.id,
        media_type: "tv",
        backdrop_path: show.backdrop_path,
        poster_path: show.poster_path,
      };
      const cacheKey = `${getBackdropCacheKey(movie, "tv")}:continue-next`;

      const { backdrop: userBackdrop } = getArtworkPreference(show.id);
      if (userBackdrop) {
        movieBackdropCache.set(cacheKey, userBackdrop);
        reveal(userBackdrop);
        return;
      }

      const cached = movieBackdropCache.get(cacheKey);
      if (cached !== undefined) {
        reveal(cached);
        return;
      }

      try {
        const preferred = await fetchBestBackdrop(show.id, "tv", {
          offset: 1,
          includeNoLanguage: false,
        });
        const chosen = preferred || getPreviewBackdropFallback(movie);
        movieBackdropCache.set(cacheKey, chosen);
        reveal(chosen);
      } catch {
        const fallback = getPreviewBackdropFallback(movie);
        movieBackdropCache.set(cacheKey, fallback);
        reveal(fallback);
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [show]);

  return { backdropPath, ready };
}

/* ====================================================================
 * Tarjeta base (sin hover): backdrop + overlay de progreso
 * ==================================================================== */
function ContinueWatchingBaseCard({ show }) {
  const { backdropPath, ready } = useShowBackdrop(show);
  const bgSrc = backdropPath
    ? buildImg(backdropPath, CONTINUE_WATCHING_BACKDROP_SIZE)
    : null;
  const pct = clampPct(show?.pct);
  const ep = show?.nextEpisode;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-neutral-900">
      {!ready && (
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
          alt={show?.title || ""}
          fill
          sizes="(min-width:1280px) 338px, (min-width:768px) 300px, 224px"
          quality={CONTINUE_WATCHING_IMAGE_QUALITY}
          className={`object-cover transition-opacity duration-200 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
          loading="lazy"
        />
      )}

      {/* Overlay inferior: progreso + próximo episodio */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2 pt-8">
        {ep && (
          <div className="mb-1 truncate text-[11px] font-semibold text-white drop-shadow">
            T{ep.season}:E{ep.number}
            <span className="ml-1 font-normal text-neutral-300">· Próximo</span>
          </div>
        )}
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ====================================================================
 * Tarjeta hover: backdrop ampliado (16:9) + panel de info
 * con botones Continuar / Favoritos / Pendientes
 * ==================================================================== */
function ContinueWatchingPreviewCard({
  show,
  index,
  totalCount,
  activeIndex,
  perView = 6,
  onPreviewMouseEnter,
  onPreviewMouseLeave,
}) {
  const { session, account } = useAuth();
  const router = useRouter();
  const { backdropPath, ready } = useShowBackdrop(show);

  const [loadingStates, setLoadingStates] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  // Resolvemos el trailer de forma SÍNCRONA desde la caché ya precalentada (la
  // fila precalienta los trailers visibles), de modo que el iframe esté presente
  // desde el primer render: el trailer se muestra al instante, sin esperas,
  // intentos ni parpadeos. Solo si no estuviera en caché se carga después.
  const initialTrailerVideos = readCachedPreviewTrailerVideos(show?.id) || EMPTY_ARRAY;
  const [trailer, setTrailer] = useState(initialTrailerVideos[0] || null);
  // El iframe se mantiene OCULTO (con el backdrop fijo debajo) hasta que el
  // vídeo realmente empieza a reproducirse. Así los intentos fallidos (trailers
  // no embebibles que obligan a probar el siguiente) ocurren de forma invisible:
  // no se ve ningún parpadeo, solo el backdrop estable, y el trailer aparece
  // cuando uno funciona.
  const [trailerVisible, setTrailerVisible] = useState(false);

  const href = nextEpisodeHref(show);
  const prefetchedRef = useRef(false);
  const trailerIframeRef = useRef(null);
  const trailerPlayerRef = useRef(null);
  const trailerRevealTimerRef = useRef(null);
  const trailerVideosRef = useRef(initialTrailerVideos);
  const skippedTrailerKeysRef = useRef(new Set());

  const prefetchHref = () => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    router.prefetch(href);
    if (typeof window !== "undefined") {
      fetch(href, { priority: "low" }).catch(() => {});
    }
  };

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!show?.id || !session || !account?.id) {
        setFavorite(false);
        setWatchlist(false);
        return;
      }
      try {
        setLoadingStates(true);
        const st = await getBackendItemStatus({ type: "tv", tmdbId: show.id });
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
  }, [show, session, account]);

  // Solo si el trailer NO estaba en caché lo resolvemos una vez (poco habitual:
  // la fila precalienta los visibles en idle). No reseteamos el trailer ya
  // mostrado para evitar parpadeos/remontajes del iframe.
  useEffect(() => {
    if (trailer || !show?.id) return;
    let cancel = false;
    (async () => {
      try {
        const videos = await resolvePreviewTrailerVideos(show.id);
        if (cancel) return;
        trailerVideosRef.current = videos;
        setTrailer(videos[0] || null);
      } catch {
        // Sin trailer: queda el backdrop como fondo.
      }
    })();
    return () => {
      cancel = true;
    };
  }, [show?.id, trailer]);

  useEffect(() => {
    if (!trailer?.key) return;

    // Cada vez que cambia el vídeo (incluido un reintento tras fallo) ocultamos
    // el iframe: solo se revelará cuando ESE vídeo empiece a reproducirse, de
    // modo que los reintentos no producen ningún parpadeo (queda el backdrop).
    setTrailerVisible(false);

    const clearReveal = () => {
      if (trailerRevealTimerRef.current) {
        window.clearTimeout(trailerRevealTimerRef.current);
        trailerRevealTimerRef.current = null;
      }
    };
    clearReveal();

    // Respaldo: si no llegara el evento de reproducción, revelamos pasado un
    // tiempo prudencial (el vídeo ya debería estar reproduciéndose).
    trailerRevealTimerRef.current = window.setTimeout(() => {
      setTrailerVisible(true);
      trailerRevealTimerRef.current = null;
    }, 1600);

    if (trailer.site !== "YouTube") {
      return () => clearReveal();
    }

    let cancelled = false;

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !YT?.Player || !trailerIframeRef.current) return;

      trailerPlayerRef.current = new YT.Player(trailerIframeRef.current, {
        events: {
          onReady: (event) => {
            if (cancelled) return;
            try {
              event.target.mute?.();
              event.target.playVideo?.();
            } catch {
              // La URL ya incluye autoplay, mute y start=5.
            }
          },
          onStateChange: (event) => {
            if (cancelled) return;
            // PLAYING (1): ya hay fotograma → revelar al instante.
            if (Number(event?.data) === 1) {
              clearReveal();
              setTrailerVisible(true);
            }
          },
          onError: () => {
            if (cancelled) return;
            // Salta al siguiente vídeo SIN revelar el actual (sigue oculto), así
            // el intento fallido no se ve. El efecto se relanza con el nuevo
            // vídeo y vuelve a esperar a su reproducción.
            clearReveal();
            setTrailer((currentTrailer) => {
              const currentKey = getVideoIdentity(currentTrailer);
              if (currentKey) skippedTrailerKeysRef.current.add(currentKey);
              return pickNextPreviewTrailer(
                trailerVideosRef.current,
                currentTrailer,
                skippedTrailerKeysRef.current,
              );
            });
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearReveal();
      try {
        trailerPlayerRef.current?.destroy?.();
      } catch {
        // El iframe puede haber sido desmontado por React.
      } finally {
        trailerPlayerRef.current = null;
      }
    };
  }, [trailer?.key, trailer?.site]);

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = `/login?next=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
      return true;
    }
    return false;
  };

  const handleContinue = (e) => {
    e.stopPropagation();
    router.push(href);
  };

  const handleToggleFavorite = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating || !show) return;
    try {
      setUpdating(true);
      setError("");
      const next = !favorite;
      setFavorite(next);
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type: "tv",
        mediaId: show.id,
        favorite: next,
        title: show.title,
        posterPath: show.poster_path || show.backdrop_path || null,
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
    if (requireLogin() || updating || !show) return;
    try {
      setUpdating(true);
      setError("");
      const next = !watchlist;
      setWatchlist(next);
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type: "tv",
        mediaId: show.id,
        watchlist: next,
        title: show.title,
        posterPath: show.poster_path || show.backdrop_path || null,
      });
    } catch {
      setWatchlist((v) => !v);
      setError("No se pudo actualizar pendientes.");
    } finally {
      setUpdating(false);
    }
  };

  const bgSrc = backdropPath
    ? buildImg(backdropPath, CONTINUE_WATCHING_BACKDROP_SIZE)
    : null;
  const trailerSrc = buildPreviewTrailerSrc(trailer);
  const pct = clampPct(show?.pct);
  const ep = show?.nextEpisode;
  const genres = genresText(show);

  const progressLabel = (() => {
    const parts = [];
    if (Number.isFinite(show?.completed) && Number.isFinite(show?.aired)) {
      parts.push(`${show.completed}/${show.aired} eps`);
    }
    if (pct) parts.push(`${pct}%`);
    return parts.join(" · ");
  })();

  // Determinar la alineación horizontal de la tarjeta absoluta
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
      ? 158
      : visibleCount === 4
        ? 154
        : visibleCount === 5
          ? 148
          : 144;
  const previewScale = visibleCount >= 6 ? 1.07 : 1.09;
  const previewMaxWidth =
    visibleCount >= 6 ? "min(144%, 470px)" : `${previewWidthPercent}%`;
  const previewImageSizes =
    visibleCount <= 3
      ? "(min-width:1280px) 560px, (min-width:768px) 500px, 420px"
      : visibleCount === 4
        ? "(min-width:1280px) 500px, (min-width:768px) 450px, 380px"
        : visibleCount === 5
          ? "(min-width:1536px) 480px, (min-width:1280px) 440px, 380px"
          : "(min-width:1536px) 470px, (min-width:1280px) 430px, 380px";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 0 }}
      animate={{ opacity: 1, scale: previewScale, y: -8 }}
      exit={{ opacity: 0, scale: 0.9, y: 0, transition: { duration: 0.15, ease: "easeInOut" } }}
      transition={{
        type: "spring",
        stiffness: 180,
        damping: 20,
        mass: 0.8
      }}
      // El ancho se calcula según las tarjetas visibles del breakpoint activo:
      // menos tarjetas permiten una preview mayor; con 6 se contiene mejor.
      className={`absolute top-1/2 -translate-y-1/2 ${alignmentClass} rounded-xl text-white cursor-pointer bg-[#141414]/95 backdrop-blur-xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 z-50 flex flex-col overflow-hidden`}
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
      {/* Backdrop de 16:9 */}
      <div className="relative w-full aspect-video overflow-hidden bg-neutral-900">
        {!ready && (
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
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: 1.08 }}
            transition={{ duration: 4, ease: "easeOut" }}
            className="absolute inset-0 w-full h-full"
          >
            <NextImage
              key={bgSrc}
              src={bgSrc}
              alt={show?.title || ""}
              fill
              sizes={previewImageSizes}
              quality={CONTINUE_WATCHING_IMAGE_QUALITY}
              className={`object-cover transition-opacity duration-200 ${
                ready ? "opacity-100" : "opacity-0"
              }`}
              style={cwBackdropFadeStyle}
              loading="eager"
              fetchPriority="low"
            />
          </motion.div>
        )}

        {trailerSrc && (
          <motion.div
            // Oculto hasta que el vídeo se reproduce de verdad: durante la carga
            // y los reintentos queda el backdrop estable (sin parpadeos) y el
            // trailer aparece con un fundido suave cuando empieza a reproducirse.
            initial={{ opacity: 0 }}
            animate={{ opacity: trailerVisible ? 1 : 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <iframe
              key={getVideoIdentity(trailer)}
              ref={trailerIframeRef}
              className="pointer-events-none absolute left-1/2 top-1/2 h-[178%] w-[138%] -translate-x-1/2 -translate-y-1/2"
              src={trailerSrc}
              title={`Trailer - ${show?.title || ""}`}
              width="1280"
              height="720"
              loading="eager"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen={false}
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => {
                // El iframe ya es visible (no se gatea por reproducción). Esto
                // es solo un respaldo de autoplay: la URL ya trae
                // autoplay=1&mute=1, pero reforzamos por postMessage por si el
                // navegador lo retrasara.
                try {
                  if (trailer.site !== "YouTube") return;
                  const win = trailerIframeRef.current?.contentWindow;
                  if (!win) return;
                  win.postMessage(
                    JSON.stringify({
                      event: "command",
                      func: "playVideo",
                      args: [],
                    }),
                    "https://www.youtube.com",
                  );
                } catch {
                  // ignorar
                }
              }}
            />
          </motion.div>
        )}

        {/* Barra de progreso verde superpuesta al pie del backdrop */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-black/85" />
        <div className="absolute inset-x-3 bottom-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Panel de info (debajo del backdrop) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.25, ease: "easeOut" }}
        className="w-full bg-[#141414]/95 backdrop-blur-md px-3.5 py-3 sm:px-4 sm:py-3.5 border-t border-white/5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-200 sm:text-xs">
              {ep && (
                <span className="font-semibold text-white">
                  T{ep.season} · E{ep.number}
                  {ep.title ? `: ${ep.title}` : ""}
                </span>
              )}
              {progressLabel && (
                <span className="text-neutral-300">• {progressLabel}</span>
              )}
            </div>

            {genres && (
              <div className="mt-0.5 line-clamp-1 text-[11px] text-neutral-100/90 sm:text-xs">
                {genres}
              </div>
            )}

            {error && (
              <p className="mt-0.5 line-clamp-1 text-[11px] text-red-400">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 sm:gap-2.5">
            <LiquidButton
              onClick={handleContinue}
              active
              activeColor="green"
              groupId="continue-watching-actions"
              title={`Continuar viendo · ${pct}% visto`}
              progressPercent={`${pct}%`}
              fillPercentage={pct}
              className="!h-9 !w-9 [&_div>span:first-child]:!text-base [&_div>span:first-child]:!tracking-[-0.02em] [&_div>span:last-child]:!text-[9px] [&_span]:!text-white"
            />

            <LiquidButton
              onClick={handleToggleFavorite}
              loading={loadingStates || updating}
              active={favorite}
              activeColor="red"
              groupId="continue-watching-actions"
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
              groupId="continue-watching-actions"
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

/* =================== SKELETON =================== */
function ContinueWatchingSkeleton({ isMobile }) {
  const count = isMobile ? 2 : 6;
  // En escritorio ocultamos las tarjetas sobrantes por breakpoint para que el
  // nº visible (y, vía flex-1, el ancho de cada una) coincida con el contenido
  // real: 3 (md) · 4 (lg) · 5 (xl) · 6 (2xl).
  const desktopVisibility = [
    "flex",
    "flex",
    "flex",
    "hidden lg:flex",
    "hidden xl:flex",
    "hidden 2xl:flex",
  ];
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`relative overflow-hidden rounded-lg bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 ${
            isMobile
              ? `min-w-0 flex-1 ${ROW_HEIGHT}`
              : `aspect-video min-w-0 flex-1 ${desktopVisibility[i] ?? "flex"}`
          }`}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
            variants={shimmer}
            animate="animate"
            style={{ backgroundSize: "200% 100%" }}
          />
        </div>
      ))}
    </div>
  );
}

/* ====================================================================
 * Sección "Continuar viendo"
 * ==================================================================== */
function ContinueWatchingSection({ isMobile, hydrated }) {
  const { authenticated, hydrated: authReady } = useAuth();
  const router = useRouter();

  // null = cargando, [] = vacío confirmado (sin sesión / sin series en curso)
  const [shows, setShows] = useState(null);

  // Pinta al instante lo último cacheado para que NO desaparezca al recargar
  // (se refrescará en segundo plano cuando el backend confirme).
  useEffect(() => {
    const cached = readContinueWatchingCache();
    if (cached) setShows(cached);
  }, []);

  const swiperRef = useRef(null);
  const rowRef = useRef(null);
  const hoverIntentRef = useRef(0);
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [animatingOutId, setAnimatingOutId] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Tarjetas visibles por fila (lo fija el breakpoint activo de Swiper). Se usa
  // para alinear la vista previa ampliada en el borde derecho y para saber
  // cuántas diapositivas avanzar con las flechas.
  const [perView, setPerView] = useState(6);
  const hoverTimeoutRef = useRef(null);
  const hoverCloseTimeoutRef = useRef(null);
  const hoveredIdRef = useRef(null);

  // Limpiar temporizador al desmontar
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (hoverCloseTimeoutRef.current) {
        clearTimeout(hoverCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    hoveredIdRef.current = hoveredId;
  }, [hoveredId]);

  useEffect(() => {
    if (isMobile || !hydrated || !Array.isArray(shows) || shows.length === 0)
      return;

    const warmVisibleTrailers = () => {
      shows.slice(0, Math.min(6, shows.length)).forEach((show) => {
        prewarmPreviewTrailer(show?.id);
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(warmVisibleTrailers, {
        timeout: 1500,
      });
      return () => window.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(warmVisibleTrailers, 500);
    return () => window.clearTimeout(timer);
  }, [shows, isMobile, hydrated]);

  const clearHoverOpenTimer = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const clearHoverCloseTimer = () => {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  };

  const openPreview = (itemKey, index) => {
    clearHoverCloseTimer();
    hoveredIdRef.current = itemKey;
    setAnimatingOutId((prev) => (prev === itemKey ? null : prev));
    setHoveredId(itemKey);
    setHoveredIndex(index);
  };

  const closePreview = (itemKey) => {
    if (hoveredIdRef.current !== itemKey) return;
    hoveredIdRef.current = null;
    setAnimatingOutId(itemKey);
    setHoveredId(null);
    setHoveredIndex(null);
  };

  const prewarmVisibleTrailers = () => {
    if (isMobile || !Array.isArray(shows) || shows.length === 0) return;
    shows
      .slice(activeIndex, Math.min(shows.length, activeIndex + perView))
      .forEach((show) => prewarmPreviewTrailer(show?.id));
  };

  const handleMouseEnterItem = (itemKey, index, tvId) => {
    if (isMobile) return;
    prewarmPreviewTrailer(tvId);
    clearHoverCloseTimer();
    clearHoverOpenTimer();
    hoverTimeoutRef.current = setTimeout(() => {
      openPreview(itemKey, index);
    }, 120);
  };

  const handleMouseLeaveItem = (itemKey) => {
    if (isMobile) return;
    clearHoverOpenTimer();
    clearHoverCloseTimer();
    hoverCloseTimeoutRef.current = window.setTimeout(() => {
      closePreview(itemKey);
    }, 120);
  };


  useEffect(() => {
    // Auth ya resuelto y sin sesión: vacío definitivo, limpiamos caché.
    if (authReady && !authenticated) {
      setShows(EMPTY_ARRAY);
      writeContinueWatchingCache(null);
      return;
    }
    // Auth todavía resolviéndose: mantenemos lo cacheado y esperamos.
    if (!authenticated) return;

    let abort = false;
    let attempt = 0;
    let timer = null;

    const load = async () => {
      try {
        const res = await traktGetInProgress();
        const mapped = mapInProgressItems(res?.items);
        if (abort) return;

        if (mapped.length > 0) {
          setShows(mapped);
          writeContinueWatchingCache(mapped);
          return;
        }

        // Vacío: puede ser transitorio tras recargar (backend aún sin token).
        // Reintentamos antes de ocultar la sección.
        if (attempt < CONTINUE_WATCHING_RETRY_DELAYS.length) {
          timer = window.setTimeout(
            load,
            CONTINUE_WATCHING_RETRY_DELAYS[attempt],
          );
          attempt += 1;
          return;
        }

        // Tras los reintentos sigue vacío => realmente no hay nada en curso.
        setShows(EMPTY_ARRAY);
        writeContinueWatchingCache(null);
      } catch {
        if (abort) return;
        if (attempt < CONTINUE_WATCHING_RETRY_DELAYS.length) {
          timer = window.setTimeout(
            load,
            CONTINUE_WATCHING_RETRY_DELAYS[attempt],
          );
          attempt += 1;
          return;
        }
        // Error persistente: conservamos lo que ya hubiera (caché); si no hay
        // nada, ocultamos.
        setShows((prev) =>
          Array.isArray(prev) && prev.length ? prev : EMPTY_ARRAY,
        );
      }
    };

    load();
    return () => {
      abort = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [authenticated, authReady]);

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
    // Avanzar (casi) una página completa: el nº de tarjetas visibles menos una
    // para mantener una de referencia, con un mínimo de 1.
    const count = isMobile ? 1 : Math.max(1, perView - 1);
    for (let i = 0; i < count; i += 1) {
      if (dir < 0) swiper.slidePrev();
      else swiper.slideNext();
    }
  };

  // No se renderiza si: auth resuelto y sin sesión, o vacío confirmado.
  if (authReady && !authenticated) return null;
  if (Array.isArray(shows) && shows.length === 0) return null;

  const loading = shows === null;
  // Aún sin datos y sin sesión confirmada: no mostramos skeleton (evita flash
  // en usuarios sin sesión); esperamos a que llegue la caché o se autentique.
  if (loading && !authenticated) return null;
  const hasActivePreview = !!hoveredId;
  const showPrev = (isHoveredRow || hasActivePreview) && canPrev;
  const showNext = (isHoveredRow || hasActivePreview) && canNext;

  const Header = (
    <motion.div variants={scaleIn} className="mb-5 px-1 sm:px-0">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="h-px w-8 bg-amber-500" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
          CONTINUAR
        </span>
      </div>
      <h3 className="bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-xl font-black tracking-tighter text-transparent sm:text-2xl md:text-3xl">
        Continuar viendo<span className="text-amber-500">.</span>
      </h3>
    </motion.div>
  );

  if (loading) {
    return (
      <motion.div
        ref={rowRef}
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="relative"
      >
        {Header}
        <ContinueWatchingSkeleton isMobile={isMobile} />
      </motion.div>
    );
  }

  // En escritorio el nº de tarjetas por fila escala con el ancho disponible
  // hasta un máximo de 6. En móvil se mantiene el ancho fijo con scroll.
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

  const swiperKey = `continue-watching-${hydrated ? "h" : "s"}-${isMobile ? "m" : "d"}`;

  return (
    <motion.div
      ref={rowRef}
      initial="hidden"
      animate="visible"
      variants={fadeInUp}
      className="relative group"
    >
      {Header}

      <div
        className="relative"
        onMouseEnter={() => {
          setIsHoveredRow(true);
          prewarmVisibleTrailers();
        }}
        onMouseLeave={() => {
          clearHoverOpenTimer();
          setIsHoveredRow(false);
          const currentHoveredId = hoveredIdRef.current;
          if (currentHoveredId) {
            handleMouseLeaveItem(currentHoveredId);
          }
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
            // En escritorio el padding vertical amplio crea el espacio para que
            // la vista previa NUNCA se recorte por arriba/abajo (el truco
            // py + -my no altera la altura de fila). `pointer-events-none` en el
            // Swiper hace que ese padding transparente sea atravesable: así no
            // roba el hover/clic a las filas vecinas; las tarjetas reactivan los
            // eventos (pointer-events es heredado y el arrastre sigue funcionando
            // por propagación desde la tarjeta).
            className={`group relative !py-14 sm:!py-16 md:!py-32 !-my-14 sm:!-my-16 md:!-my-32 ${
              isMobile ? "" : "pointer-events-none"
            }`}
            wrapperClass="flex items-center"
            breakpoints={breakpoints}
          >
            {shows.map((show, i) => {
              const itemKey = `tv:${show.id}`;
              const isActive = hydrated && !isMobile && hoveredId === itemKey;
              const isAnimatingOut = animatingOutId === itemKey;

              const base =
                "relative flex-shrink-0 transition-all duration-300 ease-in-out";
              // Escritorio: el ancho lo fija Swiper (según breakpoint) y el alto
              // sale del aspect-video. Móvil: 2 por fila (ancho lo fija Swiper)
              // con alto fijo para mantener legible el overlay de progreso.
              const dimensionClasses = isMobile
                ? `w-full ${ROW_HEIGHT}`
                : "w-full aspect-video";
              const sizeClasses = `${dimensionClasses} ${
                isActive || isAnimatingOut ? "z-[90]" : "z-10"
              }`;

              return (
                <SwiperSlide
                  key={itemKey}
                  className={isMobile ? "select-none" : "select-none pointer-events-auto"}
                >
                  <div
                    className={`${base} ${sizeClasses} ${
                      isActive || isAnimatingOut ? "overflow-visible" : "overflow-hidden"
                    }`}
                    onMouseEnter={() => handleMouseEnterItem(itemKey, i, show.id)}
                    onMouseLeave={() => {
                      if (!isActive) handleMouseLeaveItem(itemKey);
                    }}
                  >
                    <AnimatePresence
                      initial={false}
                      mode="popLayout"
                      onExitComplete={() => {
                        setAnimatingOutId((prev) => (prev === itemKey ? null : prev));
                      }}
                    >
                      {isActive ? (
                        <div
                          key="preview"
                          className="hidden sm:block"
                          onMouseEnter={() => openPreview(itemKey, i)}
                        >
                          <ContinueWatchingPreviewCard
                            show={show}
                            index={i}
                            totalCount={shows.length}
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
                          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                          className="h-full w-full cursor-pointer"
                          style={{ willChange: "transform, opacity" }}
                          onClick={() => router.push(nextEpisodeHref(show))}
                        >
                          <ContinueWatchingBaseCard show={show} />
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
              className="absolute inset-y-0 left-0 z-30 hidden w-32 items-center justify-start bg-gradient-to-r from-black/90 via-black/70 to-transparent transition-all duration-300 hover:from-black/95 hover:via-black/80 sm:flex group/nav"
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
              className="absolute inset-y-0 right-0 z-30 hidden w-32 items-center justify-end bg-gradient-to-l from-black/90 via-black/70 to-transparent transition-all duration-300 hover:from-black/95 hover:via-black/80 sm:flex group/nav"
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

export default memo(ContinueWatchingSection);
