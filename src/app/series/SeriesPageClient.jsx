// /src/app/series/SeriesPageClient.jsx
"use client";

import OptimizedImage from "@/components/OptimizedImage";
import FeaturedHero from "@/components/FeaturedHero";
import { useRef, useEffect, useMemo, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper/modules";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import {
  useScrollRevealProps,
  useTopResetRevealProps,
} from "@/lib/hooks/useHasScrolled";
import { deriveSectionLabel } from "@/lib/dashboard/sectionLabel";
import { usePersonalizedFeatured } from "@/lib/dashboard/featuredPersonalize";
import "swiper/swiper-bundle.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Heart,
  BookmarkPlus,
  Play,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

import {
  markAsFavorite,
  markInWatchlist,
  getDetails,
  getExternalIds,
} from "@/lib/api/tmdb";
import { getBackendItemStatus } from "@/lib/api/itemStatus";
import { useEngineRows } from "@/components/dashboard/useEngineRows";
import { fetchBestBackdropNoLang, fetchBestLogo } from "@/lib/dashboard/media";
import DashboardSpotlightPreview from "@/components/dashboard/DashboardSpotlightPreview";

import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import { formatDashboardAwards } from "@/lib/details/awardsText";
import LiquidButton from "@/components/LiquidButton";

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
    y: 0,
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

const INITIAL_VISIBLE_ROWS = 6;
const ROW_REVEAL_BATCH_SIZE = 4;
const EMPTY_ARRAY = [];

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

/* ---------- helpers ---------- */
const yearOf = (m) =>
  m?.first_air_date?.slice(0, 4) || m?.release_date?.slice(0, 4) || "";

const ratingOf = (m) =>
  typeof m?.vote_average === "number" && m.vote_average > 0
    ? m.vote_average.toFixed(1)
    : "–";

const formatRuntime = (mins) => {
  if (!mins || typeof mins !== "number") return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};

const buildImg = (path, size = "original") =>
  `https://image.tmdb.org/t/p/${size}${path}`;

const PREVIEW_BACKDROP_SIZE = "w780";

const getPreviewBackdropFallback = (show) =>
  show?.backdrop_path || show?.poster_path || null;

const dashboardPreviewCardClass = (heightClass, isSpotlight = false) =>
  [
    "relative isolate overflow-hidden rounded-lg text-white cursor-pointer transform-gpu",
    isSpotlight
      ? "bg-neutral-950 ring-1 ring-inset ring-white/10 shadow-[0_24px_64px_-18px_rgba(0,0,0,0.95)]"
      : "grid grid-rows-[76%_24%] bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-[50px] shadow-[0_15px_40px_-10px_rgba(0,0,0,0.8)]",
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

const TV_GENRES = {
  10759: "Acción y aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familia",
  10762: "Infantil",
  9648: "Misterio",
  10763: "Noticias",
  10764: "Reality",
  10765: "Ciencia ficción y fantasía",
  10766: "Telenovela",
  10767: "Talk show",
  10768: "Bélica y política",
  37: "Western",
};

/* --------- Precargar imagen --------- */
const imagePreloadCache = new Map();

function preloadImage(src) {
  if (!src) return Promise.resolve(false);
  if (imagePreloadCache.has(src)) return imagePreloadCache.get(src);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = async () => {
      try {
        if (typeof img.decode === "function") await img.decode();
      } catch {}
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = src;
  });
  imagePreloadCache.set(src, promise);
  return promise;
}

/* =================== CACHÉS COMPARTIDOS (CLIENTE TV) =================== */
const tvExtrasCache = new Map(); // show.id -> { runtime, awards, imdbRating }
const tvBackdropCache = new Map(); // show.id -> backdrop file_path | null | undefined
const tvSpotlightBackdropCache = new Map();
const tvImagesCache = new Map(); // show.id -> { posters, backdrops }

/* =================== TRAILERS (TMDb videos - TV) =================== */
const tvTrailerCache = new Map(); // showId -> { key, site, type } | null
const tvTrailerInFlight = new Map(); // showId -> Promise

function pickBestTrailer(videos) {
  if (!Array.isArray(videos) || videos.length === 0) return null;

  const yt = videos.filter((v) => v?.site === "YouTube" && v?.key);
  if (!yt.length) return null;

  const preferredLang = yt.filter(
    (v) =>
      v?.iso_639_1 === "en" || v?.iso_3166_1 === "US" || v?.iso_3166_1 === "GB",
  );

  const pool = preferredLang.length ? preferredLang : yt;
  const trailers = pool.filter((v) => v?.type === "Trailer");
  const teasers = pool.filter((v) => v?.type === "Teaser");
  const candidates = trailers.length
    ? trailers
    : teasers.length
      ? teasers
      : pool;

  const score = (v) => {
    const official = v?.official ? 100 : 0;
    const typeScore =
      v?.type === "Trailer" ? 50 : v?.type === "Teaser" ? 20 : 0;
    const size = typeof v?.size === "number" ? v.size : 0;
    return official + typeScore + size;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0] || null;
}

async function fetchBestTrailerTV(showId) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    if (!apiKey || !showId) return null;

    const url =
      `https://api.themoviedb.org/3/tv/${showId}/videos` +
      `?api_key=${apiKey}&language=en-US`;

    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return null;

    const j = await r.json();
    const results = Array.isArray(j?.results) ? j.results : [];
    const best = pickBestTrailer(results);

    if (!best?.key) return null;
    return { key: best.key, site: best.site, type: best.type };
  } catch {
    return null;
  }
}

async function getBestTrailerCachedTV(showId) {
  if (tvTrailerCache.has(showId)) return tvTrailerCache.get(showId);
  if (tvTrailerInFlight.has(showId)) return tvTrailerInFlight.get(showId);

  const p = (async () => {
    const t = await fetchBestTrailerTV(showId);
    tvTrailerCache.set(showId, t || null);
    tvTrailerInFlight.delete(showId);
    return t || null;
  })();

  tvTrailerInFlight.set(showId, p);
  return p;
}

