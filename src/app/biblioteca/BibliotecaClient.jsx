"use client";


import OptimizedImage from "@/components/OptimizedImage";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
  Star,
} from "lucide-react";
import LiquidButton from "@/components/LiquidButton";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import {
  normalizeSearchText,
  titleMatchesQuery,
} from "@/lib/search/titleMatching";
import { TMDB_IMAGE_LANGS_PARAM } from "@/lib/tmdb/imageLanguages";
import { pickBestBackdropByLangResVotes } from "@/lib/dashboard/media";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";


// ================== CONSTANTS ==================

const CACHE_KEY_PREFIX = "showverse:plex-library:v6";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos - coincide con revalidación del servidor
const DEFAULT_FETCH_LIMIT = 2000;
const EXPANDED_FETCH_LIMIT = 10000;
const MAX_LOCALIZED_ARTWORK_IDS_PER_TYPE = 120;
const INITIAL_RENDER_COUNT = 180;
const RENDER_CHUNK_SIZE = 120;
// Nº de tarjetas iniciales (aprox. lo visible al entrar) cuya portada se carga
// de inmediato (eager + prioridad alta) para que aparezca lo antes posible.
const EAGER_IMAGE_COUNT = 24;
const ARTWORK_PREFETCH_AHEAD = 80;

const RESOLUTION_STYLES = {
  "8K": "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
  "4K": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "2160p": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "1440p": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "1080p": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "720p": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "576p": "bg-orange-500/20 text-orange-300 border-orange-500/30",
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

function getCacheKey(limit) {
  return `${CACHE_KEY_PREFIX}:limit:${Number(limit) || DEFAULT_FETCH_LIMIT}`;
}

// useLayoutEffect en cliente, useEffect en servidor (evita el warning de SSR).
// Lo usamos para pintar el contenido cacheado ANTES del primer pintado del
// navegador, sin provocar mismatch de hidratación (el estado inicial server y
// cliente es el mismo: loading=true).
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Caché de los pósters/backdrops localizados de TMDb (mapa tmdbId → path). Se
// persiste para que, al recargar o volver a entrar, las portadas FINALES estén
// disponibles de inmediato y no se vean "tarjetas vacías" mientras se re-resuelven.
const ARTWORK_CACHE_KEY = "showverse:plex-library:artwork:v1";
const ARTWORK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días (las portadas cambian poco)

function readArtworkCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ARTWORK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - Number(parsed?.t || 0) > ARTWORK_CACHE_TTL_MS) {
      window.localStorage.removeItem(ARTWORK_CACHE_KEY);
      return null;
    }
    const norm = (m) => ({
      movie: m?.movie && typeof m.movie === "object" ? m.movie : {},
      tv: m?.tv && typeof m.tv === "object" ? m.tv : {},
    });
    if (!parsed?.poster && !parsed?.backdrop) return null;
    return { poster: norm(parsed.poster), backdrop: norm(parsed.backdrop) };
  } catch {
    return null;
  }
}

function writeArtworkCache(poster, backdrop) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ARTWORK_CACHE_KEY,
      JSON.stringify({ t: Date.now(), poster, backdrop }),
    );
  } catch {
    // cuota excedida: ignoramos
  }
}

// Lee la caché de la biblioteca de forma SÍNCRONA (cualquier antigüedad) para
// poder pintar el contenido —como las demás páginas de usuario— en lugar de
// mostrar el esqueleto. Después se revalida en segundo plano.
function readInitialLibraryCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getCacheKey(DEFAULT_FETCH_LIMIT));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    return cached?.payload || null;
  } catch {
    return null;
  }
}

function buildTmdbImage(path, size = "w1280") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function uniqueImageCandidates(candidates) {
  return Array.from(
    new Set(candidates.filter((src) => typeof src === "string" && src.trim())),
  );
}

// ================== TMDB IMAGE CACHE (nivel módulo, igual que Favoritos/Pendientes) ==================
// Caché persistente entre re-renders: { poster: "/path"|null, backdrop: "/path"|null }
const tmdbImageCache = new Map();
const tmdbImageInFlight = new Map();

// Misma lógica que pickBestPosterEN en Favoritos
function pickBestPosterPath(posters) {
  if (!Array.isArray(posters) || !posters.length) return null;
  const maxVotes = posters.reduce(
    (max, p) => Math.max(max, p.vote_count || 0),
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
    })[0]?.file_path || null
  );
}

// Antes había aquí una copia local que decía ser "la misma lógica que
// pickBestBackdropByLangResVotes", pero se había desviado: solo aceptaba
// inglés y devolvía null si no lo había, sin escalón para otros idiomas ni
// para textless. Un título sin backdrop en inglés acababa cayendo al
// backdrop_path por defecto (sin idioma). Las tarjetas de Biblioteca no
// superponen logo, así que aquí SÍ queremos idioma: usamos el selector
// compartido, que aplica en → es → textless (último recurso).
const pickBestBackdropPath = (backdrops) =>
  pickBestBackdropByLangResVotes(backdrops, {
    preferLangs: ["en", "en-US"],
    minWidth: 1200,
  })?.file_path || null;

