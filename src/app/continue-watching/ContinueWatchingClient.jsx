"use client";

import OptimizedImage from "@/components/OptimizedImage";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import {
  Tv,
  Play,
  Clock,
  Film,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ChevronDown,
  CheckCircle2,
  X,
  TrendingUp,
  RotateCcw,
  LayoutList,
  LayoutGrid,
  Trash2,
  Loader2,
  Plus,
  Check,
  AlertCircle,
} from "lucide-react";

import {
  addManualProgress,
  dismissLocalProgress,
  getLocalInProgress,
  searchProgressTitles,
} from "@/lib/api/progressClient";
import { formatPageTitle } from "@/lib/pageTitle";
import LiquidButton from "@/components/LiquidButton";
import HistorySectionNav from "@/components/HistorySectionNav";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import { useAuth } from "@/context/AuthContext";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";
import useModalGuard from "@/hooks/useModalGuard";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import {
  normalizeSearchText,
  titleMatchesQuery,
} from "@/lib/search/titleMatching";
import {
  buildImg,
  fetchBestWatchingBackdrop,
  fetchBestWatchingPoster,
  getArtworkPreference,
  preloadImage,
} from "@/lib/dashboard/media";

// ----------------------------
// HELPERS
// ----------------------------
function formatLastWatched(iso) {
  if (!iso) return "Desconocido";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Desconocido";
  const now = new Date();
  const diffMins = Math.floor((now - d) / 60000);
  const diffHours = Math.floor((now - d) / 3600000);
  const diffDays = Math.floor((now - d) / 86400000);
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

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function mediaTypeOf(item) {
  return item?.media_type === "movie" ? "movie" : "tv";
}

function epCode(item) {
  if (mediaTypeOf(item) !== "tv") return null;
  const s = Number(item?.season);
  const e = Number(item?.episode);
  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(e) || e <= 0) return null;
  return `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
}

function detailsHref(item) {
  const id = item?.id;
  if (mediaTypeOf(item) === "movie") return `/details/movie/${id}`;
  const s = Number(item?.season);
  const e = Number(item?.episode);
  if (Number.isFinite(s) && s > 0 && Number.isFinite(e) && e > 0) {
    return `/details/tv/${id}/season/${s}/episode/${e}`;
  }
  return `/details/tv/${id}`;
}

// Nombre legible de la plataforma a partir del id corto guardado en el progreso.
const PLATFORM_LABELS = {
  netflix: "Netflix",
  primevideo: "Prime Video",
  max: "Max",
  hbomax: "Max",
  disney: "Disney+",
  disneyplus: "Disney+",
  crunchyroll: "Crunchyroll",
  movistar: "Movistar+",
  appletv: "Apple TV+",
  filmin: "Filmin",
  skyshowtime: "SkyShowtime",
  plutotv: "Pluto TV",
  rakutentv: "Rakuten TV",
  atresplayer: "Atresplayer",
  rtve: "RTVE",
  plex: "Plex",
};
function platformLabel(platform) {
  if (!platform) return null;
  const key = String(platform).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return PLATFORM_LABELS[key] || String(platform);
}

const PLATFORM_ICONS = {
  netflix: "/netflix.png",
  primevideo: "/amazonprimevideo.png",
  prime: "/amazonprimevideo.png",
  amazonprimevideo: "/amazonprimevideo.png",
  max: "/hbomax.png",
  hbomax: "/hbomax.png",
  hbo: "/hbomax.png",
  disney: "/disney.png",
  disneyplus: "/disney.png",
  plex: "/plex.png",
  spotify: "/spotify.png",
  movistar: "/movistar-text.png",
  crunchyroll: "/crunchyroll-text.png",
  appletv: "/appletv-text.png",
};
function platformIcon(platform) {
  if (!platform) return null;
  const key = String(platform).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return PLATFORM_ICONS[key] || null;
}

function formatRemainingTime(runtimeSeconds, positionSeconds) {
  if (!runtimeSeconds || !positionSeconds) return null;
  const remainingSeconds = runtimeSeconds - positionSeconds;
  if (remainingSeconds <= 0) return null;

  const remainingMinutes = Math.max(0, Math.ceil(remainingSeconds / 60));
  if (remainingMinutes < 60) {
    return `Quedan ${remainingMinutes} min`;
  }
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;
  if (mins === 0) {
    return `Quedan ${hours} h`;
  }
  return `Quedan ${hours} h ${mins} min`;
}

// Convierte las filas de /api/progress al item de la página.
function mapRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && Number(r.tmdbId) > 0)
    .map((r) => {
      const remainingLabel = formatRemainingTime(Number(r.runtimeSeconds), Number(r.positionSeconds));
      return {
        // id de la fila watch_progress: es la clave que necesita el borrado
        // (DELETE /api/progress?id=…). Distinto del tmdbId.
        progressId: r.id != null ? String(r.id) : null,
        id: Number(r.tmdbId),
        media_type: r.mediaType === "tv" ? "tv" : "movie",
        title: r.title || "",
        poster_path: r.posterPath || null,
        backdrop_path: null,
        season: r.season || null,
        episode: r.episode || null,
        pct: clampPct((Number(r.percent) || 0) * 100),
        platform: r.platform || null,
        lastWatchedAt: r.updatedAt || null,
        remainingLabel,
      };
    });
}

// Paleta por % IGUAL que la de "En progreso" (bar/text/bg/border/stroke/trail…).
function getProgressColor(pct) {
  if (pct >= 90)
    return { bar: "from-emerald-400 to-green-300", text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30", glow: "shadow-emerald-500/25", stroke: "#34d399", trail: "rgba(52,211,153,0.15)", label: "Casi completa", accent: "52,211,153" };
  if (pct >= 70)
    return { bar: "from-violet-500 to-purple-400", text: "text-violet-400", bg: "bg-violet-500/15", border: "border-violet-500/30", glow: "shadow-violet-500/25", stroke: "#a78bfa", trail: "rgba(167,139,250,0.15)", label: "Avanzada", accent: "167,139,250" };
  if (pct >= 50)
    return { bar: "from-sky-500 to-cyan-400", text: "text-sky-400", bg: "bg-sky-500/15", border: "border-sky-500/30", glow: "shadow-sky-500/25", stroke: "#38bdf8", trail: "rgba(56,189,248,0.15)", label: "Media", accent: "56,189,248" };
  if (pct >= 30)
    return { bar: "from-amber-500 to-yellow-400", text: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/30", glow: "shadow-amber-500/25", stroke: "#fbbf24", trail: "rgba(251,191,36,0.15)", label: "Parcial", accent: "251,191,36" };
  if (pct >= 10)
    return { bar: "from-orange-500 to-orange-400", text: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/30", glow: "shadow-orange-500/25", stroke: "#fb923c", trail: "rgba(251,146,60,0.15)", label: "Inicial", accent: "251,146,60" };
  return { bar: "from-rose-500 to-pink-400", text: "text-rose-400", bg: "bg-rose-500/15", border: "border-rose-500/30", glow: "shadow-rose-500/25", stroke: "#fb7185", trail: "rgba(251,113,133,0.15)", label: "Recién empezada", accent: "251,113,133" };
}

// ----------------------------
// IMÁGENES (mismo criterio que Historial/En progreso)
// ----------------------------
const posterChoiceCache = new Map();
const posterInFlight = new Map();
const backdropChoiceCache = new Map();
const backdropInFlight = new Map();

function cachedImage(type, id, kind) {
  const cache = kind === "poster" ? posterChoiceCache : backdropChoiceCache;
  const inflight = kind === "poster" ? posterInFlight : backdropInFlight;
  const key = `${type}:${id}`;
  if (cache.has(key)) return cache.get(key);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const chosen =
      kind === "poster"
        ? await fetchBestWatchingPoster(id, type)
        : await fetchBestWatchingBackdrop(id, type);
    cache.set(key, chosen || null);
    inflight.delete(key);
    return chosen || null;
  })();
  inflight.set(key, p);
  return p;
}

function SmartImage({ item, kind, alt, imgClassName = "" }) {
  const type = mediaTypeOf(item);
  const id = item.id;
  const itemPosterPath = item.poster_path || null;
  const itemBackdropPath = item.backdrop_path || null;
  const [src, setSrc] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;
    setSrc(null);
    setReady(false);
    (async () => {
      const key = `${type}:${id}`;
      const cache = kind === "poster" ? posterChoiceCache : backdropChoiceCache;
      const preference = getArtworkPreference(id, type);
      const preferredPath =
        kind === "poster" ? preference.poster : preference.backdrop;
      const fallbackPath =
        kind === "poster"
          ? itemPosterPath || itemBackdropPath || null
          : itemBackdropPath || itemPosterPath || null;
      let finalPath;
      if (preferredPath) finalPath = preferredPath;
      else if (cache.has(key)) finalPath = cache.get(key) || fallbackPath;
      else finalPath = (await cachedImage(type, id, kind)) || fallbackPath;
      if (!finalPath || abort) return;
      const url = buildImg(finalPath, kind === "poster" ? "w500" : "w1280");
      await preloadImage(url);
      if (!abort) {
        setSrc(url);
        setReady(true);
      }
    })();
    return () => {
      abort = true;
    };
  }, [type, id, kind, itemPosterPath, itemBackdropPath]);

  const Fallback = kind === "poster" ? Film : Tv;
  return (
    <div className="relative w-full h-full">
      <div className={`absolute inset-0 flex items-center justify-center bg-neutral-900 transition-opacity duration-300 ${ready && src ? "opacity-0" : "opacity-100"}`}>
        <Fallback className="w-8 h-8 text-neutral-700" />
      </div>
      {src && (
        <OptimizedImage
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"} ${imgClassName}`}
        />
      )}
    </div>
  );
}

