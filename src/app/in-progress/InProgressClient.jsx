"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Tv,
  Play,
  Clock,
  Eye,
  Layers,
  ChevronRight,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  X,
  Loader2,
  BarChart3,
  TrendingUp,
  Calendar,
  Film,
  LogOut,
  RotateCcw,
  LayoutList,
  LayoutGrid,
} from "lucide-react";

import {
  traktGetInProgress,
  traktGetCompleted,
  traktDisconnect,
} from "@/lib/api/traktClient";

// ----------------------------
// HELPERS
// ----------------------------
function formatLastWatched(iso) {
  if (!iso) return "Desconocido";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Desconocido";
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Justo ahora";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function formatEpCode(season, number) {
  if (season == null || number == null) return null;
  return `S${String(season).padStart(2, "0")}E${String(number).padStart(2, "0")}`;
}

function getProgressColor(pct) {
  if (pct >= 90)
    return {
      bar: "from-emerald-400 to-green-300",
      text: "text-emerald-400",
      bg: "bg-emerald-500/15",
      border: "border-emerald-500/30",
      glow: "shadow-emerald-500/25",
      stroke: "#34d399",
      trail: "rgba(52,211,153,0.15)",
      label: "Casi completa",
      accent: "52,211,153",
    };
  if (pct >= 70)
    return {
      bar: "from-violet-500 to-purple-400",
      text: "text-violet-400",
      bg: "bg-violet-500/15",
      border: "border-violet-500/30",
      glow: "shadow-violet-500/25",
      stroke: "#a78bfa",
      trail: "rgba(167,139,250,0.15)",
      label: "Avanzada",
      accent: "167,139,250",
    };
  if (pct >= 50)
    return {
      bar: "from-sky-500 to-cyan-400",
      text: "text-sky-400",
      bg: "bg-sky-500/15",
      border: "border-sky-500/30",
      glow: "shadow-sky-500/25",
      stroke: "#38bdf8",
      trail: "rgba(56,189,248,0.15)",
      label: "Media",
      accent: "56,189,248",
    };
  if (pct >= 30)
    return {
      bar: "from-amber-500 to-yellow-400",
      text: "text-amber-400",
      bg: "bg-amber-500/15",
      border: "border-amber-500/30",
      glow: "shadow-amber-500/25",
      stroke: "#fbbf24",
      trail: "rgba(251,191,36,0.15)",
      label: "Parcial",
      accent: "251,191,36",
    };
  if (pct >= 10)
    return {
      bar: "from-orange-500 to-orange-400",
      text: "text-orange-400",
      bg: "bg-orange-500/15",
      border: "border-orange-500/30",
      glow: "shadow-orange-500/25",
      stroke: "#fb923c",
      trail: "rgba(251,146,60,0.15)",
      label: "Inicial",
      accent: "251,146,60",
    };
  return {
    bar: "from-rose-500 to-pink-400",
    text: "text-rose-400",
    bg: "bg-rose-500/15",
    border: "border-rose-500/30",
    glow: "shadow-rose-500/25",
    stroke: "#fb7185",
    trail: "rgba(251,113,133,0.15)",
    label: "Recién empezada",
    accent: "251,113,133",
  };
}

// ----------------------------
// SHARED CACHE / IMAGES
// ----------------------------
const IN_PROGRESS_CACHE_KEY = "showverse:trakt:in-progress:v1";
const IN_PROGRESS_CACHE_TTL = 1000 * 60 * 5;

const buildImg = (path, size = "w500") => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

const posterChoiceCache = new Map();
const posterInFlight = new Map();

const backdropChoiceCache = new Map();
const backdropInFlight = new Map();

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
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

function pickBestBackdropByLangResVotes(list, opts = {}) {
  const { preferLangs = ["en", "en-US"], minWidth = 1200 } = opts;
  if (!Array.isArray(list) || list.length === 0) return null;

  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean));
  const isPreferredLang = (img) => {
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

const getPosterPreference = (type, id) => {
  if (typeof window === "undefined") return null;
  const key =
    type === "tv"
      ? `showverse:tv:${id}:poster`
      : `showverse:movie:${id}:poster`;
  return window.localStorage.getItem(key) || null;
};

function readSessionCache(key, ttlMs) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ts = Number(parsed?.ts || 0);
    if (!ts || Date.now() - ts > ttlMs) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

function writeSessionCache(key, data) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch {}
}

function clearSessionCache(key) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {}
}

