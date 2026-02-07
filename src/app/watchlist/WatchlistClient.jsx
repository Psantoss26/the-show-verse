// src/app/watchlist/WatchlistClient.jsx
"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { getExternalIds } from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { traktGetScoreboard } from "@/lib/api/traktClient";
import {
  Loader2,
  Bookmark,
  Film,
  ChevronDown,
  CheckCircle2,
  ArrowUpDown,
  Search,
  Star,
  X,
  Filter,
  SlidersHorizontal,
  LayoutList,
  Grid3x3,
  LayoutGrid,
  Layers3,
} from "lucide-react";

// ================== UTILS & CACHE ==================
// TMDb Genre mappings
const MOVIE_GENRES = {
  28: "Acción",
  12: "Aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familiar",
  14: "Fantasía",
  36: "Historia",
  27: "Terror",
  10402: "Música",
  9648: "Misterio",
  10749: "Romance",
  878: "Ciencia ficción",
  10770: "Película de TV",
  53: "Suspense",
  10752: "Bélica",
  37: "Western",
};

const TV_GENRES = {
  10759: "Acción y Aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familiar",
  10762: "Infantil",
  9648: "Misterio",
  10763: "Noticias",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Telenovela",
  10767: "Talk Show",
  10768: "Guerra y Política",
  37: "Western",
};

const posterChoiceCache = new Map();
const posterInFlight = new Map();

const backdropChoiceCache = new Map();
const backdropInFlight = new Map();

// Persistent score cache - 30 days TTL
const SCORE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Cache management for scores
function readScoreCache(source) {
  if (typeof window === "undefined") return new Map();
  try {
    const key = `showverse:scores:${source}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Map();

    const parsed = JSON.parse(raw);
    const now = Date.now();
    const cache = new Map();

    // Filter out expired entries
    Object.entries(parsed).forEach(([id, entry]) => {
      if (entry.t && now - entry.t < SCORE_CACHE_TTL_MS) {
        cache.set(id, entry.score);
      }
    });

    return cache;
  } catch {
    return new Map();
  }
}

function writeScoreCache(source, scoresMap) {
  if (typeof window === "undefined") return;
  try {
    const key = `showverse:scores:${source}`;
    const now = Date.now();
    const data = {};

    scoresMap.forEach((score, id) => {
      data[id] = { score, t: now };
    });

    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to write score cache:", e);
  }
}

function updateScoreCache(source, id, score) {
  if (typeof window === "undefined") return;
  try {
    const key = `showverse:scores:${source}`;
    const raw = window.localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : {};

    data[id] = { score, t: Date.now() };

    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to update score cache:", e);
  }
}

function buildImg(path, size = "w500") {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function clampNumber(v) {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function formatAvg(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function normText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

function getPosterPreference(type, id) {
  if (typeof window === "undefined") return null;
  const key =
    type === "tv"
      ? `showverse:tv:${id}:poster`
      : `showverse:movie:${id}:poster`;
  return window.localStorage.getItem(key) || null;
}

function pickBestPosterEN(posters) {
  if (!Array.isArray(posters) || posters.length === 0) return null;

  const maxVotes = posters.reduce(
    (max, p) => ((p.vote_count || 0) > max ? p.vote_count || 0 : max),
    0,
  );
  const withMaxVotes = posters.filter((p) => (p.vote_count || 0) === maxVotes);
  if (!withMaxVotes.length) return null;

  const preferredLangs = new Set(["en", "en-US"]);
  const enGroup = withMaxVotes.filter(
    (p) => p.iso_639_1 && preferredLangs.has(p.iso_639_1),
  );
  const nullLang = withMaxVotes.filter((p) => p.iso_639_1 === null);
  const candidates = enGroup.length
    ? enGroup
    : nullLang.length
      ? nullLang
      : withMaxVotes;

  return (
    [...candidates].sort((a, b) => {
      const va = (b.vote_average || 0) - (a.vote_average || 0);
      if (va !== 0) return va;
      return (b.width || 0) - (a.width || 0);
    })[0] || null
  );
}

function pickBestBackdropByLangResVotes(list, opts = {}) {
  const { preferLangs = ["en", "en-US"], minWidth = 1200 } = opts;
  if (!Array.isArray(list) || list.length === 0) return null;

  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean));
  const isPreferredLang = (img) => {
    // Excluir explícitamente imágenes sin idioma
    if (img?.iso_639_1 === null || img?.iso_639_1 === undefined) return false;
    return preferSet.has(norm(img?.iso_639_1));
  };

  const pool0 =
    minWidth > 0 ? list.filter((b) => (b?.width || 0) >= minWidth) : list;
  const pool = pool0.length ? pool0 : list;

  const top3en = [];
  for (const b of pool) {
    if (isPreferredLang(b)) top3en.push(b);
    if (top3en.length === 3) break;
  }
  if (!top3en.length) return null;

  const isRes = (b, w, h) => (b?.width || 0) === w && (b?.height || 0) === h;

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

async function fetchBestBackdropEN(type, id) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey || !type || !id) return null;
  try {
    const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${apiKey}&include_image_language=en,en-US`;
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return null;
    const j = await r.json();
    const best = pickBestBackdropByLangResVotes(j?.backdrops, {
      preferLangs: ["en", "en-US"],
      minWidth: 1200,
    });
    return best?.file_path || null;
  } catch {
    return null;
  }
}

async function getBestBackdropCached(type, id) {
  const key = `${type}:${id}`;
  if (backdropChoiceCache.has(key)) return backdropChoiceCache.get(key);
  if (backdropInFlight.has(key)) return backdropInFlight.get(key);

  const p = (async () => {
    const chosen = await fetchBestBackdropEN(type, id);
    backdropChoiceCache.set(key, chosen || null);
    backdropInFlight.delete(key);
    return chosen || null;
  })();

  backdropInFlight.set(key, p);
  return p;
}