function CircularProgress({ pct, colors, size = 40 }) {
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.trail} strokeWidth={strokeWidth} />
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
          transition={{ duration: 1.1, ease: "easeOut", delay: 0.2 }}
          style={{ filter: `drop-shadow(0 0 4px ${colors.stroke}60)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-[11px] font-black ${colors.text}`}>{pct}%</span>
      </div>
    </div>
  );
}

// ----------------------------
// STAT CARD (igual que Historial/En progreso)
// ----------------------------
function StatCard({ label, value, icon: Icon, colorClass = "text-white", loading = false }) {
  return (
    <div className="relative overflow-hidden w-full lg:w-[132px] h-full min-h-[96px] sm:min-h-[112px] lg:min-h-[120px] lg:flex-none rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-2 py-2 sm:px-3 sm:py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
      <div className={`relative z-10 mb-1 ${colorClass}`}>
        <Icon className="w-6 h-6 md:w-7 md:h-7" />
      </div>
      <div className="relative z-10 text-sm sm:text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight drop-shadow-md">
        {loading ? <span className="inline-block h-4 w-8 sm:h-6 sm:w-10 md:h-8 md:w-14 rounded-lg bg-white/10 animate-pulse" /> : value}
      </div>
      <div className="relative z-10 text-[8px] sm:text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wide text-center leading-tight">
        {label}
      </div>
    </div>
  );
}