/* ======== Preferencias de artwork guardadas en localStorage (TV) ======== */
function getTVArtworkPreference(showId) {
  if (typeof window === "undefined") {
    return { poster: null, backdrop: null, background: null };
  }
  const base = `showverse:tv:${showId}`;
  const poster = window.localStorage.getItem(`${base}:poster`);
  const backdrop = window.localStorage.getItem(`${base}:backdrop`);
  const background = window.localStorage.getItem(`${base}:background`);
  return {
    poster: poster || null,
    backdrop: backdrop || null,
    background: background || null,
  };
}

/* ========= Fetch genérico de imágenes TV desde TMDb ========= */
async function getShowImages(showId) {
  if (tvImagesCache.has(showId)) return tvImagesCache.get(showId);

  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey || !showId) {
    const fallback = { posters: [], backdrops: [] };
    tvImagesCache.set(showId, fallback);
    return fallback;
  }

  try {
    // No limitamos idiomas aqui: el selector prioriza ingles y solo cae a
    // backdrops sin idioma como ultimo recurso.
    const url =
      `https://api.themoviedb.org/3/tv/${showId}/images` + `?api_key=${apiKey}`;

    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) throw new Error("TMDb TV images error");

    const j = await r.json();
    const data = {
      posters: Array.isArray(j?.posters) ? j.posters : [],
      backdrops: Array.isArray(j?.backdrops) ? j.backdrops : [],
    };

    tvImagesCache.set(showId, data);
    return data;
  } catch {
    const fallback = { posters: [], backdrops: [] };
    tvImagesCache.set(showId, fallback);
    return fallback;
  }
}

/* ====================================================================
 * LOGICA IMAGENES (Backdrops / Posters)
 * ==================================================================== */
function pickBestBackdropByLangResVotes(list, opts = {}) {
  const {
    preferLangs = ["en", "en-US"],
    minWidth = 1200,
    offset = 0,
    includeNoLanguage = true,
  } = opts;

  if (!Array.isArray(list) || list.length === 0) return null;

  // Normaliza 'en-US' -> 'en'
  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean));
  const isPreferredLang = (img) => preferSet.has(norm(img?.iso_639_1));
  const hasNoLanguage = (img) => !norm(img?.iso_639_1);

  const preferred = list.filter(isPreferredLang);
  const withLanguage = list.filter(
    (img) => norm(img?.iso_639_1) && !isPreferredLang(img),
  );
  const noLanguage = list.filter(hasNoLanguage);

  const pickFrom = (pool) => {
    if (!pool.length) return null;

    const sizeFiltered =
      minWidth > 0 ? pool.filter((b) => (b?.width || 0) >= minWidth) : pool;
    const candidates = (sizeFiltered.length ? sizeFiltered : pool).slice(0, 3);
    if (!candidates.length) return null;

    const preferredSizes = [
      [1920, 1080],
      [1712, 964],
      [3840, 2160],
    ];
    const ordered = [];
    for (const [width, height] of preferredSizes) {
      const match = candidates.find(
        (b) => (b?.width || 0) === width && (b?.height || 0) === height,
      );
      if (match && !ordered.includes(match)) ordered.push(match);
    }
    for (const candidate of candidates) {
      if (!ordered.includes(candidate)) ordered.push(candidate);
    }

    return ordered[Math.min(Math.max(0, offset), ordered.length - 1)] || null;
  };

  // Mismo criterio que MainDashboard: ingles -> cualquier idioma -> sin idioma.
  return (
    pickFrom(preferred) ||
    pickFrom(withLanguage) ||
    (includeNoLanguage ? pickFrom(noLanguage) : null)
  );
}

function pickBestPosterByLangThenResolution(list, opts = {}) {
  const { preferLangs = ["en", "en-US"], minWidth = 500 } = opts;
  if (!Array.isArray(list) || list.length === 0) return null;

  const area = (img) => (img?.width || 0) * (img?.height || 0);
  const lang = (img) => img?.iso_639_1 || null;

  const sizeFiltered =
    minWidth > 0 ? list.filter((p) => (p?.width || 0) >= minWidth) : list;
  const pool0 = sizeFiltered.length ? sizeFiltered : list;

  const hasPreferred = pool0.some((p) => preferLangs.includes(lang(p)));
  const pool1 = hasPreferred
    ? pool0.filter((p) => preferLangs.includes(lang(p)))
    : pool0;

  let maxArea = 0;
  for (const p of pool1) maxArea = Math.max(maxArea, area(p));

  for (const p of pool1) {
    if (area(p) === maxArea) return p;
  }
  return null;
}

/* ========= Poster preferido TV ========= */
async function fetchBestTVPoster(showId) {
  const { posters } = await getShowImages(showId);
  if (!Array.isArray(posters) || posters.length === 0) return null;

  const best = pickBestPosterByLangThenResolution(posters, {
    preferLangs: ["en", "en-US"],
    minWidth: 500,
  });

  return best?.file_path || null;
}

/* ========= Backdrop preferido TV ========= */
async function fetchBestTVBackdrop(showId, opts = {}) {
  const { backdrops } = await getShowImages(showId);
  if (!Array.isArray(backdrops) || backdrops.length === 0) return null;

  const best = pickBestBackdropByLangResVotes(backdrops, {
    preferLangs: ["en", "en-US"],
    resolutionWindow: 0.98,
    minWidth: 1200,
    ...opts,
  });

  return best?.file_path || null;
}

