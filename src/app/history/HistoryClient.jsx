"use client";


import OptimizedImage from "@/components/OptimizedImage";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Film,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  Tv,
  LayoutList,
  LayoutGrid,
  Filter,
  CheckCircle2,
  Eye,
  Layers,
  Grid3x3,
  ArrowUpDown,
  Calendar,
  X,
  LogOut,
  SlidersHorizontal,
  MonitorPlay,
} from "lucide-react";

import {
  traktAuthStatus,
  traktGetHistory,
  traktDisconnect,
} from "@/lib/api/traktClient";
import LiquidButton from "@/components/LiquidButton";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import { isServerUnavailable } from "@/lib/offline/serverError";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";
import HistorySectionNav from "@/components/HistorySectionNav";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import {
  normalizeSearchText,
  titleMatchesQuery,
} from "@/lib/search/titleMatching";
import { TMDB_IMAGE_LANGS_PARAM } from "@/lib/tmdb/imageLanguages";

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const HISTORY_PAGE_SIZE = 200;
const HISTORY_CACHE_KEY = "showverse:history:items:v4";
const HISTORY_CACHE_TTL_MS = 10 * 60 * 1000;
const RESTORATION_COMPLETE_KEY = "showverse:scroll-restoration-complete";
const RESTORATION_COMPLETE_EVENT = "showverse:scroll-restoration-complete";
const RESTORATION_COMPLETE_MAX_AGE_MS = 30_000;

function isTraktUnavailableError(error) {
  const status = Number(error?.status || error?.payload?.upstreamStatus || 0);
  return status === 429 || status === 401 || status === 403 || status >= 500;
}

// ----------------------------
// UTILS
// ----------------------------
const pad2 = (n) => String(n).padStart(2, "0");

// Persisted in localStorage (survives across sessions) and served
// stale-while-revalidate: cached items paint instantly on the first visit of a
// new session, then a background refresh replaces them. A hard age cap drops
// data that is too old to be useful.
const HISTORY_CACHE_HARD_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 días
// `localStorage` tiene una cuota pequeña y puede rechazar silenciosamente una
// lista larga. La navegación a DetailsClient ocurre dentro de la misma sesión,
// así que esta copia en memoria es la fuente de verdad para volver a una página
// posterior a la primera; localStorage queda como respaldo entre recargas.
let historySessionCache = null;

function normalizeHistoryCache(cache) {
  if (!Array.isArray(cache?.items)) return null;

  const age = Date.now() - Number(cache.t || 0);
  if (age < 0 || age > HISTORY_CACHE_HARD_MAX_AGE) return null;

  return {
    items: cache.items,
    hasMore: !!cache.hasMore,
    // Cursor de la SIGUIENTE página a cargar. Se persiste para que, al volver
    // (atrás/adelante), la paginación continúe donde estaba en vez de re-pedir
    // desde la página 1. Cachés antiguas sin este campo → 1 (el dedupe evita
    // duplicados si se re-pide una página ya cargada).
    nextPage: Number(cache.nextPage) > 1 ? Number(cache.nextPage) : 1,
    fresh: age < HISTORY_CACHE_TTL_MS,
  };
}

function readHistoryCache() {
  if (typeof window === "undefined") return null;

  const inMemory = normalizeHistoryCache(historySessionCache);
  if (inMemory) return inMemory;

  try {
    const raw = window.localStorage.getItem(HISTORY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const cached = normalizeHistoryCache(parsed);
    if (!cached) {
      window.localStorage.removeItem(HISTORY_CACHE_KEY);
      return null;
    }
    historySessionCache = parsed;
    return cached;
  } catch {
    return null;
  }
}

function writeHistoryCache(items, { hasMore = false, nextPage } = {}) {
  if (typeof window === "undefined") return;

  const snapshot = {
    t: Date.now(),
    items: Array.isArray(items) ? items : [],
    hasMore: !!hasMore,
    // Cursor de la siguiente página (para reanudar la paginación al volver).
    nextPage: Number(nextPage) > 1 ? Number(nextPage) : 1,
  };
  historySessionCache = snapshot;

  try {
    window.localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(snapshot));
  } catch {}
}

function clearHistoryCache() {
  if (typeof window === "undefined") return;
  historySessionCache = null;
  try {
    window.localStorage.removeItem(HISTORY_CACHE_KEY);
  } catch {}
}

function hasCompletedScrollRestoration() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(RESTORATION_COMPLETE_KEY);
    if (!raw) return false;
    const marker = JSON.parse(raw);
    const age = Date.now() - Number(marker?.at || 0);
    const route = `${window.location.pathname}${window.location.search}`;
    return (
      age >= 0 &&
      age <= RESTORATION_COMPLETE_MAX_AGE_MS &&
      marker?.route === route
    );
  } catch {
    return false;
  }
}

function ymdLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Formateadores de fecha CREADOS UNA SOLA VEZ (módulo). Construir un
// Intl.DateTimeFormat es CARO (~0,5-2ms en móvil); antes se creaban DOS por
// tarjeta en cada render, y al VOLVER (atrás) se renderizan cientos de tarjetas
// de golpe → segundos de bloqueo del hilo principal justo cuando
// <ScrollRestoration> intenta restaurar la posición. Con los formateadores
// cacheados, `format()` es ~100× más barato y la restauración es inmediata.
const DATE_FMT_MONTH_YEAR = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
});
const DATE_FMT_FULL_DAY = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});
const DATE_FMT_MONTH_SHORT = new Intl.DateTimeFormat("es-ES", {
  month: "short",
});
const DATE_FMT_DAY_NUM = new Intl.DateTimeFormat("es-ES", { day: "numeric" });

function formatDateHeader(date, mode = "day") {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  if (mode === "year") return String(d.getFullYear());
  if (mode === "month") {
    return DATE_FMT_MONTH_YEAR.format(d);
  }
  return DATE_FMT_FULL_DAY.format(d);
}

function formatWatchedBadgeDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const month = DATE_FMT_MONTH_SHORT.format(d)
    .replace(".", "")
    .slice(0, 3)
    .toUpperCase();
  const day = DATE_FMT_DAY_NUM.format(d);
  return {
    month,
    day,
    label: `${day} ${month.toLowerCase()}`,
  };
}

function getItemType(entry) {
  const t = entry?.type;
  if (t === "movie" || t === "show") return t;
  if (t === "episode" || t === "episodes") return "show";
  if (entry?.movie) return "movie";
  if (entry?.show) return "show";
  return null;
}

function isEpisodeEntry(entry) {
  const t = entry?.type;
  if (t === "episode" || t === "episodes") return true;
  if (entry?.episode) return true;

  // por si tu API lo aplana:
  const s = entry?.season ?? entry?.season_number ?? entry?.seasonNumber;
  const e = entry?.number ?? entry?.episode_number ?? entry?.episodeNumber;
  return s != null && e != null;
}

function getEpisodeMeta(entry) {
  const seasonRaw =
    entry?.episode?.season ??
    entry?.season ??
    entry?.season_number ??
    entry?.seasonNumber;

  const episodeRaw =
    entry?.episode?.number ??
    entry?.episode?.episode ?? // por si algún mapeo raro
    entry?.number ??
    entry?.episode_number ??
    entry?.episodeNumber;

  if (seasonRaw == null || episodeRaw == null) return null;

  const season = Number(seasonRaw);
  const episode = Number(episodeRaw);
  if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;

  const title =
    entry?.episode?.title ??
    entry?.episodeTitle ??
    entry?.episode?.name ??
    null;

  return { season, episode, title };
}

// IMPORTANTE: si es episodio, prioriza el TMDb de la SERIE (show)
function getTmdbId(entry) {
  if (isEpisodeEntry(entry)) {
    return (
      entry?.tmdbId ||
      entry?.show?.ids?.tmdb ||
      entry?.show?.tmdbId ||
      entry?.show_tmdb_id ||
      entry?.tmdb_show_id ||
      // fallback (por si solo llega el del episodio)
      entry?.ids?.tmdb ||
      entry?.episode?.ids?.tmdb ||
      null
    );
  }

  return (
    entry?.tmdbId ||
    entry?.ids?.tmdb ||
    entry?.movie?.ids?.tmdb ||
    entry?.show?.ids?.tmdb ||
    null
  );
}

// Badge “bonito” (chip) con pad y punto
function formatEpisodeBadge(meta) {
  if (!meta) return null;
  return `T${pad2(meta.season)} · E${pad2(meta.episode)}`;
}

// formato para el TÍTULO (sin pad, sin punto)
// Querías: "Juego de tronos T1 E1"
function formatEpisodeInline(meta) {
  if (!meta) return null;
  return `T${meta.season} E${meta.episode}`;
}

// Agrupa episodios consecutivos de la misma serie (mismo tmdbId + poster_path)
function collapseConsecutive(items) {
  if (!items.length) return items;
  const result = [];
  let current = { ...items[0], _group: [items[0]] };

  for (let i = 1; i < items.length; i++) {
    const curr = items[i];
    const currentTmdbId = getTmdbId(current);
    const currTmdbId = getTmdbId(curr);
    const sameShow =
      getItemType(current) === "show" &&
      getItemType(curr) === "show" &&
      currentTmdbId &&
      currentTmdbId === currTmdbId;
    if (sameShow) {
      current._group.push(curr);
    } else {
      result.push(current);
      current = { ...curr, _group: [curr] };
    }
  }
  result.push(current);
  return result;
}

// Obtiene rango de episodios de un grupo colapsado
function getEpisodeRange(group) {
  if (!group || group.length < 2) return null;
  const metas = group.map((e) => getEpisodeMeta(e)).filter(Boolean);
  if (metas.length < 2) return null;
  const seasons = [...new Set(metas.map((m) => m.season))];
  if (seasons.length === 1) {
    const eps = metas.map((m) => m.episode).sort((a, b) => a - b);
    return `T${seasons[0]} E${eps[0]}-E${eps[eps.length - 1]}`;
  }
  const first = metas[0];
  const last = metas[metas.length - 1];
  return `T${first.season}E${first.episode} – T${last.season}E${last.episode}`;
}

function getMainTitle(entry) {
  return (
    entry?.title_es ||
    entry?.show?.title ||
    entry?.movie?.title ||
    entry?.title ||
    "Sin título"
  );
}

function getHistoryId(entry) {
  return entry?.id || entry?.history_id || null;
}

function getDetailsHref(entry) {
  const type = getItemType(entry);
  const tmdbId = getTmdbId(entry);
  if (!type || !tmdbId) return null;

  // Película -> details/movie/:id
  if (type === "movie") {
    return `/details/movie/${tmdbId}`;
  }

  // Serie / Episodio -> details/tv/:id ...
  const mediaType = "tv";

  // Si es episodio, manda a la página del episodio
  if (isEpisodeEntry(entry)) {
    const meta = getEpisodeMeta(entry);
    if (meta?.season != null && meta?.episode != null) {
      return `/details/${mediaType}/${tmdbId}/season/${meta.season}/episode/${meta.episode}`;
    }
    // fallback si no tenemos season/episode por algún motivo
    return `/details/${mediaType}/${tmdbId}`;
  }

  // Serie normal -> details/tv/:id
  return `/details/${mediaType}/${tmdbId}`;
}

const HISTORY_INDICATOR_COLORS = {
  emerald: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  light: "bg-zinc-100/15 border-white/25 text-zinc-100",
  purple: "bg-purple-500/15 border-purple-500/30 text-purple-300",
  red: "bg-red-500/15 border-red-500/30 text-red-300",
  sky: "bg-sky-500/15 border-sky-500/30 text-sky-300",
};

function getHistoryIndicatorClass({
  side = "left",
  compact = false,
  color = "emerald",
  visibility = "hover",
  interactive = false,
}) {
  const sideClass =
    side === "right"
      ? "right-0 rounded-bl-2xl border-l origin-top-right"
      : "left-0 rounded-br-2xl border-r origin-top-left";
  const paddingClass = compact ? "p-1.5 sm:p-2" : "p-2 sm:p-2.5";
  const visibilityClass =
    visibility === "always"
      ? "flex opacity-100 scale-100"
      : visibility === "mobile-edit"
        ? "flex opacity-100 scale-100 lg:scale-0 lg:opacity-0 lg:group-hover:scale-100 lg:group-hover:opacity-100"
        : "hidden lg:flex lg:scale-0 lg:opacity-0 lg:group-hover:scale-100 lg:group-hover:opacity-100";

  return [
    "items-center justify-center absolute top-0 z-20 border-b backdrop-blur-md shadow-sm",
    paddingClass,
    sideClass,
    "transition-all duration-300 ease-out transform-gpu",
    visibilityClass,
    HISTORY_INDICATOR_COLORS[color] || HISTORY_INDICATOR_COLORS.emerald,
    interactive ? "pointer-events-auto" : "pointer-events-none",
  ].join(" ");
}

function HistoryCornerIndicator({
  editMode,
  confirmDel,
  onDelete,
  dateParts,
  compact = false,
}) {
  if (confirmDel) return null;

  if (editMode) {
    return (
      <button
        onClick={onDelete}
        className={`${getHistoryIndicatorClass({
          side: "right",
          compact,
          color: "red",
          visibility: "mobile-edit",
          interactive: true,
        })} hover:bg-red-500/30 hover:text-red-200`}
        title="Borrar"
        aria-label="Borrar"
      >
        <Trash2
          className={
            compact ? "w-3.5 h-3.5 sm:w-4 sm:h-4" : "w-4 h-4 sm:w-[18px] sm:h-[18px]"
          }
        />
      </button>
    );
  }

  if (!dateParts) return null;

  return (
    <div
      className={`${getHistoryIndicatorClass({
        side: "right",
        compact,
        color: "light",
      })} flex-col gap-0`}
      aria-label={`Visto el ${dateParts.label}`}
    >
      <span className="text-[8px] sm:text-[9px] font-black uppercase leading-none tracking-[0.08em] [text-box:trim-both_cap_alphabetic]">
        {dateParts.month}
      </span>
      <span className="mt-0.5 text-sm sm:text-base font-black leading-none tracking-tight [text-box:trim-both_cap_alphabetic]">
        {dateParts.day}
      </span>
    </div>
  );
}

