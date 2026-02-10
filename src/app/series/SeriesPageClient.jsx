// /src/app/series/SeriesPageClient.jsx
"use client";

import { useRef, useEffect, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper";
import { AnimatePresence, motion, useInView } from "framer-motion";
import "swiper/swiper-bundle.css";
import Link from "next/link";
import { Anton } from "next/font/google";
import {
  Heart,
  HeartOff,
  BookmarkPlus,
  BookmarkMinus,
  Loader2,
  Play,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

import {
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getDetails,
  getExternalIds,
} from "@/lib/api/tmdb";

import { fetchOmdbByImdb } from "@/lib/api/omdb";

const anton = Anton({ weight: "400", subsets: ["latin"] });

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
function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

/* =================== CACHÉS COMPARTIDOS (CLIENTE TV) =================== */
const tvExtrasCache = new Map(); // show.id -> { runtime, awards, imdbRating }
const tvBackdropCache = new Map(); // show.id -> backdrop file_path | null | undefined
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
    const url =
      `https://api.themoviedb.org/3/tv/${showId}/images` +
      `?api_key=${apiKey}` +
      `&include_image_language=en,en-US,null`;

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
  const { preferLangs = ["en", "en-US"], minWidth = 1200 } = opts;

  if (!Array.isArray(list) || list.length === 0) return null;

  // Normaliza 'en-US' -> 'en'
  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean));
  const isPreferredLang = (img) => preferSet.has(norm(img?.iso_639_1));

  // Mantener orden + minWidth
  const pool0 =
    minWidth > 0 ? list.filter((b) => (b?.width || 0) >= minWidth) : list;
  const pool = pool0.length ? pool0 : list;

  // ✅ SOLO 3 primeras EN (en orden). Si no hay EN, no devolvemos nada (siempre EN).
  const top3en = [];
  for (const b of pool) {
    if (isPreferredLang(b)) top3en.push(b);
    if (top3en.length === 3) break;
  }
  if (!top3en.length) return null;

  const isRes = (b, w, h) => (b?.width || 0) === w && (b?.height || 0) === h;

  // Prioridades dentro de esas 3 EN
  const b1080 = top3en.find((b) => isRes(b, 1920, 1080));
  if (b1080) return b1080;

  const b1440 = top3en.find((b) => isRes(b, 2560, 1440));
  if (b1440) return b1440;

  const b4k = top3en.find((b) => isRes(b, 3840, 2160));
  if (b4k) return b4k;

  // ✅ si no hay 4K, intenta 1280x720
  const b720 = top3en.find((b) => isRes(b, 1280, 720));
  if (b720) return b720;

  // si no hay ninguna, primera de esas 3 EN
  return top3en[0];
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
async function fetchBestTVBackdrop(showId) {
  const { backdrops } = await getShowImages(showId);
  if (!Array.isArray(backdrops) || backdrops.length === 0) return null;

  const best = pickBestBackdropByLangResVotes(backdrops, {
    preferLangs: ["en", "en-US"],
    resolutionWindow: 0.98,
    minWidth: 1200,
  });

  return best?.file_path || null;
}

/* ====================================================================
 * Poster TV (igual que MainDashboard/Movies):
 * - <md: contain + blur
 * - >=md: cover
 * ==================================================================== */