// ----------------------------
// DROPDOWN (acento ámbar de "Continuar viendo")
// ----------------------------
function InlineDropdown({ label, valueLabel, icon: Icon, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

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
        aria-expanded={open}
        className="h-11 min-w-0 w-full inline-flex items-center justify-between gap-3 px-4 rounded-2xl transition-[min-width,background-color,color] text-sm lg:min-w-[140px] lg:w-auto lg:max-w-none bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10"
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="w-4 h-4 shrink-0 text-emerald-500" />}
          <span className="text-zinc-500 font-bold text-xs uppercase tracking-wider">{label}:</span>
          <span className="min-w-0 truncate font-semibold text-white">{valueLabel}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
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
      className={`w-full px-3 py-2 rounded-xl text-left text-sm transition flex items-center justify-between ${active ? "bg-white/10 text-white font-bold" : "text-zinc-300 hover:bg-white/5 hover:text-white"}`}
    >
      <span className="font-medium">{children}</span>
      {active && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
    </button>
  );
}

// ----------------------------
// TARJETA (posición de reproducción)
// ----------------------------
// Botón rojo de papelera que aparece en "modo borrar" (mismo gesto que el
// Historial). Se posiciona con `className` según la vista.
function DeleteTrigger({ onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      title="Quitar de Continuar viendo"
      aria-label="Quitar de Continuar viendo"
      className={`flex items-center justify-center rounded-full bg-black/50 text-red-400 shadow-lg backdrop-blur-md border border-white/10 hover:bg-red-500/30 hover:text-red-200 transition-colors ${className}`}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

// Overlay de confirmación "¿Quitar?" que cubre la tarjeta (igual UX que el
// borrado del Historial). `rounded` iguala el radio de la tarjeta de cada vista.
function DeleteConfirm({ busy, onCancel, onConfirm, rounded = "rounded-2xl" }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`absolute inset-0 z-40 flex items-center justify-center gap-2 px-3 bg-black/95 ${rounded}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span className="text-red-200 text-[10px] sm:text-xs font-bold tracking-wide">
        ¿Quitar?
      </span>
      <button
        onClick={onCancel}
        className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors flex items-center justify-center"
        aria-label="Cancelar"
      >
        <X className="w-4 h-4" />
      </button>
      <button
        onClick={onConfirm}
        className="p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center justify-center"
        aria-label="Quitar"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </motion.div>
  );
}

function ContinueWatchingPosterHoverIndicator({
  platform,
  platformIconUrl,
  pct,
  progressColor,
}) {
  return (
    <div
      className={`pointer-events-none absolute bottom-3 inset-x-0 z-20 mx-auto hidden w-fit items-center overflow-hidden rounded-full px-1 ${LIQUID_GLASS_PANEL} text-white shadow-xl opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none lg:flex lg:group-hover:opacity-100`}
      aria-hidden="true"
    >
      <span className="flex h-9 w-10 shrink-0 items-center justify-center">
        {platformIconUrl ? (
          <OptimizedImage
            src={platformIconUrl}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 rounded-lg object-contain brightness-110 shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
          />
        ) : (
          <span className="max-w-8 truncate text-[9px] font-black uppercase text-zinc-200">
            {platform || "—"}
          </span>
        )}
      </span>
      <span className={`flex h-9 w-10 shrink-0 items-center justify-center text-xl font-black leading-none tabular-nums ${progressColor}`}>
        <span className="leading-none">{pct}%</span>
      </span>
    </div>
  );
}

const ProgressCard = memo(function ProgressCard({
  item,
  index = 0,
  viewMode = "cards",
  editMode = false,
  busy = false,
  onRemove,
}) {
  const title = item.title || "Sin título";
  const href = detailsHref(item);
  const previewClick = usePreviewOpen();
  const onPreviewClick = previewClick(item, { mediaType: mediaTypeOf(item) });
  const pct = clampPct(item.pct);
  const colors = getProgressColor(pct);
  const code = epCode(item);
  const labelText = code ? (item.remainingLabel ? `${code} · ${item.remainingLabel}` : code) : item.remainingLabel;
  const platform = platformLabel(item.platform);
  const platformIconUrl = platformIcon(item.platform);
  const lastWatched = formatLastWatched(item.lastWatchedAt);
  const animDelay = Math.min(index * 0.05, 0.4);
  // Al volver atrás/adelante NO se anima la entrada: la página se ve estática.
  const isBackNav = useIsHistoryNavigation();

  // Estado de confirmación por tarjeta. Al salir del modo borrar se resetea.
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    if (!editMode) setConfirmDel(false);
  }, [editMode]);
  const canDelete = editMode && Boolean(item.progressId);
  const handleTrash = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDel(true);
  };
  const handleCancel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDel(false);
  };
  const handleConfirm = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove?.(item.progressId);
  };

  if (viewMode === "compact") {
    return (
      <motion.div initial={isBackNav ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, delay: isBackNav ? 0 : animDelay, ease: "easeOut" }}>
        <Link href={href} prefetch={false} onClick={onPreviewClick} className="relative block overflow-hidden rounded-xl bg-zinc-900/30 transition-colors group hover:bg-zinc-900/60 after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(16,185,129,0.95)]">
          <div className={`relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4 ${canDelete ? "pr-12 sm:pr-14" : ""}`}>
            <div className="w-[180px] sm:w-[280px] aspect-video rounded-lg overflow-hidden relative shadow-md bg-zinc-900 shrink-0">
              <SmartImage item={item} kind="backdrop" alt={title} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              <h4 className="text-white font-bold text-base leading-tight truncate group-hover:text-emerald-300 transition-colors">{title}</h4>
              <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
                <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${colors.bg} ${colors.text}`}>{pct}%</span>
                {code && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Play className="w-3 h-3 text-emerald-400" fill="currentColor" />
                      <span className="text-zinc-300 font-semibold">{code}</span>
                    </span>
                  </>
                )}
                {platform && (
                  <>
                    <span>•</span>
                    <span className="text-zinc-400">{platform}</span>
                  </>
                )}
                {item.remainingLabel && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400 font-bold">{item.remainingLabel}</span>
                  </>
                )}
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden relative">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${colors.bar} relative overflow-hidden`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, delay: animDelay + 0.2, ease: "easeOut" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]" style={{ animationDelay: `${animDelay}s` }} />
                </motion.div>
              </div>
              <div className="text-xs text-zinc-300 flex items-center gap-1.5 font-semibold">
                <Clock className="w-3.5 h-3.5 text-zinc-400" /> {lastWatched}
              </div>
            </div>
            {canDelete && (
              <DeleteTrigger
                onClick={handleTrash}
                className="absolute top-1/2 right-2 sm:right-3 -translate-y-1/2 z-30 h-9 w-9"
              />
            )}
            <AnimatePresence>
              {confirmDel && (
                <DeleteConfirm
                  busy={busy}
                  onCancel={handleCancel}
                  onConfirm={handleConfirm}
                  rounded="rounded-xl"
                />
              )}
            </AnimatePresence>
          </div>
        </Link>
      </motion.div>
    );
  }

  if (viewMode === "poster") {
    return (
      <motion.div initial={isBackNav ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, delay: isBackNav ? 0 : animDelay, ease: "easeOut" }}>
        <Link href={href} prefetch={false} onClick={onPreviewClick} className="block">
          <div className="relative aspect-[2/3] group rounded-xl overflow-hidden bg-zinc-900 shadow-md lg:hover:shadow-emerald-900/20 transition-all after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(16,185,129,0.95)]">
            <SmartImage item={item} kind="poster" alt={title} />

            <ContinueWatchingPosterHoverIndicator
              platform={platform}
              platformIconUrl={platformIconUrl}
              pct={pct}
              progressColor={colors.text}
            />
            {canDelete && (
              <DeleteTrigger
                onClick={handleTrash}
                className="absolute top-2 right-2 z-30 h-9 w-9"
              />
            )}
            <AnimatePresence>
              {confirmDel && (
                <DeleteConfirm
                  busy={busy}
                  onCancel={handleCancel}
                  onConfirm={handleConfirm}
                  rounded="rounded-xl"
                />
              )}
            </AnimatePresence>
          </div>
        </Link>
      </motion.div>
    );
  }

  // ==== CARDS (por defecto) ====
  return (
    <motion.div initial={isBackNav ? false : { opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.4, delay: isBackNav ? 0 : animDelay, ease: [0.25, 0.46, 0.45, 0.94] }}>
      <Link href={href} prefetch={false} onClick={onPreviewClick} className="block group">
        <div
          className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg transition-all duration-300 hover:shadow-xl"
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = `0 20px 25px -5px rgba(${colors.accent}, 0.15), 0 8px 10px -6px rgba(${colors.accent}, 0.1)`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "";
          }}
        >
          <div className="relative aspect-video overflow-hidden">
            <SmartImage item={item} kind="backdrop" alt={title} imgClassName="transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
            <div className="absolute top-3 right-3">
              {canDelete ? (
                <DeleteTrigger onClick={handleTrash} className="h-10 w-10" />
              ) : (
                <div className="flex items-center justify-center rounded-full bg-black/40 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md shadow-lg border border-white/10">
                  <CircularProgress pct={pct} colors={colors} size={40} />
                </div>
              )}
            </div>
            {labelText ? (
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-[linear-gradient(135deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.06)_60%,rgba(0,0,0,0.3)_100%)] bg-black/35 shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex items-center gap-1.5 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                <Play className="w-3 h-3 text-emerald-400" fill="currentColor" />
                <span className="text-white drop-shadow-sm">{labelText}</span>
              </div>
            ) : null}
            <div className="absolute bottom-0 left-0 right-0 p-4 pr-16">
              <h3 className="text-white font-black text-lg lg:text-xl leading-tight line-clamp-1 group-hover:text-emerald-200 transition-colors">{title}</h3>
            </div>
            {/* Platform logo badge - bottom right corner */}
            {platform && (
              platformIconUrl ? (
                <OptimizedImage
                  src={platformIconUrl}
                  alt={platform}
                  width={28}
                  height={28}
                  className="absolute bottom-3 right-3 z-10 h-7 w-7 rounded-lg object-contain brightness-110 opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.6)] transition-all duration-300 group-hover:scale-105 group-hover:opacity-100"
                />
              ) : (
                <div className="absolute bottom-3 right-3 z-10 px-2 py-1 rounded-lg bg-[linear-gradient(135deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.06)_60%,rgba(0,0,0,0.3)_100%)] bg-black/35 shadow-[0_4px_12px_rgba(0,0,0,0.5)] border-none text-[10px] font-black uppercase tracking-wider text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  {platform}
                </div>
              )
            )}
          </div>
          <div className="p-4 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  {item.remainingLabel ? `Progreso · ${item.remainingLabel}` : "Progreso"}
                </span>
                <span className="text-[11px] text-zinc-500">{pct}% visto</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-zinc-800/80 overflow-hidden relative">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${colors.bar} relative overflow-hidden`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, delay: animDelay + 0.3, ease: "easeOut" }}
                  style={{ boxShadow: `0 0 8px ${colors.stroke}40` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_2s_infinite]" style={{ animationDelay: `${animDelay}s` }} />
                </motion.div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 inline-flex items-center gap-1.5">
                {mediaTypeOf(item) === "movie" ? <Film className="w-3 h-3 text-zinc-500" /> : <Tv className="w-3 h-3 text-zinc-500" />}
                {mediaTypeOf(item) === "movie" ? "Película" : "Serie"}
              </span>
              <span className="text-xs text-zinc-300 font-semibold inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                {lastWatched}
              </span>
            </div>
          </div>
          <AnimatePresence>
            {confirmDel && (
              <DeleteConfirm
                busy={busy}
                onCancel={handleCancel}
                onConfirm={handleConfirm}
                rounded="rounded-2xl"
              />
            )}
          </AnimatePresence>
        </div>
      </Link>
    </motion.div>
  );
});

