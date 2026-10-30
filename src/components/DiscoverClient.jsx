"use client";


// /src/components/DiscoverClient.jsx
// Descubrir: misma disposición que Favoritos (fondo de manchas del color de la
// página, cabecera con tres tarjetas, barra fijada con buscador y filtros
// rápidos, modos de vista e imagen). Los filtros avanzados van en una hoja
// (MobileOptionsSheet placement="side"): lateral desde 640px, inferior en
// móvil.

import OptimizedImage from "@/components/OptimizedImage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import { useAuth } from "@/context/AuthContext";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import PageStatCard from "@/components/ui/PageStatCard";
import HoverExpandCard from "@/components/ui/HoverExpandCard";
import MobileOptionsSheet, {
  SheetOption,
  SheetOptionGroup,
  useInOptionsSheet,
} from "@/components/ui/MobileOptionsSheet";
import {
  ImageModeSegmented,
  ImageModeSheetGroup,
} from "@/components/ui/ImageModeSelector";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import usePageToolbarSearchFit from "@/hooks/usePageToolbarSearchFit";
import useCardEntrance from "@/hooks/useCardEntrance";
import FlipReorder from "@/components/ui/FlipReorder";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import { useCardArtworkState } from "@/lib/hooks/useOwnCardPoster";
import useImageLoadReady from "@/lib/hooks/useImageLoadReady";
import { peekListArtwork, requestListArtwork } from "@/lib/tmdb/artworkBatch";
import { loadWatchCounts, userTitleKey } from "@/lib/hooks/useUserTitleStates";
import {
  estimateUserPageColumns,
  estimateUserPageEntranceCount,
} from "@/lib/ui/entranceFill";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";
import {
  SlidersHorizontal,
  Film,
  MonitorPlay,
  RotateCcw,
  ChevronDown,
  X,
  CheckCircle2,
  Search as SearchIcon,
  Calendar,
  Star,
  Clock,
  Filter,
  ArrowUpDown,
  List,
  Grid2X2,
  LayoutGrid,
  Compass,
  Eye,
  Tag,
  Tv,
  ShieldCheck,
  Globe,
  Hash,
  Wallet,
} from "lucide-react";

/* =========================
   Helpers & Hooks
========================= */
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const REGION = "ES";
const LANG = "es-ES";

// LocalStorage keys para persistencia entre sesiones
const STORAGE_KEYS = {
  CONTENT: "discover_content",
  SORT: "discover_sort",
  PROVIDERS: "discover_providers",
  SEEN_MODE: "discover_seen_mode",
  DATE_FROM: "discover_date_from",
  DATE_TO: "discover_date_to",
  GENRES: "discover_genres",
  CERTS: "discover_certs",
  LANG: "discover_lang",
  SCORE_RANGE: "discover_score_range",
  MIN_VOTES: "discover_min_votes",
  RUNTIME_RANGE: "discover_runtime_range",
  KEYWORDS: "discover_keywords",
  KEYWORD_NAMES: "discover_keyword_names",
  IMDB_RANGE: "discover_imdb_range",
  MONETIZATION: "discover_monetization",
  VIEW_MODE: "discover_view_mode",
  IMAGE_MODE: "discover_image_mode",
};
const discoverImdbScores = new Map();
const discoverImdbRequests = new Map();

function getDefaultDiscoverFilters() {
  return {
    content: "movie",
    sortPreset: "pop_desc",
    selectedProviders: [],
    seenMode: "all",
    dateFrom: "",
    dateTo: "",
    selectedGenres: [],
    selectedCerts: [],
    lang: "",
    scoreRange: [0, 10],
    minVotes: 0,
    runtimeRange: [0, 360],
    selectedKeywords: [],
    keywordNames: {},
    imdbRange: [0, 10],
    monetization: [],
  };
}

// Helper para cargar filtros desde localStorage
function loadFiltersFromStorage() {
  const defaults = getDefaultDiscoverFilters();
  if (typeof window === "undefined") return defaults;
  try {
    return {
      content: localStorage.getItem(STORAGE_KEYS.CONTENT) || defaults.content,
      sortPreset:
        localStorage.getItem(STORAGE_KEYS.SORT) || defaults.sortPreset,
      selectedProviders: JSON.parse(
        localStorage.getItem(STORAGE_KEYS.PROVIDERS) ||
          JSON.stringify(defaults.selectedProviders),
      ),
      seenMode:
        localStorage.getItem(STORAGE_KEYS.SEEN_MODE) || defaults.seenMode,
      dateFrom:
        localStorage.getItem(STORAGE_KEYS.DATE_FROM) || defaults.dateFrom,
      dateTo: localStorage.getItem(STORAGE_KEYS.DATE_TO) || defaults.dateTo,
      selectedGenres: JSON.parse(
        localStorage.getItem(STORAGE_KEYS.GENRES) ||
          JSON.stringify(defaults.selectedGenres),
      ),
      selectedCerts: JSON.parse(
        localStorage.getItem(STORAGE_KEYS.CERTS) ||
          JSON.stringify(defaults.selectedCerts),
      ),
      lang: localStorage.getItem(STORAGE_KEYS.LANG) || defaults.lang,
      scoreRange: JSON.parse(
        localStorage.getItem(STORAGE_KEYS.SCORE_RANGE) ||
          JSON.stringify(defaults.scoreRange),
      ),
      minVotes: Number(
        localStorage.getItem(STORAGE_KEYS.MIN_VOTES) ||
          String(defaults.minVotes),
      ),
      runtimeRange: JSON.parse(
        localStorage.getItem(STORAGE_KEYS.RUNTIME_RANGE) ||
          JSON.stringify(defaults.runtimeRange),
      ),
      selectedKeywords: JSON.parse(
        localStorage.getItem(STORAGE_KEYS.KEYWORDS) ||
          JSON.stringify(defaults.selectedKeywords),
      ),
      keywordNames: JSON.parse(
        localStorage.getItem(STORAGE_KEYS.KEYWORD_NAMES) || "{}",
      ),
      imdbRange: JSON.parse(
        localStorage.getItem(STORAGE_KEYS.IMDB_RANGE) ||
          JSON.stringify(defaults.imdbRange),
      ),
      monetization: JSON.parse(
        localStorage.getItem(STORAGE_KEYS.MONETIZATION) ||
          JSON.stringify(defaults.monetization),
      ),
    };
  } catch (e) {
    console.error("Error al cargar filtros desde localStorage:", e);
    return defaults;
  }
}

// Helper para guardar filtros en localStorage
function saveFiltersToStorage(filters) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS.CONTENT, filters.content || "movie");
    localStorage.setItem(STORAGE_KEYS.SORT, filters.sortPreset || "pop_desc");
    localStorage.setItem(
      STORAGE_KEYS.PROVIDERS,
      JSON.stringify(filters.selectedProviders || []),
    );
    localStorage.setItem(STORAGE_KEYS.SEEN_MODE, filters.seenMode || "all");
    localStorage.setItem(STORAGE_KEYS.DATE_FROM, filters.dateFrom || "");
    localStorage.setItem(STORAGE_KEYS.DATE_TO, filters.dateTo || "");
    localStorage.setItem(
      STORAGE_KEYS.GENRES,
      JSON.stringify(filters.selectedGenres || []),
    );
    localStorage.setItem(
      STORAGE_KEYS.CERTS,
      JSON.stringify(filters.selectedCerts || []),
    );
    localStorage.setItem(STORAGE_KEYS.LANG, filters.lang || "");
    localStorage.setItem(
      STORAGE_KEYS.SCORE_RANGE,
      JSON.stringify(filters.scoreRange || [0, 10]),
    );
    localStorage.setItem(STORAGE_KEYS.MIN_VOTES, String(filters.minVotes || 0));
    localStorage.setItem(
      STORAGE_KEYS.RUNTIME_RANGE,
      JSON.stringify(filters.runtimeRange || [0, 360]),
    );
    localStorage.setItem(
      STORAGE_KEYS.KEYWORDS,
      JSON.stringify(filters.selectedKeywords || []),
    );
    localStorage.setItem(
      STORAGE_KEYS.KEYWORD_NAMES,
      JSON.stringify(filters.keywordNames || {}),
    );
    localStorage.setItem(
      STORAGE_KEYS.IMDB_RANGE,
      JSON.stringify(filters.imdbRange || [0, 10]),
    );
    localStorage.setItem(
      STORAGE_KEYS.MONETIZATION,
      JSON.stringify(filters.monetization || []),
    );
  } catch (e) {
    console.error("Error al guardar filtros en localStorage:", e);
  }
}

// Hook Debounce para evitar llamadas excesivas
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function formatDateDMY(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return "";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

async function tmdbFetch(path, params = {}, signal) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) throw new Error("Falta NEXT_PUBLIC_TMDB_API_KEY");

  const usp = new URLSearchParams({
    api_key: apiKey,
    language: LANG,
    ...Object.fromEntries(
      Object.entries(params).filter(
        ([, v]) => v !== undefined && v !== null && v !== "",
      ),
    ),
  });

  const r = await fetch(`${TMDB}${path}?${usp.toString()}`, { signal });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`TMDb error ${r.status}: ${txt || "request failed"}`);
  }
  return r.json();
}