async function preparePreviewBackdrop(show) {
  if (!show?.id) return null;

  let backdropPath = tvBackdropCache.get(show.id);

  if (backdropPath === undefined) {
    try {
      backdropPath =
        (await fetchBestTVBackdrop(show.id)) ||
        getPreviewBackdropFallback(show);
    } catch {
      backdropPath = getPreviewBackdropFallback(show);
    }

    tvBackdropCache.set(show.id, backdropPath);
  }

  if (backdropPath) {
    await preloadImage(buildImg(backdropPath, PREVIEW_BACKDROP_SIZE));
  }

  return backdropPath || null;
}

/* ====================================================================
 * Poster TV (igual que MainDashboard/Movies):
 * - <md: contain + blur
 * - >=md: cover
 * ==================================================================== */
function PosterImage({ show, cache }) {
  const initialPosterPath = show?.poster_path || show?.backdrop_path || null;
  const [posterPath, setPosterPath] = useState(initialPosterPath);
  const [ready, setReady] = useState(!!initialPosterPath);

  useEffect(() => {
    let abort = false;

    const resolvePoster = async () => {
      if (!show) return;

      const basePoster = show.poster_path || show.backdrop_path || null;
      setPosterPath(basePoster);
      setReady(!!basePoster);

      // 1) Preferencia usuario
      const { poster: userPoster } = getTVArtworkPreference(show.id);
      if (userPoster) {
        if (!abort) {
          cache.current.set(show.id, userPoster);
          setPosterPath(userPoster);
          setReady(true);
        }
        return;
      }

      // 2) Cache memoria
      const cached = cache.current.get(show.id);
      if (cached) {
        if (!abort) {
          setPosterPath(cached);
          setReady(true);
        }
        return;
      }

      // 3) Usar primero el poster ya presente para no bloquear la primera pintura
      if (basePoster) {
        if (!abort) {
          setPosterPath(basePoster);
          setReady(true);
        }
      }

      // 4) Buscar el poster preferido en inglés; el base solo actúa como placeholder.
      if (!basePoster) setReady(false);
      const preferred = await fetchBestTVPoster(show.id);
      const chosen = preferred || basePoster || null;

      if (!abort) {
        cache.current.set(show.id, chosen);
        setPosterPath(chosen);
        setReady(!!chosen);
      }
    };

    resolvePoster();
    return () => {
      abort = true;
    };
  }, [show, cache]);

  if (!ready || !posterPath) {
    return (
      <div className="w-full h-full aspect-[2/3] rounded-lg bg-neutral-800/60" />
    );
  }

  return (
    <>
      {/* Tablet/desktop */}
      <OptimizedImage
        src={buildImg(posterPath, "w342")}
        alt={show.name || show.title}
        // CAMBIO: rounded-3xl -> rounded-lg
        className="hidden md:block w-full h-full object-cover rounded-lg"
        loading="lazy"
        decoding="async"
      />

      {/* Mobile: contain + blur */}
      {/* CAMBIO: rounded-3xl -> rounded-lg */}
      <div className="relative w-full h-full rounded-lg overflow-hidden bg-neutral-900 md:hidden">
        <OptimizedImage
          src={buildImg(posterPath, "w342")}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-xl opacity-35 scale-110"
          loading="lazy"
          decoding="async"
        />
        <OptimizedImage
          src={buildImg(posterPath, "w342")}
          alt={show.name || show.title}
          className="absolute inset-0 w-full h-full object-contain"
          loading="lazy"
          decoding="async"
        />
      </div>
    </>
  );
}

/* ====================================================================
 * TOP 10: Backdrop completo + número opcional para móvil.
 * ==================================================================== */
function Top10MobileBackdropCardTV({
  show,
  rank,
  showRank = true,
  frameClassName = "rounded-3xl aspect-[16/9]",
  imageClassName = "object-contain",
}) {
  const [backdropPath, setBackdropPath] = useState(null);
  const [extraBackdropPath, setExtraBackdropPath] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;

    const load = async () => {
      if (!show?.id) return;
      if (!abort) setExtraBackdropPath(null);

      const revealBackdrop = (path) => {
        if (abort) return;
        setBackdropPath(path || null);
        setReady(!!path);
      };

      const revealExtraBackdrop = async (path, primaryPath) => {
        if (!path || path === primaryPath) {
          if (!abort) setExtraBackdropPath(null);
          return;
        }
        await preloadImage(buildImg(path, "w780"));
        if (!abort) setExtraBackdropPath(path);
      };

      const { backdrop: userBackdrop } = getTVArtworkPreference(show.id);
      if (userBackdrop) {
        tvBackdropCache.set(show.id, userBackdrop);
        revealBackdrop(userBackdrop);
        fetchBestTVBackdrop(show.id, { offset: 1 })
          .then((extra) => revealExtraBackdrop(extra, userBackdrop))
          .catch(() => {});
        return;
      }

      const cached = tvBackdropCache.get(show.id);
      if (cached !== undefined) {
        revealBackdrop(cached);
        fetchBestTVBackdrop(show.id, { offset: 1 })
          .then((extra) => revealExtraBackdrop(extra, cached))
          .catch(() => {});
        return;
      }

      try {
        const preferred = await fetchBestTVBackdrop(show.id);
        const chosen = preferred || getPreviewBackdropFallback(show);
        tvBackdropCache.set(show.id, chosen);
        revealBackdrop(chosen);
        const extra = await fetchBestTVBackdrop(show.id, { offset: 1 });
        await revealExtraBackdrop(extra, chosen);
      } catch {
        const fallback = getPreviewBackdropFallback(show);
        tvBackdropCache.set(show.id, fallback);
        revealBackdrop(fallback);
        setExtraBackdropPath(null);
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [show]);

  const href = `/details/tv/${show.id}`;
  const src = backdropPath ? buildImg(backdropPath, "w1280") : null;
  const extraSrc = extraBackdropPath
    ? buildImg(extraBackdropPath, "w1280")
    : null;

  return (
    <Link href={href} prefetch={false} className="block w-full h-full">
      <div
        className={`group/top10 relative w-full overflow-hidden bg-neutral-900 ${frameClassName}`}
      >
        {!ready && <div className="absolute inset-0 bg-neutral-900" />}

        {ready && src && (
          <>
            <OptimizedImage
              src={buildImg(backdropPath, "w780")}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-35 scale-110"
              loading="lazy"
              decoding="async"
            />
            <OptimizedImage
              src={src}
              alt={show.name || show.title}
              className={`absolute inset-0 h-full w-full transition-[opacity,transform] duration-700 ease-out group-hover/top10:scale-[1.025] ${
                extraSrc ? "group-hover/top10:opacity-0" : ""
              } motion-reduce:transition-none ${imageClassName}`}
              priority={rank === 1}
              decoding="async"
            />
            {extraSrc && (
              <OptimizedImage
                src={extraSrc}
                alt=""
                aria-hidden="true"
                className={`absolute inset-0 h-full w-full opacity-0 transition-[opacity,transform] duration-700 ease-out group-hover/top10:scale-[1.025] group-hover/top10:opacity-100 motion-reduce:transition-none ${imageClassName}`}
                loading="lazy"
                decoding="async"
              />
            )}
          </>
        )}

        {showRank && (
          <div className="absolute left-4 bottom-3 z-10 select-none">
            <div
              className="font-black leading-none text-[72px]
                bg-gradient-to-b from-blue-900/50 via-blue-600/35 to-blue-400/25
                bg-clip-text text-transparent
                drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              {rank}
            </div>
          </div>
        )}

        {showRank && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        )}
      </div>
    </Link>
  );
}

