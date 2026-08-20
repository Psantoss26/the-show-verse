// /src/app/lists/page.jsx
"use client";

import OptimizedImage from "@/components/OptimizedImage";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useDeferredValue,
  useTransition,
  memo,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode } from "swiper/modules";
import "swiper/swiper-bundle.css";

import useTmdbLists from "@/lib/hooks/useTmdbLists";
import { getListDetails } from "@/lib/api/backendLists";
import { getDetails, getExternalIds } from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { useAuth } from "@/context/AuthContext";
import { formatPageTitle } from "@/lib/pageTitle";
import LiquidButton from "@/components/LiquidButton";
import {
  titleStateKey,
  useViewerTitleStates,
} from "@/components/social/useViewerTitleStates";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import { resolveListItemIndicator } from "@/lib/lists/listItemHoverIndicator";
import { enrichListPreviewArtwork } from "@/lib/lists/previewArtwork";
import { fetchTmdbImages } from "@/lib/tmdb/imageRequests";

import {
  Loader2,
  Plus,
  Trash2,
  ListVideo,
  RefreshCcw,
  Search,
  ArrowUpDown,
  LayoutGrid,
  StretchHorizontal,
  Rows,
  CheckCircle2,
  ChevronDown,
  X,
  Layers,
  SlidersHorizontal,
  Film,
  Tv,
  MonitorPlay,
  Users,
  Heart,
  BookmarkPlus,
  Eye,
} from "lucide-react";
import useTraktLists from "@/lib/hooks/useTraktLists";
import ListPosterCard from "@/components/lists/ListPosterCard";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";

// ================== UTILS & CACHE ==================
const OMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LISTS_SOURCE_CACHE_TTL_MS = 20 * 60 * 1000;
const LIST_PREVIEW_CACHE_TTL_MS = 30 * 60 * 1000;
const imdbRatingsCache = new Map();
const PRELOAD_FIRST_N_LISTS = 3;
const LISTS_MENU_PREFS_KEY = "showverse:lists:menu:v2";
const VALID_SORT_MODES = new Set([
  "items_desc",
  "items_asc",
  "likes_desc",
  "likes_asc",
  "name_asc",
  "name_desc",
]);
const VALID_VIEW_MODES = new Set(["grid", "rows", "list"]);
const VALID_SOURCES = new Set(["personal", "trakt", "collections"]);
const LIST_SOURCE_OPTIONS = [
  { value: "personal", label: "Mis listas", Icon: ListVideo },
  { value: "trakt", label: "Comunidad", Icon: Users },
  { value: "collections", label: "Colecciones", Icon: Layers },
];

const LIST_ROW_ACCENTS = {
  personal: {
    borderColor: "rgba(168, 85, 247, 0.44)",
    shadowColor: "168, 85, 247",
    textClass: "text-purple-400",
  },
  trakt: {
    borderColor: "rgba(168, 85, 247, 0.44)",
    shadowColor: "168, 85, 247",
    textClass: "text-purple-400",
  },
  collections: {
    borderColor: "rgba(234, 179, 8, 0.44)",
    shadowColor: "234, 179, 8",
    textClass: "text-yellow-400",
  },
  default: {
    borderColor: "rgba(168, 85, 247, 0.44)",
    shadowColor: "168, 85, 247",
    textClass: "text-purple-400",
  },
};

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
  } catch {
    // ignore
  }
};

function getListCacheKey(listOrSource, maybeId) {
  if (typeof listOrSource === "object" && listOrSource !== null) {
    return `${listOrSource?.source || "unknown"}:${String(listOrSource?.id || "")}`;
  }
  return `${String(listOrSource || "unknown")}:${String(maybeId || "")}`;
}

function ListsLoaderState({
  message = "Cargando listas...",
  fullscreen = false,
}) {
  return (
    <div
      className={
        fullscreen
          ? "min-h-screen bg-[#101010] flex items-center justify-center"
          : "flex flex-col items-center justify-center py-32"
      }
    >
      <div className="flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
        <span className="text-neutral-500 text-sm font-medium animate-pulse">
          {message}
        </span>
      </div>
    </div>
  );
}

function readListsMenuPrefs() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LISTS_MENU_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      query: typeof parsed?.query === "string" ? parsed.query : "",
      sortMode: VALID_SORT_MODES.has(parsed?.sortMode)
        ? parsed.sortMode
        : "items_desc",
      viewMode: VALID_VIEW_MODES.has(parsed?.viewMode)
        ? parsed.viewMode
        : "rows",
      // Migración silenciosa de las preferencias antiguas: "tmdb" era el
      // nombre histórico de las listas propias, no su proveedor real.
      source: parsed?.source === "tmdb"
        ? "personal"
        : VALID_SOURCES.has(parsed?.source)
          ? parsed.source
          : "trakt",
    };
  } catch {
    return null;
  }
}

function writeListsMenuPrefs(prefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LISTS_MENU_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

function readSessionJsonCache(key, ttlMs) {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const t = Number(parsed?.t || 0);
    if (!t || Date.now() - t > ttlMs) return null;
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

function writeSessionJsonCache(key, data) {
  if (!key || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch {
    // ignore
  }
}

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

/* --- InView: lazy load por proximidad al viewport --- */
const useInView = ({ rootMargin = "320px 0px", threshold = 0.01 } = {}) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { rootMargin, threshold },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin, threshold]);

  return [ref, inView];
};

function TmdbImg({ filePath, size = "w780", alt, className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [filePath]);

  if (!filePath || failed) {
    return (
      <div
        className={`bg-zinc-900 flex items-center justify-center ${className}`}
      >
        <ListVideo className="w-8 h-8 text-zinc-800" />
      </div>
    );
  }

  // Algunas fuentes pueden devolver una URL absoluta ya construida; el resto
  // pasa un path fragment ("/xxxx.jpg") que hay que prefijar.
  const src = /^https?:\/\//i.test(filePath)
    ? filePath
    : `https://image.tmdb.org/t/p/${size}${filePath}`;

  return (
    <OptimizedImage
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onError={() => setFailed(true)}
    />
  );
}

function ListCoverBackdropCollage({ items = [], alt = "" }) {
  const backdrops = [];
  const seen = new Set();
  for (const item of items) {
    const p = item?._listPreviewBackdrop || item?.backdrop_path;
    if (!p || seen.has(p)) continue;
    seen.add(p);
    backdrops.push(p);
    if (backdrops.length >= 4) break;
  }

  if (!backdrops.length) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/50 text-zinc-600 gap-2">
        <ListVideo className="w-10 h-10 opacity-50" />
      </div>
    );
  }

  if (backdrops.length === 1) {
    return (
      <TmdbImg
        filePath={backdrops[0]}
        size="w780"
        alt={alt}
        className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
      />
    );
  }

  if (backdrops.length === 2) {
    return (
      <div className="w-full h-full grid grid-cols-2 gap-0.5">
        <div className="overflow-hidden h-full">
          <TmdbImg
            filePath={backdrops[0]}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
        <div className="overflow-hidden h-full">
          <TmdbImg
            filePath={backdrops[1]}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
      </div>
    );
  }

  if (backdrops.length === 3) {
    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5">
        <div className="row-span-2 overflow-hidden h-full">
          <TmdbImg
            filePath={backdrops[0]}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
        <div className="overflow-hidden w-full h-full">
          <TmdbImg
            filePath={backdrops[1]}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
        <div className="overflow-hidden w-full h-full">
          <TmdbImg
            filePath={backdrops[2]}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5">
      {backdrops.slice(0, 4).map((p, i) => (
        <div
          key={`${p}-${i}`}
          className="overflow-hidden w-full h-full relative"
        >
          <TmdbImg
            filePath={p}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
      ))}
    </div>
  );
}

function ListPreviewPosterStrip({ items = [], alt = "" }) {
  const previewItems = items.slice(0, 5);

  if (!previewItems.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-zinc-700">
        <ListVideo className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-stretch justify-center gap-px bg-black/35 p-0.5">
      {previewItems.map((item, index) => (
        <div
          key={`${item?.media_type || "movie"}:${item?.id || index}`}
          className="min-w-0 flex-1 overflow-hidden rounded-[3px] bg-zinc-950"
        >
          <TmdbImg
            filePath={item?._listPreviewPoster || item?.poster_path}
            size="w154"
            alt={`${alt}: título ${index + 1}`}
            className="h-full w-full object-contain"
          />
        </div>
      ))}
    </div>
  );
}