function PosterImage({ show, cache }) {
  const [posterPath, setPosterPath] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;

    const resolvePoster = async () => {
      if (!show) return;

      // 1) Preferencia usuario
      const { poster: userPoster } = getTVArtworkPreference(show.id);
      if (userPoster) {
        const url = buildImg(userPoster, "w342");
        await preloadImage(url);
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
        const url = buildImg(cached, "w342");
        await preloadImage(url);
        if (!abort) {
          setPosterPath(cached);
          setReady(true);
        }
        return;
      }

      // 3) Mejor poster EN + máxima resolución (estable)
      setReady(false);
      const preferred = await fetchBestTVPoster(show.id);
      const chosen =
        preferred || show.poster_path || show.backdrop_path || null;

      const url = chosen ? buildImg(chosen, "w342") : null;
      await preloadImage(url);

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
      <img
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
        <img
          src={buildImg(posterPath, "w342")}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-xl opacity-35 scale-110"
          loading="lazy"
          decoding="async"
        />
        <img
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
 * TOP 10 (MÓVIL): Backdrop completo + número + 1 por vista
 * ✅ MANTENIDO DISEÑO ORIGINAL (rounded-3xl)
 * ==================================================================== */
function Top10MobileBackdropCardTV({ show, rank }) {
  const [backdropPath, setBackdropPath] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;

    const load = async () => {
      if (!show?.id) return;

      setReady(false);

      const { backdrop: userBackdrop } = getTVArtworkPreference(show.id);
      if (userBackdrop) {
        tvBackdropCache.set(show.id, userBackdrop);
        await preloadImage(buildImg(userBackdrop, "w1280"));
        if (!abort) {
          setBackdropPath(userBackdrop);
          setReady(true);
        }
        return;
      }

      const cached = tvBackdropCache.get(show.id);
      if (cached !== undefined) {
        if (cached) await preloadImage(buildImg(cached, "w1280"));
        if (!abort) {
          setBackdropPath(cached || null);
          setReady(!!cached);
        }
        return;
      }

      let chosen = null;
      try {
        const preferred = await fetchBestTVBackdrop(show.id);
        chosen = preferred || null;
      } catch {
        chosen = null;
      }

      tvBackdropCache.set(show.id, chosen);
      if (chosen) await preloadImage(buildImg(chosen, "w1280"));

      if (!abort) {
        setBackdropPath(chosen);
        setReady(!!chosen);
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [show]);

  const href = `/details/tv/${show.id}`;
  const src = backdropPath ? buildImg(backdropPath, "w1280") : null;

  return (
    <Link href={href} className="block w-full">
      {/* CAMBIO: Mantener rounded-3xl para Top 10 */}
      <div className="relative w-full rounded-3xl overflow-hidden bg-neutral-900 aspect-[16/9]">
        {!ready && <div className="absolute inset-0 bg-neutral-900" />}

        {ready && src && (
          <>
            <img
              src={buildImg(backdropPath, "w780")}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-35 scale-110"
              loading="lazy"
              decoding="async"
            />
            <img
              src={src}
              alt={show.name || show.title}
              className="absolute inset-0 w-full h-full object-contain"
              loading="lazy"
              decoding="async"
            />
          </>
        )}

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

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
      </div>
    </Link>
  );
}

/* ====================================================================
 * Vista previa inline tipo Amazon (backdrop horizontal) para TV + TRAILER
 * ==================================================================== */
function InlinePreviewCard({ show, heightClass }) {
  const { session, account } = useAuth();

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
  }, [show?.id]);

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
        const st = await getMediaAccountStates(type, show.id, session);
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
      const { backdrop: userBackdrop } = getTVArtworkPreference(show.id);
      const userPreferredBackdrop = userBackdrop || null;

      if (userPreferredBackdrop) {
        tvBackdropCache.set(show.id, userPreferredBackdrop);
        const url = buildImg(userPreferredBackdrop, "w1280");
        await preloadImage(url);
        if (!abort) {
          setBackdropPath(userPreferredBackdrop);
          setBackdropReady(true);
        }
      } else {
        const cachedBackdrop = tvBackdropCache.get(show.id);
        if (cachedBackdrop !== undefined) {
          if (!abort) {
            setBackdropPath(cachedBackdrop);
            if (cachedBackdrop) {
              const url = buildImg(cachedBackdrop, "w1280");
              await preloadImage(url);
              if (!abort) setBackdropReady(true);
            } else {
              setBackdropReady(false);
            }
          }
        } else {
          try {
            const preferred = await fetchBestTVBackdrop(show.id);
            const chosen = preferred || null;

            tvBackdropCache.set(show.id, chosen);

            if (chosen) {
              const url = buildImg(chosen, "w1280");
              await preloadImage(url);
              if (!abort) {
                setBackdropPath(chosen);
                setBackdropReady(true);
              }
            } else if (!abort) {
              setBackdropPath(null);
              setBackdropReady(false);
            }
          } catch {
            if (!abort) {
              setBackdropPath(null);
              setBackdropReady(false);
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
          try {
            const details = await getDetails("tv", show.id, {
              language: "es-ES",
            });
            runtime = details?.episode_run_time?.[0] ?? null;
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
              const omdb = await fetchOmdbByImdb(imdb);
              const rawAwards = omdb?.Awards;
              if (
                rawAwards &&
                typeof rawAwards === "string" &&
                rawAwards.trim()
              ) {
                awards = rawAwards.trim();
              }
              const r = omdb?.imdbRating;
              if (r && !Number.isNaN(Number(r))) {
                imdbRating = Number(r);
              }
            }
          } catch {}

          const next = { runtime, awards, imdbRating };
          tvExtrasCache.set(show.id, next);
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
  }, [show]);

  const href = `/details/tv/${show.id}`;

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = "/login";
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

  const resolvedBackdrop =
    backdropPath || show.backdrop_path || show.poster_path || null;
  const bgSrc = resolvedBackdrop ? buildImg(resolvedBackdrop, "w1280") : null;

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

  return (
    <div
      // CAMBIO: rounded-3xl -> rounded-lg
      className={`rounded-lg overflow-hidden bg-neutral-900 text-white shadow-xl ${heightClass} grid grid-rows-[76%_24%] cursor-pointer`}
      onClick={() => {
        window.location.href = href;
      }}
    >
      <div className="relative w-full h-full bg-black">
        {!showTrailer && !backdropReady && (
          <div className="absolute inset-0 bg-neutral-900" />
        )}

        {!showTrailer && backdropReady && bgSrc && (
          <img
            src={bgSrc}
            alt={show.name || show.title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            decoding="async"
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

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-gradient-to-b from-transparent via-black/55 to-neutral-950/95" />
      </div>

      <div className="w-full h-full bg-neutral-950/95 border-t border-neutral-800">
        <div className="h-full px-4 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3 text-[11px] sm:text-xs text-neutral-200">
              {yearOf(show) && <span>{yearOf(show)}</span>}
              {extras?.runtime && (
                <span>• {formatRuntime(extras.runtime)}</span>
              )}

              <span className="inline-flex items-center gap-1.5">
                <img
                  src="/logo-TMDb.png"
                  alt="TMDb"
                  className="h-3 w-auto"
                  loading="lazy"
                  decoding="async"
                />
                <span className="font-medium">{ratingOf(show)}</span>
              </span>

              {typeof extras?.imdbRating === "number" && (
                <span className="inline-flex items-center gap-1.5">
                  <img
                    src="/logo-IMDb.png"
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
              <div className="mt-1 text-[11px] sm:text-xs text-neutral-100/90 line-clamp-1">
                {genres}
              </div>
            )}

            {extras?.awards && (
              <div className="mt-1 text-[11px] sm:text-xs text-emerald-300 line-clamp-1">
                {extras.awards}
              </div>
            )}

            {error && (
              <p className="mt-1 text-[11px] text-red-400 line-clamp-1">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <button
              onClick={handleToggleTrailer}
              disabled={trailerLoading}
              title={showTrailer ? "Cerrar trailer" : "Ver trailer"}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-yellow-500/90 to-yellow-600/90 hover:from-yellow-400 hover:to-yellow-500 border border-yellow-400/40 flex items-center justify-center text-black transition-all duration-200 disabled:opacity-60 shadow-lg shadow-yellow-500/30 hover:shadow-yellow-500/50"
            >
              {trailerLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-black" />
              ) : showTrailer ? (
                <X className="w-5 h-5 text-black" />
              ) : (
                <Play className="w-5 h-5 text-black" />
              )}
            </button>

            <button
              onClick={handleToggleFavorite}
              disabled={loadingStates || updating}
              title={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all duration-200 disabled:opacity-60 shadow-lg ${
                favorite
                  ? "bg-gradient-to-br from-red-600/90 to-red-700/90 hover:from-red-500 hover:to-red-600 border-red-400/40 shadow-red-500/30 hover:shadow-red-500/50 text-white"
                  : "bg-gradient-to-br from-neutral-700/70 to-neutral-800/70 hover:from-neutral-600 hover:to-neutral-700 border-neutral-500/30 shadow-black/20 text-white"
              }`}
            >
              {loadingStates || updating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Heart
                  className={`w-5 h-5 ${favorite ? "fill-current" : ""}`}
                />
              )}
            </button>

            <button
              onClick={handleToggleWatchlist}
              disabled={loadingStates || updating}
              title={watchlist ? "Quitar de pendientes" : "Añadir a pendientes"}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all duration-200 disabled:opacity-60 shadow-lg ${
                watchlist
                  ? "bg-gradient-to-br from-blue-600/90 to-blue-700/90 hover:from-blue-500 hover:to-blue-600 border-blue-400/40 shadow-blue-500/30 hover:shadow-blue-500/50 text-white"
                  : "bg-gradient-to-br from-neutral-700/70 to-neutral-800/70 hover:from-neutral-600 hover:to-neutral-700 border-neutral-500/30 shadow-black/20 text-white"
              }`}
            >
              {loadingStates || updating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BookmarkPlus
                  className={`w-5 h-5 ${watchlist ? "fill-current" : ""}`}
                />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Fila reusable ---------- */
function Row({ title, items, isMobile, posterCacheRef }) {
  if (!items || items.length === 0) return null;

  // ✅ Detectar si es una fila de género específico
  const isGenreRow = ![
    "Populares",
    "Tendencias ahora mismo",
    "Series imprescindibles",
    "En emisión ahora mismo",
    "Aclamadas por la crítica",
    "Top 10 hoy en España",
    "En Emisión",
  ].includes(title);

  // ✅ Determinar etiqueta específica según el título
  let labelText = null;
  if (title === "Tendencias ahora mismo") {
    labelText = "TENDENCIAS";
  } else if (title === "Series imprescindibles") {
    labelText = "IMPRESCINDIBLES";
  } else if (title === "Top 10 hoy en España") {
    labelText = "TOP 10";
  } else if (isGenreRow) {
    labelText = "GÉNERO";
  }

  const swiperRef = useRef(null);
  const rowRef = useRef(null);
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const isInView = useInView(rowRef, { once: true, margin: "-100px" });

  const isTop10 = title === "Top 10 hoy en España";
  const hasActivePreview = !!hoveredId;

  const heightClassDesktop =
    "md:h-[220px] lg:h-[260px] xl:h-[300px] 2xl:h-[340px]";
  const posterBoxClass = `aspect-[2/3] md:aspect-auto ${heightClassDesktop}`;

  // ✅ TOP 10 SOLO MÓVIL (<768): backdrop completo + 1 por vista
  if (isTop10 && isMobile) {
    return (
      <div className="relative group">
        {/* Título para Top 10 móvil con diseño igual a escritorio */}
        <div className="mb-4 px-1 sm:px-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-px w-8 bg-emerald-500" />
            <span className="text-emerald-400 font-bold uppercase tracking-widest text-[10px]">
              TOP 10
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent">
            Top 10 hoy en España<span className="text-emerald-500">.</span>
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
          {items.map((s, i) => (
            <SwiperSlide key={s.id} className="select-none">
              <Top10MobileBackdropCardTV show={s} rank={i + 1} />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
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
    const target = Math.max((swiper.activeIndex || 0) - 6, 0);
    swiper.slideTo(target);
  };

  const handleNextClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const swiper = swiperRef.current;
    if (!swiper) return;
    const maxIndex = swiper.slides.length - 1;
    const target = Math.min((swiper.activeIndex || 0) + 6, maxIndex);
    swiper.slideTo(target);
  };

  const showPrev = (isHoveredRow || hasActivePreview) && canPrev;
  const showNext = (isHoveredRow || hasActivePreview) && canNext;

  const breakpointsRow = {
    0: { slidesPerView: 3, spaceBetween: isTop10 ? 16 : 12 },
    640: { slidesPerView: 4, spaceBetween: isTop10 ? 18 : 14 },
    768: { slidesPerView: "auto", spaceBetween: isTop10 ? 24 : 14 },
    1024: { slidesPerView: "auto", spaceBetween: isTop10 ? 28 : 18 },
    1280: { slidesPerView: "auto", spaceBetween: isTop10 ? 32 : 20 },
  };

  return (
    <motion.div
      ref={rowRef}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeInUp}
      className="relative group"
    >
      <motion.div
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        variants={scaleIn}
        className="mb-4 px-1 sm:px-0"
      >
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

      <div
        className="relative"
        onMouseEnter={() => setIsHoveredRow(true)}
        onMouseLeave={() => {
          setIsHoveredRow(false);
          setHoveredId(null);
        }}
      >
        <Swiper
          slidesPerView={3}
          spaceBetween={isTop10 ? 16 : 12}
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
          {items.map((s, i) => {
            const isActive = !isMobile && hoveredId === s.id;
            const isLast = i === items.length - 1;

            const base =
              "relative flex-shrink-0 transition-all duration-300 ease-in-out";

            const sizeClasses = isActive
              ? "w-full md:w-[320px] lg:w-[380px] xl:w-[430px] 2xl:w-[480px] z-20"
              : "w-full md:w-[140px] lg:w-[170px] xl:w-[190px] 2xl:w-[210px] z-10";

            const transformClass =
              !isMobile && isActive && isLast
                ? "md:-translate-x-[190px] lg:-translate-x-[230px] xl:-translate-x-[260px] 2xl:-translate-x-[290px]"
                : "";

            const cardElement = (
              <div
                className={`${base} ${sizeClasses} ${posterBoxClass} ${transformClass}`}
                onMouseEnter={() => {
                  if (!isMobile) setHoveredId(s.id);
                }}
                onMouseLeave={() => {
                  if (!isMobile)
                    setHoveredId((prev) => (prev === s.id ? null : prev));
                }}
              >
                <AnimatePresence initial={false} mode="wait">
                  {isActive ? (
                    <motion.div
                      key="preview"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      // CAMBIO: exit rápido
                      exit={{
                        opacity: 0,
                        scale: 0.98,
                        transition: { duration: 0.1 },
                      }}
                      // CAMBIO: entrada rápida lineal
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="w-full h-full hidden md:block"
                    >
                      <InlinePreviewCard
                        show={s}
                        heightClass={heightClassDesktop}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="poster"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        scale: 0.98,
                        transition: { duration: 0.1 },
                      }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="w-full h-full"
                    >
                      <Link
                        href={`/details/tv/${s.id}`}
                        className="block w-full h-full"
                      >
                        <PosterImage show={s} cache={posterCacheRef} />
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );

            return (
              <SwiperSlide key={s.id} className="select-none md:!w-auto">
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

function GenreRows({ groups, isMobile, posterCacheRef }) {
  if (!groups) return null;
  return (
    <>
      {Object.entries(groups || {}).map(([gname, list]) =>
        list?.length ? (
          <Row
            key={`genre-${gname}`}
            title={`${gname}`}
            items={list}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        ) : null,
      )}
    </>
  );
}

/* ====================================================================
 * Componente Principal (CLIENTE): recibe datos ya cargados en servidor
 * ==================================================================== */
export default function SeriesPageClient({ initialData }) {
  const isMobile = useIsMobileLayout(768);

  const posterCacheRef = useRef(new Map());
  const dashboardData = initialData || {};

  if (!dashboardData || Object.keys(dashboardData).length === 0) {
    return <div className="h-screen bg-black" />;
  }

  return (
    <div className="px-6 py-6 text-white bg-black">
      <div className="space-y-12 pt-2">
        {dashboardData["Top 10 hoy en España"]?.length ? (
          <Row
            title="Top 10 hoy en España"
            items={dashboardData["Top 10 hoy en España"]}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        ) : null}

        {dashboardData.popular?.length > 0 && (
          <Row
            title="Tendencias ahora mismo"
            items={dashboardData.popular}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        {dashboardData.top_imdb?.length > 0 && (
          <Row
            title="Series imprescindibles"
            items={dashboardData.top_imdb}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        {dashboardData["En Emisión"]?.length ? (
          <Row
            title="En emisión ahora mismo"
            items={dashboardData["En Emisión"]}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        ) : null}

        {dashboardData["Aclamadas por la crítica"]?.length ? (
          <Row
            title="Aclamadas por la crítica"
            items={dashboardData["Aclamadas por la crítica"]}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        ) : null}

        {dashboardData.scifi_fantasy?.length > 0 && (
          <Row
            title="Ciencia ficción y fantasía"
            items={dashboardData.scifi_fantasy}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        {dashboardData.crime?.length > 0 && (
          <Row
            title="Crimen y suspense"
            items={dashboardData.crime}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        {dashboardData.romance?.length > 0 && (
          <Row
            title="Romance que atrapa"
            items={dashboardData.romance}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        {dashboardData.animation?.length > 0 && (
          <Row
            title="Animación para maratonear"
            items={dashboardData.animation}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        <GenreRows
          groups={dashboardData["Por género"]}
          isMobile={isMobile}
          posterCacheRef={posterCacheRef}
        />
      </div>
    </div>
  );
}
