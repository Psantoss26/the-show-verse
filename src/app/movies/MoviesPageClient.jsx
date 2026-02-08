// /src/app/movies/MoviesPageClient.jsx
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
  getMovieDetails,
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
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width:${breakpointPx - 1}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

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

/* --- helpers de presentación --- */
const yearOf = (m) =>
  m?.release_date?.slice(0, 4) || m?.first_air_date?.slice(0, 4) || "";

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

const MOVIE_GENRES = {
  28: "Acción",
  12: "Aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familia",
  14: "Fantasía",
  36: "Historia",
  27: "Terror",
  10402: "Música",
  9648: "Misterio",
  10749: "Romance",
  878: "Ciencia ficción",
  10770: "TV Movie",
  53: "Thriller",
  10752: "Bélica",
  37: "Western",
};

async function resolveTmdbSrc(filePath, sizes) {
  if (!filePath) return null;
  for (const size of sizes) {
    const url = buildImg(filePath, size);
    // preloadImage ya devuelve true/false
    const ok = await preloadImage(url);
    if (ok) return url;
  }
  return null;
}

async function resolvePreviewSources(filePath) {
  if (!filePath) return { src: null, blur: null };

  // Intento “backdrop”: w1280 primero
  const src =
    (await resolveTmdbSrc(filePath, ["w1280", "w780", "w500", "original"])) ||
    null;

  if (!src) return { src: null, blur: null };

  // Blur: tamaño más pequeño si hiciera falta
  const blur =
    (await resolveTmdbSrc(filePath, ["w780", "w500", "w342", "original"])) ||
    src;

  return { src, blur };
}

/* --------- Precargar imagen (resolve tras onload) --------- */
function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

/* =================== CACHÉS COMPARTIDOS (cliente) =================== */
const movieExtrasCache = new Map(); // movie.id -> { runtime, awards, imdbRating }
const movieBackdropCache = new Map(); // movie.id -> backdrop file_path | null | undefined
const movieImagesCache = new Map(); // movie.id -> { posters, backdrops }

/* ======== Preferencias de artwork guardadas en localStorage ======== */
function getArtworkPreference(movieId) {
  if (typeof window === "undefined") {
    return { poster: null, backdrop: null };
  }
  const posterKey = `showverse:movie:${movieId}:poster`;
  const backdropKey = `showverse:movie:${movieId}:backdrop`;
  const poster = window.localStorage.getItem(posterKey);
  const backdrop = window.localStorage.getItem(backdropKey);
  return {
    poster: poster || null,
    backdrop: backdrop || null,
  };
}

/* ====================================================================
 * LOGICA IMAGENES (Backdrops / Posters)
 * ==================================================================== */
function pickBestBackdropByLangResVotes(list, opts = {}) {
  const { preferLangs = ["en", "en-US"], minWidth = 1200 } = opts;
  if (!Array.isArray(list) || list.length === 0) return null;

  // normaliza a 'en'
  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean));
  const isPreferredLang = (img) => preferSet.has(norm(img?.iso_639_1));

  // Mantener orden + minWidth (si no hay, cae al original)
  const pool0 =
    minWidth > 0 ? list.filter((b) => (b?.width || 0) >= minWidth) : list;
  const pool = pool0.length ? pool0 : list;

  // ✅ SOLO 3 primeras EN (en orden). Si no hay EN, devolvemos null (siempre EN)
  const top3en = [];
  for (const b of pool) {
    if (isPreferredLang(b)) top3en.push(b);
    if (top3en.length === 3) break;
  }
  if (!top3en.length) return null;

  const isRes = (b, w, h) => (b?.width || 0) === w && (b?.height || 0) === h;

  // Prioridades: 1920x1080, 2560x1440, 3840x2160, 1280x720, y si no la primera EN
  const b1080 = top3en.find((b) => isRes(b, 1920, 1080));
  if (b1080) return b1080;

  const b1440 = top3en.find((b) => isRes(b, 2560, 1440));
  if (b1440) return b1440;

  const b4k = top3en.find((b) => isRes(b, 3840, 2160));
  if (b4k) return b4k;

  const b720 = top3en.find((b) => isRes(b, 1280, 720));
  if (b720) return b720;

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