function normalizeHistoryResponse(json) {
  if (Array.isArray(json)) return { items: json };
  if (Array.isArray(json?.items)) return { items: json.items };
  return { items: [] };
}

// Intersection Observer hook for lazy loading
function useInView(options = {}) {
  const [isInView, setIsInView] = useState(false);
  const [hasBeenInView, setHasBeenInView] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const inView = entry.isIntersecting;
        setIsInView(inView);
        if (inView && !hasBeenInView) {
          setHasBeenInView(true);
        }
      },
      { threshold: 0.01, rootMargin: "200px", ...options },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasBeenInView, options.threshold, options.rootMargin]);

  return { ref, isInView, hasBeenInView };
}

// ----------------------------
// TMDb cache
// ----------------------------
const tmdbCache = new Map();
const tmdbInflight = new Map();
const backdropCache = new Map();
const backdropInflight = new Map();
const posterChoiceCache = new Map();
const posterInFlight = new Map();

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

function pickBestBackdropByLangResVotes(list) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const preferSet = new Set(["en"]);
  const isPreferredLang = (img) => preferSet.has(norm(img?.iso_639_1));

  const pool = list.filter((b) => (b?.width || 0) >= 1200);
  const finalPool = pool.length ? pool : list;

  const top3en = [];
  for (const b of finalPool) {
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
  if (!TMDB_API_KEY || !type || !id) return null;
  try {
    const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${TMDB_API_KEY}&${TMDB_IMAGE_LANGS_PARAM}`;
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return null;
    const j = await r.json();
    const best = pickBestBackdropByLangResVotes(j?.backdrops);
    return best?.file_path || null;
  } catch {
    return null;
  }
}

async function getBestBackdropCached(type, id) {
  const key = `${type}:${id}`;
  if (backdropCache.has(key)) return backdropCache.get(key);
  if (backdropInflight.has(key)) return backdropInflight.get(key);

  const p = (async () => {
    const chosen = await fetchBestBackdropEN(type, id);
    backdropCache.set(key, chosen || null);
    backdropInflight.delete(key);
    return chosen || null;
  })();

  backdropInflight.set(key, p);
  return p;
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
  if (!TMDB_API_KEY || !type || !id) return null;
  try {
    const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${TMDB_API_KEY}&${TMDB_IMAGE_LANGS_PARAM}`;
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

async function resolveFinalPosterPath({ type, id, entry }) {
  const tmdbType = type === "show" ? "tv" : "movie";
  const key = `${tmdbType}:${id}`;

  if (posterChoiceCache.has(key)) {
    return posterChoiceCache.get(key) || entry?.poster_path || entry?.backdrop_path || null;
  }

  const best = await getBestPosterCached(tmdbType, id);
  if (best) return best;

  const tmdb = await fetchTmdbPoster({ type, tmdbId: id });
  return tmdb?.poster_path || entry?.poster_path || entry?.backdrop_path || null;
}

async function fetchTmdbPoster({ type, tmdbId }) {
  const t = type === "show" ? "tv" : "movie";
  const key = `${t}:${tmdbId}`;
  if (tmdbCache.has(key)) return tmdbCache.get(key);
  if (tmdbInflight.has(key)) return tmdbInflight.get(key);

  const p = (async () => {
    if (!TMDB_API_KEY || !tmdbId) return null;
    try {
      const url = `https://api.themoviedb.org/3/${t}/${encodeURIComponent(tmdbId)}?api_key=${TMDB_API_KEY}&language=es-ES`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) return null;

      const title_es = t === "movie" ? json?.title : json?.name;
      const date = t === "movie" ? json?.release_date : json?.first_air_date;
      const year = date ? String(date).slice(0, 4) : null;

      const out = {
        poster_path: json?.poster_path || null,
        backdrop_path: json?.backdrop_path || null,
        title_es,
        year,
      };
      tmdbCache.set(key, out);
      return out;
    } catch {
      return null;
    } finally {
      tmdbInflight.delete(key);
    }
  })();

  tmdbInflight.set(key, p);
  return p;
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || "Error");
  return json;
}

// ----------------------------
// UI COMPONENTS
// ----------------------------
function StatCard({
  label,
  value,
  icon: Icon,
  colorClass = "text-white",
  loading = false,
}) {
  return (
    <div className="relative overflow-hidden w-full h-full min-h-[96px] sm:min-h-[112px] lg:min-h-[120px] lg:flex-none lg:min-w-[120px] rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-2 py-2 sm:px-3 sm:py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
      <div className={`relative z-10 mb-1 ${colorClass}`}>
        <Icon className="w-6 h-6 md:w-7 md:h-7" />
      </div>
      <div className="relative z-10 text-sm sm:text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight drop-shadow-md">
        {loading ? (
          <span className="inline-block h-4 w-8 sm:h-6 sm:w-10 md:h-8 md:w-14 rounded-lg bg-white/10 animate-pulse" />
        ) : (
          value
        )}
      </div>
      <div className="relative z-10 text-[8px] sm:text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wide text-center leading-tight">
        {label}
      </div>
    </div>
  );
}

function InlineDropdown({
  label,
  valueLabel,
  icon: Icon,
  children,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  // El menú se RENDERIZA POR PORTAL en <body> con position:fixed calculado desde
  // el botón. Así no lo recorta el stacking context del panel de filtros (el
  // `backdrop-blur` creaba un contexto que ocultaba el `absolute` anterior); el
  // menú queda siempre visible por encima de todo, igual que en Favoritos.
  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = Math.min(rect.width, window.innerWidth - 24);
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - menuWidth - 12),
    );
    const availableBelow = window.innerHeight - rect.bottom - 12;
    const menuMaxHeight = Math.max(64, Math.min(448, availableBelow));
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width: menuWidth,
      maxHeight: menuMaxHeight,
      zIndex: 1000,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const target = e.target;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const frame = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  return (
    <div ref={ref} className="relative min-w-0 w-full lg:w-auto lg:shrink">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={compact ? `${label}: ${valueLabel}` : undefined}
        className={`h-11 min-w-0 w-full inline-flex items-center justify-between gap-3 px-4 rounded-2xl transition-[min-width,background-color,color] text-sm lg:w-auto lg:max-w-none bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10 ${
          compact ? "lg:min-w-0" : "lg:min-w-[140px]"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="w-4 h-4 shrink-0 text-emerald-500" />}
          <span
            aria-hidden={compact}
            className={`shrink-0 overflow-hidden whitespace-nowrap text-zinc-500 font-bold text-xs uppercase tracking-wider transition-[max-width,opacity] duration-200 ${
              compact ? "max-w-0 opacity-0" : "max-w-24 opacity-100"
            }`}
          >
            {label}:
          </span>
          <span className="min-w-0 truncate font-semibold text-white">
            {valueLabel}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && menuStyle && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="overflow-y-auto overflow-x-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl p-2 shadow-2xl [scrollbar-color:#3f3f46_transparent]"
                style={{
                  ...menuStyle,
                  scrollbarWidth: "thin",
                  scrollbarGutter: "stable",
                  overscrollBehavior: "contain",
                }}
              >
                {children({ close: () => setOpen(false) })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

function DropdownItem({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2 rounded-xl text-left text-sm transition flex items-center justify-between
        ${active ? "bg-white/10 text-white font-bold" : "text-zinc-300 hover:bg-white/5 hover:text-white"}`}
    >
      <span className="font-medium">{children}</span>
      {active && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
    </button>
  );
}

// ----------------------------
// Calendar Panel
// ----------------------------
function buildMonthGrid(year, month, weekStartsOn = 1) {
  const first = new Date(year, month, 1);
  const firstDow = first.getDay();
  const offset = (firstDow - weekStartsOn + 7) % 7;
  const start = new Date(year, month, 1 - offset);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      week.push(d);
    }
    weeks.push(week);
  }
  return weeks;
}