// Imagen de la tarjeta con el criterio de Favoritos y Pendientes:
// 1) la elegida en la ficha (kind `poster` o, en modo backdrop,
//    `cardBackdrop`) y, sin ella, la más votada por todos;
// 2) si no, la escalera de idioma (inglés → español → original → sin idioma)
//    del lote de arte (/api/tmdb/artwork), con el mismo selector de backdrop;
// 3) sin ninguna, la del motor (llega en es-ES).
// Mientras el voto o el lote están en camino no se pinta la del motor: se veía
// un instante y se cambiaba por la buena.
function DiscoverCardImage({ item, type, mode, title }) {
  const wantsBackdrop = mode === "backdrop";
  const { path: ownPath, pending: ownPending } = useCardArtworkState(
    type,
    item.id,
    wantsBackdrop ? "cardBackdrop" : "poster",
  );
  // undefined = lote en camino; null = sin respuesta (se usa la del motor).
  const [ladder, setLadder] = useState(() => peekListArtwork(type, item.id));
  useEffect(() => {
    const peeked = peekListArtwork(type, item.id);
    setLadder(peeked);
    if (peeked !== undefined) return undefined;
    let alive = true;
    requestListArtwork(type, item.id).then((picks) => {
      if (alive) setLadder(picks ?? null);
    });
    return () => {
      alive = false;
    };
  }, [type, item.id]);

  const ladderPath = wantsBackdrop
    ? ladder?.cardBackdrop || ladder?.previewBackdrop
    : ladder?.poster;
  const enginePath = wantsBackdrop
    ? item.backdrop_path || item.poster_path
    : item.poster_path || item.backdrop_path;
  const pending = !ownPath && (ownPending || ladder === undefined);
  const [failedPath, setFailedPath] = useState(null);
  let path = ownPath || (pending ? null : ladderPath || enginePath || null);
  if (path && path === failedPath) path = enginePath !== path ? enginePath : null;
  const src = path ? `${IMG}/${wantsBackdrop ? "w780" : "w500"}${path}` : null;
  const { imgRef, onLoad, ready, instant } = useImageLoadReady(src);

  return (
    <div className="relative h-full w-full bg-zinc-900">
      {!src && !pending ? (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
          <Film className="h-8 w-8 opacity-60" />
        </div>
      ) : null}
      {src ? (
        <OptimizedImage
          ref={imgRef}
          src={src}
          alt={title}
          loading="lazy"
          decoding="async"
          onLoad={onLoad}
          onError={() => setFailedPath(path)}
          className={`absolute inset-0 h-full w-full object-cover ${
            instant ? "" : "transition-opacity duration-300"
          } ${ready ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
    </div>
  );
}

function isAbortError(e) {
  return (
    e?.name === "AbortError" ||
    e?.code === 20 ||
    String(e?.message || "")
      .toLowerCase()
      .includes("aborted")
  );
}

function discoverScoreKey(item) {
  const type = item?.media_type === "tv" ? "tv" : "movie";
  return item?.id == null ? "" : `${type}:${item.id}`;
}

async function fetchDiscoverImdbScore(item) {
  const key = discoverScoreKey(item);
  if (!key) return null;
  if (discoverImdbScores.has(key)) return discoverImdbScores.get(key);
  if (discoverImdbRequests.has(key)) return discoverImdbRequests.get(key);

  const request = fetch("/api/imdb/ratings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [
        {
          key,
          id: item.id,
          mediaType: item.media_type,
          imdbId: item.imdb_id || null,
        },
      ],
    }),
    cache: "no-store",
    priority: "low",
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json().catch(() => null);
      const rating = Number(payload?.items?.[key]?.rating);
      return Number.isFinite(rating) && rating > 0 ? rating : null;
    })
    .catch(() => null)
    .then((rating) => {
      discoverImdbScores.set(key, rating);
      return rating;
    })
    .finally(() => {
      discoverImdbRequests.delete(key);
    });

  discoverImdbRequests.set(key, request);
  return request;
}

// Notas de IMDb de una página entera (filtro de IMDb): una sola petición para
// los que aún no están en la caché.
async function fetchDiscoverImdbScores(list, signal) {
  const missing = list.filter((item) => {
    const key = discoverScoreKey(item);
    return key && !discoverImdbScores.has(key);
  });
  if (missing.length) {
    try {
      const response = await fetch("/api/imdb/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: missing.map((item) => ({
            key: discoverScoreKey(item),
            id: item.id,
            mediaType: item.media_type,
          })),
        }),
        cache: "no-store",
        signal,
      });
      const payload = response.ok ? await response.json().catch(() => null) : null;
      for (const item of missing) {
        const key = discoverScoreKey(item);
        const rating = Number(payload?.items?.[key]?.rating);
        discoverImdbScores.set(
          key,
          Number.isFinite(rating) && rating > 0 ? rating : null,
        );
      }
    } catch (e) {
      if (isAbortError(e)) throw e;
    }
  }
  return list.map((item) => discoverImdbScores.get(discoverScoreKey(item)) ?? null);
}

/* =========================
   UI Components
========================= */

const ORANGE_RING = "rgba(249,115,22,0.95)";

// Dentro de la hoja de filtros (MobileOptionsSheet) el desplegable se pinta
// como un grupo con todas sus opciones a la vista (como en Favoritos).
function InlineDropdown(props) {
  if (useInOptionsSheet()) {
    return (
      <SheetOptionGroup label={props.label} icon={props.icon}>
        {props.children}
      </SheetOptionGroup>
    );
  }
  return <InlineDropdownMenu {...props} />;
}

function InlineDropdownMenu({ label, valueLabel, icon: Icon, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  // Mismo criterio que Favoritos: el menú mide lo que su contenido, nunca
  // menos que su botón ni más que la ventana.
  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuMaxWidth = window.innerWidth - 24;
    const measured = menuRef.current?.offsetWidth || rect.width;
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - Math.min(measured, menuMaxWidth) - 12),
    );
    const availableBelow = window.innerHeight - rect.bottom - 12;
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width: "max-content",
      minWidth: rect.width,
      maxWidth: menuMaxWidth,
      maxHeight: Math.max(64, Math.min(448, availableBelow)),
      zIndex: 1000,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
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
        className="h-11 min-w-0 w-full inline-flex items-center justify-between gap-3 px-4 rounded-2xl transition text-sm sv-page-toolbar-trigger lg:min-w-[140px] lg:w-auto lg:max-w-none bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10"
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-orange-500" />}
          <span className="sv-page-toolbar-label text-zinc-500 font-bold text-xs uppercase tracking-wider">
            {label}:
          </span>
          <span className="sv-page-toolbar-value min-w-0 truncate font-semibold text-white lg:overflow-visible lg:whitespace-nowrap">
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
                className="flex flex-col overflow-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl p-2 shadow-2xl"
                style={menuStyle}
              >
                <div
                  className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-color:#3f3f46_transparent]"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {children({ close: () => setOpen(false) })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

// Dentro de la hoja, cada opción es una píldora.
function DropdownItem({ active, onClick, children }) {
  if (useInOptionsSheet()) {
    return (
      <SheetOption active={active} onClick={onClick}>
        {children}
      </SheetOption>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2 rounded-xl text-left text-sm transition flex items-center justify-between gap-6
        ${active ? "bg-white/10 text-white font-bold" : "text-zinc-300 hover:bg-white/5 hover:text-white"}`}
    >
      <span className="font-medium whitespace-nowrap">{children}</span>
      {active ? (
        <CheckCircle2 className="w-4 h-4 shrink-0 text-orange-500" />
      ) : (
        <span aria-hidden="true" className="w-4 h-4 shrink-0" />
      )}
    </button>
  );
}

function DualRange({
  min,
  max,
  valueMin,
  valueMax,
  onChange,
  step = 1,
  label,
  format = (v) => v,
}) {
  const [a, setA] = useState(valueMin);
  const [b, setB] = useState(valueMax);

  useEffect(() => {
    setA(valueMin);
    setB(valueMax);
  }, [valueMin, valueMax]);

  const minVal = Math.min(a, b);
  const maxVal = Math.max(a, b);
  const minPercent = ((minVal - min) / (max - min)) * 100;
  const maxPercent = ((maxVal - min) / (max - min)) * 100;

  const commit = (valA, valB) => {
    onChange([valA, valB].sort((x, y) => x - y));
  };

  return (
    <div className="group">
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-2 font-bold">
        <span>{label}</span>
        <span className="tabular-nums text-orange-400">
          {format(minVal)} – {format(maxVal)}
        </span>
      </div>
      <div className="relative h-8 w-full px-2 py-1.5 overflow-visible">
        <div className="absolute top-1/2 left-2 right-2 h-1 bg-white/10 rounded-full -translate-y-1/2" />
        <div
          className="absolute top-1/2 h-1 bg-orange-500 rounded-full -translate-y-1/2"
          style={{
            left: `calc(8px + (100% - 16px) * ${minPercent / 100})`,
            width: `calc((100% - 16px) * ${(maxPercent - minPercent) / 100})`,
          }}
        />
        {[
          [a, setA, (v) => commit(v, b)],
          [b, setB, (v) => commit(a, v)],
        ].map(([value, setValue, onCommit], index) => (
          <input
            key={index}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={`${label} ${index === 0 ? "mínimo" : "máximo"}`}
            onChange={(e) => {
              const v = Number(e.target.value);
              setValue(v);
              onCommit(v);
            }}
            className="absolute top-0 left-0 w-full h-full appearance-none bg-transparent pointer-events-none z-20 range-thumb-interactive"
          />
        ))}
      </div>
    </div>
  );
}

function SingleRange({ min, max, value, onChange, step = 1, label, format = (v) => v }) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="group">
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-2 font-bold">
        <span>{label}</span>
        <span className="tabular-nums text-orange-400">{format(value)}</span>
      </div>
      <div className="relative h-8 w-full px-2 py-1.5 overflow-visible">
        <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-1 bg-white/10 rounded-full" />
        <div
          className="absolute h-1 bg-orange-500 rounded-full top-1/2 -translate-y-1/2"
          style={{ left: "8px", width: `calc((100% - 16px) * ${percent / 100})` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute top-0 left-0 w-full h-full appearance-none bg-transparent pointer-events-none z-20 range-thumb-interactive cursor-pointer"
        />
      </div>
    </div>
  );
}

// TMDb no sirve más allá de la página 500.
const TMDB_MAX_PAGES = 500;
// Margen bajo la pantalla que se deja ya cargado (px).
const FILL_AHEAD_PX = 800;
// Tope de páginas de TMDb por tanda (filtros muy estrictos, p. ej. IMDb).
const MAX_PAGES_PER_BATCH = 8;
// Retraso de la entrada de la barra de filtros desde que monta la página.
const TOOLBAR_ENTRANCE_DELAY_MS = 500;
// Tope mientras la tanda no ha encontrado ningún título.
const MAX_PAGES_EMPTY_BATCH = 40;

// Campo de cristal de la hoja (buscadores y fechas).
const SHEET_INPUT =
  "w-full h-10 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 shadow-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 [color-scheme:dark]";

const SORT_OPTIONS = [
  { id: "pop_desc", label: "Popularidad ↓", short: "Popular" },
  { id: "pop_asc", label: "Popularidad ↑", short: "Menos popular" },
  { id: "rating_desc", label: "Mejor valoradas", short: "Mejor" },
  { id: "rating_asc", label: "Peor valoradas", short: "Peor" },
  { id: "date_desc", label: "Más recientes", short: "Reciente" },
  { id: "date_asc", label: "Más antiguas", short: "Antigua" },
];

const CONTENT_OPTIONS = [
  { id: "movie", label: "Películas" },
  { id: "tv", label: "Series" },
  { id: "all", label: "Todo" },
];

const MONETIZATION_OPTIONS = [
  { id: "flatrate", label: "Suscripción" },
  { id: "free", label: "Gratis" },
  { id: "ads", label: "Con anuncios" },
  { id: "rent", label: "Alquiler" },
  { id: "buy", label: "Compra" },
];

const LANGUAGE_OPTIONS = [
  { id: "", label: "Cualquiera" },
  { id: "en", label: "Inglés" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Francés" },
  { id: "it", label: "Italiano" },
  { id: "de", label: "Alemán" },
  { id: "ja", label: "Japonés" },
  { id: "ko", label: "Coreano" },
  { id: "zh", label: "Chino" },
  { id: "pt", label: "Portugués" },
  { id: "hi", label: "Hindi" },
  { id: "da", label: "Danés" },
  { id: "sv", label: "Sueco" },
  { id: "no", label: "Noruego" },
];

// Atajos de fechas de estreno: [desde, hasta] en AAAA-MM-DD.
function getDatePresets() {
  const year = new Date().getFullYear();
  return [
    { id: "this_year", label: "Este año", from: `${year}-01-01`, to: `${year}-12-31` },
    { id: "last_5", label: "Últimos 5 años", from: `${year - 4}-01-01`, to: "" },
    { id: "2010s", label: "Años 2010", from: "2010-01-01", to: "2019-12-31" },
    { id: "2000s", label: "Años 2000", from: "2000-01-01", to: "2009-12-31" },
    { id: "90s", label: "Años 90", from: "1990-01-01", to: "1999-12-31" },
    { id: "classic", label: "Clásicos", from: "", to: "1979-12-31" },
  ];
}

function readStoredMode(key, allowed, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredMode(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage write errors
  }
}

function itemYear(item) {
  return (item?.release_date || item?.first_air_date || "").slice(0, 4);
}

function itemDate(item) {
  return item?.release_date || item?.first_air_date || "";
}

function DiscoverHoverIndicator({ type, tmdbScore, imdbScore, compact = false }) {
  const normalizedTmdbScore = Number(tmdbScore);
  const normalizedImdbScore = Number(imdbScore);
  const hasTmdbScore =
    Number.isFinite(normalizedTmdbScore) && normalizedTmdbScore > 0;
  const hasImdbScore =
    Number.isFinite(normalizedImdbScore) && normalizedImdbScore > 0;
  const itemClassName = compact ? "h-7 w-8" : "h-9 w-10";
  const iconClassName = compact ? "h-4 w-4" : "h-5 w-5";
  const scoreClassName = compact ? "h-7 w-8 text-sm" : "h-9 w-10";

  return (
    <div
      className={`pointer-events-none absolute ${compact ? "bottom-1.5 px-1" : "bottom-2 px-1.5"} left-1/2 z-20 hidden -translate-x-1/2 translate-y-3 scale-95 items-center overflow-hidden rounded-full ${LIQUID_GLASS_PANEL} text-white opacity-0 shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform motion-reduce:transition-none lg:flex lg:group-hover:translate-y-0 lg:group-hover:scale-100 lg:group-hover:opacity-100`}
      aria-hidden="true"
    >
      <span
        className={`flex ${itemClassName} shrink-0 items-center justify-center ${type === "movie" ? "text-sky-400" : "text-violet-400"}`}
      >
        {type === "movie" ? (
          <Film className={iconClassName} />
        ) : (
          <MonitorPlay className={iconClassName} />
        )}
      </span>
      {hasTmdbScore ? (
        <span className={`flex ${scoreClassName} shrink-0 items-center justify-center font-black leading-none tabular-nums text-sky-400`}>
          {normalizedTmdbScore.toFixed(1)}
        </span>
      ) : null}
      {hasImdbScore ? (
        <span className={`flex ${scoreClassName} shrink-0 items-center justify-center font-black leading-none tabular-nums text-amber-300`}>
          {normalizedImdbScore.toFixed(1)}
        </span>
      ) : null}
    </div>
  );
}

function DiscoverCard({
  item,
  viewMode = "grid",
  imageMode = "poster",
  index = 0,
  totalItems = 0,
  animateWithin = 24,
}) {
  const router = useRouter();
  const scoreKey = discoverScoreKey(item);
  const [hoverImdbScore, setImdbScore] = useState(null);
  // El filtro de IMDb deja las notas de toda la página en la caché.
  const imdbScore = hoverImdbScore ?? discoverImdbScores.get(scoreKey) ?? null;
  const type = item.media_type === "tv" ? "tv" : "movie";
  const title = (type === "movie" ? item.title : item.name) || "Sin título";
  const year = itemYear(item);
  const href = `/details/${type}/${item.id}`;
  const previewClick = usePreviewOpen();
  const onPreviewClick = previewClick(item, { mediaType: type });
  const handleCardIntent = useCallback(() => {
    router.prefetch(href);
    void fetchDiscoverImdbScore(item).then(setImdbScore);
  }, [href, item, router]);
  const intentProps = {
    onMouseEnter: handleCardIntent,
    onFocus: handleCardIntent,
    onTouchStart: handleCardIntent,
  };
  // En lista la miniatura es siempre horizontal (como en Favoritos).
  const effectiveImageMode = viewMode === "list" ? "backdrop" : imageMode;
  const aspectRatio =
    effectiveImageMode === "backdrop" ? "aspect-[16/9]" : "aspect-[2/3]";
  const image = (
    <DiscoverCardImage item={item} type={type} mode={effectiveImageMode} title={title} />
  );
  const shellClassName =
    "relative z-0 overflow-visible focus-within:z-[40] hover:z-[50]";
  // La recolocación al cambiar de tipo u orden la anima <FlipReorder> por
  // esta clave, como en Favoritos.
  const flipKey = `${type}-${item.id}`;

  // Entrada como en Favoritos: las que caben en pantalla, escalonadas, UNA vez
  // al montar. La rejilla va con `key` de vista e imagen, así que al cambiar
  // de vista se vuelve a montar y se repite. Al volver atrás, sin entrada.
  const isBackNav = useIsHistoryNavigation();
  const [{ shouldAnimate, animDelay }] = useState(() => ({
    shouldAnimate: !isBackNav && index < Math.max(1, animateWithin),
    animDelay: totalItems > 30 ? Math.min(index * 0.015, 0.25) : index * 0.03,
  }));
  const shellRef = useRef(null);
  useCardEntrance(shellRef, {
    enabled: shouldAnimate,
    delayS: animDelay,
    durationS: viewMode === "list" || viewMode === "compact" ? 0.25 : 0.2,
    fromTransform:
      viewMode === "list" || viewMode === "compact"
        ? "translateY(10px) scale(0.95)"
        : "scale(0.95)",
  });

  if (viewMode === "list") {
    const tmdb = Number(item.vote_average);
    return (
      <div ref={shellRef} className={shellClassName} data-flip-key={flipKey} data-discover-card="">
        <Link
          href={href}
          prefetch={false}
          onClick={onPreviewClick}
          {...intentProps}
          className="relative block bg-zinc-900/30 rounded-xl hover:bg-zinc-900/60 transition-colors group overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(249,115,22,0.95)]"
        >
          <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4">
            <div className="w-[180px] sm:w-[280px] aspect-video rounded-lg overflow-hidden relative shadow-md bg-zinc-900 shrink-0">
              {image}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              <h4 className="text-white font-bold text-base leading-tight truncate transition-colors group-hover:text-orange-300">
                {title}
              </h4>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold leading-tight text-zinc-400 tabular-nums">
                <span className={`inline-flex items-center gap-1 ${type === "movie" ? "text-sky-400" : "text-violet-400"}`}>
                  {type === "movie" ? <Film className="h-3.5 w-3.5" /> : <MonitorPlay className="h-3.5 w-3.5" />}
                  {type === "movie" ? "Película" : "Serie"}
                </span>
                {year && <span>{year}</span>}
                {Number.isFinite(tmdb) && tmdb > 0 ? (
                  <span className="text-sky-400">TMDb {tmdb.toFixed(1)}</span>
                ) : null}
                {imdbScore ? (
                  <span className="text-amber-300">IMDb {Number(imdbScore).toFixed(1)}</span>
                ) : null}
              </div>
              {item.overview ? (
                <p className="max-sm:hidden text-sm leading-snug text-zinc-400 line-clamp-2">
                  {item.overview}
                </p>
              ) : null}
            </div>
          </div>
        </Link>
      </div>
    );
  }

  if (viewMode === "compact") {
    return (
      <div ref={shellRef} className={shellClassName} data-flip-key={flipKey} data-discover-card="">
        <Link href={href} prefetch={false} onClick={onPreviewClick} {...intentProps} className="block">
          <HoverExpandCard
            cellClassName={aspectRatio}
            className="group overflow-hidden rounded-lg bg-zinc-900 shadow-md"
          >
            {image}
            <DiscoverHoverIndicator
              type={type}
              tmdbScore={item.vote_average}
              imdbScore={imdbScore}
              compact
            />
          </HoverExpandCard>
        </Link>
      </div>
    );
  }

  return (
    <div ref={shellRef} className={shellClassName} data-flip-key={flipKey} data-discover-card="">
      <Link href={href} prefetch={false} onClick={onPreviewClick} {...intentProps} className="block">
        <div
          className={`relative ${aspectRatio} group rounded-xl overflow-hidden bg-zinc-900 shadow-md lg:hover:shadow-orange-900/20 transition-shadow duration-300`}
        >
          <div
            className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] transition-shadow duration-300 group-hover:shadow-[inset_0_0_0_2.5px_var(--sv-discover-ring)]"
            style={{ "--sv-discover-ring": ORANGE_RING }}
          />
          {image}
          <DiscoverHoverIndicator
            type={type}
            tmdbScore={item.vote_average}
            imdbScore={imdbScore}
          />
        </div>
      </Link>
    </div>
  );
}

function ProviderIcon({ provider, active, onToggle }) {
  const logo = provider?.logo_path ? `${IMG}/w92${provider.logo_path}` : null;

  return (
    <button
      type="button"
      onClick={onToggle}
      title={provider.provider_name}
      aria-pressed={active ? "true" : "false"}
      className={`relative w-full aspect-square rounded-xl overflow-hidden transition-all duration-200
        ${
          active
            ? "ring-2 ring-orange-500 scale-95 opacity-100"
            : "opacity-60 hover:opacity-100 hover:scale-105 ring-1 ring-white/10"
        }`}
    >
      {logo ? (
        <OptimizedImage
          src={logo}
          alt={provider.provider_name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-white/5 flex items-center justify-center text-[10px] text-zinc-500">
          {provider.provider_name?.slice(0, 2)}
        </div>
      )}
      {active && (
        <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-orange-400 drop-shadow-md" />
        </div>
      )}
    </button>
  );
}

// Botón segmentado de la barra (vista): mismo dibujo que Favoritos en naranja.
function ViewModeSegmented({ value, onChange }) {
  const options = [
    { id: "list", label: "Lista", Icon: List },
    { id: "compact", label: "Compacta", Icon: Grid2X2 },
    { id: "grid", label: "Cuadrícula", Icon: LayoutGrid },
  ];
  return (
    <div
      role="group"
      aria-label="Vista"
      className="flex rounded-2xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg"
    >
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          title={label}
          aria-label={label}
          aria-pressed={value === id}
          className={`px-3 h-full rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
            value === id
              ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20"
              : "text-zinc-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}

/* =========================
   DiscoverClient Main
========================= */
export default function DiscoverClient() {
  const { session, account, hydrated } = useAuth();
  const [filtersReady, setFiltersReady] = useState(false);
  const toolbarSearchFitRef = usePageToolbarSearchFit();
  const filtersRef = useRef(null);
  const { isPinned: filtersPinned } = useStickyToolbarState(filtersRef);

  // --- Vista ---
  const [viewMode, setViewModeState] = useState("grid");
  const [imageMode, setImageModeState] = useState("poster");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
    writeStoredMode(STORAGE_KEYS.VIEW_MODE, mode);
  }, []);
  const setImageMode = useCallback((mode) => {
    setImageModeState(mode);
    writeStoredMode(STORAGE_KEYS.IMAGE_MODE, mode);
  }, []);

  // --- Búsqueda por título ---
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q.trim(), 400);

  // --- State Filters (con defaults SSR-safe; se restauran tras montar) ---
  const [content, setContent] = useState("movie");
  const [sortPreset, setSortPreset] = useState("pop_desc");
  const [providersAll, setProvidersAll] = useState([]);
  const [selectedProviders, setSelectedProviders] = useState([]);
  const [providerQuery, setProviderQuery] = useState("");
  const [monetization, setMonetization] = useState([]);
  const [seenMode, setSeenMode] = useState("all");
  // Títulos vistos ("movie:603", "tv:1399") para «Por ver» / «Vistas»: null
  // hasta que llega el historial.
  const [watchedKeys, setWatchedKeys] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [genresAll, setGenresAll] = useState([]);
  // Catálogo de TMDb (géneros, plataformas, certificaciones) ya recibido una
  // vez: con él las píldoras enseñan los nombres y no «1 plataformas».
  const [metaReady, setMetaReady] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [certsAll, setCertsAll] = useState([]);
  const [selectedCerts, setSelectedCerts] = useState([]);
  const [lang, setLang] = useState("");

  // Sliders States + Debounce
  const [scoreRange, setScoreRange] = useState([0, 10]);
  const [imdbRange, setImdbRange] = useState([0, 10]);
  const [minVotes, setMinVotes] = useState(0);
  const [runtimeRange, setRuntimeRange] = useState([0, 360]);

  const debouncedScoreRange = useDebounce(scoreRange, 500);
  const debouncedImdbRange = useDebounce(imdbRange, 500);
  const debouncedMinVotes = useDebounce(minVotes, 500);
  const debouncedRuntimeRange = useDebounce(runtimeRange, 500);

  const [keywordQuery, setKeywordQuery] = useState("");
  const [keywordOptions, setKeywordOptions] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [keywordNames, setKeywordNames] = useState({});
  const keywordTimer = useRef(null);
  const [items, setItems] = useState([]);
  const [totalResults, setTotalResults] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  // Sube con cada primera tanda (lista nueva por filtros, tipo u orden): es la
  // señal de <FlipReorder> para recolocar las tarjetas que siguen. Las tandas
  // que se añaden al final no la cambian, así no se mide toda la rejilla.
  const [listVersion, setListVersion] = useState(0);
  // Siguiente página de TMDb a pedir, tanda «más» en curso y copia de los
  // títulos para leerlos desde la tanda sin depender del render.
  const nextPageRef = useRef(1);
  const moreAbortRef = useRef(null);
  const itemsRef = useRef(items);
  const sentinelRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const hasSession = hydrated && !!session && !!account?.id;
  const imdbActive = debouncedImdbRange[0] > 0 || debouncedImdbRange[1] < 10;

  // NO SE PIDE NADA HASTA QUE LOS FILTROS ESTÁN ASENTADOS.
  //
  // Los deslizadores van con retardo (useDebounce). Al restaurar los filtros
  // guardados, los valores con retardo seguían 500 ms en los de por defecto:
  // se cargaba la página sin esos filtros, el relleno de pantalla pedía más
  // páginas y, al llegar los valores buenos, todo se sustituía por la página 1
  // filtrada (parpadeo, contenido que desaparece y vuelve a cargarse). Igual
  // con «Por ver» / «Vistas» antes de tener la sesión y los títulos valorados.
  const sameRange = (a, b) => a[0] === b[0] && a[1] === b[1];
  const filtersSettled =
    sameRange(scoreRange, debouncedScoreRange) &&
    sameRange(imdbRange, debouncedImdbRange) &&
    sameRange(runtimeRange, debouncedRuntimeRange) &&
    minVotes === debouncedMinVotes;
  const seenReady =
    seenMode === "all" || (hydrated && (!hasSession || watchedKeys !== null));

  useEffect(() => {
    const savedFilters = loadFiltersFromStorage();
    setContent(savedFilters.content);
    setSortPreset(savedFilters.sortPreset);
    setSelectedProviders(savedFilters.selectedProviders);
    setSeenMode(savedFilters.seenMode);
    setDateFrom(savedFilters.dateFrom);
    setDateTo(savedFilters.dateTo);
    setSelectedGenres(savedFilters.selectedGenres);
    setSelectedCerts(savedFilters.selectedCerts);
    setLang(savedFilters.lang);
    setScoreRange(savedFilters.scoreRange);
    setMinVotes(savedFilters.minVotes);
    setRuntimeRange(savedFilters.runtimeRange);
    setSelectedKeywords(savedFilters.selectedKeywords);
    setKeywordNames(savedFilters.keywordNames);
    setImdbRange(savedFilters.imdbRange);
    setMonetization(savedFilters.monetization);
    setViewModeState(
      readStoredMode(STORAGE_KEYS.VIEW_MODE, ["list", "compact", "grid"], "grid"),
    );
    setImageModeState(
      readStoredMode(STORAGE_KEYS.IMAGE_MODE, ["poster", "backdrop"], "poster"),
    );
    setFiltersReady(true);
  }, []);

  // Guardar filtros en localStorage cuando cambien
  useEffect(() => {
    if (!filtersReady) return;
    saveFiltersToStorage({
      content,
      sortPreset,
      selectedProviders,
      seenMode,
      dateFrom,
      dateTo,
      selectedGenres,
      selectedCerts,
      lang,
      scoreRange,
      minVotes,
      runtimeRange,
      selectedKeywords,
      keywordNames,
      imdbRange,
      monetization,
    });
  }, [
    filtersReady,
    content,
    sortPreset,
    selectedProviders,
    seenMode,
    dateFrom,
    dateTo,
    selectedGenres,
    selectedCerts,
    lang,
    scoreRange,
    minVotes,
    runtimeRange,
    selectedKeywords,
    keywordNames,
    imdbRange,
    monetization,
  ]);

  // Restablece los filtros (no el tipo de contenido ni la búsqueda).
  function resetFilters() {
    setSortPreset("pop_desc");
    setSelectedProviders([]);
    setProviderQuery("");
    setMonetization([]);
    setSeenMode("all");
    setDateFrom("");
    setDateTo("");
    setSelectedGenres([]);
    setSelectedCerts([]);
    setLang("");
    setScoreRange([0, 10]);
    setImdbRange([0, 10]);
    setMinVotes(0);
    setRuntimeRange([0, 360]);
    setKeywordQuery("");
    setKeywordOptions([]);
    setSelectedKeywords([]);
  }

  function sortByFor(type) {
    const isMovie = type === "movie";
    switch (sortPreset) {
      case "pop_asc":
        return "popularity.asc";
      case "rating_desc":
        return "vote_average.desc";
      case "rating_asc":
        return "vote_average.asc";
      case "date_desc":
        return isMovie ? "primary_release_date.desc" : "first_air_date.desc";
      case "date_asc":
        return isMovie ? "primary_release_date.asc" : "first_air_date.asc";
      case "pop_desc":
      default:
        return "popularity.desc";
    }
  }

  // --- Meta Loader ---
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    async function loadMeta() {
      try {
        const [gm, gt, pm, pt, cm, ct] = await Promise.all([
          tmdbFetch("/genre/movie/list", {}, ac.signal),
          tmdbFetch("/genre/tv/list", {}, ac.signal),
          tmdbFetch(
            "/watch/providers/movie",
            { watch_region: REGION },
            ac.signal,
          ),
          tmdbFetch("/watch/providers/tv", { watch_region: REGION }, ac.signal),
          tmdbFetch("/certification/movie/list", {}, ac.signal),
          tmdbFetch("/certification/tv/list", {}, ac.signal),
        ]);
        if (cancelled) return;

        const movieGenres = gm?.genres || [];
        const tvGenres = gt?.genres || [];
        // Orden de TMDb (por relevancia en la región): las grandes primero.
        const byPriority = (a, b) =>
          (a?.display_priorities?.[REGION] ?? a?.display_priority ?? 999) -
          (b?.display_priorities?.[REGION] ?? b?.display_priority ?? 999);
        const movieProviders = (pm?.results || []).sort(byPriority);
        const tvProviders = (pt?.results || []).sort(byPriority);
        const movieCerts = (cm?.certifications?.[REGION] || [])
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((c) => c.certification)
          .filter(Boolean);
        const tvCerts = (ct?.certifications?.[REGION] || [])
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((c) => c.certification)
          .filter(Boolean);

        if (content === "movie") {
          setGenresAll(movieGenres);
          setProvidersAll(movieProviders);
          setCertsAll(movieCerts);
        } else if (content === "tv") {
          setGenresAll(tvGenres);
          setProvidersAll(tvProviders);
          setCertsAll(tvCerts);
        } else {
          const genreMap = new Map();
          [...movieGenres, ...tvGenres].forEach((g) => genreMap.set(g.id, g));
          const provMap = new Map();
          [...movieProviders, ...tvProviders].forEach((p) => {
            if (!provMap.has(p.provider_id)) provMap.set(p.provider_id, p);
          });
          setGenresAll(
            [...genreMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
          );
          setProvidersAll([...provMap.values()].sort(byPriority));
          setCertsAll([...new Set([...movieCerts, ...tvCerts])]);
        }
      } catch (e) {
        if (!isAbortError(e) && !ac.signal.aborted) console.error(e);
      } finally {
        if (!cancelled) setMetaReady(true);
      }
    }
    loadMeta();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [content]);

  // --- Keyword Search ---
  useEffect(() => {
    if (keywordTimer.current) clearTimeout(keywordTimer.current);
    const kq = keywordQuery.trim();
    if (!kq) {
      setKeywordOptions([]);
      return;
    }
    const ac = new AbortController();
    keywordTimer.current = setTimeout(async () => {
      try {
        const data = await tmdbFetch("/search/keyword", { query: kq }, ac.signal);
        setKeywordOptions((data?.results || []).slice(0, 10));
      } catch {}
    }, 280);
    return () => {
      clearTimeout(keywordTimer.current);
      ac.abort();
    };
  }, [keywordQuery]);

  // --- Títulos vistos ---
  // Los mismos visionados que Favoritos, Pendientes y el Historial: todo el
  // historial de Trakt (`loadWatchCounts`). Antes salían de las valoraciones
  // de TMDb (`/account/rated`, como mucho 10 páginas), que en las cuentas
  // Showverse vienen vacías: «Por ver» lo enseñaba todo y «Vistas», nada.
  useEffect(() => {
    if (seenMode === "all" || !hasSession || watchedKeys !== null) return undefined;
    const ac = new AbortController();
    loadWatchCounts(ac.signal)
      .then((counts) => {
        if (!ac.signal.aborted) setWatchedKeys(new Set(counts.keys()));
      })
      .catch((e) => {
        if (!isAbortError(e) && !ac.signal.aborted) setWatchedKeys(new Set());
      });
    return () => ac.abort();
  }, [seenMode, hasSession, watchedKeys]);

  // Otra cuenta: su historial es otro.
  useEffect(() => {
    setWatchedKeys(null);
  }, [account?.id]);

  // --- Params comunes de /discover (con valores debounced) ---
  const discoverParams = useMemo(() => {
    const base = {
      include_adult: "false",
      watch_region: REGION,
    };
    if (selectedProviders.length)
      base.with_watch_providers = selectedProviders.join("|");
    if (monetization.length)
      base.with_watch_monetization_types = monetization.join("|");
    if (selectedGenres.length) base.with_genres = selectedGenres.join(",");
    if (selectedCerts.length) {
      base.certification_country = REGION;
      base.certification = selectedCerts.join("|");
    }
    if (lang) base.with_original_language = lang;

    base["vote_average.gte"] = String(debouncedScoreRange[0]);
    base["vote_average.lte"] = String(debouncedScoreRange[1]);
    if (debouncedMinVotes > 0)
      base["vote_count.gte"] = String(debouncedMinVotes);
    if (debouncedRuntimeRange[0] > 0)
      base["with_runtime.gte"] = String(debouncedRuntimeRange[0]);
    if (debouncedRuntimeRange[1] < 360)
      base["with_runtime.lte"] = String(debouncedRuntimeRange[1]);

    if (selectedKeywords.length)
      base.with_keywords = selectedKeywords.join("|");
    return base;
  }, [
    selectedProviders,
    monetization,
    selectedGenres,
    selectedCerts,
    lang,
    debouncedScoreRange,
    debouncedMinVotes,
    debouncedRuntimeRange,
    selectedKeywords,
  ]);

  // --- Fetch Items ---
  //
  // CARGA EN TANDAS COMPLETAS. Antes se pedía una página de TMDb, se pintaba,
  // se medían las columnas de la rejilla ya pintada (recortando la fila a
  // medias un fotograma después) y se pedía la siguiente al ver la pantalla sin
  // llenar: el contenido aparecía a trozos y la segunda fila se cortaba. Ahora
  // se piden las páginas necesarias para llenar la pantalla (o la tanda
  // siguiente) y se pinta TODO de una vez, ya en filas completas con las
  // columnas calculadas de antemano.
  //
  // Una página de TMDb, con los filtros que se aplican en el cliente (vistas,
  // IMDb y, en la búsqueda por título, los que /search no admite).
  const fetchPage = async (pageNum, signal) => {
    async function fetchDiscoverForType(type) {
      const params = { ...discoverParams, page: pageNum, sort_by: sortByFor(type) };
      // Fechas con la clave de cada tipo (también con «Todo»).
      const dateKey = type === "movie" ? "primary_release_date" : "first_air_date";
      if (dateFrom) params[`${dateKey}.gte`] = dateFrom;
      if (dateTo) params[`${dateKey}.lte`] = dateTo;
      const data = await tmdbFetch(`/discover/${type}`, params, signal);
      return {
        list: (data?.results || []).map((it) => ({ ...it, media_type: type })),
        total: Number(data?.total_results) || 0,
        pages: Number(data?.total_pages) || 0,
      };
    }
    // Búsqueda por título: TMDb no admite filtros en /search, así que se
    // aplican aquí los que se pueden comprobar con el resultado.
    async function fetchSearch() {
      const path =
        content === "movie" ? "/search/movie" : content === "tv" ? "/search/tv" : "/search/multi";
      const data = await tmdbFetch(
        path,
        { query: debouncedQ, page: pageNum, include_adult: "false" },
        signal,
      );
      const list = (data?.results || [])
        .map((it) => ({ ...it, media_type: it.media_type || content }))
        .filter((it) => it.media_type === "movie" || it.media_type === "tv")
        .filter((it) => {
          const genres = it.genre_ids || [];
          if (selectedGenres.some((g) => !genres.includes(g))) return false;
          if (lang && it.original_language !== lang) return false;
          const vote = Number(it.vote_average) || 0;
          if (vote < debouncedScoreRange[0] || vote > debouncedScoreRange[1]) return false;
          if ((Number(it.vote_count) || 0) < debouncedMinVotes) return false;
          const date = itemDate(it);
          if (dateFrom && (!date || date < dateFrom)) return false;
          if (dateTo && (!date || date > dateTo)) return false;
          return true;
        });
      const compare = {
        pop_asc: (a, b) => (a.popularity || 0) - (b.popularity || 0),
        rating_desc: (a, b) => (b.vote_average || 0) - (a.vote_average || 0),
        rating_asc: (a, b) => (a.vote_average || 0) - (b.vote_average || 0),
        date_desc: (a, b) => itemDate(b).localeCompare(itemDate(a)),
        date_asc: (a, b) => itemDate(a).localeCompare(itemDate(b)),
      }[sortPreset];
      if (compare) list.sort(compare);
      return {
        list,
        total: Number(data?.total_results) || 0,
        pages: Number(data?.total_pages) || 0,
      };
    }
    function applySeenFilter(list) {
      if (seenMode === "all" || !hasSession) return list;
      if (!(watchedKeys instanceof Set)) return list;
      return list.filter((it) => {
        const has = watchedKeys.has(userTitleKey(it.media_type, it.id));
        return seenMode === "seen" ? has : !has;
      });
    }
    async function applyImdbFilter(list) {
      if (!imdbActive) return list;
      const scores = await fetchDiscoverImdbScores(list, signal);
      return list.filter((_, index) => {
        const score = scores[index];
        return (
          score != null &&
          score >= debouncedImdbRange[0] &&
          score <= debouncedImdbRange[1]
        );
      });
    }

    let result;
    if (debouncedQ) {
      result = await fetchSearch();
    } else if (content === "movie" || content === "tv") {
      result = await fetchDiscoverForType(content);
    } else {
      const [m, t] = await Promise.all([
        fetchDiscoverForType("movie"),
        fetchDiscoverForType("tv"),
      ]);
      result = {
        total: m.total + t.total,
        pages: Math.max(m.pages, t.pages),
        list: [...m.list, ...t.list].sort(
          (a, b) => (b.popularity || 0) - (a.popularity || 0),
        ),
      };
    }
    return { ...result, list: await applyImdbFilter(applySeenFilter(result.list)) };
  };
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  });
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Páginas seguidas desde `startPage` hasta reunir `target` títulos nuevos
  // (o acabarse). Devuelve la tanda entera para pintarla de una vez.
  const collectBatch = useCallback(async (startPage, existing, target, signal) => {
    const keys = new Set(existing.map((it) => `${it.media_type}-${it.id}`));
    const added = [];
    let total = 0;
    let pages = 0;
    let p = startPage;
    for (;;) {
      const r = await fetchPageRef.current(p, signal);
      total = r.total;
      pages = Math.min(r.pages, TMDB_MAX_PAGES);
      for (const it of r.list) {
        const key = `${it.media_type}-${it.id}`;
        if (keys.has(key)) continue;
        keys.add(key);
        added.push(it);
      }
      // Con filtros que se aplican aquí («Vistas», IMDb) una tanda puede no
      // encontrar nada en sus páginas: sin tarjetas tampoco hay marca del
      // final que pida más, y salía «No se encontraron resultados» aunque
      // hubiera más adelante. Mientras no haya ninguna, se sigue más lejos.
      const pageCap = added.length ? MAX_PAGES_PER_BATCH : MAX_PAGES_EMPTY_BATCH;
      if (added.length >= target || p >= pages || p - startPage + 1 >= pageCap) break;
      p += 1;
    }
    return { added, total, nextPage: p + 1, hasMore: p < pages };
  }, []);

  // Títulos que llenan la pantalla (y dos filas de margen), redondeado a filas
  // completas de la vista actual.
  const batchTarget = useCallback(() => {
    const cols = Math.max(1, estimateUserPageColumns({ viewMode, imageMode }));
    const visible = estimateUserPageEntranceCount({ viewMode, imageMode });
    return Math.ceil(visible / cols) * cols;
  }, [viewMode, imageMode]);
  const batchTargetRef = useRef(batchTarget);
  useEffect(() => {
    batchTargetRef.current = batchTarget;
  }, [batchTarget]);

  // Primera tanda: cada vez que cambian los filtros. Lo anterior sigue a la
  // vista hasta que llega la tanda nueva entera, y se sustituye de golpe.
  useEffect(() => {
    if (!filtersReady || !filtersSettled || !seenReady) return;

    const ac = new AbortController();
    moreAbortRef.current?.abort();
    moreAbortRef.current = null;
    setLoadingMore(false);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const batch = await collectBatch(1, [], batchTargetRef.current(), ac.signal);
        if (ac.signal.aborted) return;
        nextPageRef.current = batch.nextPage;
        setItems(batch.added);
        setListVersion((v) => v + 1);
        setTotalResults(batch.total);
        setHasMore(batch.hasMore);
      } catch (e) {
        if (!isAbortError(e) && !ac.signal.aborted) {
          console.error(e);
          setError(e?.message || "Error cargando.");
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [
    filtersReady,
    filtersSettled,
    seenReady,
    collectBatch,
    content,
    discoverParams,
    sortPreset,
    seenMode,
    hasSession,
    watchedKeys,
    dateFrom,
    dateTo,
    debouncedQ,
    imdbActive,
    debouncedImdbRange,
  ]);

  const providersFiltered = useMemo(() => {
    const pq = providerQuery.trim().toLowerCase();
    if (!pq) return providersAll;
    return providersAll.filter((p) =>
      (p?.provider_name || "").toLowerCase().includes(pq),
    );
  }, [providersAll, providerQuery]);

  const selectedProvidersSet = useMemo(
    () => new Set(selectedProviders),
    [selectedProviders],
  );

  const toggleIn = (setter, value) =>
    setter((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );

  const contentNoun = content === "tv" ? "Series" : content === "all" ? "Títulos" : "Películas";
  const datePresets = useMemo(getDatePresets, []);

  // Filtros avanzados activos, como píldoras que se quitan con un toque (bajo
  // la barra) y para la cifra del botón y de la tarjeta.
  const activeFilters = useMemo(() => {
    const chips = [];
    if (selectedProviders.length) {
      const names = providersAll
        .filter((p) => selectedProvidersSet.has(p.provider_id))
        .map((p) => p.provider_name);
      chips.push({
        key: "providers",
        label: names.length === 1 ? names[0] : `${selectedProviders.length} plataformas`,
        clear: () => setSelectedProviders([]),
      });
    }
    if (monetization.length)
      chips.push({
        key: "monetization",
        label: MONETIZATION_OPTIONS.filter((o) => monetization.includes(o.id))
          .map((o) => o.label)
          .join(" · "),
        clear: () => setMonetization([]),
      });
    if (seenMode !== "all")
      chips.push({
        key: "seen",
        label: seenMode === "seen" ? "Vistas" : "Por ver",
        clear: () => setSeenMode("all"),
      });
    if (dateFrom || dateTo)
      chips.push({
        key: "dates",
        label: dateFrom && dateTo
          ? `${formatDateDMY(dateFrom)} – ${formatDateDMY(dateTo)}`
          : dateFrom
            ? `Desde ${formatDateDMY(dateFrom)}`
            : `Hasta ${formatDateDMY(dateTo)}`,
        clear: () => {
          setDateFrom("");
          setDateTo("");
        },
      });
    if (selectedGenres.length) {
      const names = genresAll
        .filter((g) => selectedGenres.includes(g.id))
        .map((g) => g.name);
      chips.push({
        key: "genres",
        label: names.length ? names.join(" · ") : `${selectedGenres.length} géneros`,
        clear: () => setSelectedGenres([]),
      });
    }
    if (selectedCerts.length)
      chips.push({
        key: "certs",
        label: `Edad: ${selectedCerts.join(" · ")}`,
        clear: () => setSelectedCerts([]),
      });
    if (lang)
      chips.push({
        key: "lang",
        label: LANGUAGE_OPTIONS.find((o) => o.id === lang)?.label || lang,
        clear: () => setLang(""),
      });
    if (scoreRange[0] > 0 || scoreRange[1] < 10)
      chips.push({
        key: "score",
        label: `TMDb ${scoreRange[0]}–${scoreRange[1]}`,
        clear: () => setScoreRange([0, 10]),
      });
    if (imdbRange[0] > 0 || imdbRange[1] < 10)
      chips.push({
        key: "imdb",
        label: `IMDb ${imdbRange[0]}–${imdbRange[1]}`,
        clear: () => setImdbRange([0, 10]),
      });
    if (minVotes > 0)
      chips.push({
        key: "votes",
        label: `≥ ${minVotes.toLocaleString("es-ES")} votos`,
        clear: () => setMinVotes(0),
      });
    if (runtimeRange[0] > 0 || runtimeRange[1] < 360)
      chips.push({
        key: "runtime",
        label: `${runtimeRange[0]}–${runtimeRange[1]} min`,
        clear: () => setRuntimeRange([0, 360]),
      });
    if (selectedKeywords.length)
      chips.push({
        key: "keywords",
        label: selectedKeywords.map((id) => keywordNames[id] || `#${id}`).join(" · "),
        clear: () => setSelectedKeywords([]),
      });
    return chips;
  }, [
    selectedProviders,
    selectedProvidersSet,
    providersAll,
    monetization,
    seenMode,
    dateFrom,
    dateTo,
    selectedGenres,
    genresAll,
    selectedCerts,
    lang,
    scoreRange,
    imdbRange,
    minVotes,
    runtimeRange,
    selectedKeywords,
    keywordNames,
  ]);

  // Filtros que /search no admite: se avisa si hay alguno puesto.
  const ignoredBySearch =
    !!debouncedQ &&
    (selectedProviders.length > 0 ||
      monetization.length > 0 ||
      selectedCerts.length > 0 ||
      runtimeRange[0] > 0 ||
      runtimeRange[1] < 360 ||
      selectedKeywords.length > 0);

  const averageScore = useMemo(() => {
    const scores = items
      .map((it) => Number(it.vote_average))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (!scores.length) return "—";
    return (scores.reduce((sum, v) => sum + v, 0) / scores.length).toFixed(1);
  }, [items]);

  // RELLENO DE PANTALLA
  //
  // Mientras queden páginas solo se pintan filas completas (columnas
  // calculadas, no medidas: así el recorte entra en el mismo render y no se ve
  // una fila que desaparece). Al acercarse el final, otra tanda entera.
  const [columns, setColumns] = useState(0);
  useEffect(() => {
    const update = () => setColumns(estimateUserPageColumns({ viewMode, imageMode }));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [viewMode, imageMode]);

  const visibleItems = useMemo(() => {
    if (!hasMore || columns <= 1) return items;
    return items.slice(0, Math.floor(items.length / columns) * columns);
  }, [items, hasMore, columns]);

  const loadMore = useCallback(async () => {
    if (!filtersReady || !filtersSettled || !seenReady) return;
    if (loading || !hasMore || moreAbortRef.current) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    if (sentinel.getBoundingClientRect().top > window.innerHeight + FILL_AHEAD_PX) return;

    const ac = new AbortController();
    moreAbortRef.current = ac;
    setLoadingMore(true);
    try {
      const existing = itemsRef.current;
      const batch = await collectBatch(
        nextPageRef.current,
        existing,
        batchTargetRef.current(),
        ac.signal,
      );
      if (ac.signal.aborted) return;
      nextPageRef.current = batch.nextPage;
      setItems([...existing, ...batch.added]);
      setHasMore(batch.hasMore);
    } catch (e) {
      if (!isAbortError(e) && !ac.signal.aborted) console.error(e);
    } finally {
      if (moreAbortRef.current === ac) {
        moreAbortRef.current = null;
        setLoadingMore(false);
      }
    }
  }, [filtersReady, filtersSettled, seenReady, loading, hasMore, collectBatch]);

  // Tras cada tanda (o cambio de vista) y al desplazarse o cambiar el tamaño.
  useEffect(() => {
    loadMore();
    window.addEventListener("scroll", loadMore, { passive: true });
    window.addEventListener("resize", loadMore);
    return () => {
      window.removeEventListener("scroll", loadMore);
      window.removeEventListener("resize", loadMore);
    };
  }, [loadMore, loadingMore, visibleItems.length]);

  const entranceVisibleCount = estimateUserPageEntranceCount({ viewMode, imageMode });

  const statsLoading = !filtersReady || (loading && totalResults == null);

  // La barra y las píldoras de filtros entran JUNTAS y ya en su estado final:
  // con los filtros guardados restaurados y, si hay plataformas o géneros,
  // con sus nombres. Antes las píldoras salían de golpe antes que la barra
  // (que entra con fundido) y con etiquetas provisionales que luego cambiaban.
  // Entran a los 0,5 s de montar; si el catálogo tarda más, en cuanto llega.
  // Las tarjetas tampoco se montan antes (su entrada va con la barra).
  const toolbarReady =
    filtersReady &&
    (metaReady || (selectedProviders.length === 0 && selectedGenres.length === 0));
  const mountedAtRef = useRef(0);
  useEffect(() => {
    mountedAtRef.current = performance.now();
  }, []);
  const [toolbarShown, setToolbarShown] = useState(false);
  useEffect(() => {
    if (!toolbarReady || toolbarShown) return undefined;
    const elapsedMs = performance.now() - mountedAtRef.current;
    const timer = setTimeout(
      () => setToolbarShown(true),
      Math.max(0, TOOLBAR_ENTRANCE_DELAY_MS - elapsedMs),
    );
    return () => clearTimeout(timer);
  }, [toolbarReady, toolbarShown]);
  const toolbarMotion = {
    initial: { opacity: 0 },
    animate: { opacity: toolbarShown ? 1 : 0 },
    transition: { duration: 0.4 },
  };
  const sortLabel = SORT_OPTIONS.find((o) => o.id === sortPreset)?.label || SORT_OPTIONS[0].label;
  const contentLabel = CONTENT_OPTIONS.find((o) => o.id === content)?.label || "Películas";

  const gridClassName = (() => {
    if (viewMode === "list") return "grid grid-cols-1 xl:grid-cols-2 gap-4";
    if (viewMode === "compact") {
      return `grid gap-2 ${
        imageMode === "backdrop"
          ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
          : "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8"
      }`;
    }
    return `grid gap-3 ${
      imageMode === "backdrop"
        ? "grid-cols-2 md:grid-cols-3"
        : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
    }`;
  })();

  const contentDropdown = (
    <InlineDropdown label="Tipo" valueLabel={contentLabel} icon={Filter}>
      {({ close }) =>
        CONTENT_OPTIONS.map((opt) => (
          <DropdownItem
            key={opt.id}
            active={content === opt.id}
            onClick={() => {
              setContent(opt.id);
              close();
            }}
          >
            {opt.label}
          </DropdownItem>
        ))
      }
    </InlineDropdown>
  );

  const sortDropdown = (
    <InlineDropdown label="Ordenar" valueLabel={sortLabel} icon={ArrowUpDown}>
      {({ close }) =>
        SORT_OPTIONS.map((opt) => (
          <DropdownItem
            key={opt.id}
            active={sortPreset === opt.id}
            onClick={() => {
              setSortPreset(opt.id);
              close();
            }}
          >
            {opt.label}
          </DropdownItem>
        ))
      }
    </InlineDropdown>
  );

  const searchInput = (placeholder) => (
    <>
      <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500 z-10 pointer-events-none" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar por título"
        className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ("")}
          aria-label="Borrar búsqueda"
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-md transition-colors"
        >
          <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
        </button>
      )}
    </>
  );

  const filterCountBadge = activeFilters.length ? (
    <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 pt-px text-[11px] font-black leading-none text-black tabular-nums">
      {activeFilters.length}
    </span>
  ) : null;

  // --- Render ---
  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-orange-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Manchas abstractas naranjas y negras (como las rojas de Favoritos) */}
        <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-orange-500/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-orange-600/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-orange-800/25 blur-[120px] sm:blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header */}
        <motion.header
          className="mb-6 sm:mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px w-12 bg-orange-500" />
                <span className="text-orange-400 font-bold uppercase tracking-widest text-xs">
                  EXPLORAR
                </span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                Descubrir<span className="text-orange-500">.</span>
              </h1>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
                Filtra y busca películas o series con criterios avanzados.
              </p>
            </div>

            <motion.div
              className="flex gap-2 md:gap-4 w-full lg:w-auto justify-center lg:justify-end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {[
                {
                  label: "Resultados",
                  value: totalResults == null ? "—" : totalResults.toLocaleString("es-ES"),
                  icon: Compass,
                  colorClass: "text-orange-400",
                },
                {
                  label: "Filtros activos",
                  shortLabel: "Filtros",
                  value: activeFilters.length,
                  icon: SlidersHorizontal,
                  colorClass: "text-sky-400",
                },
                {
                  label: "Nota media",
                  shortLabel: "Nota",
                  value: averageScore,
                  icon: Star,
                  colorClass: "text-amber-300",
                  iconClassName: "fill-amber-300",
                },
              ].map((card, index) => (
                <motion.div
                  key={card.label}
                  className="min-w-0 flex-1 lg:flex-none"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 + index * 0.1 }}
                >
                  <PageStatCard loading={statsLoading} {...card} />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.header>

        {/* Barra: búsqueda + filtros rápidos + vista */}
        <motion.div
          ref={filtersRef}
          data-menu-pinned={filtersPinned}
          className="sv-toolbar-rise sticky top-[calc(3.5rem+var(--sv-safe-top,0px))] z-[70] mb-6 space-y-1 transition-all duration-300 sm:top-[calc(5rem+var(--sv-safe-top,0px))] sm:mb-5 lg:mb-6"
          {...toolbarMotion}
        >
          {/* Mobile: search + toggle */}
          <div className="relative z-10 flex gap-2 lg:hidden">
            <div className="relative flex-1">{searchInput("Buscar...")}</div>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-label="Filtros y vista"
              className={`relative h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
                filtersOpen
                  ? "text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.3)]"
                  : "text-zinc-200 hover:bg-black/30"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {activeFilters.length ? (
                <span className="absolute -right-1 -top-1">{filterCountBadge}</span>
              ) : null}
            </button>
          </div>

          {/* Desktop: Single row */}
          <div ref={toolbarSearchFitRef} className="sv-page-toolbar relative z-10 hidden lg:flex gap-3">
            <div className="sv-page-toolbar-search relative flex-1">
              {searchInput("Buscar por título...")}
            </div>
            {contentDropdown}
            {sortDropdown}
            <div className="relative min-w-0 lg:shrink">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={`h-11 min-w-0 inline-flex items-center gap-2 px-4 rounded-2xl transition text-sm sv-page-toolbar-trigger bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg hover:from-white/15 hover:to-white/10 ${
                  filtersOpen ? "text-orange-300" : "text-zinc-200"
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 shrink-0 text-orange-500" />
                <span className="sv-page-toolbar-value whitespace-nowrap font-semibold text-white">
                  Filtros avanzados
                </span>
                {filterCountBadge}
              </button>
            </div>
            <ViewModeSegmented value={viewMode} onChange={setViewMode} />
            <ImageModeSegmented value={imageMode} onChange={setImageMode} accent="orange" />
          </div>
        </motion.div>

        {/* Filtros avanzados activos: entran con la barra (siempre montado,
            así quitar o añadir filtros después no repite la entrada). */}
        <motion.div {...toolbarMotion}>
        {activeFilters.length > 0 || ignoredBySearch ? (
          <div className="-mt-2 mb-5 flex flex-wrap items-center gap-2">
            {activeFilters.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-gradient-to-br from-white/10 to-white/5 px-3 text-xs font-bold text-zinc-200 shadow-lg transition hover:from-white/15 hover:to-white/10"
                title="Quitar filtro"
              >
                <span className="min-w-0 truncate">{chip.label}</span>
                <X className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden="true" />
              </button>
            ))}
            {activeFilters.length > 1 ? (
              <button
                type="button"
                onClick={resetFilters}
                className="px-2 text-xs font-bold text-orange-400 hover:text-orange-300"
              >
                Quitar todos
              </button>
            ) : null}
            {ignoredBySearch ? (
              <p className="w-full text-xs text-zinc-500">
                La búsqueda por título no admite plataformas, certificación,
                duración ni keywords: esos filtros no se aplican mientras buscas.
              </p>
            ) : null}
          </div>
        ) : null}
        </motion.div>

        <main className="relative min-h-[50vh]">
          {error && items.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-md text-red-200 text-sm">
                {error}
              </div>
            </div>
          )}

          {toolbarShown && !loading && !error && items.length === 0 && (
            <div className="py-24 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20">
              <Compass className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
              <p className="text-zinc-500 font-medium">No se encontraron resultados.</p>
              <button
                type="button"
                onClick={() => {
                  resetFilters();
                  setQ("");
                }}
                className="mt-4 text-orange-500 text-sm font-bold hover:underline"
              >
                Limpiar búsqueda y filtros
              </button>
            </div>
          )}

          {toolbarShown && items.length > 0 && (
            <div>
              <FlipReorder
                key={`grid-${viewMode}-${imageMode}`}
                className={gridClassName}
                orderKey={listVersion}
                itemSelector="[data-discover-card]"
              >
                {visibleItems.map((item, idx) => (
                  <DiscoverCard
                    key={`${item.media_type}-${item.id}`}
                    item={item}
                    index={idx}
                    totalItems={visibleItems.length}
                    animateWithin={entranceVisibleCount}
                    viewMode={viewMode}
                    imageMode={imageMode}
                  />
                ))}
              </FlipReorder>

              {/* Marca del final: al acercarse a la pantalla, otra página. */}
              <div ref={sentinelRef} aria-hidden="true" className="h-px" />
              <div className="h-20" />
            </div>
          )}
        </main>
      </div>

      {/* Filtros avanzados: lateral desde 640px, hoja inferior en móvil */}
      <MobileOptionsSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtros avanzados"
        subtitle={
          activeFilters.length
            ? `${activeFilters.length} ${activeFilters.length === 1 ? "filtro activo" : "filtros activos"}`
            : "Sin filtros"
        }
        accent="orange"
        placement="side"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetFilters}
              disabled={!activeFilters.length && sortPreset === "pop_desc"}
              className="flex min-h-11 items-center gap-2 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 px-4 text-sm font-bold text-zinc-200 shadow-lg transition hover:from-white/15 hover:to-white/10 disabled:pointer-events-none disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4 text-orange-400" />
              Restablecer
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 px-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 transition hover:from-orange-400 hover:to-orange-500"
            >
              {totalResults == null
                ? "Ver resultados"
                : `Ver ${totalResults.toLocaleString("es-ES")} resultados`}
            </button>
          </div>
        }
      >
        {/* Lo que en escritorio va en la barra */}
        <div className="space-y-5 lg:hidden">
          {contentDropdown}
          {sortDropdown}
          <SheetOptionGroup label="Vista" icon={LayoutGrid}>
            <SheetOption icon={List} active={viewMode === "list"} onClick={() => setViewMode("list")}>
              Lista
            </SheetOption>
            <SheetOption icon={Grid2X2} active={viewMode === "compact"} onClick={() => setViewMode("compact")}>
              Compacta
            </SheetOption>
            <SheetOption icon={LayoutGrid} active={viewMode === "grid"} onClick={() => setViewMode("grid")}>
              Cuadrícula
            </SheetOption>
          </SheetOptionGroup>
          <ImageModeSheetGroup value={imageMode} onChange={setImageMode} />
        </div>

        <SheetOptionGroup label="Dónde se puede ver" icon={Tv} layout="stack">
          <div className="relative">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              value={providerQuery}
              onChange={(e) => setProviderQuery(e.target.value)}
              placeholder="Buscar plataforma..."
              className={`${SHEET_INPUT} pl-10 pr-3`}
            />
          </div>
          <div className="grid grid-cols-6 gap-2 max-h-[200px] overflow-y-auto p-1 [scrollbar-width:thin]">
            {providersFiltered.length === 0 ? (
              <div className="col-span-6 text-center text-xs text-zinc-500 py-2">
                Sin resultados
              </div>
            ) : (
              providersFiltered.map((p) => (
                <ProviderIcon
                  key={p.provider_id}
                  provider={p}
                  active={selectedProvidersSet.has(p.provider_id)}
                  onToggle={() => toggleIn(setSelectedProviders, p.provider_id)}
                />
              ))
            )}
          </div>
        </SheetOptionGroup>

        <SheetOptionGroup label="Tipo de acceso" icon={Wallet}>
          {MONETIZATION_OPTIONS.map((opt) => (
            <SheetOption
              key={opt.id}
              active={monetization.includes(opt.id)}
              onClick={() => toggleIn(setMonetization, opt.id)}
            >
              {opt.label}
            </SheetOption>
          ))}
        </SheetOptionGroup>

        <SheetOptionGroup label="Muéstrame" icon={Eye}>
          <SheetOption active={seenMode === "all"} onClick={() => setSeenMode("all")}>
            Todo
          </SheetOption>
          <SheetOption
            active={seenMode === "unseen"}
            onClick={() => setSeenMode("unseen")}
            disabled={!hasSession}
          >
            {contentNoun} por ver
          </SheetOption>
          <SheetOption
            active={seenMode === "seen"}
            onClick={() => setSeenMode("seen")}
            disabled={!hasSession}
          >
            {contentNoun} vistas
          </SheetOption>
        </SheetOptionGroup>

        <SheetOptionGroup label="Fechas de estreno" icon={Calendar} layout="stack">
          <div className="flex flex-wrap gap-2">
            {datePresets.map((preset) => (
              <SheetOption
                key={preset.id}
                active={dateFrom === preset.from && dateTo === preset.to}
                onClick={() => {
                  setDateFrom(preset.from);
                  setDateTo(preset.to);
                }}
              >
                {preset.label}
              </SheetOption>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Desde", dateFrom, setDateFrom],
              ["Hasta", dateTo, setDateTo],
            ].map(([label, value, setValue]) => (
              <label key={label} className="space-y-1">
                <span className="block text-[11px] font-bold text-zinc-500">{label}</span>
                <input
                  type="date"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className={`${SHEET_INPUT} px-3`}
                />
              </label>
            ))}
          </div>
        </SheetOptionGroup>

        <SheetOptionGroup label="Géneros" icon={Tag}>
          {genresAll.map((g) => (
            <SheetOption
              key={g.id}
              active={selectedGenres.includes(g.id)}
              onClick={() => toggleIn(setSelectedGenres, g.id)}
            >
              {g.name}
            </SheetOption>
          ))}
        </SheetOptionGroup>

        <SheetOptionGroup label="Certificación" icon={ShieldCheck}>
          {certsAll.map((c) => (
            <SheetOption
              key={c}
              active={selectedCerts.includes(c)}
              onClick={() => toggleIn(setSelectedCerts, c)}
            >
              {c}
            </SheetOption>
          ))}
        </SheetOptionGroup>

        <SheetOptionGroup label="Idioma original" icon={Globe} layout="scroll">
          {LANGUAGE_OPTIONS.map((opt) => (
            <SheetOption key={opt.id || "any"} active={lang === opt.id} onClick={() => setLang(opt.id)}>
              {opt.label}
            </SheetOption>
          ))}
        </SheetOptionGroup>

        <SheetOptionGroup label="Puntuación" icon={Star} layout="stack">
          <DualRange
            label="TMDb"
            min={0}
            max={10}
            step={0.5}
            valueMin={scoreRange[0]}
            valueMax={scoreRange[1]}
            onChange={setScoreRange}
          />
          <DualRange
            label="IMDb"
            min={0}
            max={10}
            step={0.5}
            valueMin={imdbRange[0]}
            valueMax={imdbRange[1]}
            onChange={setImdbRange}
          />
          <SingleRange
            label="Mínimo de votos en TMDb"
            min={0}
            max={5000}
            step={50}
            value={minVotes}
            onChange={setMinVotes}
            format={(v) => v.toLocaleString("es-ES")}
          />
        </SheetOptionGroup>

        <SheetOptionGroup label="Duración" icon={Clock} layout="stack">
          <DualRange
            label="Minutos"
            min={0}
            max={360}
            step={15}
            valueMin={runtimeRange[0]}
            valueMax={runtimeRange[1]}
            onChange={setRuntimeRange}
          />
        </SheetOptionGroup>

        <SheetOptionGroup label="Keywords" icon={Hash} layout="stack">
          <div className="relative">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              value={keywordQuery}
              onChange={(e) => setKeywordQuery(e.target.value)}
              placeholder="Buscar keyword (en inglés)..."
              className={`${SHEET_INPUT} pl-10 pr-3`}
            />
          </div>
          {keywordOptions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {keywordOptions.map((k) => (
                <SheetOption
                  key={k.id}
                  active={selectedKeywords.includes(k.id)}
                  onClick={() => {
                    setSelectedKeywords((p) => (p.includes(k.id) ? p : [...p, k.id]));
                    setKeywordNames((names) => ({ ...names, [k.id]: k.name }));
                    setKeywordQuery("");
                    setKeywordOptions([]);
                  }}
                >
                  {k.name}
                </SheetOption>
              ))}
            </div>
          )}
          {selectedKeywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedKeywords.map((id) => (
                <SheetOption
                  key={id}
                  active
                  onClick={() => setSelectedKeywords((p) => p.filter((x) => x !== id))}
                >
                  {keywordNames[id] || `#${id}`}
                </SheetOption>
              ))}
            </div>
          )}
        </SheetOptionGroup>
      </MobileOptionsSheet>

      <style jsx global>{`
        .range-thumb-interactive::-webkit-slider-thumb {
          pointer-events: auto;
          width: 16px;
          height: 16px;
          background: #f97316;
          border-radius: 50%;
          cursor: pointer;
          -webkit-appearance: none;
          box-shadow: 0 2px 8px rgba(249, 115, 22, 0.4);
        }
        .range-thumb-interactive::-moz-range-thumb {
          pointer-events: auto;
          width: 16px;
          height: 16px;
          background: #f97316;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(249, 115, 22, 0.4);
        }
      `}</style>
    </div>
  );
}
