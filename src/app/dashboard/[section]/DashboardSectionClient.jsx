"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  const id = Array.isArray(item?.genre_ids) ? item.genre_ids[0] : null;
  return id ? map[id] || `Género ${id}` : "Sin género";
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

function PosterImage({ item, mode = "poster", title }) {
  const [failed, setFailed] = useState(false);
  const poster = item?.poster_path;
  const backdrop = item?.backdrop_path;
  const path =
    mode === "backdrop"
      ? failed
        ? poster
        : backdrop || poster
      : failed
        ? backdrop
        : poster || backdrop;

  if (!path) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-700">
        <Film className="h-8 w-8 opacity-60" />
      </div>
    );
  }

  return (
    <img
      src={imgUrl(path, mode === "backdrop" ? "w780" : "w500")}
      alt={title}
      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function Dropdown({ label, valueLabel, icon: Icon, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="h-11 w-full min-w-0 rounded-xl bg-gradient-to-br from-white/10 to-white/5 px-3 text-sm text-zinc-300 shadow-lg backdrop-blur-lg transition-all hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 sm:min-w-[170px]"
      >
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-red-500" />}
            <span className="hidden text-[10px] font-black uppercase tracking-wider text-zinc-500 sm:inline">
              {label}
            </span>
            <span className="truncate font-bold text-white">{valueLabel}</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-xl bg-[#121212]/95 p-1 shadow-2xl backdrop-blur-xl sm:w-56"
          >
            <div className="relative z-10">
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
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
        active
          ? "bg-zinc-800 text-white"
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
      }`}
    >
      <span className="font-semibold">{children}</span>
      {active && <CheckCircle2 className="h-3.5 w-3.5 text-red-400" />}
    </button>
  );
}

function SectionCard({ item, index, viewMode, imageMode = "poster" }) {
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
  const delay = index < 30 ? Math.min(index * 0.015, 0.25) : 0;

  if (viewMode === "list") {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay }}
      >
        <Link
          href={href}
          className="block bg-zinc-900/30 border border-white/5 rounded-xl hover:border-red-500/30 hover:bg-zinc-900/60 transition-colors group overflow-hidden"
        >
          <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4">
            <div className="w-[180px] sm:w-[280px] aspect-video rounded-lg overflow-hidden relative shadow-md border border-white/5 bg-zinc-900 shrink-0">
              <PosterImage item={item} mode="backdrop" title={title} />
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
                      <Star className="h-3.5 w-3.5 fill-current" />
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Link
        href={href}
        className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
      >
        <motion.div
          className={`group relative ${aspect} overflow-hidden rounded-xl bg-zinc-900 shadow-md transition-all lg:hover:shadow-red-900/20`}
          whileHover={{
            scale: viewMode === "compact" ? 1.15 : 1.05,
            zIndex: 50,
            boxShadow:
              "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
          }}
          transition={{ type: "spring", stiffness: 300, damping: 23 }}
        >
          <div className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] border border-white/5 group-hover:border-red-500/40 transition-colors duration-300" />
          <PosterImage item={item} mode={effectiveImageMode} title={title} />

          <div
            className={`absolute left-0 top-0 z-20 hidden items-center justify-center rounded-br-2xl border-b border-r p-2 shadow-sm backdrop-blur-md transition-all duration-300 ease-out transform-gpu origin-top-left lg:flex lg:scale-0 lg:opacity-0 lg:group-hover:scale-100 lg:group-hover:opacity-100 ${
              type === "movie"
                ? "border-sky-500/30 bg-sky-500/15 text-sky-300"
                : "border-purple-500/30 bg-purple-500/15 text-purple-300"
            }`}
          >
            {type === "movie" ? (
              <Film className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            ) : (
              <MonitorPlay className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            )}
          </div>

          <div className="pointer-events-none absolute inset-0 z-10 hidden flex-col justify-between opacity-0 transition-opacity duration-300 group-hover:opacity-100 lg:flex">
            <div className="flex items-start justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3 transition-transform duration-300 group-hover:translate-y-0 lg:-translate-y-2">
              <div />
              <div className="flex flex-col items-end gap-1">
                {rating && (
                  <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                    <span className="font-mono text-xs font-black tracking-tight text-emerald-400">
                      {rating}
                    </span>
                    <img
                      src="/logo-TMDb.png"
                      alt=""
                      className="h-2.5 w-auto opacity-100"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 transition-transform duration-300 group-hover:translate-y-0 lg:translate-y-4">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1 text-left">
                  <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-md">
                    {title}
                  </h3>
                  <p className="mt-0.5 line-clamp-1 text-xs font-bold text-yellow-500 drop-shadow-md">
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

function GroupDivider({ title, count }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-red-500/40 to-red-500/15" />
      <div className="relative overflow-hidden inline-flex max-w-[75%] items-center gap-2 rounded-xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-3 py-1">
        <div className="relative z-10 flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-black uppercase tracking-wide text-red-100 drop-shadow-sm">
            {title}
          </span>
          <span className="text-[10px] font-bold text-red-300/80">
            {count}
          </span>
        </div>
      </div>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-red-500/40 to-red-500/15" />
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
  const [viewMode, setViewMode] = useState("grid");
  const [imageMode, setImageMode] = useState("poster");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    document.title = formatPageTitle(data?.title || "Dashboard");
  }, [data?.title]);

  useEffect(() => {
    const saved = window.localStorage.getItem("showverse:dashboard-section:viewMode");
    if (saved === "grid" || saved === "compact" || saved === "list") {
      setViewMode(saved);
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("showverse:dashboard-section:imageMode");
    if (saved === "poster" || saved === "backdrop") {
      setImageMode(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("showverse:dashboard-section:viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    window.localStorage.setItem("showverse:dashboard-section:imageMode", imageMode);
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

  const rawItems = Array.isArray(data?.items) ? data.items : [];

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

  const clearFilters = () => {
    setQuery("");
    setMediaFilter("all");
    setSourceFilter("all");
    setSortBy("rank");
    setGroupBy("none");
  };

  return (
    <main className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-red-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-red-600/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-red-700/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-red-800/25 blur-[120px] sm:blur-[150px]" />
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
                <div className="h-px w-12 bg-red-500" />
                <span className="text-red-400 font-bold uppercase tracking-widest text-xs">
                  {data?.eyebrow || "Dashboard"}
                </span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                {data?.title || "Cargando"}
                <span className="text-red-500">.</span>
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
                  { label: "Total", value: rawItems.length, icon: Star, color: "text-red-400" },
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
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500 z-10 pointer-events-none" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar..."
                className="w-full h-11 rounded-xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
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
                  ? "text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
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
                            ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
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
                            ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
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
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500 z-10 pointer-events-none" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por título..."
                className="w-full h-11 rounded-xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
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
                      ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
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
                      ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
            <span>
              Mostrando{" "}
              <strong className="font-black text-zinc-200">{sorted.length}</strong>{" "}
              de {rawItems.length}
            </span>
            {(query ||
              mediaFilter !== "all" ||
              sourceFilter !== "all" ||
              sortBy !== "rank" ||
              groupBy !== "none") && (
              <button
                type="button"
                onClick={clearFilters}
                className="font-bold text-red-400 transition hover:text-red-200"
              >
                Limpiar filtros
              </button>
            )}
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
          <div className="rounded-3xl border border-dashed border-red-500/20 bg-zinc-900/20 p-8 text-center text-red-100">
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
            {grouped.map((group) => (
              <section key={group.key} className="overflow-visible">
                <GroupDivider title={group.label} count={group.items.length} />
                <div className={favoritesGridClassFor(viewMode, imageMode, true)}>
                  {group.items.map((item, index) => (
                    <SectionCard
                      key={`${item.source}-${resolveType(item)}-${item.id}`}
                      item={item}
                      index={index}
                      viewMode={viewMode}
                      imageMode={imageMode}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className={favoritesGridClassFor(viewMode, imageMode)}>
            {sorted.map((item, index) => (
              <SectionCard
                key={`${item.source}-${resolveType(item)}-${item.id}`}
                item={item}
                index={index}
                viewMode={viewMode}
                imageMode={imageMode}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