function Dropdown({ valueLabel, icon: Icon, children, className = "" }) {
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
    <div
      ref={ref}
      className={`relative ${open ? "z-[99999]" : "z-10"} ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-11 min-w-0 w-full inline-flex items-center justify-between gap-3 px-4 rounded-2xl transition text-sm bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10 focus:outline-none"
      >
        <div className="flex items-center gap-2 truncate">
          {Icon && <Icon className="w-4 h-4 text-purple-500" />}
          <span className="font-semibold text-white truncate">
            {valueLabel}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute right-0 top-full z-[99999] mt-2 w-full rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl p-2 shadow-2xl"
          >
            <div className="space-y-1">
              {children({ close: () => setOpen(false) })}
            </div>
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
      className={`w-full px-3 py-2 rounded-xl text-left text-xs sm:text-sm transition flex items-center justify-between ${
        active
          ? "bg-white/10 text-white font-bold"
          : "text-zinc-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="font-medium">{children}</span>
      {active && <CheckCircle2 className="w-4 h-4 text-purple-500" />}
    </button>
  );
}

function ListsSourceSelector({ source, onChange, className = "" }) {
  return (
    <nav
      aria-label="Fuente de listas"
      className={`inline-flex h-11 max-w-full shrink-0 gap-1 overflow-x-auto rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-1 shadow-lg backdrop-blur-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {LIST_SOURCE_OPTIONS.map(({ value, label, Icon }) => {
        const active = source === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={`flex h-full items-center gap-1.5 whitespace-nowrap rounded-xl py-2 text-sm font-bold transition-all ${
              active ? "px-2.5 lg:px-3.5" : "px-2.5"
            } ${
              active
                ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                : "text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {active && (
              <span className="hidden max-w-24 truncate lg:inline lg:max-w-none">
                {label}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function InlineDropdown({ label, valueLabel, icon: Icon, children }) {
  const [open, setOpen] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState(448);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const updateMenuSize = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const availableBelow = window.innerHeight - rect.bottom - 12;
      setMenuMaxHeight(Math.max(64, Math.min(448, availableBelow)));
    };

    updateMenuSize();
    const frame = window.requestAnimationFrame(updateMenuSize);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", updateMenuSize);
    window.addEventListener("scroll", updateMenuSize, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", updateMenuSize);
      window.removeEventListener("scroll", updateMenuSize, true);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className={`relative min-w-0 w-full lg:w-auto lg:shrink ${open ? "z-[99999]" : "z-10"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-11 min-w-0 w-full inline-flex items-center justify-between gap-3 px-4 rounded-2xl transition text-sm lg:min-w-[140px] lg:w-auto lg:max-w-none bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10 focus:outline-none"
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-purple-500" />}
          <span className="text-zinc-500 font-bold text-xs uppercase tracking-wider">
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

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute left-0 top-full z-[100] mt-2 max-h-[min(70vh,28rem)] w-full overflow-y-auto overflow-x-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl p-2 shadow-2xl [scrollbar-color:#3f3f46_transparent]"
            style={{
              maxHeight: `${menuMaxHeight}px`,
              scrollbarWidth: "thin",
              scrollbarGutter: "stable",
              overscrollBehavior: "contain",
            }}
          >
            <div className="space-y-1">
              {children({ close: () => setOpen(false) })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- CREATION MODAL ---
function CreateListModal({ open, onClose, onCreate, creating, error }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-black/80 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h3 className="text-lg font-bold text-white">Nueva Lista</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/5 transition"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">
              Nombre
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-purple-500 outline-none transition focus:ring-1 focus:ring-purple-500/50"
              placeholder="Mi lista de favoritos..."
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">
              Descripción (opcional)
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-purple-500 outline-none transition resize-none h-24 focus:ring-1 focus:ring-purple-500/50"
              placeholder="De qué trata esta lista..."
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-white/5 text-zinc-300 hover:bg-white/10 transition focus:outline-none border border-white/10"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                onCreate(name, desc);
                setName("");
                setDesc("");
              }}
              disabled={creating || !name.trim()}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-gradient-to-br from-purple-500 to-purple-600 text-white hover:from-purple-400 hover:to-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus:outline-none shadow-lg shadow-purple-500/20"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />} Crear
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function formatIndicatorScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function ListItemHoverIndicator({ mediaType, viewerState, tmdbScore, imdbScore }) {
  const indicator = resolveListItemIndicator({
    mediaType,
    favorite: viewerState?.favorite,
    watchlist: viewerState?.watchlist,
    watched: viewerState?.watched,
    plays: viewerState?.plays,
    userRating: viewerState?.rating,
    tmdbRating: tmdbScore,
    imdbRating: imdbScore,
  });
  const itemClassName = "flex h-9 w-10 shrink-0 items-center justify-center";
  const scoreClassName = `${itemClassName} text-xl font-black leading-none tabular-nums`;

  return (
    <div
      className={`pointer-events-none absolute bottom-2 left-1/2 z-20 hidden -translate-x-1/2 translate-y-3 scale-95 items-center overflow-hidden rounded-full px-1.5 opacity-0 ${LIQUID_GLASS_PANEL} text-white shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:flex lg:group-hover:translate-y-0 lg:group-hover:scale-100 lg:group-hover:opacity-100 lg:group-focus-within:translate-y-0 lg:group-focus-within:scale-100 lg:group-focus-within:opacity-100 will-change-transform transform-gpu`}
      aria-hidden="true"
    >
      <span
        className={`${itemClassName} ${
          indicator.leading === "favorite"
            ? "text-red-400"
            : indicator.leading === "watchlist" || indicator.leading === "movie"
              ? "text-sky-400"
              : "text-violet-400"
        }`}
      >
        {indicator.leading === "favorite" ? (
          <Heart className="h-5 w-5 fill-current" />
        ) : indicator.leading === "watchlist" ? (
          <BookmarkPlus className="h-5 w-5 fill-current" />
        ) : indicator.leading === "movie" ? (
          <Film className="h-5 w-5" />
        ) : (
          <MonitorPlay className="h-5 w-5" />
        )}
      </span>

      {indicator.watched?.kind === "count" ? (
        <span className={`${scoreClassName} text-emerald-400`}>
          {indicator.watched.value}
        </span>
      ) : indicator.watched?.kind === "watched" ? (
        <span className={`${itemClassName} text-emerald-400`}>
          <Eye className="h-5 w-5" />
        </span>
      ) : null}

      {indicator.rating ? (
        <span className={`${scoreClassName} text-amber-300`}>
          {formatIndicatorScore(indicator.rating.value)}
        </span>
      ) : null}
      {indicator.tmdbRating ? (
        <span className={`${scoreClassName} text-sky-400`}>
          {Number(indicator.tmdbRating).toFixed(1)}
        </span>
      ) : null}
      {indicator.imdbRating ? (
        <span className={`${scoreClassName} text-amber-300`}>
          {Number(indicator.imdbRating).toFixed(1)}
        </span>
      ) : null}
    </div>
  );
}

const ListItemCard = memo(function ListItemCard({
  item,
  isMobile,
  accent = "trakt",
  viewerState,
}) {
  const initialTmdbScore = Number(item?.vote_average ?? item?.voteAverage);
  const initialImdbScore = Number(item?.imdbRating ?? item?.imdb_rating);
  const [tmdbScore, setTmdbScore] = useState(
    Number.isFinite(initialTmdbScore) && initialTmdbScore > 0
      ? initialTmdbScore
      : null,
  );
  const [imdbScore, setImdbScore] = useState(
    Number.isFinite(initialImdbScore) && initialImdbScore > 0
      ? initialImdbScore
      : null,
  );
  const [imgFailed, setImgFailed] = useState(false);

  const title = item?.title || item?.name || "—";
  const mediaType = item?.media_type || (item?.title ? "movie" : "tv");
  const href = `/details/${mediaType}/${item.id}`;
  const posterPath = item?.poster_path || item?.backdrop_path || null;
  const posterUrl = posterPath
    ? `https://image.tmdb.org/t/p/w342${posterPath}`
    : null;
  const accentStyle = LIST_ROW_ACCENTS[accent] || LIST_ROW_ACCENTS.default;
  const hoverShadow = [
    `0 18px 48px -24px rgba(${accentStyle.shadowColor}, 0.72)`,
    `0 10px 24px -18px rgba(${accentStyle.shadowColor}, 0.58)`,
    "0 16px 30px -24px rgba(0, 0, 0, 0.75)",
  ].join(", ");
  useEffect(() => {
    setImgFailed(false);
  }, [posterPath]);

  useEffect(() => {
    setTmdbScore(
      Number.isFinite(initialTmdbScore) && initialTmdbScore > 0
        ? initialTmdbScore
        : null,
    );
    setImdbScore(
      Number.isFinite(initialImdbScore) && initialImdbScore > 0
        ? initialImdbScore
        : null,
    );
  }, [initialImdbScore, initialTmdbScore, item?.id, mediaType]);

  const prefetchImdb = useCallback(async () => {
    if (!item?.id) return;
    if (viewerState?.favorite || (tmdbScore && imdbScore)) return;
    const key = `${mediaType}:${item.id}`;

    let details = null;
    if (!tmdbScore) {
      try {
        details = await getDetails(mediaType, item.id, {
          appendToResponse: "external_ids",
        });
        const publicScore = Number(details?.vote_average);
        if (Number.isFinite(publicScore) && publicScore > 0) {
          setTmdbScore(publicScore);
        }
      } catch {
        // La ausencia de puntuación pública no bloquea el resto del indicador.
      }
    }

    if (imdbRatingsCache.has(key)) {
      setImdbScore(imdbRatingsCache.get(key));
      return;
    }

    try {
      const ext =
        details?.external_ids || (await getExternalIds(mediaType, item.id));
      const imdbId = ext?.imdb_id || details?.imdb_id || null;
      if (!imdbId) return;

      const cached = readOmdbCache(imdbId);
      if (cached?.imdbRating) {
        setImdbScore(cached.imdbRating);
        imdbRatingsCache.set(key, cached.imdbRating);
        if (cached.fresh) return;
      }

      const omdb = await fetchOmdbByImdb(imdbId);
      const r =
        omdb?.imdbRating && omdb.imdbRating !== "N/A"
          ? Number(omdb.imdbRating)
          : null;
      const safe = Number.isFinite(r) ? r : null;

      if (safe) {
        setImdbScore(safe);
        imdbRatingsCache.set(key, safe);
        writeOmdbCache(imdbId, { imdbRating: safe });
      }
    } catch {
      // ignore
    }
  }, [imdbScore, item?.id, mediaType, tmdbScore, viewerState?.favorite]);

  // En móvil evitamos disparar OMDb por “hover”.
  const prefetchEnabled = !isMobile;

  return (
    <Link
      href={href}
      className="relative z-0 block w-full select-none hover:z-[50] focus:z-[50] focus:outline-none"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onMouseEnter={prefetchEnabled ? prefetchImdb : undefined}
      onFocus={prefetchEnabled ? prefetchImdb : undefined}
    >
      <motion.div
        className="group relative z-0 aspect-[2/3] w-full overflow-hidden rounded-xl bg-neutral-800/80 shadow-lg transform-gpu will-change-transform after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_var(--card-ring-hover)]"
        whileHover={{
          y: -6,
          zIndex: 50,
          boxShadow: hoverShadow,
        }}
        whileTap={{ y: -2 }}
        transition={{ type: "spring", stiffness: 360, damping: 26 }}
        style={{ "--card-ring-hover": accentStyle.borderColor }}
      >
        {posterUrl && !imgFailed ? (
          <OptimizedImage
            src={posterUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover grayscale-[18%] transition-transform duration-500 transform-gpu group-hover:scale-[1.08] group-hover:-translate-y-1 group-hover:grayscale-0"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-zinc-600">
            {mediaType === "movie" ? (
              <Film className="h-8 w-8 opacity-60" />
            ) : (
              <Tv className="h-8 w-8 opacity-60" />
            )}
          </div>
        )}

        <ListItemHoverIndicator
          mediaType={mediaType}
          viewerState={viewerState}
          tmdbScore={tmdbScore}
          imdbScore={imdbScore}
        />
      </motion.div>
    </Link>
  );
});

function sortLists(lists, mode) {
  const arr = [...lists];
  switch (mode) {
    case "name_asc":
      return arr.sort((a, b) => (a?.name || "").localeCompare(b?.name || ""));
    case "name_desc":
      return arr.sort((a, b) => (b?.name || "").localeCompare(a?.name || ""));
    case "items_desc":
      return arr.sort((a, b) => (b?.item_count || 0) - (a?.item_count || 0));
    case "items_asc":
      return arr.sort((a, b) => (a?.item_count || 0) - (b?.item_count || 0));
    case "likes_desc":
      return arr.sort((a, b) => (b?.likes || 0) - (a?.likes || 0));
    case "likes_asc":
      return arr.sort((a, b) => (a?.likes || 0) - (b?.likes || 0));
    default:
      return arr;
  }
}

function getTraktUsername(list) {
  return list?.user?.username || list?.user?.ids?.slug || list?.user || "trakt";
}

function getTraktListKey(list) {
  // Preferimos slug (más estable), si no id
  return list?.ids?.slug || list?.ids?.trakt || list?.id;
}

function buildInternalUrl(list) {
  const src = list?.source;
  if (src === "personal") return `/lists/${list?.id}`;

  if (src === "trakt") {
    // Comunidad: el detalle se sirve por id interno (uuid) desde nuestra BBDD.
    const id = list?.id;
    if (!id) return null;
    return `/lists/community/${encodeURIComponent(String(id))}`;
  }

  // Colecciones: ruta interna a vista detallada
  if (src === "collections") return `/lists/collection/${list?.id}`;

  return null;
}

function buildExternalUrl(list) {
  const src = list?.source;
  if (src === "personal") return null;
  if (src === "trakt") return list?.traktUrl || null;
  if (src === "collections")
    return `https://www.themoviedb.org/collection/${list?.id}`;
  return null;
}

function dedupePreviewItems(items) {
  const seenIdentity = new Set();
  const seenDisplay = new Set();
  const out = [];

  for (const item of Array.isArray(items) ? items : []) {
    const mediaType = item?.media_type || (item?.title ? "movie" : "tv");
    const title = String(item?.title || item?.name || "")
      .trim()
      .toLowerCase();
    const poster = item?.poster_path || item?.backdrop_path || "";
    const identityKey =
      item?.id !== undefined && item?.id !== null
        ? `${mediaType}:${item.id}`
        : `${mediaType}:${title}:${poster}`;
    const displayKey = `${mediaType}:${title || poster}`;

    if (seenIdentity.has(identityKey) || seenDisplay.has(displayKey)) continue;
    seenIdentity.add(identityKey);
    seenDisplay.add(displayKey);
    out.push(item);
  }

  return out;
}

/* ========= fila tipo Dashboard: drag con ratón + 3 completas en móvil ========= */
function ListItemsRow({ items, isMobile, accent = "trakt" }) {
  const swiperRef = useRef(null);
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const { authenticated } = useAuth();
  const viewerItems = useMemo(
    () =>
      (Array.isArray(items) ? items : []).map((item) => ({
        tmdbId: item?.id,
        mediaType:
          item?.media_type === "tv" || (!item?.title && item?.name)
            ? "tv"
            : "movie",
      })),
    [items],
  );
  const viewerStates = useViewerTitleStates(viewerItems, authenticated);

  if (!Array.isArray(items) || items.length === 0) return null;

  const breakpointsRow = {
    0: { slidesPerView: 3, spaceBetween: 12 },
    640: { slidesPerView: 4, spaceBetween: 14 },
    768: { slidesPerView: 5, spaceBetween: 16 },
    1024: { slidesPerView: 6, spaceBetween: 18 },
    1280: { slidesPerView: 7, spaceBetween: 20 },
  };

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
    const target = Math.max((swiper.activeIndex || 0) - 7, 0);
    swiper.slideTo(target);
  };

  const handleNextClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const swiper = swiperRef.current;
    if (!swiper) return;
    const maxIndex = swiper.slides.length - 1;
    const target = Math.min((swiper.activeIndex || 0) + 7, maxIndex);
    swiper.slideTo(target);
  };

  const showPrev = isHoveredRow && canPrev;
  const showNext = isHoveredRow && canNext;

  return (
    <div className="-mx-4 sm:mx-0">
      <div
        className="relative z-0 px-3 hover:z-[40] sm:px-0"
        onMouseEnter={() => setIsHoveredRow(true)}
        onMouseLeave={() => setIsHoveredRow(false)}
      >
        <div
          className="relative z-0"
          style={{ overflowX: "clip", overflowY: "visible" }}
        >
          <Swiper
            slidesPerView={3}
            spaceBetween={12}
            onSwiper={handleSwiper}
            onSlideChange={updateNav}
            onResize={updateNav}
            onReachBeginning={updateNav}
            onReachEnd={updateNav}
            breakpoints={breakpointsRow}
            loop={false}
            watchOverflow
            allowTouchMove
            simulateTouch
            grabCursor={!isMobile}
            threshold={isMobile ? 2 : 5}
            touchRatio={isMobile ? 1.5 : 1}
            preventClicks
            preventClicksPropagation
            touchStartPreventDefault={false}
            freeMode={
              !isMobile
                ? { enabled: true, momentum: true, momentumRatio: 0.5 }
                : false
            }
            modules={[FreeMode]}
            className="relative z-0 !overflow-visible pb-8 pt-7"
          >
            {items.map((item, idx) => {
              const mt = item?.media_type || (item?.title ? "movie" : "tv");
              return (
                <SwiperSlide
                  key={`${mt}-${item?.id}-${idx}`}
                  className="relative !h-auto select-none !overflow-visible !z-0 hover:!z-[50] focus-within:!z-[50]"
                >
                  <ListItemCard
                    item={item}
                    isMobile={isMobile}
                    accent={accent}
                    viewerState={viewerStates[titleStateKey({
                      tmdbId: item?.id,
                      mediaType: mt,
                    })]}
                  />
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
              onClick={handlePrevClick}
              className="absolute inset-y-0 -left-8 z-30 hidden w-7 items-center justify-center text-white/75 transition-colors hover:text-white pointer-events-auto sm:flex xl:-left-10"
              aria-label="Anterior"
            >
              <motion.span
                className="relative text-4xl font-semibold drop-shadow-[0_0_12px_rgba(0,0,0,0.95)]"
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
              onClick={handleNextClick}
              className="absolute inset-y-0 -right-8 z-30 hidden w-7 items-center justify-center text-white/75 transition-colors hover:text-white pointer-events-auto sm:flex xl:-right-10"
              aria-label="Siguiente"
            >
              <motion.span
                className="relative text-4xl font-semibold drop-shadow-[0_0_12px_rgba(0,0,0,0.95)]"
                whileHover={{ x: 4 }}
              >
                ›
              </motion.span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ListItemsRowSkeleton({ isMobile }) {
  const n = isMobile ? 3 : 7;
  return (
    <div className="-mx-4 px-3 pt-7 sm:mx-0 sm:px-0">
      <div className="flex gap-[10px] overflow-hidden">
        {Array.from({ length: n }).map((_, i) => (
          <div
            key={i}
            className="w-[30%] sm:w-[22%] md:w-[18%] lg:w-[14%] aspect-[2/3] shrink-0 rounded-xl bg-zinc-900/40 border border-white/5 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

/** ✅ Wrapper: Link interno si existe, si no anchor externo, si no div */
function ListNavWrapper({ list, className = "", children }) {
  const href = list?.internalUrl || null;
  const ext = list?.externalUrl || null;

  if (href) {
    return (
      <Link href={href} scroll className={className}>
        {children}
      </Link>
    );
  }

  if (ext) {
    return (
      <a href={ext} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return <div className={className}>{children}</div>;
}

// Entrada escalonada de las tarjetas de lista. El retardo se corta a los 0,36s
// para que, en una rejilla de treinta y tantas colecciones, la última no entre
// segundo y medio después de la primera: lo que se busca es que el bloque
// "aterrice", no un desfile.
const LIST_ENTRANCE_STEP = 0.035;
const LIST_ENTRANCE_MAX_DELAY = 0.36;

function ListEntrance({ index = 0, className = "", children }) {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.34,
        delay: Math.min(index * LIST_ENTRANCE_STEP, LIST_ENTRANCE_MAX_DELAY),
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

const GridListCard = memo(function GridListCard({
  list,
  itemsState,
  ensureListItems,
  canUse,
  onDelete,
}) {
  const cacheKey = `${list?.source || "unknown"}:${String(list?.id || "")}`;
  const [ref, inView] = useInView();

  useEffect(() => {
    if (inView) ensureListItems(cacheKey);
  }, [inView, ensureListItems, cacheKey]);

  const isLoading = itemsState == null;
  const items = Array.isArray(itemsState) ? itemsState : [];

  return (
    <div ref={ref}>
      {/* ✅ antes: Link fijo a /lists/:id (rompía Trakt/Colecciones) */}
      <ListNavWrapper list={list} className="group block h-full">
        <div className="h-full bg-zinc-900/40 border border-white/5 rounded-2xl overflow-hidden md:hover:border-white/10 md:hover:bg-zinc-900/60 transition-all flex flex-col relative">
          <div className="aspect-video w-full bg-zinc-950 relative overflow-hidden md:group-hover:opacity-90 transition-opacity">
            {isLoading ? (
              <div className="w-full h-full animate-pulse bg-zinc-900/40" />
            ) : (
              <ListCoverBackdropCollage items={items} alt={list.name} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent opacity-60" />

            <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold text-white border border-white/10 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              {list.item_count} items
            </div>
          </div>

          <div className="p-4 flex flex-col flex-1">
            <div className="flex justify-between items-start gap-2">
              <h3 className="text-lg font-bold text-white leading-tight line-clamp-1 md:group-hover:text-purple-400 transition-colors">
                {list.name}
              </h3>
            </div>
            <p className="text-sm text-zinc-400 mt-1 line-clamp-2 leading-relaxed flex-1">
              {list.description || (
                <span className="italic opacity-50">Sin descripción</span>
              )}
            </p>
          </div>

          {canUse && (
            <button
              onClick={(e) => onDelete(e, list.id)}
              className="absolute top-2 right-2 p-2 bg-black/50 md:hover:bg-red-600/80 text-white/70 md:hover:text-white rounded-full backdrop-blur-md transition-all opacity-0 md:group-hover:opacity-100 focus:opacity-100"
              title="Borrar lista"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </ListNavWrapper>
    </div>
  );
});

const RowListSection = memo(function RowListSection({
  list,
  itemsState,
  ensureListItems,
  isMobile,
}) {
  const cacheKey = `${list?.source || "unknown"}:${String(list?.id || "")}`;
  const [ref, inView] = useInView();

  useEffect(() => {
    if (inView) ensureListItems(cacheKey);
  }, [inView, ensureListItems, cacheKey]);

  const isLoading = itemsState === null;
  const items = Array.isArray(itemsState) ? itemsState : [];
  const hasResolvedItems = itemsState !== undefined;

  return (
    <section ref={ref} className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-white/5 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <ListNavWrapper
              list={list}
              className="group/title min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <h3 className="truncate text-2xl font-black text-white transition-colors group-hover/title:text-purple-400 sm:text-3xl">
                {list.name}
              </h3>
            </ListNavWrapper>

            <span className="shrink-0 inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-bold text-zinc-200">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              {list.item_count} items
            </span>
          </div>

          {list.description && (
            <p className="text-sm text-zinc-500 mt-1 line-clamp-1 max-w-3xl">
              {list.description}
            </p>
          )}
        </div>

      </div>

      {isLoading ? (
        <ListItemsRowSkeleton isMobile={isMobile} />
      ) : items.length > 0 ? (
        <ListItemsRow items={items} isMobile={isMobile} accent={list?.source} />
      ) : hasResolvedItems ? (
        <div className="h-40 flex items-center justify-center bg-zinc-900/20 rounded-2xl border border-dashed border-white/5 text-zinc-600 text-sm">
          Lista vacía
        </div>
      ) : null}
    </section>
  );
});

const ListModeRow = memo(function ListModeRow({
  list,
  itemsState,
  ensureListItems,
  canUse,
  onDelete,
}) {
  const cacheKey = `${list?.source || "unknown"}:${String(list?.id || "")}`;
  const [ref, inView] = useInView();

  useEffect(() => {
    if (inView) ensureListItems(cacheKey);
  }, [inView, ensureListItems, cacheKey]);

  const isLoading = itemsState == null;
  const items = Array.isArray(itemsState) ? itemsState : [];

  return (
    <div ref={ref}>
      {/* ✅ antes: Link fijo a /lists/:id */}
      <ListNavWrapper list={list} className="group block">
        <div className="flex items-center gap-4 p-3 bg-zinc-900/30 border border-white/5 rounded-xl hover:bg-zinc-900/60 hover:border-white/10 transition-all">
          <div className="h-16 w-40 shrink-0 overflow-hidden rounded-lg border border-white/5 bg-zinc-950 sm:w-[13.5rem]">
            {isLoading ? (
              <div className="w-full h-full animate-pulse bg-zinc-900/40" />
            ) : (
              <ListPreviewPosterStrip items={items} alt={list.name} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-white truncate group-hover:text-purple-400 transition-colors">
              {list.name}
            </h3>
            <p className="text-sm text-zinc-400 truncate">
              {list.description || "—"}
            </p>
          </div>

          <div className="flex items-center gap-4 pr-1">
            <div className="text-right hidden sm:block">
              <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider block">
                Items
              </span>
              <span className="text-sm font-bold text-white">
                {list.item_count}
              </span>
            </div>

            {canUse && (
              <button
                onClick={(e) => onDelete(e, list.id)}
                className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                title="Borrar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </ListNavWrapper>
    </div>
  );
});

// ================== MAIN PAGE ==================
export default function ListsPage() {
  const isMobile = useIsMobileLayout(768);
  const [isPending, startTransition] = useTransition();

  const {
    canUse,
    lists,
    loading,
    initialized: personalInitialized,
    error,
    refresh,
    loadMore,
    hasMore,
    create,
    del,
  } = useTmdbLists();
  const { session, account } = useAuth();

  const [authStatus, setAuthStatus] = useState("checking");
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.title = formatPageTitle("Listas");
  }, []);
  const deferredQuery = useDeferredValue(query);
  const [sortMode, setSortMode] = useState("items_desc");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filtersRef = useRef(null);
  const { isSticky: filtersSticky, isPinned: filtersPinned } =
    useStickyToolbarState(filtersRef);
  const [viewMode, setViewMode] = useState("rows"); // ✅ por defecto como “Dashboard”

  // ✅ NUEVO: selector de fuente
  const [source, setSource] = useState("trakt"); // 'personal' | 'trakt' | 'collections'
  const [prefsHydrated, setPrefsHydrated] = useState(false);

  const trakt = useTraktLists({ mode: "popular" });
  const [featuredCollections, setFeaturedCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsResolvedKey, setCollectionsResolvedKey] = useState(null);
  const [searchedCollections, setSearchedCollections] = useState([]);
  const [cachedActiveLists, setCachedActiveLists] = useState([]);

  // Map: `${source}:${id}` -> undefined (no pedido) | null (cargando) | Array(items)
  const [itemsMap, setItemsMap] = useState({});
  const itemsMapRef = useRef(itemsMap);
  const inFlight = useRef(new Set());
  const controllersRef = useRef(new Map()); // cacheKey -> AbortController

  useEffect(() => {
    itemsMapRef.current = itemsMap;
  }, [itemsMap]);

  useEffect(() => {
    const prefs = readListsMenuPrefs();
    if (prefs) {
      setQuery(prefs.query);
      setSortMode(prefs.sortMode);
      setViewMode(prefs.viewMode);
      setSource(prefs.source);
    }
    setPrefsHydrated(true);
  }, []);

  useEffect(() => {
    if (!prefsHydrated) return;
    writeListsMenuPrefs({
      query,
      sortMode,
      viewMode,
      source,
    });
  }, [prefsHydrated, query, sortMode, viewMode, source]);

  // ✅ Auth
  useEffect(() => {
    if (session === undefined) return;
    if (session && account?.id) setAuthStatus("authenticated");
    else setAuthStatus("anonymous");
  }, [session, account]);

  const safePersonalLists = Array.isArray(lists) ? lists : [];
  const collectionsQueryKey =
    source !== "collections"
      ? null
      : deferredQuery.trim()
        ? `search:${deferredQuery.trim().toLowerCase()}`
        : "featured";
  const activeListsCacheKey = useMemo(() => {
    const scope =
      source === "trakt"
        ? "popular"
        : source === "collections"
          ? collectionsQueryKey || "featured"
          : "personal";
    return `showverse:lists:index:${source}:${scope}:v1`;
  }, [source, collectionsQueryKey]);

  useEffect(() => {
    const cached = readSessionJsonCache(
      activeListsCacheKey,
      LISTS_SOURCE_CACHE_TTL_MS,
    );
    setCachedActiveLists(Array.isArray(cached) ? cached : []);
  }, [activeListsCacheKey]);

  // ✅ carga colecciones destacadas cuando toca
  useEffect(() => {
    if (source !== "collections") {
      return;
    }
    if (deferredQuery.trim()) {
      return;
    }
    if (featuredCollections.length > 0) {
      setCollectionsResolvedKey("featured");
      return;
    }

    let alive = true;
    (async () => {
      try {
        setCollectionsLoading(true);
        const res = await fetch("/api/tmdb/collections/featured", {
          cache: "force-cache",
        });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        const cols = Array.isArray(j?.collections) ? j.collections : [];
        setFeaturedCollections(cols);
      } catch {
        if (alive) setFeaturedCollections([]);
      } finally {
        if (alive) {
          setCollectionsResolvedKey("featured");
          setCollectionsLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [source, deferredQuery, featuredCollections.length]);

  // ✅ búsqueda dinámica de colecciones
  useEffect(() => {
    if (source !== "collections" || !deferredQuery.trim()) {
      setSearchedCollections([]);
      return;
    }

    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        setCollectionsLoading(true);
        const res = await fetch(
          `/api/tmdb/collections/search?query=${encodeURIComponent(deferredQuery)}`,
          { signal: controller.signal, cache: "force-cache" },
        );
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        setSearchedCollections(
          Array.isArray(j?.collections) ? j.collections : [],
        );
      } catch (e) {
        if (e?.name !== "AbortError" && alive) {
          setSearchedCollections([]);
        }
      } finally {
        if (alive) {
          setCollectionsResolvedKey(
            `search:${deferredQuery.trim().toLowerCase()}`,
          );
          setCollectionsLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [source, deferredQuery]);

  // ✅ lista activa según fuente
  const fetchedActiveLists = useMemo(() => {
    if (source === "personal") {
      return safePersonalLists.map((l) => ({
        ...l,
        source: "personal",
        internalUrl: buildInternalUrl({ ...l, source: "personal" }),
        externalUrl: null,
      }));
    }

    if (source === "trakt") {
      const arr = Array.isArray(trakt?.lists) ? trakt.lists : [];
      return arr.map((l) => ({
        ...l,
        source: "trakt",
        internalUrl: buildInternalUrl({ ...l, source: "trakt" }),
        externalUrl: buildExternalUrl({ ...l, source: "trakt" }),
      }));
    }

    // Colecciones: usar búsqueda si hay query, sino destacadas
    const cols = deferredQuery.trim()
      ? Array.isArray(searchedCollections)
        ? searchedCollections
        : []
      : Array.isArray(featuredCollections)
        ? featuredCollections
        : [];

    return cols.map((c) => ({
      ...c,
      source: "collections",
      internalUrl: buildInternalUrl({ ...c, source: "collections" }), // null
      externalUrl: buildExternalUrl({ ...c, source: "collections" }),
    }));
  }, [
    source,
    safePersonalLists,
    trakt?.lists,
    featuredCollections,
    searchedCollections,
    deferredQuery,
  ]);

  useEffect(() => {
    if (!Array.isArray(fetchedActiveLists) || fetchedActiveLists.length === 0) {
      return;
    }
    setCachedActiveLists(fetchedActiveLists);
    writeSessionJsonCache(activeListsCacheKey, fetchedActiveLists);
  }, [activeListsCacheKey, fetchedActiveLists]);

  const activeLists = useMemo(
    () =>
      fetchedActiveLists.length > 0
        ? fetchedActiveLists
        : Array.isArray(cachedActiveLists)
          ? cachedActiveLists
          : [],
    [fetchedActiveLists, cachedActiveLists],
  );

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();

    // Para colecciones, si hay búsqueda ya viene filtrado del servidor
    if (source === "collections" && q) {
      return sortLists(activeLists, sortMode);
    }

    // Para las listas propias y de comunidad, filtrar localmente.
    const base = q
      ? activeLists.filter((l) => (l?.name || "").toLowerCase().includes(q))
      : activeLists;
    return sortLists(base, sortMode);
  }, [activeLists, deferredQuery, sortMode, source]);

  const visibleCount = filtered.length;

  const activeListsMap = useMemo(
    () => new Map(activeLists.map((list) => [getListCacheKey(list), list])),
    [activeLists],
  );

  // Al cambiar de fuente abortamos solicitudes en vuelo, pero conservamos caché resuelta.
  useEffect(() => {
    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
    inFlight.current.clear();
  }, [source]);

  const listsTitle =
    source === "personal"
      ? "Mis Listas"
      : source === "trakt"
        ? "Listas de la comunidad"
        : "Colecciones";

  const subtitle =
    source === "personal"
      ? `${safePersonalLists.length} listas creadas`
      : source === "trakt"
        ? `${visibleCount} listas`
        : `${visibleCount} colecciones`;

  // ✅ ensureListItems multi-origen
  const ensureListItems = useCallback(
    async (listLike) => {
      const listObj =
        typeof listLike === "object" && listLike !== null
          ? listLike
          : activeListsMap.get(String(listLike)) ||
            activeListsMap.get(getListCacheKey(source, listLike));
      const listId = String(listObj?.id || "");
      const cacheKey = getListCacheKey(listObj);

      if (!listId) return;

      // ya cargado o cargando
      if (itemsMapRef.current[cacheKey] !== undefined) return;
      if (inFlight.current.has(cacheKey)) return;

      const src = listObj?.source || source;
      // v2 contiene el backdrop inglés/neutro y el póster inglés ya resueltos;
      // no reutilizamos la antigua caché de pósteres para evitar un flash previo.
      const previewCacheKey = `showverse:lists:preview:${cacheKey}:v2`;
      const cachedPreview = readSessionJsonCache(
        previewCacheKey,
        LIST_PREVIEW_CACHE_TTL_MS,
      );

      inFlight.current.add(cacheKey);
      if (Array.isArray(cachedPreview)) {
        setItemsMap((prev) => ({
          ...prev,
          [cacheKey]: cachedPreview,
        }));
      } else {
        setItemsMap((prev) => ({ ...prev, [cacheKey]: null }));
      }

      const ctrl = new AbortController();
      controllersRef.current.set(cacheKey, ctrl);

      const resolveAndStorePreview = async (rawItems) => {
        const deduped = dedupePreviewItems(rawItems);
        const items = await enrichListPreviewArtwork(deduped, {
          resolveImages: fetchTmdbImages,
          limit: 5,
        });
        if (ctrl.signal.aborted) return;
        writeSessionJsonCache(previewCacheKey, items);
        setItemsMap((prev) => ({ ...prev, [cacheKey]: items }));
      };

      try {
        if (src === "personal") {
          const json = await getListDetails({
            listId,
            page: 1,
            language: "es-ES",
            signal: ctrl.signal,
          });
          await resolveAndStorePreview(
            Array.isArray(json?.items) ? json.items : [],
          );
          return;
        }

        if (src === "trakt") {
          // Comunidad: traemos una muestra de items de la lista desde nuestro
          // backend y resolvemos el artwork final antes de pintar la tarjeta.
          const res = await fetch(
            `/api/community/lists/${encodeURIComponent(listId)}?limit=12`,
            { signal: ctrl.signal, cache: "no-store" },
          );
          const j = await res.json().catch(() => ({}));
          await resolveAndStorePreview(
            (Array.isArray(j?.items) ? j.items : [])
              .filter((it) => it?.tmdbId)
              .map((it) => ({
                id: it.tmdbId,
                media_type: it.mediaType === "tv" ? "tv" : "movie",
                poster_path: it.posterPath || null,
                backdrop_path: it.backdropPath || null,
                title: it.title || null,
                name: it.title || null,
              })),
          );
          return;
        }

        // collections
        const res = await fetch(
          `/api/tmdb/collection?id=${encodeURIComponent(listId)}`,
          {
            signal: ctrl.signal,
            cache: "no-store",
          },
        );
        const j = await res.json().catch(() => ({}));
        await resolveAndStorePreview(
          Array.isArray(j?.items) ? j.items : [],
        );
      } catch (e) {
        if (e?.name === "AbortError") {
          // vuelve a “no pedido” para que pueda pedirse después
          setItemsMap((prev) => {
            const next = { ...prev };
            delete next[cacheKey];
            return next;
          });
          return;
        }
        setItemsMap((prev) => ({ ...prev, [cacheKey]: [] }));
      } finally {
        inFlight.current.delete(cacheKey);
        controllersRef.current.delete(cacheKey);
      }
    },
    [activeListsMap, source],
  );

  // ✅ precarga solo las primeras N listas visibles (el resto lo hace InView)
  useEffect(() => {
    const first = filtered.slice(0, PRELOAD_FIRST_N_LISTS);
    for (const l of first) ensureListItems(getListCacheKey(l));
  }, [filtered, ensureListItems]);

  const handleCreate = async (name, desc) => {
    setCreating(true);
    try {
      await create({ name, description: desc });
      setCreateOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e, listId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canUse || source !== "personal") return;
    const ok = window.confirm("¿Seguro que quieres borrar esta lista?");
    if (!ok) return;

    // abort preview si estaba cargando
    const cacheKey = getListCacheKey("personal", listId);
    const ctrl = controllersRef.current.get(cacheKey);
    if (ctrl) ctrl.abort();

    await del(listId);

    // limpia preview cache
    setItemsMap((prev) => {
      const next = { ...prev };
      delete next[cacheKey];
      return next;
    });
  };

  const handleRefresh = () => {
    // aborta todo lo que estuviera volando + limpia previews (evita estados raros)
    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
    inFlight.current.clear();
    setItemsMap({});

    if (source === "personal") refresh();
    else if (source === "trakt") trakt?.refresh?.();
    else {
      // collections: limpiar búsqueda y re-fetch destacadas
      setQuery("");
      setSearchedCollections([]);
      setFeaturedCollections([]);
      setCollectionsLoading(true);
      fetch("/api/tmdb/collections/featured", { cache: "force-cache" })
        .then((r) => r.json().catch(() => ({})))
        .then((j) =>
          setFeaturedCollections(
            Array.isArray(j?.collections) ? j.collections : [],
          ),
        )
        .finally(() => setCollectionsLoading(false));
    }
  };

  const loadingUnified =
    source === "personal"
      ? loading
      : source === "trakt"
        ? trakt?.loading
        : collectionsLoading;

  const sourceInitialized =
    cachedActiveLists.length > 0
      ? true
      : !prefsHydrated
        ? false
        : source === "personal"
          ? !!personalInitialized
          : source === "trakt"
            ? !!trakt?.initialized
            : collectionsResolvedKey === collectionsQueryKey;

  useEffect(() => {
    if (hasCompletedInitialLoad) return;
    if (authStatus === "authenticated" && sourceInitialized) {
      setHasCompletedInitialLoad(true);
    }
  }, [authStatus, sourceInitialized, hasCompletedInitialLoad]);

  // CONTENIDO QUE SE PINTA, que no siempre es el de la fuente seleccionada.
  //
  // Al cambiar de fuente, `filtered` se vacía en el acto —las listas nuevas aún
  // no han llegado— y la rejilla desaparecía entera hasta que la petición
  // terminaba. Medido en Chromium: el documento pasaba de 6195px a 964px durante
  // ~330ms y volvía de golpe con el contenido nuevo ya montado. Eso era el corte:
  // primero un hueco en blanco, luego una aparición instantánea.
  //
  // La solución no es tapar el hueco con un esqueleto —seguirían siendo dos
  // saltos— sino no dejar de pintar: mientras la fuente nueva no está lista se
  // conserva lo último que SÍ lo estuvo, y el relevo ocurre en un solo paso,
  // ya con datos, animado por el <AnimatePresence> de más abajo. El usuario
  // tiene respuesta inmediata igualmente: la pestaña activa y el título cambian
  // al pulsar, y el botón de sincronizar gira mientras carga.
  const [readyContent, setReadyContent] = useState({ source, lists: [] });
  useEffect(() => {
    if (!sourceInitialized) return;
    setReadyContent({ source, lists: filtered });
  }, [source, sourceInitialized, filtered]);

  // Con la fuente ya lista se pinta SIEMPRE lo vivo, para que buscar y ordenar
  // sigan siendo instantáneos dentro de la misma fuente.
  const contentSource = sourceInitialized ? source : readyContent.source;
  const contentLists = sourceInitialized ? filtered : readyContent.lists;

  const errorUnified =
    source === "personal" ? error : source === "trakt" ? trakt?.error : "";

  const loadingMessage =
    authStatus === "checking"
      ? "Preparando listas..."
      : source === "collections"
        ? "Cargando colecciones..."
        : "Cargando listas...";

  const showInitialLoader = false;

  const showContentLoader = false;

  // ✅ readonly: Trakt y Colecciones no crean/borran ni loadMore
  const canEdit = !!canUse && source === "personal";

  if (authStatus === "anonymous" && source === "personal") {
    return (
      <div className="min-h-screen bg-[#101010] text-gray-100 flex items-center justify-center">
        <div className="max-w-md text-center px-4">
          <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg border border-zinc-800">
            <ListVideo className="w-8 h-8 text-zinc-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Mis Listas</h1>
          <p className="text-zinc-400 mb-8">
            Inicia sesión para gestionar tus listas personalizadas.
          </p>
          <Link
            href="/login?next=/lists"
            className="px-8 py-3 bg-white text-black rounded-full font-bold hover:bg-zinc-200 transition"
          >
            Iniciar Sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-purple-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-purple-600/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-purple-700/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-blue-800/25 blur-[120px] sm:blur-[150px]" />
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
                <div className="h-px w-12 bg-purple-500" />
                <span className="text-purple-400 font-bold uppercase tracking-widest text-xs">
                  {source === "collections"
                    ? "SAGAS"
                    : source === "trakt"
                      ? "COMUNIDAD"
                      : "TUS LISTAS"}
                </span>
              </div>
              <div className="flex items-center gap-4 sm:gap-6">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                  {source === "collections"
                    ? "Colecciones"
                    : source === "trakt"
                      ? "Listas de la comunidad"
                      : "Mis Listas"}
                  <span className="text-purple-500">.</span>
                </h1>

                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  className="shrink-0"
                >
                  <LiquidButton
                    onClick={handleRefresh}
                    disabled={loadingUnified}
                    loading={loadingUnified}
                    activeColor="purple"
                    groupId="lists-header-actions"
                    title="Sincronizar listas"
                    className="!h-11 !w-11 !border-0 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent shadow-lg backdrop-blur-md hover:!bg-white/15 sm:!h-12 sm:!w-12"
                  >
                    <RefreshCcw className="h-5 w-5" />
                  </LiquidButton>
                </motion.div>
              </div>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
                {source === "collections"
                  ? "Explora colecciones temáticas de películas."
                  : source === "trakt"
                    ? "Descubre y explora listas populares de la comunidad."
                    : "Gestiona y organiza tus listas personales."}
              </p>
            </div>
          </div>
        </motion.header>

        {/* Filtros Sticky */}
        <motion.div
          ref={filtersRef}
          data-menu-pinned={filtersPinned}
          className="relative sticky top-14 z-[60] space-y-3 mb-6 transition-all duration-300 sm:top-20"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          {/* Mobile: search + toggle */}
          <div className="relative z-10 flex gap-2 lg:hidden">
            <ListsSourceSelector
              source={source}
              onChange={(nextSource) =>
                startTransition(() => setSource(nextSource))
              }
            />
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500 z-10 pointer-events-none" />
              <input
                value={query}
                onChange={(e) =>
                  startTransition(() => setQuery(e.target.value))
                }
                placeholder={
                  source === "collections"
                    ? "Buscar colecciones..."
                    : "Buscar listas..."
                }
                className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
              />
              {query && (
                <button
                  onClick={() => startTransition(() => setQuery(""))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              aria-expanded={mobileFiltersOpen}
              aria-controls="lists-mobile-filters"
              aria-label={
                mobileFiltersOpen ? "Cerrar filtros" : "Abrir filtros"
              }
              className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
                mobileFiltersOpen
                  ? "text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)]"
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
                id="lists-mobile-filters"
                initial={{ height: 0, overflow: "hidden" }}
                animate={{
                  height: "auto",
                  overflow: "hidden",
                  transitionEnd: { overflow: "visible" },
                }}
                exit={{ height: 0, overflow: "hidden" }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className={`z-[80] mt-2 origin-top space-y-2 lg:hidden ${
                  filtersSticky
                    ? "absolute left-0 right-0 top-full"
                    : "relative"
                }`}
              >
                <div className="space-y-3 pt-1">
                  <div
                    data-lists-mobile-order-view="true"
                    className="flex gap-2"
                  >
                    <div className="flex-1">
                      <InlineDropdown
                        label="Ordenar"
                        valueLabel={
                          sortMode.includes("items")
                            ? sortMode === "items_desc"
                              ? "Más items"
                              : "Menos items"
                            : sortMode.includes("likes")
                              ? sortMode === "likes_desc"
                                ? "Más likes"
                                : "Menos likes"
                              : sortMode === "name_asc"
                                ? "A-Z"
                                : "Z-A"
                        }
                        icon={ArrowUpDown}
                      >
                        {({ close }) => (
                          <>
                            <DropdownItem
                              active={sortMode === "items_desc"}
                              onClick={() => {
                                startTransition(() =>
                                  setSortMode("items_desc"),
                                );
                                close();
                              }}
                            >
                              Más items
                            </DropdownItem>
                            <DropdownItem
                              active={sortMode === "items_asc"}
                              onClick={() => {
                                startTransition(() => setSortMode("items_asc"));
                                close();
                              }}
                            >
                              Menos items
                            </DropdownItem>
                            <DropdownItem
                              active={sortMode === "likes_desc"}
                              onClick={() => {
                                startTransition(() =>
                                  setSortMode("likes_desc"),
                                );
                                close();
                              }}
                            >
                              Más likes
                            </DropdownItem>
                            <DropdownItem
                              active={sortMode === "likes_asc"}
                              onClick={() => {
                                startTransition(() => setSortMode("likes_asc"));
                                close();
                              }}
                            >
                              Más likes
                            </DropdownItem>
                            <DropdownItem
                              active={sortMode === "name_asc"}
                              onClick={() => {
                                startTransition(() => setSortMode("name_asc"));
                                close();
                              }}
                            >
                              A-Z
                            </DropdownItem>
                            <DropdownItem
                              active={sortMode === "name_desc"}
                              onClick={() => {
                                startTransition(() => setSortMode("name_desc"));
                                close();
                              }}
                            >
                              Z-A
                            </DropdownItem>
                          </>
                        )}
                      </InlineDropdown>
                    </div>

                    <div
                      data-lists-view-selector="true"
                      className="flex h-11 flex-1 items-center rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-1 shadow-lg backdrop-blur-lg"
                    >
                      <button
                        onClick={() =>
                          startTransition(() => setViewMode("grid"))
                        }
                        className={`flex h-full flex-1 items-center justify-center rounded-lg px-2.5 text-sm font-bold transition-all focus:outline-none ${
                          viewMode === "grid"
                            ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                            : "text-zinc-400 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          startTransition(() => setViewMode("rows"))
                        }
                        className={`flex h-full flex-1 items-center justify-center rounded-lg px-2.5 text-sm font-bold transition-all focus:outline-none ${
                          viewMode === "rows"
                            ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                            : "text-zinc-400 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <Rows className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(() => setViewMode("list"))
                        }
                        className={`flex h-full flex-1 items-center justify-center rounded-lg px-2.5 text-sm font-bold transition-all focus:outline-none ${
                          viewMode === "list"
                            ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                            : "text-zinc-400 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <StretchHorizontal className="h-4 w-4" />
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setCreateOpen(true)}
                          aria-label="Crear lista"
                          title="Crear lista"
                          className="flex h-full flex-1 items-center justify-center rounded-lg px-2.5 text-purple-400 transition-all hover:bg-purple-500/15 hover:text-purple-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-purple-400"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop */}
          <div className="hidden lg:flex gap-3 relative z-10">
            <ListsSourceSelector
              source={source}
              onChange={(nextSource) =>
                startTransition(() => setSource(nextSource))
              }
            />
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500 z-10 pointer-events-none" />
              <input
                value={query}
                onChange={(e) =>
                  startTransition(() => setQuery(e.target.value))
                }
                placeholder={
                  source === "collections"
                    ? "Buscar colecciones..."
                    : "Buscar listas..."
                }
                className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
              />
              {query && (
                <button
                  onClick={() => startTransition(() => setQuery(""))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                </button>
              )}
            </div>

            <InlineDropdown
              label="Ordenar"
              valueLabel={
                sortMode.includes("items")
                  ? sortMode === "items_desc"
                    ? "Más items"
                    : "Menos items"
                  : sortMode.includes("likes")
                    ? sortMode === "likes_desc"
                      ? "Más likes"
                      : "Menos likes"
                    : sortMode === "name_asc"
                      ? "A-Z"
                      : "Z-A"
              }
              icon={ArrowUpDown}
            >
              {({ close }) => (
                <>
                  <DropdownItem
                    active={sortMode === "items_desc"}
                    onClick={() => {
                      startTransition(() => setSortMode("items_desc"));
                      close();
                    }}
                  >
                    Más items
                  </DropdownItem>
                  <DropdownItem
                    active={sortMode === "items_asc"}
                    onClick={() => {
                      startTransition(() => setSortMode("items_asc"));
                      close();
                    }}
                  >
                    Menos items
                  </DropdownItem>
                  <DropdownItem
                    active={sortMode === "likes_desc"}
                    onClick={() => {
                      startTransition(() => setSortMode("likes_desc"));
                      close();
                    }}
                  >
                    Más likes
                  </DropdownItem>
                  <DropdownItem
                    active={sortMode === "likes_asc"}
                    onClick={() => {
                      startTransition(() => setSortMode("likes_asc"));
                      close();
                    }}
                  >
                    Menos likes
                  </DropdownItem>
                  <DropdownItem
                    active={sortMode === "name_asc"}
                    onClick={() => {
                      startTransition(() => setSortMode("name_asc"));
                      close();
                    }}
                  >
                    A-Z
                  </DropdownItem>
                  <DropdownItem
                    active={sortMode === "name_desc"}
                    onClick={() => {
                      startTransition(() => setSortMode("name_desc"));
                      close();
                    }}
                  >
                    Z-A
                  </DropdownItem>
                </>
              )}
            </InlineDropdown>

            <div className="flex rounded-2xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
              <button
                onClick={() => startTransition(() => setViewMode("grid"))}
                className={`h-full px-3 rounded-lg text-sm font-bold transition-all flex items-center gap-2 focus:outline-none ${
                  viewMode === "grid"
                    ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => startTransition(() => setViewMode("rows"))}
                className={`h-full px-3 rounded-lg text-sm font-bold transition-all flex items-center gap-2 focus:outline-none ${
                  viewMode === "rows"
                    ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <Rows className="w-4 h-4" />
              </button>
              <button
                onClick={() => startTransition(() => setViewMode("list"))}
                className={`h-full px-3 rounded-lg text-sm font-bold transition-all flex items-center gap-2 focus:outline-none ${
                  viewMode === "list"
                    ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <StretchHorizontal className="w-4 h-4" />
              </button>
            </div>

            {canEdit && (
              <button
                onClick={() => setCreateOpen(true)}
                className="h-11 px-4 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 text-white font-bold text-sm transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 shrink-0 hover:from-purple-400 hover:to-purple-500 focus:outline-none"
              >
                <Plus className="w-4 h-4" />
                <span>Crear</span>
              </button>
            )}
          </div>
        </motion.div>

        <AnimatePresence>
          {createOpen && canEdit && (
            <CreateListModal
              open={createOpen}
              onClose={() => setCreateOpen(false)}
              onCreate={handleCreate}
              creating={creating}
              error={errorUnified}
            />
          )}
        </AnimatePresence>

        {errorUnified ? (
          <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
            {String(errorUnified)}
          </div>
        ) : null}

        {/* CONTENT
            Relevo entre fuentes. `mode="wait"` encadena salida y entrada en vez
            de superponerlas: con alturas tan distintas entre una rejilla de
            colecciones y una de listas propias, solaparlas obligaría a
            posicionarlas en absoluto y el pie de página daría un salto. La salida
            es corta (0,16s) a propósito, porque el relevo solo se dispara cuando
            los datos nuevos YA están, y la espera no debe notarse.
            La clave es `contentSource`, no `source`: así el bloque no sale de
            escena en cuanto se pulsa la pestaña, sino cuando hay algo con lo que
            sustituirlo. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={contentSource}
            // Marca la fuente que se está pintando de verdad, que durante la
            // carga NO es la seleccionada. Sirve de asidero para comprobar el
            // relevo, igual que `data-lists-view-selector` en la barra.
            data-lists-content={contentSource}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: -8,
              // La transición de salida va DENTRO de `exit`: es la forma que
              // Framer resuelve para el desmontaje (una clave `exit` dentro de
              // `transition` no la aplicaría).
              transition: { duration: 0.16, ease: "easeIn" },
            }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {contentLists.length === 0 ? (
              // Sin resultados solo se anuncia cuando la fuente está resuelta:
              // durante la carga inicial, un "no hay listas" que dura un instante
              // es peor que no decir nada todavía.
              sourceInitialized ? (
                <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/20">
                  <ListVideo className="w-16 h-16 text-neutral-700 mb-4" />
                  <h3 className="text-xl font-bold text-neutral-300">
                    {source === "collections"
                      ? "No hay colecciones"
                      : "No hay listas"}
                  </h3>
                  <p className="text-zinc-500 mt-2">
                    {source === "personal"
                      ? "Crea una nueva lista arriba para empezar."
                      : "Prueba cambiando el modo o el buscador."}
                  </p>
                </div>
              ) : null
            ) : (
              <>
                {viewMode === "grid" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {contentLists.map((l, index) => (
                      <ListEntrance key={`${l.source}-${l.id}`} index={index}>
                        <GridListCard
                          list={l}
                          itemsState={itemsMap[getListCacheKey(l)]}
                          ensureListItems={ensureListItems}
                          canUse={canEdit}
                          onDelete={handleDelete}
                        />
                      </ListEntrance>
                    ))}
                  </div>
                )}

                {viewMode === "rows" && (
                  <div className="space-y-12">
                    {contentLists.map((l, index) => (
                      <ListEntrance key={`${l.source}-${l.id}`} index={index}>
                        <RowListSection
                          list={l}
                          itemsState={itemsMap[getListCacheKey(l)]}
                          ensureListItems={ensureListItems}
                          isMobile={isMobile}
                        />
                      </ListEntrance>
                    ))}
                  </div>
                )}

                {viewMode === "list" && (
                  <div className="flex flex-col gap-3">
                    {contentLists.map((l, index) => (
                      <ListEntrance key={`${l.source}-${l.id}`} index={index}>
                        <ListModeRow
                          list={l}
                          itemsState={itemsMap[getListCacheKey(l)]}
                          ensureListItems={ensureListItems}
                          canUse={canEdit}
                          onDelete={handleDelete}
                        />
                      </ListEntrance>
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Carga adicional de listas propias si el backend la expone. */}
        {source === "personal" && hasMore && !loadingUnified && (
          <div className="flex justify-center pt-8">
            <button
              onClick={loadMore}
              className="px-6 py-3 rounded-xl transition shadow-lg bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-lg text-zinc-200 hover:from-white/15 hover:to-white/10 hover:text-white focus:outline-none font-bold"
            >
              Cargar más listas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
