// /src/components/ContinueWatchingSection.jsx
"use client";

import { useRef, useEffect, useState, memo } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper/modules";
import { AnimatePresence, motion } from "framer-motion";
import NextImage from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
  Award,
  CalendarDays,
  ChevronRight,
  Music2,
  Loader2,
  X,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { getLocalInProgress } from "@/lib/api/progressClient";
import {
  getVideos,
  getDetails,
  markAsFavorite,
  markInWatchlist,
  resolveImdbId,
  resolveEpisodeImdbId,
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
import OptimizedImage from "@/components/OptimizedImage";
import useTrailerAutoDismiss from "@/hooks/useTrailerAutoDismiss";
import usePreviewImageHalf from "@/hooks/usePreviewImageHalf";
import { useDetailModal } from "@/components/dashboard/DetailModalProvider";
import { useDashboardHoverBackdrop } from "@/components/dashboard/DashboardHoverBackdrop";
import PreviewTrailerAudioButton, {
  usePreviewTrailerAudio,
} from "@/components/dashboard/PreviewTrailerAudioControl";
// Filas de acciones + meta/géneros + puntuaciones COMPARTIDAS con
// DetailsClient/DetailModal y con DashboardBackdropRow: misma UI de ficha rápida.
import DetailActionsRow from "@/components/details/DetailActionsRow";
import DetailsMetaGenresRow from "@/components/details/DetailsMetaGenresRow";
import { DetailsRatingsBadges } from "@/components/details/DetailsScoreboardPanel";
import EpisodeRatingsModal from "@/components/details/EpisodeRatingsModal";
import {
  traktGetItemStatus,
  traktSetRating,
} from "@/lib/api/traktClient";
import {
  buildImg,
  fetchBestWatchingBackdrop,
  fetchBestWatchingPoster,
  getArtworkPreference,
  movieBackdropCache,
  getBackdropCacheKey,
  getPreviewBackdropFallback,
  getBestTrailerCached,
  preloadImage,
  GENRES,
} from "@/lib/dashboard/media";
import { DASHBOARD_PREVIEW_CLOSE_DELAY_MS } from "@/lib/dashboard/previewTiming";
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
function formatRemainingTime(runtimeSeconds, positionSeconds) {
  if (!runtimeSeconds || !positionSeconds) return null;
  const remainingSeconds = runtimeSeconds - positionSeconds;
  if (remainingSeconds <= 0) return null;

  const remainingMinutes = Math.max(0, Math.ceil(remainingSeconds / 60));
  if (remainingMinutes < 60) {
    return `Quedan ${remainingMinutes} min`;
  }
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;
  if (mins === 0) {
    return `Quedan ${hours} h`;
  }
  return `Quedan ${hours} h ${mins} min`;
}

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
      const remainingLabel = formatRemainingTime(Number(r.runtimeSeconds), Number(r.positionSeconds));
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
        remainingLabel,
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
const PREVIEW_TRAILER_YOUTUBE_ORIGIN = "https://www.youtube-nocookie.com";

let youtubeIframeApiPromise = null;
const previewTrailerVideosCache = new Map();
const verifiedPreviewTrailerKeys = new Map();
const continueWatchingBackdropPathMemory = new Map();
const loadedContinueWatchingBackdropSrcs = new Set();
// Extras del panel ampliado (nota TMDb, nota IMDb, premios, temporadas, año) que
// no vienen en el item de "Continuar viendo": se cargan al hacer hover. En TV se
// cachean por episodio para no mezclar puntuaciones de serie y episodio.
const continueWatchingExtrasCache = new Map();

// La imagen se desvanece a transparente por abajo (como DetailModal) para fundir
// portada e info sobre el fondo uniforme de la tarjeta, sin línea de corte.
const cwBackdropFadeStyle = {
  WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
  maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
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

// Fecha de estreno del episodio del calendario, en español y de forma discreta.
// Solo se usa como respaldo cuando el item no trae `calendar.countdown`.
function formatEpisodeAirDate(airDate) {
  if (!airDate) return null;
  const d = new Date(`${airDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return airDate;
  }
}

// Carga el backdrop con el mismo criterio visual de En progreso/Completadas.
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
    const { backdrop: userBackdrop } = getArtworkPreference(show.id, type);
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
        const fallback =
          (await fetchBestWatchingBackdrop(show.id, type)) ||
          cached ||
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

function useShowPoster(show) {
  const [posterPath, setPosterPath] = useState(null);

  useEffect(() => {
    if (!show?.id) {
      setPosterPath(null);
      return undefined;
    }

    const type = mediaTypeOf(show);
    let canceled = false;
    const { poster: userPoster } = getArtworkPreference(show.id, type);
    setPosterPath(userPoster || show.poster_path || null);

    const resolvePoster = async () => {
      if (userPoster) return;

      const chosen =
        (await fetchBestWatchingPoster(show.id, type)) ||
        show.poster_path ||
        show.backdrop_path ||
        null;

      if (chosen) await preloadImage(buildImg(chosen, "w500"));
      if (!canceled) setPosterPath(chosen);
    };

    resolvePoster();

    return () => {
      canceled = true;
    };
  }, [show]);

  return posterPath;
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
            <span>
              T{ep.season}·E{ep.number}
              {show?.remainingLabel ? ` · ${show.remainingLabel}` : ""}
            </span>
          </div>
        ) : show?.remainingLabel ? (
          <div className="mb-1 flex items-center gap-1 truncate text-[11px] font-semibold text-white drop-shadow">
            <Play className="h-3 w-3 fill-current text-white shrink-0" aria-hidden="true" />
            <span>{show.remainingLabel}</span>
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
  const { openDetailModal } = useDetailModal();
  const router = useRouter();
  const mediaType = mediaTypeOf(show);
  const showId = show?.id;
  const { backdropPath, ready } = useShowBackdrop(show);
  const posterPath = useShowPoster(show);

  const isCalendar = mode === "calendar";
  const isContinuePreview = !isCalendar;
  const ep = show?.nextEpisode;
  const episodeSeason = Number(ep?.season);
  const episodeNumber = Number(ep?.number);
  const hasEpisodeRef =
    mediaType === "tv" &&
    Number.isFinite(episodeSeason) &&
    episodeSeason > 0 &&
    Number.isFinite(episodeNumber) &&
    episodeNumber > 0;
  const calendar = show?.calendar || null;
  const extrasCacheKey =
    showId == null
      ? null
      : hasEpisodeRef
        ? `${isContinuePreview ? "continue" : "calendar"}:${showId}:${episodeSeason}:${episodeNumber}`
        : `${isContinuePreview ? "continue" : "calendar"}:${showId}`;

  const [loadingStates, setLoadingStates] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  // Extras del panel ampliado: nota TMDb, nota IMDb, premios, temporadas, año,
  // estado y géneros. Se pintan al instante desde caché si ya se cargaron; si no,
  // se piden al hacer hover (cuando la tarjeta se monta) con un fundido suave.
  const [extras, setExtras] = useState(
    () =>
      (extrasCacheKey
        ? continueWatchingExtrasCache.get(extrasCacheKey)
        : null) || null,
  );

  // Tráiler: MISMO modelo que BackdropPreviewCard. Un único tráiler resuelto con
  // `getBestTrailerCached`, autoplay ~1s tras el hover y `useTrailerAutoDismiss`
  // para ocultarlo (volver al backdrop) si está restringido o no es embebible.
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const trailerIframeRef = useRef(null);
  const {
    muted: trailerMuted,
    toggle: handleToggleTrailerAudio,
    sync: syncTrailerAudio,
  } = usePreviewTrailerAudio(trailerIframeRef, { volume: 35 });

  // Hasta que `trailerPlaying` sea true, el backdrop cubre el iframe: si el vídeo
  // no está disponible, el error de YouTube nunca llega a verse.
  const { playing: trailerPlaying } = useTrailerAutoDismiss({
    open: showTrailer,
    iframeRef: trailerIframeRef,
    videoKey: trailer?.key,
    onUnavailable: () => setShowTrailer(false),
  });

  // Soundtrack (mismo mecanismo que BackdropPreviewCard/InlinePreviewCard):
  // búsqueda de la canción con preview y reproducción en un overlay interno.
  const [soundtrackTrack, setSoundtrackTrack] = useState(null);
  const [soundtrackLoading, setSoundtrackLoading] = useState(false);
  const [soundtrackPlaying, setSoundtrackPlaying] = useState(false);
  const [soundtrackOpen, setSoundtrackOpen] = useState(false);
  const [soundtrackError, setSoundtrackError] = useState("");
  const audioRef = useRef(null);
  const soundtrackAbortRef = useRef(null);

  // Estado de Trakt para el control de "visto" (<TraktWatchedControl>): conexión,
  // visto, plays y badge de progreso (%) para series.
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

  const href = nextEpisodeHref(show);
  const prefetchedRef = useRef(false);

  // Reinicio del soundtrack al cambiar de título.
  useEffect(() => {
    soundtrackAbortRef.current?.abort();
    soundtrackAbortRef.current = null;
    audioRef.current?.pause();
    setSoundtrackTrack(null);
    setSoundtrackLoading(false);
    setSoundtrackPlaying(false);
    setSoundtrackOpen(false);
    setSoundtrackError("");
  }, [show?.id]);

  // Cierre del overlay de soundtrack con Escape.
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

  // Carga de extras (nota, IMDb, premios, temporadas, año). Solo en Continuar
  // viendo las puntuaciones salen del episodio concreto; Calendario conserva el
  // diseño/datos anteriores de título.
  useEffect(() => {
    const id = showId;
    if (!id || !extrasCacheKey) return;
    const isEpisodePreview = isContinuePreview && hasEpisodeRef;
    const cached = continueWatchingExtrasCache.get(extrasCacheKey);
    if (cached) {
      setExtras({ ...cached, ratingsReady: true });
      return;
    }
    let abort = false;
    (async () => {
      // imdb_id (rápido, endpoint ligero) + nota IMDb del episodio/título se
      // resuelven en paralelo con detalles; la UI de puntuaciones se pinta
      // cuando el paquete está completo para que TMDb e IMDb aparezcan juntas.
      const imdbIdPromise = resolveImdbId(show, mediaType);
      // Nota IMDb (rápida). Para EPISODIOS: tconst del episodio (TMDB, ligero) →
      // dataset IMDb directo (rápido); si no hay tconst/nota, fallback al endpoint
      // episode-imdb (más cobertura pero más lento). Para película/título: nota del
      // título por su imdb_id.
      const imdbRatingPromise = (async () => {
        if (isEpisodePreview) {
          const epTconst = await resolveEpisodeImdbId(
            id,
            episodeSeason,
            episodeNumber,
          ).catch(() => null);
          if (epTconst) {
            const ds = await fetchImdbRatingByImdb(epTconst).catch(() => null);
            if (typeof ds?.rating === "number") return ds.rating;
          }
          // Fallback: endpoint episode-imdb (seriesgraph), con el imdb del show.
          const imdb = await imdbIdPromise;
          if (imdb) {
            const qs = new URLSearchParams({
              season: String(episodeSeason),
              episode: String(episodeNumber),
              imdbId: String(imdb),
            });
            const json = await fetch(
              `/api/tv/${id}/episode-imdb?${qs.toString()}`,
              { cache: "force-cache" },
            )
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null);
            if (typeof json?.imdb?.rating === "number") return json.imdb.rating;
          }
          return null;
        }
        const imdb = await imdbIdPromise;
        if (!imdb) return null;
        const ds = await fetchImdbRatingByImdb(imdb).catch(() => null);
        return typeof ds?.rating === "number" ? ds.rating : null;
      })();
      try {
        const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
        // Detalles de título + episodio EN PARALELO, para que todos los extras
        // aparezcan juntos y no haya un salto extra en la preview.
        const [details, epData] = await Promise.all([
          getDetails(mediaType, id, { language: "es-ES" }).catch(() => null),
          isEpisodePreview && apiKey
            ? fetch(
                `https://api.themoviedb.org/3/tv/${id}/season/${episodeSeason}/episode/${episodeNumber}?api_key=${apiKey}&language=es-ES`,
              )
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        const episodeName = epData?.name || null;
        const episodeTmdbRating =
          typeof epData?.vote_average === "number" && epData.vote_average > 0
            ? epData.vote_average
            : null;
        const titleTmdbRating =
          typeof details?.vote_average === "number" && details.vote_average > 0
            ? details.vote_average
            : null;
        const rating = isEpisodePreview ? episodeTmdbRating : titleTmdbRating;
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
        // Géneros como objetos {id,name} para <DetailsMetaGenresRow> (mismo
        // formato que DashboardBackdropRow); la fila los traduce y recorta sola.
        const genreObjects = Array.isArray(details?.genres)
          ? details.genres
              .filter((g) => g && (g.id != null || g.name))
              .map((g) => ({ id: g.id ?? g.name, name: g.name }))
          : [];
        const status = details?.status || null;
        // Premios (OMDb): reutiliza el imdb_id ya resuelto (no re-pide). La nota
        // IMDb viene de la promesa compartida y se pinta junto a TMDb al final.
        let awards = null;
        const imdb = await imdbIdPromise;
        if (imdb) {
          const omdb = await fetchOmdbByImdb(imdb).catch(() => null);
          const rawAwards = omdb?.Awards;
          if (rawAwards && typeof rawAwards === "string" && rawAwards.trim()) {
            awards = formatDashboardAwards(rawAwards);
          }
        }
        const imdbRating = await imdbRatingPromise;

        const next = {
          rating,
          imdbRating,
          awards,
          seasons,
          year,
          genresEs,
          episodeName,
          status,
          genreObjects,
          ratingsReady: true,
        };
        continueWatchingExtrasCache.set(extrasCacheKey, next);
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
            status: null,
            genreObjects: [],
            ratingsReady: true,
          });
      }
    })();
    return () => {
      abort = true;
    };
  }, [
    showId,
    show,
    mediaType,
    isContinuePreview,
    episodeSeason,
    episodeNumber,
    hasEpisodeRef,
    extrasCacheKey,
  ]);

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

  // Estado del título para acciones: Trakt aporta conexión/puntuación del
  // usuario; en "Continuar viendo" el botón de visto muestra el progreso local
  // del episodio/película actual, no el porcentaje global de una serie.
  useEffect(() => {
    const id = show?.id;
    if (!id) return undefined;
    let cancelled = false;
    const isTv = mediaType === "tv";
    const episodeProgress = clampPct(show?.pct);
    const progressBadge = !isCalendar && episodeProgress > 0
      ? `${episodeProgress}%`
      : null;

    (async () => {
      try {
        setTraktInfo((prev) => ({ ...prev, loading: true }));
        setRatingLoading(true);

        const status = await traktGetItemStatus({
          type: isTv ? "show" : "movie",
          tmdbId: id,
        });
        if (cancelled) return;

        const connected = !!status?.connected;
        const ratingValue =
          status?.rating == null || !Number.isFinite(Number(status.rating))
            ? null
            : Number(status.rating);
        setRating(ratingValue);
        setRatingLoading(false);

        setTraktInfo({
          connected: connected || !!progressBadge,
          watched: !!progressBadge || !!status?.watched,
          plays: progressBadge ? 0 : Number(status?.plays || 0),
          badge: progressBadge,
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
  }, [show?.id, show?.pct, mediaType, isCalendar]);

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
        posterPath: posterPath || show.poster_path || show.backdrop_path || null,
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
        posterPath: posterPath || show.poster_path || show.backdrop_path || null,
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

  // Puntuación optimista en Trakt (StarRating). Revierte la nota local si falla.
  const handleRatePreview = async (value) => {
    if (!traktInfo.connected) {
      requireLogin();
      return false;
    }
    if (ratingLoading || !show) return false;

    const previousRating = rating;
    const optimisticRating = value == null ? null : Number(value);

    try {
      setRatingLoading(true);
      setError("");
      setRating(optimisticRating);
      const res = await traktSetRating({
        type: mediaType === "tv" ? "show" : "movie",
        tmdbId: show.id,
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
      const t = await getBestTrailerCached(show.id, mediaType);
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

  // Autoplay del tráiler ~1s tras el hover: esta tarjeta se MONTA al hacer hover,
  // así que el temporizador al montar equivale a "poco después del hover"; el
  // cleanup lo cancela al des-hover.
  const autoTrailerRef = useRef(null);
  useEffect(() => {
    autoTrailerRef.current = {
      showTrailer,
      trailerLoading,
      play: handleToggleTrailer,
    };
  });
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
      const title = show.title || show.name || "";
      const params = new URLSearchParams({
        title,
        type: mediaType,
        country: "ES",
        tmdbId: String(show.id),
      });
      const originalTitle = show.original_title || show.original_name;
      if (originalTitle && originalTitle !== title) {
        params.set("originalTitle", originalTitle);
      }
      if (extras?.year) params.set("year", String(extras.year));

      const response = await fetch(`/api/soundtrack?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Soundtrack HTTP ${response.status}`);

      const data = await response.json();
      const track = Array.isArray(data?.tracks)
        ? data.tracks.find((entry) => entry?.previewUrl)
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
    ? buildImg(backdropPath, CONTINUE_WATCHING_BACKDROP_SIZE)
    : null;
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
  const pct = clampPct(show?.pct);
  const tmdbRating =
    typeof extras?.rating === "number" ? extras.rating.toFixed(1) : null;
  const episodeAirLabel =
    calendar?.countdown || formatEpisodeAirDate(ep?.airDate);
  const episodeTitle = ep?.title || extras?.episodeName || null;

  // Determinar la alineación horizontal de la tarjeta absoluta
  const activeIdx = typeof activeIndex === "number" ? activeIndex : 0;
  const visibleCount = Number.isFinite(perView) && perView > 0 ? perView : 6;
  const isLeftBoundary = index === activeIdx || index === 0;
  const isRightBoundary =
    index === activeIdx + visibleCount - 1 || index === totalCount - 1;

  // Preview anclada por la IMAGEN (igual que las filas backdrop): el panel va con
  // top:50% y marginTop=-½ alto de imagen, así el CENTRO del backdrop cae sobre el
  // centro de la tarjeta base y la escala crece desde ese mismo centro.
  const [previewRef, previewImgHalf] = usePreviewImageHalf(true);

  let alignmentClass = "left-1/2 -translate-x-1/2";
  let originX = "center";

  if (isLeftBoundary) {
    alignmentClass = "left-0";
    originX = "left";
  } else if (isRightBoundary) {
    alignmentClass = "right-0";
    originX = "right";
  }
  const transformOrigin = `${originX} ${previewImgHalf}px`;

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
    <>
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
      ref={previewRef}
      // El ancho se calcula según las tarjetas visibles del breakpoint activo:
      // menos tarjetas permiten una preview mayor; con 6 se contiene mejor.
      className={`absolute top-1/2 ${alignmentClass} rounded-xl text-white cursor-pointer bg-[#141414]/95 backdrop-blur-xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 z-50 flex flex-col overflow-hidden`}
      onClick={() => openDetailModal?.(show)}
      onMouseEnter={(event) => {
        onPreviewMouseEnter?.(event);
        prefetchHref();
      }}
      onMouseLeave={onPreviewMouseLeave}
      onFocus={prefetchHref}
      style={{
        width: previewMaxWidth,
        marginTop: -previewImgHalf,
        willChange: "transform, opacity",
        transformOrigin,
      }}
    >
      {/* Backdrop de 16:9 (+ tráiler al reproducir) */}
      <div className="relative w-full aspect-video overflow-hidden bg-transparent">
        {!showTrailer && !ready && (
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
            className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-300 ${
              showTrailer ? "z-[5]" : ""
            } ${showTrailer && trailerPlaying ? "opacity-0" : "opacity-100"}`}
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
                  title={`Trailer - ${show?.title || ""}`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen={false}
                  onLoad={syncTrailerAudio}
                />
                {trailerPlaying && (
                  <PreviewTrailerAudioButton
                    muted={trailerMuted}
                    onToggle={handleToggleTrailerAudio}
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* Estado de la tarjeta superpuesto al pie del backdrop */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-b from-transparent via-black/45 to-transparent" />
        {isCalendar ? (
          // La fecha/cuenta atrás NO se repite sobre la portada: ya se muestra
          // abajo en el panel (línea de episodio). Aquí solo se conserva el badge
          // "Estreno" para los estrenos (S1E1).
          calendar?.isPremiere ? (
            <div className="absolute inset-x-3 bottom-2 z-10">
              <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-black">
                Estreno
              </span>
            </div>
          ) : null
        ) : (
          // Barra de progreso de "Continuar viendo": se conserva sobre el pie del
          // backdrop (aunque haya tráiler) para no perder la referencia visual.
          <div className="absolute inset-x-3 bottom-2 z-10">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Panel de info (mismo lenguaje visual que BackdropPreviewCard):
          [Continuar] reproducir episodio + progreso · acciones compartidas · meta/géneros · premios ·
          [Calendario] línea de episodio · meta/géneros · puntuaciones. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.25, ease: "easeOut" }}
        className="w-full bg-transparent px-4 py-3.5 sm:px-5 sm:py-4"
      >
        {/* Fila de acciones COMPARTIDA con DetailsClient/DetailModal y las demás
            previews (UN solo layout, como pediste). Calendario: píldora de tráiler.
            Continuar viendo: en el MISMO slot, píldora "Reproducir T·E" que reanuda
            el episodio/película, y el botón de visionado muestra el PROGRESO de ese
            episodio/película concreto. Corta la propagación al onClick de la card. */}
        <div className="mb-3" onClick={(e) => e.stopPropagation()}>
          <DetailActionsRow
            onTrailer={isCalendar ? handleToggleTrailer : undefined}
            trailerAvailable={isCalendar}
            trailerLoading={isCalendar ? trailerLoading : false}
            trailerLabel={isCalendar ? "Ver tráiler" : null}
            trailerPlaying={isCalendar && showTrailer}
            play={
              isCalendar
                ? undefined
                : {
                    label: ep
                      ? `Reproducir T${ep.season}·E${ep.number}`
                      : "Reproducir",
                    onPlay: handleContinue,
                    title: ep
                      ? `Reproducir T${ep.season} E${ep.number}`
                      : "Reproducir",
                  }
            }
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
              // Continuar viendo: el botón de visionado refleja el PROGRESO del
              // episodio/película en curso (no el % de la serie en Trakt).
              progressOverride:
                !isCalendar && pct > 0 ? `${pct}%` : undefined,
              busy: false,
              loading: traktInfo.loading,
              onOpen: (e) => {
                e?.stopPropagation?.();
                openDetailModal?.(show);
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

        {/* Calendario: LÍNEA DE EPISODIO justo encima de la fila meta.
            Formato: T{season}·E{number} · {nombre episodio} · {fecha/cuenta atrás}.
            Estilo discreto (como la línea de premios). */}
        {isCalendar && ep && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300 sm:text-xs">
            <CalendarDays
              className="h-3.5 w-3.5 shrink-0 text-amber-300"
              aria-hidden="true"
            />
            <span className="line-clamp-1">
              <span className="text-amber-300">
                T{ep.season}·E{ep.number}
              </span>
              {episodeTitle ? ` · ${episodeTitle}` : ""}
              {episodeAirLabel ? ` · ${episodeAirLabel}` : ""}
            </span>
          </div>
        )}

        {/* Fila meta + géneros COMPARTIDA con DetailModal/DetailsClient:
            año · duración/temporadas · estado · géneros (mismo componente). */}
        <DetailsMetaGenresRow
          yearIso={extras?.year || ""}
          displayRuntimeValue={extras?.seasons || null}
          status={extras?.status || null}
          genres={extras?.genreObjects || EMPTY_ARRAY}
        />

        {/* Premios (OMDb) — se muestran debajo de la fila meta para mantener el
            mismo orden visual en todas las vistas previas. En Calendario NO se
            muestra: la línea de episodio/fecha ocupa su lugar. */}
        {!isCalendar && (
          <div className="mt-1.5 mb-1.5 flex min-h-[1.1rem] items-center gap-2 text-[11px] font-bold text-emerald-300 drop-shadow-md sm:text-xs">
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
        )}

        {/* Puntuaciones TMDb · IMDb con el MISMO componente compartido. */}
        {extras?.ratingsReady && (
          <DetailsRatingsBadges
            tmdb={tmdbRating ? { value: tmdbRating, sub: null } : null}
            imdb={
              typeof extras?.imdbRating === "number"
                ? { value: extras.imdbRating.toFixed(1), sub: null }
                : null
            }
          />
        )}

        {error && (
          <p className="mt-1.5 line-clamp-1 text-[11px] text-red-400">{error}</p>
        )}
      </motion.div>

      {/* Overlay de soundtrack (mismo diseño que BackdropPreviewCard): se pinta
          dentro de la propia tarjeta y corta la propagación de clics. */}
      <AnimatePresence>
        {soundtrackOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-[inherit] p-4"
            role="dialog"
            aria-label={`Soundtrack de ${show?.title || ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            {bgSrc && (
              <NextImage
                src={bgSrc}
                alt=""
                aria-hidden="true"
                fill
                sizes={previewImageSizes}
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
                      {show?.title || ""}
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
                        soundtrackPlaying ? "Pausar canción" : "Reproducir canción"
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

    {/* Valoración de episodios (solo series) — mismo modal que la ficha completa
        y DetailModal. Fuera del área clicable de la card. */}
    {mediaType === "tv" && (
      <EpisodeRatingsModal
        open={episodeRatingsOpen}
        onClose={() => setEpisodeRatingsOpen(false)}
        showId={Number(show.id)}
        title={show?.title || ""}
      />
    )}
    </>
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
  const { openDetailModal } = useDetailModal();
  const { showHoverBackdrop, clearHoverBackdrop, prewarmHoverBackdrop } =
    useDashboardHoverBackdrop();
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
      clearHoverBackdrop();
    };
  }, [clearHoverBackdrop]);

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
    const show = displayShows?.[index];
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
    showHoverBackdrop(show);
  };

  const closePreview = (itemKey) => {
    if (hoveredIdRef.current !== itemKey) return;
    const show = Array.isArray(displayShows)
      ? displayShows.find((entry) => (entry.uid || `${mediaTypeOf(entry)}:${entry.id}`) === itemKey)
      : null;
    hoveredIdRef.current = null;
    setAnimatingOutId(itemKey);
    setHoveredId(null);
    setHoveredIndex(null);
    clearHoverBackdrop(show);
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
    prewarmHoverBackdrop(displayShows?.[index]);
    openPreview(itemKey, index);
  };

  const handleMouseLeaveItem = (itemKey) => {
    if (isMobile) return;
    clearHoverOpenTimer();
    clearHoverCloseTimer();
    hoverCloseTimeoutRef.current = window.setTimeout(() => {
      closePreview(itemKey);
    }, DASHBOARD_PREVIEW_CLOSE_DELAY_MS);
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
          clearHoverBackdrop();
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
            // la vista previa NUNCA se recorte (el truco padding + -margin no
            // altera la altura de fila). Es ASIMÉTRICO: más abajo que arriba,
            // porque el preview se centra por su IMAGEN sobre la tarjeta y el
            // panel de info crece hacia abajo; y el fondo es algo mayor que en
            // las filas backdrop porque aquí el panel lleva la fila
            // Reanudar+progreso extra. `pointer-events-none` en el Swiper hace
            // que ese padding transparente sea atravesable: así no roba el
            // hover/clic a las filas vecinas; las tarjetas reactivan los eventos
            // (pointer-events es heredado y el arrastre sigue funcionando por
            // propagación desde la tarjeta).
            className={`group relative !pt-14 sm:!pt-16 md:!pt-44 !pb-44 sm:!pb-56 md:!pb-80 !-mt-14 sm:!-mt-16 md:!-mt-44 !-mb-44 sm:!-mb-56 md:!-mb-80 ${
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
                            onClick={() => openDetailModal?.(show)}
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
              // Inset vertical ASIMÉTRICO = padding real del Swiper (top=pt,
              // bottom=pb) para que la flecha quede CENTRADA sobre la tarjeta base
              // (no sobre el hueco de la preview). `-left-6` sangra el degradado
              // 24px (= sm:px-6 de la página) hasta el borde lateral, sin hueco.
              className="absolute -left-6 top-14 bottom-44 z-30 hidden w-32 items-center justify-start bg-gradient-to-r from-black/90 via-black/70 to-transparent transition-all duration-300 hover:from-black/95 hover:via-black/80 sm:top-16 sm:bottom-56 sm:flex md:top-44 md:bottom-80 group/nav"
            >
              <motion.span
                className="ml-12 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] transition-transform group-hover/nav:scale-110"
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
              // Inset vertical ASIMÉTRICO = padding real del Swiper (top=pt,
              // bottom=pb), igual que la flecha izquierda: centra sobre la tarjeta
              // base. `-right-6` sangra el degradado hasta el borde lateral.
              className="absolute -right-6 top-14 bottom-44 z-30 hidden w-32 items-center justify-end bg-gradient-to-l from-black/90 via-black/70 to-transparent transition-all duration-300 hover:from-black/95 hover:via-black/80 sm:top-16 sm:bottom-56 sm:flex md:top-44 md:bottom-80 group/nav"
            >
              <motion.span
                className="mr-12 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] transition-transform group-hover/nav:scale-110"
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
