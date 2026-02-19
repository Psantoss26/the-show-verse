"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Film,
  FolderKanban,
  HardDrive,
  Loader2,
  MonitorPlay,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tv,
  X,
  Filter,
  Layers3,
  LayoutList,
  Grid3x3,
  LayoutGrid,
} from "lucide-react";

// ================== CONSTANTS ==================

const CACHE_KEY_PREFIX = "showverse:plex-library:v3";
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_FETCH_LIMIT = 2000;
const EXPANDED_FETCH_LIMIT = 10000;
const MAX_LOCALIZED_BACKDROP_IDS_PER_TYPE = 250;

const RESOLUTION_STYLES = {
  "8K": "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
  "4K": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "2160p": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "1440p": "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "1080p": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "720p": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "576p": "bg-lime-500/20 text-lime-300 border-lime-500/30",
  "480p": "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  SD: "bg-zinc-600/20 text-zinc-200 border-zinc-600/30",
};

const RESOLUTION_ORDER = [
  "8K",
  "4K",
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "576p",
  "480p",
  "SD",
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

function getCacheKey(limit) {
  return `${CACHE_KEY_PREFIX}:limit:${Number(limit) || DEFAULT_FETCH_LIMIT}`;
}

function buildTmdbImage(path, size = "w1280") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

// ================== UTILS ==================

function formatEpoch(value) {
  const num = Number(value || 0);
  if (!num) return "Sin fecha";
  const d = new Date(num * 1000);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDuration(ms) {
  const durationMs = Number(ms || 0);
  if (!durationMs) return null;
  const totalMinutes = Math.round(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function getResolutionStyle(resolution) {
  return (
    RESOLUTION_STYLES[resolution] ||
    "bg-neutral-500/20 text-neutral-300 border-neutral-500/30"
  );
}

function getResolutionTextColor(resolution) {
  const style = getResolutionStyle(resolution);
  return style.split(" ").find((c) => c.startsWith("text-")) || "text-zinc-300";
}

// ================== SVG GLYPHS ==================

function PosterGlyph({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 12h6" opacity="0.5" />
    </svg>
  );
}

function BackdropGlyph({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 15l5.5-5.5L12 13l3.5-3.5L21 15" opacity="0.5" />
    </svg>
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
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-4 h-4 text-amber-500 shrink-0" />}
          <span className="text-zinc-500 font-bold text-xs uppercase tracking-wider shrink-0">
            {label}:
          </span>
          <span className="font-semibold text-white truncate">
            {valueLabel}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute left-0 top-full z-[100] mt-2 w-52 max-h-72 rounded-xl border border-zinc-800 bg-[#121212] shadow-2xl overflow-y-auto p-1 sv-scroll"
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
      {active && <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />}
    </button>
  );
}

function GroupDivider({ title, count, total }) {
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
        <div className="relative px-3 sm:px-6 py-2.5 sm:py-5 flex items-center gap-2 sm:gap-4">
          <div className="w-1 sm:w-1.5 h-8 sm:h-12 bg-gradient-to-b from-amber-500 to-orange-600 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.3)] shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-2xl font-black tracking-tight text-white leading-tight line-clamp-1">
              {title}
            </h2>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-sm text-zinc-500 font-medium flex items-center gap-x-1.5 sm:gap-x-2">
              <span className="text-zinc-300 font-bold">{count}</span>
              <span>títulos</span>
              <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-zinc-700" />
              <span className="opacity-90">{pct}%</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ================== CARD COMPONENTS ==================

function openPlexLink(item) {
  const webUrl = item?.links?.web || null;
  const mobileUrl = item?.links?.mobile || null;
  const isTouch =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  if (isTouch && mobileUrl) {
    window.location.href = mobileUrl;
    return;
  }
  if (webUrl) {
    window.open(webUrl, "_blank", "noopener,noreferrer");
  }
}

// --- Grid / Poster card (aspect-[2/3]) ---
function PosterCard({ item, animated = true }) {
  const title = item?.title || "Sin titulo";
  const year = item?.year ? String(item.year) : "----";
  const isMovie = item?.type === "movie";
  const primaryRes = item?.primaryResolution;
  const canOpen = item?.links?.web || item?.links?.mobile;

  return (
    <motion.article
      variants={animated ? cardVariants : undefined}
      className="group relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-white/5 cursor-pointer"
      onClick={canOpen ? () => openPlexLink(item) : undefined}
    >
      {item?.thumb ? (
        <img src={item.thumb} alt={title} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900">
          {isMovie ? <Film className="w-12 h-12 text-zinc-700" /> : <Tv className="w-12 h-12 text-zinc-700" />}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
        <h3 className="text-white font-bold text-sm leading-tight line-clamp-2 drop-shadow-lg">{title}</h3>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 mt-1">
          <span>{year}</span>
          {primaryRes && (
            <>
              <span className="w-0.5 h-0.5 rounded-full bg-zinc-500" />
              <span className={`font-semibold ${getResolutionTextColor(primaryRes)}`}>{primaryRes}</span>
            </>
          )}
        </div>
      </div>
      <div className="absolute inset-0 rounded-xl ring-1 ring-white/5 group-hover:ring-amber-500/30 transition-all duration-300 pointer-events-none" />
    </motion.article>
  );
}

// --- Backdrop card (aspect-[16/9]) ---
function BackdropCard({ item, animated = true, backdropSrc = null }) {
  const title = item?.title || "Sin titulo";
  const year = item?.year ? String(item.year) : "----";
  const isMovie = item?.type === "movie";
  const primaryRes = item?.primaryResolution;
  const canOpen = item?.links?.web || item?.links?.mobile;

  return (
    <motion.article
      variants={animated ? cardVariants : undefined}
      className="group relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-white/5 cursor-pointer"
      onClick={canOpen ? () => openPlexLink(item) : undefined}
    >
      {backdropSrc ? (
        <img src={backdropSrc} alt={title} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900">
          {isMovie ? <Film className="w-12 h-12 text-zinc-700" /> : <Tv className="w-12 h-12 text-zinc-700" />}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
        <h3 className="text-white font-bold text-sm leading-tight line-clamp-2 drop-shadow-lg">{title}</h3>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 mt-1">
          <span>{year}</span>
          {primaryRes && (
            <>
              <span className="w-0.5 h-0.5 rounded-full bg-zinc-500" />
              <span className={`font-semibold ${getResolutionTextColor(primaryRes)}`}>{primaryRes}</span>
            </>
          )}
        </div>
      </div>
      <div className="absolute inset-0 rounded-xl ring-1 ring-white/5 group-hover:ring-amber-500/30 transition-all duration-300 pointer-events-none" />
    </motion.article>
  );
}

// --- Compact card (small poster + text) ---
function CompactCard({ item, animated = true }) {
  const title = item?.title || "Sin titulo";
  const year = item?.year ? String(item.year) : "----";
  const isMovie = item?.type === "movie";
  const primaryRes = item?.primaryResolution;
  const duration = formatDuration(item?.durationMs);
  const canOpen = item?.links?.web || item?.links?.mobile;

  return (
    <motion.article
      variants={animated ? cardVariants : undefined}
      className="group flex items-center gap-3 p-2 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-amber-500/20 hover:bg-zinc-900 transition-all cursor-pointer"
      onClick={canOpen ? () => openPlexLink(item) : undefined}
    >
      <div className="w-10 h-14 sm:w-12 sm:h-[4.5rem] rounded-lg overflow-hidden bg-neutral-800 shrink-0">
        {item?.thumb ? (
          <img src={item.thumb} alt={title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isMovie ? <Film className="w-4 h-4 text-zinc-700" /> : <Tv className="w-4 h-4 text-zinc-700" />}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-white font-semibold text-sm leading-tight truncate">{title}</h3>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mt-0.5">
          <span>{year}</span>
          {duration && (
            <>
              <span className="w-0.5 h-0.5 rounded-full bg-zinc-600" />
              <span>{duration}</span>
            </>
          )}
          {primaryRes && (
            <>
              <span className="w-0.5 h-0.5 rounded-full bg-zinc-600" />
              <span className={`font-semibold ${getResolutionTextColor(primaryRes)}`}>{primaryRes}</span>
            </>
          )}
        </div>
      </div>
      <span className="text-[10px] font-bold text-zinc-600 uppercase shrink-0 hidden sm:block">
        {isMovie ? "PEL" : "SER"}
      </span>
    </motion.article>
  );
}

// --- List card (horizontal row) ---
function ListCard({ item, animated = true }) {
  const title = item?.title || "Sin titulo";
  const year = item?.year ? String(item.year) : "----";
  const isMovie = item?.type === "movie";
  const primaryRes = item?.primaryResolution;
  const duration = formatDuration(item?.durationMs);
  const canOpen = item?.links?.web || item?.links?.mobile;
  const resolutions = Array.isArray(item?.resolutions) ? item.resolutions : [];

  return (
    <motion.article
      variants={animated ? cardVariants : undefined}
      className="group flex items-center gap-4 p-3 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-amber-500/20 hover:bg-zinc-900 transition-all cursor-pointer"
      onClick={canOpen ? () => openPlexLink(item) : undefined}
    >
      <div className="w-14 h-20 sm:w-16 sm:h-24 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
        {item?.thumb ? (
          <img src={item.thumb} alt={title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isMovie ? <Film className="w-5 h-5 text-zinc-700" /> : <Tv className="w-5 h-5 text-zinc-700" />}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-white font-bold text-sm sm:text-base leading-tight truncate">{title}</h3>
        <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
          <span>{year}</span>
          {duration && (
            <>
              <span className="w-0.5 h-0.5 rounded-full bg-zinc-600" />
              <span>{duration}</span>
            </>
          )}
          <span className="w-0.5 h-0.5 rounded-full bg-zinc-600" />
          <span>{isMovie ? "Película" : "Serie"}</span>
        </div>
        {resolutions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {resolutions.slice(0, 5).map((res) => (
              <span key={`${item.id}-${res}`} className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${getResolutionStyle(res)}`}>
                {res}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-[10px] text-zinc-600 text-right shrink-0 hidden sm:block">
        {formatEpoch(item?.addedAt)}
      </div>
    </motion.article>
  );
}

// ================== MAIN COMPONENT ==================

export default function BibliotecaClient() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [resFilter, setResFilter] = useState("all");
  const [sortBy, setSortBy] = useState("added-desc");
  const [groupBy, setGroupBy] = useState("none");
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return "grid";
    return window.localStorage.getItem("showverse:biblioteca:viewMode") || "grid";
  });
  const [imageMode, setImageMode] = useState(() => {
    if (typeof window === "undefined") return "poster";
    return window.localStorage.getItem("showverse:biblioteca:imageMode") || "poster";
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isExpandingDataset, setIsExpandingDataset] = useState(false);
  const [hasExpandedDataset, setHasExpandedDataset] = useState(false);
  const [expansionAttempted, setExpansionAttempted] = useState(false);
  const [localizedBackdropMap, setLocalizedBackdropMap] = useState({
    movie: {},
    tv: {},
  });
  const deferredQuery = useDeferredValue(query);

  // Persist view preferences
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:biblioteca:viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:biblioteca:imageMode", imageMode);
  }, [imageMode]);

  const fetchLibrary = useCallback(async ({
    force = false,
    limit = DEFAULT_FETCH_LIMIT,
    background = false,
    markExpanded = false,
  } = {}) => {
    const hasWindow = typeof window !== "undefined";
    const now = Date.now();
    const safeLimit =
      Number.isFinite(Number(limit)) && Number(limit) > 0
        ? Number(limit)
        : DEFAULT_FETCH_LIMIT;
    const cacheKey = getCacheKey(safeLimit);

    if (!background && safeLimit <= DEFAULT_FETCH_LIMIT) {
      setExpansionAttempted(false);
    }

    if (!force && hasWindow) {
      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.timestamp && now - Number(cached.timestamp) < CACHE_TTL_MS && cached?.payload) {
            setData(cached.payload);
            setError("");
            setLoading(false);
            if (markExpanded || safeLimit > DEFAULT_FETCH_LIMIT || !cached?.payload?.summary?.truncated) {
              setHasExpandedDataset(true);
            }
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    if (force || background) setRefreshing(true);
    else setLoading(true);
    if (background) setIsExpandingDataset(true);

    try {
      const response = await fetch(`/api/plex/library?limit=${safeLimit}`, { cache: "no-store" });
      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.available) {
        throw new Error(json?.message || json?.error || "No se pudo cargar la biblioteca Plex.");
      }

      setData(json);
      setError("");
      if (markExpanded || safeLimit > DEFAULT_FETCH_LIMIT || !json?.summary?.truncated) {
        setHasExpandedDataset(true);
      }

      if (hasWindow) {
        const payload = JSON.stringify({ timestamp: now, payload: json });
        window.sessionStorage.setItem(cacheKey, payload);
        if (safeLimit > DEFAULT_FETCH_LIMIT) {
          window.sessionStorage.setItem(getCacheKey(DEFAULT_FETCH_LIMIT), payload);
        }
      }
    } catch (err) {
      if (!background) {
        setError(err instanceof Error ? err.message : "Error desconocido.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      if (background) setIsExpandingDataset(false);
    }
  }, []);

  useEffect(() => {
    fetchLibrary({ limit: DEFAULT_FETCH_LIMIT });
  }, [fetchLibrary]);

  useEffect(() => {
    if (!data?.summary?.truncated) return;
    if (hasExpandedDataset || isExpandingDataset || expansionAttempted) return;
    setExpansionAttempted(true);
    fetchLibrary({
      limit: EXPANDED_FETCH_LIMIT,
      background: true,
      markExpanded: true,
    });
  }, [data?.summary?.truncated, hasExpandedDataset, isExpandingDataset, expansionAttempted, fetchLibrary]);

  const summary = useMemo(() => data?.summary || {}, [data]);

  const resolutionCounts = useMemo(() => {
    const serverCounts = summary?.resolutionCounts || {};
    if (!summary?.truncated) return serverCounts;

    const base = Array.isArray(data?.items) ? data.items : [];
    if (!base.length) return serverCounts;

    const localCounts = {};
    for (const item of base) {
      const resolutions = Array.isArray(item?.resolutions) ? item.resolutions : [];
      for (const resolution of resolutions) {
        localCounts[resolution] = (localCounts[resolution] || 0) + 1;
      }
    }
    return localCounts;
  }, [summary, data]);

  const availableResolutions = useMemo(() => {
    const ordered = RESOLUTION_ORDER.filter((r) => Number(resolutionCounts[r] || 0) > 0);
    const extras = Object.entries(resolutionCounts)
      .filter(([r, count]) => Number(count) > 0 && !RESOLUTION_ORDER.includes(r))
      .map(([r]) => r)
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

    return [...ordered, ...extras];
  }, [resolutionCounts]);

  useEffect(() => {
    if (resFilter === "all") return;
    if (!availableResolutions.includes(resFilter)) {
      setResFilter("all");
    }
  }, [resFilter, availableResolutions]);

  const resolutionTop = useMemo(() => {
    const entries = Object.entries(resolutionCounts);
    return entries.sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [resolutionCounts]);

  const filteredItems = useMemo(() => {
    const base = Array.isArray(data?.items) ? data.items : [];
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    const filtered = base.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (resFilter !== "all") {
        const resolutions = Array.isArray(item.resolutions) ? item.resolutions : [];
        if (!resolutions.includes(resFilter)) return false;
      }
      if (!normalizedQuery) return true;
      return `${item.title || ""} ${item.sectionTitle || ""}`.toLowerCase().includes(normalizedQuery);
    });

    return filtered.sort((a, b) => {
      if (sortBy === "title-asc") return String(a.title || "").localeCompare(String(b.title || ""), "es", { sensitivity: "base" });
      if (sortBy === "year-desc") return Number(b.year || 0) - Number(a.year || 0);
      if (sortBy === "year-asc") return Number(a.year || 0) - Number(b.year || 0);
      if (sortBy === "added-asc") return Number(a.addedAt || 0) - Number(b.addedAt || 0);
      return Number(b.addedAt || 0) - Number(a.addedAt || 0);
    });
  }, [data, deferredQuery, typeFilter, resFilter, sortBy]);

  const missingBackdropIdsByType = useMemo(() => {
    if (imageMode !== "backdrop") return { movie: [], tv: [] };

    const out = { movie: [], tv: [] };
    const seen = { movie: new Set(), tv: new Set() };

    for (const item of filteredItems) {
      const type = item?.tmdbType === "movie" ? "movie" : item?.tmdbType === "tv" ? "tv" : null;
      if (!type) continue;

      const tmdbId = Number(item?.tmdbId || 0);
      if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;

      const key = String(tmdbId);
      if (localizedBackdropMap[type]?.[key]) continue;
      if (seen[type].has(key)) continue;

      seen[type].add(key);
      out[type].push(tmdbId);

      if (out[type].length >= MAX_LOCALIZED_BACKDROP_IDS_PER_TYPE) {
        if (out.movie.length >= MAX_LOCALIZED_BACKDROP_IDS_PER_TYPE && out.tv.length >= MAX_LOCALIZED_BACKDROP_IDS_PER_TYPE) {
          break;
        }
      }
    }

    return out;
  }, [imageMode, filteredItems, localizedBackdropMap]);

  useEffect(() => {
    if (imageMode !== "backdrop") return;
    const movieIds = missingBackdropIdsByType.movie;
    const tvIds = missingBackdropIdsByType.tv;
    if (!movieIds.length && !tvIds.length) return;

    let aborted = false;

    const loadType = async (type, ids) => {
      if (!ids.length) return null;
      try {
        const response = await fetch("/api/tmdb/localized-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, ids }),
          cache: "force-cache",
        });
        if (!response.ok) return null;
        const json = await response.json().catch(() => null);
        return json?.ok && json?.map && typeof json.map === "object" ? json.map : null;
      } catch {
        return null;
      }
    };

    (async () => {
      const [movieMap, tvMap] = await Promise.all([
        loadType("movie", movieIds),
        loadType("tv", tvIds),
      ]);

      if (aborted) return;
      if (!movieMap && !tvMap) return;

      setLocalizedBackdropMap((prev) => ({
        movie: movieMap ? { ...prev.movie, ...movieMap } : prev.movie,
        tv: tvMap ? { ...prev.tv, ...tvMap } : prev.tv,
      }));
    })();

    return () => {
      aborted = true;
    };
  }, [imageMode, missingBackdropIdsByType]);

  const stats = useMemo(() => ({
    total: summary?.totalItems || 0,
    movies: summary?.moviesCount || 0,
    shows: summary?.showsCount || 0,
  }), [summary]);

  // Grouping logic
  const grouped = useMemo(() => {
    if (groupBy === "none") return null;

    const groups = new Map();

    for (const item of filteredItems) {
      let keys = [];

      if (groupBy === "resolution") {
        const res = item.primaryResolution || "Sin resolución";
        keys = [res];
      } else if (groupBy === "type") {
        keys = [item.type === "movie" ? "Películas" : "Series"];
      } else if (groupBy === "year") {
        keys = [item.year ? String(item.year) : "Sin año"];
      } else if (groupBy === "decade") {
        if (item.year) {
          const dec = Math.floor(item.year / 10) * 10;
          keys = [`${dec}s`];
        } else {
          keys = ["Sin década"];
        }
      } else if (groupBy === "section") {
        keys = [item.sectionTitle || "Sin sección"];
      }

      for (const key of keys) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
    }

    // Sort group keys
    const entries = [...groups.entries()];
    if (groupBy === "resolution") {
      entries.sort((a, b) => {
        const ia = RESOLUTION_ORDER.indexOf(a[0]);
        const ib = RESOLUTION_ORDER.indexOf(b[0]);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
    } else if (groupBy === "year") {
      entries.sort((a, b) => {
        const na = Number.parseInt(b[0]) || 0;
        const nb = Number.parseInt(a[0]) || 0;
        return na - nb;
      });
    } else if (groupBy === "decade") {
      entries.sort((a, b) => {
        const na = Number.parseInt(b[0]) || 0;
        const nb = Number.parseInt(a[0]) || 0;
        return na - nb;
      });
    } else {
      entries.sort((a, b) => b[1].length - a[1].length);
    }

    return entries;
  }, [filteredItems, groupBy]);

  // Labels
  const sortLabels = {
    "added-desc": "Recientes",
    "added-asc": "Antiguos",
    "title-asc": "A-Z",
    "year-desc": "Año ↓",
    "year-asc": "Año ↑",
  };

  const typeLabels = { all: "Todo", movie: "Películas", show: "Series" };

  const groupLabels = {
    none: "Sin agrupar",
    resolution: "Resolución",
    type: "Tipo",
    year: "Año",
    decade: "Década",
    section: "Sección",
  };

  const resLabel = resFilter === "all" ? "Todas" : resFilter;
  const loadedItemsCount = Array.isArray(data?.items) ? data.items.length : 0;
  const shouldAnimateCards = filteredItems.length <= 180;
  const contentMotionProps = shouldAnimateCards
    ? { variants: containerVariants, initial: "hidden", animate: "visible" }
    : { initial: false, animate: false };

  // Grid class based on viewMode
  function getGridClass() {
    if (viewMode === "list") return "flex flex-col gap-2";
    if (viewMode === "compact") return "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2";
    if (imageMode === "backdrop") return "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4";
    return "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4";
  }

  function resolveBackdropSrc(item) {
    const tmdbType = item?.tmdbType === "movie" ? "movie" : item?.tmdbType === "tv" ? "tv" : null;
    const tmdbId = Number(item?.tmdbId || 0);
    if (tmdbType && Number.isFinite(tmdbId) && tmdbId > 0) {
      const localizedPath = localizedBackdropMap[tmdbType]?.[String(tmdbId)] || null;
      const localizedSrc = buildTmdbImage(localizedPath, "w1280");
      if (localizedSrc) return localizedSrc;
    }
    return item?.art || item?.thumb || null;
  }

  function renderCard(item) {
    if (viewMode === "list") return <ListCard key={item.id} item={item} animated={shouldAnimateCards} />;
    if (viewMode === "compact") return <CompactCard key={item.id} item={item} animated={shouldAnimateCards} />;
    if (imageMode === "backdrop") return <BackdropCard key={item.id} item={item} backdropSrc={resolveBackdropSrc(item)} animated={shouldAnimateCards} />;
    return <PosterCard key={item.id} item={item} animated={shouldAnimateCards} />;
  }

  // Filter dropdowns (shared between mobile & desktop)
  function renderTypeDropdown() {
    return (
      <InlineDropdown label="Tipo" valueLabel={typeLabels[typeFilter]} icon={Filter}>
        {({ close }) => (
          <>
            {Object.entries(typeLabels).map(([key, label]) => (
              <DropdownItem key={key} active={typeFilter === key} onClick={() => { setTypeFilter(key); close(); }}>
                {label}
              </DropdownItem>
            ))}
          </>
        )}
      </InlineDropdown>
    );
  }

  function renderResDropdown() {
    return (
      <InlineDropdown label="Resolución" valueLabel={resLabel} icon={MonitorPlay}>
        {({ close }) => (
          <>
            <DropdownItem active={resFilter === "all"} onClick={() => { setResFilter("all"); close(); }}>
              Todas
            </DropdownItem>
            {availableResolutions.map((res) => (
              <DropdownItem key={res} active={resFilter === res} onClick={() => { setResFilter(res); close(); }}>
                {res}
              </DropdownItem>
            ))}
          </>
        )}
      </InlineDropdown>
    );
  }

  function renderSortDropdown() {
    return (
      <InlineDropdown label="Orden" valueLabel={sortLabels[sortBy]} icon={ArrowUpDown}>
        {({ close }) => (
          <>
            {Object.entries(sortLabels).map(([key, label]) => (
              <DropdownItem key={key} active={sortBy === key} onClick={() => { setSortBy(key); close(); }}>
                {label}
              </DropdownItem>
            ))}
          </>
        )}
      </InlineDropdown>
    );
  }

  function renderGroupDropdown() {
    return (
      <InlineDropdown label="Agrupar" valueLabel={groupLabels[groupBy]} icon={Layers3}>
        {({ close }) => (
          <>
            {Object.entries(groupLabels).map(([key, label]) => (
              <DropdownItem key={key} active={groupBy === key} onClick={() => { setGroupBy(key); close(); }}>
                {label}
              </DropdownItem>
            ))}
          </>
        )}
      </InlineDropdown>
    );
  }

  function renderViewToggle() {
    const active = "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20";
    const inactive = "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50";

    return (
      <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center shrink-0">
        <button type="button" onClick={() => setViewMode("list")} className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center ${viewMode === "list" ? active : inactive}`} title="Lista">
          <LayoutList className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setViewMode("compact")} className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center ${viewMode === "compact" ? active : inactive}`} title="Compacta">
          <Grid3x3 className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setViewMode("grid")} className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center ${viewMode === "grid" ? active : inactive}`} title="Grid">
          <LayoutGrid className="w-4 h-4" />
        </button>
      </div>
    );
  }

  function renderImageToggle() {
    const active = "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20";
    const inactive = "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50";

    return (
      <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center shrink-0">
        <button type="button" onClick={() => setImageMode("poster")} className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center ${imageMode === "poster" ? active : inactive}`} title="Poster">
          <PosterGlyph className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setImageMode("backdrop")} className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center ${imageMode === "backdrop" ? active : inactive}`} title="Backdrop">
          <BackdropGlyph className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Render items (flat or grouped)
  function renderContent() {
    if (filteredItems.length === 0) {
      return (
        <motion.div className="py-24 text-center" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
          <FolderKanban className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
          <p className="text-xl font-bold text-white mb-2">Sin resultados</p>
          <p className="text-zinc-500 mb-6">Ajusta los filtros o prueba otra búsqueda.</p>
          {(query || typeFilter !== "all" || resFilter !== "all") && (
            <button type="button" onClick={() => { setQuery(""); setTypeFilter("all"); setResFilter("all"); }} className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl transition-colors text-sm">
              Limpiar filtros
            </button>
          )}
        </motion.div>
      );
    }

    if (grouped) {
      return (
        <div key={`grouped-${viewMode}-${imageMode}`}>
          {grouped.map(([groupTitle, items]) => (
            <div key={groupTitle}>
              <GroupDivider title={groupTitle} count={items.length} total={filteredItems.length} />
              <motion.div key={`group-grid-${groupTitle}-${viewMode}-${imageMode}`} className={getGridClass()} {...contentMotionProps}>
                {items.map((item) => renderCard(item))}
              </motion.div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <motion.div key={`flat-grid-${viewMode}-${imageMode}`} className={getGridClass()} {...contentMotionProps}>
        {filteredItems.map((item) => renderCard(item))}
      </motion.div>
    );
  }

  // ===== LOADING STATE =====
  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  // ===== ERROR STATE =====
  if (error) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <Clapperboard className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">No se pudo cargar Plex</h2>
          <p className="text-zinc-500 mb-6 max-w-md">{error}</p>
          <button
            type="button"
            onClick={() =>
              fetchLibrary({
                force: true,
                limit: hasExpandedDataset ? EXPANDED_FETCH_LIMIT : DEFAULT_FETCH_LIMIT,
              })
            }
            className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-amber-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* ====== HEADER ====== */}
        <motion.header className="mb-10" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px w-12 bg-amber-500" />
                <span className="text-amber-400 font-bold uppercase tracking-widest text-xs">PLEX SERVER</span>
              </div>
              <div className="flex items-center gap-4">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                  Biblioteca<span className="text-amber-500">.</span>
                </h1>
                <motion.button
                  type="button"
                  onClick={() =>
                    fetchLibrary({
                      force: true,
                      limit: hasExpandedDataset ? EXPANDED_FETCH_LIMIT : DEFAULT_FETCH_LIMIT,
                    })
                  }
                  disabled={refreshing}
                  className="p-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full transition disabled:opacity-50"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  whileHover={{ scale: refreshing ? 1 : 1.05 }}
                  whileTap={{ scale: refreshing ? 1 : 0.95 }}
                  title="Actualizar"
                >
                  <RefreshCw className={`w-5 h-5 text-white ${refreshing ? "animate-spin" : ""}`} />
                </motion.button>
              </div>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
                Contenido y resoluciones de tu servidor Plex.
              </p>
            </div>

            <motion.div className="flex gap-3 md:gap-4 w-full lg:w-auto justify-center lg:justify-end" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
              <div className="flex-1 lg:flex-none lg:min-w-[120px] bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="p-1.5 md:p-2 rounded-full bg-white/5 mb-1 text-amber-400"><HardDrive className="w-4 h-4 md:w-5 md:h-5" /></div>
                <div className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">{stats.total}</div>
                <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight">Total</div>
              </div>
              <div className="flex-1 lg:flex-none lg:min-w-[120px] bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="p-1.5 md:p-2 rounded-full bg-white/5 mb-1 text-sky-400"><Film className="w-4 h-4 md:w-5 md:h-5" /></div>
                <div className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">{stats.movies}</div>
                <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight">Películas</div>
              </div>
              <div className="flex-1 lg:flex-none lg:min-w-[120px] bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="p-1.5 md:p-2 rounded-full bg-white/5 mb-1 text-purple-400"><Tv className="w-4 h-4 md:w-5 md:h-5" /></div>
                <div className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">{stats.shows}</div>
                <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight">Series</div>
              </div>
            </motion.div>
          </div>
        </motion.header>

        {/* ====== RESOLUTION OVERVIEW ====== */}
        {resolutionTop.length > 0 && (
          <motion.div className="mb-6" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }}>
            <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-[#0a0a0a] border border-white/[0.08]">
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/[0.03] via-transparent to-transparent opacity-50" />
              <div className="relative px-3 sm:px-6 py-3 sm:py-5">
                <div className="flex items-center gap-2 sm:gap-4 mb-3">
                  <div className="w-1 sm:w-1.5 h-6 sm:h-8 bg-gradient-to-b from-amber-500 to-orange-600 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.3)] shrink-0" />
                  <p className="text-xs sm:text-sm uppercase tracking-wider text-zinc-400 font-bold">Resoluciones Detectadas</p>
                </div>
                <div className="flex flex-wrap gap-2 pl-3 sm:pl-6">
                  {resolutionTop.map(([resolution, count]) => (
                    <span key={resolution} className={`px-2.5 py-1 rounded-full border text-xs font-bold ${getResolutionStyle(resolution)}`}>
                      {resolution} <span className="opacity-60">• {count}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ====== FILTERS ====== */}
        <motion.div
          ref={(el) => {
            if (el && !el.dataset.stickySetup) {
              el.dataset.stickySetup = "true";
              const observer = new IntersectionObserver(
                ([e]) => {
                  const isStuck = e.intersectionRatio < 1;
                  const method = isStuck ? "add" : "remove";
                  el.classList[method]("backdrop-blur-xl", "bg-gradient-to-br", "from-black/60", "via-black/50", "to-black/55");
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
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar..." className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-zinc-600" />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors">
                  <X className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border transition-all ${mobileFiltersOpen ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile: collapsible filters */}
          <AnimatePresence>
            {mobileFiltersOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: "easeInOut" }} className="lg:hidden overflow-visible">
                <div className="space-y-3 pt-1">
                  <div className="flex gap-2">
                    <div className="flex-1">{renderTypeDropdown()}</div>
                    <div className="flex-1">{renderResDropdown()}</div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">{renderSortDropdown()}</div>
                    <div className="flex-1">{renderGroupDropdown()}</div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">{renderViewToggle()}</div>
                    {viewMode === "grid" && <div className="shrink-0">{renderImageToggle()}</div>}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop filters */}
          <div className="hidden lg:flex gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en biblioteca..." className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-zinc-600" />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors">
                  <X className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              )}
            </div>

            {renderTypeDropdown()}
            {renderResDropdown()}
            {renderSortDropdown()}
            {renderGroupDropdown()}
            {renderViewToggle()}
            {viewMode === "grid" && renderImageToggle()}
          </div>
        </motion.div>

        {/* Truncation warning */}
        {summary?.truncated && (
          <div className="mb-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
            {isExpandingDataset
              ? "Cargando más elementos para mejorar filtros y agrupación..."
              : `Mostrando ${loadedItemsCount} de ${summary.totalItems || loadedItemsCount} elementos por límite de respuesta.`}
          </div>
        )}

        {/* ====== CONTENT ====== */}
        {renderContent()}
      </div>
    </div>
  );
}
