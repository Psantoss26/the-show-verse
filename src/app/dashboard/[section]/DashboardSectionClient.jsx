"use client";


import OptimizedImage from "@/components/OptimizedImage";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Film,
  Filter,
  Grid2X2,
  LayoutGrid,
  List,
  MonitorPlay,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { formatPageTitle } from "@/lib/pageTitle";

const MOVIE_GENRES = {
  28: "Acción",
  12: "Aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familiar",
  14: "Fantasía",
  36: "Historia",
  27: "Terror",
  10402: "Música",
  9648: "Misterio",
  10749: "Romance",
  878: "Ciencia ficción",
  10770: "TV Movie",
  53: "Suspense",
  10752: "Bélica",
  37: "Western",
};

const TV_GENRES = {
  10759: "Acción y aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familiar",
  10762: "Infantil",
  9648: "Misterio",
  10763: "Noticias",
  10764: "Reality",
  10765: "Ciencia ficción y fantasía",
  10766: "Telenovela",
  10767: "Talk show",
  10768: "Guerra y política",
  37: "Western",
};

const SORT_OPTIONS = [
  { key: "rank", label: "Ranking original" },
  { key: "title-asc", label: "Título A-Z" },
  { key: "title-desc", label: "Título Z-A" },
  { key: "rating-desc", label: "Mejor valoración" },
  { key: "rating-asc", label: "Peor valoración" },
  { key: "date-desc", label: "Más recientes" },
  { key: "date-asc", label: "Más antiguos" },
];

const GROUP_OPTIONS = [
  { key: "none", label: "Sin agrupar" },
  { key: "media", label: "Tipo" },
  { key: "source", label: "Fuente" },
  { key: "genre", label: "Género" },
  { key: "year", label: "Año" },
  { key: "decade", label: "Década" },
  { key: "rating", label: "Valoración" },
];

const VIEW_MODE_STORAGE_KEY = "showverse:dashboard-section:viewMode:v2";
const IMAGE_MODE_STORAGE_KEY = "showverse:dashboard-section:imageMode";

function normText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function resolveType(item) {
  return item?.media_type || (item?.name && !item?.title ? "tv" : "movie");
}

function getTitle(item) {
  return item?.title || item?.name || "Sin título";
}

function getDate(item) {
  return item?.release_date || item?.first_air_date || "";
}

function getYear(item) {
  return getDate(item).slice(0, 4) || "";
}

function getGenreLabel(item) {
  const type = resolveType(item);
  const map = type === "movie" ? MOVIE_GENRES : TV_GENRES;
  const id = Array.isArray(item?.genre_ids)
    ? item.genre_ids.find(Boolean)
    : null;
  if (id) return map[id] || `Género ${id}`;

  const genre = Array.isArray(item?.genres)
    ? item.genres.find((entry) =>
        typeof entry === "string" ? entry.trim() : entry?.name,
      )
    : null;
  if (typeof genre === "string" && genre.trim()) return genre.trim();
  if (genre?.name) return genre.name;

  const genreName = Array.isArray(item?.genre_names)
    ? item.genre_names.find(Boolean)
    : null;
  if (genreName) return genreName;

  return "Sin género";
}

function getRatingGroup(item) {
  const rating = Number(item?.vote_average || 0);
  if (!rating) return { key: "sin-rating", label: "Sin valoración" };
  const floor = Math.floor(rating);
  return { key: String(floor), label: `${floor}.0 - ${floor}.9` };
}