async function fetchBestPosterEN(type, id) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey || !type || !id) return null;
  try {
    const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${apiKey}&include_image_language=en,en-US,null`;
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return null;
    const j = await r.json();
    return pickBestPosterEN(j?.posters)?.file_path || null;
  } catch {
    return null;
  }
}

async function getBestPosterCached(type, id) {
  const key = `${type}:${id}`;
  if (posterChoiceCache.has(key)) return posterChoiceCache.get(key);
  if (posterInFlight.has(key)) return posterInFlight.get(key);

  const p = (async () => {
    const chosen = await fetchBestPosterEN(type, id);
    posterChoiceCache.set(key, chosen || null);
    posterInFlight.delete(key);
    return chosen || null;
  })();

  posterInFlight.set(key, p);
  return p;
}

function SmartPoster({ item, title, mode = "poster" }) {
  const type = item.media_type || (item.title ? "movie" : "tv");
  const id = item.id;

  const [src, setSrc] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;

    setSrc(null);
    setReady(false);

    const load = async () => {
      if (mode === "backdrop") {
        const bestBackdrop = await getBestBackdropCached(type, id);
        const finalPath =
          bestBackdrop || item.backdrop_path || item.poster_path || null;
        const url = finalPath ? buildImg(finalPath, "w1280") : null;
        if (url) await preloadImage(url);
        if (!abort) {
          setSrc(url);
          setReady(!!url);
        }
        return;
      }

      const pref = getPosterPreference(type, id);
      if (pref) {
        const url = buildImg(pref, "w500");
        await preloadImage(url);
        if (!abort) {
          setSrc(url);
          setReady(true);
        }
        return;
      }

      const best = await getBestPosterCached(type, id);
      const finalPath = best || item.poster_path || item.backdrop_path || null;
      const url = finalPath ? buildImg(finalPath, "w500") : null;
      if (url) await preloadImage(url);
      if (!abort) {
        setSrc(url);
        setReady(!!url);
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [mode, type, id, item.poster_path, item.backdrop_path]);

  return (
    <div className="relative w-full h-full">
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 transition-opacity duration-300 ${ready && src ? "opacity-0" : "opacity-100"
          }`}
      >
        <Film className="w-8 h-8 text-neutral-700" />
      </div>

      {src ? (
        <img
          src={src}
          alt={title}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"
            }`}
        />
      ) : null}
    </div>
  );
}

function StatBox({ label, value, icon: Icon, imgSrc, colorClass }) {
  return (
    <div className="flex flex-col items-start min-w-0">
      <div className="flex items-center gap-1.5 mb-1 opacity-75 min-w-0">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={label}
            className="w-auto h-3 sm:h-3.5 object-contain opacity-85 shrink-0"
          />
        ) : Icon ? (
          <Icon
            className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${colorClass}`}
          />
        ) : null}

        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-400 truncate">
          {label}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-lg sm:text-xl font-black text-white tabular-nums tracking-tight leading-none truncate">
          {value}
        </span>
      </div>
    </div>
  );
}