async function getMovieImages(movieId) {
  if (movieImagesCache.has(movieId)) return movieImagesCache.get(movieId);

  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) {
    const fallback = { posters: [], backdrops: [] };
    movieImagesCache.set(movieId, fallback);
    return fallback;
  }

  try {
    const url =
      `https://api.themoviedb.org/3/movie/${movieId}/images` +
      `?api_key=${apiKey}` +
      `&include_image_language=en,en-US,null`;

    const r = await fetch(url, { cache: "force-cache" });
    const j = await r.json();
    const posters = Array.isArray(j?.posters) ? j.posters : [];
    const backdrops = Array.isArray(j?.backdrops) ? j.backdrops : [];

    const data = { posters, backdrops };
    movieImagesCache.set(movieId, data);
    return data;
  } catch {
    const fallback = { posters: [], backdrops: [] };
    movieImagesCache.set(movieId, fallback);
    return fallback;
  }
}

async function fetchBestPoster(movieId) {
  const { posters } = await getMovieImages(movieId);
  if (!Array.isArray(posters) || posters.length === 0) return null;

  const best = pickBestPosterByLangThenResolution(posters, {
    preferLangs: ["en", "en-US"],
    minWidth: 500,
  });

  return best?.file_path || null;
}

async function fetchBestBackdrop(movieId) {
  const { backdrops } = await getMovieImages(movieId);
  if (!Array.isArray(backdrops) || backdrops.length === 0) return null;

  const best = pickBestBackdropByLangResVotes(backdrops, {
    preferLangs: ["en", "en-US"],
    resolutionWindow: 0.98,
    minWidth: 1200,
  });

  return best?.file_path || null;
}

/* =================== TRAILERS (TMDb videos) =================== */
const movieTrailerCache = new Map();
const movieTrailerInFlight = new Map();

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

async function fetchBestTrailer(movieId) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    if (!apiKey || !movieId) return null;

    const url =
      `https://api.themoviedb.org/3/movie/${movieId}/videos` +
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

async function getBestTrailerCached(movieId) {
  if (movieTrailerCache.has(movieId)) return movieTrailerCache.get(movieId);
  if (movieTrailerInFlight.has(movieId))
    return movieTrailerInFlight.get(movieId);

  const p = (async () => {
    const t = await fetchBestTrailer(movieId);
    movieTrailerCache.set(movieId, t || null);
    movieTrailerInFlight.delete(movieId);
    return t || null;
  })();

  movieTrailerInFlight.set(movieId, p);
  return p;
}

/* ====================================================================
 * Componentes de Visualización
 * ==================================================================== */