// ----------------------------
// CACHÉ LOCAL (pintado instantáneo)
// ----------------------------
const CACHE_KEY = "showverse:continue-watching:page:v2";
// Solo se pinta la caché AL INSTANTE si es RECIENTE (< 10 min). Si es más vieja
// (p. ej. añadiste algo desde otro dispositivo: tu caché es de la última visita,
// sin lo nuevo) NO se pinta: se muestra carga y el fetch trae la lista correcta de
// una vez, en vez de la vieja y luego lo nuevo parpadeando. Igual que Favoritos.
const CW_FRESH_TTL_MS = 10 * 60 * 1000;
function readCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > 6 * 60 * 60 * 1000) return null;
    if (!Array.isArray(parsed.items) || !parsed.items.length) return null;
    return { items: parsed.items, fresh: Date.now() - parsed.ts < CW_FRESH_TTL_MS };
  } catch {
    return null;
  }
}
function writeCache(items) {
  if (typeof window === "undefined") return;
  try {
    if (Array.isArray(items) && items.length) window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* modo privado / cuota */
  }
}

// ----------------------------
// PÁGINA
// ----------------------------
const VIEW_MODES = new Set(["cards", "poster", "compact"]);

export default function ContinueWatchingClient() {
  const { authenticated, hydrated } = useAuth();
  const [items, setItems] = useState(null); // null = cargando
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewMode, setViewMode] = useState("cards");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filtersRef = useRef(null);
  const { isSticky: filtersSticky, isPinned: filtersPinned } =
    useStickyToolbarState(filtersRef);
  const [editMode, setEditMode] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    document.title = formatPageTitle("Continuar viendo");
  }, []);

  useEffect(() => {
    const v = typeof window !== "undefined" && window.localStorage.getItem("showverse:cw:viewMode");
    if (v && VIEW_MODES.has(v)) setViewMode(v);
    const cached = readCache();
    // Solo pintamos al instante si la caché es RECIENTE. Si es vieja, dejamos la
    // carga (skeleton) hasta que `load()` pinte la lista completa de una vez, sin
    // el parpadeo del contenido obsoleto que luego cambia.
    if (cached?.fresh) {
      setItems(cached.items);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("showverse:cw:viewMode", viewMode);
  }, [viewMode]);

  const load = useCallback(async () => {
    try {
      const rows = await getLocalInProgress();
      const mapped = mapRows(rows);
      setItems(mapped);
      writeCache(mapped);
    } catch {
      // Servidor caído/red: NO vaciamos. Conservamos lo que hubiera pintado o
      // recuperamos la caché (aunque no fuera "reciente") para el modo offline.
      setItems((cur) => {
        if (Array.isArray(cur) && cur.length) return cur;
        return readCache()?.items || [];
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Quita una entrada de "Continuar viendo": borra en el backend
  // (DELETE /api/progress?id=) y, si va bien, la elimina del estado y la caché.
  // Mismo gesto/UX que el borrado del Historial.
  const handleRemove = useCallback(async (progressId) => {
    if (!progressId) return;
    setBusyId(progressId);
    const ok = await dismissLocalProgress(progressId);
    if (ok) {
      setItems((cur) => {
        const next = (Array.isArray(cur) ? cur : []).filter(
          (x) => x.progressId !== progressId,
        );
        writeCache(next);
        return next;
      });
    }
    setBusyId(null);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!authenticated) {
      setItems([]);
      setLoading(false);
      writeCache(null);
      return;
    }
    load();
  }, [authenticated, hydrated, load]);

  const dataLoaded = Array.isArray(items);

  // Todo lo que hay aquí está "en curso": el backend elimina la fila de
  // watch_progress al llegar al 90% (pasa al historial). No hay estado
  // "completado", así que no hay selector de pestañas.
  const currentItems = useMemo(() => (dataLoaded ? items : []), [items, dataLoaded]);
  const existingTitleKeys = useMemo(
    () =>
      new Set(
        currentItems.map((item) => `${mediaTypeOf(item)}:${Number(item.id)}`),
      ),
    [currentItems],
  );

  const handleManualAdded = useCallback((row) => {
    const added = mapRows([row])[0];
    if (!added) return;
    const addedKey = `${mediaTypeOf(added)}:${added.id}`;
    setItems((current) => {
      const next = [
        added,
        ...(Array.isArray(current) ? current : []).filter(
          (item) => `${mediaTypeOf(item)}:${item.id}` !== addedKey,
        ),
      ];
      writeCache(next);
      return next;
    });
    setAddModalOpen(false);
  }, []);

  const openAddModal = useCallback(() => {
    setEditMode(false);
    setAddModalOpen(true);
  }, []);
  const closeAddModal = useCallback(() => setAddModalOpen(false), []);

  const filtered = useMemo(() => {
    let list = Array.isArray(currentItems) ? [...currentItems] : [];
    if (typeFilter !== "all") list = list.filter((x) => mediaTypeOf(x) === typeFilter);
    if (q.trim()) {
      const query = normalizeSearchText(q);
      list = list.filter((x) => titleMatchesQuery(x, query));
    }
    switch (sortBy) {
      case "recent":
        list.sort((a, b) => new Date(b.lastWatchedAt || 0) - new Date(a.lastWatchedAt || 0));
        break;
      case "oldest":
        list.sort((a, b) => new Date(a.lastWatchedAt || 0) - new Date(b.lastWatchedAt || 0));
        break;
      case "progress-high":
        list.sort((a, b) => clampPct(b.pct) - clampPct(a.pct));
        break;
      case "progress-low":
        list.sort((a, b) => clampPct(a.pct) - clampPct(b.pct));
        break;
      case "alpha":
        list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
      default:
        break;
    }
    return list;
  }, [currentItems, q, sortBy, typeFilter]);

  const stats = useMemo(() => {
    const list = Array.isArray(currentItems) ? currentItems : [];
    const movies = list.filter((x) => mediaTypeOf(x) === "movie").length;
    const series = list.filter((x) => mediaTypeOf(x) === "tv").length;
    const avg = list.length ? Math.round(list.reduce((s, x) => s + clampPct(x.pct), 0) / list.length) : 0;
    return { total: list.length, movies, series, avg };
  }, [currentItems]);

  const sortLabels = {
    recent: "Recientes",
    oldest: "Más antiguos",
    "progress-high": "Más avanzados",
    "progress-low": "Menos avanzados",
    alpha: "Alfabético",
  };
  const typeLabels = { all: "Todo", movie: "Películas", tv: "Series" };

  if (!hydrated) return <div className="min-h-screen bg-black" />;

  const showLoginPrompt = hydrated && !authenticated;

  if (showLoginPrompt) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 font-sans">
        <Blobs />
        <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <Header stats={stats} loading />
          <div className="mb-8">
            <HistorySectionNav />
          </div>
          <div className="flex items-center justify-center py-16 lg:py-24">
            <div className="max-w-[380px] w-full flex flex-col items-center justify-center px-6 py-10 bg-zinc-950/40 border border-white/10 rounded-[2.5rem] text-center shadow-2xl backdrop-blur-3xl">
              <img src="/logo-TSV-sinFondo.png" alt="The Show Verse" className="h-20 w-auto object-contain mb-4 scale-[1.4]" />
              <h2 className="text-2xl font-black text-white tracking-tight mb-2">Inicia sesión</h2>
              <p className="text-zinc-400 text-xs font-medium mb-6 leading-relaxed">
                Inicia sesión para ver los títulos que tienes a medias con su porcentaje de reproducción.
              </p>
              <button
                type="button"
                onClick={() => window.location.assign("/login?next=/continue-watching")}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 hover:from-sky-400 hover:via-indigo-400 hover:to-emerald-400 text-white font-extrabold uppercase tracking-widest text-xs transition-all active:scale-[0.98]"
              >
                Iniciar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans">
      <Blobs />
      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <Header stats={stats} loading={!dataLoaded} onRefresh={load} refreshing={loading} />

        {/* Filtros */}
        <motion.div
          ref={filtersRef}
          data-menu-pinned={filtersPinned}
          className="sticky top-14 z-[70] space-y-3 mb-4 transition-all duration-300 sm:top-20 lg:mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          {/* Móvil: antes de alcanzar el sticky el panel pertenece al flujo y
              desplaza el contenido. Una vez fijado se convierte en overlay, igual
              que en Historial, para conservar estable la lista que queda debajo. */}
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-md transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                  </button>
                )}
              </div>
              <HistorySectionNav className="h-11 shrink-0" />
              <button
                type="button"
                onClick={() => setMobileFiltersOpen((v) => !v)}
                aria-expanded={mobileFiltersOpen}
                aria-controls="continue-watching-mobile-filters"
                aria-label={
                  mobileFiltersOpen ? "Cerrar filtros" : "Abrir filtros"
                }
                className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${mobileFiltersOpen
                  ? "text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  : "text-zinc-200 hover:bg-black/30"
                  }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>

            <AnimatePresence>
              {mobileFiltersOpen && (
                <motion.div
                  id="continue-watching-mobile-filters"
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className={`z-[80] mt-2 origin-top overflow-hidden ${filtersSticky
                    ? "absolute left-0 right-0 top-full"
                    : "relative"
                    }`}
                >
                  <div className="p-3 rounded-2xl bg-zinc-950/90 backdrop-blur-2xl border border-white/10 shadow-2xl space-y-2.5">
                    {/* Fila 1: ordenar + acción de eliminar. El selector de
                      secciones permanece visible en la barra principal. */}
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
                      <button
                        type="button"
                        onClick={openAddModal}
                        title="Añadir título"
                        aria-label="Añadir título a Continuar viendo"
                        className="h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl text-zinc-200 transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg hover:bg-black/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditMode((v) => !v)}
                        title={
                          editMode ? "Salir del modo borrar" : "Quitar títulos"
                        }
                        aria-label={
                          editMode ? "Salir del modo borrar" : "Quitar títulos"
                        }
                        aria-pressed={editMode}
                        className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${editMode
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

                    {/* Fila 2: Tipo + botones de vista */}
                    <div className="flex gap-2 items-center">
                      <div className="flex-1 min-w-0">
                        <InlineDropdown
                          label="Tipo"
                          valueLabel={typeLabels[typeFilter]}
                          icon={Film}
                        >
                          {({ close }) => (
                            <>
                              {Object.entries(typeLabels).map(([key, label]) => (
                                <DropdownItem
                                  key={key}
                                  active={typeFilter === key}
                                  onClick={() => {
                                    setTypeFilter(key);
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
                      {/* Grupo de vista: misma estructura que la navegación de
                        (inline-flex gap-1 p-1, botones px-2.5 py-2 con icono w-4)
                        para que ocupe EXACTAMENTE el mismo ancho que los 3 botones
                        de sección de la fila de arriba y las dos filas se alineen. */}
                      <div className="inline-flex h-11 shrink-0 items-center gap-1 rounded-2xl p-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                        <button
                          onClick={() => setViewMode("cards")}
                          className={`flex items-center justify-center rounded-lg px-2.5 py-2 transition-all ${viewMode === "cards"
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                            }`}
                        >
                          <Film className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setViewMode("poster")}
                          className={`flex items-center justify-center rounded-lg px-2.5 py-2 transition-all ${viewMode === "poster"
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                            }`}
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setViewMode("compact")}
                          className={`flex items-center justify-center rounded-lg px-2.5 py-2 transition-all ${viewMode === "compact"
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
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
          </div>

          {/* Escritorio: Fila única */}
          <div className="hidden lg:flex gap-3 relative z-10">
            <HistorySectionNav className="shrink-0" />
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 z-10 pointer-events-none" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por título..."
                className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
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
              label="Tipo"
              valueLabel={typeLabels[typeFilter]}
              icon={Film}
            >
              {({ close }) => (
                <>
                  {Object.entries(typeLabels).map(([key, label]) => (
                    <DropdownItem
                      key={key}
                      active={typeFilter === key}
                      onClick={() => {
                        setTypeFilter(key);
                        close();
                      }}
                    >
                      {label}
                    </DropdownItem>
                  ))}
                </>
              )}
            </InlineDropdown>

            {/* Modo de visualización */}
            <div className="flex gap-1 rounded-2xl p-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
              <button
                onClick={() => setViewMode("cards")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "cards"
                  ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                  : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
              >
                <Film className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("poster")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "poster"
                  ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                  : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("compact")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "compact"
                  ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                  : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={openAddModal}
              title="Añadir título"
              aria-label="Añadir título a Continuar viendo"
              className="h-11 w-11 rounded-2xl text-sm font-bold transition-all flex items-center justify-center shrink-0 text-zinc-200 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg hover:bg-black/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Modo borrar (mismo gesto que el Historial): revela una papelera en
                cada tarjeta con confirmación antes de quitarla. */}
            <button
              onClick={() => setEditMode((v) => !v)}
              title={editMode ? "Salir del modo borrar" : "Quitar títulos"}
              aria-label={editMode ? "Salir del modo borrar" : "Quitar títulos"}
              aria-pressed={editMode}
              className={`h-11 w-11 rounded-2xl text-sm font-bold transition-all flex items-center justify-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${editMode
                ? "text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                : "text-zinc-200 hover:bg-black/30"
                }`}
            >
              {editMode ? <X className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        </motion.div>

        {/* Contenido */}
        {!loading && filtered.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 mb-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Play className="w-8 h-8 text-zinc-600" fill="currentColor" />
            </div>
            <h3 className="text-lg font-bold text-zinc-400 mb-2">
              {q ? "Sin resultados" : "No tienes nada a medias"}
            </h3>
            <p className="text-sm text-zinc-600 max-w-sm">
              {q ? `No se encontraron títulos que coincidan con "${q}"` : "Reproduce algo en una plataforma de streaming (con la extensión o la app) y aparecerá aquí con su porcentaje."}
            </p>
          </motion.div>
        )}

        {filtered.length > 0 && (
          <AnimatePresence mode="popLayout">
            {viewMode === "cards" ? (
              <motion.div key="cards" layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {filtered.map((item, i) => <ProgressCard key={item.progressId || `${mediaTypeOf(item)}:${item.id}`} item={item} index={i} viewMode="cards" editMode={editMode} busy={busyId === item.progressId} onRemove={handleRemove} />)}
              </motion.div>
            ) : viewMode === "poster" ? (
              <motion.div key="poster" layout className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 lg:gap-4">
                {filtered.map((item, i) => <ProgressCard key={item.progressId || `${mediaTypeOf(item)}:${item.id}`} item={item} index={i} viewMode="poster" editMode={editMode} busy={busyId === item.progressId} onRemove={handleRemove} />)}
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {filtered.map((item, i) => <ProgressCard key={item.progressId || `${mediaTypeOf(item)}:${item.id}`} item={item} index={i} viewMode="compact" editMode={editMode} busy={busyId === item.progressId} onRemove={handleRemove} />)}
              </div>
            )}
          </AnimatePresence>
        )}

        <AnimatePresence>
          {addModalOpen && (
            <AddProgressModal
              existingKeys={existingTitleKeys}
              onAdded={handleManualAdded}
              onClose={closeAddModal}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AddProgressModal({ existingKeys, onAdded, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [addingKey, setAddingKey] = useState("");
  const inputRef = useRef(null);
  const previousFocusRef = useRef(null);

  useModalGuard({ open: true, onClose });

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() =>
      inputRef.current?.focus(),
    );

    return () => {
      window.cancelAnimationFrame(focusFrame);
      previousFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    setError("");
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const nextResults = await searchProgressTitles(trimmed, {
          signal: controller.signal,
        });
        setResults(nextResults.slice(0, 20));
      } catch (searchError) {
        if (searchError?.name !== "AbortError") {
          setResults([]);
          setError(searchError?.message || "No se pudieron buscar títulos");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleAdd = async (item) => {
    const key = `${item.media_type}:${item.id}`;
    if (addingKey || existingKeys.has(key)) return;
    setAddingKey(key);
    setError("");
    try {
      const row = await addManualProgress(item);
      onAdded(row);
    } catch (addError) {
      setError(addError?.message || "No se pudo añadir el título");
      setAddingKey("");
    }
  };

  return createPortal(
    <motion.div
      data-detail-modal-layer=""
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6"
    >
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-progress-title"
        aria-describedby="add-progress-description"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={`relative flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL}`}
      >
        <header className="flex w-full shrink-0 items-center justify-between gap-4 bg-white/[0.025] p-6 sm:px-8 sm:pb-6 sm:pt-8">
          <div className="min-w-0">
            <h2
              id="add-progress-title"
              className="truncate bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-black text-transparent"
            >
              Añadir a Continuar viendo
            </h2>
            <p
              id="add-progress-description"
              className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500"
            >
              Busca una película o serie
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar selector de títulos"
            title="Cerrar (Esc)"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:px-8 sm:pb-8">
          <div className="relative group">
            <label htmlFor="add-progress-search" className="sr-only">
              Buscar película o serie
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-white"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              id="add-progress-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Título de la película o serie..."
              autoComplete="off"
              className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-10 pr-11 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-white/20 focus:bg-black/60"
            />
            {searching ? (
              <Loader2
                className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400 motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-red-400"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          {query.trim().length < 2 && (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01] px-6 text-center">
              <Search className="mb-3 h-8 w-8 text-zinc-700" aria-hidden="true" />
              <p className="text-sm font-medium text-zinc-400">
                Encuentra cualquier título
              </p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-600">
                Escribe al menos dos caracteres para buscar en películas y series.
              </p>
            </div>
          )}

          {!searching &&
            query.trim().length >= 2 &&
            !error &&
            results.length === 0 && (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01] px-6 text-center">
                <Film className="mb-3 h-8 w-8 text-zinc-700" aria-hidden="true" />
                <p className="text-sm font-medium text-zinc-400">
                  No se encontraron títulos
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  Prueba con otro nombre.
                </p>
              </div>
            )}

          {results.length > 0 && (
            <ul className="space-y-2" role="list">
              {results.map((item) => {
                const key = `${item.media_type}:${item.id}`;
                const alreadyAdded = existingKeys.has(key);
                const adding = addingKey === key;
                const year = String(item.release_date || "").slice(0, 4);
                const poster = item.poster_path
                  ? buildImg(item.poster_path, "w342")
                  : null;

                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => handleAdd(item)}
                      disabled={alreadyAdded || Boolean(addingKey)}
                      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                        alreadyAdded
                          ? "cursor-default border-emerald-500/20 bg-emerald-500/[0.03]"
                          : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.06] active:scale-[0.98]"
                      } disabled:opacity-70`}
                    >
                      <div className="h-[72px] w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
                        {poster ? (
                          <OptimizedImage
                            src={poster}
                            alt=""
                            width={96}
                            height={144}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-zinc-700">
                            {item.media_type === "movie" ? (
                              <Film className="h-5 w-5" />
                            ) : (
                              <Tv className="h-5 w-5" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-bold transition-colors sm:text-base ${
                            alreadyAdded
                              ? "text-emerald-100"
                              : "text-zinc-200 group-hover:text-white"
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                          <span>
                            {item.media_type === "movie" ? "Película" : "Serie"}
                          </span>
                          {year && (
                            <>
                              <span aria-hidden="true">•</span>
                              <span>{year}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0">
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-300 ${
                            adding
                              ? "border-white/10 bg-white/5 text-zinc-400"
                              : alreadyAdded
                                ? "border-emerald-500 bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                                : "border-white/10 bg-transparent text-zinc-500 group-hover:border-emerald-500 group-hover:bg-emerald-500/10 group-hover:text-emerald-400"
                          }`}
                          aria-hidden="true"
                        >
                          {adding ? (
                            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                          ) : alreadyAdded ? (
                            <Check className="h-5 w-5" />
                          ) : (
                            <Plus className="h-5 w-5" />
                          )}
                        </span>
                        <span className="sr-only">
                          {alreadyAdded ? "Ya añadido" : "Añadir"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </motion.section>
    </motion.div>,
    document.body,
  );
}

// Fondo con manchas ámbar (mismo lenguaje que Historial/En progreso).
function Blobs() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-emerald-600/15 blur-[120px] sm:blur-[150px]" />
      <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-emerald-700/20 blur-[120px] sm:blur-[150px]" />
      <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-emerald-800/25 blur-[120px] sm:blur-[150px]" />
    </div>
  );
}

function Header({ stats, loading, onRefresh, refreshing }) {
  return (
    <motion.header className="mb-4 sm:mb-6 lg:mb-10" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
      <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center lg:justify-between gap-6">
        <div className="shrink-0 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-px w-12 bg-emerald-500" />
            <span className="text-emerald-400 font-bold uppercase tracking-widest text-xs">SEGUIMIENTO</span>
          </div>
          <div className="flex items-center gap-6">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              Continuar viendo<span className="text-emerald-500">.</span>
            </h1>
            {onRefresh && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.3 }}>
                <LiquidButton onClick={onRefresh} disabled={refreshing} loading={refreshing} activeColor="green" groupId="cw-header-actions" title="Actualizar" className="!bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15">
                  <RotateCcw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} />
                </LiquidButton>
              </motion.div>
            )}
          </div>
          <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
            Películas y episodios que estás viendo.
          </p>
        </div>
        <motion.div className="grid grid-cols-4 gap-2 md:gap-4 w-full lg:w-auto lg:flex lg:justify-end shrink-0" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
          <StatCard label="Títulos" value={stats.total} loading={loading} icon={Play} colorClass="text-emerald-400" />
          <StatCard label="Progreso Medio" value={`${stats.avg}%`} loading={loading} icon={TrendingUp} colorClass="text-purple-400" />
          <StatCard label="Películas" value={stats.movies} loading={loading} icon={Film} colorClass="text-sky-400" />
          <StatCard label="Series" value={stats.series} loading={loading} icon={Tv} colorClass="text-emerald-400" />
        </motion.div>
      </div>
    </motion.header>
  );
}

function ViewToggle({ viewMode, setViewMode }) {
  const btn = (mode, Icon) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`flex-1 lg:flex-none px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === mode ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "text-zinc-400 hover:text-white hover:bg-white/10"}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
  return (
    <div className="flex gap-1 rounded-2xl p-1 h-11 items-center bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
      {btn("cards", Film)}
      {btn("poster", LayoutGrid)}
      {btn("compact", LayoutList)}
    </div>
  );
}