function getGroupMeta(item, groupBy) {
  const type = resolveType(item);
  const sources = Array.isArray(item?.sources) && item.sources.length
    ? item.sources
    : [item?.source || "tmdb"];
  const year = getYear(item);

  if (groupBy === "media") {
    return {
      key: type,
      label: type === "movie" ? "Películas" : "Series",
    };
  }

  if (groupBy === "source") {
    if (sources.includes("trakt") && sources.includes("tmdb")) {
      return { key: "both", label: "Trakt + TMDb" };
    }
    return {
      key: sources[0],
      label: sources[0] === "trakt" ? "Trakt" : "TMDb",
    };
  }

  if (groupBy === "genre") {
    const label = getGenreLabel(item);
    return { key: label, label };
  }

  if (groupBy === "year") {
    return { key: year || "sin-ano", label: year || "Sin año" };
  }

  if (groupBy === "decade") {
    if (!year) return { key: "sin-decada", label: "Sin década" };
    const decade = Math.floor(Number(year) / 10) * 10;
    return { key: String(decade), label: `${decade}s` };
  }

  if (groupBy === "rating") return getRatingGroup(item);

  return { key: "all", label: "Todos" };
}

function sortGroups(groups, groupBy) {
  if (groupBy === "year" || groupBy === "decade" || groupBy === "rating") {
    return groups.sort((a, b) => {
      const an = Number(a.key);
      const bn = Number(b.key);
      if (!Number.isFinite(an)) return 1;
      if (!Number.isFinite(bn)) return -1;
      return bn - an;
    });
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

function imgUrl(path, size = "w500") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
}

function dashboardImageKey(item) {
  return `${resolveType(item)}:${item?.id}`;
}

function PosterImage({
  item,
  mode = "poster",
  title,
  previewBackdropPath,
  backdropPending = false,
}) {
  const [failed, setFailed] = useState(false);
  const poster = item?.poster_path;
  const wantsBackdrop = mode === "backdrop";
  const backdrop = wantsBackdrop
    ? previewBackdropPath
    : previewBackdropPath || item?.backdrop_path;
  const preferredPath =
    wantsBackdrop
      ? backdrop || (!backdropPending ? poster : null)
      : poster || backdrop;

  useEffect(() => {
    setFailed(false);
  }, [backdropPending, mode, preferredPath]);

  const path =
    wantsBackdrop
      ? failed
        ? poster
        : preferredPath
      : failed
        ? backdrop
        : preferredPath;

  if (!path) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-700">
        <Film className="h-8 w-8 opacity-60" />
      </div>
    );
  }

  return (
    <OptimizedImage
      src={imgUrl(path, mode === "backdrop" ? "w780" : "w500")}
      alt={title}
      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function Dropdown({
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
    const onDown = (event) => {
      const target = event.target;
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
        onClick={() => setOpen((value) => !value)}
        className="h-11 min-w-0 w-full inline-flex items-center justify-between gap-3 px-4 rounded-xl transition text-sm lg:min-w-[140px] lg:w-auto lg:max-w-none bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-amber-400" />}
          <span
            className={`text-zinc-500 font-bold text-xs uppercase tracking-wider ${
              compactMobile ? "hidden sm:inline" : ""
            }`}
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
      className={`w-full px-3 py-2 rounded-xl text-left text-sm transition flex items-center justify-between ${
        active
          ? "bg-white/10 text-white font-bold"
          : "text-zinc-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="font-medium">{children}</span>
      {active && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
    </button>
  );
}

function SectionCard({
  item,
  index,
  totalItems = 0,
  viewMode,
  imageMode = "poster",
  previewBackdropPath,
  backdropPending = false,
}) {
  const type = resolveType(item);
  const title = getTitle(item);
  const year = getYear(item);
  const rating =
    typeof item?.vote_average === "number" && item.vote_average > 0
      ? item.vote_average.toFixed(1)
      : null;
  const genre = getGenreLabel(item);
  const href = `/details/${type === "tv" ? "tv" : "movie"}/${item.id}`;
  const effectiveImageMode = viewMode === "list" ? "backdrop" : imageMode;
  const aspect =
    effectiveImageMode === "backdrop" ? "aspect-[16/9]" : "aspect-[2/3]";
  const animDelay =
    totalItems > 30 ? Math.min(index * 0.015, 0.25) : index * 0.03;
  const shouldAnimate = index < 60;

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
          className="block bg-zinc-900/30 border border-white/5 rounded-xl hover:border-amber-500/30 hover:bg-zinc-900/60 transition-colors group overflow-hidden"
        >
          <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4">
            <div className="w-[180px] sm:w-[280px] aspect-video rounded-lg overflow-hidden relative shadow-md border border-white/5 bg-zinc-900 shrink-0">
              <PosterImage
                item={item}
                mode="backdrop"
                title={title}
                previewBackdropPath={previewBackdropPath}
                backdropPending={backdropPending}
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <h3 className="text-white font-bold text-base leading-tight truncate">
                {title}
              </h3>
              <div className="-ml-0.5 flex items-center gap-2 text-xs text-zinc-500">
                {year && <span>{year}</span>}
                {year && genre && <span>•</span>}
                <span>{genre}</span>
                {rating && (
                  <>
                    {(year || genre) && <span>•</span>}
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <Star className="h-3 w-3 fill-current text-amber-400" />
                      {rating}
                    </span>
                  </>
                )}
              </div>
              {item?.overview && (
                <p className="mt-3 line-clamp-2 text-sm text-zinc-500">
                  {item.overview}
                </p>
              )}
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
        <Link
          href={href}
          className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          <motion.div
            className={`relative ${aspect} group rounded-lg overflow-hidden bg-zinc-900 border border-white/5 shadow-md`}
            whileHover={{
              scale: 1.15,
              zIndex: 50,
              boxShadow:
                "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
              borderColor: "rgba(245, 158, 11, 0.4)",
            }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{
              transformOrigin: "center center",
              borderColor: "rgba(255, 255, 255, 0.05)",
            }}
          >
            <PosterImage
              item={item}
              mode={effectiveImageMode}
              title={title}
              previewBackdropPath={previewBackdropPath}
              backdropPending={backdropPending}
            />
            <div
              className={`hidden lg:flex items-center justify-center absolute top-0 left-0 z-20 p-2 sm:p-2.5 rounded-br-2xl border-r border-b backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu origin-top-left lg:scale-0 lg:opacity-0 lg:group-hover:scale-100 lg:group-hover:opacity-100 ${
                type === "movie"
                  ? "bg-sky-500/15 border-sky-500/30 text-sky-300"
                  : "bg-purple-500/15 border-purple-500/30 text-purple-300"
              }`}
            >
              {type === "movie" ? (
                <Film className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              ) : (
                <MonitorPlay className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              )}
            </div>
            <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                <div />
                <div className="flex flex-col items-end gap-1 pointer-events-auto">
                  {rating && (
                    <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                      <span className="text-emerald-400 text-xs font-black font-mono tracking-tight">
                        {rating}
                      </span>
                      <OptimizedImage
                        src="/logo-TMDb.png"
                        alt=""
                        className="w-auto h-2.5 opacity-100"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0 text-left flex-1">
                    <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md text-xs">
                      {title}
                    </h3>
                    <p className="text-yellow-500 text-[10px] font-bold mt-0.5 drop-shadow-md">
                      {[year, genre].filter(Boolean).join(" • ")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, delay: shouldAnimate ? animDelay : 0 }}
    >
      <Link
        href={href}
        className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
      >
        <div
          className={`group relative ${aspect} overflow-hidden rounded-xl bg-zinc-900 shadow-md transition-all lg:hover:shadow-amber-900/20`}
        >
          <div className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] border border-white/5 group-hover:border-amber-500/40 transition-colors duration-300" />
          <PosterImage
            item={item}
            mode={effectiveImageMode}
            title={title}
            previewBackdropPath={previewBackdropPath}
            backdropPending={backdropPending}
          />

          <div
            className={`hidden lg:flex items-center justify-center absolute top-0 left-0 z-20 p-2 sm:p-2.5 rounded-br-2xl border-r border-b backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu origin-top-left lg:scale-0 lg:opacity-0 lg:group-hover:scale-100 lg:group-hover:opacity-100 ${
              type === "movie"
                ? "bg-sky-500/15 border-sky-500/30 text-sky-300"
                : "bg-purple-500/15 border-purple-500/30 text-purple-300"
            }`}
          >
            {type === "movie" ? (
              <Film className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            ) : (
              <MonitorPlay className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            )}
          </div>

          <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
              <div />
              <div className="flex flex-col items-end gap-1 pointer-events-auto">
                {rating && (
                  <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                    <span className="text-emerald-400 text-xs font-black font-mono tracking-tight">
                      {rating}
                    </span>
                    <OptimizedImage
                      src="/logo-TMDb.png"
                      alt=""
                      className="w-auto h-2.5 opacity-100"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 text-left flex-1">
                  <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md text-sm">
                    {title}
                  </h3>
                  <p className="text-yellow-500 text-xs font-bold mt-0.5 drop-shadow-md">
                    {[year, genre].filter(Boolean).join(" • ")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function GroupDivider({ title, count }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/40 to-amber-500/15" />
      <div className="relative overflow-hidden inline-flex max-w-[75%] items-center gap-2 rounded-xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-3 py-1">
        <div className="relative z-10 flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-black uppercase tracking-wide text-amber-100 drop-shadow-sm">
            {title}
          </span>
          <span className="text-[10px] font-bold text-amber-300/80">
            {count}
          </span>
        </div>
      </div>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-amber-500/40 to-amber-500/15" />
    </div>
  );
}

function favoritesGridClassFor(viewMode, imageMode, withTopMargin = false) {
  const hoverBleedSpace = withTopMargin
    ? " -mx-3 overflow-visible px-3 pb-6 lg:-mx-5 lg:px-5 lg:pb-8"
    : "";
  if (viewMode === "list") {
    return `grid grid-cols-1 xl:grid-cols-2 gap-4${withTopMargin ? " mt-3" : ""}${hoverBleedSpace}`;
  }
  if (viewMode === "compact") {
    const compactCols =
      imageMode === "backdrop"
        ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4"
        : "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8";
    return `grid gap-2 ${compactCols}${withTopMargin ? " mt-3" : ""}${hoverBleedSpace}`;
  }
  const gridCols =
    imageMode === "backdrop"
      ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3"
      : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6";
  return `grid gap-3 ${gridCols}${withTopMargin ? " mt-3" : ""}${hoverBleedSpace}`;
}

export default function DashboardSectionClient({ section }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [mediaFilter, setMediaFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("rank");
  const [groupBy, setGroupBy] = useState("none");
  const [viewMode, setViewMode] = useState("compact");
  const [imageMode, setImageMode] = useState("poster");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [previewBackdropsByItem, setPreviewBackdropsByItem] = useState({});
  const [previewBackdropsReady, setPreviewBackdropsReady] = useState(false);

  useEffect(() => {
    document.title = formatPageTitle(data?.title || "Dashboard");
  }, [data?.title]);

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (saved === "grid" || saved === "compact" || saved === "list") {
      setViewMode(saved);
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(IMAGE_MODE_STORAGE_KEY);
    if (saved === "poster" || saved === "backdrop") {
      setImageMode(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    window.localStorage.setItem(IMAGE_MODE_STORAGE_KEY, imageMode);
  }, [imageMode]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`/api/dashboard/sections/${section}`, {
          cache: "no-store",
        });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.error || "No se pudo cargar.");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err?.message || "No se pudo cargar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [section]);

  const rawItems = useMemo(
    () => (Array.isArray(data?.items) ? data.items : []),
    [data?.items],
  );

  useEffect(() => {
    const shouldLoadPreviewBackdrops =
      viewMode === "list" || imageMode === "backdrop";

    if (!shouldLoadPreviewBackdrops || rawItems.length === 0) {
      setPreviewBackdropsByItem((current) =>
        Object.keys(current).length ? {} : current,
      );
      setPreviewBackdropsReady(true);
      return;
    }

    let cancelled = false;
    setPreviewBackdropsReady(false);
    const idsByType = rawItems.reduce(
      (acc, item) => {
        const id = Number(item?.id);
        const type = resolveType(item);
        if (!Number.isFinite(id) || (type !== "movie" && type !== "tv")) {
          return acc;
        }
        acc[type].add(id);
        return acc;
      },
      { movie: new Set(), tv: new Set() },
    );

    const loadPreviewBackdrops = async () => {
      const entries = [];
      await Promise.all(
        Object.entries(idsByType).map(async ([type, idsSet]) => {
          const ids = Array.from(idsSet);
          if (!ids.length) return;

          let response = null;
          try {
            response = await fetch("/api/tmdb/localized-images", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type, ids, kind: "backdrop" }),
            });
          } catch {
            response = null;
          }

          if (!response?.ok) {
            for (const id of ids) entries.push([`${type}:${id}`, null]);
            return;
          }

          const json = await response.json().catch(() => null);
          const map = json?.map || {};
          for (const id of ids) {
            entries.push([`${type}:${id}`, map[id] || null]);
          }
        }),
      );

      if (!cancelled) {
        setPreviewBackdropsByItem((current) => ({
          ...current,
          ...Object.fromEntries(entries),
        }));
        setPreviewBackdropsReady(true);
      }
    };

    loadPreviewBackdrops().catch(() => {
      if (!cancelled) {
        setPreviewBackdropsByItem({});
        setPreviewBackdropsReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageMode, rawItems, viewMode]);

  const filtered = useMemo(() => {
    const q = normText(deferredQuery);
    return rawItems.filter((item) => {
      const type = resolveType(item);
      if (mediaFilter !== "all" && type !== mediaFilter) return false;
      const sources = Array.isArray(item?.sources) && item.sources.length
        ? item.sources
        : [item?.source || "tmdb"];
      if (sourceFilter !== "all" && !sources.includes(sourceFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        normText(getTitle(item)).includes(q) ||
        normText(getGenreLabel(item)).includes(q) ||
        normText(getYear(item)).includes(q)
      );
    });
  }, [rawItems, deferredQuery, mediaFilter, sourceFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "rank") {
      return arr.sort((a, b) => rawItems.indexOf(a) - rawItems.indexOf(b));
    }
    if (sortBy === "title-asc") {
      return arr.sort((a, b) => getTitle(a).localeCompare(getTitle(b)));
    }
    if (sortBy === "title-desc") {
      return arr.sort((a, b) => getTitle(b).localeCompare(getTitle(a)));
    }
    if (sortBy === "rating-desc" || sortBy === "rating-asc") {
      const dir = sortBy === "rating-desc" ? -1 : 1;
      return arr.sort(
        (a, b) => dir * ((a.vote_average || 0) - (b.vote_average || 0)),
      );
    }
    if (sortBy === "date-desc" || sortBy === "date-asc") {
      const dir = sortBy === "date-desc" ? -1 : 1;
      return arr.sort((a, b) => dir * getDate(a).localeCompare(getDate(b)));
    }
    return arr;
  }, [filtered, sortBy, rawItems]);

  const getPreviewBackdropPath = useCallback(
    (item) => previewBackdropsByItem[dashboardImageKey(item)],
    [previewBackdropsByItem],
  );

  const isPreviewBackdropPending = useCallback(
    (item) =>
      (viewMode === "list" || imageMode === "backdrop") &&
      !previewBackdropsReady &&
      getPreviewBackdropPath(item) === undefined,
    [getPreviewBackdropPath, imageMode, previewBackdropsReady, viewMode],
  );

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const groups = new Map();
    for (const item of sorted) {
      const meta = getGroupMeta(item, groupBy);
      if (!groups.has(meta.key)) {
        groups.set(meta.key, { ...meta, items: [] });
      }
      groups.get(meta.key).items.push(item);
    }
    return sortGroups(Array.from(groups.values()), groupBy);
  }, [sorted, groupBy]);

  const stats = useMemo(() => {
    let movies = 0;
    let shows = 0;
    let trakt = 0;
    let tmdb = 0;
    for (const item of rawItems) {
      if (resolveType(item) === "movie") movies += 1;
      else shows += 1;
      const sources = Array.isArray(item?.sources) && item.sources.length
        ? item.sources
        : [item?.source || "tmdb"];
      if (sources.includes("trakt")) trakt += 1;
      if (sources.includes("tmdb")) tmdb += 1;
    }
    return { movies, shows, trakt, tmdb };
  }, [rawItems]);

  const sortLabel =
    SORT_OPTIONS.find((option) => option.key === sortBy)?.label || "Orden";
  const groupLabel =
    GROUP_OPTIONS.find((option) => option.key === groupBy)?.label || "Agrupar";

  return (
    <main className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-amber-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-amber-500/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-yellow-600/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-amber-700/25 blur-[120px] sm:blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <motion.header
          className="mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link
                  href="/"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-white/10 to-white/5 text-zinc-300 shadow-lg backdrop-blur-lg transition hover:bg-white/15 hover:text-white"
                  aria-label="Volver al dashboard"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <div className="h-px w-12 bg-amber-500" />
                <span className="text-amber-400 font-bold uppercase tracking-widest text-xs">
                  {data?.eyebrow || "Dashboard"}
                </span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                {data?.title || "Cargando"}
                <span className="text-amber-500">.</span>
              </h1>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
                {data?.description || "Explora todos los títulos de esta sección."}
              </p>
            </div>

            {!loading && (
              <motion.div
                className="flex gap-3 md:gap-4 w-full lg:w-auto justify-center lg:justify-end"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                {[
                  { label: "Total", value: rawItems.length, icon: Star, color: "text-amber-400" },
                  { label: "Películas", value: stats.movies, icon: Film, color: "text-sky-400" },
                  { label: "Series", value: stats.shows, icon: MonitorPlay, color: "text-purple-400" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div
                    key={label}
                    className="relative overflow-hidden flex-1 lg:flex-none lg:min-w-[120px] rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1"
                  >
                    <div className={`relative z-10 mb-1 ${color}`}>
                      <Icon className="w-6 h-6 md:w-7 md:h-7" />
                    </div>
                    <div className="relative z-10 text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight drop-shadow-md">
                      {value}
                    </div>
                    <div className="relative z-10 text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wider text-center leading-tight">
                      {label}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        </motion.header>

        <motion.section
          className="sticky top-20 z-[70] space-y-1 mb-1 lg:mb-6 transition-all duration-300"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <div className="relative z-10 flex gap-2 lg:hidden">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 z-10 pointer-events-none" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar..."
                className="w-full h-11 rounded-xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-md transition-colors"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((value) => !value)}
              className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
                mobileFiltersOpen
                  ? "text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.28)]"
                  : "text-zinc-200 hover:bg-white/10"
              }`}
              aria-label="Mostrar filtros"
              aria-expanded={mobileFiltersOpen}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div
            className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] lg:hidden ${
              mobileFiltersOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            style={{ gridTemplateRows: mobileFiltersOpen ? "1fr" : "0fr" }}
          >
            <div className="min-h-0">
              <div className="space-y-1 pt-1 pb-1">
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Dropdown
                      label="Tipo"
                      valueLabel={
                        mediaFilter === "all"
                          ? "Todo"
                          : mediaFilter === "movie"
                            ? "Películas"
                            : "Series"
                      }
                      icon={Filter}
                    >
                      {({ close }) => (
                        <>
                          {[
                            ["all", "Todo"],
                            ["movie", "Películas"],
                            ["tv", "Series"],
                          ].map(([key, label]) => (
                            <DropdownItem
                              key={key}
                              active={mediaFilter === key}
                              onClick={() => {
                                setMediaFilter(key);
                                close();
                              }}
                            >
                              {label}
                            </DropdownItem>
                          ))}
                        </>
                      )}
                    </Dropdown>
                  </div>

                  <div className="min-w-0 flex-1">
                    <Dropdown
                      label="Fuente"
                      valueLabel={
                        sourceFilter === "all"
                          ? "Todas"
                          : sourceFilter === "trakt"
                            ? "Trakt"
                            : "TMDb"
                      }
                      icon={SlidersHorizontal}
                    >
                      {({ close }) => (
                        <>
                          {[
                            ["all", "Todas"],
                            ["trakt", "Trakt"],
                            ["tmdb", "TMDb"],
                          ].map(([key, label]) => (
                            <DropdownItem
                              key={key}
                              active={sourceFilter === key}
                              onClick={() => {
                                setSourceFilter(key);
                                close();
                              }}
                            >
                              {label}
                            </DropdownItem>
                          ))}
                        </>
                      )}
                    </Dropdown>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Dropdown label="Orden" valueLabel={sortLabel} icon={ArrowUpDown}>
                      {({ close }) => (
                        <>
                          {SORT_OPTIONS.map((option) => (
                            <DropdownItem
                              key={option.key}
                              active={sortBy === option.key}
                              onClick={() => {
                                setSortBy(option.key);
                                close();
                              }}
                            >
                              {option.label}
                            </DropdownItem>
                          ))}
                        </>
                      )}
                    </Dropdown>
                  </div>

                  <div className="min-w-0 flex-1">
                    <Dropdown label="Agrupar" valueLabel={groupLabel} icon={Calendar}>
                      {({ close }) => (
                        <>
                          {GROUP_OPTIONS.map((option) => (
                            <DropdownItem
                              key={option.key}
                              active={groupBy === option.key}
                              onClick={() => {
                                setGroupBy(option.key);
                                close();
                              }}
                            >
                              {option.label}
                            </DropdownItem>
                          ))}
                        </>
                      )}
                    </Dropdown>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex flex-1 rounded-xl p-1 h-11 items-center bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                    {[
                      ["list", List],
                      ["compact", Grid2X2],
                      ["grid", LayoutGrid],
                    ].map(([mode, Icon]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setViewMode(mode)}
                        className={`flex-1 px-2 h-full rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                          viewMode === mode
                            ? "bg-gradient-to-br from-amber-400 to-yellow-600 text-black shadow-lg shadow-amber-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-1 rounded-xl p-1 h-11 items-center bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                    {[
                      ["poster", Film],
                      ["backdrop", MonitorPlay],
                    ].map(([mode, Icon]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setImageMode(mode)}
                        className={`flex-1 px-2 h-full rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                          imageMode === mode
                            ? "bg-gradient-to-br from-amber-400 to-yellow-600 text-black shadow-lg shadow-amber-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 hidden gap-3 lg:flex">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 z-10 pointer-events-none" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por título..."
                className="w-full h-11 rounded-xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-md transition-colors"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                </button>
              )}
            </div>

            <Dropdown label="Tipo" valueLabel={mediaFilter === "all" ? "Todo" : mediaFilter === "movie" ? "Películas" : "Series"} icon={Filter}>
                {({ close }) => (
                  <>
                    {[
                      ["all", "Todo"],
                      ["movie", "Películas"],
                      ["tv", "Series"],
                    ].map(([key, label]) => (
                      <DropdownItem
                        key={key}
                        active={mediaFilter === key}
                        onClick={() => {
                          setMediaFilter(key);
                          close();
                        }}
                      >
                        {label}
                      </DropdownItem>
                    ))}
                  </>
                )}
              </Dropdown>

              <Dropdown label="Fuente" valueLabel={sourceFilter === "all" ? "Todas" : sourceFilter === "trakt" ? "Trakt" : "TMDb"} icon={SlidersHorizontal}>
                {({ close }) => (
                  <>
                    {[
                      ["all", "Todas"],
                      ["trakt", "Trakt"],
                      ["tmdb", "TMDb"],
                    ].map(([key, label]) => (
                      <DropdownItem
                        key={key}
                        active={sourceFilter === key}
                        onClick={() => {
                          setSourceFilter(key);
                          close();
                        }}
                      >
                        {label}
                      </DropdownItem>
                    ))}
                  </>
                )}
              </Dropdown>

              <Dropdown label="Orden" valueLabel={sortLabel} icon={ArrowUpDown}>
                {({ close }) => (
                  <>
                    {SORT_OPTIONS.map((option) => (
                      <DropdownItem
                        key={option.key}
                        active={sortBy === option.key}
                        onClick={() => {
                          setSortBy(option.key);
                          close();
                        }}
                      >
                        {option.label}
                      </DropdownItem>
                    ))}
                  </>
                )}
              </Dropdown>

              <Dropdown label="Agrupar" valueLabel={groupLabel} icon={Calendar}>
                {({ close }) => (
                  <>
                    {GROUP_OPTIONS.map((option) => (
                      <DropdownItem
                        key={option.key}
                        active={groupBy === option.key}
                        onClick={() => {
                          setGroupBy(option.key);
                          close();
                        }}
                      >
                        {option.label}
                      </DropdownItem>
                    ))}
                  </>
                )}
              </Dropdown>

            <div className="flex rounded-xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
              {[
                ["list", List],
                ["compact", Grid2X2],
                ["grid", LayoutGrid],
              ].map(([mode, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                    viewMode === mode
                      ? "bg-gradient-to-br from-amber-400 to-yellow-600 text-black shadow-lg shadow-amber-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            <div className="flex rounded-xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
              {[
                ["poster", Film],
                ["backdrop", MonitorPlay],
              ].map(([mode, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setImageMode(mode)}
                  className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                    imageMode === mode
                      ? "bg-gradient-to-br from-amber-400 to-yellow-600 text-black shadow-lg shadow-amber-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

        </motion.section>

        {loading ? (
          <div className={favoritesGridClassFor(viewMode, imageMode)}>
            {Array.from({ length: 28 }).map((_, index) => (
              <div
                key={index}
                className={`relative animate-pulse overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-white/5 ${viewMode === "list" ? "h-36" : imageMode === "backdrop" ? "aspect-[16/9]" : "aspect-[2/3]"}`}
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-dashed border-amber-500/20 bg-zinc-900/20 p-8 text-center text-amber-100">
            {error}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-24 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20">
            <Film className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-500 font-medium">
              No se encontraron títulos.
            </p>
          </div>
        ) : grouped ? (
          <div className="space-y-8">
            {grouped.map((group, groupIndex) => (
              <motion.div
                key={group.key}
                className="overflow-visible"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: groupIndex * 0.1 }}
              >
                <GroupDivider title={group.label} count={group.items.length} />
                <div
                  key={`section-grid-${group.key}-${viewMode}-${imageMode}`}
                  className={favoritesGridClassFor(viewMode, imageMode, true)}
                >
                  {group.items.map((item, index) => (
                    <SectionCard
                      key={`${item.source}-${resolveType(item)}-${item.id}`}
                      item={item}
                      index={index}
                      totalItems={group.items.length}
                      viewMode={viewMode}
                      imageMode={imageMode}
                      previewBackdropPath={getPreviewBackdropPath(item)}
                      backdropPending={isPreviewBackdropPending(item)}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div
            key={`section-flat-grid-${viewMode}-${imageMode}`}
            className={favoritesGridClassFor(viewMode, imageMode)}
          >
            {sorted.map((item, index) => (
              <SectionCard
                key={`${item.source}-${resolveType(item)}-${item.id}`}
                item={item}
                index={index}
                totalItems={sorted.length}
                viewMode={viewMode}
                imageMode={imageMode}
                previewBackdropPath={getPreviewBackdropPath(item)}
                backdropPending={isPreviewBackdropPending(item)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
