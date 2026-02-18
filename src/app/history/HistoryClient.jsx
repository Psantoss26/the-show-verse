"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  memo,
} from "react";
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
  ChevronsUpDown,
} from "lucide-react";

import {
  traktAuthStatus,
  traktGetHistory,
  traktDisconnect,
} from "@/lib/api/traktClient";

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

// ----------------------------
// UTILS
// ----------------------------
const pad2 = (n) => String(n).padStart(2, "0");

function ymdLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateHeader(date, mode = "day") {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  if (mode === "year") return String(d.getFullYear());
  if (mode === "month") {
    return new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric",
    }).format(d);
  }
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatWatchedLine(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "", dayMonth: "" };
  const dd = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const hh = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  const dayMonth = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
  }).format(d);
  return { date: dd, time: hh, dayMonth };
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

// ✅ NUEVO: formato para el TÍTULO (sin pad, sin punto)
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
    const sameShow =
      getItemType(current) === "show" &&
      getItemType(curr) === "show" &&
      getTmdbId(current) &&
      getTmdbId(current) === getTmdbId(curr) &&
      current.poster_path &&
      current.poster_path === curr.poster_path;
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

function getYear(entry) {
  return entry?.year || entry?.movie?.year || entry?.show?.year || null;
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

  // ✅ Si es episodio, manda a la página del episodio
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

function normalizeHistoryResponse(json) {
  if (Array.isArray(json)) return { items: json };
  if (Array.isArray(json?.items)) return { items: json.items };
  return { items: [] };
}

async function mapLimit(arr, limit, fn) {
  const out = new Array(arr.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (i < arr.length) {
      const idx = i++;
      out[idx] = await fn(arr[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
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
    const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${TMDB_API_KEY}&include_image_language=en,en-US`;
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
    <div className="flex-1 lg:flex-none lg:min-w-[120px] bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1 backdrop-blur-sm transition hover:bg-zinc-900/70">
      <div
        className={`p-1.5 md:p-2 rounded-full bg-white/5 mb-1 ${colorClass}`}
      >
        <Icon className="w-4 h-4 md:w-5 md:h-5" />
      </div>
      <div className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">
        {loading ? (
          <span className="inline-block h-6 md:h-8 w-10 md:w-14 rounded-lg bg-white/10 animate-pulse" />
        ) : (
          value
        )}
      </div>
      <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight">
        {label}
      </div>
    </div>
  );
}

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
    () =>
      new Intl.DateTimeFormat("es-ES", {
        month: "long",
        year: "numeric",
      }).format(monthDate),
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

  const selectedDayItems = selectedDayKey ? itemsByDay[selectedDayKey] || [] : [];
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
              title="Mes anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            </button>
            <button
              onClick={onNext}
              className="p-1.5 lg:p-2 hover:bg-zinc-800 rounded-md lg:rounded-lg transition text-zinc-300 hover:text-white"
              title="Mes siguiente"
            >
              <ChevronRight className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 lg:p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-lg lg:rounded-xl transition-all text-red-400 hover:text-red-300"
            title="Cerrar vista calendario"
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
              onClick={hasItems ? () => setSelectedDayKey(isSelected ? null : key) : undefined}
              className={[
                "flex flex-col rounded-lg lg:rounded-xl border-2 transition-all relative overflow-visible",
                hasItems ? "cursor-pointer hover:z-10" : "",
                !inMonth
                  ? "bg-zinc-900/10 border-zinc-800/20"
                  : isSelected
                    ? "bg-gradient-to-br from-emerald-500/15 to-emerald-600/10 border-emerald-500/60 shadow-lg shadow-emerald-500/10"
                    : isToday
                      ? "bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/40 shadow-lg shadow-emerald-500/10"
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
                  <span className={[
                    "text-[9px] lg:text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                    isSelected
                      ? "bg-emerald-500/40 text-emerald-200"
                      : "bg-emerald-500/20 text-emerald-300",
                  ].join(" ")}>
                    {items.length}
                  </span>
                )}
              </div>

              {/* Portadas apiladas */}
              {hasItems && (
                <div
                  className="flex-1 flex items-center justify-center px-1 pb-1 min-h-0 overflow-visible"
                  onMouseMove={(e) => {
                    const wrapper = e.currentTarget.querySelector("[data-poster-stack]");
                    if (!wrapper) return;
                    const children = Array.from(wrapper.children);
                    const total = children.length;
                    if (total <= 1) return;
                    const rect = wrapper.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const activeIdx = Math.min(Math.floor(ratio * total), total - 1);
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
                        child.style.zIndex = String(total - Math.abs(i - activeIdx));
                        child.style.transform = `translateX(${xPos}px) scale(0.95)`;
                        child.style.opacity = "0.5";
                        child.style.filter = "brightness(0.7)";
                      }
                      child.style.transition = "all 0.2s ease-out";
                    });
                  }}
                  onMouseLeave={(e) => {
                    const wrapper = e.currentTarget.querySelector("[data-poster-stack]");
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
                    title="Cerrar"
                  >
                    <X className="w-4 h-4 text-zinc-400" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    {selectedDayItems.length} {selectedDayItems.length === 1 ? "visto" : "vistos"}
                  </span>
                </div>
              </div>

              {/* Lista scrollable de items */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
                {selectedDayCollapsed.map((entry, idx) => {
                  const isGroup = entry._group && entry._group.length > 1;
                  const title = getMainTitle(entry);
                  const type = getItemType(entry);
                  const epMeta = isEpisodeEntry(entry) ? getEpisodeMeta(entry) : null;
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
                      href={href || "#"}
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
                          <span className={[
                            "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                            type === "movie"
                              ? "bg-sky-500/20 text-sky-300"
                              : "bg-purple-500/20 text-purple-300",
                          ].join(" ")}>
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
          <div className="absolute inset-0 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 shadow-md">
            <Poster entry={entry} className="w-full h-full" />
          </div>
          <div className="absolute -top-1.5 -right-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 text-white shadow-lg">
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
                const subMeta = isEpisodeEntry(sub) ? getEpisodeMeta(sub) : null;
                const subHref = getDetailsHref(sub);
                return (
                  <Link
                    key={`sub-${getHistoryId(sub) || subIdx}`}
                    href={subHref || "#"}
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
    () =>
      new Intl.DateTimeFormat("es-ES", {
        month: "long",
        year: "numeric",
      }).format(monthDate),
    [monthDate],
  );
  const dow = ["L", "M", "X", "J", "V", "S", "D"];

  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-8 backdrop-blur-sm sticky top-6 shadow-xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-white font-bold capitalize text-2xl tracking-tight">
            {monthLabel}
          </h3>
          <p className="text-sm text-emerald-500/70 mt-1 font-medium">
            Filtrar por día
          </p>
        </div>
        <div className="flex gap-2 bg-zinc-800/80 rounded-xl p-1.5 border border-white/5">
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
            className="text-center text-xs font-bold text-zinc-500 uppercase tracking-wider"
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
                ${!inMonth ? "opacity-0 pointer-events-none" : "text-zinc-300"}
                ${selected
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 z-10 scale-110"
                  : isToday
                    ? "bg-zinc-800 text-white border border-emerald-500/50"
                    : "bg-zinc-900/50 hover:bg-zinc-800 hover:text-white hover:scale-105"
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
          className="mt-8 w-full py-3 text-sm font-bold text-emerald-400 hover:text-emerald-300 flex items-center justify-center gap-2 border-t border-white/5 uppercase tracking-wide transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Ver todo el mes
        </button>
      )}

      <button
        onClick={onToggleCalendarView}
        className={`mt-6 w-full py-3 text-sm font-bold flex items-center justify-center gap-2 rounded-xl transition-all ${showCalendarView
          ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
          : "bg-zinc-800/80 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-white/5"
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
  const [posterPath, setPosterPath] = useState(entry?.poster_path || null);
  useEffect(() => {
    setPosterPath(entry?.poster_path || null);
  }, [entry?.poster_path]);

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      if (posterPath) return;
      const t = getItemType(entry);
      const id = getTmdbId(entry);
      if (!t || !id) return;
      const r = await fetchTmdbPoster({ type: t, tmdbId: id });
      if (ignore) return;
      if (r?.poster_path) setPosterPath(r.poster_path);
    };
    run();
    return () => {
      ignore = true;
    };
  }, [posterPath, entry]);

  const src = posterPath
    ? `https://image.tmdb.org/t/p/w342${posterPath}`
    : null;

  return (
    <div
      className={`overflow-hidden bg-zinc-800 border border-white/5 shrink-0 relative shadow-lg ${className}`}
    >
      {src ? (
        <img
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

      // BACKDROP MODE
      if (mode === "backdrop") {
        const bestBackdrop = await getBestBackdropCached(tmdbType, id);
        const r = await fetchTmdbPoster({ type, tmdbId: id });
        const finalPath =
          bestBackdrop ||
          r?.backdrop_path ||
          r?.poster_path ||
          entry?.backdrop_path ||
          entry?.poster_path ||
          null;
        const url = finalPath
          ? `https://image.tmdb.org/t/p/w780${finalPath}`
          : null;
        if (url) await preloadImage(url);
        if (!abort) {
          setSrc(url);
          setReady(!!url);
        }
        return;
      }

      // POSTER MODE
      const r = await fetchTmdbPoster({ type, tmdbId: id });
      const finalPath =
        r?.poster_path || entry?.poster_path || entry?.backdrop_path || null;
      const url = finalPath
        ? `https://image.tmdb.org/t/p/w342${finalPath}`
        : null;
      if (url) await preloadImage(url);
      if (!abort) {
        setSrc(url);
        setReady(!!url);
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
        className={`absolute inset-0 flex items-center justify-center bg-zinc-900 transition-opacity duration-300 ${ready && src ? "opacity-0" : "opacity-100"
          }`}
      >
        <Film className="w-8 h-8 text-zinc-700" />
      </div>

      {src && (
        <img
          src={src}
          alt={title}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"
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
  isMobile = false,
}) {
  const type = getItemType(entry);

  const epMeta = isEpisodeEntry(entry) ? getEpisodeMeta(entry) : null;
  const baseTitle = getMainTitle(entry);
  const inlineEp =
    type === "show" && epMeta ? formatEpisodeInline(epMeta) : null;

  // ✅ AQUÍ está la clave: el título incluye T1 E1
  const title = inlineEp ? `${baseTitle} ${inlineEp}` : baseTitle;

  const year = getYear(entry);
  const watchedDate = useMemo(() => {
    const d = new Date(entry?.watched_at);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "long",
    }).format(d);
  }, [entry?.watched_at]);
  const href = useMemo(() => getDetailsHref(entry), [entry]);
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

  // ✅ Optimized backdrop loading with Intersection Observer
  useEffect(() => {
    if (!hasBeenInView) return;

    let abort = false;
    const load = async () => {
      const t = getItemType(entry);
      const id = getTmdbId(entry);
      if (!t || !id) return;

      const tmdbType = t === "show" ? "tv" : "movie";
      const bestBackdrop = await getBestBackdropCached(tmdbType, id);
      const r = await fetchTmdbPoster({ type: t, tmdbId: id });
      const finalPath =
        bestBackdrop ||
        r?.backdrop_path ||
        r?.poster_path ||
        entry?.backdrop_path ||
        entry?.poster_path ||
        null;
      const url = finalPath
        ? `https://image.tmdb.org/t/p/w780${finalPath}`
        : null;

      if (url) await preloadImage(url);
      if (!abort) {
        setPosterSrc(url);
        setBackdropReady(!!url);
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
      <div className="w-[140px] sm:w-[210px] aspect-video rounded-lg overflow-hidden relative shadow-md border border-white/5 bg-zinc-900 shrink-0">
        <div className="absolute inset-0 w-full h-full">
          <div
            className={`absolute inset-0 flex items-center justify-center bg-zinc-900 transition-opacity duration-300 ${backdropReady && posterSrc ? "opacity-0" : "opacity-100"
              }`}
          >
            <Film className="w-8 h-8 text-zinc-700" />
          </div>

          {posterSrc && (
            <img
              src={posterSrc}
              alt={title}
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${backdropReady ? "opacity-100" : "opacity-0"
                }`}
            />
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <div className="flex items-center gap-2">
          <h4 className="text-white font-bold text-base leading-tight truncate">
            {title}
          </h4>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-500 -ml-0.5">
          <span
            className={`font-bold uppercase tracking-wider text-[9px] px-1 rounded-sm ${type === "movie" ? "bg-sky-500/10 text-sky-500" : "bg-purple-500/10 text-purple-500"}`}
          >
            {type === "movie" ? "PELÍCULA" : "SERIE"}
          </span>
          <span>•</span>

          {/* Para series: si hay título de episodio, lo mostramos; si no, el año */}
          <span className="truncate max-w-[260px]">
            {type === "show" && epMeta?.title ? epMeta.title : year}
          </span>
        </div>

        <div className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5 font-medium">
          <RotateCcw className="w-3 h-3" /> {watchedDate}
        </div>
      </div>

      {/* ✅ Botón borrar: visible en móvil solo si editMode, en desktop al hover */}
      {!confirmDel && (!isMobile || editMode) && (
        <button
          onClick={handleDeleteClick}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full backdrop-blur-sm bg-black/40 hover:bg-red-600 text-white transition-colors z-10 opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
          title="Borrar"
          aria-label="Borrar"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      {/* ✅ Confirmación de borrado */}
      <AnimatePresence>
        {confirmDel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/95 z-20 flex items-center justify-end px-4 gap-3 rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-red-200 text-xs lg:text-sm font-bold mr-auto">
              <span className="lg:hidden">Eliminar</span>
              <span className="hidden lg:inline">¿Eliminar del historial?</span>
            </span>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold transition-colors flex items-center gap-1.5"
              aria-label="Cancelar"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Cancelar</span>
            </button>
            <button
              onClick={handleConfirm}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
              aria-label="Borrar"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span className="hidden lg:inline">Borrar</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // Reduce animation delay for large lists
  const animDelay =
    totalItems > 20 ? Math.min(index * 0.02, 0.3) : index * 0.05;
  const shouldAnimate = index < 50; // Only animate first 50 items

  if (!href)
    return (
      <motion.div
        ref={ref}
        className="bg-zinc-900/30 border border-white/5 rounded-xl"
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
        {Content}
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
      layout
    >
      <Link
        href={href}
        className="block bg-zinc-900/30 border border-white/5 rounded-xl hover:border-emerald-500/30 hover:bg-zinc-900/60 transition-colors group overflow-hidden"
      >
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
  const episodeTitle = type === "show" && epMeta?.title ? epMeta.title : null;
  const epBadge = type === "show" && epMeta ? formatEpisodeBadge(epMeta) : null;
  const { dayMonth } = formatWatchedLine(entry?.watched_at);
  const year = getYear(entry);
  const href = useMemo(() => getDetailsHref(entry), [entry]);
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
      className={`relative aspect-[2/3] compact-card group rounded-lg overflow-hidden bg-zinc-900 border border-white/5 shadow-md ${disabledCls}`}
      whileHover={{
        scale: 1.15,
        zIndex: 50,
        boxShadow:
          "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
        borderColor: "rgba(16, 185, 129, 0.4)",
      }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      style={{ transformOrigin: "center center" }}
    >
      {/* ✅ Poster Image */}
      <Poster entry={entry} className="w-full h-full" />

      {/* ✅ Desktop: Hover overlay with information */}
      <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-end p-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
          <div className="flex items-center gap-2 mb-1 -ml-0.5">
            <span
              className={`text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${type === "movie" ? "bg-sky-500/40 text-sky-100" : "bg-purple-500/40 text-purple-100"}`}
            >
              {type === "movie" ? "Película" : "Serie"}
            </span>
            <span className="text-[8px] text-zinc-300/90 font-medium">
              {dayMonth}
            </span>
          </div>

          <h5 className="text-white font-bold text-[10px] leading-tight line-clamp-2 mb-0.5">
            {title}
          </h5>

          {type === "show" && epBadge && (
            <div className="text-[9px] text-emerald-300 font-semibold">
              {epBadge}
            </div>
          )}
        </div>
      </div>

      {/* ✅ Mobile: Compact badge indicator - solo en editMode */}
      {(!isMobile || editMode) && (
        <div className="absolute top-2 left-2 z-10 lg:hidden">
          <span
            className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded backdrop-blur-md ${type === "movie" ? "bg-sky-500/50 text-sky-50" : "bg-purple-500/50 text-purple-50"}`}
          >
            {type === "movie" ? "M" : "S"}
          </span>
        </div>
      )}

      {/* ✅ Delete button - appears on hover o en editMode mobile */}
      {!confirmDel && (!isMobile || editMode) && (
        <button
          onClick={handleDeleteClick}
          className="absolute top-2 right-2 z-20 p-1.5 rounded-full backdrop-blur-md bg-black/40 hover:bg-red-600 text-white transition-all duration-200 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 pointer-events-auto border border-white/10 hover:border-transparent"
          title="Borrar"
          aria-label="Borrar"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}

      {/* ✅ Delete confirmation overlay */}
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
            <p className="text-red-200 text-[11px] lg:text-xs font-bold mb-3">
              <span className="lg:hidden">Eliminar</span>
              <span className="hidden lg:inline">¿Eliminar del historial?</span>
            </p>
            <div className="flex gap-2 w-full">
              <button
                onClick={handleCancel}
                className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                aria-label="Cancelar"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Cancelar</span>
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                aria-label="Borrar"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span className="hidden lg:inline">Borrar</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  const animDelay =
    totalItems > 30 ? Math.min(index * 0.015, 0.25) : index * 0.03;
  const shouldAnimate = index < 60;

  if (!href) return <div>{CardInner}</div>;
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

  const { dayMonth } = formatWatchedLine(entry?.watched_at);
  const href = useMemo(() => getDetailsHref(entry), [entry]);
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
      <div className="flex items-center gap-2 mb-1 -ml-0.5">
        <span
          className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${type === "movie"
            ? "bg-sky-500/20 text-sky-200"
            : "bg-purple-500/20 text-purple-200"
            }`}
        >
          {type === "movie" ? "Cine" : "TV"}
        </span>
        <span className="text-[10px] text-zinc-300/80 font-medium">
          {dayMonth}
        </span>
      </div>

      <h5 className="text-white font-bold text-xs leading-tight line-clamp-2">
        {title}
      </h5>

      {/* Episodio (móvil: en 1-2 líneas suaves) */}
      {type === "show" && (epBadge || episodeTitle) && (
        <div className="mt-0.5 text-[10px] text-zinc-200/80">
          {epBadge && <div className="leading-tight">{epBadge}</div>}
          {episodeTitle && (
            <div className="leading-tight line-clamp-1 text-zinc-200/70">
              {episodeTitle}
            </div>
          )}
        </div>
      )}
    </>
  );

  const CardInner = (
    <div
      className={[
        // ✅ IMPORTANTE: hover SOLO en desktop para evitar "hover pegajoso" en móvil
        "relative aspect-[2/3] group rounded-xl overflow-hidden bg-zinc-900 border border-white/5 shadow-md",
        "lg:hover:shadow-emerald-900/20 transition-all",
        disabledCls,
      ].join(" ")}
    >
      <Poster entry={entry} className="w-full h-full" />

      {/* ✅ MÓVIL: banda inferior - solo en editMode */}
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

      {/* ✅ DESKTOP: overlay más sutil con menos blur */}
      <div
        className={[
          "absolute inset-0 z-10 hidden lg:flex flex-col justify-end p-3",
          "bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300",
          confirmDel ? "opacity-0 pointer-events-none" : "",
        ].join(" ")}
      >
        <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
          {/* En desktop mostramos badge + título episodio en la misma línea (como ya tenías) */}
          <div className="flex items-center gap-2 mb-1 -ml-0.5">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${type === "movie"
                ? "bg-sky-500/30 text-sky-200"
                : "bg-purple-500/30 text-purple-200"
                }`}
            >
              {type === "movie" ? "Cine" : "TV"}
            </span>
            <span className="text-[10px] text-zinc-300 font-medium">
              {dayMonth}
            </span>
          </div>

          <h5 className="text-white font-bold text-xs leading-tight line-clamp-2">
            {title}
          </h5>

          {type === "show" && (epBadge || episodeTitle) && (
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
          )}
        </div>
      </div>

      {/* ✅ Botón borrar: visible en móvil solo si editMode está activo, en desktop solo al hover */}
      {!confirmDel && (!isMobile || editMode) && (
        <button
          onClick={handleDeleteClick}
          className={[
            "absolute top-2 right-2 z-20 p-2 rounded-full backdrop-blur-sm",
            "bg-black/40 hover:bg-red-600 text-white transition-colors",
            "opacity-100 lg:opacity-0 lg:group-hover:opacity-100",
          ].join(" ")}
          title="Borrar"
          aria-label="Borrar"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* ✅ Confirmación de borrado */}
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
            <p className="text-red-200 text-xs lg:text-sm font-bold mb-3">
              <span className="lg:hidden">Eliminar</span>
              <span className="hidden lg:inline">¿Eliminar del historial?</span>
            </p>
            <div className="flex gap-2 w-full">
              <button
                onClick={handleCancel}
                className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold transition-colors flex items-center justify-center gap-1"
                aria-label="Cancelar"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Cancelar</span>
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                aria-label="Borrar"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span className="hidden lg:inline">Borrar</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const animDelay =
    totalItems > 20 ? Math.min(index * 0.015, 0.25) : index * 0.03;
  const shouldAnimate = index < 60;

  if (!href) return <div>{CardInner}</div>;
  return (
    <motion.div
      initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, delay: shouldAnimate ? animDelay : 0 }}
    >
      <Link href={href} className="block">
        {CardInner}
      </Link>
    </motion.div>
  );
});

// ----------------------------
// MAIN PAGE
// ----------------------------
export default function HistoryClient() {
  const [auth, setAuth] = useState({ loading: true, connected: false });
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [raw, setRaw] = useState([]);
  const [mutatingId, setMutatingId] = useState("");
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  // UI States
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return "compact";
    const saved = window.localStorage.getItem("showverse:history:viewMode");
    return saved === "list" || saved === "grid" || saved === "compact"
      ? saved
      : "compact";
  });
  const [groupBy, setGroupBy] = useState(() => {
    if (typeof window === "undefined") return "day";
    const saved = window.localStorage.getItem("showverse:history:groupBy");
    return saved || "day";
  });
  const [typeFilter, setTypeFilter] = useState(() => {
    if (typeof window === "undefined") return "all";
    const saved = window.localStorage.getItem("showverse:history:typeFilter");
    return saved || "all";
  });
  const [sortBy, setSortBy] = useState(() => {
    if (typeof window === "undefined") return "date-desc";
    const saved = window.localStorage.getItem("showverse:history:sortBy");
    return saved || "date-desc";
  });
  const [q, setQ] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const toggleExpandGroup = useCallback((groupKey) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  // Persistir estados de UI en localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:history:viewMode", viewMode);
  }, [viewMode]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:history:groupBy", groupBy);
  }, [groupBy]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:history:typeFilter", typeFilter);
  }, [typeFilter]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:history:sortBy", sortBy);
  }, [sortBy]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => {
      setIsMobile(!!mq.matches);
      setFiltersOpen(!mq.matches);
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const loadAuth = useCallback(async () => {
    try {
      const st = await traktAuthStatus();
      setAuth({ loading: false, connected: !!st?.connected });
    } catch {
      setAuth({ loading: false, connected: false });
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const json = await traktGetHistory({ type: "all", page: 1, limit: 200 });
      const { items } = normalizeHistoryResponse(json);
      const sorted = [...items].sort(
        (a, b) => new Date(b?.watched_at) - new Date(a?.watched_at),
      );

      // ✅ Optimized: Load only essential data, images loaded on-demand with Intersection Observer
      const enriched = await mapLimit(sorted, 15, async (e) => {
        const t = getItemType(e);
        const id = getTmdbId(e);
        if (!t || !id) return e;
        const r = await fetchTmdbPoster({ type: t, tmdbId: id });
        if (!r) return e;
        return {
          ...e,
          title_es: r?.title_es || null,
          year: r?.year || getYear(e),
          poster_path: r?.poster_path || null,
        };
      });

      setRaw(enriched);
    } catch {
      setRaw([]);
    } finally {
      setLoading(false);
      setHistoryLoaded(true);
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    try {
      await traktDisconnect();
      // Limpiar estado local
      setAuth({ loading: false, connected: false });
      setRaw([]);
      setHistoryLoaded(false);
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
  useLayoutEffect(() => {
    if (!auth.loading && auth.connected) loadHistory();
  }, [auth.loading, auth.connected, loadHistory]);

  const removeFromHistory = useCallback(async (_entry, { historyId }) => {
    if (!historyId) return;
    setMutatingId(`del:${historyId}`);
    try {
      await apiPost("/api/trakt/history/remove", { ids: [historyId] });
      setRaw((prev) =>
        (prev || []).filter(
          (x) => String(getHistoryId(x)) !== String(historyId),
        ),
      );
    } catch {
      // noop
    } finally {
      setMutatingId("");
    }
  }, []);

  const filtered = useMemo(() => {
    const needle = (q || "").trim().toLowerCase();
    return (raw || []).filter((e) => {
      const t = getItemType(e);
      if (typeFilter === "movies" && t !== "movie") return false;
      if (typeFilter === "shows" && t !== "show") return false;
      const d = new Date(e?.watched_at);
      if (Number.isNaN(d.getTime())) return false;
      if (selectedDay && ymdLocal(d) !== selectedDay) return false;
      if (needle) {
        const title = (getMainTitle(e) || "").toLowerCase();
        if (!title.includes(needle)) return false;
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

  if (auth.loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-emerald-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-sky-500/5 rounded-full blur-[150px]" />
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
                <div className="h-px w-12 bg-emerald-500" />
                <span className="text-emerald-400 font-bold uppercase tracking-widest text-xs">REGISTRO</span>
              </div>
              <div className="flex items-center gap-6">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                  Historial
                  <span className="text-emerald-500">.</span>
                </h1>

                {/* Botones redondos junto al título */}
                {auth.connected && (
                  <div className="flex items-center gap-2">
                    <motion.button
                      onClick={() => loadHistory()}
                      disabled={loading}
                      className="p-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full transition disabled:opacity-50"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.3 }}
                      whileHover={{ scale: loading ? 1 : 1.05 }}
                      whileTap={{ scale: loading ? 1 : 0.95 }}
                      title="Sincronizar"
                    >
                      <RotateCcw className={`w-5 h-5 text-white ${loading ? "animate-spin" : ""}`} />
                    </motion.button>

                    <motion.button
                      onClick={() => setShowDisconnectModal(true)}
                      disabled={loading}
                      className="p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-full transition disabled:opacity-50"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.4 }}
                      whileHover={{ scale: loading ? 1 : 1.05 }}
                      whileTap={{ scale: loading ? 1 : 0.95 }}
                      title="Desconectar"
                    >
                      <LogOut className="w-5 h-5 text-red-400" />
                    </motion.button>
                  </div>
                )}
              </div>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
                Registro cronológico de todo lo que has visto.
              </p>
            </div>

            {/* Solo estadísticas a la derecha */}
            {auth.connected && (
              <motion.div
                className="flex gap-3 md:gap-4 w-full lg:w-auto justify-center lg:justify-end"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                >
                  <StatCard
                    label="Total Vistos"
                    value={stats.plays}
                    loading={!historyLoaded}
                    icon={CheckCircle2}
                    colorClass="text-emerald-400 bg-emerald-500/10"
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                >
                  <StatCard
                    label="Títulos Únicos"
                    value={stats.unique}
                    loading={!historyLoaded}
                    icon={LayoutList}
                    colorClass="text-purple-400 bg-purple-500/10"
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.7 }}
                >
                  <StatCard
                    label="Películas"
                    value={stats.movies}
                    loading={!historyLoaded}
                    icon={Film}
                    colorClass="text-sky-400 bg-sky-500/10"
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.8 }}
                >
                  <StatCard
                    label="Episodios"
                    value={stats.shows}
                    loading={!historyLoaded}
                    icon={Tv}
                    colorClass="text-pink-400 bg-pink-500/10"
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
                    className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border transition-all ${mobileFiltersOpen
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
                        {/* Fila 1 - Tipo y Agrupar */}
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
                          <div className="flex-1">
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
                            <div className="flex flex-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center">
                              <button
                                onClick={() => setViewMode("list")}
                                className={`flex-1 h-full rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "list"
                                  ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                                  }`}
                                title="Lista"
                              >
                                <LayoutList className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setViewMode("compact")}
                                className={`flex-1 h-full rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "compact"
                                  ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                                  }`}
                                title="Compacta"
                              >
                                <Grid3x3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setViewMode("grid")}
                                className={`flex-1 h-full rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "grid"
                                  ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                                  }`}
                                title="Grid"
                              >
                                <LayoutGrid className="w-4 h-4" />
                              </button>
                            </div>

                            <button
                              onClick={() => setEditMode(!editMode)}
                              className={`h-11 w-11 rounded-xl text-sm font-bold transition-all flex items-center justify-center shrink-0 ${editMode
                                ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                                : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600"
                                }`}
                              title={editMode ? "Cancelar" : "Editar"}
                            >
                              {editMode ? <X className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Desktop: Una sola fila con todo */}
                <div className="hidden lg:flex gap-3">
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
                    label="Agrupar"
                    valueLabel={
                      groupBy === "day"
                        ? "Día"
                        : groupBy === "month"
                          ? "Mes"
                          : "Año"
                    }
                    icon={Layers}
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

                  <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center shrink-0">
                    <button
                      onClick={() => setViewMode("list")}
                      className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "list"
                        ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      title="Vista Lista"
                    >
                      <LayoutList className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("compact")}
                      className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "compact"
                        ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      title="Vista Compacta"
                    >
                      <Grid3x3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "grid"
                        ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      title="Vista Cuadrícula"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {!auth.connected ? (
              <div className="flex flex-col items-center justify-center py-24 bg-zinc-900/20 border border-white/5 rounded-3xl text-center px-4 border-dashed">
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
                  Para ver tu historial de visualizaciones sincronizado,
                  necesitas iniciar sesión.
                </p>
                <button
                  onClick={() =>
                    window.location.assign(
                      "/api/trakt/auth/start?next=/history",
                    )
                  }
                  className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition shadow-lg shadow-white/10"
                >
                  Conectar ahora
                </button>
              </div>
            ) : historyLoaded && filtered.length === 0 && !loading ? (
              <motion.div
                className="py-24 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <LayoutList className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
                <p className="text-zinc-500 font-medium">
                  No se encontraron resultados.
                </p>
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
                  const renderItems = (CardComponent, entry, idx, extraProps = {}) => {
                    const isCollapsed = entry._group && entry._group.length > 1;
                    const collapseKey = `${g.key}:${getTmdbId(entry)}:${idx}`;
                    const isExpanded = expandedGroups.has(collapseKey);

                    if (isCollapsed && !isExpanded) {
                      // Tarjeta colapsada con badge de cantidad
                      const count = entry._group.length;
                      return (
                        <div
                          key={`collapsed:${collapseKey}`}
                          className="relative cursor-pointer"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleExpandGroup(collapseKey);
                          }}
                        >
                          {/* Tarjeta renderizada debajo */}
                          <div className="relative z-10">
                            <CardComponent
                              entry={entry}
                              busy={false}
                              onRemoveFromHistory={removeFromHistory}
                              index={idx}
                              totalItems={g.collapsedItems.length}
                              editMode={editMode}
                              isMobile={isMobile}
                              {...extraProps}
                            />
                          </div>
                          {/* Overlay encima: bloquea TODO hover/click en la tarjeta, los clics suben al padre */}
                          <div className="absolute inset-0 z-40 cursor-pointer">
                            {/* Badge de cantidad dentro del overlay */}
                            <div className="absolute top-2 right-2">
                              <span className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-600/90 text-white backdrop-blur-md shadow-lg border border-emerald-400/30">
                                <Layers className="w-3 h-3" />
                                {count}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (isCollapsed && isExpanded) {
                      // Grupo expandido: mostrar todos los items individuales
                      return (
                        <div
                          key={`expanded:${collapseKey}`}
                          className={
                            viewMode === "list"
                              ? "col-span-full"
                              : "contents"
                          }
                        >
                          {/* Botón para colapsar de nuevo */}
                          <div
                            className={
                              viewMode === "list"
                                ? "mb-2"
                                : "col-span-full flex justify-start mb-1"
                            }
                          >
                            <button
                              onClick={() => toggleExpandGroup(collapseKey)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors"
                            >
                              <Layers className="w-3.5 h-3.5" />
                              {getMainTitle(entry)} · {entry._group.length} episodios
                              <span className="text-emerald-500/60 ml-1">– Colapsar</span>
                            </button>
                          </div>
                          {entry._group.map((subEntry, subIdx) => (
                            <CardComponent
                              key={
                                getHistoryId(subEntry) ||
                                `${getTmdbId(subEntry)}:${subEntry?.watched_at}:${subIdx}`
                              }
                              entry={subEntry}
                              busy={mutatingId === `del:${getHistoryId(subEntry)}`}
                              onRemoveFromHistory={removeFromHistory}
                              index={subIdx}
                              totalItems={entry._group.length}
                              editMode={editMode}
                              isMobile={isMobile}
                              {...extraProps}
                            />
                          ))}
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
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: groupIndex * 0.1 }}
                    >
                      <div className="flex items-center gap-4 mb-4">
                        <h3 className="text-lg font-bold text-white capitalize">
                          {formatDateHeader(g.date, groupBy)}
                        </h3>
                        <div className="h-px bg-zinc-800 flex-1" />
                        <span className="text-[10px] font-bold text-zinc-500 bg-zinc-900 px-2 py-1 rounded-md border border-zinc-800">
                          {g.items.length} vistos
                        </span>
                      </div>

                      {viewMode === "grid" ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                          {g.collapsedItems.map((entry, idx) =>
                            renderItems(HistoryGridCard, entry, idx)
                          )}
                        </div>
                      ) : viewMode === "compact" ? (
                        <div className="compact-cards-grid grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-2">
                          {g.collapsedItems.map((entry, idx) =>
                            renderItems(HistoryCompactCard, entry, idx)
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                          {g.collapsedItems.map((entry, idx) =>
                            renderItems(HistoryItemCard, entry, idx)
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
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
    </div >
  );
}