// ✅ DISEÑO NUEVO: rounded-lg
function PosterImage({ movie, cache }) {
  const [posterPath, setPosterPath] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;

    const load = async () => {
      if (!movie) return;

      // 1) Preferencia usuario
      const { poster: userPoster } = getArtworkPreference(movie.id);
      if (userPoster) {
        const url = buildImg(userPoster, "w342");
        await preloadImage(url);
        if (!abort) {
          cache.current.set(movie.id, userPoster);
          setPosterPath(userPoster);
          setReady(true);
        }
        return;
      }

      // 2) Cache en memoria
      const cached = cache.current.get(movie.id);
      if (cached) {
        const url = buildImg(cached, "w342");
        await preloadImage(url);
        if (!abort) {
          setPosterPath(cached);
          setReady(true);
        }
        return;
      }

      // 3) Mejor poster (EN + máxima resolución)
      setReady(false);
      const preferred = await fetchBestPoster(movie.id);
      const chosen =
        preferred || movie.poster_path || movie.backdrop_path || null;

      const url = chosen ? buildImg(chosen, "w342") : null;
      await preloadImage(url);

      if (!abort) {
        cache.current.set(movie.id, chosen);
        setPosterPath(chosen);
        setReady(!!chosen);
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [movie, cache]);

  if (!ready || !posterPath) {
    return (
      <div className="w-full h-full rounded-lg bg-neutral-800 animate-pulse" />
    );
  }

  return (
    <>
      {/* Desktop / tablet */}
      <img
        src={buildImg(posterPath, "w342")}
        alt={movie.title || movie.name}
        className="hidden md:block w-full h-full object-cover rounded-lg"
        loading="lazy"
        decoding="async"
      />

      {/* Mobile: contain + blur */}
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
          alt={movie.title || movie.name}
          className="absolute inset-0 w-full h-full object-contain"
          loading="lazy"
          decoding="async"
        />
      </div>
    </>
  );
}

// ✅ DISEÑO ORIGINAL: rounded-3xl para Top 10
function Top10MobileBackdropCard({ movie, rank }) {
  const [backdropPath, setBackdropPath] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;

    const load = async () => {
      if (!movie?.id) return;

      setReady(false);

      const { backdrop: userBackdrop } = getArtworkPreference(movie.id);
      if (userBackdrop) {
        movieBackdropCache.set(movie.id, userBackdrop);
        await preloadImage(buildImg(userBackdrop, "w1280"));
        if (!abort) {
          setBackdropPath(userBackdrop);
          setReady(true);
        }
        return;
      }

      const cached = movieBackdropCache.get(movie.id);
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
        const preferred = await fetchBestBackdrop(movie.id);
        chosen = preferred || null;
      } catch {
        chosen = null;
      }

      movieBackdropCache.set(movie.id, chosen);

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
  }, [movie]);

  const href = `/details/movie/${movie.id}`;
  const src = backdropPath ? buildImg(backdropPath, "w1280") : null;

  return (
    <Link href={href} className="block w-full">
      <div className="relative w-full rounded-3xl overflow-hidden bg-neutral-900 aspect-[16/9]">
        {!ready && (
          <div className="absolute inset-0 bg-neutral-900 animate-pulse" />
        )}

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
              alt={movie.title || movie.name}
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

// ✅ DISEÑO NUEVO: rounded-lg
function InlinePreviewCard({ movie, heightClass }) {
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
      const { backdrop: userBackdrop } = getArtworkPreference(movie.id);
      const userPreferredBackdrop = userBackdrop || null;

      if (userPreferredBackdrop) {
        movieBackdropCache.set(movie.id, userPreferredBackdrop);
        const url = buildImg(userPreferredBackdrop, "w1280");
        await preloadImage(url);
        if (!abort) {
          setBackdropPath(userPreferredBackdrop);
          setBackdropReady(true);
        }
      } else {
        const cachedBackdrop = movieBackdropCache.get(movie.id);
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
            const preferred = await fetchBestBackdrop(movie.id);
            const chosen = preferred || null;
            movieBackdropCache.set(movie.id, chosen);

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

      const cachedExtras = movieExtrasCache.get(movie.id);
      if (cachedExtras) {
        if (!abort) setExtras(cachedExtras);
      } else {
        try {
          let runtime = null;
          try {
            const details = await getMovieDetails(movie.id);
            runtime = details?.runtime ?? null;
          } catch {}

          let awards = null;
          let imdbRating = null;
          try {
            let imdb = movie?.imdb_id;
            if (!imdb) {
              const ext = await getExternalIds("movie", movie.id);
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
  }, [movie]);

  const href = `/details/movie/${movie.id}`;

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = "/login";
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
        type: movie.media_type || "movie",
        mediaId: movie.id,
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
    if (requireLogin() || updating || !movie) return;
    try {
      setUpdating(true);
      setError("");
      const next = !watchlist;
      setWatchlist(next);
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type: movie.media_type || "movie",
        mediaId: movie.id,
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

      const t = await getBestTrailerCached(movie.id);

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

  const bgSrc = backdropPath ? buildImg(backdropPath, "w1280") : null;

  const genres = (() => {
    const ids =
      movie.genre_ids ||
      (Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : []);
    const names = ids.map((id) => MOVIE_GENRES[id]).filter(Boolean);
    return names.slice(0, 3).join(" • ");
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
          <div className="absolute inset-0 bg-neutral-900 animate-pulse" />
        )}

        {!showTrailer && backdropReady && bgSrc && (
          <img
            src={bgSrc}
            alt={movie.title || movie.name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            decoding="async"
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
                  className="absolute left-1/2 top-1/2 w-[140%] h-[180%] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
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
              {yearOf(movie) && <span>{yearOf(movie)}</span>}
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
                <span className="font-medium">{ratingOf(movie)}</span>
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

/* ---------- Sección reusable (cada fila) ---------- */
function Row({ title, items, isMobile, posterCacheRef }) {
  if (!items || items.length === 0) return null;

  // ✅ Detectar si es una fila de género específico
  const isGenreRow =
    ![
      "Populares",
      "Taquillazos imprescindibles",
      "Superéxito",
      "Historias de venganza",
      "Top 10 hoy en España",
      "Tendencias ahora mismo",
      "Lo mejor de 2020",
      "Clásicos de los 90",
      "Favoritas de los 2000",
      "Hits de 2010",
      "Recientes de 2020",
    ].includes(title) &&
    !title.includes("década") &&
    !title.includes("Clásicos") &&
    !title.includes("Favoritas") &&
    !title.includes("Hits") &&
    !title.includes("Recientes");

  // ✅ Determinar etiqueta específica según el título
  let labelText = null;
  if (title === "Top 10 hoy en España") {
    labelText = "TOP 10";
  } else if (title === "Taquillazos imprescindibles") {
    labelText = "IMPRESCINDIBLES";
  } else if (title === "Historias de venganza") {
    labelText = "SUPERHEROES";
  } else if (title === "Tendencias ahora mismo") {
    labelText = "TENDENCIAS";
  } else if (title === "Lo mejor de 2020") {
    labelText = "AÑOS 2020";
  } else if (title === "Clásicos de los 90") {
    labelText = "AÑOS 90";
  } else if (title === "Favoritas de los 2000") {
    labelText = "AÑOS 2000";
  } else if (title === "Hits de 2010") {
    labelText = "AÑOS 2010";
  } else if (title === "Recientes de 2020") {
    labelText = "AÑOS 2020";
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
          {items.map((m, i) => (
            <SwiperSlide key={m.id} className="select-none">
              <Top10MobileBackdropCard movie={m} rank={i + 1} />
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
          {items.map((m, i) => {
            const isActive = !isMobile && hoveredId === m.id;
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
                  if (!isMobile) setHoveredId(m.id);
                }}
                onMouseLeave={() => {
                  if (!isMobile)
                    setHoveredId((prev) => (prev === m.id ? null : prev));
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
                        movie={m}
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
                        href={`/details/movie/${m.id}`}
                        className="block w-full h-full"
                      >
                        <PosterImage movie={m} cache={posterCacheRef} />
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );

            return (
              <SwiperSlide key={m.id} className="select-none md:!w-auto">
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
export default function MoviesPageClient({ initialData }) {
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

        {dashboardData["Superéxito"]?.length ? (
          <Row
            title="Taquillazos imprescindibles"
            items={dashboardData["Superéxito"]}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        ) : null}

        {dashboardData.action?.length > 0 && (
          <Row
            title="Acción taquillera"
            items={dashboardData.action}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        {dashboardData.scifi?.length > 0 && (
          <Row
            title="Ciencia ficción espectacular"
            items={dashboardData.scifi}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        {dashboardData.thrillers?.length > 0 && (
          <Row
            title="Thrillers intensos"
            items={dashboardData.thrillers}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        {dashboardData.mind?.length > 0 && (
          <Row
            title="Guiones complejos"
            items={dashboardData.mind}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        {dashboardData.romance?.length > 0 && (
          <Row
            title="Romance que enamora"
            items={dashboardData.romance}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        {dashboardData.vengeance?.length > 0 && (
          <Row
            title="Historias de venganza"
            items={dashboardData.vengeance}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        )}

        {dashboardData["Década de 1990"]?.length ? (
          <Row
            title="Clásicos de los 90"
            items={dashboardData["Década de 1990"]}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        ) : null}

        {dashboardData["Década de 2000"]?.length ? (
          <Row
            title="Favoritas de los 2000"
            items={dashboardData["Década de 2000"]}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        ) : null}

        {dashboardData["Década de 2010"]?.length ? (
          <Row
            title="Hits de 2010"
            items={dashboardData["Década de 2010"]}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        ) : null}

        {dashboardData["Década de 2020"]?.length ? (
          <Row
            title="Lo mejor de 2020"
            items={dashboardData["Década de 2020"]}
            isMobile={isMobile}
            posterCacheRef={posterCacheRef}
          />
        ) : null}

        <GenreRows
          groups={dashboardData["Por género"]}
          isMobile={isMobile}
          posterCacheRef={posterCacheRef}
        />
      </div>
    </div>
  );
}
