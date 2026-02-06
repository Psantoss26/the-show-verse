// src/app/favorites/FavoritesClient.jsx
"use client";

import {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
  startTransition,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { getExternalIds } from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { traktGetItemStatus, traktGetScoreboard } from "@/lib/api/traktClient";
import {
  Loader2,
  Heart,
  Film,
  FilterX,
  ChevronDown,
  CheckCircle2,
  ArrowUpDown,
  Layers,
  Search,
  Star,
  X,
  Filter,
} from "lucide-react";

// ================== UTILS & CACHE ==================
const posterChoiceCache = new Map();
const posterInFlight = new Map();

const backdropChoiceCache = new Map();
const backdropInFlight = new Map();

const userRatingCache = new Map();
const userRatingInFlight = new Map();

const traktScoreCache = new Map();
const traktScoreInFlight = new Map();

let traktConnectedKnown = null;

const OMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_RATING_TTL_MS = 10 * 60 * 1000;
const USER_RATING_TTL_NULL_MS = 45 * 1000;
const TRAKT_SCORE_TTL_MS = 24 * 60 * 60 * 1000;

const TMDB_BASE = "https://api.themoviedb.org/3";

function buildImg(path, size = "w500") {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function clampNumber(v) {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function formatHalfSteps(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  const r = Math.round(v * 2) / 2;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
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
  const isPreferredLang = (img) => preferSet.has(norm(img?.iso_639_1));

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
    const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${apiKey}&include_image_language=en,en-US,null`;
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
        className={`absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 transition-opacity duration-300 ${
          ready && src ? "opacity-0" : "opacity-100"
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
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}
    </div>
  );
}

const readOmdbCache = (imdbId) => {
  if (!imdbId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`showverse:omdb:${imdbId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      fresh: Date.now() - (parsed?.t || 0) < OMDB_CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
};

const writeOmdbCache = (imdbId, patch) => {
  if (!imdbId || typeof window === "undefined") return;
  try {
    const prev = readOmdbCache(imdbId) || {};
    const next = {
      t: Date.now(),
      imdbRating: patch?.imdbRating ?? prev?.imdbRating ?? null,
    };
    window.sessionStorage.setItem(
      `showverse:omdb:${imdbId}`,
      JSON.stringify(next),
    );
  } catch {}
};

function runPool(items, limit, worker) {
  return new Promise((resolve) => {
    const queue = [...items];
    let active = 0;
    let done = 0;
    const total = queue.length;

    const next = () => {
      while (active < limit && queue.length) {
        const it = queue.shift();
        active++;
        Promise.resolve(worker(it))
          .catch(() => {})
          .finally(() => {
            active--;
            done++;
            if (done >= total) resolve();
            else next();
          });
      }
      if (total === 0) resolve();
    };

    next();
  });
}

function hasOwn(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function getScoreStatus(mapObj, key) {
  if (!hasOwn(mapObj, key)) return { status: "pending", value: null };
  const v = mapObj[key];
  if (typeof v === "number" && !Number.isNaN(v))
    return { status: "value", value: v };
  return { status: "none", value: null };
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
          {Icon && <Icon className="w-4 h-4 text-red-500" />}
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
      {active && <CheckCircle2 className="w-3.5 h-3.5 text-red-500" />}
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

function CardSkeleton({ mode = "poster" }) {
  const wrapAspect = mode === "backdrop" ? "aspect-[16/9]" : "aspect-[2/3]";

  return (
    <div
      className={`relative ${wrapAspect} w-full overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-white/5`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-800/50 via-neutral-900/50 to-neutral-800/50 animate-pulse" />
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"
        style={{
          backgroundSize: "200% 100%",
          animation: "shimmer 2s infinite",
        }}
      />
    </div>
  );
}

function GroupDivider({ title, stats, count, total, groupBy }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <motion.div
      className="my-8 sm:my-10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div className="relative overflow-hidden rounded-2xl bg-[#0a0a0a] border border-white/[0.08]">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/[0.03] via-transparent to-transparent opacity-50" />

        <div className="relative px-4 sm:px-6 py-4 sm:py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-1.5 h-10 sm:h-12 bg-gradient-to-b from-red-500 to-red-600 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.4)] shrink-0" />

            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight line-clamp-2 sm:line-clamp-1">
                {title}
              </h2>

              <div className="mt-1 text-xs sm:text-sm text-zinc-500 font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-zinc-300 font-bold">{count}</span>
                <span>items</span>
                <span className="hidden sm:inline w-1 h-1 rounded-full bg-zinc-700" />
                <span className="opacity-90">{pct}% del total</span>
              </div>
            </div>
          </div>

          <div className="pt-3 sm:pt-4 lg:pt-0 border-t border-white/5 lg:border-t-0 w-full lg:w-auto">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-4">
              {groupBy === "imdb_rating" &&
                stats?.imdb?.avg != null &&
                typeof stats.imdb.avg === "number" &&
                !Number.isNaN(stats.imdb.avg) && (
                  <StatBox
                    label="IMDb"
                    value={formatAvg(stats.imdb.avg)}
                    imgSrc="/logo-IMDb.png"
                  />
                )}
              {groupBy === "trakt_rating" &&
                stats?.trakt?.avg != null &&
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

              {stats?.my?.avg != null &&
                typeof stats.my.avg === "number" &&
                !Number.isNaN(stats.my.avg) && (
                  <div className="sm:pl-4 sm:border-l border-white/10">
                    <StatBox
                      label="Tu media"
                      value={formatAvg(stats.my.avg)}
                      icon={Star}
                      colorClass="text-amber-400 fill-amber-400"
                    />
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ================== CARD COMPONENTS ==================
function FavoriteCard({ item, index = 0, totalItems = 0, viewMode = "grid", imageMode = "poster" }) {
  const type = item.media_type || (item.title ? "movie" : "tv");
  const title = item.title || item.name || "Sin título";
  const year = item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4) || "";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

  const animDelay = totalItems > 20 ? Math.min(index * 0.015, 0.25) : index * 0.03;
  const shouldAnimate = index < 60;

  const href = type === "movie" ? `/details/movie/${item.id}` : `/details/tv/${item.id}`;

  // Determine which image mode to use based on viewMode and imageMode preference
  const effectiveImageMode = viewMode === "list" ? "backdrop" : imageMode;

  // Dynamic aspect ratio based on image mode
  const aspectRatio = effectiveImageMode === "backdrop" ? "aspect-[16/9]" : "aspect-[2/3]";

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
          className="block bg-zinc-900/30 border border-white/5 rounded-xl hover:border-red-500/30 hover:bg-zinc-900/60 transition-colors group overflow-hidden"
        >
          <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4">
            <div className="w-[140px] sm:w-[210px] aspect-video rounded-lg overflow-hidden relative shadow-md border border-white/5 bg-zinc-900 shrink-0">
              <SmartPoster item={item} title={title} mode={effectiveImageMode} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="flex items-center gap-2">
                <h4 className="text-white font-bold text-base leading-tight truncate">
                  {title}
                </h4>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 -ml-0.5">
                <span
                  className={`font-bold uppercase tracking-wider text-[9px] px-1 rounded-sm ${
                    type === "movie" ? "bg-sky-500/10 text-sky-500" : "bg-purple-500/10 text-purple-500"
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
              boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
              borderColor: "rgba(239, 68, 68, 0.4)",
            }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{ transformOrigin: "center center" }}
          >
            <SmartPoster item={item} title={title} mode={effectiveImageMode} />
            <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-end p-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                <div className="flex items-center gap-2 mb-1 -ml-0.5">
                  <span
                    className={`text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${
                      type === "movie" ? "bg-sky-500/40 text-sky-100" : "bg-purple-500/40 text-purple-100"
                    }`}
                  >
                    {type === "movie" ? "Película" : "Serie"}
                  </span>
                  {year && <span className="text-[8px] text-zinc-300/90 font-medium">{year}</span>}
                </div>
                <h5 className="text-white font-bold text-[10px] leading-tight line-clamp-2 mb-0.5">
                  {title}
                </h5>
                {rating && (
                  <div className="text-[9px] text-amber-300 font-semibold flex items-center gap-1">
                    <Star className="w-2.5 h-2.5 fill-amber-300" />
                    {rating}
                  </div>
                )}
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
        <div className={`relative ${aspectRatio} group rounded-xl overflow-hidden bg-zinc-900 border border-white/5 shadow-md lg:hover:shadow-red-900/20 transition-all`}>
          <SmartPoster item={item} title={title} mode={effectiveImageMode} />
          <div className="absolute inset-x-0 bottom-0 z-10 lg:hidden p-3 pt-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none">
            <div className="flex items-center gap-2 mb-1 -ml-0.5">
              <span
                className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${
                  type === "movie" ? "bg-sky-500/20 text-sky-200" : "bg-purple-500/20 text-purple-200"
                }`}
              >
                {type === "movie" ? "Cine" : "TV"}
              </span>
              {year && <span className="text-[10px] text-zinc-300/80 font-medium">{year}</span>}
            </div>
            <h5 className="text-white font-bold text-xs leading-tight line-clamp-2">{title}</h5>
            {rating && (
              <div className="mt-0.5 text-[10px] text-amber-300/90 flex items-center gap-1">
                <Star className="w-2.5 h-2.5 fill-amber-300" />
                {rating}
              </div>
            )}
          </div>
          <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-end p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
              <div className="flex items-center gap-2 mb-1 -ml-0.5">
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${
                    type === "movie" ? "bg-sky-500/30 text-sky-200" : "bg-purple-500/30 text-purple-200"
                  }`}
                >
                  {type === "movie" ? "Cine" : "TV"}
                </span>
                {year && <span className="text-[10px] text-zinc-300 font-medium">{year}</span>}
              </div>
              <h5 className="text-white font-bold text-xs leading-tight line-clamp-2">{title}</h5>
              {rating && (
                <div className="mt-0.5 text-[11px] text-amber-300/90 flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-300" />
                  {rating}
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ================== MAIN COMPONENT ==================
export default function FavoritesClient() {
  const { session, account } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  // Filter states with localStorage persistence
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return "grid";
    const saved = window.localStorage.getItem("showverse:favorites:viewMode");
    return saved === "list" || saved === "grid" || saved === "compact" ? saved : "grid";
  });

  const [typeFilter, setTypeFilter] = useState(() => {
    if (typeof window === "undefined") return "all";
    const saved = window.localStorage.getItem("showverse:favorites:typeFilter");
    return saved || "all";
  });

  const [sortBy, setSortBy] = useState(() => {
    if (typeof window === "undefined") return "title-asc";
    const saved = window.localStorage.getItem("showverse:favorites:sortBy");
    return saved || "title-asc";
  });

  const [imageMode, setImageMode] = useState(() => {
    if (typeof window === "undefined") return "poster";
    const saved = window.localStorage.getItem("showverse:favorites:imageMode");
    return saved === "backdrop" ? "backdrop" : "poster";
  });

  const [q, setQ] = useState("");

  // Persist filter states
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:favorites:viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:favorites:typeFilter", typeFilter);
  }, [typeFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:favorites:sortBy", sortBy);
  }, [sortBy]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:favorites:imageMode", imageMode);
  }, [imageMode]);

  // Load favorites
  useEffect(() => {
    const loadFavorites = async () => {
      if (!session || !account?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch("/api/tmdb/account/favorite");

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
        setItems(data?.favorites || []);
      } catch (error) {
        console.error("Error loading favorites:", error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    loadFavorites();
  }, [session, account]);

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

  if (!session || !account) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <Heart className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Inicia sesión</h2>
          <p className="text-zinc-500 mb-6">Necesitas iniciar sesión para ver tus favoritos</p>
          <Link
            href="/login"
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition"
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-red-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-red-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-pink-500/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header */}
        <motion.header
          className="mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px w-12 bg-red-500" />
                <span className="text-red-400 font-bold uppercase tracking-widest text-xs">COLECCIÓN</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                Favoritos<span className="text-red-500">.</span>
              </h1>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg">
                Tu colección personal de películas y series favoritas.
              </p>
            </div>
          </div>

          <motion.div
            className="grid grid-cols-3 gap-2 md:gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <div className="flex-1 min-w-0 bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-1 py-2 md:p-4 flex flex-col items-center justify-center gap-0.5 md:gap-1">
              <div className="p-1 md:p-2 rounded-full bg-white/5 mb-0.5 md:mb-1 text-red-400">
                <Heart className="w-3 h-3 md:w-4 md:h-4 fill-red-400" />
              </div>
              <div className="text-base md:text-2xl font-black text-white tracking-tight">
                {loading ? <span className="inline-block h-5 md:h-7 w-8 md:w-12 rounded-lg bg-white/10 animate-pulse" /> : stats.total}
              </div>
              <div className="text-[8px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight px-0.5">
                Total
              </div>
            </div>
            <div className="flex-1 min-w-0 bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-1 py-2 md:p-4 flex flex-col items-center justify-center gap-0.5 md:gap-1">
              <div className="p-1 md:p-2 rounded-full bg-white/5 mb-0.5 md:mb-1 text-sky-400">
                <Film className="w-3 h-3 md:w-4 md:h-4" />
              </div>
              <div className="text-base md:text-2xl font-black text-white tracking-tight">
                {loading ? <span className="inline-block h-5 md:h-7 w-8 md:w-12 rounded-lg bg-white/10 animate-pulse" /> : stats.movies}
              </div>
              <div className="text-[8px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight px-0.5">
                Películas
              </div>
            </div>
            <div className="flex-1 min-w-0 bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-1 py-2 md:p-4 flex flex-col items-center justify-center gap-0.5 md:gap-1">
              <div className="p-1 md:p-2 rounded-full bg-white/5 mb-0.5 md:mb-1 text-purple-400">
                <TvGlyph className="w-3 h-3 md:w-4 md:h-4 text-purple-400" />
              </div>
              <div className="text-base md:text-2xl font-black text-white tracking-tight">
                {loading ? <span className="inline-block h-5 md:h-7 w-8 md:w-12 rounded-lg bg-white/10 animate-pulse" /> : stats.shows}
              </div>
              <div className="text-[8px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight px-0.5">
                Series
              </div>
            </div>
          </motion.div>
        </motion.header>

        {/* Filters */}
        <motion.div
          className="space-y-3 mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          {/* Mobile: 3 rows */}
          <div className="lg:hidden">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar..."
                className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-red-500/50 transition-all placeholder:text-zinc-600"
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
          </div>

          <div className="flex gap-2 lg:hidden">
            <div className="flex-1">
              <InlineDropdown
                label="Tipo"
                valueLabel={typeFilter === "all" ? "Todo" : typeFilter === "movies" ? "Películas" : "Series"}
                icon={Filter}
              >
                {({ close }) => (
                  <>
                    <DropdownItem active={typeFilter === "all"} onClick={() => { setTypeFilter("all"); close(); }}>
                      Todo
                    </DropdownItem>
                    <DropdownItem active={typeFilter === "movies"} onClick={() => { setTypeFilter("movies"); close(); }}>
                      Películas
                    </DropdownItem>
                    <DropdownItem active={typeFilter === "shows"} onClick={() => { setTypeFilter("shows"); close(); }}>
                      Series
                    </DropdownItem>
                  </>
                )}
              </InlineDropdown>
            </div>
            <div className="flex-1">
              <InlineDropdown
                label="Orden"
                valueLabel={
                  sortBy === "title-asc" ? "A-Z" :
                  sortBy === "title-desc" ? "Z-A" :
                  sortBy === "rating-desc" ? "Mejor" : "Peor"
                }
                icon={ArrowUpDown}
              >
                {({ close }) => (
                  <>
                    <DropdownItem active={sortBy === "title-asc"} onClick={() => { setSortBy("title-asc"); close(); }}>
                      Título A-Z
                    </DropdownItem>
                    <DropdownItem active={sortBy === "title-desc"} onClick={() => { setSortBy("title-desc"); close(); }}>
                      Título Z-A
                    </DropdownItem>
                    <DropdownItem active={sortBy === "rating-desc"} onClick={() => { setSortBy("rating-desc"); close(); }}>
                      Valoración ↓
                    </DropdownItem>
                    <DropdownItem active={sortBy === "rating-asc"} onClick={() => { setSortBy("rating-asc"); close(); }}>
                      Valoración ↑
                    </DropdownItem>
                  </>
                )}
              </InlineDropdown>
            </div>
          </div>

          <div className="flex gap-2 lg:hidden">
            <div className="flex flex-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center">
              <button
                onClick={() => setViewMode("list")}
                className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                  viewMode === "list"
                    ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("compact")}
                className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                  viewMode === "compact"
                    ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                <AllGlyph className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                  viewMode === "grid"
                    ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                <PosterGlyph className="w-4 h-4" />
              </button>
            </div>

            <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center shrink-0">
              <button
                onClick={() => setImageMode("poster")}
                className={`px-2.5 h-full rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                  imageMode === "poster"
                    ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
                title="Vista Poster"
              >
                <PosterGlyph className="w-4 h-4" />
              </button>
              <button
                onClick={() => setImageMode("backdrop")}
                className={`px-2.5 h-full rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                  imageMode === "backdrop"
                    ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
                title="Vista Backdrop"
              >
                <BackdropGlyph className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Desktop: Single row */}
          <div className="hidden lg:flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por título..."
                className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-red-500/50 transition-all placeholder:text-zinc-600"
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
              valueLabel={typeFilter === "all" ? "Todo" : typeFilter === "movies" ? "Películas" : "Series"}
              icon={Filter}
            >
              {({ close }) => (
                <>
                  <DropdownItem active={typeFilter === "all"} onClick={() => { setTypeFilter("all"); close(); }}>
                    Todo
                  </DropdownItem>
                  <DropdownItem active={typeFilter === "movies"} onClick={() => { setTypeFilter("movies"); close(); }}>
                    Películas
                  </DropdownItem>
                  <DropdownItem active={typeFilter === "shows"} onClick={() => { setTypeFilter("shows"); close(); }}>
                    Series
                  </DropdownItem>
                </>
              )}
            </InlineDropdown>

            <InlineDropdown
              label="Ordenar"
              valueLabel={
                sortBy === "title-asc" ? "A-Z" :
                sortBy === "title-desc" ? "Z-A" :
                sortBy === "rating-desc" ? "Mejor valorado" : "Peor valorado"
              }
              icon={ArrowUpDown}
            >
              {({ close }) => (
                <>
                  <DropdownItem active={sortBy === "title-asc"} onClick={() => { setSortBy("title-asc"); close(); }}>
                    Título A-Z
                  </DropdownItem>
                  <DropdownItem active={sortBy === "title-desc"} onClick={() => { setSortBy("title-desc"); close(); }}>
                    Título Z-A
                  </DropdownItem>
                  <DropdownItem active={sortBy === "rating-desc"} onClick={() => { setSortBy("rating-desc"); close(); }}>
                    Valoración más alta
                  </DropdownItem>
                  <DropdownItem active={sortBy === "rating-asc"} onClick={() => { setSortBy("rating-asc"); close(); }}>
                    Valoración más baja
                  </DropdownItem>
                </>
              )}
            </InlineDropdown>

            <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center shrink-0">
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  viewMode === "list"
                    ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("compact")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  viewMode === "compact"
                    ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                <AllGlyph className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  viewMode === "grid"
                    ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                <PosterGlyph className="w-4 h-4" />
              </button>
            </div>

            <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center shrink-0">
              <button
                onClick={() => setImageMode("poster")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  imageMode === "poster"
                    ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
                title="Vista Poster"
              >
                <PosterGlyph className="w-4 h-4" />
              </button>
              <button
                onClick={() => setImageMode("backdrop")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  imageMode === "backdrop"
                    ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
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
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <motion.div
            className="py-24 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Heart className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-500 font-medium">No se encontraron favoritos.</p>
            {q && (
              <button
                onClick={() => setQ("")}
                className="mt-4 text-red-500 text-sm font-bold hover:underline"
              >
                Limpiar búsqueda
              </button>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            {viewMode === "list" ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {sorted.map((item, idx) => (
                  <FavoriteCard key={item.id} item={item} index={idx} totalItems={sorted.length} viewMode="list" imageMode={imageMode} />
                ))}
              </div>
            ) : viewMode === "compact" ? (
              <div className={`grid gap-2 ${
                imageMode === "backdrop"
                  ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4"
                  : "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8"
              }`}>
                {sorted.map((item, idx) => (
                  <FavoriteCard key={item.id} item={item} index={idx} totalItems={sorted.length} viewMode="compact" imageMode={imageMode} />
                ))}
              </div>
            ) : (
              <div className={`grid gap-3 ${
                imageMode === "backdrop"
                  ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3"
                  : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6"
              }`}>
                {sorted.map((item, idx) => (
                  <FavoriteCard key={item.id} item={item} index={idx} totalItems={sorted.length} viewMode="grid" imageMode={imageMode} />
                ))}
              </div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