// ----------------------------
// SMART POSTER COMPONENT
// ----------------------------
function SmartPoster({ item, title }) {
  const type = "tv"; // In Progress is always TV
  const id = item.tmdbId;

  const [src, setSrc] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;

    setSrc(null);
    setReady(false);

    const load = async () => {
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
  }, [type, id, item.poster_path, item.backdrop_path]);

  return (
    <div className="relative w-full h-full">
      <div
        className={`absolute inset-0 flex items-center justify-center bg-neutral-900 transition-opacity duration-300 ${
          ready && src ? "opacity-0" : "opacity-100"
        }`}
      >
        <Film className="w-8 h-8 text-neutral-700" />
      </div>
      {src && (
        <img
          src={src}
          alt={title}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}

// ----------------------------
// SMART BACKDROP COMPONENT
// ----------------------------
function SmartBackdrop({ item, title, imgClassName = "" }) {
  const type = "tv";
  const id = item.tmdbId;

  const [src, setSrc] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;

    setSrc(null);
    setReady(false);

    const load = async () => {
      const best = await getBestBackdropCached(type, id);
      const finalPath = best || item.backdrop_path || item.poster_path || null;
      const url = finalPath
        ? buildImg(finalPath, best || item.backdrop_path ? "w1280" : "w500")
        : null;
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
  }, [type, id, item.backdrop_path, item.poster_path]);

  return (
    <div className="relative w-full h-full">
      <div
        className={`absolute inset-0 flex items-center justify-center bg-zinc-900 transition-opacity duration-300 ${
          ready && src ? "opacity-0" : "opacity-100"
        }`}
      >
        <Tv className="w-8 h-8 text-zinc-700" />
      </div>
      {src && (
        <img
          src={src}
          alt={title}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            ready ? "opacity-100" : "opacity-0"
          } ${imgClassName}`}
        />
      )}
    </div>
  );
}

// ----------------------------
// CIRCULAR PROGRESS GAUGE (SVG)
// ----------------------------
function CircularProgress({ pct, colors, size = 52 }) {
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Trail */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.trail}
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
          style={{ filter: `drop-shadow(0 0 4px ${colors.stroke}60)` }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-[11px] font-black ${colors.text}`}>{pct}%</span>
      </div>
    </div>
  );
}

// ----------------------------
// STAT CARD (same as History)
// ----------------------------
function StatCard({
  label,
  value,
  icon: Icon,
  colorClass = "text-white",
  loading = false,
}) {
  return (
    <div className="w-full h-full min-h-[96px] sm:min-h-[112px] lg:min-h-[120px] lg:flex-none lg:min-w-[120px] bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-2 py-2 sm:px-3 sm:py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1 backdrop-blur-sm transition hover:bg-zinc-900/70">
      <div
        className={`p-1 sm:p-1.5 md:p-2 rounded-full bg-white/5 mb-1 ${colorClass}`}
      >
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
      </div>
      <div className="text-sm sm:text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">
        {loading ? (
          <span className="inline-block h-4 w-8 sm:h-6 sm:w-10 md:h-8 md:w-14 rounded-lg bg-white/10 animate-pulse" />
        ) : (
          value
        )}
      </div>
      <div className="text-[8px] sm:text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wide text-center leading-tight">
        {label}
      </div>
    </div>
  );
}

// ----------------------------
// GROUP DIVIDER
// ----------------------------
function GroupDivider({ title, count, total, avgProgress }) {
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
            <div className="w-1 sm:w-1.5 h-8 sm:h-12 bg-gradient-to-b from-emerald-500 to-emerald-600 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.4)] shrink-0" />

            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-2xl font-black tracking-tight text-white leading-tight line-clamp-1">
                {title}
              </h2>

              <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-sm text-zinc-500 font-medium flex items-center gap-x-1.5 sm:gap-x-2">
                <span className="text-zinc-300 font-bold">{count}</span>
                <span>series</span>
                <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-zinc-700" />
                <span className="opacity-90">{pct}%</span>
              </div>
            </div>
          </div>

          {avgProgress != null && (
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <div className="flex flex-col items-start min-w-0">
                <div className="flex items-center gap-1.5 mb-1 opacity-75 min-w-0">
                  <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-emerald-400" />
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-400 truncate">
                    Progreso medio
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-lg sm:text-xl font-black text-white tabular-nums tracking-tight leading-none truncate">
                    {avgProgress}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ----------------------------
// INLINE DROPDOWN (same as History with emerald accent)
// ----------------------------
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
          {Icon && <Icon className="w-4 h-4 text-emerald-500" />}
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
      {active && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
    </button>
  );
}

// ----------------------------
// IN-PROGRESS CARD
// ----------------------------
const InProgressCard = memo(function InProgressCard({
  item,
  index = 0,
  viewMode = "cards",
  activeTab = "inprogress",
}) {
  const title = item.title_es || item.title || "Sin título";
  const href = item.detailsHref || `/details/tv/${item.tmdbId}`;
  const colors = getProgressColor(item.pct);
  const nextEpCode = item.nextEpisode
    ? formatEpCode(item.nextEpisode.season, item.nextEpisode.number)
    : null;
  const lastEpCode = item.lastEpisode
    ? formatEpCode(item.lastEpisode.season, item.lastEpisode.number)
    : null;
  const lastWatched = formatLastWatched(item.lastWatchedAt);
  const remaining = item.aired - item.completed;

  const animDelay = Math.min(index * 0.06, 0.5);

  if (viewMode === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.35, delay: animDelay, ease: "easeOut" }}
      >
        <Link
          href={href}
          className="block bg-zinc-900/30 border border-white/5 rounded-xl hover:border-emerald-500/30 hover:bg-zinc-900/60 transition-colors group overflow-hidden"
        >
          <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4">
            {/* Backdrop image - same size as History list view */}
            <div className="w-[180px] sm:w-[280px] aspect-video rounded-lg overflow-hidden relative shadow-md border border-white/5 bg-zinc-900 shrink-0">
              <SmartBackdrop item={item} title={title} />
            </div>

            {/* Info - right side */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              <h4 className="text-white font-bold text-base leading-tight truncate group-hover:text-emerald-300 transition-colors">
                {title}
              </h4>

              <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
                <span
                  className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${colors.bg} ${colors.text}`}
                >
                  {item.pct}%
                </span>
                <span>
                  {item.completed}/{item.aired} episodios
                </span>
                {nextEpCode && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Play
                        className="w-3 h-3 text-emerald-400"
                        fill="currentColor"
                      />
                      <span className="text-zinc-300 font-semibold">
                        {nextEpCode}
                      </span>
                    </span>
                  </>
                )}
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden relative">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${colors.bar} relative overflow-hidden`}
                  initial={{ width: 0 }}
                  animate={{ width: `${item.pct}%` }}
                  transition={{
                    duration: 0.8,
                    delay: animDelay + 0.2,
                    ease: "easeOut",
                  }}
                >
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"
                    style={{ animationDelay: `${animDelay}s` }}
                  />
                </motion.div>
              </div>

              <div className="text-xs text-zinc-400 flex items-center gap-1.5 font-medium">
                <Clock className="w-3 h-3" /> {lastWatched}
                {remaining > 0 && (
                  <>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-500">
                      {remaining} eps restantes
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

  // ==== POSTER VIEW ====
  if (viewMode === "poster") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.35, delay: animDelay, ease: "easeOut" }}
      >
        <Link href={href} className="block">
          <div className="relative aspect-[2/3] group rounded-xl overflow-hidden bg-zinc-900 border border-white/5 shadow-md lg:hover:shadow-emerald-900/20 transition-all">
            <SmartPoster item={item} title={title} />

            {/* Tick verde para series completadas (mobile) */}
            {activeTab === "completed" && (
              <CheckCircle2 className="absolute top-2.5 left-2.5 z-10 lg:hidden w-5 h-5 text-emerald-400 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]" />
            )}

            {/* Mobile overlay - bottom only */}
            <div className="absolute inset-x-0 bottom-0 z-10 lg:hidden p-3 pt-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none">
              <div className="flex items-center gap-2 mb-1 -ml-0.5">
                {activeTab === "completed" ? null : (
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}
                  >
                    {item.pct}%
                  </span>
                )}
                {nextEpCode && (
                  <span className="text-[10px] text-emerald-300/90 font-medium flex items-center gap-1">
                    <Play className="w-2.5 h-2.5" fill="currentColor" />
                    {nextEpCode}
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h5 className="text-white font-bold text-xs leading-tight line-clamp-2">
                    {title}
                  </h5>
                  {item.completed && item.aired && (
                    <div className="mt-0.5 text-[10px] text-zinc-400 flex items-center gap-1">
                      <Eye className="w-2.5 h-2.5" />
                      {item.completed}/{item.aired} eps
                    </div>
                  )}
                </div>
                {activeTab === "completed" && item.user_rating && (
                  <span className="text-yellow-400 text-lg font-black font-mono tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,1)] shrink-0">
                    {item.user_rating}
                  </span>
                )}
              </div>
            </div>

            {/* Overlay con gradientes - desktop hover */}
            <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {/* Top gradient con badge y porcentaje */}
              <div className="p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                {activeTab === "completed" ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]" />
                ) : (
                  <span
                    className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shadow-sm backdrop-blur-md ${colors.bg} ${colors.text} ${colors.border}`}
                  >
                    {colors.label}
                  </span>
                )}

                {activeTab !== "completed" && (
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-2xl font-black tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,1)] ${colors.text}`}
                    >
                      {item.pct}
                    </span>
                    <span
                      className={`text-sm font-bold ${colors.text} opacity-80`}
                    >
                      %
                    </span>
                  </div>
                )}
              </div>

              {/* Bottom gradient con título y detalles */}
              <div className="p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md text-sm mb-1">
                      {title}
                    </h3>

                    <div className="space-y-0.5">
                      {nextEpCode && (
                        <p className="text-emerald-400 text-xs font-bold drop-shadow-md flex items-center gap-1">
                          <Play className="w-2.5 h-2.5" fill="currentColor" />
                          {nextEpCode}
                        </p>
                      )}

                      <p className="text-sky-400 text-xs font-bold drop-shadow-md">
                        {item.completed}/{item.aired} episodios
                      </p>

                      <p className="text-zinc-400 text-[10px] font-medium drop-shadow-md flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {lastWatched}
                      </p>
                    </div>
                  </div>
                  {activeTab === "completed" && item.user_rating && (
                    <span className="text-yellow-400 text-2xl font-black font-mono tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,1)] shrink-0">
                      {item.user_rating}
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

  // ==== CARDS VIEW (default) ====
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        duration: 0.4,
        delay: animDelay,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <Link href={href} className="block group">
        <div
          className="relative rounded-2xl overflow-hidden border border-white/5 bg-zinc-900/60 hover:bg-zinc-900/80 transition-all duration-300"
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = `rgba(${colors.accent}, 0.3)`;
            e.currentTarget.style.boxShadow = `0 20px 25px -5px rgba(${colors.accent}, 0.15), 0 8px 10px -6px rgba(${colors.accent}, 0.1)`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "";
            e.currentTarget.style.boxShadow = "";
          }}
        >
          {/* Backdrop hero */}
          <div className="relative aspect-video overflow-hidden">
            <SmartBackdrop
              item={item}
              title={title}
              imgClassName="transition-transform duration-500 group-hover:scale-105"
            />

            {/* Gradient overlay - stronger at top for badge readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />
            <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/60 to-transparent" />

            {/* Progress circular gauge badge / User rating badge - solid dark bg for readability */}
            <div className="absolute bottom-1 right-1">
              <div
                className="rounded-full"
                style={{
                  background: "rgba(0,0,0,0.75)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                }}
              >
                {activeTab === "completed" ? (
                  item.user_rating ? (
                    <div className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-full bg-yellow-500/15 border-2 border-yellow-400 flex items-center justify-center">
                      <span className="text-sm sm:text-base font-black font-mono text-yellow-400">
                        {item.user_rating}
                      </span>
                    </div>
                  ) : null
                ) : (
                  <CircularProgress pct={item.pct} colors={colors} size={40} />
                )}
              </div>
            </div>

            {/* Next episode badge - solid dark bg */}
            {nextEpCode && (
              <div
                className="absolute top-3 left-3 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5"
                style={{
                  background: "rgba(0,0,0,0.75)",
                  boxShadow:
                    "0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)",
                }}
              >
                <Play
                  className="w-3 h-3 text-emerald-400"
                  fill="currentColor"
                />
                <span className="text-[11px] font-bold text-white">
                  {nextEpCode}
                </span>
              </div>
            )}

            {/* Tick verde para series completadas */}
            {activeTab === "completed" && (
              <CheckCircle2 className="absolute top-3 left-3 w-7 h-7 text-emerald-400 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]" />
            )}

            {/* Bottom info on backdrop */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-white font-black text-lg lg:text-xl leading-tight line-clamp-1 group-hover:text-emerald-200 transition-colors">
                {title}
              </h3>
              {item.year && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-zinc-400">{item.year}</span>
                  {item.genres && item.genres.length > 0 && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className="text-xs text-zinc-500">
                        {item.genres.slice(0, 2).join(", ")}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Progress section */}
          <div className="p-4 space-y-3">
            {/* Progress bar - thicker with shimmer + color label */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Progreso
                </span>
                <span className="text-[11px] text-zinc-500">
                  {item.completed} de {item.aired} episodios
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-zinc-800/80 overflow-hidden relative">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${colors.bar} relative overflow-hidden`}
                  initial={{ width: 0 }}
                  animate={{ width: `${item.pct}%` }}
                  transition={{
                    duration: 1,
                    delay: animDelay + 0.3,
                    ease: "easeOut",
                  }}
                  style={{ boxShadow: `0 0 8px ${colors.stroke}40` }}
                >
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_2s_infinite]"
                    style={{ animationDelay: `${animDelay}s` }}
                  />
                </motion.div>
              </div>
            </div>

            {/* Episode info row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {lastEpCode && (
                  <div className="flex items-center gap-1.5">
                    <Eye className="w-3 h-3 text-zinc-500" />
                    <span className="text-[11px] text-zinc-400">
                      Último:{" "}
                      <span className="text-white font-semibold">
                        {lastEpCode}
                      </span>
                    </span>
                  </div>
                )}
                {remaining > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3 h-3 text-zinc-500" />
                    <span className="text-[11px] text-zinc-400">
                      Faltan:{" "}
                      <span className="text-white font-semibold">
                        {remaining}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-zinc-600" />
                <span className="text-[10px] text-zinc-500">{lastWatched}</span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
});

// ----------------------------
// SKELETON CARD
// ----------------------------
function SkeletonCard({ viewMode = "cards" }) {
  if (viewMode === "compact") {
    return (
      <div className="flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl bg-zinc-900/40 border border-white/5 animate-pulse">
        <div className="w-[52px] sm:w-[60px] aspect-[2/3] rounded-lg bg-zinc-800 shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-3/4 bg-zinc-800 rounded" />
          <div className="h-2.5 w-1/2 bg-zinc-800 rounded" />
          <div className="h-1.5 w-full bg-zinc-800 rounded-full" />
        </div>
      </div>
    );
  }

  if (viewMode === "poster") {
    return (
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-900 shadow-lg ring-1 ring-white/5 animate-pulse">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/50 via-zinc-900/50 to-zinc-800/50" />
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

  return (
    <div className="rounded-2xl overflow-hidden border border-white/5 bg-zinc-900/60 animate-pulse">
      <div className="aspect-video bg-zinc-800" />
      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <div className="h-2 bg-zinc-800 rounded-full" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-1/3 bg-zinc-800 rounded" />
          <div className="h-3 w-1/4 bg-zinc-800 rounded" />
        </div>
      </div>
    </div>
  );
}

// ----------------------------
// MAIN PAGE
// ----------------------------
export default function InProgressClient() {
  const [auth, setAuth] = useState({ loading: true, connected: false });
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  // Tab: "inprogress" | "completed"
  const [activeTab, setActiveTab] = useState("inprogress");
  const [completedItems, setCompletedItems] = useState([]);
  const [completedStats, setCompletedStats] = useState(null);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedLoaded, setCompletedLoaded] = useState(false);

  // UI — fixed SSR-safe defaults to avoid hydration mismatch
  const [viewMode, setViewMode] = useState("cards");
  const [sortBy, setSortBy] = useState("recent");
  const [groupBy, setGroupBy] = useState("none");
  const [q, setQ] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Restore preferences from localStorage after mount (avoids SSR/client hydration mismatch)
  useEffect(() => {
    const savedView = window.localStorage.getItem(
      "showverse:inprogress:viewMode",
    );
    if (
      savedView === "cards" ||
      savedView === "compact" ||
      savedView === "poster"
    ) {
      setViewMode(savedView);
    }
    const savedSort = window.localStorage.getItem(
      "showverse:inprogress:sortBy",
    );
    if (savedSort) setSortBy(savedSort);
    const savedGroup = window.localStorage.getItem(
      "showverse:inprogress:groupBy",
    );
    if (savedGroup) setGroupBy(savedGroup);
  }, []);

  // Persist
  useEffect(() => {
    window.localStorage.setItem("showverse:inprogress:viewMode", viewMode);
  }, [viewMode]);
  useEffect(() => {
    window.localStorage.setItem("showverse:inprogress:sortBy", sortBy);
  }, [sortBy]);
  useEffect(() => {
    window.localStorage.setItem("showverse:inprogress:groupBy", groupBy);
  }, [groupBy]);

  // Update document title when tab changes
  useEffect(() => {
    document.title =
      activeTab === "completed"
        ? "Completadas - ShowVerse"
        : "En Progreso - ShowVerse";
  }, [activeTab]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => setIsMobile(!!mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const loadData = useCallback(async ({ background = false } = {}) => {
    if (!background) setLoading(true);
    try {
      const json = await traktGetInProgress();
      const connected = json?.connected !== false;

      setAuth({ loading: false, connected });

      if (!connected) {
        clearSessionCache(IN_PROGRESS_CACHE_KEY);
        setItems([]);
        setStats(null);
        setDataLoaded(true);
        return;
      }

      const nextItems = json?.items || [];
      const nextStats = json?.stats || null;

      setItems(nextItems);
      setStats(nextStats);
      setDataLoaded(true);
      writeSessionCache(IN_PROGRESS_CACHE_KEY, {
        items: nextItems,
        stats: nextStats,
      });
    } catch (e) {
      console.error("Error loading in-progress:", e);
      setAuth((prev) => ({ ...prev, loading: false }));
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  const loadCompleted = useCallback(async () => {
    setCompletedLoading(true);
    try {
      const json = await traktGetCompleted();
      setCompletedItems(json?.items || []);
      setCompletedStats(json?.stats || null);
    } catch (e) {
      console.error("Error loading completed:", e);
    } finally {
      setCompletedLoading(false);
      setCompletedLoaded(true);
    }
  }, []);

  useEffect(() => {
    const cached = readSessionCache(
      IN_PROGRESS_CACHE_KEY,
      IN_PROGRESS_CACHE_TTL,
    );

    if (cached?.items || cached?.stats) {
      setItems(Array.isArray(cached?.items) ? cached.items : []);
      setStats(cached?.stats || null);
      setDataLoaded(true);
      setAuth({ loading: false, connected: true });
      void loadData({ background: true });
      return;
    }

    void loadData();
  }, [loadData]);

  // Lazy load completed data when tab is switched
  useEffect(() => {
    if (auth.connected && activeTab === "completed" && !completedLoaded) {
      loadCompleted();
    }
  }, [auth.connected, activeTab, completedLoaded, loadCompleted]);

  // Active data based on tab
  const currentItems = activeTab === "completed" ? completedItems : items;
  const currentStats = activeTab === "completed" ? completedStats : stats;
  const currentLoading = activeTab === "completed" ? completedLoading : loading;
  const currentDataLoaded =
    activeTab === "completed" ? completedLoaded : dataLoaded;

  // Filter + Sort
  const filtered = useMemo(() => {
    let list = [...currentItems];

    // Search
    if (q.trim()) {
      const query = q.trim().toLowerCase();
      list = list.filter((x) => {
        const title = (x.title_es || x.title || "").toLowerCase();
        return title.includes(query);
      });
    }

    // Sort
    switch (sortBy) {
      case "recent":
        list.sort(
          (a, b) =>
            new Date(b.lastWatchedAt || 0) - new Date(a.lastWatchedAt || 0),
        );
        break;
      case "oldest":
        list.sort(
          (a, b) =>
            new Date(a.lastWatchedAt || 0) - new Date(b.lastWatchedAt || 0),
        );
        break;
      case "progress-high":
        list.sort((a, b) => b.pct - a.pct);
        break;
      case "progress-low":
        list.sort((a, b) => a.pct - b.pct);
        break;
      case "alpha":
        list.sort((a, b) =>
          (a.title_es || a.title || "").localeCompare(
            b.title_es || b.title || "",
          ),
        );
        break;
      case "episodes-left":
        list.sort((a, b) => a.aired - a.completed - (b.aired - b.completed));
        break;
      default:
        break;
    }

    return list;
  }, [currentItems, q, sortBy]);

  const allSortLabels = {
    recent: "Recientes",
    oldest: "Más antiguas",
    "progress-high": "Más avanzadas",
    "progress-low": "Menos avanzadas",
    alpha: "Alfabético",
    "episodes-left": "Menos eps. restantes",
  };

  // For completed tab, filter out sort options that don't make sense
  const sortLabels =
    activeTab === "completed"
      ? {
          recent: allSortLabels.recent,
          oldest: allSortLabels.oldest,
          alpha: allSortLabels.alpha,
        }
      : allSortLabels;

  const groupLabels = {
    none: "Sin agrupar",
    progress: "Por progreso",
    status: "Por estado",
    remaining: "Por episodios restantes",
    last_watched: "Por última vez visto",
  };

  // Grouping logic
  const grouped = useMemo(() => {
    if (groupBy === "none") return null;

    const groups = new Map();

    for (const item of filtered) {
      const processGroup = (groupKey, groupLabel) => {
        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            key: groupKey,
            label: groupLabel,
            items: [],
            avgProgress: 0,
          });
        }

        const group = groups.get(groupKey);
        group.items.push(item);
      };

      let groupKey = "";
      let groupLabel = "";

      if (groupBy === "progress") {
        // Group by progress ranges: 0-20%, 20-40%, 40-60%, 60-80%, 80-100%
        const pct = item.pct || 0;
        if (pct < 20) {
          groupKey = "0-20";
          groupLabel = "0-20%";
        } else if (pct < 40) {
          groupKey = "20-40";
          groupLabel = "20-40%";
        } else if (pct < 60) {
          groupKey = "40-60";
          groupLabel = "40-60%";
        } else if (pct < 80) {
          groupKey = "60-80";
          groupLabel = "60-80%";
        } else {
          groupKey = "80-100";
          groupLabel = "80-100%";
        }
      } else if (groupBy === "status") {
        // Group by status label
        const colors = getProgressColor(item.pct || 0);
        groupKey = colors.label;
        groupLabel = colors.label;
      } else if (groupBy === "remaining") {
        // Group by remaining episodes
        const remaining = item.aired - item.completed;
        if (remaining === 0) {
          groupKey = "0";
          groupLabel = "Completas";
        } else if (remaining <= 5) {
          groupKey = "1-5";
          groupLabel = "1-5 episodios restantes";
        } else if (remaining <= 10) {
          groupKey = "6-10";
          groupLabel = "6-10 episodios restantes";
        } else if (remaining <= 20) {
          groupKey = "11-20";
          groupLabel = "11-20 episodios restantes";
        } else {
          groupKey = "21+";
          groupLabel = "Más de 20 episodios restantes";
        }
      } else if (groupBy === "last_watched") {
        // Group by last watched time
        const now = new Date();
        const watchedAt = new Date(item.lastWatchedAt);
        const diffDays = Math.floor((now - watchedAt) / 86400000);

        if (diffDays === 0) {
          groupKey = "today";
          groupLabel = "Hoy";
        } else if (diffDays === 1) {
          groupKey = "yesterday";
          groupLabel = "Ayer";
        } else if (diffDays <= 7) {
          groupKey = "this_week";
          groupLabel = "Esta semana";
        } else if (diffDays <= 30) {
          groupKey = "this_month";
          groupLabel = "Este mes";
        } else {
          groupKey = "older";
          groupLabel = "Más antiguo";
        }
      }

      processGroup(groupKey, groupLabel);
    }

    // Calculate average progress for each group
    for (const group of groups.values()) {
      const totalProgress = group.items.reduce(
        (sum, item) => sum + (item.pct || 0),
        0,
      );
      group.avgProgress =
        group.items.length > 0
          ? Math.round(totalProgress / group.items.length)
          : 0;
    }

    // Sort groups
    const groupsArray = Array.from(groups.values());

    if (groupBy === "progress") {
      // Sort by progress range (highest first)
      const order = ["80-100", "60-80", "40-60", "20-40", "0-20"];
      groupsArray.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    } else if (groupBy === "status") {
      // Sort by status (best progress first)
      const order = [
        "Casi completa",
        "Avanzada",
        "Media",
        "Parcial",
        "Inicial",
        "Recién empezada",
      ];
      groupsArray.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    } else if (groupBy === "remaining") {
      // Sort by remaining episodes (fewest first)
      const order = ["0", "1-5", "6-10", "11-20", "21+"];
      groupsArray.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    } else if (groupBy === "last_watched") {
      // Sort by recency (most recent first)
      const order = ["today", "yesterday", "this_week", "this_month", "older"];
      groupsArray.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    }

    return groupsArray;
  }, [filtered, groupBy]);

  // Reset sort if current option is not available in the active tab
  useEffect(() => {
    if (
      activeTab === "completed" &&
      !["recent", "oldest", "alpha"].includes(sortBy)
    ) {
      setSortBy("recent");
    }
  }, [activeTab, sortBy]);

  const handleDisconnect = async () => {
    try {
      await traktDisconnect();
      clearSessionCache(IN_PROGRESS_CACHE_KEY);
      setAuth({ loading: false, connected: false });
      setItems([]);
      setStats(null);
      setCompletedItems([]);
      setCompletedStats(null);
      setCompletedLoaded(false);
      window.location.href = "/";
    } catch (e) {
      console.error(e);
    }
    setShowDisconnectModal(false);
  };

  // ----------------------------
  // RENDER
  // ----------------------------

  // Not connected state
  if (!auth.loading && !auth.connected) {
    return (
      <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-emerald-500/30 pb-20">
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-sky-500/5 rounded-full blur-[150px]" />
        </div>

        <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <motion.header
            className="mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px w-12 bg-emerald-500" />
              <span className="text-emerald-400 font-bold uppercase tracking-widest text-xs">
                SEGUIMIENTO
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              En Progreso<span className="text-emerald-500">.</span>
            </h1>
            <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
              Series que estás viendo actualmente con su progreso.
            </p>
          </motion.header>

          <div className="flex items-center justify-center py-12 lg:py-24">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md w-full flex flex-col items-center justify-center py-12 bg-zinc-900/20 border border-white/5 rounded-3xl text-center px-4 border-dashed"
            >
              <div className="mb-6">
                <img
                  src="/logo-Trakt.png"
                  alt="Trakt Logo"
                  className="w-24 h-24 object-contain shadow-lg shadow-red-500/20 rounded-2xl"
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Conecta tu cuenta de Trakt
              </h2>
              <p className="text-zinc-400 max-w-sm mb-8 text-sm">
                Conecta tu cuenta de Trakt para ver las series que estás viendo
                actualmente con su progreso detallado.
              </p>
              <button
                type="button"
                onClick={() =>
                  window.location.assign(
                    "/api/trakt/auth/start?next=/in-progress",
                  )
                }
                className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition shadow-lg shadow-white/10"
              >
                Conectar ahora
              </button>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Background ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-sky-500/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* ========== HEADER (same pattern as History, Favorites, Watchlist, Calendar) ========== */}
        <motion.header
          className="mb-6 lg:mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px w-12 bg-emerald-500" />
                <span className="text-emerald-400 font-bold uppercase tracking-widest text-xs">
                  SEGUIMIENTO
                </span>
              </div>
              <div className="flex items-center gap-6">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                  {activeTab === "completed" ? "Completadas" : "En Progreso"}
                  <span className="text-emerald-500">.</span>
                </h1>

                {/* Action buttons next to title */}
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={() =>
                      activeTab === "completed" ? loadCompleted() : loadData()
                    }
                    disabled={currentLoading || auth.loading}
                    className="p-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full transition disabled:opacity-50"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                    whileHover={{
                      scale: currentLoading || auth.loading ? 1 : 1.05,
                    }}
                    whileTap={{
                      scale: currentLoading || auth.loading ? 1 : 0.95,
                    }}
                    title="Sincronizar"
                  >
                    <RotateCcw
                      className={`w-5 h-5 text-white ${currentLoading || auth.loading ? "animate-spin" : ""}`}
                    />
                  </motion.button>

                  <motion.button
                    onClick={() => setShowDisconnectModal(true)}
                    disabled={currentLoading || auth.loading}
                    className="p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-full transition disabled:opacity-50"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.4 }}
                    whileHover={{
                      scale: currentLoading || auth.loading ? 1 : 1.05,
                    }}
                    whileTap={{
                      scale: currentLoading || auth.loading ? 1 : 0.95,
                    }}
                    title="Desconectar"
                  >
                    <LogOut className="w-5 h-5 text-red-400" />
                  </motion.button>
                </div>
              </div>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
                {activeTab === "completed"
                  ? "Series que ya has terminado de ver."
                  : "Series que estás viendo actualmente con su progreso."}
              </p>
            </div>

            {/* Stats cards on the right (same as History) */}
            <motion.div
              className="grid grid-cols-4 gap-2 md:gap-4 w-full lg:w-auto lg:flex lg:justify-end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <motion.div
                className="w-full min-w-0"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
              >
                <StatCard
                  label="Series"
                  value={currentStats?.total ?? 0}
                  loading={!currentDataLoaded}
                  icon={Tv}
                  colorClass="text-emerald-400 bg-emerald-500/10"
                />
              </motion.div>
              <motion.div
                className="w-full min-w-0"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.6 }}
              >
                <StatCard
                  label="Progreso Medio"
                  value={`${currentStats?.avgProgress ?? 0}%`}
                  loading={!currentDataLoaded}
                  icon={TrendingUp}
                  colorClass="text-purple-400 bg-purple-500/10"
                />
              </motion.div>
              <motion.div
                className="w-full min-w-0"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.7 }}
              >
                <StatCard
                  label="Eps. Vistos"
                  value={currentStats?.totalEpisodesWatched ?? 0}
                  loading={!currentDataLoaded}
                  icon={Eye}
                  colorClass="text-sky-400 bg-sky-500/10"
                />
              </motion.div>
              <motion.div
                className="w-full min-w-0"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.8 }}
              >
                <StatCard
                  label="Eps. Restantes"
                  value={currentStats?.totalEpisodesRemaining ?? 0}
                  loading={!currentDataLoaded}
                  icon={Layers}
                  colorClass="text-amber-400 bg-amber-500/10"
                />
              </motion.div>
            </motion.div>
          </div>
        </motion.header>

        {/* ========== FILTERS (same pattern as History) ========== */}
        <motion.div
          ref={(el) => {
            if (el && !el.dataset.stickySetup) {
              el.dataset.stickySetup = "true";
              const observer = new IntersectionObserver(
                ([e]) => {
                  const isStuck = e.intersectionRatio < 1;
                  if (isStuck) {
                    el.classList.add(
                      "backdrop-blur-xl",
                      "bg-gradient-to-br",
                      "from-black/60",
                      "via-black/50",
                      "to-black/55",
                    );
                  } else {
                    el.classList.remove(
                      "backdrop-blur-xl",
                      "bg-gradient-to-br",
                      "from-black/60",
                      "via-black/50",
                      "to-black/55",
                    );
                  }
                },
                { threshold: [1], rootMargin: "-65px 0px 0px 0px" },
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
                className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-zinc-600"
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
              className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border transition-all ${
                mobileFiltersOpen
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
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
                  {/* Fila 1: Ordenar + tabs Viendo/Completadas (solo icono) */}
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 min-w-0">
                      <InlineDropdown
                        label="Ordenar"
                        valueLabel={sortLabels[sortBy]}
                        icon={ArrowUpDown}
                      >
                        {({ close }) => (
                          <>
                            {Object.entries(sortLabels).map(([key, label]) => (
                              <DropdownItem
                                key={key}
                                active={sortBy === key}
                                onClick={() => {
                                  setSortBy(key);
                                  close();
                                }}
                              >
                                {label}
                              </DropdownItem>
                            ))}
                          </>
                        )}
                      </InlineDropdown>
                    </div>
                    <div className="flex w-28 bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center">
                      <button
                        onClick={() => setActiveTab("inprogress")}
                        title={`Viendo${dataLoaded ? ` (${items.length})` : ""}`}
                        className={`flex-1 h-full rounded-lg transition-all flex items-center justify-center ${
                          activeTab === "inprogress"
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      >
                        <Play
                          className="w-4 h-4"
                          fill={
                            activeTab === "inprogress" ? "currentColor" : "none"
                          }
                        />
                      </button>
                      <button
                        onClick={() => setActiveTab("completed")}
                        title={`Completadas${completedLoaded ? ` (${completedItems.length})` : ""}`}
                        className={`flex-1 h-full rounded-lg transition-all flex items-center justify-center ${
                          activeTab === "completed"
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Fila 2: Agrupar + botones de vista */}
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 min-w-0">
                      <InlineDropdown
                        label="Agrupar"
                        valueLabel={groupLabels[groupBy]}
                        icon={Layers}
                      >
                        {({ close }) => (
                          <>
                            {Object.entries(groupLabels).map(([key, label]) => (
                              <DropdownItem
                                key={key}
                                active={groupBy === key}
                                onClick={() => {
                                  setGroupBy(key);
                                  close();
                                }}
                              >
                                {label}
                              </DropdownItem>
                            ))}
                          </>
                        )}
                      </InlineDropdown>
                    </div>
                    <div className="flex w-28 bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center">
                      <button
                        onClick={() => setViewMode("cards")}
                        title="Tarjetas"
                        className={`flex-1 h-full rounded-lg transition-all flex items-center justify-center ${
                          viewMode === "cards"
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      >
                        <Film className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode("poster")}
                        title="Poster"
                        className={`flex-1 h-full rounded-lg transition-all flex items-center justify-center ${
                          viewMode === "poster"
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode("compact")}
                        title="Lista"
                        className={`flex-1 h-full rounded-lg transition-all flex items-center justify-center ${
                          viewMode === "compact"
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      >
                        <LayoutList className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop: Single row */}
          <div className="hidden lg:flex gap-3">
            {/* Section tabs */}
            <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 shrink-0">
              <button
                onClick={() => setActiveTab("inprogress")}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === "inprogress"
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                <Play
                  className="w-3.5 h-3.5"
                  fill={activeTab === "inprogress" ? "currentColor" : "none"}
                />
                Viendo
                {dataLoaded && (
                  <span className="text-xs opacity-70">({items.length})</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("completed")}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === "completed"
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Completadas
                {completedLoaded && (
                  <span className="text-xs opacity-70">
                    ({completedItems.length})
                  </span>
                )}
              </button>
            </div>

            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por título..."
                className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-zinc-600"
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
              label="Ordenar"
              valueLabel={sortLabels[sortBy]}
              icon={ArrowUpDown}
            >
              {({ close }) => (
                <>
                  {Object.entries(sortLabels).map(([key, label]) => (
                    <DropdownItem
                      key={key}
                      active={sortBy === key}
                      onClick={() => {
                        setSortBy(key);
                        close();
                      }}
                    >
                      {label}
                    </DropdownItem>
                  ))}
                </>
              )}
            </InlineDropdown>

            <InlineDropdown
              label="Agrupar"
              valueLabel={groupLabels[groupBy]}
              icon={Layers}
            >
              {({ close }) => (
                <>
                  {Object.entries(groupLabels).map(([key, label]) => (
                    <DropdownItem
                      key={key}
                      active={groupBy === key}
                      onClick={() => {
                        setGroupBy(key);
                        close();
                      }}
                    >
                      {label}
                    </DropdownItem>
                  ))}
                </>
              )}
            </InlineDropdown>

            {/* View mode */}
            <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
              <button
                onClick={() => setViewMode("cards")}
                className={`p-2 rounded-lg transition ${
                  viewMode === "cards"
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                }`}
                title="Tarjetas"
              >
                <Film className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("poster")}
                className={`p-2 rounded-lg transition ${
                  viewMode === "poster"
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                }`}
                title="Poster"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("compact")}
                className={`p-2 rounded-lg transition ${
                  viewMode === "compact"
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                }`}
                title="Lista"
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* ========== CONTENT ========== */}

        {/* Loading state */}
        {(currentLoading || auth.loading) && (
          <div
            className={
              viewMode === "cards"
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6"
                : viewMode === "poster"
                  ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 lg:gap-4"
                  : "grid grid-cols-1 xl:grid-cols-2 gap-4"
            }
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} viewMode={viewMode} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!currentLoading && !auth.loading && filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-16 h-16 mb-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              {activeTab === "completed" ? (
                <CheckCircle2 className="w-8 h-8 text-zinc-600" />
              ) : (
                <Tv className="w-8 h-8 text-zinc-600" />
              )}
            </div>
            <h3 className="text-lg font-bold text-zinc-400 mb-2">
              {q
                ? "Sin resultados"
                : activeTab === "completed"
                  ? "No tienes series completadas"
                  : "No tienes series en progreso"}
            </h3>
            <p className="text-sm text-zinc-600 max-w-sm">
              {q
                ? `No se encontraron series que coincidan con "${q}"`
                : activeTab === "completed"
                  ? "Completa una serie en Trakt para verla aquí."
                  : "Empieza a ver una serie y márcala en Trakt para verla aquí."}
            </p>
          </motion.div>
        )}

        {/* Items */}
        {!currentLoading && !auth.loading && filtered.length > 0 && (
          <AnimatePresence mode="popLayout">
            {grouped && grouped.length > 0 ? (
              // Grouped view
              <div className="space-y-6">
                {grouped.map((group) => (
                  <div key={group.key}>
                    <GroupDivider
                      title={group.label}
                      count={group.items.length}
                      total={filtered.length}
                      avgProgress={group.avgProgress}
                    />

                    {viewMode === "cards" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                        {group.items.map((item, idx) => (
                          <InProgressCard
                            key={item.tmdbId}
                            item={item}
                            index={idx}
                            viewMode="cards"
                            activeTab={activeTab}
                          />
                        ))}
                      </div>
                    ) : viewMode === "poster" ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 lg:gap-4">
                        {group.items.map((item, idx) => (
                          <InProgressCard
                            key={item.tmdbId}
                            item={item}
                            index={idx}
                            viewMode="poster"
                            activeTab={activeTab}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {group.items.map((item, idx) => (
                          <InProgressCard
                            key={item.tmdbId}
                            item={item}
                            index={idx}
                            viewMode="compact"
                            activeTab={activeTab}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // Ungrouped view
              <>
                {viewMode === "cards" ? (
                  <motion.div
                    key="cards-grid"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6"
                    layout
                  >
                    {filtered.map((item, idx) => (
                      <InProgressCard
                        key={item.tmdbId}
                        item={item}
                        index={idx}
                        viewMode="cards"
                        activeTab={activeTab}
                      />
                    ))}
                  </motion.div>
                ) : viewMode === "poster" ? (
                  <motion.div
                    key="poster-grid"
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 lg:gap-4"
                    layout
                  >
                    {filtered.map((item, idx) => (
                      <InProgressCard
                        key={item.tmdbId}
                        item={item}
                        index={idx}
                        viewMode="poster"
                        activeTab={activeTab}
                      />
                    ))}
                  </motion.div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {filtered.map((item, idx) => (
                      <InProgressCard
                        key={item.tmdbId}
                        item={item}
                        index={idx}
                        viewMode="compact"
                        activeTab={activeTab}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* ========== DISCONNECT MODAL ========== */}
      <AnimatePresence>
        {showDisconnectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
            onClick={() => setShowDisconnectModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <LogOut className="w-10 h-10 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">
                ¿Desconectar Trakt?
              </h3>
              <p className="text-sm text-zinc-400 mb-6">
                Se eliminará la conexión con tu cuenta de Trakt.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDisconnectModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-white font-semibold text-sm hover:bg-zinc-700 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-500 transition"
                >
                  Desconectar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