// Llamada directa a TMDB desde el navegador (mismo patrón que SmartPoster en Favoritos)
// Obtiene poster y backdrop en una sola petición y los cachea juntos
async function loadTmdbImages(type, id) {
  const key = `${type}:${id}`;
  if (tmdbImageCache.has(key)) return tmdbImageCache.get(key);
  if (tmdbImageInFlight.has(key)) return tmdbImageInFlight.get(key);

  const p = (async () => {
    try {
      const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      if (!apiKey) return { poster: null, backdrop: null };
      const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${apiKey}&${TMDB_IMAGE_LANGS_PARAM}`;
      const r = await fetch(url, { cache: "force-cache" });
      if (!r.ok) return { poster: null, backdrop: null };
      const j = await r.json();
      const result = {
        poster: pickBestPosterPath(j?.posters || []),
        backdrop: pickBestBackdropPath(j?.backdrops || []),
      };
      tmdbImageCache.set(key, result);
      return result;
    } catch {
      return { poster: null, backdrop: null };
    } finally {
      tmdbImageInFlight.delete(key);
    }
  })();

  tmdbImageInFlight.set(key, p);
  return p;
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

function formatResolutionLabel(res) {
  if (!res) return null;
  if (res === "1080p") return "HD";
  if (res === "1440p") return "2K";
  if (res === "2160p" || res === "4K") return "4K";
  return res;
}

// ================== SVG GLYPHS ==================

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

function createLibraryGroupStats() {
  return {
    tmdb: { sum: 0, count: 0, avg: 0 },
    my: { sum: 0, count: 0, avg: 0 },
  };
}

function addLibraryGroupStats(stats, item) {
  if (item.tmdbRating) {
    stats.tmdb.sum += item.tmdbRating;
    stats.tmdb.count++;
  }
  if (item.userRating) {
    stats.my.sum += item.userRating;
    stats.my.count++;
  }
}

function finalizeLibraryGroupStats(stats) {
  if (stats.tmdb.count > 0) stats.tmdb.avg = stats.tmdb.sum / stats.tmdb.count;
  if (stats.my.count > 0) stats.my.avg = stats.my.sum / stats.my.count;
}

function formatAvg(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function StatBox({
  label,
  value,
  icon: Icon,
  imgSrc,
  colorClass,
  horizontal = false,
}) {
  return (
    <div
      className={`flex min-w-0 transition-all duration-300 ${horizontal ? "flex-row items-center gap-1.5 sm:gap-2" : "flex-col items-start"}`}
    >
      <div
        className={`flex items-center gap-1.5 opacity-75 min-w-0 ${horizontal ? "" : "mb-1"}`}
      >
        {imgSrc ? (
          <OptimizedImage
            src={imgSrc}
            alt={label}
            className={`w-auto object-contain opacity-85 shrink-0 transition-all duration-300 ${horizontal ? "h-3.5 sm:h-4" : "h-3 sm:h-3.5"}`}
          />
        ) : Icon ? (
          <Icon
            className={`shrink-0 transition-all duration-300 ${colorClass} ${horizontal ? "w-2.5 h-2.5 sm:w-3 sm:h-3" : "w-3 h-3 sm:w-3.5 sm:h-3.5"}`}
          />
        ) : null}

        {!horizontal && (
          <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-400 truncate">
            {label}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className={`font-black text-white tabular-nums tracking-tight leading-none truncate transition-all duration-300 ${horizontal ? "text-sm sm:text-base" : "text-lg sm:text-xl"}`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

// ================== UI COMPONENTS ==================

function InlineDropdown({
  label,
  valueLabel,
  mobileValueLabel,
  compactMobile = false,
  icon: Icon,
  children,
}) {
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
    return () => {
      document.removeEventListener("pointerdown", onDown);
    };
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
        className="h-11 min-w-0 w-full inline-flex items-center justify-between gap-3 px-4 rounded-2xl transition text-sm lg:min-w-[140px] lg:w-auto lg:max-w-none bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10 focus:outline-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-4 h-4 text-amber-500 shrink-0" />}
          <span
            className={`text-zinc-500 font-bold text-xs uppercase tracking-wider shrink-0 ${compactMobile ? "hidden sm:inline" : ""}`}
          >
            {label}:
          </span>
          <span className="hidden min-w-0 truncate font-semibold text-white sm:inline lg:overflow-visible lg:whitespace-nowrap">
            {valueLabel}
          </span>
          <span className="min-w-0 truncate font-semibold text-white sm:hidden">
            {mobileValueLabel || valueLabel}
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
                className="overflow-y-auto overflow-x-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 shadow-2xl backdrop-blur-2xl p-2"
                style={{
                  ...menuStyle,
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
      {active && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
    </button>
  );
}

function GroupDivider({
  title,
  count,
  total,
  stats,
  mobileFiltersOpen,
  isFirstGroup = false,
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const [isSticky, setIsSticky] = useState(false);
  const ref = useRef(null);
  const [transitioningThreshold, setTransitioningThreshold] = useState(108);

  useEffect(() => {
    if (mobileFiltersOpen) {
      setTransitioningThreshold(232);
    } else {
      const timer = setTimeout(() => {
        setTransitioningThreshold(108);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [mobileFiltersOpen]);

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return;
      const top = ref.current.getBoundingClientRect().top;
      const isLg = window.innerWidth >= 1024;
      const threshold = isLg ? 136 : transitioningThreshold;
      setIsSticky(top <= threshold + 1);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [transitioningThreshold]);

  return (
    <motion.div
      ref={ref}
      className={`sticky z-[60] ${isFirstGroup ? mobileFiltersOpen ? "mt-0 mb-4" : "mt-2 mb-4" : "my-4"} sm:my-6 -mx-2 px-2 sm:mx-0 sm:px-0 transition-[top] duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] lg:top-[136px] ${
        mobileFiltersOpen ? "top-[232px]" : "top-[108px]"
      }`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg transition-all duration-300 ${isSticky ? "shadow-md" : "shadow-xl"}`}
      >
        <div
          className={`relative z-10 px-3 sm:px-6 flex items-center justify-between gap-3 sm:gap-6 transition-all duration-300 ${isSticky ? "py-2 sm:py-2.5" : "py-2.5 sm:py-5"}`}
        >
          <div
            className={`bg-gradient-to-b from-amber-500 to-orange-600 shadow-[0_0_15px_rgba(245,158,11,0.3)] shrink-0 transition-all duration-300 ${isSticky ? "w-2 h-2 rounded-full" : "w-1 sm:w-1.5 h-8 sm:h-12 rounded-full"}`}
          />
          <div
            className={`min-w-0 flex-1 transition-all duration-300 ${isSticky ? "flex flex-wrap items-center gap-x-3 gap-y-1" : ""}`}
          >
            <h2
              className={`font-black tracking-tight text-white leading-tight line-clamp-1 drop-shadow-md transition-all duration-300 ${isSticky ? "text-sm sm:text-base" : "text-base sm:text-2xl"}`}
            >
              {title}
            </h2>
            <div
              className={`text-zinc-500 font-medium flex items-center gap-x-1.5 sm:gap-x-2 transition-all duration-300 ${isSticky ? "mt-0 text-[10px] sm:text-xs" : "mt-0.5 sm:mt-1 text-[10px] sm:text-sm"}`}
            >
              <span className="text-zinc-300 font-bold">{count}</span>
              <span>títulos</span>
              <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-zinc-700" />
              <span className="opacity-90">{pct}%</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {stats?.tmdb?.avg > 0 && (
              <StatBox
                label="TMDb"
                value={formatAvg(stats.tmdb.avg)}
                imgSrc="/logo-TMDb.png"
                horizontal={isSticky}
              />
            )}
            {stats?.my?.avg > 0 && (
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
    </motion.div>
  );
}

// ================== CARD COMPONENTS ==================

function openPlexLink(item) {
  const webUrl = item?.links?.web || null;
  const mobileUrl = item?.links?.mobile || null;
  const mobileAltUrl = item?.links?.mobileAlt || null;
  const mobileRawUrl = item?.links?.mobileRaw || null;
  const playUrl = item?.links?.play || null;
  const playLegacyUrl = item?.links?.playLegacy || null;
  const playRawUrl = item?.links?.playRaw || null;
  const universalUrl = item?.links?.universal || null;
  const androidIntentUrl = item?.links?.androidIntent || null;
  const androidIntentPlayUrl = item?.links?.androidIntentPlay || null;

  if (typeof window === "undefined") return;

  const ua = navigator.userAgent || "";
  const isTouchDevice =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0;
  const isAndroid = /Android/i.test(ua);
  const isIOS =
    /iPad|iPhone|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const isMobileOrTablet =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet/i.test(
      ua,
    ) || isIOS;

  const uniqueCandidates = (urls) =>
    Array.from(new Set(urls.filter((url) => typeof url === "string" && url)));

  const openWithFallback = (urls) => {
    const candidates = uniqueCandidates(urls);
    if (!candidates.length) return;

    let index = 0;
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };

    const onVisibilityChange = () => {
      if (document.hidden) cleanup();
    };

    const tryNext = () => {
      if (index >= candidates.length) {
        cleanup();
        return;
      }

      const nextUrl = candidates[index];
      index += 1;

      if (/^(https?:)/i.test(nextUrl)) {
        cleanup();
        window.location.href = nextUrl;
        return;
      }

      window.location.href = nextUrl;

      if (index < candidates.length) {
        timeoutId = window.setTimeout(() => {
          if (!document.hidden) tryNext();
        }, 900);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    tryNext();
  };

  if (isTouchDevice || isMobileOrTablet) {
    if (isAndroid) {
      openWithFallback([
        androidIntentPlayUrl,
        androidIntentUrl,
        playLegacyUrl,
        playUrl,
        playRawUrl,
        mobileUrl,
        mobileAltUrl,
        mobileRawUrl,
        universalUrl,
        webUrl,
      ]);
      return;
    }

    if (isIOS) {
      openWithFallback([
        mobileUrl,
        mobileAltUrl,
        mobileRawUrl,
        playLegacyUrl,
        playUrl,
        playRawUrl,
        universalUrl,
        webUrl,
      ]);
      return;
    }

    openWithFallback([
      mobileUrl,
      mobileAltUrl,
      mobileRawUrl,
      playLegacyUrl,
      playUrl,
      playRawUrl,
      universalUrl,
      webUrl,
    ]);
    return;
  }

  const desktopUrl =
    webUrl || universalUrl || playUrl || mobileUrl || mobileAltUrl;
  if (desktopUrl) {
    window.open(desktopUrl, "_blank", "noopener,noreferrer");
  }
}

function LibraryHoverIndicator({ isMovie, resolution, compact = false }) {
  const resolutionLabel = formatResolutionLabel(resolution);
  const hasLongResolutionLabel = resolutionLabel?.length > 2;
  const itemClassName = compact ? "h-7 w-8" : "h-9 w-10";
  const iconClassName = compact ? "h-4 w-4" : "h-5 w-5";
  const resolutionClassName = hasLongResolutionLabel
    ? compact
      ? "h-7 px-2 text-base"
      : "h-9 px-2.5 text-xl"
    : compact
      ? "h-7 w-8 text-base"
      : "h-9 w-10 text-xl";

  return (
    <div
      className={`pointer-events-none absolute ${compact ? "bottom-1.5 px-1" : "bottom-2 px-1.5"} ${hasLongResolutionLabel ? "gap-0.5" : ""} left-1/2 z-20 hidden -translate-x-1/2 translate-y-3 scale-95 items-center overflow-hidden rounded-full ${LIQUID_GLASS_PANEL} text-white opacity-0 shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform transform-gpu motion-reduce:transition-none lg:flex lg:group-hover:translate-y-0 lg:group-hover:scale-100 lg:group-hover:opacity-100`}
      aria-hidden="true"
    >
      <span
        className={`flex ${itemClassName} shrink-0 items-center justify-center ${isMovie ? "text-sky-400" : "text-violet-400"}`}
      >
        {isMovie ? (
          <Film className={iconClassName} />
        ) : (
          <MonitorPlay className={iconClassName} />
        )}
      </span>
      {resolutionLabel ? (
        <span
          className={`flex ${resolutionClassName} shrink-0 items-center justify-center font-black leading-none tracking-tight ${getResolutionTextColor(
            resolution,
          )}`}
        >
          {resolutionLabel}
        </span>
      ) : null}
    </div>
  );
}

function LibraryMediaCard({
  item,
  index = 0,
  totalItems = 0,
  viewMode = "grid",
  imageMode = "poster",
  posterSrc = null,
  backdropSrc = null,
  posterPending = false,
  backdropPending = false,
  animated = true,
}) {
  const title = item?.title || "Sin título";
  const year = item?.year ? String(item.year) : "";
  const isMovie = item?.type === "movie";
  const primaryRes = item?.primaryResolution || null;
  const duration = formatDuration(item?.durationMs);
  const canOpen = Boolean(
    item?.links?.web ||
    item?.links?.mobile ||
    item?.links?.mobileAlt ||
    item?.links?.mobileRaw ||
    item?.links?.play ||
    item?.links?.playLegacy ||
    item?.links?.playRaw ||
    item?.links?.universal ||
    item?.links?.androidIntent ||
    item?.links?.androidIntentPlay,
  );
  const effectiveImageMode = viewMode === "list" ? "backdrop" : imageMode;
  const aspectRatio =
    effectiveImageMode === "backdrop" ? "aspect-[16/9]" : "aspect-[2/3]";
  const waitForPosterArtwork = posterPending || (!posterSrc && backdropPending);
  const waitForBackdropArtwork =
    backdropPending || (!backdropSrc && posterPending);
  const posterCandidates = waitForPosterArtwork
    ? uniqueImageCandidates([posterSrc, backdropSrc])
    : uniqueImageCandidates([posterSrc, backdropSrc, item?.thumb, item?.art]);
  const backdropCandidates = waitForBackdropArtwork
    ? uniqueImageCandidates([backdropSrc, posterSrc])
    : uniqueImageCandidates([backdropSrc, posterSrc, item?.art, item?.thumb]);
  const imageCandidates =
    effectiveImageMode === "backdrop" ? backdropCandidates : posterCandidates;
  const imageCandidateKey = imageCandidates.join("|");
  const [imageIndex, setImageIndex] = useState(0);
  const imageSrc = imageCandidates[imageIndex] || null;
  const addedAtLabel = formatEpoch(item?.addedAt);

  // Misma animación de entrada que Favoritos: anima solo las primeras 24
  // tarjetas (lo visible al entrar), independientemente del tamaño de la
  // biblioteca, con un retardo escalonado por índice.
  const animDelay =
    totalItems > 30 ? Math.min(index * 0.015, 0.25) : index * 0.03;
  const shouldAnimate = index < 24;
  const enableHoverLift =
    animated &&
    totalItems <= 120 &&
    (viewMode === "compact" || viewMode === "grid");
  const shellClassName =
    "relative z-0 overflow-visible focus-within:z-[40] hover:z-[50]";

  useEffect(() => {
    setImageIndex(0);
  }, [imageCandidateKey]);

  const openItem = () => {
    if (!canOpen) return;
    openPlexLink(item);
  };

  const renderMedia = () => (
    <div className="relative w-full h-full">
      <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
        {isMovie ? (
          <Film className="w-8 h-8 text-zinc-700" />
        ) : (
          <MonitorPlay className="w-8 h-8 text-zinc-700" />
        )}
      </div>

      {imageSrc && (
        <OptimizedImage
          key={imageSrc}
          src={imageSrc}
          alt={title}
          // Las primeras tarjetas (visibles al entrar) cargan de inmediato para
          // mostrar la portada cuanto antes; el resto, lazy.
          loading={index < EAGER_IMAGE_COUNT ? "eager" : "lazy"}
          fetchPriority={index < EAGER_IMAGE_COUNT ? "high" : "auto"}
          decoding="async"
          onError={() => {
            setImageIndex((prev) =>
              prev < imageCandidates.length - 1
                ? prev + 1
                : imageCandidates.length,
            );
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
    </div>
  );

  if (viewMode === "list") {
    return (
      <motion.div
        className={shellClassName}
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
        <article
          className={`relative block bg-zinc-900/30 rounded-xl transition-colors group overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(239,68,68,0.95)] ${canOpen ? "cursor-pointer hover:bg-zinc-900/60" : ""}`}
          onClick={openItem}
        >
          <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4">
            <div className="w-[180px] sm:w-[280px] aspect-video rounded-lg overflow-hidden relative shadow-md bg-zinc-900 shrink-0">
              {renderMedia()}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="flex items-center gap-2">
                <h4 className="text-white font-bold text-base leading-tight truncate">
                  {title}
                </h4>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 -ml-0.5 flex-wrap">
                {year && <span>{year}</span>}
                {duration && (
                  <>
                    {year && <span>•</span>}
                    <span>{duration}</span>
                  </>
                )}
                {primaryRes && (
                  <>
                    {(year || duration) && <span className="hidden lg:inline">•</span>}
                    <span
                      className={`hidden font-bold lg:inline ${getResolutionTextColor(primaryRes)}`}
                    >
                      {formatResolutionLabel(primaryRes)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </article>
      </motion.div>
    );
  }

  if (viewMode === "compact") {
    return (
      <motion.div
        className={shellClassName}
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
        <div className="block">
          <motion.article
            className={`relative ${aspectRatio} group rounded-lg overflow-hidden bg-zinc-900 shadow-md ${canOpen ? "cursor-pointer" : ""}`}
            whileHover={
              canOpen && enableHoverLift
                ? {
                    scale: 1.15,
                    zIndex: 100,
                    boxShadow:
                      "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
                  }
                : undefined
            }
            transition={
              enableHoverLift
                ? { type: "spring", stiffness: 300, damping: 20 }
                : { duration: 0 }
            }
            style={{
              transformOrigin: "center center",
            }}
            onClick={openItem}
          >
            {renderMedia()}
            <LibraryHoverIndicator
              isMovie={isMovie}
              resolution={primaryRes}
              compact
            />
          </motion.article>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={shellClassName}
      initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.95 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{
        duration: 0.25,
        delay: shouldAnimate ? animDelay : 0,
      }}
      layout
    >
      <div className="block">
        <article
          className={`relative ${aspectRatio} group rounded-xl overflow-hidden bg-zinc-900 shadow-md lg:hover:shadow-red-900/20 transition-shadow duration-300 ${canOpen ? "cursor-pointer" : ""}`}
          onClick={openItem}
        >
          <div className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] transition-shadow duration-300 group-hover:shadow-[inset_0_0_0_2.5px_rgba(239,68,68,0.95)]" />
          {renderMedia()}
          <LibraryHoverIndicator isMovie={isMovie} resolution={primaryRes} />
        </article>
      </div>
    </motion.div>
  );
}

// ================== MAIN COMPONENT ==================

export default function BibliotecaClient() {
  const { preferences, updatePreference, authenticated, hydrated } = useAuth();
  const { t } = useTranslation();

  // Estado inicial IDÉNTICO en servidor y cliente (loading=true) para no romper
  // la hidratación. El contenido cacheado se aplica en un layout effect (abajo),
  // antes del primer pintado, así no se ve el esqueleto en visitas repetidas.
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  // `mounted` es false en el servidor y en el primer render del cliente (idénticos
  // → hidratación limpia). Hasta que monta, el área de contenido NO pinta nada:
  // así, al recargar, NO se ve el esqueleto del HTML del servidor. El layout
  // effect aplica la caché antes del pintado, de modo que el contenido aparece de
  // inmediato (y el esqueleto solo se muestra si de verdad no hay caché).
  const [mounted, setMounted] = useState(false);

  // Ref espejo de `data` para que fetchLibrary (callback estable) sepa si ya hay
  // contenido y revalide en 2º plano (refreshing) en vez de mostrar el esqueleto.
  const dataRef = useRef(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Pintado instantáneo desde caché tras montar, SIN esperar a la hidratación de
  // auth. Al ser layout effect se aplica antes del pintado: en visitas repetidas
  // no se ve el esqueleto.
  useIsoLayoutEffect(() => {
    const cached = readInitialLibraryCache();
    if (cached) {
      dataRef.current = cached;
      setData(cached);
      setLoading(false);
    }
    setMounted(true);
  }, []);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [resFilter, setResFilter] = useState("all");
  const [sortBy, setSortBy] = useState("added-desc");
  const [groupBy, setGroupBy] = useState("none");
  // Modo de vista e imagen: valor por defecto ESTABLE (igual en servidor y
  // cliente) para no romper la hidratación —los toggles y las columnas de la
  // rejilla dependen de estos valores—. El valor guardado se aplica en un layout
  // effect ANTES del primer pintado, así no hay ni parpadeo ni mismatch.
  const [viewMode, setViewModeState] = useState("grid");
  const [imageMode, setImageMode] = useState("poster");
  // Marca si el usuario ya fijó una vista propia: en ese caso la preferencia
  // global NO debe sobrescribirla de forma asíncrona.
  const viewModeUserSetRef = useRef(false);

  useIsoLayoutEffect(() => {
    const savedView = window.localStorage.getItem(
      "showverse:biblioteca:viewMode",
    );
    if (savedView === "list" || savedView === "grid" || savedView === "compact") {
      viewModeUserSetRef.current = true;
      setViewModeState(savedView);
    }
    const savedImage = window.localStorage.getItem(
      "showverse:biblioteca:imageMode",
    );
    if (savedImage === "poster" || savedImage === "backdrop") {
      setImageMode(savedImage);
    }
  }, []);

  useEffect(() => {
    // La preferencia global solo aplica cuando el usuario aún no tiene una vista
    // propia para Biblioteca (evita el parpadeo al recargar).
    if (viewModeUserSetRef.current) return;
    if (
      preferences?.defaultView &&
      ["list", "grid", "compact"].includes(preferences.defaultView)
    ) {
      setViewModeState(preferences.defaultView);
    }
  }, [preferences?.defaultView]);

  const setViewMode = useCallback((mode) => {
    viewModeUserSetRef.current = true;
    setViewModeState(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("showverse:biblioteca:viewMode", mode);
    }
    if (authenticated) {
      updatePreference({ defaultView: mode });
    }
  }, [authenticated, updatePreference]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isExpandingDataset, setIsExpandingDataset] = useState(false);
  const [hasExpandedDataset, setHasExpandedDataset] = useState(false);
  const [expansionAttempted, setExpansionAttempted] = useState(false);
  // Hidratación SÍNCRONA de los pósters localizados desde caché: en recarga/acceso
  // las portadas finales ya están disponibles, así no se ven "tarjetas vacías".
  // (No afecta a la hidratación SSR: las tarjetas solo se renderizan tras `mounted`.)
  const [localizedPosterMap, setLocalizedPosterMap] = useState(
    () => readArtworkCache()?.poster || { movie: {}, tv: {} },
  );
  const [localizedBackdropMap, setLocalizedBackdropMap] = useState(
    () => readArtworkCache()?.backdrop || { movie: {}, tv: {} },
  );

  // Persistimos los pósters/backdrops resueltos para reutilizarlos al recargar.
  // No escribimos mapas vacíos (no machacar la caché antes de resolver nada).
  useEffect(() => {
    const hasContent =
      Object.keys(localizedPosterMap.movie).length > 0 ||
      Object.keys(localizedPosterMap.tv).length > 0 ||
      Object.keys(localizedBackdropMap.movie).length > 0 ||
      Object.keys(localizedBackdropMap.tv).length > 0;
    if (!hasContent) return;
    writeArtworkCache(localizedPosterMap, localizedBackdropMap);
  }, [localizedPosterMap, localizedBackdropMap]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT);
  const loadMoreRef = useRef(null);
  const deferredQuery = useDeferredValue(query);
  const filtersRef = useRef(null);
  const { isSticky: filtersSticky, isPinned: filtersPinned } =
    useStickyToolbarState(filtersRef);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:biblioteca:imageMode", imageMode);
  }, [imageMode]);

  const fetchLibrary = useCallback(
    async ({
      force = false,
      limit = DEFAULT_FETCH_LIMIT,
      background = false,
      markExpanded = false,
    } = {}) => {
      const MAX_INITIAL_RETRIES = 3;
      const INITIAL_RETRY_DELAY_MS = 700;
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
          const raw = window.localStorage.getItem(cacheKey);
          if (raw) {
            const cached = JSON.parse(raw);
            if (
              cached?.timestamp &&
              now - Number(cached.timestamp) < CACHE_TTL_MS &&
              cached?.payload
            ) {
              setData(cached.payload);
              setError("");
              setLoading(false);
              if (
                markExpanded ||
                safeLimit > DEFAULT_FETCH_LIMIT ||
                !cached?.payload?.summary?.truncated
              ) {
                setHasExpandedDataset(true);
              }
              return;
            }
          }
        } catch {
          // ignore
        }
      }

      // Si ya hay contenido en pantalla (caché), revalidamos en 2º plano sin
      // mostrar el esqueleto; solo mostramos esqueleto cuando no hay nada que ver.
      if (force || background || dataRef.current) setRefreshing(true);
      else setLoading(true);
      if (background) setIsExpandingDataset(true);

      // En el primer acceso el backend puede estar frío o la conexión Plex aún no
      // estar lista. Reintentamos en silencio manteniendo el esqueleto en vez de
      // mostrar el error y luego cargar (el "flash" que veía el usuario).
      const isInitialLoad = !force && !background;
      const maxAttempts = isInitialLoad ? MAX_INITIAL_RETRIES + 1 : 1;
      let lastErr = null;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          // Primer intento aprovecha caché del navegador; refresh manual o
          // reintentos fuerzan datos frescos (la caché podría tener un
          // available:false transitorio).
          const response = await fetch(`/api/plex/library?limit=${safeLimit}`, {
            cache: force || attempt > 0 ? "no-store" : "force-cache",
          });
          const json = await response.json().catch(() => null);

          if (!response.ok || !json?.available) {
            throw new Error(
              json?.message ||
                json?.error ||
                "No se pudo cargar la biblioteca Plex.",
            );
          }

          setData(json);
          setError("");
          if (
            markExpanded ||
            safeLimit > DEFAULT_FETCH_LIMIT ||
            !json?.summary?.truncated
          ) {
            setHasExpandedDataset(true);
          }

          if (hasWindow) {
            const payload = JSON.stringify({ timestamp: now, payload: json });
            window.localStorage.setItem(cacheKey, payload);
            if (safeLimit > DEFAULT_FETCH_LIMIT) {
              window.localStorage.setItem(
                getCacheKey(DEFAULT_FETCH_LIMIT),
                payload,
              );
            }
          }

          lastErr = null;
          break; // éxito
        } catch (err) {
          lastErr = err;
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, INITIAL_RETRY_DELAY_MS * (attempt + 1)),
            );
          }
        }
      }

      // Si ya teníamos contenido en pantalla, no rompemos la vista con la
      // pantalla de error por un fallo de revalidación: mantenemos lo mostrado.
      if (lastErr && !background && !dataRef.current) {
        setError(
          lastErr instanceof Error ? lastErr.message : "Error desconocido.",
        );
      }
      setLoading(false);
      setRefreshing(false);
      if (background) setIsExpandingDataset(false);
    },
    [],
  );

  useEffect(() => {
    // Esperamos a la hidratación de auth para no lanzar el fetch antes de que la
    // sesión/conexión esté lista (causa del available:false en el primer acceso).
    if (!hydrated) return;
    fetchLibrary({ limit: DEFAULT_FETCH_LIMIT });
  }, [fetchLibrary, hydrated]);

  useEffect(() => {
    if (!data?.summary?.truncated) return;
    if (hasExpandedDataset || isExpandingDataset || expansionAttempted) return;
    setExpansionAttempted(true);
    fetchLibrary({
      limit: EXPANDED_FETCH_LIMIT,
      background: true,
      markExpanded: true,
    });
  }, [
    data?.summary?.truncated,
    hasExpandedDataset,
    isExpandingDataset,
    expansionAttempted,
    fetchLibrary,
  ]);

  const summary = useMemo(() => data?.summary || {}, [data]);

  const resolutionCounts = useMemo(() => {
    const serverCounts = summary?.resolutionCounts || {};
    if (!summary?.truncated) return serverCounts;

    const base = Array.isArray(data?.items) ? data.items : [];
    if (!base.length) return serverCounts;

    const localCounts = {};
    for (const item of base) {
      const resolutions = Array.isArray(item?.resolutions)
        ? item.resolutions
        : [];
      for (const resolution of resolutions) {
        localCounts[resolution] = (localCounts[resolution] || 0) + 1;
      }
    }
    return localCounts;
  }, [summary, data]);

  const availableResolutions = useMemo(() => {
    const ordered = RESOLUTION_ORDER.filter(
      (r) => Number(resolutionCounts[r] || 0) > 0,
    );
    const extras = Object.entries(resolutionCounts)
      .filter(
        ([r, count]) => Number(count) > 0 && !RESOLUTION_ORDER.includes(r),
      )
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

  const filteredItems = useMemo(() => {
    const base = Array.isArray(data?.items) ? data.items : [];
    const normalizedQuery = normalizeSearchText(deferredQuery);

    const filtered = base.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (resFilter !== "all") {
        const resolutions = Array.isArray(item.resolutions)
          ? item.resolutions
          : [];
        if (!resolutions.includes(resFilter)) return false;
      }
      if (!normalizedQuery) return true;
      return titleMatchesQuery(item, normalizedQuery, ["sectionTitle"]);
    });

    return filtered.sort((a, b) => {
      if (sortBy === "title-asc")
        return String(a.title || "").localeCompare(
          String(b.title || ""),
          "es",
          { sensitivity: "base" },
        );
      if (sortBy === "year-desc")
        return Number(b.year || 0) - Number(a.year || 0);
      if (sortBy === "year-asc")
        return Number(a.year || 0) - Number(b.year || 0);
      if (sortBy === "added-asc")
        return Number(a.addedAt || 0) - Number(b.addedAt || 0);
      return Number(b.addedAt || 0) - Number(a.addedAt || 0);
    });
  }, [data, deferredQuery, typeFilter, resFilter, sortBy]);

  useEffect(() => {
    setVisibleCount(INITIAL_RENDER_COUNT);
  }, [
    query,
    typeFilter,
    resFilter,
    sortBy,
    groupBy,
    viewMode,
    imageMode,
    data?.items?.length,
  ]);

  const maxArtworkScanCount = Math.min(
    filteredItems.length,
    visibleCount + ARTWORK_PREFETCH_AHEAD,
  );
  const artworkScanItems = useMemo(
    () => filteredItems.slice(0, maxArtworkScanCount),
    [filteredItems, maxArtworkScanCount],
  );

  const hasMoreItems = filteredItems.length > visibleCount;
  const loadMoreItems = useCallback(() => {
    setVisibleCount((prev) =>
      Math.min(prev + RENDER_CHUNK_SIZE, filteredItems.length),
    );
  }, [filteredItems.length]);

  useEffect(() => {
    if (!hasMoreItems) return;
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadMoreItems();
        }
      },
      { rootMargin: "300px 0px 300px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreItems, loadMoreItems]);

  const missingArtworkIdsByType = useMemo(() => {
    const out = {
      poster: { movie: [], tv: [] },
      backdrop: { movie: [], tv: [] },
    };
    const seen = {
      poster: { movie: new Set(), tv: new Set() },
      backdrop: { movie: new Set(), tv: new Set() },
    };

    for (const item of artworkScanItems) {
      const type =
        item?.tmdbType === "movie"
          ? "movie"
          : item?.tmdbType === "tv"
            ? "tv"
            : null;
      if (!type) continue;

      const tmdbId = Number(item?.tmdbId || 0);
      if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;

      const key = String(tmdbId);

      // Poster: only add if not already fetched (key in map handles null correctly)
      if (
        !(localizedPosterMap[type] && key in localizedPosterMap[type]) &&
        !seen.poster[type].has(key) &&
        out.poster[type].length < MAX_LOCALIZED_ARTWORK_IDS_PER_TYPE
      ) {
        seen.poster[type].add(key);
        out.poster[type].push(tmdbId);
      }

      // Backdrop: only add if not already fetched
      if (
        !(localizedBackdropMap[type] && key in localizedBackdropMap[type]) &&
        !seen.backdrop[type].has(key) &&
        out.backdrop[type].length < MAX_LOCALIZED_ARTWORK_IDS_PER_TYPE
      ) {
        seen.backdrop[type].add(key);
        out.backdrop[type].push(tmdbId);
      }
    }

    return out;
  }, [artworkScanItems, localizedPosterMap, localizedBackdropMap]);

  useEffect(() => {
    const { poster, backdrop } = missingArtworkIdsByType;
    // Unificar IDs por tipo: poster y backdrop se obtienen en una sola llamada a TMDB
    const movieIds = [...new Set([...poster.movie, ...backdrop.movie])];
    const tvIds = [...new Set([...poster.tv, ...backdrop.tv])];
    if (!movieIds.length && !tvIds.length) return;

    let aborted = false;

    (async () => {
      // Llamadas directas a TMDB desde el navegador (mismo criterio que Favoritos/Pendientes)
      // Cada petición obtiene poster + backdrop juntos y queda cacheada en el módulo
      const allFetches = [
        ...movieIds.map((id) =>
          loadTmdbImages("movie", id).then((r) => ({
            type: "movie",
            id,
            ...r,
          })),
        ),
        ...tvIds.map((id) =>
          loadTmdbImages("tv", id).then((r) => ({ type: "tv", id, ...r })),
        ),
      ];

      const results = await Promise.all(allFetches);
      if (aborted) return;

      const posterUpdates = { movie: {}, tv: {} };
      const backdropUpdates = { movie: {}, tv: {} };
      for (const r of results) {
        posterUpdates[r.type][String(r.id)] = r.poster;
        backdropUpdates[r.type][String(r.id)] = r.backdrop;
      }

      setLocalizedPosterMap((prev) => ({
        movie: { ...prev.movie, ...posterUpdates.movie },
        tv: { ...prev.tv, ...posterUpdates.tv },
      }));
      setLocalizedBackdropMap((prev) => ({
        movie: { ...prev.movie, ...backdropUpdates.movie },
        tv: { ...prev.tv, ...backdropUpdates.tv },
      }));
    })();

    return () => {
      aborted = true;
    };
  }, [missingArtworkIdsByType]);

  const stats = useMemo(
    () => ({
      total: summary?.totalItems || 0,
      movies: summary?.moviesCount || 0,
      shows: summary?.showsCount || 0,
    }),
    [summary],
  );

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

    const entries = Array.from(groups.entries()).map(([key, items]) => {
      const stats = createLibraryGroupStats();
      for (const item of items) {
        addLibraryGroupStats(stats, item);
      }
      finalizeLibraryGroupStats(stats);

      return { key, label: key, items, stats };
    });

    // Sort groups
    if (groupBy === "resolution") {
      entries.sort((a, b) => {
        const ia = RESOLUTION_ORDER.indexOf(a.key);
        const ib = RESOLUTION_ORDER.indexOf(b.key);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
    } else if (groupBy === "year") {
      entries.sort((a, b) => {
        const na = Number.parseInt(a.key) || 0;
        const nb = Number.parseInt(b.key) || 0;
        return nb - na;
      });
    } else if (groupBy === "decade") {
      entries.sort((a, b) => {
        const na = Number.parseInt(a.key) || 0;
        const nb = Number.parseInt(b.key) || 0;
        return nb - na;
      });
    } else {
      entries.sort((a, b) => b.items.length - a.items.length);
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
  const visibleRenderedCount = Math.min(visibleCount, filteredItems.length);
  const shouldAnimateCards = filteredItems.length <= 180;
  // El contenedor no anima: cada tarjeta se anima por sí misma (como Favoritos).
  const contentMotionProps = { initial: false };

  function getItemsGridClass(withTopMargin = false) {
    if (viewMode === "list") {
      return `grid grid-cols-1 xl:grid-cols-2 gap-4${withTopMargin ? " mt-6" : ""}`;
    }
    if (viewMode === "compact") {
      const compactCols =
        imageMode === "backdrop"
          ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4"
          : "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8";
      return `grid gap-2 ${compactCols}${withTopMargin ? " mt-6" : ""}`;
    }
    const gridCols =
      imageMode === "backdrop"
        ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3"
        : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6";
    return `grid gap-3 ${gridCols}${withTopMargin ? " mt-6" : ""}`;
  }

  function getTmdbArtworkState(item, kind) {
    const tmdbType =
      item?.tmdbType === "movie"
        ? "movie"
        : item?.tmdbType === "tv"
          ? "tv"
          : null;
    const tmdbId = Number(item?.tmdbId || 0);

    if (tmdbType && Number.isFinite(tmdbId) && tmdbId > 0) {
      const key = String(tmdbId);
      const map =
        kind === "backdrop"
          ? localizedBackdropMap[tmdbType]
          : localizedPosterMap[tmdbType];
      const fetched = map != null && key in map;

      if (!fetched) {
        return { src: null, pending: true };
      }

      const localizedPath = map[key];
      if (localizedPath) {
        return {
          src: buildTmdbImage(
            localizedPath,
            kind === "backdrop" ? "w1280" : "w500",
          ),
          pending: false,
        };
      }
      return { src: null, pending: false };
    }

    return { src: null, pending: false };
  }

  function renderCard(item, index = 0, totalItems = 0) {
    const posterArtwork = getTmdbArtworkState(item, "poster");
    const backdropArtwork = getTmdbArtworkState(item, "backdrop");

    return (
      <LibraryMediaCard
        key={item.id}
        item={item}
        index={index}
        totalItems={totalItems}
        viewMode={viewMode}
        imageMode={imageMode}
        posterSrc={posterArtwork.src}
        backdropSrc={backdropArtwork.src}
        posterPending={posterArtwork.pending}
        backdropPending={backdropArtwork.pending}
        animated={shouldAnimateCards}
      />
    );
  }

  // Filter dropdowns (shared between mobile & desktop)
  function renderTypeDropdown() {
    const mobileTypeLabels = { all: "Todo", movie: "Pelis", show: "Series" };
    return (
      <InlineDropdown
        label="Tipo"
        valueLabel={typeLabels[typeFilter]}
        mobileValueLabel={
          mobileTypeLabels[typeFilter] || typeLabels[typeFilter]
        }
        icon={Filter}
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
    );
  }

  function renderResDropdown() {
    const mobileResLabel = resFilter === "all" ? "Todas" : resFilter;
    return (
      <InlineDropdown
        label="Resolución"
        valueLabel={resLabel}
        mobileValueLabel={mobileResLabel}
        icon={MonitorPlay}
      >
        {({ close }) => (
          <>
            <DropdownItem
              active={resFilter === "all"}
              onClick={() => {
                setResFilter("all");
                close();
              }}
            >
              Todas
            </DropdownItem>
            {availableResolutions.map((res) => (
              <DropdownItem
                key={res}
                active={resFilter === res}
                onClick={() => {
                  setResFilter(res);
                  close();
                }}
              >
                {res}
              </DropdownItem>
            ))}
          </>
        )}
      </InlineDropdown>
    );
  }

  function renderSortDropdown() {
    const mobileSortLabels = {
      "added-desc": "Reciente",
      "added-asc": "Antiguo",
      "title-asc": "A-Z",
      "year-desc": "Año ↓",
      "year-asc": "Año ↑",
    };
    return (
      <InlineDropdown
        label="Orden"
        valueLabel={sortLabels[sortBy]}
        mobileValueLabel={mobileSortLabels[sortBy]}
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
    );
  }

  function renderGroupDropdown() {
    const mobileGroupLabels = {
      none: "Sin agr.",
      resolution: "Res",
      type: "Tipo",
      year: "Año",
      decade: "Déc",
      section: "Sec",
    };
    return (
      <InlineDropdown
        label="Agrupar"
        valueLabel={groupLabels[groupBy]}
        mobileValueLabel={mobileGroupLabels[groupBy]}
        compactMobile
        icon={Layers3}
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
    );
  }

  function renderViewToggle() {
    const active =
      "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20";
    const inactive = "text-zinc-400 hover:text-white hover:bg-white/10";

    return (
      <div className="flex rounded-2xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
        <button
          type="button"
          onClick={() => setViewMode("list")}
          className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "list" ? active : inactive}`}
          title="Lista"
        >
          <LayoutList className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setViewMode("compact")}
          className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "compact" ? active : inactive}`}
          title="Compacta"
        >
          <Grid3x3 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setViewMode("grid")}
          className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === "grid" ? active : inactive}`}
          title="Grid"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
      </div>
    );
  }

  function renderImageToggle() {
    const active =
      "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20";
    const inactive = "text-zinc-400 hover:text-white hover:bg-white/10";

    return (
      <div className="flex rounded-2xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
        <button
          type="button"
          onClick={() => setImageMode("poster")}
          className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${imageMode === "poster" ? active : inactive}`}
          title="Poster"
        >
          <PosterGlyph className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setImageMode("backdrop")}
          className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${imageMode === "backdrop" ? active : inactive}`}
          title="Backdrop"
        >
          <BackdropGlyph className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Render items (flat or grouped)
  function renderContent() {
    const visibleLimit = Math.min(visibleCount, filteredItems.length);

    // Servidor y primer render del cliente: no pintamos contenido (ni esqueleto).
    // El layout effect aplica la caché antes del pintado, así al recargar NO se ve
    // el esqueleto del HTML del servidor. Reservamos algo de alto para evitar
    // saltos de layout mientras el contenido aparece.
    if (!mounted) {
      return <div key="content-placeholder" className="min-h-[60vh]" />;
    }

    // Montado pero todavía sin contenido y cargando (p. ej. primer acceso sin
    // caché): esqueletos *inline* dentro del shell, no a pantalla completa.
    if (loading && filteredItems.length === 0) {
      return (
        <div key="loading-skeleton" className={getItemsGridClass(true)}>
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-white/5"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-neutral-800/50 via-neutral-900/50 to-neutral-800/50 animate-pulse" />
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"
                style={{ backgroundSize: "200% 100%" }}
              />
            </div>
          ))}
        </div>
      );
    }

    if (filteredItems.length === 0) {
      return (
        <motion.div
          key="empty-state"
          className="py-24 text-center border border-dashed border-white/10 rounded-[2rem] bg-black/20 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-lg shadow-lg mt-6"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <FolderKanban className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
          <p className="text-xl font-bold text-white mb-2">Sin resultados</p>
          <p className="text-zinc-500 mb-6">
            Ajusta los filtros o prueba otra búsqueda.
          </p>
          {(query || typeFilter !== "all" || resFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTypeFilter("all");
                setResFilter("all");
              }}
              className="mt-6 px-5 py-2.5 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-md shadow-lg text-zinc-200 font-bold rounded-xl transition-colors hover:text-white hover:from-white/15 hover:to-white/10 text-sm"
            >
              Limpiar filtros
            </button>
          )}
        </motion.div>
      );
    }

    if (grouped) {
      let remaining = visibleLimit;
      const visibleGrouped = [];
      for (const group of grouped) {
        if (remaining <= 0) break;
        const visibleItems = group.items.slice(0, remaining);
        if (!visibleItems.length) continue;
        visibleGrouped.push({ ...group, items: visibleItems });
        remaining -= group.items.length;
      }

      return (
        <motion.div
          key={`grouped-${viewMode}-${imageMode}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {visibleGrouped.map((group, groupIndex) => (
            <div key={group.key}>
              <GroupDivider
                title={group.label}
                count={group.items.length}
                total={filteredItems.length}
                stats={group.stats}
                mobileFiltersOpen={mobileFiltersOpen}
                isFirstGroup={groupIndex === 0}
              />
              <motion.div
                key={`group-grid-${group.key}-${viewMode}-${imageMode}`}
                className={getItemsGridClass(true)}
                {...contentMotionProps}
              >
                {group.items.map((item, idx) =>
                  renderCard(item, idx, group.items.length),
                )}
              </motion.div>
            </div>
          ))}

          {hasMoreItems && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={loadMoreItems}
                className="px-6 py-3 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-lg shadow-lg text-zinc-200 font-bold rounded-xl transition-colors hover:text-white hover:from-white/15 hover:to-white/10 text-sm"
              >
                Cargar más ({visibleLimit}/{filteredItems.length})
              </button>
              <div ref={loadMoreRef} className="h-2 w-full" />
            </div>
          )}
        </motion.div>
      );
    }

    const visibleItems = filteredItems.slice(0, visibleLimit);
    return (
      <motion.div
        key={`flat-grid-${viewMode}-${imageMode}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <motion.div
          className={getItemsGridClass(false)}
          {...contentMotionProps}
        >
          {visibleItems.map((item, idx) =>
            renderCard(item, idx, visibleItems.length),
          )}
        </motion.div>
        {hasMoreItems && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={loadMoreItems}
              className="px-6 py-3 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-lg shadow-lg text-zinc-200 font-bold rounded-xl transition-colors hover:text-white hover:from-white/15 hover:to-white/10 text-sm"
            >
              Cargar más ({visibleLimit}/{filteredItems.length})
            </button>
            <div ref={loadMoreRef} className="h-2 w-full" />
          </div>
        )}
      </motion.div>
    );
  }

  // Nota: ya NO hay un estado de carga a pantalla completa. Igual que Favoritos y
  // Pendientes, el shell (fondo, header animado, filtros) se renderiza siempre y
  // la rejilla muestra esqueletos *inline* mientras carga (ver renderContent).

  // ===== ERROR STATE =====
  if (error) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-zinc-100 font-sans selection:bg-amber-500/30">
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-amber-600/15 blur-[120px] sm:blur-[150px]" />
          <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-amber-700/20 blur-[120px] sm:blur-[150px]" />
          <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-orange-800/25 blur-[120px] sm:blur-[150px]" />
        </div>
        <div className="relative z-10 text-center">
          <Clapperboard className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            No se pudo cargar Plex
          </h2>
          <p className="text-zinc-500 mb-6 max-w-md">{error}</p>
          <button
            type="button"
            onClick={() =>
              fetchLibrary({
                force: true,
                limit: hasExpandedDataset
                  ? EXPANDED_FETCH_LIMIT
                  : DEFAULT_FETCH_LIMIT,
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
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-amber-600/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-amber-700/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-orange-800/25 blur-[120px] sm:blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* ====== HEADER ====== */}
        <motion.header
          className="mb-6 sm:mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px w-12 bg-amber-500" />
                <span className="text-amber-400 font-bold uppercase tracking-widest text-xs">
                  PLEX SERVER
                </span>
              </div>
              <div className="flex items-center gap-4">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                  Biblioteca<span className="text-amber-500">.</span>
                </h1>
                <LiquidButton
                  onClick={() =>
                    fetchLibrary({
                      force: true,
                      limit: hasExpandedDataset
                        ? EXPANDED_FETCH_LIMIT
                        : DEFAULT_FETCH_LIMIT,
                    })
                  }
                  disabled={refreshing}
                  loading={refreshing}
                  activeColor="amber"
                  title="Actualizar"
                  className="!bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15"
                >
                  <RefreshCw
                    className={`w-5 h-5 text-white ${refreshing ? "animate-spin" : ""}`}
                  />
                </LiquidButton>
              </div>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
                Contenido del servidor Plex.
              </p>
            </div>

            {!loading && (
            <motion.div
              className="flex gap-3 md:gap-4 w-full lg:w-auto justify-center lg:justify-end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="relative overflow-hidden flex-1 lg:flex-none lg:min-w-[120px] rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="relative z-10 mb-1 text-amber-400">
                  <HardDrive className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <div className="relative z-10 text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight drop-shadow-md">
                  {stats.total}
                </div>
                <div className="relative z-10 text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wider text-center leading-tight">
                  Total
                </div>
              </div>
              <div className="relative overflow-hidden flex-1 lg:flex-none lg:min-w-[120px] rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="relative z-10 mb-1 text-sky-400">
                  <Film className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <div className="relative z-10 text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight drop-shadow-md">
                  {stats.movies}
                </div>
                <div className="relative z-10 text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wider text-center leading-tight">
                  Películas
                </div>
              </div>
              <div className="relative overflow-hidden flex-1 lg:flex-none lg:min-w-[120px] rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="relative z-10 mb-1 text-purple-400">
                  <Tv className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <div className="relative z-10 text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight drop-shadow-md">
                  {stats.shows}
                </div>
                <div className="relative z-10 text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wider text-center leading-tight">
                  Series
                </div>
              </div>
            </motion.div>
            )}
          </div>
        </motion.header>

        {/* ====== FILTERS ====== */}
        <motion.div
          ref={filtersRef}
          data-menu-pinned={filtersPinned}
          className={`sticky top-14 z-[70] space-y-1 transition-all duration-300 sm:top-20 sm:mb-5 lg:mb-6 ${
            groupBy === "none" ? "mb-6" : "mb-2"
          }`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          {/* Mobile: search + toggle */}
          <div className="relative z-10 flex gap-2 lg:hidden">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 z-10 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${mobileFiltersOpen ? "text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "text-zinc-200 hover:bg-black/30"}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* En flujo antes de fijarse y como overlay cuando la barra ya está
              adherida al navbar móvil. */}
          <div
            className={`grid overflow-hidden transition-[grid-template-rows] duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
              mobileFiltersOpen ? "" : "pointer-events-none"
            } lg:hidden z-[80] ${
              filtersSticky
                ? "absolute left-0 right-0"
                : "relative mt-1"
            }`}
            style={{
              gridTemplateRows: mobileFiltersOpen ? "1fr" : "0fr",
              ...(filtersSticky ? { top: "calc(100% + 4px)" } : {}),
            }}
          >
            <div className="min-h-0">
              <div className="space-y-1 pt-1 pb-1">
                <div className="flex gap-2">
                  <div className="flex-1">{renderTypeDropdown()}</div>
                  <div className="flex-1">{renderResDropdown()}</div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">{renderSortDropdown()}</div>
                  <div className="flex-1">{renderGroupDropdown()}</div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-2">
                    <div className="flex rounded-2xl p-1 h-11 items-center flex-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                      <button
                        type="button"
                        onClick={() => setViewMode("list")}
                        className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${viewMode === "list" ? "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-white/10"}`}
                        title="Lista"
                      >
                        <LayoutList className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("compact")}
                        className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${viewMode === "compact" ? "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-white/10"}`}
                        title="Compacta"
                      >
                        <Grid3x3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("grid")}
                        className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${viewMode === "grid" ? "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-white/10"}`}
                        title="Grid"
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                    </div>
                    {viewMode !== "list" && (
                      <button
                        type="button"
                        onClick={() =>
                          setImageMode(
                            imageMode === "poster" ? "backdrop" : "poster",
                          )
                        }
                        className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${imageMode === "backdrop" ? "text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "text-zinc-200 hover:bg-black/30"}`}
                        title={
                          imageMode === "poster"
                            ? "Cambiar a Backdrop"
                            : "Cambiar a Poster"
                        }
                      >
                        {imageMode === "poster" ? (
                          <PosterGlyph className="w-4 h-4" />
                        ) : (
                          <BackdropGlyph className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop filters */}
          <div className="hidden lg:flex gap-3 relative z-10">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 z-10 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en biblioteca..."
                className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                </button>
              )}
            </div>

            {renderTypeDropdown()}
            {renderResDropdown()}
            {renderSortDropdown()}
            {renderGroupDropdown()}

            <div className="shrink-0">{renderViewToggle()}</div>
            {viewMode !== "list" && (
              <div className="shrink-0">{renderImageToggle()}</div>
            )}
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

        {/* Mensaje de renderizado progresivo eliminado por solicitud del usuario */}

        {/* ====== CONTENT ====== */}
        <AnimatePresence mode="wait">{renderContent()}</AnimatePresence>
      </div>
    </div>
  );
}
