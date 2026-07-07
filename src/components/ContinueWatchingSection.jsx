// /src/components/ContinueWatchingSection.jsx
"use client";

import { useRef, useEffect, useState, memo } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper/modules";
import { AnimatePresence, motion } from "framer-motion";
import NextImage from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, BookmarkPlus, Play, Award, CalendarDays, ChevronRight } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { getLocalInProgress } from "@/lib/api/progressClient";
import {
  getVideos,
  getDetails,
  markAsFavorite,
  markInWatchlist,
} from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import { formatDashboardAwards } from "@/lib/details/awardsText";
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
  preloadImage,
  GENRES,
} from "@/lib/dashboard/media";
import { useScrollRevealProps } from "@/lib/hooks/useHasScrolled";

const EMPTY_ARRAY = [];
const MAX_ITEMS = 20;

// Caché local para que la sección NO desaparezca al recargar: se pinta al
// instante lo último conocido mientras se refresca en segundo plano.
// v2: al pasar "Continuar viendo" a SOLO progreso local (posición), se invalida
// la caché v1 que aún guardaba las series por episodios de Trakt.
const CONTINUE_WATCHING_CACHE_KEY = "showverse:dashboard:continue-watching:v2";
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
    // La caché pudo escribirse con una versión anterior que duplicaba series:
    // deduplicamos al leer para no renderizar keys `tv:<id>` repetidas.
    return dedupeByKey(parsed.shows, (s) => s?.id);
  } catch {
    return null;
  }
}

