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
        className="h-11 w-full min-w-0 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 transition hover:border-zinc-600 sm:min-w-[170px]"
      >
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-amber-400" />}
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
            className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-zinc-800 bg-[#121212] p-1 shadow-2xl sm:w-56"
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
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
        active
          ? "bg-zinc-800 text-white"
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
      }`}
    >
      <span className="font-semibold">{children}</span>
      {active && <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />}
    </button>
  );
}

function SectionCard({ item, index, viewMode }) {
  const type = resolveType(item);
  const title = getTitle(item);
  const year = getYear(item);
  const rating =
    typeof item?.vote_average === "number" && item.vote_average > 0
      ? item.vote_average.toFixed(1)
      : null;
  const genre = getGenreLabel(item);
  const href = `/details/${type === "tv" ? "tv" : "movie"}/${item.id}`;
  const imageMode = viewMode === "list" ? "backdrop" : "poster";
  const aspect = imageMode === "backdrop" ? "aspect-[16/9]" : "aspect-[2/3]";
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
          className="group block overflow-hidden rounded-xl border border-white/5 bg-zinc-900/35 transition hover:border-amber-500/30 hover:bg-zinc-900/70"
        >
          <div className="flex items-center gap-3 p-2 sm:gap-5 sm:p-4">
            <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-zinc-900 sm:w-64">
              <PosterImage item={item} mode="backdrop" title={title} />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-black text-white sm:text-xl">
                {title}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-400">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                    type === "movie"
                      ? "bg-sky-500/10 text-sky-300"
                      : "bg-purple-500/10 text-purple-300"
                  }`}
                >
                  {type === "movie" ? "Película" : "Serie"}
                </span>
                {year && <span>{year}</span>}
                <span>{genre}</span>
                {rating && (
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {rating}
                  </span>
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
      <Link href={href} className="block">
        <motion.div
          className={`group relative ${aspect} overflow-hidden rounded-xl border border-white/5 bg-zinc-900 shadow-md transition`}
          whileHover={{
            scale: viewMode === "compact" ? 1.12 : 1.05,
            zIndex: 20,
            borderColor: "rgba(245,158,11,0.45)",
            boxShadow: "0 22px 35px -14px rgba(0,0,0,0.8)",
          }}
          transition={{ type: "spring", stiffness: 300, damping: 23 }}
        >
          <PosterImage item={item} mode={imageMode} title={title} />

          <div className="absolute inset-0 hidden flex-col justify-between opacity-0 transition-opacity duration-300 group-hover:flex group-hover:opacity-100 lg:flex">
            <div className="flex items-start justify-between gap-3 bg-gradient-to-b from-black/85 via-black/35 to-transparent p-3">
              <span
                className={`rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider backdrop-blur-md ${
                  type === "movie"
                    ? "border-sky-500/30 bg-sky-500/20 text-sky-200"
                    : "border-purple-500/30 bg-purple-500/20 text-purple-200"
                }`}
              >
                {type === "movie" ? "Película" : "Serie"}
              </span>
              {rating && (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/25 bg-black/50 px-1.5 py-0.5 text-xs font-black text-amber-300 backdrop-blur-md">
                  <Star className="h-3 w-3 fill-current" />
                  {rating}
                </span>
              )}
            </div>

            <div className="bg-gradient-to-t from-black/90 via-black/55 to-transparent p-3">
              <h3 className="line-clamp-2 text-sm font-black leading-tight text-white drop-shadow-md">
                {title}
              </h3>
              <p className="mt-1 line-clamp-1 text-[11px] font-bold text-amber-300">
                {[year, genre].filter(Boolean).join(" · ")}
              </p>
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
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/35 to-amber-500/10" />
      <div className="inline-flex max-w-[75%] items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1">
        <span className="truncate text-xs font-black uppercase tracking-wide text-amber-100">
          {title}
        </span>
        <span className="text-[10px] font-bold text-amber-300/80">
          {count}
        </span>
      </div>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-amber-500/35 to-amber-500/10" />
    </div>
  );
}

function gridClassFor(viewMode) {
  if (viewMode === "compact") {
    return "grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12";
  }
  if (viewMode === "list") return "grid grid-cols-1 gap-3";
  return "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7";
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
    window.localStorage.setItem("showverse:dashboard-section:viewMode", viewMode);
  }, [viewMode]);

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
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1800px]">
        <header className="mb-6 flex flex-col gap-5 border-b border-white/10 pb-6">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-zinc-300 transition hover:border-amber-400/40 hover:text-white"
              aria-label="Volver al dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-900 p-1">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-lg p-2 transition ${viewMode === "list" ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
                title="Vista lista"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("compact")}
                className={`rounded-lg p-2 transition ${viewMode === "compact" ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
                title="Vista compacta"
              >
                <Grid2X2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`rounded-lg p-2 transition ${viewMode === "grid" ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
                title="Vista grid"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-px w-10 bg-amber-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-400">
                {data?.eyebrow || "Dashboard"}
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-white sm:text-6xl">
              {data?.title || "Cargando"}
              <span className="text-amber-500">.</span>
            </h1>
            <p className="mt-2 text-sm text-zinc-500 sm:text-base">
              {data?.description || "Explora todos los títulos de esta sección."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <span className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-bold text-zinc-300">
              {rawItems.length} títulos
            </span>
            <span className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-200">
              {stats.movies} películas
            </span>
            <span className="rounded-xl border border-purple-500/20 bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-200">
              {stats.shows} series
            </span>
            <span className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200">
              {stats.trakt} Trakt · {stats.tmdb} TMDb
            </span>
          </div>
        </header>

        <section className="sticky top-0 z-30 -mx-4 mb-6 border-b border-white/10 bg-[#0a0a0a]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar título, género o año"
                className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-11 pr-10 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-500/50"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-500 transition hover:text-white"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex xl:shrink-0">
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
                className="font-bold text-amber-300 transition hover:text-amber-100"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </section>

        {loading ? (
          <div className={gridClassFor(viewMode)}>
            {Array.from({ length: 28 }).map((_, index) => (
              <div
                key={index}
                className={`animate-pulse rounded-xl bg-zinc-900 ${viewMode === "list" ? "h-36" : viewMode === "compact" ? "aspect-[2/3]" : "aspect-[2/3]"}`}
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center text-red-100">
            {error}
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-12 text-center">
            <Film className="mx-auto mb-4 h-10 w-10 text-zinc-600" />
            <h2 className="text-xl font-black text-zinc-200">
              No hay resultados
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Ajusta la búsqueda o los filtros para ver más títulos.
            </p>
          </div>
        ) : grouped ? (
          <div>
            {grouped.map((group) => (
              <section key={group.key}>
                <GroupDivider title={group.label} count={group.items.length} />
                <div className={gridClassFor(viewMode)}>
                  {group.items.map((item, index) => (
                    <SectionCard
                      key={`${item.source}-${resolveType(item)}-${item.id}`}
                      item={item}
                      index={index}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className={gridClassFor(viewMode)}>
            {sorted.map((item, index) => (
              <SectionCard
                key={`${item.source}-${resolveType(item)}-${item.id}`}
                item={item}
                index={index}
                viewMode={viewMode}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