/* ====================================================================
 * Vista previa inline tipo Amazon (backdrop horizontal) para TV + TRAILER
 * ==================================================================== */
function InlinePreviewCard({ show, heightClass, isSpotlight = false }) {
  const { session, account } = useAuth();
  const router = useRouter();

  const [extras, setExtras] = useState({
    runtime: null,
    awards: null,
    imdbRating: null,
    overview: null,
  });
  const [backdropPath, setBackdropPath] = useState(null);
  const [backdropReady, setBackdropReady] = useState(false);
  const [logoPath, setLogoPath] = useState(null);

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
  }, [show?.id]);

  useEffect(() => {
    let cancelled = false;
    setLogoPath(null);
    if (!isSpotlight || !show?.id) return;

    fetchBestLogo(show.id, "tv", ["en", "es", null])
      .then((path) => {
        if (!cancelled) setLogoPath(path || null);
      })
      .catch(() => {
        if (!cancelled) setLogoPath(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isSpotlight, show?.id]);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!show || !session || !account?.id) {
        setFavorite(false);
        setWatchlist(false);
        return;
      }
      try {
        setLoadingStates(true);
        const type = show.media_type || "tv";
        const st = await getBackendItemStatus({ type, tmdbId: show.id });
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
  }, [show, session, account]);

  useEffect(() => {
    let abort = false;
    if (!show) return;

    const loadAll = async () => {
      const revealBackdrop = (path) => {
        if (abort) return;
        setBackdropPath(path);
        setBackdropReady(!!path);
      };

      if (isSpotlight) {
        const cachedBackdrop = tvSpotlightBackdropCache.get(show.id);
        if (cachedBackdrop !== undefined) {
          revealBackdrop(cachedBackdrop);
        } else {
          try {
            const chosen = await fetchBestBackdropNoLang(show.id, "tv", {
              allowLanguageFallback: false,
            });
            tvSpotlightBackdropCache.set(show.id, chosen);
            revealBackdrop(chosen);
          } catch {
            tvSpotlightBackdropCache.set(show.id, null);
            revealBackdrop(null);
          }
        }
      } else {
        const { backdrop: userBackdrop } = getTVArtworkPreference(show.id);
        const userPreferredBackdrop = userBackdrop || null;

        if (userPreferredBackdrop) {
          tvBackdropCache.set(show.id, userPreferredBackdrop);
          revealBackdrop(userPreferredBackdrop);
        } else {
          const cachedBackdrop = tvBackdropCache.get(show.id);
          if (cachedBackdrop !== undefined) {
            revealBackdrop(cachedBackdrop);
          } else {
            try {
              const preferred = await fetchBestTVBackdrop(show.id);
              const chosen = preferred || getPreviewBackdropFallback(show);

              tvBackdropCache.set(show.id, chosen);

              revealBackdrop(chosen);
            } catch {
              const fallback = getPreviewBackdropFallback(show);
              tvBackdropCache.set(show.id, fallback);
              revealBackdrop(fallback);
            }
          }
        }
      }

      const cachedExtras = tvExtrasCache.get(show.id);
      if (cachedExtras) {
        if (!abort) setExtras(cachedExtras);
      } else {
        try {
          let runtime = null;
          let overview = null;
          try {
            const details = await getDetails("tv", show.id, {
              language: "es-ES",
            });
            runtime = details?.episode_run_time?.[0] ?? null;
            overview =
              (typeof details?.overview === "string" &&
                details.overview.trim()) ||
              null;
          } catch {}

          let awards = null;
          let imdbRating = null;
          try {
            let imdb = show?.imdb_id;
            if (!imdb) {
              const ext = await getExternalIds("tv", show.id);
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

          const next = { runtime, awards, imdbRating, overview };
          tvExtrasCache.set(show.id, next);
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
  }, [isSpotlight, show]);

  const href = `/details/tv/${show.id}`;

  const prefetchHref = () => {
    // Prefetch de RUTA (RSC) bajo intención real (hover / focus / touch). Se
    // elimina el fetch(href) de la página completa para no duplicar peticiones
    // y transferencia en Vercel; router.prefetch basta para navegación rápida.
    router.prefetch(href);
  };

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
    if (requireLogin() || updating || !show) return;
    try {
      setUpdating(true);
      setError("");
      const next = !favorite;
      setFavorite(next);
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type: show.media_type || "tv",
        mediaId: show.id,
        favorite: next,
        title: show.name || show.title,
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
        type: show.media_type || "tv",
        mediaId: show.id,
        watchlist: next,
        title: show.name || show.title,
        posterPath: show.poster_path || show.backdrop_path || null,
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

      const t = await getBestTrailerCachedTV(show.id);

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
  const logoSrc = logoPath ? buildImg(logoPath, "w500") : null;
  const tmdbRating = ratingOf(show);
  const hasTmdbRating = tmdbRating !== "–";

  const genres = (() => {
    const ids =
      show.genre_ids ||
      (Array.isArray(show.genres) ? show.genres.map((g) => g.id) : []);
    const names = ids.map((id) => TV_GENRES[id]).filter(Boolean);
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

  const previewBtnClass =
    "!h-9 !w-9 sm:!h-10 sm:!w-10 [&_svg]:!h-5 [&_svg]:!w-5";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={dashboardPreviewCardClass(heightClass, isSpotlight)}
      onClick={navigateToDetails}
      onMouseEnter={prefetchHref}
      onFocus={prefetchHref}
      onTouchStart={prefetchHref}
    >
      <div
        className={
          isSpotlight
            ? "absolute inset-0 h-full w-full overflow-hidden bg-neutral-950"
            : dashboardPreviewMediaClass
        }
      >
        {!showTrailer && !backdropReady && (
          <div className="absolute inset-0 bg-neutral-900" />
        )}

        {!showTrailer && bgSrc && (
          <OptimizedImage
            key={bgSrc}
            src={bgSrc}
            alt={show.name || show.title}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
              isSpotlight ? "" : "scale-[1.015]"
            } ${backdropReady ? "opacity-100" : "opacity-0"}`}
            style={isSpotlight ? undefined : dashboardPreviewBackdropFadeStyle}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onLoad={() => setBackdropReady(true)}
            onError={() => {
              if (isSpotlight) {
                tvSpotlightBackdropCache.set(show.id, null);
                setBackdropReady(false);
                return;
              }
              const fallback = getPreviewBackdropFallback(show);
              if (fallback && fallback !== backdropPath) {
                tvBackdropCache.set(show.id, fallback);
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
              <div className="absolute inset-0 bg-neutral-900" />
            )}

            {trailerSrc && (
              <div className="absolute inset-0 overflow-hidden">
                <iframe
                  key={trailer.key}
                  ref={trailerIframeRef}
                  className="absolute left-1/2 top-1/2 w-[140%] h-[180%] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  src={trailerSrc}
                  title={`Trailer - ${show.name || show.title}`}
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
                        cmd("setVolume", [10]);
                      }, 120);
                    } catch {}
                  }}
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent via-black/35 to-black/80" />
        )}
      </div>

      {isSpotlight ? (
        <DashboardSpotlightPreview
          item={show}
          mediaType="tv"
          title={show.name || show.title}
          logoSrc={logoSrc}
          backdropSrc={bgSrc}
          year={yearOf(show)}
          runtime={formatRuntime(extras?.runtime)}
          genres={genres}
          tmdbRating={tmdbRating}
          imdbRating={extras?.imdbRating}
          awards={extras?.awards}
          trailerVisible={showTrailer}
          trailerLoading={trailerLoading}
          onToggleTrailer={handleToggleTrailer}
          onCloseTrailer={() => setShowTrailer(false)}
          favorite={favorite}
          watchlist={watchlist}
          actionLoading={loadingStates || updating}
          onToggleFavorite={handleToggleFavorite}
          onToggleWatchlist={handleToggleWatchlist}
          error={error}
        />
      ) : (
        <div className={dashboardPreviewInfoClass}>
          <div className="flex h-full items-center justify-between gap-4 px-4 py-2 sm:px-6 sm:py-2.5 lg:px-8">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-200 sm:text-xs">
                {yearOf(show) && <span>{yearOf(show)}</span>}
                {extras?.runtime && (
                  <span>• {formatRuntime(extras.runtime)}</span>
                )}

                {hasTmdbRating && (
                  <span className="inline-flex items-center gap-1.5">
                    <OptimizedImage
                      src="/logo-TMDb.png"
                      alt="TMDb"
                      className="h-3 w-auto"
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="font-medium">{tmdbRating}</span>
                  </span>
                )}

                {typeof extras?.imdbRating === "number" && (
                  <span className="inline-flex items-center gap-1.5">
                    <OptimizedImage
                      src="/logo-IMDb.svg"
                      alt="IMDb"
                      className="h-4 w-auto"
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="font-medium">
                      {extras.imdbRating.toFixed(1)}
                    </span>
                  </span>
                )}
              </div>

              {genres && (
                <div className="mt-1 line-clamp-1 text-[11px] text-neutral-100/90 sm:text-xs">
                  {genres}
                </div>
              )}

              {extras?.awards && (
                <div className="mt-1 line-clamp-1 text-[10px] leading-tight text-emerald-300 sm:text-[11px]">
                  {extras.awards}
                </div>
              )}

              {error && (
                <p className="mt-1 text-[11px] text-red-400 line-clamp-1">
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
              <LiquidButton
                onClick={handleToggleTrailer}
                loading={trailerLoading}
                active
                activeColor="yellow"
                groupId="series-preview-actions"
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
                groupId="series-preview-actions"
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
                groupId="series-preview-actions"
                title={
                  watchlist ? "Quitar de pendientes" : "Añadir a pendientes"
                }
                className={previewBtnClass}
              >
                <BookmarkPlus className={watchlist ? "fill-current" : ""} />
              </LiquidButton>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ---------- Fila reusable ---------- */
function Row({
  title,
  rowKey,
  items,
  isMobile,
  posterCacheRef,
  replayRevealAtTop = false,
}) {
  const reduceMotion = useReducedMotion();
  const safeItems = Array.isArray(items) ? items : EMPTY_ARRAY;
  const hasItems = safeItems.length > 0;

  // ✅ Etiqueta superior representativa (centralizada): todas las filas la tienen.
  const labelText = deriveSectionLabel(title);

  const swiperRef = useRef(null);
  const rowRef = useRef(null);
  const hoverIntentRef = useRef(0);
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  // Montamos la fila un poco antes de que entre en pantalla, no todas a la vez.
  const isInView = useInView(rowRef, { once: true, margin: "600px" });
  // Revelado: la fila se monta antes pero permanece oculta y solo se anima al
  // hacer scroll y entrar en la ventana. (Hook ANTES del return del placeholder.)
  const standardRevealProps = useScrollRevealProps();
  const topResetRevealProps = useTopResetRevealProps(
    rowRef,
    "-80px",
    replayRevealAtTop,
  );
  const revealProps = replayRevealAtTop
    ? topResetRevealProps
    : standardRevealProps;
  const [preloadedBackdrops, setPreloadedBackdrops] = useState(new Set());

  useEffect(() => {
    if (!isHoveredRow || !hasItems || isMobile) return;

    const preloadBackdrops = async () => {
      const toPreload = safeItems
        .slice(0, 5)
        .filter((show) => !preloadedBackdrops.has(show.id));

      for (const show of toPreload) {
        await preparePreviewBackdrop(show);
        setPreloadedBackdrops((prev) => new Set([...prev, show.id]));
      }
    };

    const timer = window.setTimeout(preloadBackdrops, 300);
    return () => window.clearTimeout(timer);
  }, [isHoveredRow, hasItems, safeItems, isMobile, preloadedBackdrops]);

  // Fila "Top ... en España": estilo ranking con número. Se identifica por la
  // KEY estable de la engine (region_top), no por el título —así el título se
  // puede cambiar libremente sin romper el diseño de ranking—.
  const isTop10 = rowKey === "region_top";
  // Fila DESTACADA: mismas tarjetas póster y misma vista previa, pero a ~1,6×
  // para resaltar la sección más relevante (Tendencias). Solo una por dashboard.
  const isSpotlight = title === "Tendencias ahora mismo";
  const hasActivePreview = !!hoveredId;

  const heightClassDesktop = isSpotlight
    ? "h-[340px] sm:h-[400px] md:h-[460px] xl:h-[520px]"
    : "h-[220px] sm:h-[260px] md:h-[300px] xl:h-[340px]";
  // Tokens de tamaño de la tarjeta póster y de la vista previa (hover).
  const spotlightPosterWidthClass =
    "w-[200px] sm:w-[220px] md:w-[300px] xl:w-[340px]";
  const normalPosterWidthClass =
    "w-[140px] sm:w-[140px] md:w-[190px] xl:w-[210px]";
  const spotlightPreviewWidthClass =
    "w-[604px] sm:w-[711px] md:w-[818px] xl:w-[924px]";
  const normalPreviewWidthClass =
    "w-[320px] sm:w-[320px] md:w-[430px] xl:w-[480px]";
  const posterBoxClass = isMobile ? "aspect-[2/3]" : heightClassDesktop;

  if (!hasItems) return null;

  // Montaje perezoso: hasta acercarse al viewport NO montamos el Swiper (caro:
  // ~28 slides + imágenes). Reservamos altura y mostramos el título → carga
  // inicial ligera y scroll vertical inmediato.
  if (!isInView) {
    return (
      // Placeholder: reserva la altura, pero OCULTO (mismas revealProps que la
      // fila montada). Si no, el título de la primera fila —que va justo tras el
      // hero— se vería al cargar/recargar antes de que la fila se monte.
      <motion.div
        ref={rowRef}
        {...revealProps}
        variants={fadeInUp}
        className="relative"
      >
        <div className="mb-4 px-1 sm:px-0">
          <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent">
            {title}
            <span className="text-emerald-500">.</span>
          </h3>
        </div>
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

  // ✅ TOP 10 SOLO MÓVIL (<768): backdrop completo + 1 por vista
  if (isTop10 && isMobile) {
    return (
      <motion.div
        ref={rowRef}
        {...revealProps}
        variants={fadeInUp}
        className="relative group sv-deferred-row"
      >
        {/* Título para Top 10 móvil con diseño igual a escritorio */}
        <div className="mb-4 px-1 sm:px-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-px w-8 bg-fuchsia-500" />
            <span className="text-fuchsia-400 font-bold uppercase tracking-widest text-[10px]">
              TOP 10
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent">
            {title}<span className="text-emerald-500">.</span>
          </h3>
        </div>
        <Swiper
          slidesPerView={1}
          spaceBetween={14}
          loop={false}
          watchOverflow={true}
          allowTouchMove={true}
          grabCursor={false}
          preventClicks={true}
          preventClicksPropagation={true}
          threshold={2}
          touchRatio={1.5}
          modules={[Navigation]}
          className="group relative"
        >
          {safeItems.map((s, i) => (
            <SwiperSlide key={s.id} className="select-none">
              <Top10MobileBackdropCardTV show={s} rank={i + 1} />
            </SwiperSlide>
          ))}
        </Swiper>
      </motion.div>
    );
  }

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
    const slidesToMove = isMobile ? 1 : 3;
    for (let i = 0; i < slidesToMove; i++) {
      swiper.slideNext();
    }
  };

  const showPrev = (isHoveredRow || hasActivePreview) && canPrev;
  const showNext = (isHoveredRow || hasActivePreview) && canNext;

  const breakpointsRow = {
    0: {
      slidesPerView: isSpotlight ? 1.5 : 3,
      spaceBetween: isSpotlight ? 14 : isTop10 ? 16 : 12,
    },
    640: {
      slidesPerView: isSpotlight ? 2.2 : 4,
      spaceBetween: isSpotlight ? 18 : isTop10 ? 18 : 14,
    },
    768: {
      slidesPerView: "auto",
      spaceBetween: isSpotlight ? 24 : isTop10 ? 24 : 14,
    },
    1024: {
      slidesPerView: "auto",
      spaceBetween: isSpotlight ? 30 : isTop10 ? 28 : 18,
    },
    1280: {
      slidesPerView: "auto",
      spaceBetween: isSpotlight ? 36 : isTop10 ? 32 : 20,
    },
  };

  return (
    <motion.div
      ref={rowRef}
      {...revealProps}
      variants={fadeInUp}
      className="relative group sv-deferred-row"
    >
      <motion.div
        {...revealProps}
        variants={scaleIn}
        className="mb-4 px-1 sm:px-0"
      >
        {labelText && (
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-px w-8 bg-fuchsia-500" />
            <span className="text-fuchsia-400 font-bold uppercase tracking-widest text-[10px]">
              {labelText}
            </span>
          </div>
        )}
        <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent">
          {title}
          <span className="text-emerald-500">.</span>
        </h3>
      </motion.div>

      <div
        className="relative"
        onMouseEnter={() => setIsHoveredRow(true)}
        onMouseLeave={() => {
          hoverIntentRef.current += 1;
          setIsHoveredRow(false);
          setHoveredId(null);
          setHoveredIndex(null);
        }}
      >
        <Swiper
          slidesPerView={isSpotlight ? 1.5 : 3}
          spaceBetween={isSpotlight ? 14 : isTop10 ? 16 : 12}
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
          className="group relative"
          breakpoints={breakpointsRow}
        >
          {safeItems.map((s, i) => {
            const itemKey = `tv:${s.id}:${i}`;
            const isActive = !isTop10 && !isMobile && hoveredId === itemKey;

            const base =
              "relative flex-shrink-0 transition-all duration-300 ease-in-out";
            // Caja de la tarjeta: SIEMPRE altura fija (posterBoxClass), también
            // en la vista previa destacada. Si la activa usa una altura derivada
            // del aspecto (aspect-video / h-full), al cerrar el `transition-all`
            // anima la altura y desplaza la sección inferior. Con altura fija la
            // fila nunca cambia de alto y la previa rellena ese marco.
            const cardBoxClass = isTop10 ? "aspect-video" : posterBoxClass;

            const sizeClasses = isMobile
              ? "w-full"
              : isActive
                ? `${isSpotlight ? spotlightPreviewWidthClass : normalPreviewWidthClass} z-20`
                : isTop10
                  ? "w-[280px] sm:w-[320px] md:w-[390px] xl:w-[440px] z-10"
                  : `${isSpotlight ? spotlightPosterWidthClass : normalPosterWidthClass} z-10`;

            let transformClass = "";
            if (!isMobile && hoveredIndex !== null && hoveredIndex >= 0) {
              const activeIndex = hoveredIndex;
              const totalItems = safeItems.length;

              if (activeIndex >= totalItems - 3 && i <= activeIndex) {
                if (activeIndex === totalItems - 1) {
                  transformClass = isSpotlight
                    ? "sm:-translate-x-[300px] md:-translate-x-[420px] xl:-translate-x-[470px]"
                    : "sm:-translate-x-[190px] md:-translate-x-[260px] xl:-translate-x-[290px]";
                } else if (activeIndex === totalItems - 2) {
                  transformClass = isSpotlight
                    ? "sm:-translate-x-[210px] md:-translate-x-[290px] xl:-translate-x-[320px]"
                    : "sm:-translate-x-[130px] md:-translate-x-[180px] xl:-translate-x-[200px]";
                } else if (activeIndex === totalItems - 3) {
                  transformClass = isSpotlight
                    ? "sm:-translate-x-[105px] md:-translate-x-[145px] xl:-translate-x-[160px]"
                    : "sm:-translate-x-[65px] md:-translate-x-[90px] xl:-translate-x-[100px]";
                }
              }
            }

            const cardElement = (
              <div
                className={`${base} ${sizeClasses} ${cardBoxClass} ${transformClass} ${isActive ? "overflow-visible" : "overflow-hidden"}`}
                onMouseEnter={() => {
                  if (!isMobile && !isTop10) {
                    const hoverToken = hoverIntentRef.current + 1;
                    hoverIntentRef.current = hoverToken;
                    setHoveredIndex(i);
                    preparePreviewBackdrop(s).finally(() => {
                      if (hoverIntentRef.current === hoverToken) {
                        setHoveredId(itemKey);
                      }
                    });
                  }
                }}
                onMouseLeave={() => {
                  hoverIntentRef.current += 1;
                  if (!isMobile)
                    setHoveredId((prev) => (prev === itemKey ? null : prev));
                  setHoveredIndex(null);
                }}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {isActive ? (
                    <motion.div
                      key="preview"
                      initial={
                        reduceMotion ? false : { opacity: 0, scale: 0.98 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        scale: 0.95,
                        transition: { duration: reduceMotion ? 0.08 : 0.12 },
                      }}
                      transition={{
                        duration: reduceMotion ? 0.08 : 0.25,
                        ease: [0.4, 0, 0.2, 1],
                      }}
                      className="w-full h-full hidden sm:block"
                      style={{ willChange: "transform, opacity" }}
                    >
                      <InlinePreviewCard
                        show={s}
                        heightClass={
                          isSpotlight ? "h-full" : heightClassDesktop
                        }
                        isSpotlight={isSpotlight}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="poster"
                      initial={
                        reduceMotion ? false : { opacity: 0, scale: 0.95 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        scale: 0.98,
                        transition: { duration: reduceMotion ? 0.08 : 0.12 },
                      }}
                      transition={{
                        duration: reduceMotion ? 0.08 : 0.18,
                        ease: [0.4, 0, 0.2, 1],
                      }}
                      className="w-full h-full"
                      style={{ willChange: "transform, opacity" }}
                    >
                      {isTop10 ? (
                        <Top10MobileBackdropCardTV
                          show={s}
                          rank={i + 1}
                          showRank={false}
                          frameClassName="h-full rounded-lg"
                          imageClassName="object-contain"
                        />
                      ) : (
                        <Link
                          href={`/details/tv/${s.id}`}
                          prefetch={false}
                          className="block w-full h-full"
                        >
                          <PosterImage show={s} cache={posterCacheRef} />
                        </Link>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );

            return (
              <SwiperSlide
                key={itemKey}
                className={`select-none md:!w-auto ${
                  isSpotlight ? "md:!flex md:!items-center" : ""
                }`}
              >
                {isTop10 ? (
                  <div className="flex items-center">
                    <div
                      className="hidden md:block text-[150px] lg:text-[180px] xl:text-[220px] 2xl:text-[260px] font-black z-0 select-none
                        bg-gradient-to-b from-blue-900/40 via-blue-600/30 to-blue-400/20 bg-clip-text text-transparent
                        drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]"
                      style={{
                        fontFamily: "system-ui, -apple-system, sans-serif",
                        lineHeight: 0.8,
                        marginRight: "-0.15em",
                        marginLeft: "0.1em",
                      }}
                    >
                      {i + 1}
                    </div>
                    {cardElement}
                  </div>
                ) : (
                  cardElement
                )}
              </SwiperSlide>
            );
          })}
        </Swiper>

        {showPrev && !isMobile && (
          <button
            type="button"
            onClick={handlePrevClick}
            className="absolute inset-y-0 left-0 w-28 z-30
              hidden sm:flex items-center justify-start
              bg-gradient-to-r from-black/80 via-black/55 to-transparent
              hover:from-black/95 hover:via-black/75
              transition-colors pointer-events-auto"
          >
            <span className="ml-4 text-3xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
              ‹
            </span>
          </button>
        )}

        {showNext && !isMobile && (
          <button
            type="button"
            onClick={handleNextClick}
            className="absolute inset-y-0 right-0 w-28 z-30
              hidden sm:flex items-center justify-end
              bg-gradient-to-l from-black/80 via-black/55 to-transparent
              hover:from-black/95 hover:via-black/75
              transition-colors pointer-events-auto"
          >
            <span className="mr-4 text-3xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
              ›
            </span>
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ====================================================================
 * Componente Principal (CLIENTE): recibe datos ya cargados en servidor
 * ==================================================================== */
export default function SeriesPageClient({
  initialData,
  deferredDataPromise,
  initialEngineRows = EMPTY_ARRAY,
}) {
  const isMobile = useIsMobileLayout(768);

  const posterCacheRef = useRef(new Map());
  const [deferredData, setDeferredData] = useState(null);
  const [visibleRowCount, setVisibleRowCount] = useState(INITIAL_VISIBLE_ROWS);

  useEffect(() => {
    if (deferredDataPromise) {
      Promise.resolve(deferredDataPromise)
        .then(setDeferredData)
        .catch(console.error);
    }
  }, [deferredDataPromise]);

  const dashboardData = useMemo(
    () => ({
      ...(initialData || {}),
      ...(deferredData || {}),
    }),
    [initialData, deferredData],
  );

  // Filas de la engine de dashboards (genérico rotativo + recomendaciones,
  // deduplicado por el backend; sin Trakt). Sustituyen a las filas TMDb
  // genéricas que repetían títulos.
  // NO ocultar las filas SSR mientras llega la versión personalizada: si se
  // ocultan, un usuario con sesión se queda solo con el hero (sin secciones y
  // sin poder hacer scroll) hasta que responde /api/dashboard/series —varios
  // segundos si el backend está frío—. Mostramos las filas SSR al instante y la
  // engine las sustituye por las personalizadas en segundo plano (stabilizeRows
  // minimiza el reordenado).
  const { rows: engineRows } = useEngineRows("series", {
    initialRows: initialEngineRows,
  });
  const rowConfigs = useMemo(
    () =>
      engineRows.map((row) => ({
        key: row.key,
        title: row.title,
        items: row.items,
      })),
    [engineRows],
  );

  useEffect(() => {
    if (visibleRowCount >= rowConfigs.length) return undefined;

    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      setVisibleRowCount((count) =>
        Math.min(rowConfigs.length, count + ROW_REVEAL_BATCH_SIZE),
      );
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [rowConfigs.length, visibleRowCount]);

  const visibleRows = rowConfigs.slice(0, visibleRowCount);
  // Reduce en el hero los títulos ya vistos / en favoritos (criterio cliente).
  const featuredItems = usePersonalizedFeatured(
    dashboardData.featured || EMPTY_ARRAY,
  );
  const hasFeaturedHero = featuredItems.length > 0;

  if (!initialData || Object.keys(initialData).length === 0) {
    return <div className="h-screen bg-black" />;
  }

  return (
    <motion.div
      className={`relative min-h-screen overflow-hidden bg-black text-white selection:bg-amber-500/30 ${
        hasFeaturedHero ? "-mt-16" : "px-4 py-6 sm:px-6"
      }`}
      initial="hidden"
      animate="visible"
      variants={fadeInUp}
    >
      <div className="relative z-10">
        {hasFeaturedHero && (
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
        )}

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className={
            hasFeaturedHero
              ? "space-y-12 px-4 pt-4 pb-6 sm:px-6 sm:pt-11"
              : "space-y-12 pt-2"
          }
        >
          {visibleRows.map(({ key, title, items }, index) => (
            <Row
              key={key}
              rowKey={key}
              title={title}
              items={items}
              isMobile={isMobile}
              posterCacheRef={posterCacheRef}
              replayRevealAtTop={index === 0}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