// Vista de calendario con portadas
function CalendarWithPosters({
  monthDate,
  historyItems,
  onPrev,
  onNext,
  onClose,
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const weeks = useMemo(() => buildMonthGrid(year, month, 1), [year, month]);
  const monthLabel = useMemo(
    () => DATE_FMT_MONTH_YEAR.format(monthDate),
    [monthDate],
  );
  const dow = ["L", "M", "X", "J", "V", "S", "D"];
  const [selectedDayKey, setSelectedDayKey] = useState(null);

  // Cerrar drawer al cambiar de mes
  useEffect(() => {
    setSelectedDayKey(null);
  }, [monthDate]);

  // Agrupar items por día
  const itemsByDay = useMemo(() => {
    const map = {};
    historyItems.forEach((item) => {
      const key = ymdLocal(new Date(item?.watched_at || Date.now()));
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [historyItems]);

  const selectedDayItems = selectedDayKey
    ? itemsByDay[selectedDayKey] || []
    : [];
  const selectedDayCollapsed = useMemo(
    () => collapseConsecutive(selectedDayItems),
    [selectedDayItems],
  );

  const MAX_POSTERS = 8;

  return (
    <div className="flex flex-col h-full gap-2 lg:gap-2.5 relative">
      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-900/40 border border-zinc-800 rounded-xl lg:rounded-2xl px-3 py-2 lg:px-4 lg:py-3 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 lg:gap-3">
          <div className="p-1.5 lg:p-2 bg-emerald-500/10 rounded-lg lg:rounded-xl border border-emerald-500/20">
            <Calendar className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg lg:text-xl font-bold text-white capitalize leading-none">
              {monthLabel}
            </h2>
            <p className="hidden lg:block text-[10px] text-emerald-500/70 mt-0.5">
              Pulsa un día para ver su contenido
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 lg:gap-2">
          <div className="flex gap-1 bg-zinc-900 rounded-lg lg:rounded-xl p-0.5 lg:p-1 border border-zinc-800">
            <button
              onClick={onPrev}
              className="p-1.5 lg:p-2 hover:bg-zinc-800 rounded-md lg:rounded-lg transition text-zinc-300 hover:text-white"
            >
              <ChevronLeft className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            </button>
            <button
              onClick={onNext}
              className="p-1.5 lg:p-2 hover:bg-zinc-800 rounded-md lg:rounded-lg transition text-zinc-300 hover:text-white"
            >
              <ChevronRight className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 lg:p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-lg lg:rounded-xl transition-all text-red-400 hover:text-red-300"
          >
            <X className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
          </button>
        </div>
      </div>

      {/* Días de la semana */}
      <div className="grid grid-cols-7 gap-1 lg:gap-1.5 shrink-0">
        {dow.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] lg:text-xs font-bold text-zinc-400 uppercase tracking-wider py-1 lg:py-1.5 bg-zinc-900/30 rounded-md border border-zinc-800/50"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid del calendario */}
      <div className="grid grid-cols-7 gap-1 lg:gap-1.5 flex-1 min-h-0">
        {weeks.flat().map((d) => {
          const inMonth = d.getMonth() === month;
          const key = ymdLocal(d);
          const items = key ? itemsByDay[key] || [] : [];
          const isToday = ymdLocal(new Date()) === key;
          const isSelected = key === selectedDayKey;
          const hasItems = inMonth && items.length > 0;

          return (
            <div
              key={d.toISOString()}
              onClick={
                hasItems
                  ? () => setSelectedDayKey(isSelected ? null : key)
                  : undefined
              }
              className={[
                "flex flex-col rounded-lg lg:rounded-xl border-2 transition-all relative overflow-visible",
                hasItems ? "cursor-pointer hover:z-10" : "",
                !inMonth
                  ? "bg-zinc-900/10 border-zinc-800/20"
                  : isSelected
                    ? "bg-gradient-to-br from-emerald-500/15 to-emerald-600/10 border-emerald-500/60 shadow-lg shadow-emerald-500/10"
                    : isToday
                      ? "bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/95 shadow-lg shadow-emerald-500/10"
                      : hasItems
                        ? "bg-zinc-900/40 border-zinc-800/50 hover:border-emerald-500/30 hover:bg-zinc-900/60"
                        : "bg-zinc-900/40 border-zinc-800/50",
              ].join(" ")}
            >
              {/* Número del día + badge count */}
              <div
                className={[
                  "px-1.5 py-1 lg:px-2 lg:py-1.5 text-xs lg:text-sm font-bold flex items-center justify-between shrink-0",
                  !inMonth
                    ? "text-zinc-700"
                    : isSelected
                      ? "text-emerald-300"
                      : isToday
                        ? "text-emerald-400"
                        : "text-zinc-300",
                ].join(" ")}
              >
                <span>{d.getDate()}</span>
                {hasItems && (
                  <span
                    className={[
                      "text-[9px] lg:text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                      isSelected
                        ? "bg-emerald-500/40 text-emerald-200"
                        : "bg-emerald-500/20 text-emerald-300",
                    ].join(" ")}
                  >
                    {items.length}
                  </span>
                )}
              </div>

              {/* Portadas apiladas */}
              {hasItems && (
                <div
                  className="flex-1 flex items-center justify-center px-1 pb-1 min-h-0 overflow-visible"
                  onMouseMove={(e) => {
                    const wrapper = e.currentTarget.querySelector(
                      "[data-poster-stack]",
                    );
                    if (!wrapper) return;
                    const children = Array.from(wrapper.children);
                    const total = children.length;
                    if (total <= 1) return;
                    const rect = wrapper.getBoundingClientRect();
                    const ratio = Math.max(
                      0,
                      Math.min(1, (e.clientX - rect.left) / rect.width),
                    );
                    const activeIdx = Math.min(
                      Math.floor(ratio * total),
                      total - 1,
                    );
                    const spread = Math.min(16, rect.width / (total + 1));
                    const totalWidth = spread * (total - 1);
                    const startOffset = -totalWidth / 2;
                    children.forEach((child, i) => {
                      const xPos = startOffset + i * spread;
                      if (i === activeIdx) {
                        child.style.zIndex = "20";
                        child.style.transform = `translateX(${xPos}px) translateY(-8px) scale(1.08)`;
                        child.style.opacity = "1";
                        child.style.filter = "brightness(1.1)";
                      } else {
                        child.style.zIndex = String(
                          total - Math.abs(i - activeIdx),
                        );
                        child.style.transform = `translateX(${xPos}px) scale(0.95)`;
                        child.style.opacity = "0.5";
                        child.style.filter = "brightness(0.7)";
                      }
                      child.style.transition = "all 0.2s ease-out";
                    });
                  }}
                  onMouseLeave={(e) => {
                    const wrapper = e.currentTarget.querySelector(
                      "[data-poster-stack]",
                    );
                    if (!wrapper) return;
                    const children = Array.from(wrapper.children);
                    children.forEach((child, i) => {
                      child.style.zIndex = String(children.length - i);
                      child.style.transform = `translateX(${i * 1.5}px) translateY(${i * 1.5}px) scale(1)`;
                      child.style.opacity = "1";
                      child.style.filter = "brightness(1)";
                      child.style.transition = "all 0.25s ease-out";
                    });
                  }}
                >
                  <div
                    data-poster-stack
                    className="relative w-full max-w-[80px] lg:max-w-[100px] aspect-[2/3]"
                  >
                    {items.slice(0, MAX_POSTERS).map((item, idx) => {
                      const shown = Math.min(items.length, MAX_POSTERS);
                      return (
                        <div
                          key={`${getTmdbId(item)}-${idx}`}
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            transform: `translateX(${idx * 1.5}px) translateY(${idx * 1.5}px)`,
                            zIndex: shown - idx,
                            transition: "all 0.25s ease-out",
                          }}
                        >
                          <div className="w-full h-full rounded-md lg:rounded-lg overflow-hidden bg-zinc-900 border border-white/10 shadow-xl shadow-black/50">
                            <Poster entry={item} className="w-full h-full" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Badge +X si hay más del máximo */}
              {hasItems && items.length > MAX_POSTERS && (
                <div className="absolute bottom-1 right-1 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-[8px] lg:text-[9px] font-bold px-1 lg:px-1.5 py-0.5 rounded-md shadow-lg z-30 pointer-events-none">
                  +{items.length - MAX_POSTERS}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Drawer lateral: items del día seleccionado */}
      <AnimatePresence>
        {selectedDayKey && (
          <>
            {/* Fondo semitransparente */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-40 bg-black/40 backdrop-blur-[2px] rounded-2xl"
              onClick={() => setSelectedDayKey(null)}
            />
            {/* Panel drawer */}
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="absolute top-0 right-0 bottom-0 z-50 w-full sm:w-[440px] lg:w-[520px] bg-[#0c0c0c] border-l border-zinc-800 rounded-r-2xl flex flex-col shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header del drawer */}
              <div className="shrink-0 p-4 border-b border-zinc-800/80">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-bold text-white capitalize">
                    {formatDateHeader(new Date(selectedDayKey), "day")}
                  </h3>
                  <button
                    onClick={() => setSelectedDayKey(null)}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition"
                  >
                    <X className="w-4 h-4 text-zinc-400" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    {selectedDayItems.length}{" "}
                    {selectedDayItems.length === 1 ? "visto" : "vistos"}
                  </span>
                </div>
              </div>

              {/* Lista scrollable de items */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
                {selectedDayCollapsed.map((entry, idx) => {
                  const isGroup = entry._group && entry._group.length > 1;
                  const title = getMainTitle(entry);
                  const type = getItemType(entry);
                  const epMeta = isEpisodeEntry(entry)
                    ? getEpisodeMeta(entry)
                    : null;
                  const href = getDetailsHref(entry);

                  if (isGroup) {
                    const range = getEpisodeRange(entry._group);
                    return (
                      <CalendarDrawerGroup
                        key={`grp-${getTmdbId(entry)}-${idx}`}
                        entry={entry}
                        title={title}
                        type={type}
                        range={range}
                      />
                    );
                  }

                  return (
                    <Link
                      key={`item-${getHistoryId(entry) || idx}`}
                      href={href || "#"} prefetch
                      className="flex items-center gap-3.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors group/row"
                    >
                      <div className="w-[56px] h-[84px] shrink-0 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 shadow-md">
                        <Poster entry={entry} className="w-full h-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-bold text-white truncate group-hover/row:text-emerald-300 transition-colors">
                          {title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={[
                              "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                              type === "movie"
                                ? "bg-sky-500/20 text-sky-300"
                                : "bg-purple-500/20 text-purple-300",
                            ].join(" ")}
                          >
                            {type === "movie" ? "Película" : "Serie"}
                          </span>
                          {type === "show" && epMeta && (
                            <span className="text-[10px] font-semibold text-emerald-400">
                              {formatEpisodeBadge(epMeta)}
                            </span>
                          )}
                        </div>
                        {type === "show" && epMeta?.title && (
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                            {epMeta.title}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover/row:text-emerald-500 transition-colors shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Grupo colapsado de episodios dentro del drawer del calendario
function CalendarDrawerGroup({ entry, title, type, range }) {
  const [expanded, setExpanded] = useState(false);
  const count = entry._group.length;

  return (
    <div className="rounded-xl border border-zinc-800/60 overflow-hidden">
      {/* Header del grupo */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3.5 p-2.5 hover:bg-white/5 transition-colors"
      >
        <div className="w-[56px] h-[84px] shrink-0 relative">
          <div className="absolute inset-0 rounded-lg overflow-hidden bg-zinc-900 shadow-md">
            <Poster entry={entry} className="w-full h-full" />
          </div>
          <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 text-white shadow-lg">
            <Layers className="w-3 h-3" />
            {count}
          </div>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[15px] font-bold text-white truncate">{title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
              Serie
            </span>
            {range && (
              <span className="text-[10px] font-semibold text-emerald-400">
                {range}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          className={[
            "w-4 h-4 text-zinc-500 transition-transform shrink-0",
            expanded ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {/* Lista expandida de episodios */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800/50 bg-zinc-900/30">
              {entry._group.map((sub, subIdx) => {
                const subMeta = isEpisodeEntry(sub)
                  ? getEpisodeMeta(sub)
                  : null;
                const subHref = getDetailsHref(sub);
                return (
                  <Link
                    // Mismo motivo que en ExpandedGroupView: getHistoryId(sub) puede
                    // repetirse dentro de un grupo, así que se añade el índice para
                    // garantizar una key única.
                    key={`sub-${getHistoryId(sub) ?? "x"}-${subIdx}`}
                    href={subHref || "#"} prefetch
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors group/sub"
                  >
                    <div className="w-[44px] h-[66px] shrink-0 rounded-md overflow-hidden bg-zinc-900 border border-white/10 shadow-sm">
                      <Poster entry={sub} className="w-full h-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {subMeta && (
                        <p className="text-[11px] font-bold text-emerald-400">
                          {formatEpisodeBadge(subMeta)}
                        </p>
                      )}
                      {subMeta?.title && (
                        <p className="text-[10px] text-zinc-400 truncate">
                          {subMeta.title}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover/sub:text-emerald-500 transition-colors shrink-0" />
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CalendarPanel({
  monthDate,
  onPrev,
  onNext,
  countsByDay,
  selectedYmd,
  onSelectYmd,
  onToggleCalendarView,
  showCalendarView,
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const weeks = useMemo(() => buildMonthGrid(year, month, 1), [year, month]);
  const monthLabel = useMemo(
    () => DATE_FMT_MONTH_YEAR.format(monthDate),
    [monthDate],
  );
  const dow = ["L", "M", "X", "J", "V", "S", "D"];

  return (
    <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-xl rounded-3xl p-8 sticky top-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-white font-bold capitalize text-2xl tracking-tight">
            {monthLabel}
          </h3>
          <p className="text-sm text-emerald-500/70 mt-1 font-medium">
            Filtrar por día
          </p>
        </div>
        <div className="flex gap-2 bg-black/20 rounded-xl p-1.5 shadow-inner">
          <button
            onClick={onPrev}
            className="p-2 hover:bg-white/10 rounded-lg transition text-zinc-300"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={onNext}
            className="p-2 hover:bg-white/10 rounded-lg transition text-zinc-300"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3 mb-4">
        {dow.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-bold text-zinc-400 uppercase tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-3">
        {weeks.flat().map((d) => {
          const inMonth = d.getMonth() === month;
          const key = ymdLocal(d);
          const count = key ? countsByDay[key] || 0 : 0;
          const selected = key && selectedYmd === key;
          const isToday = ymdLocal(new Date()) === key;

          return (
            <button
              key={d.toISOString()}
              onClick={() => key && onSelectYmd(selected ? null : key)}
              disabled={!inMonth}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200 text-sm font-bold
                ${!inMonth ? "opacity-0 pointer-events-none" : "text-zinc-200"}
                ${
                  selected
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 z-10 scale-110"
                    : isToday
                      ? "bg-white/10 text-white ring-[2.5px] ring-inset ring-emerald-500/95"
                      : "bg-white/5 hover:bg-white/10 hover:text-white hover:scale-105"
                }`}
            >
              <span>{d.getDate()}</span>
              {count > 0 && !selected && (
                <div className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          );
        })}
      </div>

      {selectedYmd && (
        <button
          onClick={() => onSelectYmd(null)}
          className="mt-8 w-full py-3 text-sm font-bold text-emerald-400 hover:text-emerald-300 flex items-center justify-center gap-2 border-t border-white/10 uppercase tracking-wide transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Ver todo el mes
        </button>
      )}

      <button
        onClick={onToggleCalendarView}
        className={`mt-6 w-full py-3 text-sm font-bold flex items-center justify-center gap-2 rounded-xl transition-all ${
          showCalendarView
            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
            : "bg-black/20 text-zinc-200 hover:bg-black/30 hover:text-white border border-white/5"
        }`}
      >
        <Calendar className="w-4 h-4" />{" "}
        {showCalendarView ? "Vista Normal" : "Vista Calendario"}
      </button>
    </div>
  );
}

// ----------------------------
// History Item Component
// ----------------------------
function Poster({ entry, className = "" }) {
  const [posterPath, setPosterPath] = useState(null);
  const { ref, hasBeenInView } = useInView({
    threshold: 0.01,
    rootMargin: "350px",
  });

  const type = getItemType(entry);
  const id = getTmdbId(entry);

  useEffect(() => {
    let abort = false;
    if (!hasBeenInView || !type || !id) return;
    setPosterPath(null);

    const load = async () => {
      const finalPath = await resolveFinalPosterPath({ type, id, entry });
      if (finalPath && !abort) {
        setPosterPath(finalPath);
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [entry, hasBeenInView, type, id]);

  const src = posterPath
    ? `https://image.tmdb.org/t/p/w500${posterPath}`
    : null;

  return (
    <div
      ref={ref}
      className={`overflow-hidden bg-neutral-900 shrink-0 relative ${className}`}
    >
      {src ? (
        <OptimizedImage
          src={src}
          alt="poster"
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-600">
          <Film className="w-6 h-6" />
        </div>
      )}
    </div>
  );
}

// SmartPoster for Compact view - transitions from poster to backdrop on hover
function SmartPoster({ entry, title, mode = "poster" }) {
  const type = getItemType(entry);
  const id = getTmdbId(entry);
  const [src, setSrc] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;
    setSrc(null);
    setReady(false);

    const load = async () => {
      const tmdbType = type === "show" ? "tv" : "movie";
      const key = `${tmdbType}:${id}`;

      // BACKDROP MODE
      if (mode === "backdrop") {
        // Resolvemos SIEMPRE el backdrop final antes de mostrar nada (sin flash
        // de una imagen que luego se sobreescribe) y con fallback para no dejar
        // la tarjeta vacía.
        let finalPath;
        if (backdropCache.has(key)) {
          finalPath = backdropCache.get(key) || entry?.backdrop_path || entry?.poster_path || null;
        } else {
          const bestBackdrop = await getBestBackdropCached(tmdbType, id);
          if (bestBackdrop) {
            finalPath = bestBackdrop;
          } else {
            const r = await fetchTmdbPoster({ type, tmdbId: id });
            finalPath = r?.backdrop_path || r?.poster_path || entry?.backdrop_path || entry?.poster_path || null;
          }
        }

        if (finalPath && !abort) {
          const url = `https://image.tmdb.org/t/p/w780${finalPath}`;
          await preloadImage(url);
          if (!abort) {
            setSrc(url);
            setReady(true);
          }
        }
        return;
      }

      // POSTER MODE
      const finalPath = await resolveFinalPosterPath({ type, id, entry });
      if (finalPath) {
        const url = `https://image.tmdb.org/t/p/w500${finalPath}`;
        await preloadImage(url);
        if (!abort) {
          setSrc(url);
          setReady(true);
        }
      }
    };

    if (type && id) load();
    return () => {
      abort = true;
    };
  }, [mode, type, id, entry]);

  return (
    <div className="absolute inset-0 w-full h-full">
      <div
        className={`absolute inset-0 flex items-center justify-center bg-zinc-900 transition-opacity duration-300 ${
          ready && src ? "opacity-0" : "opacity-100"
        }`}
      >
        <Film className="w-8 h-8 text-zinc-700" />
      </div>

      {src && (
        <OptimizedImage
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

// Tarjeta modo LISTA
const HistoryItemCard = memo(function HistoryItemCard({
  entry,
  busy,
  onRemoveFromHistory,
  index = 0,
  totalItems = 0,
  editMode = false,
}) {
  const type = getItemType(entry);

  const epMeta = isEpisodeEntry(entry) ? getEpisodeMeta(entry) : null;
  const baseTitle = getMainTitle(entry);
  const isGroup = entry?._group && entry._group.length > 1;
  const groupCount = isGroup ? entry._group.length : 0;
  const groupRange = isGroup ? getEpisodeRange(entry._group) : null;

  const inlineEp = isGroup
    ? groupRange
    : type === "show" && epMeta
      ? formatEpisodeInline(epMeta)
      : null;

  // AQUÍ está la clave: el título incluye T1 E1
  const title = inlineEp ? `${baseTitle} ${inlineEp}` : baseTitle;

  const watchedDate = formatWatchedBadgeDate(entry?.watched_at);
  const href = useMemo(() => getDetailsHref(entry), [entry]);
  // Al pulsar la tarjeta se abre la ficha rápida (drawer derecho): la del EPISODIO
  // si la entrada es un episodio, o la de la serie/película en otro caso. Sin
  // provider, el <Link> navega con normalidad.
  const previewClick = usePreviewOpen();
  const episodeMetaForPreview = isEpisodeEntry(entry)
    ? getEpisodeMeta(entry)
    : null;
  const onPreviewClick = previewClick(entry, {
    previewId: getTmdbId(entry),
    mediaType: type === "movie" ? "movie" : "tv",
    // Entradas de episodio: abren la preview del EPISODIO (no la de la serie).
    episode:
      episodeMetaForPreview &&
      episodeMetaForPreview.season != null &&
      episodeMetaForPreview.episode != null
        ? {
            showId: getTmdbId(entry),
            seasonNumber: episodeMetaForPreview.season,
            episodeNumber: episodeMetaForPreview.episode,
            name: episodeMetaForPreview.title ?? null,
            showName: entry?.show?.title ?? entry?.showTitle ?? null,
          }
        : undefined,
  });
  const historyId = getHistoryId(entry);
  const [confirmDel, setConfirmDel] = useState(false);
  const [posterSrc, setPosterSrc] = useState(null);
  const [backdropReady, setBackdropReady] = useState(false);
  const { ref, hasBeenInView } = useInView({
    threshold: 0.01,
    rootMargin: "300px",
  });

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDel(true);
  };
  const handleConfirm = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await onRemoveFromHistory?.(entry, { historyId });
  };
  const handleCancel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDel(false);
  };

  // Optimized backdrop loading with Intersection Observer
  useEffect(() => {
    if (!hasBeenInView) return;

    let abort = false;
    const load = async () => {
      const t = getItemType(entry);
      const id = getTmdbId(entry);
      if (!t || !id) return;

      const tmdbType = t === "show" ? "tv" : "movie";
      const key = `${tmdbType}:${id}`;

      // Resolvemos SIEMPRE el backdrop final antes de mostrar nada (sin flash de
      // una imagen que luego se sobreescribe) y con fallback para no dejar la
      // tarjeta vacía.
      let finalPath;
      if (backdropCache.has(key)) {
        finalPath = backdropCache.get(key) || entry?.backdrop_path || entry?.poster_path || null;
      } else {
        const best = await getBestBackdropCached(tmdbType, id);
        if (best) {
          finalPath = best;
        } else {
          const r = await fetchTmdbPoster({ type: t, tmdbId: id });
          finalPath = r?.backdrop_path || r?.poster_path || entry?.backdrop_path || entry?.poster_path || null;
        }
      }

      if (finalPath && !abort) {
        const url = `https://image.tmdb.org/t/p/w780${finalPath}`;
        await preloadImage(url);
        if (!abort) {
          setPosterSrc(url);
          setBackdropReady(true);
        }
      }
    };
    load();
    return () => {
      abort = true;
    };
  }, [entry, hasBeenInView]);

  const Content = (
    <div
      className={`relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4 pr-12 transition-all ${busy ? "opacity-50 pointer-events-none grayscale" : ""}`}
    >
      <div className="w-[140px] sm:w-[210px] aspect-video rounded-lg relative shadow-md bg-zinc-900 shrink-0">
        <div className="absolute inset-0 rounded-[inherit] overflow-hidden">
          <div className="absolute inset-0 w-full h-full">
            <div
              className={`absolute inset-0 flex items-center justify-center bg-zinc-900 transition-opacity duration-300 ${
                backdropReady && posterSrc ? "opacity-0" : "opacity-100"
              }`}
            >
              <Film className="w-8 h-8 text-zinc-700" />
            </div>

            {posterSrc && (
              <OptimizedImage
                src={posterSrc}
                alt={title}
                loading="lazy"
                decoding="async"
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                  backdropReady ? "opacity-100" : "opacity-0"
                }`}
              />
            )}
          </div>
          {/* Gradiente superior suave para que los indicadores destaquen sobre fondos claros */}
          <div
            className={`absolute inset-x-0 top-0 h-16 sm:h-20 bg-gradient-to-b from-black/50 via-black/10 to-transparent z-10 pointer-events-none transition-opacity duration-300 ${isGroup ? "opacity-100" : "opacity-0 lg:group-hover:opacity-100"}`}
          />
          <div
            className={getHistoryIndicatorClass({
              color: isGroup ? "emerald" : type === "movie" ? "sky" : "purple",
              visibility: isGroup ? "always" : "hover",
            })}
          >
            {isGroup ? (
              <div className="flex items-center gap-1 font-bold text-xs sm:text-sm">
                <Layers className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                <span>{groupCount}</span>
              </div>
            ) : type === "movie" ? (
              <Film className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            ) : (
              <MonitorPlay className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <div className="flex items-center gap-2">
          <h4 className="text-white font-bold text-base leading-tight truncate">
            {title}
          </h4>
        </div>

        {(isGroup || (type === "show" && epMeta?.title)) && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 -ml-0.5">
            <span className="truncate max-w-[260px]">
              {isGroup ? `${groupCount} episodios agrupados` : epMeta.title}
            </span>
          </div>
        )}

      </div>

      <HistoryCornerIndicator
        editMode={editMode}
        confirmDel={confirmDel}
        onDelete={handleDeleteClick}
        dateParts={watchedDate}
      />

      {/* Confirmación de borrado */}
      <AnimatePresence>
        {confirmDel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/95 z-20 flex items-center justify-center px-3 gap-2 rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-red-200 text-[10px] sm:text-xs lg:text-sm font-bold tracking-wide">
              ¿Eliminar?
            </span>
            <button
              onClick={handleCancel}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors flex items-center justify-center"
              aria-label="Cancelar"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleConfirm}
              className="p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center justify-center"
              aria-label="Borrar"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // Reduce animation delay for large lists
  const isBackNav = useIsHistoryNavigation();
  const animDelay =
    totalItems > 20 ? Math.min(index * 0.02, 0.3) : index * 0.05;
  // En navegación de historial (atrás/adelante) no se anima la entrada.
  const shouldAnimate = !isBackNav && index < 50;

  if (!href || isGroup)
    return (
      <motion.div
        ref={ref}
        className="relative overflow-hidden bg-zinc-900/30 rounded-xl cursor-pointer hover:bg-zinc-900/60 transition-colors group"
        initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.95 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{
          duration: 0.25,
          delay: shouldAnimate ? animDelay : 0,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        layout={!isBackNav}
      >
        {/* Overlay de borde para que los indicadores queden por debajo */}
        <div className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] transition-shadow duration-300 group-hover:shadow-[inset_0_0_0_2.5px_rgba(16,185,129,0.95)]" />
        <div className="block">{Content}</div>
      </motion.div>
    );

  return (
    <motion.div
      ref={ref}
      initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.95 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{
        duration: 0.25,
        delay: shouldAnimate ? animDelay : 0,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      layout={!isBackNav}
    >
      <Link
        href={href}
        prefetch
        onClick={onPreviewClick}
        className="block relative overflow-hidden bg-zinc-900/30 rounded-xl hover:bg-zinc-900/60 transition-colors group"
      >
        {/* Overlay de borde para que los indicadores queden por debajo */}
        <div className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] transition-shadow duration-300 group-hover:shadow-[inset_0_0_0_2.5px_rgba(16,185,129,0.95)]" />
        {Content}
      </Link>
    </motion.div>
  );
});

// Tarjeta modo COMPACT (vista intermedia)
const HistoryCompactCard = memo(function HistoryCompactCard({
  entry,
  busy,
  onRemoveFromHistory,
  index = 0,
  totalItems = 0,
  editMode = false,
  isMobile = false,
}) {
  const type = getItemType(entry);
  const epMeta = isEpisodeEntry(entry) ? getEpisodeMeta(entry) : null;
  const baseTitle = getMainTitle(entry);
  const title = baseTitle;
  const epBadge = type === "show" && epMeta ? formatEpisodeBadge(epMeta) : null;
  const isGroup = entry?._group && entry._group.length > 1;
  const groupCount = isGroup ? entry._group.length : 0;
  const watchedDate = formatWatchedBadgeDate(entry?.watched_at);
  const href = useMemo(() => getDetailsHref(entry), [entry]);
  // Al pulsar la tarjeta se abre la ficha rápida (drawer derecho): la del EPISODIO
  // si la entrada es un episodio, o la de la serie/película en otro caso. Sin
  // provider, el <Link> navega con normalidad.
  const previewClick = usePreviewOpen();
  const episodeMetaForPreview = isEpisodeEntry(entry)
    ? getEpisodeMeta(entry)
    : null;
  const onPreviewClick = previewClick(entry, {
    previewId: getTmdbId(entry),
    mediaType: type === "movie" ? "movie" : "tv",
    // Entradas de episodio: abren la preview del EPISODIO (no la de la serie).
    episode:
      episodeMetaForPreview &&
      episodeMetaForPreview.season != null &&
      episodeMetaForPreview.episode != null
        ? {
            showId: getTmdbId(entry),
            seasonNumber: episodeMetaForPreview.season,
            episodeNumber: episodeMetaForPreview.episode,
            name: episodeMetaForPreview.title ?? null,
            showName: entry?.show?.title ?? entry?.showTitle ?? null,
          }
        : undefined,
  });
  const historyId = getHistoryId(entry);
  const [confirmDel, setConfirmDel] = useState(false);

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDel(true);
  };
  const handleConfirm = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await onRemoveFromHistory?.(entry, { historyId });
  };
  const handleCancel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDel(false);
  };

  const disabledCls = busy ? "opacity-60 pointer-events-none grayscale" : "";

  const CardInner = (
    <motion.div
      className={`relative aspect-[2/3] compact-card group overflow-hidden rounded-lg bg-zinc-900 shadow-md ${disabledCls}`}
      whileHover={{
        scale: 1.15,
        zIndex: 50,
        boxShadow:
          "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
      }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      style={{
        transformOrigin: "center center",
      }}
    >
      {/* Overlay de borde para que los indicadores queden por debajo */}
      <div className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] transition-shadow duration-300 group-hover:shadow-[inset_0_0_0_2.5px_rgba(16,185,129,0.95)]" />
      <div className="absolute inset-0 rounded-[inherit] overflow-hidden">
        {/* Poster Image */}
        <Poster entry={entry} className="w-full h-full" />

        {/* Gradiente superior suave para que los indicadores destaquen sobre fondos claros */}
        <div
          className={`absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/50 via-black/10 to-transparent z-10 pointer-events-none transition-opacity duration-300 ${isGroup || (isMobile && editMode) ? "opacity-100" : "opacity-0 lg:group-hover:opacity-100"}`}
        />
        <div
          className={getHistoryIndicatorClass({
            compact: true,
            color: isGroup ? "emerald" : type === "movie" ? "sky" : "purple",
            visibility: isGroup ? "always" : "hover",
          })}
        >
          {isGroup ? (
            <div className="flex items-center gap-1 font-bold text-[10px] sm:text-xs">
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>{groupCount}</span>
            </div>
          ) : type === "movie" ? (
            <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          ) : (
            <MonitorPlay className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          )}
        </div>

        {/* Overlay con gradientes (Desktop) */}
        <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          {/* Top gradient para asegurar contraste visual del indicador */}
          <div className="p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <div />
          </div>

          {/* Bottom gradient con título e info */}
          <div className="p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
            <h5 className="text-white font-bold text-[10px] leading-tight line-clamp-2 mb-0.5">
              {title}
            </h5>

            {isGroup ? (
              <div className="text-[9px] text-emerald-300 font-semibold mt-0.5">
                {groupCount} episodios agrupados
              </div>
            ) : (
              type === "show" &&
              epBadge && (
                <div className="text-[9px] text-emerald-300 font-semibold mt-0.5">
                  {epBadge}
                </div>
              )
            )}
          </div>
        </div>

        {/* Delete confirmation overlay */}
        <AnimatePresence>
          {confirmDel && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/95 z-30 flex flex-col items-center justify-center p-3 text-center pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-red-200 text-[11px] sm:text-xs lg:text-sm font-bold mb-2.5 tracking-wide">
                ¿Eliminar del historial?
              </p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={handleCancel}
                  className="flex-1 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors flex items-center justify-center"
                  aria-label="Cancelar"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center justify-center"
                  aria-label="Borrar"
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <HistoryCornerIndicator
        editMode={editMode}
        confirmDel={confirmDel}
        onDelete={handleDeleteClick}
        dateParts={watchedDate}
        compact
      />
    </motion.div>
  );

  const isBackNav = useIsHistoryNavigation();
  const animDelay =
    totalItems > 30 ? Math.min(index * 0.015, 0.25) : index * 0.03;
  const shouldAnimate = !isBackNav && index < 60;

  if (!href || isGroup)
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
        layout={!isBackNav}
      >
        <div className="block cursor-pointer">{CardInner}</div>
      </motion.div>
    );

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
      layout={!isBackNav}
    >
      <Link href={href} prefetch onClick={onPreviewClick} className="block">
        {CardInner}
      </Link>
    </motion.div>
  );
});

// Tarjeta modo GRID
const HistoryGridCard = memo(function HistoryGridCard({
  entry,
  busy,
  onRemoveFromHistory,
  index = 0,
  totalItems = 0,
  editMode = false,
  isMobile = false,
}) {
  const type = getItemType(entry);

  const epMeta = isEpisodeEntry(entry) ? getEpisodeMeta(entry) : null;
  const baseTitle = getMainTitle(entry);
  const title = baseTitle;

  const episodeTitle = type === "show" && epMeta?.title ? epMeta.title : null;
  const epBadge = type === "show" && epMeta ? formatEpisodeBadge(epMeta) : null;
  const isGroup = entry?._group && entry._group.length > 1;
  const groupCount = isGroup ? entry._group.length : 0;
  const groupRange = isGroup ? getEpisodeRange(entry._group) : null;

  const watchedDate = formatWatchedBadgeDate(entry?.watched_at);
  const href = useMemo(() => getDetailsHref(entry), [entry]);
  // Al pulsar la tarjeta se abre la ficha rápida (drawer derecho): la del EPISODIO
  // si la entrada es un episodio, o la de la serie/película en otro caso. Sin
  // provider, el <Link> navega con normalidad.
  const previewClick = usePreviewOpen();
  const episodeMetaForPreview = isEpisodeEntry(entry)
    ? getEpisodeMeta(entry)
    : null;
  const onPreviewClick = previewClick(entry, {
    previewId: getTmdbId(entry),
    mediaType: type === "movie" ? "movie" : "tv",
    // Entradas de episodio: abren la preview del EPISODIO (no la de la serie).
    episode:
      episodeMetaForPreview &&
      episodeMetaForPreview.season != null &&
      episodeMetaForPreview.episode != null
        ? {
            showId: getTmdbId(entry),
            seasonNumber: episodeMetaForPreview.season,
            episodeNumber: episodeMetaForPreview.episode,
            name: episodeMetaForPreview.title ?? null,
            showName: entry?.show?.title ?? entry?.showTitle ?? null,
          }
        : undefined,
  });
  const historyId = getHistoryId(entry);
  const [confirmDel, setConfirmDel] = useState(false);

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDel(true);
  };
  const handleConfirm = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await onRemoveFromHistory?.(entry, { historyId });
  };
  const handleCancel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDel(false);
  };

  const disabledCls = busy ? "opacity-60 pointer-events-none grayscale" : "";

  const InfoContent = (
    <>
      <h5 className="text-white font-bold text-xs leading-tight line-clamp-2">
        {title}
      </h5>

      <div className="mt-0.5 text-[10px] text-zinc-200/80">
        {isGroup ? (
          <>
            <div className="leading-tight font-medium text-emerald-300/90">
              {groupCount} episodios agrupados
            </div>
            {groupRange && (
              <div className="leading-tight line-clamp-1 text-zinc-200/70">
                {groupRange}
              </div>
            )}
          </>
        ) : type === "show" && (epBadge || episodeTitle) ? (
          <>
            {epBadge && <div className="leading-tight">{epBadge}</div>}
            {episodeTitle && (
              <div className="leading-tight line-clamp-1 text-zinc-200/70">
                {episodeTitle}
              </div>
            )}
          </>
        ) : null}
      </div>
    </>
  );

  const CardInner = (
    <div
      className={[
        // IMPORTANTE: hover SOLO en desktop para evitar "hover pegajoso" en móvil
        "relative aspect-[2/3] group overflow-hidden rounded-xl bg-zinc-900 shadow-md",
        "lg:hover:shadow-emerald-900/20 transition-all",
        disabledCls,
      ].join(" ")}
    >
      {/* Overlay de borde para que los indicadores queden por debajo */}
      <div className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] transition-shadow duration-300 lg:group-hover:shadow-[inset_0_0_0_2.5px_rgba(16,185,129,0.95)]" />
      <div className="absolute inset-0 rounded-[inherit] overflow-hidden">
        <Poster entry={entry} className="w-full h-full" />

        {/* Gradiente superior suave para que los indicadores destaquen sobre fondos claros */}
        <div
          className={`absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/50 via-black/10 to-transparent z-10 pointer-events-none transition-opacity duration-300 ${isGroup || (isMobile && editMode) ? "opacity-100" : "opacity-0 lg:group-hover:opacity-100"}`}
        />
        <div
          className={getHistoryIndicatorClass({
            color: isGroup ? "emerald" : type === "movie" ? "sky" : "purple",
            visibility: isGroup ? "always" : "hover",
          })}
        >
          {isGroup ? (
            <div className="flex items-center gap-1 font-bold text-xs sm:text-sm">
              <Layers className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              <span>{groupCount}</span>
            </div>
          ) : type === "movie" ? (
            <Film className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          ) : (
            <MonitorPlay className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          )}
        </div>

        {/* MÓVIL: banda inferior - solo en editMode */}
        {(!isMobile || editMode) && (
          <div
            className={[
              "absolute inset-x-0 bottom-0 z-10 lg:hidden",
              "p-3 pt-10",
              "bg-gradient-to-t from-black/85 via-black/40 to-transparent",
              "pointer-events-none",
              confirmDel ? "opacity-0" : "",
            ].join(" ")}
          >
            {InfoContent}
          </div>
        )}

        {/* DESKTOP: overlay más sutil con menos blur */}
        <div
          className={[
            "absolute inset-0 z-10 hidden lg:flex flex-col justify-end p-3",
            "bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300",
            confirmDel ? "opacity-0 pointer-events-none" : "",
          ].join(" ")}
        >
          <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <h5 className="text-white font-bold text-xs leading-tight line-clamp-2">
              {title}
            </h5>

            {isGroup ? (
              <div className="mt-0.5 flex flex-col gap-0.5 text-[11px] text-zinc-300/90">
                <span className="font-medium text-emerald-300/90">
                  {groupCount} episodios agrupados
                </span>
                {groupRange && (
                  <span className="text-zinc-400 text-[10px]">
                    {groupRange}
                  </span>
                )}
              </div>
            ) : (
              type === "show" &&
              (epBadge || episodeTitle) && (
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-300/90">
                  {epBadge && (
                    <span className="shrink-0 font-medium text-emerald-300/90">
                      {epBadge}
                    </span>
                  )}
                  {epBadge && episodeTitle && (
                    <span className="text-zinc-500">•</span>
                  )}
                  {episodeTitle && (
                    <span className="min-w-0 truncate text-zinc-400">
                      {episodeTitle}
                    </span>
                  )}
                </div>
              )
            )}
          </div>
        </div>

        {/* Confirmación de borrado */}
        <AnimatePresence>
          {confirmDel && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/95 z-30 flex flex-col items-center justify-center p-4 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-red-200 text-xs sm:text-sm lg:text-base font-bold mb-3 tracking-wide">
                ¿Eliminar del historial?
              </p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={handleCancel}
                  className="flex-1 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors flex items-center justify-center"
                  aria-label="Cancelar"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center justify-center"
                  aria-label="Borrar"
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <HistoryCornerIndicator
        editMode={editMode}
        confirmDel={confirmDel}
        onDelete={handleDeleteClick}
        dateParts={watchedDate}
      />
    </div>
  );

  const isBackNav = useIsHistoryNavigation();
  const animDelay =
    totalItems > 20 ? Math.min(index * 0.015, 0.25) : index * 0.03;
  const shouldAnimate = !isBackNav && index < 60;

  if (!href || isGroup)
    return (
      <motion.div
        initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, delay: shouldAnimate ? animDelay : 0 }}
      >
        <div className="block cursor-pointer">{CardInner}</div>
      </motion.div>
    );
  return (
    <motion.div
      initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, delay: shouldAnimate ? animDelay : 0 }}
    >
      <Link href={href} prefetch onClick={onPreviewClick} className="block">
        {CardInner}
      </Link>
    </motion.div>
  );
});

function EpisodeSubItem({ entry, onRemoveFromHistory, isBusy }) {
  const meta = getEpisodeMeta(entry);
  const href = getDetailsHref(entry);
  const historyId = getHistoryId(entry);
  const [confirmDel, setConfirmDel] = useState(false);
  // Al pulsar un episodio se abre su PREVIEW (DetailModal drawer), igual que las
  // tarjetas del historial, en vez de navegar a la ficha completa. El modal de
  // grupo queda por encima (z), así que la preview se abre por detrás y se puede
  // seguir seleccionando episodios.
  const previewClick = usePreviewOpen();
  const showTmdbId = getTmdbId(entry);
  const onPreviewClick = previewClick(entry, {
    previewId: showTmdbId,
    mediaType: "tv",
    episode:
      meta && meta.season != null && meta.episode != null
        ? {
            showId: showTmdbId,
            seasonNumber: meta.season,
            episodeNumber: meta.episode,
            name: meta.title ?? null,
            showName: entry?.show?.title ?? entry?.showTitle ?? null,
          }
        : undefined,
  });

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDel(true);
  };
  const handleConfirm = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await onRemoveFromHistory?.(entry, { historyId });
  };
  const handleCancel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDel(false);
  };

  return (
    <div className="relative group/subitem rounded-xl overflow-hidden transition-all hover:bg-white/5 border border-transparent hover:border-white/10">
      <Link
        href={href || "#"} prefetch
        onClick={onPreviewClick}
        className={`flex items-center gap-3 p-2.5 sm:p-3 ${isBusy ? "opacity-50 pointer-events-none" : ""}`}
      >
        <div className="relative w-24 sm:w-28 aspect-video rounded-lg bg-zinc-800 overflow-hidden shrink-0 shadow-md border border-white/10">
          <SmartPoster
            entry={entry}
            title={meta?.title || "Episodio"}
            mode="backdrop"
          />
        </div>
        <div className="flex-1 min-w-0 pr-12 sm:pr-14">
          <p className="text-sm sm:text-[15px] font-bold text-emerald-400 drop-shadow-sm">
            {formatEpisodeBadge(meta)}
          </p>
          <p className="text-xs sm:text-sm text-zinc-200 line-clamp-1 mt-0.5">
            {meta.title || "Episodio sin título"}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-500 group-hover/subitem:text-emerald-400 transition-colors shrink-0" />
      </Link>

      {!confirmDel && (
        <button
          onClick={handleDeleteClick}
          className="absolute top-1/2 right-12 sm:right-14 -translate-y-1/2 z-20 flex items-center justify-center p-2 rounded-xl border backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu opacity-100 scale-100 lg:opacity-0 lg:scale-95 lg:group-hover/subitem:scale-100 lg:group-hover/subitem:opacity-100 bg-red-500/15 border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-red-200 pointer-events-auto"
          aria-label="Borrar del historial"
          title="Borrar del historial"
        >
          <Trash2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
        </button>
      )}

      <AnimatePresence>
        {confirmDel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-sm z-10 flex items-center justify-center gap-3 px-3"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-red-200 text-xs sm:text-sm font-bold tracking-wide">
              ¿Eliminar?
            </span>
            <button
              onClick={handleCancel}
              className="p-1.5 sm:p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors border border-white/10"
              aria-label="Cancelar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleConfirm}
              className="p-1.5 sm:p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors border border-red-500/50"
              aria-label="Borrar"
            >
              {isBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExpandedGroupView({ entry, onCollapse, onRemoveFromHistory, busyId }) {
  const title = getMainTitle(entry);
  const tmdbId = getTmdbId(entry);
  const href = tmdbId ? `/details/tv/${tmdbId}` : "#";
  const [mounted, setMounted] = useState(false);
  // Pulsar el título/póster de la serie abre su PREVIEW (drawer), no navega.
  const previewClick = usePreviewOpen();
  const onSeriesPreview = previewClick(entry, {
    previewId: tmdbId,
    mediaType: "tv",
  });

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <motion.div
      // z-[10000] > z-[9999] de DetailModal: el modal de grupo se superpone SOBRE
      // la preview. Con el drawer derecho abierto, `right: var(--sv-drawer-width)`
      // restringe su zona (y su fondo difuminado) al espacio LIBRE a la izquierda,
      // así se centra ahí y NO tapa la preview. Sin drawer la var es 0px → ventana
      // completa (centrado normal). El cambio de anchura se anima con transition.
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-lg transition-[right] duration-300 ease-out"
      style={{ right: "var(--sv-drawer-width, 0px)" }}
      // Marca de "capa de modal": el drawer derecho de DetailModal se cierra con un
      // listener global de click salvo dentro de `[data-detail-modal-layer]`. Sin
      // esto, cualquier clic en este modal (backdrop o panel) cerraría la preview.
      data-detail-modal-layer=""
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCollapse();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className={`relative w-full max-w-xl overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL} flex flex-col max-h-[85vh]`}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-12 sm:w-14 aspect-[2/3] shrink-0 rounded-lg overflow-hidden bg-zinc-800 border border-white/10 shadow-inner">
              <Poster entry={entry} className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <Link
                href={href || "#"} prefetch
                onClick={onSeriesPreview}
                className="text-base sm:text-lg font-bold text-white hover:text-emerald-300 transition-colors line-clamp-1 drop-shadow-sm"
              >
                {title}
              </Link>
              <p className="text-xs sm:text-sm font-medium text-emerald-400/90 mt-0.5">
                {entry._group.length} episodios agrupados
              </p>
            </div>
          </div>
          <button
            onClick={onCollapse}
            className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto sv-scroll">
          <div className="p-3 sm:p-4 space-y-1 sm:space-y-1.5">
            {entry._group.map((ep, idx) => (
              <EpisodeSubItem
                // `getHistoryId(ep)` puede repetirse dentro de un grupo (para estas
                // entradas coincide con el tmdbId de la serie, igual en todos los
                // episodios), así que se combina con el índice para que la key sea
                // ÚNICA y no dispare el aviso de React de keys duplicadas.
                key={`ep-${getHistoryId(ep) ?? "x"}-${idx}`}
                entry={ep}
                onRemoveFromHistory={onRemoveFromHistory}
                isBusy={busyId === `del:${getHistoryId(ep)}`}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ----------------------------
// MAIN PAGE
// ----------------------------
export default function HistoryClient() {
  const { session, account, hydrated: authHydrated, preferences } = useAuth();
  const { t } = useTranslation();
  // Navegación atrás/adelante: al VOLVER sembramos TODO el estado (lista, cursor de
  // página, orden/agrupación/vista) YA en el init de estado —no en un efecto— para
  // que la lista COMPLETA y su layout estén en el DOM en el PRIMER pintado, con la
  // altura correcta cuando <ScrollRestoration> restaura la posición exacta, igual
  // que Favoritos/Pendientes. Es HIDRATACIÓN-SEGURO: el back-nav es un re-montaje de
  // CLIENTE (sin SSR), y en cargas frescas isBackNav=false → mismos valores por
  // defecto que en el servidor (el contenido va oculto tras `hydrated` de todos modos).
  const isBackNav = useIsHistoryNavigation();
  // Durante la vuelta bloqueamos el cargador infinito solo hasta que el
  // restaurador global ha fijado el scroll. Después se reactiva para que el
  // usuario pueda seguir recorriendo el historial desde ese mismo punto.
  const [backScrollRestored, setBackScrollRestored] = useState(
    () => !isBackNav || hasCompletedScrollRestoration(),
  );
  const [backNavInit] = useState(() => {
    if (!isBackNav || typeof window === "undefined") return null;
    const cache = readHistoryCache();
    const ls = (k) => {
      try {
        return window.localStorage.getItem(k);
      } catch {
        return null;
      }
    };
    const view = ls("showverse:history:viewMode");
    const grp = ls("showverse:history:groupBy");
    const typ = ls("showverse:history:typeFilter");
    const srt = ls("showverse:history:sortBy");
    return {
      items: cache?.items?.length ? cache.items : null,
      hasMore: !!cache?.hasMore,
      nextPage: cache?.nextPage || 1,
      viewMode:
        view === "list" || view === "grid" || view === "compact" ? view : null,
      groupBy: grp || null,
      typeFilter: typ || null,
      sortBy: srt || null,
    };
  });
  const restoredFromHistoryCacheRef = useRef(!!backNavInit?.items);
  // La caché de Historial contiene el estado visual completo que el usuario dejó
  // antes de abrir una ficha. No la ocultamos detrás de la hidratación global de
  // sesión: esa petición puede tardar varios segundos en móvil, mientras que la
  // caché ya permite restaurar el contenido y el scroll de inmediato.
  const hasBackNavSnapshot = !!backNavInit?.items;

  // En back-nav renderizamos el contenido desde el primer pintado (no hay SSR con el
  // que chocar). En carga fresca sigue oculto hasta el efecto de montaje.
  const [hydrated, setHydrated] = useState(() => !!backNavInit);
  // BACK-NAV con historial cacheado: sembramos `connected` para que las
  // estadísticas y el resto del layout dependiente de `auth` se pinten YA en el
  // primer frame, con la MISMA altura que al guardar. Sin esto, `auth.connected`
  // llega tras el round-trip de `traktAuthStatus` y las stats aparecían DESPUÉS,
  // desplazando el contenido hacia abajo → el punto restaurado por
  // <ScrollRestoration> quedaba desalineado (peor cuanto más abajo se estaba, por
  // eso fallaba con la carga progresiva). `loadAuth` revalida igual y corrige si
  // el usuario ya no está conectado.
  const [auth, setAuth] = useState(() =>
    backNavInit?.items
      ? { loading: false, connected: true }
      : { loading: true, connected: false },
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(() => !!backNavInit?.items);
  const [raw, setRaw] = useState(() => backNavInit?.items || []);
  const [hasMoreHistory, setHasMoreHistory] = useState(
    () => !!backNavInit?.hasMore,
  );
  const [historyError, setHistoryError] = useState("");
  const [mutatingId, setMutatingId] = useState("");
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const loadMoreRef = useRef(null);
  const loadingHistoryRef = useRef(false);
  const nextHistoryPageRef = useRef(backNavInit?.nextPage || 1);
  const hasMoreHistoryRef = useRef(!!backNavInit?.hasMore);

  // UI States
  const [viewMode, setViewModeState] = useState(
    () => backNavInit?.viewMode || "compact",
  );
  // Marca si el usuario (o el localStorage propio) ya fijó una vista del Historial,
  // para que la preferencia global NUNCA la sobrescriba al recargar.
  const viewModeUserSetRef = useRef(!!backNavInit?.viewMode);

  // La preferencia global solo SIEMBRA la vista la primera vez (cuando aún no hay
  // una vista propia del Historial guardada). El valor real ya se restauró desde
  // localStorage en el efecto de hidratación, así que esto no provoca cambios al
  // recargar.
  useEffect(() => {
    if (!hydrated || viewModeUserSetRef.current) return;
    const saved = window.localStorage.getItem("showverse:history:viewMode");
    if (saved === "list" || saved === "grid" || saved === "compact") return;
    if (preferences?.defaultView) setViewModeState(preferences.defaultView);
  }, [hydrated, preferences?.defaultView]);

  const setViewMode = useCallback((mode) => {
    viewModeUserSetRef.current = true;
    setViewModeState(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("showverse:history:viewMode", mode);
    }
  }, []);

  const [groupBy, setGroupBy] = useState(() => backNavInit?.groupBy || "day");
  const [typeFilter, setTypeFilter] = useState(
    () => backNavInit?.typeFilter || "all",
  );
  const [sortBy, setSortBy] = useState(() => backNavInit?.sortBy || "date-desc");
  const [q, setQ] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState(null);
  // Inicialización SÍNCRONA (no arranca en false y se corrige en un efecto): al
  // VOLVER (back-nav) el layout debe tener ya en el PRIMER frame el modo correcto
  // (móvil/escritorio) para que la altura del documento coincida con la guardada y
  // <ScrollRestoration> restaure la posición exacta en su `scrollTo` SÍNCRONO. Si
  // arrancara en false, el frame 1 pintaría el layout de ESCRITORIO (altura
  // distinta) y haría falta el bucle de reajuste, que en móvil el gesto táctil de
  // "atrás" interrumpe → se quedaba sin restaurar (a diferencia de Favoritos, que
  // no depende de `isMobile`). En carga fresca el contenido va oculto tras
  // `hydrated`, así que no hay desajuste de hidratación.
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.matchMedia("(max-width: 1024px)").matches;
    } catch {
      return false;
    }
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false);
  const filtersRef = useRef(null);
  const filtersSticky = useStickyToolbarState(filtersRef);
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  useEffect(() => {
    if (!isBackNav) {
      setBackScrollRestored(true);
      return undefined;
    }

    const currentRoute = `${window.location.pathname}${window.location.search}`;
    const onRestorationComplete = (event) => {
      if (event.detail?.route === currentRoute) {
        setBackScrollRestored(true);
      }
    };

    window.addEventListener(RESTORATION_COMPLETE_EVENT, onRestorationComplete);
    if (hasCompletedScrollRestoration()) setBackScrollRestored(true);

    return () =>
      window.removeEventListener(
        RESTORATION_COMPLETE_EVENT,
        onRestorationComplete,
      );
  }, [isBackNav]);

  const toggleExpandGroup = useCallback((groupKey) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  useEffect(() => {
    // Restaura la lista ya cargada (todas las páginas), el flag "hay más" y el
    // cursor de página desde la caché. Al VOLVER (atrás/adelante), esto + saltar el
    // reset-fetch (más abajo) mantiene la lista completa; <ScrollRestoration>
    // devuelve la posición porque la altura del documento vuelve a la de antes.
    // En back-nav la lista ya se sembró en el init de estado (arriba). Aquí solo
    // restauramos en la carga fresca (paint stale-while-revalidate), sin repetirlo.
    if (!restoredFromHistoryCacheRef.current) {
      const cached = readHistoryCache();
      // Solo pintamos la caché AL INSTANTE si es RECIENTE (`fresh`). Si es vieja
      // (p. ej. añadiste algo desde otro dispositivo: tu caché es de la última
      // visita, sin lo nuevo) NO la pintamos: el reset-fetch de abajo trae la lista
      // correcta DE UNA VEZ, evitando el parpadeo de pintar lo viejo y luego
      // insertar lo nuevo con retraso. Igual que Favoritos/Pendientes. (En back-nav
      // la lista SÍ se siembra siempre —arriba— para restaurar el scroll; ahí no
      // hay contenido nuevo que parpadee.)
      if (cached?.fresh && cached.items?.length) {
        setRaw(cached.items);
        setHistoryLoaded(true);
        setHasMoreHistory(cached.hasMore);
        hasMoreHistoryRef.current = cached.hasMore;
        nextHistoryPageRef.current = cached.nextPage || 1;
        restoredFromHistoryCacheRef.current = true;
      } else {
        // Caché vieja o ausente: mostramos CARGA hasta que el reset-fetch pinte la
        // lista completa, sin el parpadeo del contenido obsoleto.
        setLoading(true);
      }
    }

    const savedView = window.localStorage.getItem("showverse:history:viewMode");
    if (savedView === "list" || savedView === "grid" || savedView === "compact") {
      setViewModeState(savedView);
      viewModeUserSetRef.current = true;
    }

    const savedGroupBy = window.localStorage.getItem(
      "showverse:history:groupBy",
    );
    if (savedGroupBy) setGroupBy(savedGroupBy);

    const savedTypeFilter = window.localStorage.getItem(
      "showverse:history:typeFilter",
    );
    if (savedTypeFilter) setTypeFilter(savedTypeFilter);

    const savedSortBy = window.localStorage.getItem("showverse:history:sortBy");
    if (savedSortBy) setSortBy(savedSortBy);

    setHydrated(true);
  }, []);

  // Persistir estados de UI en localStorage
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("showverse:history:groupBy", groupBy);
  }, [groupBy, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("showverse:history:typeFilter", typeFilter);
  }, [hydrated, typeFilter]);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("showverse:history:sortBy", sortBy);
  }, [hydrated, sortBy]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => {
      setIsMobile(!!mq.matches);
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const loadAuth = useCallback(async () => {
    if (session === "showverse" || account?.provider === "showverse") {
      setAuth({ loading: false, connected: true });
      return;
    }

    // Si había historial cacheado, el usuario estaba conectado a Trakt en la
    // visita anterior (más recientemente en back-nav, ya sembrado en `auth`
    // para pintar la lista al instante). Sirve de señal para no fiarse a la
    // primera de una respuesta "no conectado".
    const hadCachedConnection = !!readHistoryCache()?.items?.length;

    try {
      let st = await traktAuthStatus();

      // Igual que la hidratación de la sesión propia (ver AuthContext,
      // "carrera de refresco concurrente"): si HABÍA conexión cacheada pero la
      // comprobación fresca dice que no, puede ser un falso negativo
      // transitorio (p. ej. el token de Trakt refrescándose a la vez desde
      // otra pestaña/petición). Antes se creía a la primera respuesta y, si
      // era ese falso negativo, sustituía el historial YA restaurado
      // (posición de scroll incluida) por el aviso de "Inicia sesión" -- en
      // móvil, con peor red, este caso era mucho más frecuente. Reintentamos
      // unas veces (sin tocar lo que ya se ve en pantalla) antes de
      // desconectar de verdad.
      if (
        hadCachedConnection &&
        !st?.unavailable &&
        !(st?.connected && !st?.degraded)
      ) {
        const delays = [500, 1200, 2500];
        for (let i = 0; i < delays.length; i += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, delays[i]));
          st = await traktAuthStatus();
          if (st?.connected && !st?.degraded) break;
        }
      }

      // SERVIDOR CAÍDO (5xx → `unavailable`): no podemos verificar Trakt. Si hay
      // historial cacheado el usuario estaba conectado → mantenemos `connected`
      // para mostrarlo offline (en vez del prompt de login).
      if (st?.unavailable) {
        setAuth({ loading: false, connected: hadCachedConnection });
      } else {
        setAuth({ loading: false, connected: !!st?.connected && !st?.degraded });
      }
    } catch (error) {
      // Error de RED (offline total): igual, conservar conexión si hay caché.
      if (isServerUnavailable(error) && hadCachedConnection) {
        setAuth({ loading: false, connected: true });
      } else {
        setAuth({ loading: false, connected: false });
      }
    }
  }, [account?.provider, session]);

  const loadHistory = useCallback(
    async ({ reset = true, refreshTop = false } = {}) => {
      if (loadingHistoryRef.current) return;

      // `refreshTop`: revalidación NO destructiva de la página 1 (carga fresca).
      // Fusiona novedades por arriba CONSERVANDO todas las páginas ya cargadas por
      // la carga progresiva (sin tocar cursor ni `hasMore`), para que lo cargado
      // persista entre visitas y no haya que recargarlo cada vez que se accede.
      const pageToLoad = reset || refreshTop ? 1 : nextHistoryPageRef.current;
      if (!reset && !refreshTop && !hasMoreHistoryRef.current) return;

      loadingHistoryRef.current = true;
      if (!refreshTop) {
        setHistoryError("");
        setLoading(true);
        setLoadingMore(!reset);
      }

      try {
        const json = await traktGetHistory({
          type: "all",
          page: pageToLoad,
          limit: HISTORY_PAGE_SIZE,
          enrich: false,
        });
        const { items } = normalizeHistoryResponse(json);
        const sorted = [...items].sort(
          (a, b) => new Date(b?.watched_at) - new Date(a?.watched_at),
        );

        if (refreshTop) {
          // Fusiona la página 1 fresca con lo cacheado (solo añade lo nuevo por
          // arriba); conserva cursor/hasMore y TODAS las páginas ya cargadas.
          setRaw((prev) => {
            const seen = new Set(
              (prev || []).map((x) => String(getHistoryId(x))),
            );
            const merged = [...(prev || [])];
            for (const item of sorted) {
              const id = String(getHistoryId(item));
              if (!seen.has(id)) {
                seen.add(id);
                merged.push(item);
              }
            }
            const nextItems = merged.sort(
              (a, b) => new Date(b?.watched_at) - new Date(a?.watched_at),
            );
            writeHistoryCache(nextItems, {
              hasMore: hasMoreHistoryRef.current,
              nextPage: nextHistoryPageRef.current,
            });
            return nextItems;
          });
          return;
        }

        const nextHasMore =
          typeof json?.pagination?.hasMore === "boolean"
            ? json.pagination.hasMore
            : items.length >= HISTORY_PAGE_SIZE;

        nextHistoryPageRef.current = pageToLoad + 1;
        hasMoreHistoryRef.current = nextHasMore;
        setHasMoreHistory(nextHasMore);

        setRaw((prev) => {
          if (reset) {
            writeHistoryCache(sorted, {
              hasMore: nextHasMore,
              nextPage: nextHistoryPageRef.current,
            });
            return sorted;
          }

          const seen = new Set((prev || []).map((x) => String(getHistoryId(x))));
          const merged = [...(prev || [])];
          for (const item of sorted) {
            const id = String(getHistoryId(item));
            if (!seen.has(id)) {
              seen.add(id);
              merged.push(item);
            }
          }
          const nextItems = merged.sort(
            (a, b) => new Date(b?.watched_at) - new Date(a?.watched_at),
          );
          writeHistoryCache(nextItems, {
            hasMore: nextHasMore,
            nextPage: nextHistoryPageRef.current,
          });
          return nextItems;
        });
      } catch (error) {
        // Refresco en segundo plano (refreshTop): si falla, conservamos lo cacheado
        // sin tocar nada (no vaciar, no error visible).
        if (refreshTop) return;
        // SERVIDOR CAÍDO (5xx/429/red, túnel con el NAS apagado): NO desconectar ni
        // borrar la caché. Conservamos lo cacheado (sembrado al montar) para seguir
        // usando el historial offline.
        if (isServerUnavailable(error)) {
          setHistoryError("");
        } else if (isTraktUnavailableError(error)) {
          // 401/403: desconexión real de Trakt → limpiar.
          setAuth({ loading: false, connected: false });
          setRaw([]);
          setHistoryError("");
          clearHistoryCache();
        } else {
          setHistoryError("No se pudo cargar el historial.");
        }
        if (reset) {
          hasMoreHistoryRef.current = false;
        }
      } finally {
        loadingHistoryRef.current = false;
        if (!refreshTop) {
          setLoading(false);
          setLoadingMore(false);
        }
        setHistoryLoaded(true);
      }
    },
    [],
  );

  const handleDisconnect = useCallback(async () => {
    try {
      await traktDisconnect();
      // Limpiar estado local
      setAuth({ loading: false, connected: false });
      setRaw([]);
      setHistoryLoaded(false);
      setHasMoreHistory(false);
      hasMoreHistoryRef.current = false;
      nextHistoryPageRef.current = 1;
      clearHistoryCache();
      setShowDisconnectModal(false);
      // Redirigir a la página principal
      window.location.href = "/";
    } catch (error) {
      console.error("Error desconectando Trakt:", error);
      setShowDisconnectModal(false);
      alert("Error al desconectar de Trakt. Por favor, inténtalo de nuevo.");
    }
  }, []);

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  useEffect(() => {
    if (auth.loading || !auth.connected) return;
    // Al VOLVER (atrás/adelante) con la lista ya cargada desde caché NO reseteamos
    // a la página 1: eso encogería la lista y rompería la restauración de scroll.
    // La paginación continúa desde el cursor restaurado y <ScrollRestoration>
    // devuelve la posición porque la altura del documento vuelve a ser la de antes.
    // En BACK-NAV con lista cacheada no tocamos nada (restauración de scroll
    // intacta). En carga FRESCA con lista cacheada revalidamos SOLO la página 1 de
    // forma NO destructiva (`refreshTop`): añade novedades por arriba y conserva
    // TODAS las páginas ya cargadas → persisten entre visitas sin recargarlas.
    if (restoredFromHistoryCacheRef.current) {
      if (!isBackNav) loadHistory({ refreshTop: true });
      return;
    }
    loadHistory({ reset: true });
  }, [auth.loading, auth.connected, loadHistory, isBackNav]);

  // Carga progresiva al acercarse al final. Al volver desde una ficha se deja
  // INACTIVA: la lista completa sale de caché en el primer frame y no iniciamos
  // una petición que pueda modificar su altura mientras ScrollRestoration fija
  // la posición guardada.
  useEffect(() => {
    if (
      (isBackNav && !backScrollRestored) ||
      !auth.connected ||
      !historyLoaded ||
      !hasMoreHistory ||
      loading ||
      historyError
    ) {
      return undefined;
    }

    const sentinel = loadMoreRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadHistory({ reset: false });
        }
      },
      // Solo empieza cuando el usuario se acerca de verdad al final, no al
      // montar la página ni durante la restauración de scroll.
      { threshold: 0.01, rootMargin: "0px 0px 320px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    auth.connected,
    backScrollRestored,
    hasMoreHistory,
    historyLoaded,
    historyError,
    isBackNav,
    loadHistory,
    loading,
  ]);

  const removeFromHistory = useCallback(async (_entry, { historyId }) => {
    if (!historyId) return;
    setMutatingId(`del:${historyId}`);
    try {
      await apiPost("/api/trakt/history/remove", { ids: [historyId] });
      setRaw((prev) => {
        const nextItems = (prev || []).filter(
          (x) => String(getHistoryId(x)) !== String(historyId),
        );
        writeHistoryCache(nextItems, {
          hasMore: hasMoreHistoryRef.current,
          nextPage: nextHistoryPageRef.current,
        });
        return nextItems;
      });
    } catch {
      // noop
    } finally {
      setMutatingId("");
    }
  }, []);

  const filtered = useMemo(() => {
    const needle = normalizeSearchText(q);
    return (raw || []).filter((e) => {
      const t = getItemType(e);
      if (typeFilter === "movies" && t !== "movie") return false;
      if (typeFilter === "shows" && t !== "show") return false;
      const d = new Date(e?.watched_at);
      if (Number.isNaN(d.getTime())) return false;
      if (selectedDay && ymdLocal(d) !== selectedDay) return false;
      if (needle) {
        if (!titleMatchesQuery(e, needle)) return false;
      }
      return true;
    });
  }, [raw, q, typeFilter, selectedDay]);

  const sorted = useMemo(() => {
    const items = [...filtered];

    if (sortBy === "date-desc") {
      return items.sort(
        (a, b) => new Date(b?.watched_at) - new Date(a?.watched_at),
      );
    }
    if (sortBy === "date-asc") {
      return items.sort(
        (a, b) => new Date(a?.watched_at) - new Date(b?.watched_at),
      );
    }
    if (sortBy === "title-asc") {
      return items.sort((a, b) => {
        const titleA = getMainTitle(a).toLowerCase();
        const titleB = getMainTitle(b).toLowerCase();
        return titleA.localeCompare(titleB);
      });
    }
    if (sortBy === "title-desc") {
      return items.sort((a, b) => {
        const titleA = getMainTitle(a).toLowerCase();
        const titleB = getMainTitle(b).toLowerCase();
        return titleB.localeCompare(titleA);
      });
    }

    return items;
  }, [filtered, sortBy]);

  const stats = useMemo(() => {
    const plays = filtered.length;
    const uniqSet = new Set();
    let movies = 0;
    let shows = 0;
    for (const e of filtered) {
      const t = getItemType(e);
      if (t === "movie") movies++;
      if (t === "show") shows++;
      const id = getTmdbId(e) || `${t}:${getMainTitle(e)}`;
      uniqSet.add(String(id));
    }
    return { plays, unique: uniqSet.size, movies, shows };
  }, [filtered]);

  const countsByDay = useMemo(() => {
    const m = {};
    for (const e of raw || []) {
      const w = e?.watched_at;
      if (!w) continue;
      const k = ymdLocal(new Date(w));
      if (!k) continue;
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [raw]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of sorted) {
      const d = new Date(e?.watched_at);
      if (Number.isNaN(d.getTime())) continue;
      let key;
      if (groupBy === "year") key = `${d.getFullYear()}-01-01`;
      else if (groupBy === "month")
        key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
      else key = ymdLocal(d);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    const keys = Array.from(map.keys()).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime(),
    );
    return keys.map((k) => ({
      key: k,
      date: new Date(k),
      items: map.get(k) || [],
    }));
  }, [sorted, groupBy]);

  // Agrupar episodios consecutivos de la misma serie
  const groupedWithCollapse = useMemo(() => {
    return grouped.map((g) => ({
      ...g,
      collapsedItems: collapseConsecutive(g.items),
    }));
  }, [grouped]);

  // Resetear expansiones cuando cambian filtros/ordenación/datos
  useEffect(() => {
    setExpandedGroups(new Set());
  }, [sorted, groupBy, typeFilter, q, selectedDay]);

  // En una vuelta desde DetailsClient damos prioridad al snapshot local. Cuando
  // AuthContext termine de revalidar, los guards normales siguen corrigiendo la
  // vista si la sesión ya no existe; durante la revalidación no sustituimos la
  // lista por una pantalla vacía.
  if (!hydrated || (!authHydrated && !hasBackNavSnapshot)) {
    return <div className="min-h-screen bg-black" />;
  }

  if (
    (!session || !account) &&
    !(hasBackNavSnapshot && !authHydrated)
  ) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-emerald-500/30 pb-20">
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-emerald-600/15 blur-[120px] sm:blur-[150px]" />
          <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-emerald-700/20 blur-[120px] sm:blur-[150px]" />
          <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-emerald-800/25 blur-[120px] sm:blur-[150px]" />
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
                REGISTRO
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              Historial<span className="text-emerald-500">.</span>
            </h1>
            <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
              Registro cronológico de todo lo que has visto.
            </p>
          </motion.header>

          <div className="flex items-center justify-center py-12 lg:py-24">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-[380px] w-full flex flex-col items-center justify-center px-6 py-10 bg-zinc-950/40 border border-white/10 rounded-[2.5rem] text-center shadow-[0_30px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-3xl"
            >
              <div className="relative mb-4 flex h-24 w-48 items-center justify-center mx-auto">
                <img
                  src="/logo-TSV-sinFondo.png"
                  alt="The Show Verse"
                  className="h-full w-auto object-contain scale-[1.6]"
                />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight drop-shadow-md mb-2">
                Inicia sesión
              </h2>
              <p className="text-zinc-400 text-xs font-medium max-w-sm mb-6 leading-relaxed">
                Inicia sesión para ver tu historial de visualizaciones.
              </p>
              <a
                href="/login?next=/history"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 hover:from-sky-400 hover:via-indigo-400 hover:to-emerald-400 text-white font-extrabold uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-[0_4px_20px_rgba(99,102,241,0.25)] hover:shadow-[0_4px_25px_rgba(99,102,241,0.45)] cursor-pointer"
              >
                Iniciar sesión
              </a>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  const showLoginPrompt = !auth.loading && !auth.connected;

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-emerald-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Manchas abstractas esmeralda y negras */}
        <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-emerald-600/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-emerald-700/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-emerald-800/25 blur-[120px] sm:blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header */}
        <motion.header
          className="mb-6 lg:mb-10"
          initial={isBackNav ? false : { opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px w-12 bg-emerald-500" />
                <span className="text-emerald-400 font-bold uppercase tracking-widest text-xs">
                  REGISTRO
                </span>
              </div>
              <div className="flex items-center gap-6">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                  Historial
                  <span className="text-emerald-500">.</span>
                </h1>

                {/* Botones redondos junto al título */}
                {auth.connected && historyLoaded && (
                  <div className="flex items-center gap-2">
                    <motion.div
                      initial={isBackNav ? false : { opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.3 }}
                    >
                      <LiquidButton
                        onClick={() => loadHistory()}
                        disabled={loading}
                        loading={loading}
                        activeColor="green"
                        groupId="history-header-actions"
                        title="Sincronizar"
                        className="!bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15"
                      >
                        <RotateCcw
                          className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
                        />
                      </LiquidButton>
                    </motion.div>

                    <motion.div
                      initial={isBackNav ? false : { opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.4 }}
                    >
                      <LiquidButton
                        onClick={() => setShowDisconnectModal(true)}
                        disabled={loading}
                        loading={loading}
                        activeColor="red"
                        groupId="history-header-actions"
                        title="Desconectar"
                        className="!text-red-400 hover:!text-red-300 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15"
                      >
                        <LogOut className="w-5 h-5" />
                      </LiquidButton>
                    </motion.div>
                  </div>
                )}
              </div>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
                Registro cronológico de todo lo que has visto.
              </p>
            </div>

            {/* Solo estadísticas a la derecha */}
            {auth.connected && historyLoaded && (
              <motion.div
                className="grid grid-cols-4 gap-2 md:gap-4 w-full lg:w-auto lg:flex lg:justify-end"
                initial={isBackNav ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                  className="w-full min-w-0"
                >
                  <StatCard
                    label="Cargados"
                    value={stats.plays}
                    loading={false}
                    icon={CheckCircle2}
                    colorClass="text-emerald-400"
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                  className="w-full min-w-0"
                >
                  <StatCard
                    label="Títulos Únicos"
                    value={stats.unique}
                    loading={false}
                    icon={LayoutList}
                    colorClass="text-purple-400"
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.7 }}
                  className="w-full min-w-0"
                >
                  <StatCard
                    label="Películas"
                    value={stats.movies}
                    loading={false}
                    icon={Film}
                    colorClass="text-sky-400"
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.8 }}
                  className="w-full min-w-0"
                >
                  <StatCard
                    label="Episodios"
                    value={stats.shows}
                    loading={false}
                    icon={Tv}
                    colorClass="text-pink-400"
                  />
                </motion.div>
              </motion.div>
            )}
          </div>
        </motion.header>

        {/* Layout Principal */}
        <div
          className={`grid grid-cols-1 ${auth.connected && !showCalendarView ? "xl:grid-cols-[1fr_380px]" : "lg:grid-cols-1"} gap-8 items-start`}
        >
          {/* Izquierda */}
          <motion.div
            className="space-y-6 min-w-0"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            {auth.connected && (
              <motion.div
                ref={filtersRef}
                className="sticky top-14 z-[70] space-y-3 mb-3 transition-all duration-300 sm:top-20 lg:mb-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5 }}
              >
                {/* Mobile: búsqueda + panel de filtros. Antes de fijarse (sticky),
                    el panel forma parte del flujo y empuja el contenido de abajo.
                    Al alcanzar el sticky (filtersSticky) se convierte en overlay
                    absoluto para no desplazar nada. El wrapper `relative` es el
                    contexto de posicionamiento del overlay. */}
                <div className="relative z-10 lg:hidden">
                  <div className="relative flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 z-10 pointer-events-none" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Buscar..."
                      className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
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
                  <HistorySectionNav className="h-11 shrink-0" />
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen((v) => !v)}
                    className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
                      mobileFiltersOpen
                        ? "text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                        : "text-zinc-200 hover:bg-black/30"
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                  </button>
                </div>

                {/* Mobile: collapsible filters */}
                <AnimatePresence>
                  {mobileFiltersOpen && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      className={`z-[80] mt-2 origin-top overflow-hidden ${
                        filtersSticky
                          ? "absolute left-0 right-0 top-full"
                          : "relative"
                      }`}
                    >
                      <div className="space-y-2">
                        {/* Fila 1 - Tipo y Agrupar */}
                        <div className="flex gap-2">
                          <div className="flex-1 min-w-0">
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

                          <div className="flex-1 min-w-0">
                            <InlineDropdown
                              label="Agrupar"
                              valueLabel={
                                groupBy === "day"
                                  ? "Día"
                                  : groupBy === "month"
                                    ? "Mes"
                                    : "Año"
                              }
                              icon={Calendar}
                            >
                              {({ close }) => (
                                <>
                                  <DropdownItem
                                    active={groupBy === "day"}
                                    onClick={() => {
                                      setGroupBy("day");
                                      close();
                                    }}
                                  >
                                    Día
                                  </DropdownItem>
                                  <DropdownItem
                                    active={groupBy === "month"}
                                    onClick={() => {
                                      setGroupBy("month");
                                      close();
                                    }}
                                  >
                                    Mes
                                  </DropdownItem>
                                  <DropdownItem
                                    active={groupBy === "year"}
                                    onClick={() => {
                                      setGroupBy("year");
                                      close();
                                    }}
                                  >
                                    Año
                                  </DropdownItem>
                                </>
                              )}
                            </InlineDropdown>
                          </div>
                        </div>

                        {/* Fila 2 - Ordenar, Vista y Editar */}
                        <div className="flex gap-2">
                          <div className="flex-1 min-w-0">
                            <InlineDropdown
                              label="Ordenar"
                              valueLabel={
                                sortBy === "date-desc"
                                  ? "Más reciente"
                                  : sortBy === "date-asc"
                                    ? "Más antiguo"
                                    : sortBy === "title-asc"
                                      ? "A-Z"
                                      : "Z-A"
                              }
                              icon={ArrowUpDown}
                            >
                              {({ close }) => (
                                <>
                                  <DropdownItem
                                    active={sortBy === "date-desc"}
                                    onClick={() => {
                                      setSortBy("date-desc");
                                      close();
                                    }}
                                  >
                                    Más reciente
                                  </DropdownItem>
                                  <DropdownItem
                                    active={sortBy === "date-asc"}
                                    onClick={() => {
                                      setSortBy("date-asc");
                                      close();
                                    }}
                                  >
                                    Más antiguo
                                  </DropdownItem>
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
                                </>
                              )}
                            </InlineDropdown>
                          </div>

                          <div className="flex-1 flex gap-2">
                            <div className="flex flex-1 rounded-xl p-1 h-11 items-center bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                              <button
                                onClick={() => setViewMode("list")}
                                className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                                  viewMode === "list"
                                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                                }`}
                              >
                                <LayoutList className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setViewMode("compact")}
                                className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                                  viewMode === "compact"
                                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                                }`}
                              >
                                <Grid3x3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setViewMode("grid")}
                                className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                                  viewMode === "grid"
                                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                                }`}
                              >
                                <LayoutGrid className="w-4 h-4" />
                              </button>
                            </div>

                            <button
                              onClick={() => setEditMode(!editMode)}
                              title={editMode ? "Salir del modo borrar" : "Borrar registros"}
                              aria-label={editMode ? "Salir del modo borrar" : "Borrar registros"}
                              aria-pressed={editMode}
                              className={`h-11 w-11 rounded-2xl text-sm font-bold transition-all flex items-center justify-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
                                editMode
                                  ? "text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                                  : "text-zinc-200 hover:bg-black/30"
                              }`}
                            >
                              {editMode ? (
                                <X className="w-4 h-4" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>

                {/* Desktop: Una sola fila con todo */}
                <div className="hidden lg:flex gap-3 relative z-10">
                  <HistorySectionNav className="shrink-0" />
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 z-10 pointer-events-none" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onFocus={() => setDesktopSearchFocused(true)}
                      onBlur={() => setDesktopSearchFocused(false)}
                      placeholder="Buscar por título..."
                      className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
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
                    compact={desktopSearchFocused}
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
                    label="Agrupar"
                    valueLabel={
                      groupBy === "day"
                        ? "Día"
                        : groupBy === "month"
                          ? "Mes"
                          : "Año"
                    }
                    icon={Layers}
                    compact={desktopSearchFocused}
                  >
                    {({ close }) => (
                      <>
                        <DropdownItem
                          active={groupBy === "day"}
                          onClick={() => {
                            setGroupBy("day");
                            close();
                          }}
                        >
                          Día
                        </DropdownItem>
                        <DropdownItem
                          active={groupBy === "month"}
                          onClick={() => {
                            setGroupBy("month");
                            close();
                          }}
                        >
                          Mes
                        </DropdownItem>
                        <DropdownItem
                          active={groupBy === "year"}
                          onClick={() => {
                            setGroupBy("year");
                            close();
                          }}
                        >
                          Año
                        </DropdownItem>
                      </>
                    )}
                  </InlineDropdown>

                  <InlineDropdown
                    label="Ordenar"
                    valueLabel={
                      sortBy === "date-desc"
                        ? "Más reciente"
                        : sortBy === "date-asc"
                          ? "Más antiguo"
                          : sortBy === "title-asc"
                            ? "A-Z"
                            : "Z-A"
                    }
                    icon={ArrowUpDown}
                    compact={desktopSearchFocused}
                  >
                    {({ close }) => (
                      <>
                        <DropdownItem
                          active={sortBy === "date-desc"}
                          onClick={() => {
                            setSortBy("date-desc");
                            close();
                          }}
                        >
                          Más reciente
                        </DropdownItem>
                        <DropdownItem
                          active={sortBy === "date-asc"}
                          onClick={() => {
                            setSortBy("date-asc");
                            close();
                          }}
                        >
                          Más antiguo
                        </DropdownItem>
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
                      </>
                    )}
                  </InlineDropdown>

                  <div className="flex rounded-xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                    <button
                      onClick={() => setViewMode("list")}
                      className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                        viewMode === "list"
                          ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                          : "text-zinc-400 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <LayoutList className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("compact")}
                      className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                        viewMode === "compact"
                          ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                          : "text-zinc-400 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <Grid3x3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                        viewMode === "grid"
                          ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                          : "text-zinc-400 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => setEditMode(!editMode)}
                    title={editMode ? "Salir del modo borrar" : "Borrar registros"}
                    aria-label={editMode ? "Salir del modo borrar" : "Borrar registros"}
                    aria-pressed={editMode}
                    className={`h-11 w-11 rounded-2xl text-sm font-bold transition-all flex items-center justify-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
                      editMode
                        ? "text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                        : "text-zinc-200 hover:bg-black/30"
                    }`}
                  >
                    {editMode ? (
                      <X className="w-4 h-4" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {showLoginPrompt ? (
              <div className="flex items-center justify-center py-12 lg:py-24">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-[380px] w-full flex flex-col items-center justify-center px-6 py-10 bg-zinc-950/40 border border-white/10 rounded-[2.5rem] text-center shadow-[0_30px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-3xl"
                >
                  <div className="relative mb-4 flex h-24 w-48 items-center justify-center mx-auto">
                    <img
                      src="/logo-TSV-sinFondo.png"
                      alt="The Show Verse"
                      className="h-full w-auto object-contain scale-[1.6]"
                    />
                  </div>
                  <h2 className="text-2xl font-black text-white tracking-tight drop-shadow-md mb-2">
                    Inicia sesión
                  </h2>
                  <p className="text-zinc-400 text-xs font-medium max-w-sm mb-6 leading-relaxed">
                    Inicia sesión para ver tu historial de visualizaciones.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      window.location.assign(
                        "/login?next=/history",
                      )
                    }
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 hover:from-sky-400 hover:via-indigo-400 hover:to-emerald-400 text-white font-extrabold uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-[0_4px_20px_rgba(99,102,241,0.25)] hover:shadow-[0_4px_25px_rgba(99,102,241,0.45)] cursor-pointer"
                  >
                    Iniciar sesión
                  </button>
                </motion.div>
              </div>
            ) : !historyLoaded && loading ? null : historyLoaded &&
              filtered.length === 0 &&
              !loading ? (
              <motion.div
                className="py-24 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <LayoutList className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
                <p className="text-zinc-500 font-medium">
                  {historyError || "No se encontraron resultados."}
                </p>
                {historyError && (
                  <button
                    onClick={() => loadHistory({ reset: true })}
                    className="mt-4 text-emerald-500 text-sm font-bold hover:underline"
                  >
                    Reintentar
                  </button>
                )}
                {q && (
                  <button
                    onClick={() => setQ("")}
                    className="mt-4 text-emerald-500 text-sm font-bold hover:underline"
                  >
                    Limpiar búsqueda
                  </button>
                )}
              </motion.div>
            ) : (
              <div className="space-y-8">
                {groupedWithCollapse.map((g, groupIndex) => {
                  const renderItems = (
                    CardComponent,
                    entry,
                    idx,
                    extraProps = {},
                  ) => {
                    const isCollapsed = entry._group && entry._group.length > 1;
                    const collapseKey = `${g.key}:${getTmdbId(entry)}:${idx}`;
                    const isExpanded = expandedGroups.has(collapseKey);

                    if (isCollapsed) {
                      return (
                        <div
                          key={`group:${collapseKey}`}
                          className="relative cursor-pointer"
                        >
                          <div
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleExpandGroup(collapseKey);
                            }}
                            className="block"
                          >
                            <CardComponent
                              entry={entry}
                              busy={false}
                              index={idx}
                              totalItems={g.collapsedItems.length}
                              editMode={editMode}
                              isMobile={isMobile}
                              {...extraProps}
                            />
                          </div>
                          <AnimatePresence>
                            {isExpanded && (
                              <ExpandedGroupView
                                entry={entry}
                                onCollapse={() =>
                                  toggleExpandGroup(collapseKey)
                                }
                                onRemoveFromHistory={removeFromHistory}
                                busyId={mutatingId}
                              />
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    }

                    // Item normal (sin grupo o grupo de 1)
                    return (
                      <CardComponent
                        key={
                          getHistoryId(entry) ||
                          `${getTmdbId(entry)}:${entry?.watched_at}:${idx}`
                        }
                        entry={entry}
                        busy={mutatingId === `del:${getHistoryId(entry)}`}
                        onRemoveFromHistory={removeFromHistory}
                        index={idx}
                        totalItems={g.collapsedItems.length}
                        editMode={editMode}
                        isMobile={isMobile}
                        {...extraProps}
                      />
                    );
                  };

                  return (
                    <motion.div
                      key={g.key}
                      initial={isBackNav ? false : { opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: groupIndex * 0.1 }}
                    >
                      <div className="flex items-center gap-3 py-1.5 sm:py-4 mb-2">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-emerald-500/15" />
                        <div className="relative overflow-hidden inline-flex max-w-[80%] items-center gap-2 rounded-xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-1.5 text-xs sm:text-sm">
                          <span className="relative z-10 truncate font-black uppercase tracking-wide text-emerald-100 drop-shadow-sm">
                            {formatDateHeader(g.date, groupBy)}
                          </span>
                          <span className="relative z-10 shrink-0 text-[10px] font-bold text-emerald-300/80">
                            {g.items.length}{" "}
                            {g.items.length === 1 ? "visto" : "vistos"}
                          </span>
                        </div>
                        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-emerald-500/40 to-emerald-500/15" />
                      </div>

                      {viewMode === "grid" ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                          {g.collapsedItems.map((entry, idx) =>
                            renderItems(HistoryGridCard, entry, idx),
                          )}
                        </div>
                      ) : viewMode === "compact" ? (
                        <div className="compact-cards-grid grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-2">
                          {g.collapsedItems.map((entry, idx) =>
                            renderItems(HistoryCompactCard, entry, idx),
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                          {g.collapsedItems.map((entry, idx) =>
                            renderItems(HistoryItemCard, entry, idx),
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}

                {hasMoreHistory && (
                  <div
                    ref={loadMoreRef}
                    className="h-px w-full"
                    aria-hidden="true"
                  />
                )}

                {(loadingMore || historyError) && (
                  <div className="flex flex-col items-center justify-center gap-3 py-8">
                    {historyError && (
                      <>
                        <p className="text-sm text-red-300">{historyError}</p>
                        {hasMoreHistory && (
                          <button
                            type="button"
                            onClick={() => loadHistory({ reset: false })}
                            disabled={loadingMore || loading}
                            className="text-sm font-bold text-emerald-300 transition hover:text-white disabled:opacity-50"
                          >
                            Reintentar
                          </button>
                        )}
                      </>
                    )}
                    {loadingMore && (
                      <div className="inline-flex items-center gap-2 text-sm font-bold text-zinc-300">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        Cargando más...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Derecha: Calendario (Solo visible en desktop y cuando no está en vista calendario) */}
          {auth.connected && !showCalendarView && (
            <motion.div
              className="hidden xl:block space-y-6 sticky top-20"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <CalendarPanel
                monthDate={monthDate}
                onPrev={() =>
                  setMonthDate(
                    (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1),
                  )
                }
                onNext={() =>
                  setMonthDate(
                    (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1),
                  )
                }
                countsByDay={countsByDay}
                selectedYmd={selectedDay}
                onSelectYmd={setSelectedDay}
                onToggleCalendarView={() =>
                  setShowCalendarView(!showCalendarView)
                }
                showCalendarView={showCalendarView}
              />
            </motion.div>
          )}
        </div>
      </div>

      {/* Modal de Vista de Calendario */}
      <AnimatePresence>
        {showCalendarView && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-2 lg:p-3 bg-black/90 backdrop-blur-md"
            onClick={() => setShowCalendarView(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="w-full max-w-[1900px] h-[98vh] flex flex-col bg-[#0a0a0a] rounded-2xl lg:rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-1 flex flex-col p-3 lg:p-4 min-h-0">
                <CalendarWithPosters
                  monthDate={monthDate}
                  historyItems={filtered}
                  onPrev={() =>
                    setMonthDate(
                      (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1),
                    )
                  }
                  onNext={() =>
                    setMonthDate(
                      (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1),
                    )
                  }
                  onClose={() => setShowCalendarView(false)}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmación de Desconexión */}
      <AnimatePresence>
        {showDisconnectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowDisconnectModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md bg-neutral-900 rounded-2xl border border-white/10 shadow-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowDisconnectModal(false)}
                className="absolute top-4 right-4 p-1 rounded-lg hover:bg-white/10 transition-colors"
                title="Cerrar"
              >
                <X className="w-5 h-5 text-white/70" />
              </button>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                    <LogOut className="w-6 h-6 text-red-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white">
                    Desconectar de Trakt
                  </h2>
                </div>

                <p className="text-sm text-white/70">
                  ¿Estás seguro de que quieres desconectar tu cuenta de Trakt?
                  Perderás el acceso a tu historial de visualizaciones y tendrás
                  que volver a conectarte.
                </p>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowDisconnectModal(false)}
                    className="flex-1 py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg transition-colors border border-white/10"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg transition-colors"
                  >
                    Desconectar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