// Deduplica una lista por una clave (normalizada a string, así "1" y 1 no se
// tratan como distintos). Conserva la primera aparición y descarta claves nulas.
function dedupeByKey(list, getKey) {
  const seen = new Set();
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    const raw = getKey(x);
    if (raw == null) continue;
    const key = String(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
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

// Convierte las filas de progreso local (streaming: películas y episodios) a las
// tarjetas de "Continuar viendo". El % es la POSICIÓN real de reproducción
// (0..1 → 0..100), no el progreso por episodios de la serie.
function mapLocalProgressItems(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && Number(r.tmdbId) > 0)
    .map((r) => {
      const isTv = r.mediaType === "tv";
      const season = Number(r.season);
      const number = Number(r.episode);
      const hasEpisode =
        isTv &&
        Number.isFinite(season) &&
        season > 0 &&
        Number.isFinite(number) &&
        number > 0;
      const pct = Math.max(
        0,
        Math.min(100, Math.round((Number(r.percent) || 0) * 100)),
      );
      return {
        id: Number(r.tmdbId),
        media_type: isTv ? "tv" : "movie",
        title: r.title || "",
        backdrop_path: null,
        poster_path: r.posterPath || null,
        overview: null,
        genres: EMPTY_ARRAY,
        pct,
        completed: null,
        aired: null,
        nextEpisode: hasEpisode ? { season, number } : null,
        lastEpisode: null,
        lastWatchedAt: r.updatedAt || null,
        isRewatch: false,
      };
    });
}

// Una tarjeta por título: deduplica por media_type:id (conserva el más reciente)
// y ordena por lo último reproducido.
function dedupeLocalByTitle(items) {
  const seen = new Set();
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || it.id == null) continue;
    const key = `${it.media_type || "tv"}:${it.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  out.sort((a, b) => {
    const ta = a?.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
    const tb = b?.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
    return tb - ta;
  });
  return out.slice(0, MAX_ITEMS);
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
const CONTINUE_WATCHING_TRAILER_LANGUAGE_FILTER = "en,es,null";
const CONTINUE_WATCHING_TRAILER_CACHE_PREFIX =
  "showverse:dashboard:continue-watching:trailer-videos:v2:";
const CONTINUE_WATCHING_TRAILER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PREVIEW_TRAILER_PREWARM_AHEAD = 4;
const PREVIEW_TRAILER_REVEAL_DELAY_MS = 80;
// YouTube solo se revela cuando confirma PLAYING; si no llega ese estado, el
// intento queda oculto y se prueba el siguiente trailer para no mostrar errores.
const PREVIEW_TRAILER_YOUTUBE_REVEAL_DELAY_MS = 120;
const PREVIEW_TRAILER_YOUTUBE_PLAY_TIMEOUT_MS = 3000;
const PREVIEW_TRAILER_FALLBACK_REVEAL_MS = 700;
const PREVIEW_TRAILER_YOUTUBE_ORIGIN = "https://www.youtube-nocookie.com";
const PREVIEW_TRAILER_VIMEO_ORIGIN = "https://player.vimeo.com";

let youtubeIframeApiPromise = null;
const previewTrailerVideosCache = new Map();
const verifiedPreviewTrailerKeys = new Map();
const continueWatchingBackdropPathMemory = new Map();
const loadedContinueWatchingBackdropSrcs = new Set();
// Extras del panel ampliado (nota TMDb, nota IMDb, premios, temporadas, año) que
// no vienen en el item de "Continuar viendo": se cargan al hacer hover y se
// cachean por serie (igual que el spotlight) para no repetir peticiones.
const continueWatchingExtrasCache = new Map();

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

function prioritizePreviewTrailer(videos, preferredKey) {
  if (!preferredKey || !Array.isArray(videos) || videos.length < 2) {
    return videos;
  }
  const preferredIndex = videos.findIndex(
    (video) => getVideoIdentity(video) === preferredKey,
  );
  if (preferredIndex <= 0) return videos;
  return [
    videos[preferredIndex],
    ...videos.slice(0, preferredIndex),
    ...videos.slice(preferredIndex + 1),
  ];
}

function readStoredPreviewTrailerVideos(tvId) {
  if (!tvId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      `${CONTINUE_WATCHING_TRAILER_CACHE_PREFIX}${tvId}`,
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    if (
      !savedAt ||
      Date.now() - savedAt > CONTINUE_WATCHING_TRAILER_CACHE_TTL_MS ||
      !Array.isArray(parsed?.videos)
    ) {
      return null;
    }
    const videos = normalizePreviewVideos(parsed.videos);
    const preferredKey =
      typeof parsed?.preferredKey === "string" ? parsed.preferredKey : "";
    if (preferredKey) verifiedPreviewTrailerKeys.set(String(tvId), preferredKey);
    const prioritized = prioritizePreviewTrailer(videos, preferredKey);
    return prioritized.length ? prioritized : null;
  } catch {
    return null;
  }
}

function writeStoredPreviewTrailerVideos(tvId, videos) {
  if (!tvId || typeof window === "undefined") return;
  try {
    if (!Array.isArray(videos) || videos.length === 0) return;
    window.localStorage.setItem(
      `${CONTINUE_WATCHING_TRAILER_CACHE_PREFIX}${tvId}`,
      JSON.stringify({
        savedAt: Date.now(),
        videos,
        preferredKey: verifiedPreviewTrailerKeys.get(String(tvId)) || null,
      }),
    );
  } catch {
    // ignorar (modo privado / cuota)
  }
}

function rememberPlayablePreviewTrailer(tvId, video, videos) {
  const preferredKey = getVideoIdentity(video);
  if (!tvId || !preferredKey || !Array.isArray(videos)) return videos;

  const tvKey = String(tvId);
  const alreadyPreferred =
    verifiedPreviewTrailerKeys.get(tvKey) === preferredKey &&
    getVideoIdentity(videos[0]) === preferredKey;
  if (alreadyPreferred) return videos;

  const prioritized = prioritizePreviewTrailer(videos, preferredKey);
  const cacheKey = `tv:${tvId}`;
  verifiedPreviewTrailerKeys.set(tvKey, preferredKey);
  previewTrailerVideosCache.set(cacheKey, prioritized);
  writeStoredPreviewTrailerVideos(tvId, prioritized);
  return prioritized;
}

async function fetchPreviewTrailerVideos(tvId) {
  if (!tvId) return EMPTY_ARRAY;
  const cacheKey = `tv:${tvId}`;
  const cached = previewTrailerVideosCache.get(cacheKey);
  if (cached) return cached;

  const stored = readStoredPreviewTrailerVideos(tvId);
  if (stored) {
    previewTrailerVideosCache.set(cacheKey, stored);
    return stored;
  }

  const request = getVideos("tv", tvId, "en-US", {
    includeVideoLanguage: CONTINUE_WATCHING_TRAILER_LANGUAGE_FILTER,
  })
    .catch(() => ({ results: EMPTY_ARRAY }))
    .then((data) =>
      normalizePreviewVideos(
        Array.isArray(data?.results) ? data.results : EMPTY_ARRAY,
      ),
    )
    .then((videos) => {
      previewTrailerVideosCache.set(cacheKey, videos);
      writeStoredPreviewTrailerVideos(tvId, videos);
      return videos;
    });

  previewTrailerVideosCache.set(cacheKey, request);
  return request;
}

function prewarmPreviewTrailer(tvId) {
  if (!tvId || typeof window === "undefined") return Promise.resolve(EMPTY_ARRAY);
  const videosPromise = resolvePreviewTrailerVideos(tvId).catch(() => EMPTY_ARRAY);
  loadYouTubeIframeApi().catch(() => {});
  return videosPromise;
}

/* ============== PRECALENTADO DE EMBEDS (HOVER-INTENT) ==============
 * El retardo al hacer hover viene de que el iframe de YouTube SOLO empieza a
 * cargar cuando se expande la tarjeta: hay que descargar el reproductor, abrir
 * la conexión con YouTube y bufferear, todo en frío (~1-3 s).
 *
 * Para que arranque rápido, "calentamos" el embed en cuanto el cursor se ACERCA
 * (entra en la fila / en una tarjeta y su vecina): montamos un iframe oculto y
 * silenciado que ya descarga el player JS y abre la conexión. Cuando luego se
 * monta el iframe visible de la preview, su carga es mucho más rápida porque el
 * reproductor y la conexión ya están en caché. El pool está acotado (LRU) para
 * no descargar de más, y se vacía al salir de la fila. */
const WARM_EMBED_POOL_MAX = 3;
const warmEmbedPool = new Map(); // videoKey -> { iframe, ts }

function ensureWarmEmbedHost() {
  if (typeof document === "undefined") return null;
  let host = document.getElementById("cw-warm-embed-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "cw-warm-embed-host";
    host.setAttribute("aria-hidden", "true");
    // Fuera de pantalla pero RENDERIZADO (no display:none, que en algunos
    // navegadores bloquea la carga del media). Tamaño mínimo: solo nos interesa
    // calentar la descarga/conexión, no verlo.
    host.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;";
    document.body.appendChild(host);
  }
  return host;
}

function releaseWarmEmbed(key) {
  const entry = warmEmbedPool.get(key);
  if (!entry) return;
  try {
    entry.iframe.src = "about:blank";
    entry.iframe.remove();
  } catch {
    // El nodo pudo haberse retirado ya.
  }
  warmEmbedPool.delete(key);
}

function warmTrailerEmbed(video) {
  if (typeof document === "undefined" || !video) return;
  // Solo YouTube: Vimeo (background=1) arranca solo y no tiene el mismo coste.
  if (video.site !== "YouTube") return;
  const key = getVideoIdentity(video);
  if (!key) return;

  const existing = warmEmbedPool.get(key);
  if (existing) {
    existing.ts = Date.now(); // refresca posición LRU
    return;
  }

  const src = buildPreviewTrailerSrc(video);
  const host = ensureWarmEmbedHost();
  if (!src || !host) return;

  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.tabIndex = -1;
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("allow", "autoplay; encrypted-media");
  iframe.width = "320";
  iframe.height = "180";
  iframe.style.cssText = "width:320px;height:180px;border:0;opacity:0;";
  host.appendChild(iframe);
  warmEmbedPool.set(key, { iframe, ts: Date.now() });

  // LRU: no mantener más de N embeds calientes a la vez.
  if (warmEmbedPool.size > WARM_EMBED_POOL_MAX) {
    let oldestKey = null;
    let oldestTs = Infinity;
    for (const [k, v] of warmEmbedPool) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) releaseWarmEmbed(oldestKey);
  }
}

// Resuelve el trailer de un show (de caché, o pidiéndolo) y calienta su embed.
function warmPreviewTrailerEmbed(tvId) {
  if (!tvId || typeof window === "undefined") return;
  const cached = readCachedPreviewTrailerVideos(tvId);
  if (cached && cached[0]) {
    warmTrailerEmbed(cached[0]);
    return;
  }
  resolvePreviewTrailerVideos(tvId)
    .then((videos) => {
      if (videos && videos[0]) warmTrailerEmbed(videos[0]);
    })
    .catch(() => {});
}

function clearWarmEmbedPool() {
  for (const key of Array.from(warmEmbedPool.keys())) releaseWarmEmbed(key);
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
    const params = new URLSearchParams({
      autoplay: "1",
      mute: "1",
      playsinline: "1",
      controls: "0",
      disablekb: "1",
      fs: "0",
      iv_load_policy: "3",
      cc_load_policy: "0",
      rel: "0",
      loop: "1",
      playlist: String(video.key),
      enablejsapi: "1",
    });
    if (typeof window !== "undefined") {
      params.set("origin", window.location.origin);
    }
    return `${PREVIEW_TRAILER_YOUTUBE_ORIGIN}/embed/${video.key}?${params}`;
  }

  if (video.site === "Vimeo") {
    const url = new URL(embedUrl);
    url.searchParams.set("background", "1");
    url.searchParams.set("muted", "1");
    url.searchParams.set("controls", "0");
    url.searchParams.set("loop", "1");
    url.searchParams.set("autopause", "0");
    url.searchParams.set("dnt", "1");
    url.searchParams.set("title", "0");
    url.searchParams.set("byline", "0");
    url.searchParams.set("portrait", "0");
    return url.toString();
  }

  return embedUrl;
}

function previewTrailerMessageOrigin(video) {
  if (video?.site === "YouTube") return PREVIEW_TRAILER_YOUTUBE_ORIGIN;
  if (video?.site === "Vimeo") return PREVIEW_TRAILER_VIMEO_ORIGIN;
  return "*";
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

// Tipo de medio de la tarjeta ("tv" por defecto; "movie" para películas en
// progreso capturadas desde streaming).
function mediaTypeOf(show) {
  return show?.media_type === "movie" ? "movie" : "tv";
}

function nextEpisodeHref(show) {
  if (mediaTypeOf(show) === "movie") {
    return `/details/movie/${show.id}`;
  }
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
    if (!show?.id) {
      setBackdropPath(null);
      setReady(false);
      return undefined;
    }

    const type = mediaTypeOf(show);
    const movie = {
      id: show.id,
      media_type: type,
      backdrop_path: show.backdrop_path,
      poster_path: show.poster_path,
    };
    const cacheKey = `${getBackdropCacheKey(movie, type)}:continue-next`;
    const memoryKey = `${type}:${show.id}`;

    let canceled = false;

    // Resolución inmediata solo con rutas ya decididas: preferencia del usuario
    // o caché. El fallback del item se reserva para el último caso, tras intentar
    // obtener una imagen con idioma desde TMDb.
    const { backdrop: userBackdrop } = getArtworkPreference(show.id);
    const cached = movieBackdropCache.get(cacheKey);
    const remembered = continueWatchingBackdropPathMemory.get(memoryKey);
    const initial =
      userBackdrop || remembered || (cached != null ? cached : null) || null;

    setBackdropPath(initial);
    setReady(!!initial);

    const resolveBackdrop = async () => {
      if (userBackdrop) {
        movieBackdropCache.set(cacheKey, userBackdrop);
        continueWatchingBackdropPathMemory.set(memoryKey, userBackdrop);
        return;
      }

      try {
        const localized =
          (await fetchBestBackdrop(show.id, type, {
            offset: 1,
            includeNoLanguage: false,
          })) ||
          (await fetchBestBackdrop(show.id, type, {
            includeNoLanguage: false,
          }));

        const fallback =
          localized ||
          cached ||
          (await fetchBestBackdrop(show.id, type, {
            offset: 1,
            includeNoLanguage: true,
          })) ||
          getPreviewBackdropFallback(movie) ||
          null;

        if (fallback) {
          movieBackdropCache.set(cacheKey, fallback);
          continueWatchingBackdropPathMemory.set(memoryKey, fallback);
          await preloadImage(buildImg(fallback, CONTINUE_WATCHING_BACKDROP_SIZE));
        }

        if (!canceled) {
          setBackdropPath(fallback);
          setReady(!!fallback);
        }
      } catch {
        const fallback = cached || getPreviewBackdropFallback(movie) || null;
        if (fallback) {
          movieBackdropCache.set(cacheKey, fallback);
          continueWatchingBackdropPathMemory.set(memoryKey, fallback);
        }
        if (!canceled) {
          setBackdropPath(fallback);
          setReady(!!fallback);
        }
      }
    };

    resolveBackdrop();

    return () => {
      canceled = true;
    };
  }, [show]);

  return { backdropPath, ready };
}

/* ====================================================================
 * Tarjeta base (sin hover): backdrop + overlay de progreso
 * ==================================================================== */
function ContinueWatchingBaseCard({ show, mode = "continue" }) {
  const { backdropPath } = useShowBackdrop(show);
  const bgSrc = backdropPath
    ? buildImg(backdropPath, CONTINUE_WATCHING_BACKDROP_SIZE)
    : null;
  // El backdrop ya se conoce al instante (lo trae el backend); el shimmer se
  // mantiene solo MIENTRAS carga la imagen y luego hace un fundido suave.
  const [imgReady, setImgReady] = useState(() =>
    bgSrc ? loadedContinueWatchingBackdropSrcs.has(bgSrc) : false,
  );
  useEffect(() => {
    setImgReady(bgSrc ? loadedContinueWatchingBackdropSrcs.has(bgSrc) : false);
  }, [bgSrc]);
  const markImageReady = () => {
    if (bgSrc) loadedContinueWatchingBackdropSrcs.add(bgSrc);
    setImgReady(true);
  };
  const pct = clampPct(show?.pct);
  const ep = show?.nextEpisode;
  const isCalendar = mode === "calendar";
  const calendar = show?.calendar || null;

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
          alt={show?.title || ""}
          fill
          sizes="(min-width:1280px) 338px, (min-width:768px) 300px, 224px"
          quality={CONTINUE_WATCHING_IMAGE_QUALITY}
          className={`object-cover transition-opacity duration-200 ${
            imgReady ? "opacity-100" : "opacity-0"
          }`}
          loading="eager"
          onLoad={markImageReady}
        />
      )}

      {/* Overlay inferior: progreso o fecha de emisión + próximo episodio */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2 pt-8">
        {isCalendar && calendar?.countdown ? (
          <div className="mb-1 flex items-center gap-1.5 truncate text-[11px] font-semibold text-white drop-shadow">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{calendar.countdown}</span>
            {calendar.isPremiere && (
              <span className="rounded bg-white px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-black">
                Estreno
              </span>
            )}
          </div>
        ) : ep ? (
          <div className="mb-1 flex items-center gap-1 truncate text-[11px] font-semibold text-white drop-shadow">
            <Play className="h-3 w-3 fill-current text-white shrink-0" aria-hidden="true" />
            <span>T{ep.season}·E{ep.number}</span>
          </div>
        ) : null}
        {isCalendar ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-white">
            {ep && <span className="shrink-0 text-white">T{ep.season}·E{ep.number}</span>}
            {ep?.title && (
              <>
                <span className="text-white/35" aria-hidden="true">•</span>
                <span className="truncate">{ep.title}</span>
              </>
            )}
          </div>
        ) : (
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
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
  mode = "continue",
  index,
  totalCount,
  activeIndex,
  perView = 6,
  onPreviewMouseEnter,
  onPreviewMouseLeave,
}) {
  const { session, account } = useAuth();
  const router = useRouter();
  const mediaType = mediaTypeOf(show);
  const { backdropPath, ready } = useShowBackdrop(show);

  const [loadingStates, setLoadingStates] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  // Extras del panel ampliado: nota TMDb, nota IMDb, premios, temporadas y año.
  // Se pintan al instante desde caché si ya se cargaron; si no, se piden al hacer
  // hover (que es cuando esta tarjeta se monta) y aparecen con un fundido suave.
  const [extras, setExtras] = useState(
    () => continueWatchingExtrasCache.get(show?.id) || null,
  );

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
  const trailerPlayTimeoutRef = useRef(null);
  const trailerVideosRef = useRef(initialTrailerVideos);
  const skippedTrailerKeysRef = useRef(new Set());

  useEffect(() => {
    const cachedVideos = readCachedPreviewTrailerVideos(show?.id) || EMPTY_ARRAY;
    trailerVideosRef.current = cachedVideos;
    skippedTrailerKeysRef.current = new Set();
    setTrailer(cachedVideos[0] || null);
    setTrailerVisible(false);
  }, [show?.id]);

  // Carga de extras (nota, IMDb, premios, temporadas, año). Un único getDetails de
  // TV ya trae vote_average, número de temporadas/episodios, first_air_date y
  // external_ids.imdb_id; con el imdb_id pedimos premios (OMDb) y nota IMDb, igual
  // que el spotlight. Cacheado por serie para no repetir peticiones entre hovers.
  useEffect(() => {
    const id = show?.id;
    if (!id) return;
    const ep = show?.nextEpisode;
    // La clave incluye el episodio: el nombre del episodio es específico de T·E.
    const cacheKey =
      mediaType === "tv" && ep ? `${id}:${ep.season}:${ep.number}` : String(id);
    const cached = continueWatchingExtrasCache.get(cacheKey);
    if (cached) {
      setExtras(cached);
      return;
    }
    let abort = false;
    (async () => {
      try {
        const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
        // Detalles y nombre del episodio EN PARALELO, para que todos los extras
        // (incluido el episodio) aparezcan a la vez y no haya un salto extra.
        const [details, epData] = await Promise.all([
          getDetails(mediaType, id, { language: "es-ES" }).catch(() => null),
          mediaType === "tv" && ep && apiKey
            ? fetch(
                `https://api.themoviedb.org/3/tv/${id}/season/${ep.season}/episode/${ep.number}?api_key=${apiKey}&language=es-ES`,
              )
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        const episodeName = epData?.name || null;
        const rating =
          typeof details?.vote_average === "number" && details.vote_average > 0
            ? details.vote_average
            : null;
        // Solo series: nº de temporadas/episodios. Las películas usan la duración.
        let seasons = null;
        if (mediaType === "tv" && details?.number_of_seasons) {
          seasons = `${details.number_of_seasons} Temp.`;
          if (details.number_of_episodes) {
            seasons += ` · ${details.number_of_episodes} Eps.`;
          }
        } else if (mediaType === "movie" && details?.runtime) {
          seasons = `${details.runtime} min`;
        }
        const year = (details?.first_air_date || details?.release_date)
          ? String(details.first_air_date || details.release_date).slice(0, 4)
          : null;
        // Géneros SIEMPRE en español. Pedimos los detalles con language es-ES,
        // pero TMDb NO traduce algunos géneros combinados de TV ("Sci-Fi &
        // Fantasy", "Action & Adventure", "War & Politics"…), que se quedan en
        // inglés. Por eso mapeamos por ID con el diccionario GENRES (español para
        // todos los IDs) y solo caemos al nombre de la API si faltara el ID.
        const genresEs = Array.isArray(details?.genres)
          ? details.genres
              .map((g) => GENRES[g?.id] || g?.name)
              .filter(Boolean)
              .slice(0, 2)
              .join(" • ")
          : null;
        const imdbId = details?.external_ids?.imdb_id || null;

        let awards = null;
        let imdbRating = null;
        if (imdbId) {
          const [omdb, ds] = await Promise.all([
            fetchOmdbByImdb(imdbId).catch(() => null),
            fetchImdbRatingByImdb(imdbId).catch(() => null),
          ]);
          if (typeof ds?.rating === "number") imdbRating = ds.rating;
          const rawAwards = omdb?.Awards;
          if (rawAwards && typeof rawAwards === "string" && rawAwards.trim()) {
            awards = formatDashboardAwards(rawAwards);
          }
        }

        const next = { rating, imdbRating, awards, seasons, year, genresEs, episodeName };
        continueWatchingExtrasCache.set(cacheKey, next);
        if (!abort) setExtras(next);
      } catch {
        if (!abort)
          setExtras({
            rating: null,
            imdbRating: null,
            awards: null,
            seasons: null,
            year: null,
            genresEs: null,
            episodeName: null,
          });
      }
    })();
    return () => {
      abort = true;
    };
  }, [show?.id, mediaType, show?.nextEpisode?.season, show?.nextEpisode?.number]);

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
        const st = await getBackendItemStatus({ type: mediaType, tmdbId: show.id });
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
  }, [show, session, account, mediaType]);

  // Solo si el trailer NO estaba resuelto lo esperamos desde la misma promesa
  // de precalentamiento. Así un hover temprano no dispara una segunda ruta lenta.
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
    const clearPlayTimeout = () => {
      if (trailerPlayTimeoutRef.current) {
        window.clearTimeout(trailerPlayTimeoutRef.current);
        trailerPlayTimeoutRef.current = null;
      }
    };
    const skipCurrentTrailer = () => {
      clearReveal();
      clearPlayTimeout();
      setTrailer((currentTrailer) => {
        const currentKey = getVideoIdentity(currentTrailer);
        if (currentKey) skippedTrailerKeysRef.current.add(currentKey);
        return pickNextPreviewTrailer(
          trailerVideosRef.current,
          currentTrailer,
          skippedTrailerKeysRef.current,
        );
      });
    };
    const revealTrailer = (delay = 0) => {
      clearReveal();
      trailerRevealTimerRef.current = window.setTimeout(() => {
        setTrailerVisible(true);
        trailerRevealTimerRef.current = null;
      }, delay);
    };
    clearReveal();
    clearPlayTimeout();

    if (trailer.site !== "YouTube") {
      // Vimeo no expone el mismo estado PLAYING mediante la API actual; para
      // estos embeds mantenemos el respaldo visual sobre el backdrop.
      revealTrailer(PREVIEW_TRAILER_FALLBACK_REVEAL_MS);
      return () => {
        clearReveal();
        clearPlayTimeout();
      };
    }

    let cancelled = false;
    trailerPlayTimeoutRef.current = window.setTimeout(() => {
      if (!cancelled) skipCurrentTrailer();
    }, PREVIEW_TRAILER_YOUTUBE_PLAY_TIMEOUT_MS);

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !YT?.Player || !trailerIframeRef.current) return;

      trailerPlayerRef.current = new YT.Player(trailerIframeRef.current, {
        events: {
          onReady: (event) => {
            if (cancelled) return;
            try {
              // Reproducción SILENCIADA: no desmuteamos (el navegador bloquearía
              // el autoplay con sonido y dejaría el vídeo en pausa). Solo
              // aseguramos que arranque.
              event.target.mute?.();
              event.target.playVideo?.();
            } catch {
              // La URL ya incluye autoplay=1&mute=1.
            }
          },
          onStateChange: (event) => {
            if (cancelled) return;
            // PLAYING (1): ya hay fotograma. En YouTube esperamos un poco más
            // para no mostrar su chrome inicial ni overlays internos.
            if (Number(event?.data) === 1) {
              clearPlayTimeout();
              trailerVideosRef.current = rememberPlayablePreviewTrailer(
                show?.id,
                trailer,
                trailerVideosRef.current,
              );
              revealTrailer(
                trailer.site === "YouTube"
                  ? PREVIEW_TRAILER_YOUTUBE_REVEAL_DELAY_MS
                  : PREVIEW_TRAILER_REVEAL_DELAY_MS,
              );
              return;
            }
            // Si YouTube pausa o termina por su cuenta, recuperamos el backdrop
            // antes de que pueda dibujar su icono central o la pantalla final.
            if (Number(event?.data) === 0 || Number(event?.data) === 2) {
              clearReveal();
              setTrailerVisible(false);
              try {
                if (Number(event?.data) === 0) event.target.seekTo?.(0, true);
                event.target.playVideo?.();
              } catch {
                // El parámetro loop sigue actuando como respaldo.
              }
            }
          },
          onError: () => {
            if (cancelled) return;
            // Salta al siguiente vídeo SIN revelar el actual (sigue oculto), así
            // el intento fallido no se ve. El efecto se relanza con el nuevo
            // vídeo y vuelve a esperar a su reproducción.
            skipCurrentTrailer();
          },
          onAutoplayBlocked: () => {
            if (cancelled) return;
            // El bloqueo de autoplay afecta al reproductor, no al vídeo elegido:
            // mantenemos el backdrop y evitamos descargar todos los candidatos.
            clearReveal();
            clearPlayTimeout();
            setTrailerVisible(false);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearReveal();
      clearPlayTimeout();
      try {
        trailerPlayerRef.current?.destroy?.();
      } catch {
        // El iframe puede haber sido desmontado por React.
      } finally {
        trailerPlayerRef.current = null;
      }
    };
  }, [show?.id, trailer]);

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
        type: mediaType,
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
        type: mediaType,
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
  const isCalendar = mode === "calendar";
  const calendar = show?.calendar || null;
  const genres = genresText(show);

  const progressLabel =
    Number.isFinite(show?.completed) && Number.isFinite(show?.aired)
      ? `${show.completed}/${show.aired} eps`
      : "";

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

  // Vista previa ~1,6× la tarjeta base (como el spotlight): más ancha que antes
  // para que el backdrop se vea más grande y quepa el panel de info ampliado.
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
        : visibleCount === 5
          ? "(min-width:1536px) 540px, (min-width:1280px) 500px, 420px"
          : "(min-width:1536px) 560px, (min-width:1280px) 500px, 420px";

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
              className="pointer-events-none absolute inset-0 block h-full w-full border-0 bg-black"
              src={trailerSrc}
              title={`Trailer - ${show?.title || ""}`}
              width="1280"
              height="720"
              loading="eager"
              tabIndex={-1}
              aria-hidden="true"
              allow="autoplay; encrypted-media"
              allowFullScreen={false}
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => {
                // Respaldo de autoplay/volumen para iframes que ya aceptan
                // comandos por postMessage antes de que la API termine de montar.
                try {
                  const win = trailerIframeRef.current?.contentWindow;
                  if (!win) return;
                  const targetOrigin = previewTrailerMessageOrigin(trailer);
                  if (trailer.site === "YouTube") {
                    // Reproducción silenciada: reforzamos mute + play (NO
                    // desmuteamos, el navegador bloquearía el autoplay con sonido
                    // y el vídeo se quedaría en pausa con todo el chrome visible).
                    win.postMessage(
                      JSON.stringify({
                        event: "command",
                        func: "mute",
                        args: [],
                      }),
                      targetOrigin,
                    );
                    win.postMessage(
                      JSON.stringify({
                        event: "command",
                        func: "playVideo",
                        args: [],
                      }),
                      targetOrigin,
                    );
                    return;
                  }
                  if (trailer.site === "Vimeo") {
                    win.postMessage(
                      JSON.stringify({ method: "setVolume", value: 0 }),
                      targetOrigin,
                    );
                    win.postMessage(
                      JSON.stringify({ method: "play" }),
                      targetOrigin,
                    );
                  }
                } catch {
                  // ignorar
                }
              }}
            />
          </motion.div>
        )}

        {/* Estado de la tarjeta superpuesto al pie del backdrop */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-black/85" />
        {isCalendar ? (
          // La fecha/cuenta atrás NO se repite sobre la portada: ya se muestra
          // abajo en los metadatos (junto a Temporada·Episodio y año). Aquí solo
          // se conserva el badge "Estreno" para los estrenos (S1E1).
          calendar?.isPremiere ? (
            <div className="absolute inset-x-3 bottom-2">
              <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-black">
                Estreno
              </span>
            </div>
          ) : null
        ) : (
          <div className="absolute inset-x-3 bottom-2">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Panel de info ampliado (debajo del backdrop), en el lenguaje visual de
          FeaturedHero/spotlight: acciones arriba, premios, metadatos (episodio ·
          progreso · año · temporadas), géneros + notas y sinopsis. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.25, ease: "easeOut" }}
        className="w-full border-t border-white/5 bg-[#141414]/95 px-4 py-3.5 backdrop-blur-md sm:px-5 sm:py-4"
      >
        {/* Título (serie/película) y, si es serie, el episodio (T·E · nombre),
            ENCIMA de los botones. Una línea cada uno (truncan) para que el panel
            no cambie de alto cuando llega el nombre del episodio. */}
        <div className="mb-2.5 min-w-0">
          <h3 className="truncate text-base font-black leading-tight text-white sm:text-lg">
            {show?.title || "Sin título"}
          </h3>
          {ep && (
            <p className="mt-0.5 truncate text-[11px] font-semibold text-zinc-300 sm:text-xs">
              <span className="text-amber-300">
                T{ep.season}·E{ep.number}
              </span>
              {ep.title || extras?.episodeName
                ? ` · ${ep.title || extras.episodeName}`
                : ""}
            </p>
          )}
        </div>

        {/* Fila de acciones: acción principal + favorito + pendientes */}
        <div className="mb-3 flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={handleContinue}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-white px-3.5 text-[13px] font-bold text-black shadow-[0_10px_30px_-12px_rgba(255,255,255,0.8)] transition hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:min-h-10 sm:px-4 sm:text-sm"
          >
            {isCalendar ? (
              <CalendarDays className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            <span>
              {isCalendar
                ? ep
                  ? `Ver T${ep.season}·E${ep.number}`
                  : "Ver serie"
                : ep
                  ? `Reanudar T${ep.season}·E${ep.number}`
                  : "Reanudar"}
            </span>
          </button>

          {/* Botón de progreso de visionado (círculo con % y relleno). */}
          {!isCalendar && (
            <LiquidButton
              onClick={handleContinue}
              active
              activeColor="green"
              groupId="continue-watching-actions"
              title={`Continuar viendo · ${pct}% visto`}
              progressPercent={`${pct}%`}
              fillPercentage={pct}
              className="!h-10 !w-10 sm:!h-11 sm:!w-11 [&_div>span:first-child]:!text-base sm:[&_div>span:first-child]:!text-lg [&_div>span:last-child]:!text-[9px] sm:[&_div>span:last-child]:!text-[10px] [&_span]:!text-white"
            />
          )}

          <LiquidButton
            onClick={handleToggleFavorite}
            loading={loadingStates || updating}
            active={favorite}
            activeColor="red"
            groupId={isCalendar ? "calendar-preview-actions" : "continue-watching-actions"}
            title={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
            className="!h-10 !w-10 sm:!h-11 sm:!w-11 [&_svg]:!h-5 [&_svg]:!w-5 sm:[&_svg]:!h-6 sm:[&_svg]:!w-6"
          >
            <Heart className={favorite ? "fill-current" : ""} />
          </LiquidButton>

          <LiquidButton
            onClick={handleToggleWatchlist}
            loading={loadingStates || updating}
            active={watchlist}
            activeColor="blue"
            groupId={isCalendar ? "calendar-preview-actions" : "continue-watching-actions"}
            title={watchlist ? "Quitar de pendientes" : "Añadir a pendientes"}
            className="!h-10 !w-10 sm:!h-11 sm:!w-11 [&_svg]:!h-5 [&_svg]:!w-5 sm:[&_svg]:!h-6 sm:[&_svg]:!w-6"
          >
            <BookmarkPlus className={watchlist ? "fill-current" : ""} />
          </LiquidButton>
        </div>

        {/* Premios — hueco reservado (min-height) para que la carga tardía de
            OMDb no desplace el resto; aparece con un fundido suave. */}
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

        {/* Metadatos: episodio · progreso · año · temporadas (separadores "•").
            Si es un rewatch, se antepone una etiqueta que lo indica (el progreso
            mostrado es el del rewatch, no el del visionado original). */}
        <div className="flex flex-nowrap items-center gap-x-2 overflow-hidden text-[11px] font-semibold text-zinc-200 sm:text-xs">
          {show?.isRewatch && (
            <span className="mr-1 inline-flex items-center rounded bg-emerald-500/90 px-1.5 py-0.5 text-[0.62rem] font-black uppercase tracking-wide text-black sm:text-[0.68rem]">
              Rewatch
            </span>
          )}
          {(() => {
            const parts = [];
            if (ep)
              parts.push(
                <span key="ep" className="text-white">
                  T{ep.season} · E{ep.number}
                </span>,
              );
            if (isCalendar && calendar?.countdown) {
              parts.push(
                <span key="air" className="text-white">
                  {calendar.countdown}
                </span>,
              );
            }
            if (progressLabel) parts.push(<span key="prog">{progressLabel}</span>);
            if (extras?.year) parts.push(<span key="year">{extras.year}</span>);
            if (extras?.seasons)
              parts.push(<span key="seasons">{extras.seasons}</span>);
            return parts.reduce((acc, item, index) => {
              if (index === 0) return [item];
              return [
                ...acc,
                <span
                  key={`sep-${index}`}
                  className="select-none text-[0.8em] font-bold text-zinc-500/70"
                  aria-hidden="true"
                >
                  •
                </span>,
                item,
              ];
            }, []);
          })()}
        </div>

        {/* Géneros (en español, de los detalles es-ES) + notas TMDb/IMDb.
            Hueco reservado (min-height) igual que la fila de premios: los géneros
            y las notas llegan con `extras` (tarde), así que sin reservar altura la
            fila crecía de 0 a una línea y, al estar la tarjeta centrada, daba el
            saltito. Con el hueco, el tamaño del hover ya es el final desde el inicio. */}
        <div className="mt-1.5 flex min-h-[1.1rem] flex-nowrap items-center gap-x-3 overflow-hidden text-[11px] text-zinc-200 sm:text-xs">
          {(extras?.genresEs || genres) && (
            <span className="truncate">{extras?.genresEs || genres}</span>
          )}
          {extras?.rating && (
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <NextImage
                src="/logo-TMDb.png"
                alt="TMDb"
                width={2560}
                height={1846}
                sizes="28px"
                className="h-2.5 w-auto"
                loading="lazy"
              />
              <span className="font-bold">{extras.rating.toFixed(1)}</span>
            </span>
          )}
          {typeof extras?.imdbRating === "number" && (
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <NextImage
                src="/logo-IMDb.svg"
                alt="IMDb"
                width={575}
                height={290}
                sizes="34px"
                className="h-3 w-auto"
                loading="lazy"
              />
              <span className="font-bold">{extras.imdbRating.toFixed(1)}</span>
            </span>
          )}
        </div>

        {error && (
          <p className="mt-1.5 line-clamp-1 text-[11px] text-red-400">{error}</p>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ====================================================================
 * Carrusel horizontal compartido por "Continuar viendo" y "Calendario".
 * Calendario inyecta sus series ya cargadas para reutilizar exactamente la
 * misma tarjeta, expansión, tráiler y navegación sin duplicar la interacción.
 * ==================================================================== */
function ContinueWatchingSection({
  isMobile,
  hydrated,
  externalShows = null,
  mode = "continue",
}) {
  const { authenticated, hydrated: authReady } = useAuth();
  const router = useRouter();
  // Igual que las demás filas: oculta al cargar, se revela con animación al
  // hacer scroll y entrar en la ventana.
  const revealProps = useScrollRevealProps();

  // null = cargando, [] = vacío confirmado (sin sesión / sin series en curso)
  const [shows, setShows] = useState(null);
  const hasExternalShows = Array.isArray(externalShows);
  const displayShows = hasExternalShows ? externalShows : shows;

  // Pinta al instante lo último cacheado para que NO desaparezca al recargar
  // (se refrescará en segundo plano cuando el backend confirme).
  useEffect(() => {
    if (hasExternalShows) return;
    const cached = readContinueWatchingCache();
    if (cached) setShows(cached);
  }, [hasExternalShows]);

  const swiperRef = useRef(null);
  const rowRef = useRef(null);
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
    if (
      isMobile ||
      !hydrated ||
      !Array.isArray(displayShows) ||
      displayShows.length === 0
    ) {
      return;
    }

    const visibleCount =
      Number.isFinite(perView) && perView > 0 ? Math.ceil(perView) : 6;
    const start = Math.max(0, activeIndex);
    const end = Math.min(
      displayShows.length,
      start + Math.max(6, visibleCount + PREVIEW_TRAILER_PREWARM_AHEAD),
    );

    loadYouTubeIframeApi().catch(() => {});
    displayShows.slice(start, end).forEach((show) => {
      prewarmPreviewTrailer(show?.id);
    });
  }, [activeIndex, displayShows, isMobile, hydrated, perView]);

  // Al desmontar la fila, libera cualquier embed caliente que quedara (p. ej.
  // si se navega mientras el cursor seguía dentro de la fila).
  useEffect(() => clearWarmEmbedPool, []);

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
    const prev = hoveredIdRef.current;
    if (prev && prev !== itemKey) {
      setAnimatingOutId(prev);
    } else {
      setAnimatingOutId((prevOut) => (prevOut === itemKey ? null : prevOut));
    }
    hoveredIdRef.current = itemKey;
    setHoveredId(itemKey);
    if (typeof index === "number") {
      setHoveredIndex(index);
    }
  };

  const closePreview = (itemKey) => {
    if (hoveredIdRef.current !== itemKey) return;
    hoveredIdRef.current = null;
    setAnimatingOutId(itemKey);
    setHoveredId(null);
    setHoveredIndex(null);
  };

  const prewarmVisibleTrailers = () => {
    if (
      isMobile ||
      !Array.isArray(displayShows) ||
      displayShows.length === 0
    ) {
      return;
    }
    const visibleCount =
      Number.isFinite(perView) && perView > 0 ? Math.ceil(perView) : 6;
    displayShows
      .slice(
        activeIndex,
        Math.min(
          displayShows.length,
          activeIndex + visibleCount + PREVIEW_TRAILER_PREWARM_AHEAD,
        ),
      )
      .forEach((show) => prewarmPreviewTrailer(show?.id));
  };

  const handleMouseEnterItem = (itemKey, tvId, index) => {
    if (isMobile) return;
    prewarmPreviewTrailer(tvId);
    // Calienta el embed de ESTA tarjeta y el de la siguiente (anticipando el
    // movimiento lateral del cursor), para que al expandir el trailer ya esté
    // casi listo. El pool LRU acotado evita descargar de más.
    warmPreviewTrailerEmbed(tvId);
    if (typeof index === "number" && Array.isArray(displayShows)) {
      const next = displayShows[index + 1];
      if (next?.id) warmPreviewTrailerEmbed(next.id);
    }
    clearHoverCloseTimer();
    clearHoverOpenTimer();
    openPreview(itemKey, index);
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
    if (hasExternalShows) return undefined;
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
        // SOLO progreso local de streaming: posición real de reproducción de
        // películas y episodios en curso (una tarjeta por título). NO usa el
        // progreso por episodios de Trakt (eso vive en la página "En progreso").
        const localRows = await getLocalInProgress();
        const mapped = dedupeLocalByTitle(mapLocalProgressItems(localRows));
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
  }, [authenticated, authReady, hasExternalShows]);

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
  if (!hasExternalShows && authReady && !authenticated) return null;
  if (Array.isArray(displayShows) && displayShows.length === 0) return null;

  const loading = displayShows === null;
  // Aún sin datos y sin sesión confirmada: no mostramos skeleton (evita flash
  // en usuarios sin sesión); esperamos a que llegue la caché o se autentique.
  if (!hasExternalShows && loading && !authenticated) return null;
  const hasActivePreview = !!hoveredId;
  const isHoveringFirstVisible = hoveredIndex !== null && hoveredIndex <= activeIndex;
  const isHoveringLastVisible = hoveredIndex !== null && hoveredIndex >= activeIndex + Math.floor(perView) - 1;

  const showPrev = (isHoveredRow || hasActivePreview) && canPrev && !isHoveringFirstVisible;
  const showNext = (isHoveredRow || hasActivePreview) && canNext && !isHoveringLastVisible;

  const isCalendar = mode === "calendar";
  const Header = (
    // `relative z-20` eleva la cabecera por encima del envoltorio del Swiper (cuyo
    // padding con margen negativo la solapa y se comía el clic). Pero la cabecera
    // es `pointer-events-none`: así NO intercepta tarjetas ni hovers (no se
    // "superpone" en interacción); SOLO el enlace del título reactiva el clic.
    <motion.div
      variants={scaleIn}
      className="relative z-20 mb-5 px-1 sm:px-0 pointer-events-none"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <div className="h-px w-8 bg-amber-500" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
          {isCalendar ? "PRÓXIMOS EPISODIOS" : "CONTINUAR"}
        </span>
      </div>
      {/* Mismo indicador de título que el resto de secciones del dashboard
          (ExpandableSectionTitle): flecha que aparece al pasar el cursor. El
          `pointer-events-auto` lo hace clicable aunque la cabecera no lo sea. */}
      <Link
        href={isCalendar ? "/calendar" : "/continue-watching"}
        className="group/title pointer-events-auto inline-flex w-fit items-center bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-xl font-black tracking-tighter text-transparent transition-all duration-200 hover:from-amber-100 hover:via-white hover:to-amber-200 active:scale-[0.98] active:opacity-90 sm:text-2xl md:text-3xl"
        aria-label={isCalendar ? "Ver el calendario completo" : "Ver todo lo que tienes a medias"}
      >
        <span>{isCalendar ? "Calendario" : "Continuar viendo"}</span>
        <span className="text-amber-500">.</span>
        <ChevronRight className="ml-1 h-5 w-5 translate-x-[-4px] text-amber-400 opacity-0 transition duration-200 group-hover/title:translate-x-0 group-hover/title:opacity-100 sm:h-6 sm:w-6" />
      </Link>
    </motion.div>
  );

  // Mientras se resuelve el contenido ("Continuar viendo" sin caché todavía) NO se
  // muestra nada: la sección aparece SOLO cuando hay contenido confirmado. Así no
  // se ve un skeleton que puede acabar vacío (sin sesión o sin series en curso), que
  // era el problema. En modo Calendario `displayShows` siempre es un array (nunca
  // `loading`), así que esto solo afecta a "Continuar viendo".
  if (loading) return null;

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

  const swiperKey = `${mode}-landscape-${hydrated ? "h" : "s"}-${isMobile ? "m" : "d"}`;

  return (
    <motion.div
      ref={rowRef}
      {...revealProps}
      variants={fadeInUp}
      // Cuando hay una vista previa abierta elevamos TODA la fila por encima de
      // TODO lo demás: su `z-[90]` interno solo vale dentro del contexto de
      // apilado de esta fila. Sin un z alto en la fila, las filas vecinas —tanto
      // la de abajo (posterior en el DOM) como la de arriba (p. ej. la fila
      // spotlight de "Estrenos", que crea su propio contexto de apilado)— podían
      // tapar la preview al desbordar sobre ellas. Con un z muy alto la preview
      // queda siempre superpuesta a las demás filas.
      className={`group relative ${hasActivePreview ? "z-[100]" : ""}`}
    >
      {Header}

      <div
        // Al abrir una vista previa, el carrusel sube por ENCIMA de la cabecera
        // (que va en z-20 para ser clicable): así el hover NO queda tapado por el
        // título. Sin preview activa el carrusel vuelve a z-auto y el título es
        // clicable (su hueco vacío es pointer-events-none).
        className={`relative ${hasActivePreview ? "z-30" : ""}`}
        onMouseEnter={() => {
          setIsHoveredRow(true);
          prewarmVisibleTrailers();
          // Calienta ya el embed de la primera tarjeta visible: cuando el cursor
          // llegue a ella (o a su vecina), el trailer arrancará casi al instante.
          const firstVisible = displayShows?.[Math.max(0, activeIndex)];
          if (firstVisible?.id) warmPreviewTrailerEmbed(firstVisible.id);
        }}
        onMouseLeave={() => {
          clearHoverOpenTimer();
          setIsHoveredRow(false);
          // Al salir de la fila liberamos los embeds calientes: paramos cualquier
          // reproducción de fondo y evitamos consumo innecesario.
          clearWarmEmbedPool();
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
            className={`group relative !py-14 sm:!py-16 md:!py-44 !-my-14 sm:!-my-16 md:!-my-44 ${
              isMobile ? "" : "pointer-events-none"
            }`}
            wrapperClass="flex items-center"
            breakpoints={breakpoints}
          >
            {displayShows.map((show, i) => {
              // `uid` (único por episodio) permite que una misma serie aparezca
              // varias veces en el Calendario sin colisión de keys; en el resto
              // de modos no hay `uid` y se usa el tmdbId como hasta ahora.
              const itemKey = show.uid || `${mediaTypeOf(show)}:${show.id}`;
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
              const sizeClasses = dimensionClasses;

              return (
                <SwiperSlide
                  key={itemKey}
                  className={`${isMobile ? "select-none" : "select-none pointer-events-auto"} ${
                    isActive ? "!relative !z-[100] !overflow-visible" : isAnimatingOut ? "!relative !z-[50] !overflow-visible" : "!relative !z-10"
                  }`}
                >
                  <div
                    className={`${base} ${sizeClasses} ${
                      isActive || isAnimatingOut ? "overflow-visible" : "overflow-hidden"
                    }`}
                    onMouseEnter={() => handleMouseEnterItem(itemKey, show.id, i)}
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
                            mode={mode}
                            index={i}
                            totalCount={displayShows.length}
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
                          <ContinueWatchingBaseCard show={show} mode={mode} />
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
              // El inset vertical REPLICA el padding del Swiper (py-14/16/44) para
              // que el degradado cubra solo la fila de tarjetas y no el hueco de la
              // preview (si no, sobresale por arriba y por abajo de la sección).
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
              // El inset vertical REPLICA el padding del Swiper (py-14/16/44), igual
              // que la flecha izquierda, para no sobresalir de la fila de tarjetas.
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

export default memo(ContinueWatchingSection);