function GroupDivider({ title, stats, count, total, groupBy }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <motion.div
      className="my-4 sm:my-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-[#0a0a0a] border border-white/[0.08]">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/[0.03] via-transparent to-transparent opacity-50" />

        <div className="relative px-3 sm:px-6 py-2.5 sm:py-5 flex items-center justify-between gap-3 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <div className="w-1 sm:w-1.5 h-8 sm:h-12 bg-gradient-to-b from-blue-500 to-cyan-600 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.4)] shrink-0" />

            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-2xl font-black tracking-tight text-white leading-tight line-clamp-1">
                {title}
              </h2>

              <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-sm text-zinc-500 font-medium flex items-center gap-x-1.5 sm:gap-x-2">
                <span className="text-zinc-300 font-bold">{count}</span>
                <span>items</span>
                <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-zinc-700" />
                <span className="opacity-90">{pct}%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {stats?.imdb?.avg != null &&
              typeof stats.imdb.avg === "number" &&
              !Number.isNaN(stats.imdb.avg) && (
                <StatBox
                  label="IMDb"
                  value={formatAvg(stats.imdb.avg)}
                  imgSrc="/logo-IMDb.png"
                />
              )}
            {stats?.trakt?.avg != null &&
              typeof stats.trakt.avg === "number" &&
              !Number.isNaN(stats.trakt.avg) && (
                <StatBox
                  label="Trakt"
                  value={formatAvg(stats.trakt.avg)}
                  imgSrc="/logo-Trakt.png"
                />
              )}
            {stats?.tmdb?.avg != null &&
              typeof stats.tmdb.avg === "number" &&
              !Number.isNaN(stats.tmdb.avg) && (
                <StatBox
                  label="TMDb"
                  value={formatAvg(stats.tmdb.avg)}
                  imgSrc="/logo-TMDb.png"
                />
              )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ================== UI COMPONENTS ==================
function InlineDropdown({ label, valueLabel, icon: Icon, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full lg:w-auto lg:shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-11 w-full inline-flex items-center justify-between gap-3 px-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-sm text-zinc-300 lg:min-w-[140px]"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-blue-500" />}
          <span className="text-zinc-500 font-bold text-xs uppercase tracking-wider">
            {label}:
          </span>
          <span className="font-semibold text-white truncate">
            {valueLabel}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute left-0 top-full z-[100] mt-2 w-48 rounded-xl border border-zinc-800 bg-[#121212] shadow-2xl overflow-hidden p-1"
          >
            {children({ close: () => setOpen(false) })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DropdownItem({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2 rounded-lg text-left text-sm transition flex items-center justify-between
        ${active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"}`}
    >
      <span className="font-medium">{children}</span>
      {active && <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />}
    </button>
  );
}

function AllGlyph({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function TvGlyph({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <path d="m17 2-5 5-5-5" />
    </svg>
  );
}

function PosterGlyph({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 12h6" opacity="0.5" />
    </svg>
  );
}

function BackdropGlyph({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 15l5.5-5.5L12 13l3.5-3.5L21 15" opacity="0.5" />
    </svg>
  );
}

// ================== CARD COMPONENTS ==================
function WatchlistCard({
  item,
  index = 0,
  totalItems = 0,
  viewMode = "grid",
  imageMode = "poster",
  imdbScore: initialImdbScore,
  traktScore: initialTraktScore,
  userRating,
}) {
  const type = item.media_type || (item.title ? "movie" : "tv");
  const title = item.title || item.name || "Sin título";
  const year =
    item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4) || "";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
  const genreIds = item.genre_ids || [];
  const genreMap = type === "movie" ? MOVIE_GENRES : TV_GENRES;
  const firstGenre = genreIds.length > 0 ? genreMap[genreIds[0]] : null;

  const [imdbScore, setImdbScore] = useState(initialImdbScore);
  const [traktScore, setTraktScore] = useState(initialTraktScore);
  const [loadingScores, setLoadingScores] = useState(false);

  const animDelay =
    totalItems > 20 ? Math.min(index * 0.015, 0.25) : index * 0.03;
  const shouldAnimate = index < 60;

  const href =
    type === "movie" ? `/details/movie/${item.id}` : `/details/tv/${item.id}`;

  // Determine which image mode to use based on viewMode and imageMode preference
  const effectiveImageMode = viewMode === "list" ? "backdrop" : imageMode;

  // Dynamic aspect ratio based on image mode
  const aspectRatio =
    effectiveImageMode === "backdrop" ? "aspect-[16/9]" : "aspect-[2/3]";

  // Load scores on hover if not in cache
  const handleHover = useCallback(async () => {
    if (loadingScores || (imdbScore && traktScore)) return;

    setLoadingScores(true);

    try {
      const itemId = String(item.id);

      // Load IMDb score if not available
      if (!imdbScore) {
        const cachedImdb = readScoreCache("imdb");
        if (cachedImdb.has(itemId)) {
          setImdbScore(cachedImdb.get(itemId));
        } else {
          // Fetch from API
          try {
            const externalIds = await getExternalIds(type, item.id);
            const imdbId = externalIds?.imdb_id;

            if (imdbId) {
              const omdbData = await fetchOmdbByImdb(imdbId);
              const imdbRating = omdbData?.imdbRating;

              if (imdbRating && imdbRating !== "N/A") {
                const numRating = parseFloat(imdbRating);
                if (!isNaN(numRating)) {
                  setImdbScore(numRating);
                  updateScoreCache("imdb", itemId, numRating);
                }
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch IMDb score for ${item.id}:`, err);
          }
        }
      }

      // Load Trakt score if not available
      if (!traktScore) {
        const cachedTrakt = readScoreCache("trakt");
        if (cachedTrakt.has(itemId)) {
          setTraktScore(cachedTrakt.get(itemId));
        } else {
          // Fetch from API
          try {
            const traktData = await traktGetScoreboard({
              type,
              tmdbId: item.id,
            });
            const traktRating = traktData?.community?.rating;

            if (
              traktRating &&
              typeof traktRating === "number" &&
              !isNaN(traktRating)
            ) {
              setTraktScore(traktRating);
              updateScoreCache("trakt", itemId, traktRating);
            } else if (rating) {
              // Fallback to TMDb rating
              const tmdbRating = parseFloat(rating);
              if (!isNaN(tmdbRating)) {
                setTraktScore(tmdbRating);
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch Trakt score for ${item.id}:`, err);
            // Fallback to TMDb rating
            if (rating) {
              const tmdbRating = parseFloat(rating);
              if (!isNaN(tmdbRating)) {
                setTraktScore(tmdbRating);
              }
            }
          }
        }
      }
    } finally {
      setLoadingScores(false);
    }
  }, [imdbScore, traktScore, loadingScores, item.id, type, rating]);

  if (viewMode === "list") {
    return (
      <motion.div
        initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.95 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{
          duration: 0.25,
          delay: shouldAnimate ? animDelay : 0,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        layout
      >
        <Link
          href={href}
          className="block bg-zinc-900/30 border border-white/5 rounded-xl hover:border-blue-500/30 hover:bg-zinc-900/60 transition-colors group overflow-hidden"
        >
          <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4">
            <div className="w-[140px] sm:w-[210px] aspect-video rounded-lg overflow-hidden relative shadow-md border border-white/5 bg-zinc-900 shrink-0">
              <SmartPoster
                item={item}
                title={title}
                mode={effectiveImageMode}
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="flex items-center gap-2">
                <h4 className="text-white font-bold text-base leading-tight truncate">
                  {title}
                </h4>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 -ml-0.5">
                <span
                  className={`font-bold uppercase tracking-wider text-[9px] px-1 rounded-sm ${type === "movie"
                    ? "bg-sky-500/10 text-sky-500"
                    : "bg-purple-500/10 text-purple-500"
                    }`}
                >
                  {type === "movie" ? "PELÍCULA" : "SERIE"}
                </span>
                {year && (
                  <>
                    <span>•</span>
                    <span>{year}</span>
                  </>
                )}
                {rating && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      {rating}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  if (viewMode === "compact") {
    return (
      <motion.div
        initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.95 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{
          duration: 0.25,
          delay: shouldAnimate ? animDelay : 0,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        layout
      >
        <Link href={href} className="block">
          <motion.div
            className={`relative ${aspectRatio} group rounded-lg overflow-hidden bg-zinc-900 border border-white/5 shadow-md`}
            whileHover={{
              scale: 1.15,
              zIndex: 50,
              boxShadow:
                "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
              borderColor: "rgba(59, 130, 246, 0.4)",
            }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{ transformOrigin: "center center" }}
            onMouseEnter={handleHover}
          >
            <SmartPoster item={item} title={title} mode={effectiveImageMode} />
            {/* Overlay con gradientes */}
            <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {/* Top gradient con tipo y ratings */}
              <div className="p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                <span
                  className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shadow-sm backdrop-blur-md ${type === "movie"
                    ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                    : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                    }`}
                >
                  {type === "movie" ? "PELÍCULA" : "SERIE"}
                </span>

                <div className="flex flex-col items-end gap-1">
                  {rating && (
                    <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                      <span className="text-emerald-400 text-xs font-black font-mono tracking-tight">
                        {rating}
                      </span>
                      <img
                        src="/logo-TMDb.png"
                        alt=""
                        className="w-auto h-2.5 opacity-100"
                      />
                    </div>
                  )}
                  {imdbScore && (
                    <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                      <span className="text-yellow-400 text-xs font-black font-mono tracking-tight">
                        {imdbScore}
                      </span>
                      <img
                        src="/logo-IMDb.png"
                        alt=""
                        className="w-auto h-3 opacity-100"
                      />
                    </div>
                  )}
                  {traktScore && (
                    <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                      <span className="text-pink-400 text-xs font-black font-mono tracking-tight">
                        {typeof traktScore === "number"
                          ? traktScore.toFixed(1)
                          : traktScore}
                      </span>
                      <img
                        src="/logo-Trakt.png"
                        alt=""
                        className="w-auto h-2.5 opacity-100"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom gradient con título y año */}
              <div className="p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0 text-left flex-1">
                    <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md text-xs">
                      {title}
                    </h3>
                    <p className="text-yellow-500 text-[10px] font-bold mt-0.5 drop-shadow-md">
                      {year}
                      {firstGenre && ` • ${firstGenre}`}
                    </p>
                  </div>
                  {userRating && (
                    <span className="text-yellow-400 text-lg font-black font-mono tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,1)] shrink-0">
                      {userRating}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </Link>
      </motion.div>
    );
  }

  // Grid mode
  return (
    <motion.div
      initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, delay: shouldAnimate ? animDelay : 0 }}
    >
      <Link href={href} className="block">
        <div
          className={`relative ${aspectRatio} group rounded-xl overflow-hidden bg-zinc-900 border border-white/5 shadow-md lg:hover:shadow-blue-900/20 transition-all`}
          onMouseEnter={handleHover}
        >
          <SmartPoster item={item} title={title} mode={effectiveImageMode} />
          {/* Mobile overlay - bottom only */}
          <div className="absolute inset-x-0 bottom-0 z-10 lg:hidden p-3 pt-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none">
            <div className="flex items-center gap-2 mb-1 -ml-0.5">
              <span
                className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${type === "movie"
                  ? "bg-sky-500/20 text-sky-200"
                  : "bg-purple-500/20 text-purple-200"
                  }`}
              >
                {type === "movie" ? "Cine" : "TV"}
              </span>
              {year && (
                <span className="text-[10px] text-zinc-300/80 font-medium">
                  {year}
                </span>
              )}
            </div>
            <h5 className="text-white font-bold text-xs leading-tight line-clamp-2">
              {title}
            </h5>
            {rating && (
              <div className="mt-0.5 text-[10px] text-amber-300/90 flex items-center gap-1">
                <Star className="w-2.5 h-2.5 fill-amber-300" />
                {rating}
              </div>
            )}
          </div>
          {/* Overlay con gradientes */}
          <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {/* Top gradient con tipo y ratings */}
            <div className="p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
              <span
                className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shadow-sm backdrop-blur-md ${type === "movie"
                  ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                  : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                  }`}
              >
                {type === "movie" ? "PELÍCULA" : "SERIE"}
              </span>

              <div className="flex flex-col items-end gap-1">
                {rating && (
                  <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                    <span className="text-emerald-400 text-xs font-black font-mono tracking-tight">
                      {rating}
                    </span>
                    <img
                      src="/logo-TMDb.png"
                      alt=""
                      className="w-auto h-2.5 opacity-100"
                    />
                  </div>
                )}
                {imdbScore && (
                  <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                    <span className="text-yellow-400 text-xs font-black font-mono tracking-tight">
                      {imdbScore}
                    </span>
                    <img
                      src="/logo-IMDb.png"
                      alt=""
                      className="w-auto h-3 opacity-100"
                    />
                  </div>
                )}
                {traktScore && (
                  <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                    <span className="text-pink-400 text-xs font-black font-mono tracking-tight">
                      {typeof traktScore === "number"
                        ? traktScore.toFixed(1)
                        : traktScore}
                    </span>
                    <img
                      src="/logo-Trakt.png"
                      alt=""
                      className="w-auto h-2.5 opacity-100"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Bottom gradient con título y año */}
            <div className="p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 text-left flex-1">
                  <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md text-sm">
                    {title}
                  </h3>
                  <p className="text-yellow-500 text-xs font-bold mt-0.5 drop-shadow-md">
                    {year}
                    {firstGenre && ` • ${firstGenre}`}
                  </p>
                </div>
                {userRating && (
                  <span className="text-yellow-400 text-xl font-black font-mono tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,1)] shrink-0">
                    {userRating}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ================== MAIN COMPONENT ==================
export default function WatchlistClient() {
  const { session, account, hydrated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [imdbScores, setImdbScores] = useState(new Map());
  const [traktScores, setTraktScores] = useState(new Map());
  const [loadingImdb, setLoadingImdb] = useState(false);
  const [loadingTrakt, setLoadingTrakt] = useState(false);

  // Filter states with localStorage persistence
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return "grid";
    const saved = window.localStorage.getItem("showverse:watchlist:viewMode");
    return saved === "list" || saved === "grid" || saved === "compact"
      ? saved
      : "grid";
  });

  const [typeFilter, setTypeFilter] = useState(() => {
    if (typeof window === "undefined") return "all";
    const saved = window.localStorage.getItem("showverse:watchlist:typeFilter");
    return saved || "all";
  });

  const [sortBy, setSortBy] = useState(() => {
    if (typeof window === "undefined") return "title-asc";
    const saved = window.localStorage.getItem("showverse:watchlist:sortBy");
    return saved || "title-asc";
  });

  const [imageMode, setImageMode] = useState(() => {
    if (typeof window === "undefined") return "poster";
    const saved = window.localStorage.getItem("showverse:watchlist:imageMode");
    return saved === "backdrop" ? "backdrop" : "poster";
  });

  const [groupBy, setGroupBy] = useState(() => {
    if (typeof window === "undefined") return "none";
    const saved = window.localStorage.getItem("showverse:watchlist:groupBy");
    return saved || "none";
  });

  const [q, setQ] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Persist filter states
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:watchlist:viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:watchlist:typeFilter", typeFilter);
  }, [typeFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:watchlist:sortBy", sortBy);
  }, [sortBy]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:watchlist:imageMode", imageMode);
  }, [imageMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:watchlist:groupBy", groupBy);
  }, [groupBy]);

  // Load watchlist
  useEffect(() => {
    const loadWatchlist = async () => {
      if (!session || !account?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch("/api/tmdb/account/watchlist");

        if (!response.ok) {
          console.error("API error:", response.status, response.statusText);
          setItems([]);
          return;
        }

        const text = await response.text();
        if (!text) {
          console.error("Empty response from API");
          setItems([]);
          return;
        }

        const data = JSON.parse(text);
        const watchlist = data?.watchlist || [];

        // Add index for sorting by added date (most recent first from API)
        const watchlistWithIndex = watchlist.map((item, index) => ({
          ...item,
          _addedIndex: index,
        }));

        setItems(watchlistWithIndex);
      } catch (error) {
        console.error("Error loading watchlist:", error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    loadWatchlist();
  }, [session, account]);

  // Load IMDb scores from cache on mount
  useEffect(() => {
    if (items.length === 0) return;

    // Always load from cache to show stats in all grouping modes
    const cachedScores = readScoreCache("imdb");
    if (cachedScores.size > 0) {
      setImdbScores(cachedScores);
    }
  }, [items]);

  // Load Trakt scores from cache on mount
  useEffect(() => {
    if (items.length === 0) return;

    // Always load from cache to show stats in all grouping modes
    const cachedScores = readScoreCache("trakt");
    if (cachedScores.size > 0) {
      setTraktScores(cachedScores);
    }
  }, [items]);

  // Load IMDb scores when grouping by IMDb rating
  useEffect(() => {
    if (groupBy !== "imdb_rating" || items.length === 0 || loadingImdb) return;

    const loadImdbScores = async () => {
      // Load from cache first and show immediately
      const cachedScores = readScoreCache("imdb");
      const scores = new Map(cachedScores);

      // Show cached scores immediately
      if (cachedScores.size > 0) {
        setImdbScores(new Map(scores));
      }

      // Identify items that need fetching
      const itemsToFetch = items.filter(
        (item) => !cachedScores.has(String(item.id)),
      );

      if (itemsToFetch.length === 0) {
        setLoadingImdb(false);
        return;
      }

      setLoadingImdb(true);

      try {
        let fetchedCount = 0;
        const newScores = new Map();

        // Process items with limited concurrency (3 at a time)
        const processItem = async (item) => {
          const type = item.media_type || (item.title ? "movie" : "tv");

          try {
            const externalIds = await getExternalIds(type, item.id);
            const imdbId = externalIds?.imdb_id;

            if (imdbId) {
              const omdbData = await fetchOmdbByImdb(imdbId);
              const rating = omdbData?.imdbRating;

              if (rating && rating !== "N/A") {
                const numRating = parseFloat(rating);
                if (!isNaN(numRating)) {
                  scores.set(String(item.id), numRating);
                  newScores.set(String(item.id), numRating);
                  fetchedCount++;

                  // Update state immediately for progressive display
                  setImdbScores(new Map(scores));
                }
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch IMDb score for ${item.id}:`, err);
          }
        };

        // Process in batches of 3 concurrent requests
        const batchSize = 3;
        for (let i = 0; i < itemsToFetch.length; i += batchSize) {
          const batch = itemsToFetch.slice(i, i + batchSize);
          await Promise.all(batch.map(processItem));
        }

        // Save all new scores to cache at once
        if (fetchedCount > 0) {
          writeScoreCache("imdb", scores);
        }
      } catch (error) {
        console.error("Error loading IMDb scores:", error);
      } finally {
        setLoadingImdb(false);
      }
    };

    loadImdbScores();
  }, [groupBy, items]);

  // Load Trakt scores when grouping by Trakt rating
  useEffect(() => {
    if (groupBy !== "trakt_rating" || items.length === 0 || loadingTrakt)
      return;

    const loadTraktScores = async () => {
      // Load from cache first and show immediately
      const cachedScores = readScoreCache("trakt");
      const scores = new Map(cachedScores);

      // Show cached scores immediately
      if (cachedScores.size > 0) {
        setTraktScores(new Map(scores));
      }

      // Identify items that need fetching
      const itemsToFetch = items.filter(
        (item) => !cachedScores.has(String(item.id)),
      );

      // For items without cache, use TMDb ratings as fallback immediately
      itemsToFetch.forEach((item) => {
        if (
          item.vote_average &&
          typeof item.vote_average === "number" &&
          !isNaN(item.vote_average)
        ) {
          scores.set(String(item.id), item.vote_average);
        }
      });

      // Show TMDb fallback scores immediately
      setTraktScores(new Map(scores));

      if (itemsToFetch.length === 0) {
        setLoadingTrakt(false);
        return;
      }

      setLoadingTrakt(true);

      try {
        let fetchedCount = 0;
        const newScores = new Map();

        // Process items with limited concurrency (3 at a time)
        const processItem = async (item) => {
          const type = item.media_type || (item.title ? "movie" : "tv");

          try {
            const traktData = await traktGetScoreboard({
              type,
              tmdbId: item.id,
            });
            const rating = traktData?.community?.rating;

            if (rating && typeof rating === "number" && !isNaN(rating)) {
              scores.set(String(item.id), rating);
              newScores.set(String(item.id), rating);
              fetchedCount++;

              // Update state immediately for progressive display
              setTraktScores(new Map(scores));
            }
          } catch (err) {
            // Fallback to TMDb rating already set, just log warning
            console.warn(
              `[Trakt] Failed to fetch score for ${item.id}, using TMDb fallback:`,
              err,
            );
          }
        };

        // Process in batches of 3 concurrent requests
        const batchSize = 3;
        for (let i = 0; i < itemsToFetch.length; i += batchSize) {
          const batch = itemsToFetch.slice(i, i + batchSize);
          await Promise.all(batch.map(processItem));
        }

        // Save all new scores to cache at once
        if (fetchedCount > 0) {
          writeScoreCache("trakt", scores);
        }
      } catch (error) {
        console.error("Error loading Trakt scores:", error);
      } finally {
        setLoadingTrakt(false);
      }
    };

    loadTraktScores();
  }, [groupBy, items]);

  // Filter and sort
  const filtered = useMemo(() => {
    const needle = normText(q);
    return items.filter((item) => {
      const type = item.media_type || (item.title ? "movie" : "tv");
      if (typeFilter === "movies" && type !== "movie") return false;
      if (typeFilter === "shows" && type !== "tv") return false;
      if (needle) {
        const title = normText(item.title || item.name || "");
        if (!title.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, typeFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "title-asc") {
      return arr.sort((a, b) => {
        const titleA = (a.title || a.name || "").toLowerCase();
        const titleB = (b.title || b.name || "").toLowerCase();
        return titleA.localeCompare(titleB);
      });
    }
    if (sortBy === "title-desc") {
      return arr.sort((a, b) => {
        const titleA = (a.title || a.name || "").toLowerCase();
        const titleB = (b.title || b.name || "").toLowerCase();
        return titleB.localeCompare(titleA);
      });
    }
    if (sortBy === "rating-desc") {
      return arr.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    }
    if (sortBy === "rating-asc") {
      return arr.sort((a, b) => (a.vote_average || 0) - (b.vote_average || 0));
    }
    if (sortBy === "added-desc") {
      // Most recent added first (lower index = more recent)
      return arr.sort((a, b) => (a._addedIndex || 0) - (b._addedIndex || 0));
    }
    if (sortBy === "added-asc") {
      // Oldest added first (higher index = older)
      return arr.sort((a, b) => (b._addedIndex || 0) - (a._addedIndex || 0));
    }
    return arr;
  }, [filtered, sortBy]);

  const stats = useMemo(() => {
    let movies = 0;
    let shows = 0;
    for (const item of filtered) {
      const type = item.media_type || (item.title ? "movie" : "tv");
      if (type === "movie") movies++;
      else shows++;
    }
    return { total: filtered.length, movies, shows };
  }, [filtered]);

  // Grouping logic (sin user_rating)
  const grouped = useMemo(() => {
    if (groupBy === "none") return null;

    // Don't show grouped view while loading external scores
    if (groupBy === "imdb_rating" && loadingImdb) return null;
    if (groupBy === "trakt_rating" && loadingTrakt) return null;

    const groups = new Map();

    for (const item of sorted) {
      const processGroup = (groupKey, groupLabel) => {
        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            key: groupKey,
            label: groupLabel,
            items: [],
            stats: {
              tmdb: { sum: 0, count: 0, avg: 0 },
              imdb: { sum: 0, count: 0, avg: 0 },
              trakt: { sum: 0, count: 0, avg: 0 },
            },
          });
        }

        const group = groups.get(groupKey);
        group.items.push(item);

        // Calculate stats
        if (item.vote_average) {
          group.stats.tmdb.sum += item.vote_average;
          group.stats.tmdb.count++;
        }
        const imdbRating = imdbScores.get(String(item.id));
        if (imdbRating) {
          group.stats.imdb.sum += imdbRating;
          group.stats.imdb.count++;
        }
        const traktRating = traktScores.get(String(item.id));
        if (traktRating) {
          group.stats.trakt.sum += traktRating;
          group.stats.trakt.count++;
        }
      };

      if (groupBy === "genre") {
        const type = item.media_type || (item.title ? "movie" : "tv");
        const genreMap = type === "movie" ? MOVIE_GENRES : TV_GENRES;
        const genreIds = item.genre_ids || [];

        if (genreIds.length === 0) {
          processGroup("no_genre", "Sin género");
        } else {
          // Add item to each genre group it belongs to
          genreIds.forEach((genreId) => {
            const genreName = genreMap[genreId] || `Género ${genreId}`;
            processGroup(String(genreId), genreName);
          });
        }
      } else {
        let groupKey = "";
        let groupLabel = "";

        if (groupBy === "year") {
          const year = (item.release_date || item.first_air_date || "").slice(
            0,
            4,
          );
          groupKey = year || "Sin año";
          groupLabel = year || "Sin año";
        } else if (groupBy === "decade") {
          const year = (item.release_date || item.first_air_date || "").slice(
            0,
            4,
          );
          if (year) {
            const decade = Math.floor(parseInt(year) / 10) * 10;
            groupKey = decade.toString();
            groupLabel = `${decade}s`;
          } else {
            groupKey = "Sin década";
            groupLabel = "Sin década";
          }
        } else if (groupBy === "tmdb_rating") {
          const rating = item.vote_average || 0;
          const bucket = Math.floor(rating);
          groupKey = bucket.toString();
          groupLabel = `${bucket} - ${bucket + 1}`;
        } else if (groupBy === "imdb_rating") {
          const rating = imdbScores.get(String(item.id)) || 0;
          if (!rating) {
            groupKey = "no_imdb";
            groupLabel = "Sin puntuación IMDb";
          } else {
            const bucket = Math.floor(rating);
            groupKey = bucket.toString();
            groupLabel = `${bucket} - ${bucket + 1}`;
          }
        } else if (groupBy === "trakt_rating") {
          const rating = traktScores.get(String(item.id)) || 0;
          if (!rating) {
            groupKey = "no_trakt";
            groupLabel = "Sin puntuación Trakt";
          } else {
            const bucket = Math.floor(rating);
            groupKey = bucket.toString();
            groupLabel = `${bucket} - ${bucket + 1}`;
          }
        }

        processGroup(groupKey, groupLabel);
      }
    }

    // Calculate averages
    for (const group of groups.values()) {
      if (group.stats.tmdb.count > 0) {
        group.stats.tmdb.avg = group.stats.tmdb.sum / group.stats.tmdb.count;
      }
      if (group.stats.imdb.count > 0) {
        group.stats.imdb.avg = group.stats.imdb.sum / group.stats.imdb.count;
      }
      if (group.stats.trakt.count > 0) {
        group.stats.trakt.avg = group.stats.trakt.sum / group.stats.trakt.count;
      }
    }

    // Sort groups
    const groupsArray = Array.from(groups.values());
    if (groupBy === "year" || groupBy === "decade") {
      groupsArray.sort((a, b) => {
        if (a.key === "Sin año" || a.key === "Sin década") return 1;
        if (b.key === "Sin año" || b.key === "Sin década") return -1;
        return parseInt(b.key) - parseInt(a.key);
      });
    } else if (groupBy.includes("rating")) {
      groupsArray.sort((a, b) => {
        // Put groups without ratings at the end
        const aNoRating = ["no_imdb", "no_trakt"].includes(a.key);
        const bNoRating = ["no_imdb", "no_trakt"].includes(b.key);

        if (aNoRating && !bNoRating) return 1;
        if (!aNoRating && bNoRating) return -1;
        if (aNoRating && bNoRating) return 0;

        return parseInt(b.key) - parseInt(a.key);
      });
    } else if (groupBy === "genre") {
      // Sort alphabetically by genre name, but "Sin género" at the end
      groupsArray.sort((a, b) => {
        if (a.key === "no_genre") return 1;
        if (b.key === "no_genre") return -1;
        return a.label.localeCompare(b.label);
      });
    }

    return groupsArray;
  }, [sorted, groupBy, imdbScores, traktScores, loadingImdb, loadingTrakt]);

  if (!hydrated) {
    // Still checking authentication, show nothing or loader
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!session || !account) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <Bookmark className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Inicia sesión</h2>
          <p className="text-zinc-500 mb-6">
            Necesitas iniciar sesión para ver tu lista
          </p>
          <Link
            href="/login"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition"
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-blue-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header */}
        <motion.header
          className="mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px w-12 bg-blue-500" />
                <span className="text-blue-400 font-bold uppercase tracking-widest text-xs">
                  POR VER
                </span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                Pendientes<span className="text-blue-500">.</span>
              </h1>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg">
                Títulos guardados para ver más tarde.
              </p>
            </div>

            <motion.div
              className="flex gap-3 md:gap-4 w-full lg:w-auto justify-center lg:justify-end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="flex-1 lg:flex-none lg:min-w-[120px] bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="p-1.5 md:p-2 rounded-full bg-white/5 mb-1 text-blue-400">
                  <Bookmark className="w-4 h-4 md:w-5 md:h-5 fill-blue-400" />
                </div>
                <div className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">
                  {loading ? (
                    <span className="inline-block h-6 md:h-8 w-10 md:w-14 rounded-lg bg-white/10 animate-pulse" />
                  ) : (
                    stats.total
                  )}
                </div>
                <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight">
                  Total
                </div>
              </div>
              <div className="flex-1 lg:flex-none lg:min-w-[120px] bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="p-1.5 md:p-2 rounded-full bg-white/5 mb-1 text-sky-400">
                  <Film className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <div className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">
                  {loading ? (
                    <span className="inline-block h-6 md:h-8 w-10 md:w-14 rounded-lg bg-white/10 animate-pulse" />
                  ) : (
                    stats.movies
                  )}
                </div>
                <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight">
                  Películas
                </div>
              </div>
              <div className="flex-1 lg:flex-none lg:min-w-[120px] bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="p-1.5 md:p-2 rounded-full bg-white/5 mb-1 text-purple-400">
                  <TvGlyph className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
                </div>
                <div className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">
                  {loading ? (
                    <span className="inline-block h-6 md:h-8 w-10 md:w-14 rounded-lg bg-white/10 animate-pulse" />
                  ) : (
                    stats.shows
                  )}
                </div>
                <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight">
                  Series
                </div>
              </div>
            </motion.div>
          </div>
        </motion.header>

        {/* Filters */}
        <motion.div
          ref={(el) => {
            if (el && !el.dataset.stickySetup) {
              el.dataset.stickySetup = 'true';
              const observer = new IntersectionObserver(
                ([e]) => {
                  const isStuck = e.intersectionRatio < 1;
                  if (isStuck) {
                    el.classList.add('backdrop-blur-xl', 'bg-gradient-to-br', 'from-black/60', 'via-black/50', 'to-black/55');
                  } else {
                    el.classList.remove('backdrop-blur-xl', 'bg-gradient-to-br', 'from-black/60', 'via-black/50', 'to-black/55');
                  }
                },
                { threshold: [1], rootMargin: '-65px 0px 0px 0px' }
              );
              observer.observe(el);
            }
          }}
          className="sticky top-16 z-[60] space-y-1 mb-3 p-2 rounded-2xl transition-all duration-300"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          {/* Mobile: search + toggle */}
          <div className="flex gap-2 lg:hidden">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar..."
                className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-zinc-600"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border transition-all ${mobileFiltersOpen
                ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile: collapsible filters */}
          <AnimatePresence>
            {mobileFiltersOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="lg:hidden overflow-visible"
              >
                <div className="space-y-3 pt-1">

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <InlineDropdown
                        label="Tipo"
                        valueLabel={
                          typeFilter === "all"
                            ? "Todo"
                            : typeFilter === "movies"
                              ? "Películas"
                              : "Series"
                        }
                        icon={Filter}
                      >
                        {({ close }) => (
                          <>
                            <DropdownItem
                              active={typeFilter === "all"}
                              onClick={() => {
                                setTypeFilter("all");
                                close();
                              }}
                            >
                              Todo
                            </DropdownItem>
                            <DropdownItem
                              active={typeFilter === "movies"}
                              onClick={() => {
                                setTypeFilter("movies");
                                close();
                              }}
                            >
                              Películas
                            </DropdownItem>
                            <DropdownItem
                              active={typeFilter === "shows"}
                              onClick={() => {
                                setTypeFilter("shows");
                                close();
                              }}
                            >
                              Series
                            </DropdownItem>
                          </>
                        )}
                      </InlineDropdown>
                    </div>
                    <div className="flex-1">
                      <InlineDropdown
                        label="Agrupar"
                        valueLabel={
                          groupBy === "none"
                            ? "Sin agrupar"
                            : groupBy === "year"
                              ? "Año"
                              : groupBy === "decade"
                                ? "Década"
                                : groupBy === "genre"
                                  ? "Género"
                                  : groupBy === "tmdb_rating"
                                    ? "TMDb"
                                    : groupBy === "imdb_rating"
                                      ? "IMDb"
                                      : "Trakt"
                        }
                        icon={Layers3}
                      >
                        {({ close }) => (
                          <>
                            <DropdownItem
                              active={groupBy === "none"}
                              onClick={() => {
                                setGroupBy("none");
                                close();
                              }}
                            >
                              Sin agrupar
                            </DropdownItem>
                            <DropdownItem
                              active={groupBy === "year"}
                              onClick={() => {
                                setGroupBy("year");
                                close();
                              }}
                            >
                              Por año
                            </DropdownItem>
                            <DropdownItem
                              active={groupBy === "decade"}
                              onClick={() => {
                                setGroupBy("decade");
                                close();
                              }}
                            >
                              Por década
                            </DropdownItem>
                            <DropdownItem
                              active={groupBy === "genre"}
                              onClick={() => {
                                setGroupBy("genre");
                                close();
                              }}
                            >
                              Por género
                            </DropdownItem>
                            <DropdownItem
                              active={groupBy === "tmdb_rating"}
                              onClick={() => {
                                setGroupBy("tmdb_rating");
                                close();
                              }}
                            >
                              Puntuación TMDb
                            </DropdownItem>
                            <DropdownItem
                              active={groupBy === "imdb_rating"}
                              onClick={() => {
                                setGroupBy("imdb_rating");
                                close();
                              }}
                            >
                              Puntuación IMDb
                            </DropdownItem>
                            <DropdownItem
                              active={groupBy === "trakt_rating"}
                              onClick={() => {
                                setGroupBy("trakt_rating");
                                close();
                              }}
                            >
                              Puntuación Trakt
                            </DropdownItem>
                          </>
                        )}
                      </InlineDropdown>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <InlineDropdown
                        label="Orden"
                        valueLabel={
                          sortBy === "title-asc"
                            ? "A-Z"
                            : sortBy === "title-desc"
                              ? "Z-A"
                              : sortBy === "rating-desc"
                                ? "Mejor"
                                : sortBy === "rating-asc"
                                  ? "Peor"
                                  : sortBy === "added-desc"
                                    ? "Reciente"
                                    : sortBy === "added-asc"
                                      ? "Antiguo"
                                      : "A-Z"
                        }
                        icon={ArrowUpDown}
                      >
                        {({ close }) => (
                          <>
                            <DropdownItem
                              active={sortBy === "title-asc"}
                              onClick={() => {
                                setSortBy("title-asc");
                                close();
                              }}
                            >
                              Título A-Z
                            </DropdownItem>
                            <DropdownItem
                              active={sortBy === "title-desc"}
                              onClick={() => {
                                setSortBy("title-desc");
                                close();
                              }}
                            >
                              Título Z-A
                            </DropdownItem>
                            <DropdownItem
                              active={sortBy === "rating-desc"}
                              onClick={() => {
                                setSortBy("rating-desc");
                                close();
                              }}
                            >
                              Valoración ↓
                            </DropdownItem>
                            <DropdownItem
                              active={sortBy === "rating-asc"}
                              onClick={() => {
                                setSortBy("rating-asc");
                                close();
                              }}
                            >
                              Valoración ↑
                            </DropdownItem>
                            <DropdownItem
                              active={sortBy === "added-desc"}
                              onClick={() => {
                                setSortBy("added-desc");
                                close();
                              }}
                            >
                              Añadido reciente
                            </DropdownItem>
                            <DropdownItem
                              active={sortBy === "added-asc"}
                              onClick={() => {
                                setSortBy("added-asc");
                                close();
                              }}
                            >
                              Añadido antiguo
                            </DropdownItem>
                          </>
                        )}
                      </InlineDropdown>
                    </div>
                    <div className="flex-1 flex gap-2">
                      <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center flex-1">
                        <button
                          onClick={() => setViewMode("list")}
                          className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "list"
                            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                            }`}
                        >
                          <LayoutList className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setViewMode("compact")}
                          className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "compact"
                            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                            }`}
                        >
                          <Grid3x3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setViewMode("grid")}
                          className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "grid"
                            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                            }`}
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        onClick={() => setImageMode(imageMode === "poster" ? "backdrop" : "poster")}
                        className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border transition-all ${imageMode === "backdrop"
                          ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                          }`}
                        title={imageMode === "poster" ? "Cambiar a Backdrop" : "Cambiar a Poster"}
                      >
                        {imageMode === "poster" ? <PosterGlyph className="w-4 h-4" /> : <BackdropGlyph className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop: Single row */}
          <div className="hidden lg:flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por título..."
                className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-zinc-600"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              )}
            </div>

            <InlineDropdown
              label="Tipo"
              valueLabel={
                typeFilter === "all"
                  ? "Todo"
                  : typeFilter === "movies"
                    ? "Películas"
                    : "Series"
              }
              icon={Filter}
            >
              {({ close }) => (
                <>
                  <DropdownItem
                    active={typeFilter === "all"}
                    onClick={() => {
                      setTypeFilter("all");
                      close();
                    }}
                  >
                    Todo
                  </DropdownItem>
                  <DropdownItem
                    active={typeFilter === "movies"}
                    onClick={() => {
                      setTypeFilter("movies");
                      close();
                    }}
                  >
                    Películas
                  </DropdownItem>
                  <DropdownItem
                    active={typeFilter === "shows"}
                    onClick={() => {
                      setTypeFilter("shows");
                      close();
                    }}
                  >
                    Series
                  </DropdownItem>
                </>
              )}
            </InlineDropdown>

            <InlineDropdown
              label="Ordenar"
              valueLabel={
                sortBy === "title-asc"
                  ? "A-Z"
                  : sortBy === "title-desc"
                    ? "Z-A"
                    : sortBy === "rating-desc"
                      ? "Mejor valorado"
                      : sortBy === "rating-asc"
                        ? "Peor valorado"
                        : sortBy === "added-desc"
                          ? "Añadido reciente"
                          : sortBy === "added-asc"
                            ? "Añadido antiguo"
                            : "A-Z"
              }
              icon={ArrowUpDown}
            >
              {({ close }) => (
                <>
                  <DropdownItem
                    active={sortBy === "title-asc"}
                    onClick={() => {
                      setSortBy("title-asc");
                      close();
                    }}
                  >
                    Título A-Z
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === "title-desc"}
                    onClick={() => {
                      setSortBy("title-desc");
                      close();
                    }}
                  >
                    Título Z-A
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === "rating-desc"}
                    onClick={() => {
                      setSortBy("rating-desc");
                      close();
                    }}
                  >
                    Valoración más alta
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === "rating-asc"}
                    onClick={() => {
                      setSortBy("rating-asc");
                      close();
                    }}
                  >
                    Valoración más baja
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === "added-desc"}
                    onClick={() => {
                      setSortBy("added-desc");
                      close();
                    }}
                  >
                    Añadido reciente
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === "added-asc"}
                    onClick={() => {
                      setSortBy("added-asc");
                      close();
                    }}
                  >
                    Añadido antiguo
                  </DropdownItem>
                </>
              )}
            </InlineDropdown>

            <InlineDropdown
              label="Agrupar"
              valueLabel={
                groupBy === "none"
                  ? "Sin agrupar"
                  : groupBy === "year"
                    ? "Por año"
                    : groupBy === "decade"
                      ? "Por década"
                      : groupBy === "genre"
                        ? "Por género"
                        : groupBy === "tmdb_rating"
                          ? "TMDb"
                          : groupBy === "imdb_rating"
                            ? "IMDb"
                            : "Trakt"
              }
              icon={Layers3}
            >
              {({ close }) => (
                <>
                  <DropdownItem
                    active={groupBy === "none"}
                    onClick={() => {
                      setGroupBy("none");
                      close();
                    }}
                  >
                    Sin agrupar
                  </DropdownItem>
                  <DropdownItem
                    active={groupBy === "year"}
                    onClick={() => {
                      setGroupBy("year");
                      close();
                    }}
                  >
                    Por año
                  </DropdownItem>
                  <DropdownItem
                    active={groupBy === "decade"}
                    onClick={() => {
                      setGroupBy("decade");
                      close();
                    }}
                  >
                    Por década
                  </DropdownItem>
                  <DropdownItem
                    active={groupBy === "genre"}
                    onClick={() => {
                      setGroupBy("genre");
                      close();
                    }}
                  >
                    Por género
                  </DropdownItem>
                  <DropdownItem
                    active={groupBy === "tmdb_rating"}
                    onClick={() => {
                      setGroupBy("tmdb_rating");
                      close();
                    }}
                  >
                    Puntuación TMDb
                  </DropdownItem>
                  <DropdownItem
                    active={groupBy === "imdb_rating"}
                    onClick={() => {
                      setGroupBy("imdb_rating");
                      close();
                    }}
                  >
                    Puntuación IMDb
                  </DropdownItem>
                  <DropdownItem
                    active={groupBy === "trakt_rating"}
                    onClick={() => {
                      setGroupBy("trakt_rating");
                      close();
                    }}
                  >
                    Puntuación Trakt
                  </DropdownItem>
                </>
              )}
            </InlineDropdown>

            <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center shrink-0">
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "list"
                  ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  }`}
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("compact")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "compact"
                  ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  }`}
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "grid"
                  ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  }`}
              >
                <PosterGlyph className="w-4 h-4" />
              </button>
            </div>

            <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center shrink-0">
              <button
                onClick={() => setImageMode("poster")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${imageMode === "poster"
                  ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                title="Vista Poster"
              >
                <PosterGlyph className="w-4 h-4" />
              </button>
              <button
                onClick={() => setImageMode("backdrop")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${imageMode === "backdrop"
                  ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                title="Vista Backdrop"
              >
                <BackdropGlyph className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        {loading ||
          (groupBy === "imdb_rating" && loadingImdb) ||
          (groupBy === "trakt_rating" && loadingTrakt) ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            {loadingImdb && groupBy === "imdb_rating" && (
              <p className="text-zinc-500 text-sm">
                Cargando puntuaciones de IMDb...
              </p>
            )}
            {loadingTrakt && groupBy === "trakt_rating" && (
              <p className="text-zinc-500 text-sm">
                Cargando puntuaciones de Trakt...
              </p>
            )}
          </div>
        ) : sorted.length === 0 ? (
          <motion.div
            className="py-24 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Bookmark className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-500 font-medium">
              No se encontraron títulos.
            </p>
            {q && (
              <button
                onClick={() => setQ("")}
                className="mt-4 text-blue-500 text-sm font-bold hover:underline"
              >
                Limpiar búsqueda
              </button>
            )}
          </motion.div>
        ) : grouped ? (
          // Grouped view
          <div className="space-y-8">
            {grouped.map((group) => (
              <div key={group.key}>
                <GroupDivider
                  title={group.label}
                  count={group.items.length}
                  total={sorted.length}
                  stats={group.stats}
                  groupBy={groupBy}
                />
                <AnimatePresence mode="wait">
                  {viewMode === "list" ? (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-6">
                      {group.items.map((item, idx) => (
                        <WatchlistCard
                          key={item.id}
                          item={item}
                          index={idx}
                          totalItems={group.items.length}
                          viewMode="list"
                          imageMode={imageMode}
                          imdbScore={imdbScores.get(String(item.id))}
                          traktScore={traktScores.get(String(item.id))}
                          userRating={item.user_rating}
                        />
                      ))}
                    </div>
                  ) : viewMode === "compact" ? (
                    <div
                      className={`grid gap-2 mt-6 ${imageMode === "backdrop"
                        ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4"
                        : "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8"
                        }`}
                    >
                      {group.items.map((item, idx) => (
                        <WatchlistCard
                          key={item.id}
                          item={item}
                          index={idx}
                          totalItems={group.items.length}
                          viewMode="compact"
                          imageMode={imageMode}
                          imdbScore={imdbScores.get(String(item.id))}
                          traktScore={traktScores.get(String(item.id))}
                          userRating={item.user_rating}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      className={`grid gap-3 mt-6 ${imageMode === "backdrop"
                        ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3"
                        : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6"
                        }`}
                    >
                      {group.items.map((item, idx) => (
                        <WatchlistCard
                          key={item.id}
                          item={item}
                          index={idx}
                          totalItems={group.items.length}
                          viewMode="grid"
                          imageMode={imageMode}
                          imdbScore={imdbScores.get(String(item.id))}
                          traktScore={traktScores.get(String(item.id))}
                          userRating={item.user_rating}
                        />
                      ))}
                    </div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {viewMode === "list" ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {sorted.map((item, idx) => (
                  <WatchlistCard
                    key={item.id}
                    item={item}
                    index={idx}
                    totalItems={sorted.length}
                    viewMode="list"
                    imageMode={imageMode}
                    imdbScore={imdbScores.get(String(item.id))}
                    traktScore={traktScores.get(String(item.id))}
                    userRating={item.user_rating}
                  />
                ))}
              </div>
            ) : viewMode === "compact" ? (
              <div
                className={`grid gap-2 ${imageMode === "backdrop"
                  ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4"
                  : "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8"
                  }`}
              >
                {sorted.map((item, idx) => (
                  <WatchlistCard
                    key={item.id}
                    item={item}
                    index={idx}
                    totalItems={sorted.length}
                    viewMode="compact"
                    imageMode={imageMode}
                    imdbScore={imdbScores.get(String(item.id))}
                    traktScore={traktScores.get(String(item.id))}
                    userRating={item.user_rating}
                  />
                ))}
              </div>
            ) : (
              <div
                className={`grid gap-3 ${imageMode === "backdrop"
                  ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3"
                  : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6"
                  }`}
              >
                {sorted.map((item, idx) => (
                  <WatchlistCard
                    key={item.id}
                    item={item}
                    index={idx}
                    totalItems={sorted.length}
                    viewMode="grid"
                    imageMode={imageMode}
                    imdbScore={imdbScores.get(String(item.id))}
                    traktScore={traktScores.get(String(item.id))}
                    userRating={item.user_rating}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
