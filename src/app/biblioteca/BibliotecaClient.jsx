"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
const MAX_LOCALIZED_ARTWORK_IDS_PER_TYPE = 120;
const INITIAL_RENDER_COUNT = 180;
const RENDER_CHUNK_SIZE = 120;
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

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

function getCacheKey(limit) {
  return `${CACHE_KEY_PREFIX}:limit:${Number(limit) || DEFAULT_FETCH_LIMIT}`;
}

function buildTmdbImage(path, size = "w1280") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
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

// Misma lógica que pickBestBackdropByLangResVotes en Favoritos
function pickBestBackdropPath(backdrops) {
  if (!Array.isArray(backdrops) || !backdrops.length) return null;
  const minWidth = 1200;
  const pool0 = backdrops.filter((b) => (b?.width || 0) >= minWidth);
  const pool = pool0.length ? pool0 : backdrops;
  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const preferSet = new Set(["en"]);
  const isPreferred = (b) => {
    if (b?.iso_639_1 == null) return false;
    return preferSet.has(norm(b.iso_639_1));
  };
  const top3 = [];
  for (const b of pool) {
    if (isPreferred(b)) top3.push(b);
    if (top3.length === 3) break;
  }
  if (!top3.length) return null;
  const isRes = (b, w, h) =>
    (b?.width || 0) === w && (b?.height || 0) === h;
  return (
    top3.find((b) => isRes(b, 1920, 1080)) ||
    top3.find((b) => isRes(b, 2560, 1440)) ||
    top3.find((b) => isRes(b, 3840, 2160)) ||
    top3.find((b) => isRes(b, 1280, 720)) ||
    top3[0]
  )?.file_path || null;
}

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
      const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${apiKey}&include_image_language=en,en-US,null`;
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
    <div ref={ref} className="relative w-full shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-11 w-full inline-flex items-center justify-between gap-3 px-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-sm text-zinc-300"
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

function LibraryMediaCard({
  item,
  index = 0,
  totalItems = 0,
  viewMode = "grid",
  imageMode = "poster",
  posterSrc = null,
  backdropSrc = null,
  animated = true,
}) {
  const title = item?.title || "Sin título";
  const year = item?.year ? String(item.year) : "";
  const isMovie = item?.type === "movie";
  const typeLabel = isMovie ? "PELÍCULA" : "SERIE";
  const primaryRes = item?.primaryResolution || null;
  const duration = formatDuration(item?.durationMs);
  const canOpen = Boolean(item?.links?.web || item?.links?.mobile);
  const resolutions = Array.isArray(item?.resolutions) ? item.resolutions : [];

  const effectiveImageMode = viewMode === "list" ? "backdrop" : imageMode;
  const aspectRatio =
    effectiveImageMode === "backdrop" ? "aspect-[16/9]" : "aspect-[2/3]";
  const imageSrc =
    effectiveImageMode === "backdrop"
      ? backdropSrc || posterSrc
      : posterSrc || backdropSrc;
  const addedAtLabel = formatEpoch(item?.addedAt);

  const animDelay =
    totalItems > 30
      ? Math.min(index * 0.01, 0.15)
      : Math.min(index * 0.02, 0.3);
  const shouldAnimate = animated && index < 30;
  const enableHoverLift =
    animated &&
    totalItems <= 120 &&
    (viewMode === "compact" || viewMode === "grid");

  const [imgReady, setImgReady] = useState(false);

  useEffect(() => {
    setImgReady(false);
    if (!imageSrc) return;
    let abort = false;
    preloadImage(imageSrc).then((ok) => {
      if (!abort && ok) setImgReady(true);
    });
    return () => { abort = true; };
  }, [imageSrc]);

  const openItem = () => {
    if (!canOpen) return;
    openPlexLink(item);
  };

  const renderMedia = () => (
    <div className="relative w-full h-full">
      <div
        className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 transition-opacity duration-300 ${
          imgReady && imageSrc ? "opacity-0" : "opacity-100"
        }`}
      >
        {isMovie ? (
          <Film className="w-10 h-10 text-zinc-700" />
        ) : (
          <Tv className="w-10 h-10 text-zinc-700" />
        )}
      </div>

      {imageSrc && (
        <img
          src={imageSrc}
          alt={title}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            imgReady ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );

  if (viewMode === "list") {
    return (
      <motion.div
        variants={shouldAnimate ? cardVariants : undefined}
        initial={shouldAnimate ? undefined : false}
      >
        <article
          className={`block bg-zinc-900/40 border border-zinc-800/80 rounded-xl transition-[background-color,border-color] duration-300 group overflow-hidden ${canOpen ? "cursor-pointer hover:border-amber-500/35 hover:bg-zinc-900/65" : ""}`}
          onClick={openItem}
        >
          <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4">
            <div className="w-[180px] sm:w-[280px] aspect-video rounded-lg overflow-hidden relative shadow-md border border-zinc-800/80 bg-zinc-900 shrink-0">
              {renderMedia()}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="flex items-center gap-2">
                <h4 className="text-white font-bold text-base leading-tight truncate">
                  {title}
                </h4>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 -ml-0.5 flex-wrap">
                <span
                  className={`font-bold uppercase tracking-wider text-[9px] px-1 rounded-sm ${
                    isMovie
                      ? "bg-sky-500/10 text-sky-500"
                      : "bg-purple-500/10 text-purple-500"
                  }`}
                >
                  {typeLabel}
                </span>
                {year && (
                  <>
                    <span>•</span>
                    <span>{year}</span>
                  </>
                )}
                {duration && (
                  <>
                    <span>•</span>
                    <span>{duration}</span>
                  </>
                )}
                {primaryRes && (
                  <>
                    <span>•</span>
                    <span
                      className={`font-bold ${getResolutionTextColor(primaryRes)}`}
                    >
                      {primaryRes}
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
        variants={shouldAnimate ? cardVariants : undefined}
        initial={shouldAnimate ? undefined : false}
      >
        <motion.article
          className={`relative ${aspectRatio} group rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800/80 shadow-md transition-[border-color] duration-300 ${canOpen ? "cursor-pointer" : ""}`}
          whileHover={
            canOpen && enableHoverLift
              ? {
                  scale: 1.06,
                  zIndex: 50,
                  boxShadow:
                    "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
                  borderColor: "rgba(245, 158, 11, 0.4)",
                }
              : undefined
          }
          transition={
            enableHoverLift
              ? { type: "spring", stiffness: 300, damping: 20 }
              : { duration: 0 }
          }
          style={{ transformOrigin: "center center" }}
          onClick={openItem}
        >
          {renderMedia()}
          <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
              <span
                className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shadow-sm backdrop-blur-md ${
                  isMovie
                    ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                    : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                }`}
              >
                {typeLabel}
              </span>

              <div className="flex flex-col items-end gap-1">
                {primaryRes && (
                  <span
                    className={`text-[10px] font-black font-mono tracking-tight px-1.5 py-0.5 rounded-md border ${getResolutionStyle(primaryRes)}`}
                  >
                    {primaryRes}
                  </span>
                )}
                <span className="text-[10px] text-zinc-300 font-semibold">
                  {addedAtLabel}
                </span>
              </div>
            </div>

            <div className="p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 text-left flex-1">
                  <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md text-xs">
                    {title}
                  </h3>
                  <p className="text-amber-400 text-[10px] font-bold mt-0.5 drop-shadow-md">
                    {year || "Sin año"}
                    {item?.sectionTitle ? ` • ${item.sectionTitle}` : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.article>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={shouldAnimate ? cardVariants : undefined}
      initial={shouldAnimate ? undefined : false}
    >
      <article
        className={`relative ${aspectRatio} group rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800/80 shadow-md lg:hover:shadow-amber-900/20 transition-[border-color,box-shadow] duration-300 ${canOpen ? "cursor-pointer hover:border-amber-500/30" : ""}`}
        onClick={openItem}
      >
        {renderMedia()}

        <div className="absolute inset-x-0 bottom-0 z-10 lg:hidden p-3 pt-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none">
          <div className="flex items-center gap-2 mb-1 -ml-0.5">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${
                isMovie
                  ? "bg-sky-500/20 text-sky-200"
                  : "bg-purple-500/20 text-purple-200"
              }`}
            >
              {isMovie ? "Cine" : "TV"}
            </span>
            {year && (
              <span className="text-[10px] text-zinc-300/80 font-medium">
                {year}
              </span>
            )}
            {primaryRes && (
              <span
                className={`text-[10px] font-semibold ${getResolutionTextColor(primaryRes)}`}
              >
                {primaryRes}
              </span>
            )}
          </div>
          <h5 className="text-white font-bold text-xs leading-tight line-clamp-2">
            {title}
          </h5>
        </div>

        <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <span
              className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shadow-sm backdrop-blur-md ${
                isMovie
                  ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                  : "bg-purple-500/20 text-purple-300 border-purple-500/30"
              }`}
            >
              {typeLabel}
            </span>

            <div className="flex flex-col items-end gap-1">
              {primaryRes && (
                <span
                  className={`text-[10px] font-black font-mono tracking-tight px-1.5 py-0.5 rounded-md border ${getResolutionStyle(primaryRes)}`}
                >
                  {primaryRes}
                </span>
              )}
              <span className="text-[10px] text-zinc-200 font-bold">
                {addedAtLabel}
              </span>
            </div>
          </div>

          <div className="p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <h3 className="text-white font-bold text-sm leading-tight line-clamp-2 drop-shadow-md">
              {title}
            </h3>
            <p className="text-amber-400 text-[11px] font-bold mt-0.5 drop-shadow-md flex items-center gap-1.5">
              <span>{year || "Sin año"}</span>
              {duration && (
                <>
                  <span className="text-zinc-400">•</span>
                  <span>{duration}</span>
                </>
              )}
            </p>
            {resolutions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {resolutions.slice(0, 3).map((res) => (
                  <span
                    key={`${item.id}-${res}`}
                    className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${getResolutionStyle(res)}`}
                  >
                    {res}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </article>
    </motion.div>
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
    return (
      window.localStorage.getItem("showverse:biblioteca:viewMode") || "grid"
    );
  });
  const [imageMode, setImageMode] = useState(() => {
    if (typeof window === "undefined") return "poster";
    return (
      window.localStorage.getItem("showverse:biblioteca:imageMode") || "poster"
    );
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isExpandingDataset, setIsExpandingDataset] = useState(false);
  const [hasExpandedDataset, setHasExpandedDataset] = useState(false);
  const [expansionAttempted, setExpansionAttempted] = useState(false);
  const [localizedPosterMap, setLocalizedPosterMap] = useState({
    movie: {},
    tv: {},
  });
  const [localizedBackdropMap, setLocalizedBackdropMap] = useState({
    movie: {},
    tv: {},
  });
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT);
  const loadMoreRef = useRef(null);
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

  const fetchLibrary = useCallback(
    async ({
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

      if (force || background) setRefreshing(true);
      else setLoading(true);
      if (background) setIsExpandingDataset(true);

      try {
        const response = await fetch(`/api/plex/library?limit=${safeLimit}`, {
          cache: "no-store",
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
          window.sessionStorage.setItem(cacheKey, payload);
          if (safeLimit > DEFAULT_FETCH_LIMIT) {
            window.sessionStorage.setItem(
              getCacheKey(DEFAULT_FETCH_LIMIT),
              payload,
            );
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
    },
    [],
  );

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
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    const filtered = base.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (resFilter !== "all") {
        const resolutions = Array.isArray(item.resolutions)
          ? item.resolutions
          : [];
        if (!resolutions.includes(resFilter)) return false;
      }
      if (!normalizedQuery) return true;
      return `${item.title || ""} ${item.sectionTitle || ""}`
        .toLowerCase()
        .includes(normalizedQuery);
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

  const resolutionStats = useMemo(
    () => ({
      r4k:
        Number(resolutionCounts["4K"] || 0) +
        Number(resolutionCounts["2160p"] || 0),
      r1440: Number(resolutionCounts["1440p"] || 0),
      r1080: Number(resolutionCounts["1080p"] || 0),
      r720: Number(resolutionCounts["720p"] || 0),
    }),
    [resolutionCounts],
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
  const visibleRenderedCount = Math.min(visibleCount, filteredItems.length);
  const shouldAnimateCards = filteredItems.length <= 180;
  const contentMotionProps = shouldAnimateCards
    ? { variants: containerVariants, initial: "hidden", animate: "visible" }
    : { initial: false };

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

  function resolvePosterSrc(item) {
    const tmdbType =
      item?.tmdbType === "movie"
        ? "movie"
        : item?.tmdbType === "tv"
          ? "tv"
          : null;
    const tmdbId = Number(item?.tmdbId || 0);

    if (tmdbType && Number.isFinite(tmdbId) && tmdbId > 0) {
      const key = String(tmdbId);
      const map = localizedPosterMap[tmdbType];
      const fetched = map != null && key in map;

      if (!fetched) {
        // TMDB aún no ha cargado: mostrar placeholder (null) en lugar de URL de Plex
        // que puede no ser accesible desde el navegador en despliegues remotos
        return null;
      }

      // TMDB ya respondió: usar imagen si existe, Plex como último recurso
      const localizedPath = map[key];
      if (localizedPath) return buildTmdbImage(localizedPath, "w500");
      return item?.thumb || item?.art || null;
    }

    // Sin tmdbId: usar URLs de Plex como fallback
    return item?.thumb || item?.art || null;
  }

  function resolveBackdropSrc(item) {
    const tmdbType =
      item?.tmdbType === "movie"
        ? "movie"
        : item?.tmdbType === "tv"
          ? "tv"
          : null;
    const tmdbId = Number(item?.tmdbId || 0);

    if (tmdbType && Number.isFinite(tmdbId) && tmdbId > 0) {
      const key = String(tmdbId);
      const map = localizedBackdropMap[tmdbType];
      const fetched = map != null && key in map;

      if (!fetched) {
        // TMDB aún no ha cargado: mostrar placeholder en lugar de URL de Plex
        return null;
      }

      // TMDB ya respondió: usar imagen si existe, Plex como último recurso
      const localizedPath = map[key];
      if (localizedPath) return buildTmdbImage(localizedPath, "w1280");
      return item?.art || item?.thumb || null;
    }

    // Sin tmdbId: usar URLs de Plex como fallback
    return item?.art || item?.thumb || null;
  }

  function renderCard(item, index = 0, totalItems = 0) {
    return (
      <LibraryMediaCard
        key={item.id}
        item={item}
        index={index}
        totalItems={totalItems}
        viewMode={viewMode}
        imageMode={imageMode}
        posterSrc={resolvePosterSrc(item)}
        backdropSrc={resolveBackdropSrc(item)}
        animated={shouldAnimateCards}
      />
    );
  }

  // Filter dropdowns (shared between mobile & desktop)
  function renderTypeDropdown() {
    return (
      <InlineDropdown
        label="Tipo"
        valueLabel={typeLabels[typeFilter]}
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
    return (
      <InlineDropdown
        label="Resolución"
        valueLabel={resLabel}
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
    return (
      <InlineDropdown
        label="Orden"
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
    );
  }

  function renderGroupDropdown() {
    return (
      <InlineDropdown
        label="Agrupar"
        valueLabel={groupLabels[groupBy]}
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
    const inactive = "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50";

    return (
      <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center shrink-0">
        <button
          type="button"
          onClick={() => setViewMode("list")}
          className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center ${viewMode === "list" ? active : inactive}`}
          title="Lista"
        >
          <LayoutList className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setViewMode("compact")}
          className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center ${viewMode === "compact" ? active : inactive}`}
          title="Compacta"
        >
          <Grid3x3 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setViewMode("grid")}
          className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center ${viewMode === "grid" ? active : inactive}`}
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
    const inactive = "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50";

    return (
      <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center shrink-0">
        <button
          type="button"
          onClick={() => setImageMode("poster")}
          className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center ${imageMode === "poster" ? active : inactive}`}
          title="Poster"
        >
          <PosterGlyph className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setImageMode("backdrop")}
          className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center ${imageMode === "backdrop" ? active : inactive}`}
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

    if (filteredItems.length === 0) {
      return (
        <motion.div
          key="empty-state"
          className="py-24 text-center"
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
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl transition-colors text-sm"
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
      for (const [groupTitle, items] of grouped) {
        if (remaining <= 0) break;
        const visibleItems = items.slice(0, remaining);
        if (!visibleItems.length) continue;
        visibleGrouped.push([groupTitle, visibleItems]);
        remaining -= visibleItems.length;
      }

      return (
        <motion.div
          key={`grouped-${viewMode}-${imageMode}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {visibleGrouped.map(([groupTitle, items]) => (
            <div key={groupTitle}>
              <GroupDivider
                title={groupTitle}
                count={items.length}
                total={filteredItems.length}
              />
              <motion.div
                key={`group-grid-${groupTitle}-${viewMode}-${imageMode}`}
                className={getItemsGridClass(true)}
                {...contentMotionProps}
              >
                {items.map((item, idx) =>
                  renderCard(item, idx, items.length),
                )}
              </motion.div>
            </div>
          ))}

          {hasMoreItems && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={loadMoreItems}
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl transition-colors text-sm"
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
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl transition-colors text-sm"
            >
              Cargar más ({visibleLimit}/{filteredItems.length})
            </button>
            <div ref={loadMoreRef} className="h-2 w-full" />
          </div>
        )}
      </motion.div>
    );
  }

  // ===== LOADING STATE =====
  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans">
        <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px w-12 bg-amber-500/50" />
              <div className="h-3 w-24 bg-zinc-800 rounded-full animate-pulse" />
            </div>
            <div className="h-12 w-64 bg-zinc-800 rounded-xl animate-pulse mb-2" />
            <div className="h-4 w-80 bg-zinc-800/50 rounded-full animate-pulse hidden md:block" />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6 gap-3">
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
        </div>
      </div>
    );
  }

  // ===== ERROR STATE =====
  if (error) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
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
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* ====== HEADER ====== */}
        <motion.header
          className="mb-10"
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
                <motion.button
                  type="button"
                  onClick={() =>
                    fetchLibrary({
                      force: true,
                      limit: hasExpandedDataset
                        ? EXPANDED_FETCH_LIMIT
                        : DEFAULT_FETCH_LIMIT,
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
                  <RefreshCw
                    className={`w-5 h-5 text-white ${refreshing ? "animate-spin" : ""}`}
                  />
                </motion.button>
              </div>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
                Contenido y resoluciones de tu servidor Plex.
              </p>
            </div>

            <motion.div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 md:gap-4 w-full lg:w-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="min-w-0 bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="p-1.5 md:p-2 rounded-full bg-white/5 mb-1 text-amber-400">
                  <HardDrive className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <div className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">
                  {stats.total}
                </div>
                <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight">
                  Total
                </div>
              </div>
              <div className="min-w-0 bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="p-1.5 md:p-2 rounded-full bg-white/5 mb-1 text-sky-400">
                  <Film className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <div className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">
                  {stats.movies}
                </div>
                <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight">
                  Películas
                </div>
              </div>
              <div className="min-w-0 bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                <div className="p-1.5 md:p-2 rounded-full bg-white/5 mb-1 text-purple-400">
                  <Tv className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <div className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">
                  {stats.shows}
                </div>
                <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight">
                  Series
                </div>
              </div>
              <div
                className={`w-full lg:w-[98px] justify-self-center border rounded-lg px-2.5 py-2 flex flex-col items-center justify-center gap-0.5 ${getResolutionStyle("4K")}`}
              >
                <div className="text-[10px] uppercase font-black tracking-wider leading-none">
                  4K
                </div>
                <div className="text-lg md:text-xl font-black tracking-tight tabular-nums leading-none">
                  {resolutionStats.r4k}
                </div>
              </div>
              <div
                className={`w-full lg:w-[98px] justify-self-center border rounded-lg px-2.5 py-2 flex flex-col items-center justify-center gap-0.5 ${getResolutionStyle("1440p")}`}
              >
                <div className="text-[10px] uppercase font-black tracking-wider leading-none">
                  1440p
                </div>
                <div className="text-lg md:text-xl font-black tracking-tight tabular-nums leading-none">
                  {resolutionStats.r1440}
                </div>
              </div>
              <div
                className={`w-full lg:w-[98px] justify-self-center border rounded-lg px-2.5 py-2 flex flex-col items-center justify-center gap-0.5 ${getResolutionStyle("1080p")}`}
              >
                <div className="text-[10px] uppercase font-black tracking-wider leading-none">
                  1080p
                </div>
                <div className="text-lg md:text-xl font-black tracking-tight tabular-nums leading-none">
                  {resolutionStats.r1080}
                </div>
              </div>
              <div
                className={`w-full lg:w-[98px] justify-self-center border rounded-lg px-2.5 py-2 flex flex-col items-center justify-center gap-0.5 ${getResolutionStyle("720p")}`}
              >
                <div className="text-[10px] uppercase font-black tracking-wider leading-none">
                  720p
                </div>
                <div className="text-lg md:text-xl font-black tracking-tight tabular-nums leading-none">
                  {resolutionStats.r720}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.header>

        {/* ====== FILTERS ====== */}
        <motion.div
          ref={(el) => {
            if (el && !el.dataset.stickySetup) {
              el.dataset.stickySetup = "true";
              const observer = new IntersectionObserver(
                ([e]) => {
                  const isStuck = e.intersectionRatio < 1;
                  const method = isStuck ? "add" : "remove";
                  el.classList[method](
                    "backdrop-blur-xl",
                    "bg-gradient-to-br",
                    "from-black/60",
                    "via-black/50",
                    "to-black/55",
                  );
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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-zinc-600"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                >
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
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="lg:hidden overflow-visible"
              >
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
                    {viewMode !== "list" && (
                      <div className="shrink-0">{renderImageToggle()}</div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop filters */}
          <div className="hidden lg:flex gap-3 w-full items-stretch">
            <div className="relative flex-[1.8] min-w-[280px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en biblioteca..."
                className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-zinc-600"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              )}
            </div>

            <div className="flex-1 min-w-[150px]">{renderTypeDropdown()}</div>
            <div className="flex-1 min-w-[150px]">{renderResDropdown()}</div>
            <div className="flex-1 min-w-[150px]">{renderSortDropdown()}</div>
            <div className="flex-1 min-w-[150px]">{renderGroupDropdown()}</div>
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
        <AnimatePresence mode="wait">
          {renderContent()}
        </AnimatePresence>
      </div>
    </div>
  );
}
