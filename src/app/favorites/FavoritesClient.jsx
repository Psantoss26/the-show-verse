"use client";

import { useEffect, useState, useMemo, useCallback, memo } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import {
  Loader2,
  Heart,
  Film,
  ChevronDown,
  CheckCircle2,
  ArrowUpDown,
  Layers,
  Search,
  X,
  LayoutList,
  LayoutGrid,
  Grid3x3,
} from "lucide-react";

// ================== UTILS ==================
function normText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function buildImg(path, size = "w500") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

// ================== UI COMPONENTS ==================
function StatCard({
  label,
  value,
  icon: Icon,
  colorClass = "text-white",
  loading = false,
}) {
  return (
    <div className="flex-1 min-w-0 bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-1 py-2 md:p-4 flex flex-col items-center justify-center gap-0.5 md:gap-1 backdrop-blur-sm transition hover:bg-zinc-900/70">
      <div
        className={`p-1 md:p-2 rounded-full bg-white/5 mb-0.5 md:mb-1 ${colorClass}`}
      >
        <Icon className="w-3 h-3 md:w-4 md:h-4" />
      </div>
      <div className="text-base md:text-2xl font-black text-white tracking-tight">
        {loading ? (
          <span className="inline-block h-5 md:h-7 w-8 md:w-12 rounded-lg bg-white/10 animate-pulse" />
        ) : (
          value
        )}
      </div>
      <div className="text-[8px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight px-0.5">
        {label}
      </div>
    </div>
  );
}

function InlineDropdown({ label, valueLabel, icon: Icon, children }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDown = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div className="relative w-full lg:w-auto lg:shrink-0">
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

// ================== CARD COMPONENTS ==================
const FavoriteCard = memo(function FavoriteCard({
  item,
  index = 0,
  totalItems = 0,
  viewMode = "list",
}) {
  const type = item.media_type || (item.title ? "movie" : "tv");
  const title = item.title || item.name || "Sin título";
  const year = item.release_date
    ? item.release_date.slice(0, 4)
    : item.first_air_date
      ? item.first_air_date.slice(0, 4)
      : null;
  const href = `/details/${type}/${item.id}`;

  const animDelay =
    totalItems > 20 ? Math.min(index * 0.02, 0.3) : index * 0.05;
  const shouldAnimate = index < 50;

  // LIST VIEW
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
          className="block bg-zinc-900/30 border border-white/5 rounded-xl hover:border-emerald-500/30 hover:bg-zinc-900/60 transition-colors group overflow-hidden"
        >
          <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4">
            <div className="w-[140px] sm:w-[210px] aspect-video rounded-lg overflow-hidden relative shadow-md border border-white/5 bg-zinc-900 shrink-0">
              {item.backdrop_path ? (
                <img
                  src={buildImg(item.backdrop_path, "w780")}
                  alt={title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="w-8 h-8 text-zinc-700" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <h4 className="text-white font-bold text-base leading-tight truncate">
                {title}
              </h4>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span
                  className={`font-bold uppercase tracking-wider text-[9px] px-1 rounded-sm ${type === "movie" ? "bg-sky-500/10 text-sky-500" : "bg-purple-500/10 text-purple-500"}`}
                >
                  {type === "movie" ? "PELÍCULA" : "SERIE"}
                </span>
                {year && (
                  <>
                    <span>•</span>
                    <span>{year}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  // COMPACT VIEW
  if (viewMode === "compact") {
    return (
      <motion.div
        initial={shouldAnimate ? { opacity: 0, scale: 0.9 } : false}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{
          duration: 0.25,
          delay: shouldAnimate ? animDelay : 0,
        }}
        whileHover={{
          scale: 1.15,
          zIndex: 50,
          boxShadow:
            "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
        }}
        className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-900 border border-white/5 shadow-md group"
      >
        <Link href={href} className="block w-full h-full">
          {item.poster_path ? (
            <img
              src={buildImg(item.poster_path, "w342")}
              alt={title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-8 h-8 text-zinc-700" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
            <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${type === "movie" ? "bg-sky-500/40 text-sky-100" : "bg-purple-500/40 text-purple-100"}`}
                >
                  {type === "movie" ? "Película" : "Serie"}
                </span>
              </div>
              <h5 className="text-white font-bold text-[10px] leading-tight line-clamp-2">
                {title}
              </h5>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  // GRID VIEW
  return (
    <motion.div
      initial={shouldAnimate ? { opacity: 0, scale: 0.9 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{
        duration: 0.25,
        delay: shouldAnimate ? animDelay : 0,
      }}
      className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-900 border border-white/5 shadow-md group hover:border-emerald-500/30 transition-all"
    >
      <Link href={href} className="block w-full h-full">
        {item.poster_path ? (
          <img
            src={buildImg(item.poster_path, "w342")}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-8 h-8 text-zinc-700" />
          </div>
        )}
      </Link>
    </motion.div>
  );
});

// ================== MAIN COMPONENT ==================
export default function FavoritesClient() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [groupBy, setGroupBy] = useState("none");
  const [sortBy, setSortBy] = useState("added-desc");
  const [viewMode, setViewMode] = useState("list");

  const loadFavorites = useCallback(async () => {
    if (!session?.user?.tmdbAccountId || !session?.user?.tmdbSessionId) return;

    setLoading(true);
    try {
      const responses = await Promise.all([
        fetch(
          `/api/tmdb/account/favorite?type=movies`,
        ).then((r) => (r.ok ? r.json() : { results: [] })),
        fetch(
          `/api/tmdb/account/favorite?type=tv`,
        ).then((r) => (r.ok ? r.json() : { results: [] })),
      ]);

      const movies = (responses[0].results || []).map((m) => ({
        ...m,
        media_type: "movie",
      }));
      const shows = (responses[1].results || []).map((s) => ({
        ...s,
        media_type: "tv",
      }));

      setItems([...movies, ...shows]);
    } catch (error) {
      console.error("Error cargando favoritos:", error);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const filtered = useMemo(() => {
    const needle = normText(q);
    return items.filter((item) => {
      if (typeFilter === "movies" && item.media_type !== "movie") return false;
      if (typeFilter === "shows" && item.media_type !== "tv") return false;
      if (needle) {
        const title = normText(item.title || item.name || "");
        if (!title.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, typeFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "added-desc") return arr.reverse();
    if (sortBy === "added-asc") return arr;
    if (sortBy === "title-asc") {
      return arr.sort((a, b) => {
        const ta = (a.title || a.name || "").toLowerCase();
        const tb = (b.title || b.name || "").toLowerCase();
        return ta.localeCompare(tb);
      });
    }
    if (sortBy === "title-desc") {
      return arr.sort((a, b) => {
        const ta = (a.title || a.name || "").toLowerCase();
        const tb = (b.title || b.name || "").toLowerCase();
        return tb.localeCompare(ta);
      });
    }
    return arr;
  }, [filtered, sortBy]);

  const grouped = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", title: null, items: sorted }];
    }
    if (groupBy === "type") {
      const map = new Map();
      for (const item of sorted) {
        const key = item.media_type === "movie" ? "Películas" : "Series";
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
      }
      return Array.from(map.entries()).map(([key, items]) => ({
        key,
        title: key,
        items,
      }));
    }
    return [{ key: "all", title: null, items: sorted }];
  }, [sorted, groupBy]);

  const stats = useMemo(() => {
    const movies = filtered.filter((i) => i.media_type === "movie").length;
    const shows = filtered.filter((i) => i.media_type === "tv").length;
    return { total: filtered.length, movies, shows };
  }, [filtered]);

  if (!session?.user?.tmdbAccountId) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <Heart className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-zinc-400">
            Inicia sesión para ver tus favoritos
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-emerald-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-red-500/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <motion.header
          className="mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px w-12 bg-red-500" />
                <span className="text-red-400 font-bold uppercase tracking-widest text-xs">
                  COLECCIÓN
                </span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                Favoritos<span className="text-red-500">.</span>
              </h1>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg">
                Tu colección de películas y series favoritas.
              </p>
            </div>
          </div>

          <motion.div
            className="grid grid-cols-3 gap-2 md:gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <StatCard
              label="Total"
              value={stats.total}
              loading={loading}
              icon={Heart}
              colorClass="text-red-400 bg-red-500/10"
            />
            <StatCard
              label="Películas"
              value={stats.movies}
              loading={loading}
              icon={Film}
              colorClass="text-sky-400 bg-sky-500/10"
            />
            <StatCard
              label="Series"
              value={stats.shows}
              loading={loading}
              icon={CheckCircle2}
              colorClass="text-purple-400 bg-purple-500/10"
            />
          </motion.div>
        </motion.header>

        <motion.div
          className="space-y-6 min-w-0"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            {/* Móvil: Fila 1 - Búsqueda */}
            <div className="lg:hidden">
              <div className="relative w-full">
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
            </div>

            {/* Móvil: Fila 2 - Tipo y Agrupar */}
            <div className="flex gap-2 lg:hidden">
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
                  icon={Film}
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
                  valueLabel={groupBy === "none" ? "Sin agrupar" : "Por tipo"}
                  icon={Layers}
                >
                  {({ close }) => (
                    <>
                      <DropdownItem
                        active={groupBy === "none"}
                        onClick={() => {
                          setGroupBy("none");
                          close();
                        }}
                      >
                        Sin agrupar
                      </DropdownItem>
                      <DropdownItem
                        active={groupBy === "type"}
                        onClick={() => {
                          setGroupBy("type");
                          close();
                        }}
                      >
                        Por tipo
                      </DropdownItem>
                    </>
                  )}
                </InlineDropdown>
              </div>
            </div>

            {/* Móvil: Fila 3 - Ordenar + Vista */}
            <div className="flex gap-2 lg:hidden">
              <div className="flex-1">
                <InlineDropdown
                  label="Orden"
                  valueLabel={
                    sortBy === "added-desc"
                      ? "Reciente"
                      : sortBy === "added-asc"
                        ? "Antiguo"
                        : sortBy === "title-asc"
                          ? "A-Z"
                          : "Z-A"
                  }
                  icon={ArrowUpDown}
                >
                  {({ close }) => (
                    <>
                      <DropdownItem
                        active={sortBy === "added-desc"}
                        onClick={() => {
                          setSortBy("added-desc");
                          close();
                        }}
                      >
                        Reciente
                      </DropdownItem>
                      <DropdownItem
                        active={sortBy === "added-asc"}
                        onClick={() => {
                          setSortBy("added-asc");
                          close();
                        }}
                      >
                        Antiguo
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

              <div className="flex flex-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center">
                <button
                  onClick={() => setViewMode("list")}
                  className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "list"
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                    }`}
                  title="Lista"
                >
                  <LayoutList className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("compact")}
                  className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "compact"
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                    }`}
                  title="Compacta"
                >
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "grid"
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                    }`}
                  title="Grid"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Desktop: Una sola fila */}
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
                icon={Film}
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
                valueLabel={groupBy === "none" ? "Sin agrupar" : "Por tipo"}
                icon={Layers}
              >
                {({ close }) => (
                  <>
                    <DropdownItem
                      active={groupBy === "none"}
                      onClick={() => {
                        setGroupBy("none");
                        close();
                      }}
                    >
                      Sin agrupar
                    </DropdownItem>
                    <DropdownItem
                      active={groupBy === "type"}
                      onClick={() => {
                        setGroupBy("type");
                        close();
                      }}
                    >
                      Por tipo
                    </DropdownItem>
                  </>
                )}
              </InlineDropdown>

              <InlineDropdown
                label="Ordenar"
                valueLabel={
                  sortBy === "added-desc"
                    ? "Reciente"
                    : sortBy === "added-asc"
                      ? "Antiguo"
                      : sortBy === "title-asc"
                        ? "A-Z"
                        : "Z-A"
                }
                icon={ArrowUpDown}
              >
                {({ close }) => (
                  <>
                    <DropdownItem
                      active={sortBy === "added-desc"}
                      onClick={() => {
                        setSortBy("added-desc");
                        close();
                      }}
                    >
                      Reciente
                    </DropdownItem>
                    <DropdownItem
                      active={sortBy === "added-asc"}
                      onClick={() => {
                        setSortBy("added-asc");
                        close();
                      }}
                    >
                      Antiguo
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

              <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center">
                <button
                  onClick={() => setViewMode("list")}
                  className={`h-full px-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "list"
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                    }`}
                  title="Lista"
                >
                  <LayoutList className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("compact")}
                  className={`h-full px-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "compact"
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                    }`}
                  title="Compacta"
                >
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`h-full px-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "grid"
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                    }`}
                  title="Grid"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="text-center py-20">
              <Heart className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-500">No hay favoritos</p>
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map((group) => (
                <div key={group.key}>
                  {group.title && (
                    <h2 className="text-2xl font-black text-white mb-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/10" />
                      <span>{group.title}</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </h2>
                  )}

                  {viewMode === "list" ? (
                    <motion.div
                      className="space-y-3"
                      layout
                      initial={false}
                    >
                      <AnimatePresence mode="popLayout">
                        {group.items.map((item, idx) => (
                          <FavoriteCard
                            key={item.id}
                            item={item}
                            index={idx}
                            totalItems={group.items.length}
                            viewMode={viewMode}
                          />
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  ) : (
                    <motion.div
                      className={`grid gap-3 ${viewMode === "compact"
                        ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8"
                        : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                        }`}
                      layout
                      initial={false}
                    >
                      <AnimatePresence mode="popLayout">
                        {group.items.map((item, idx) => (
                          <FavoriteCard
                            key={item.id}
                            item={item}
                            index={idx}
                            totalItems={group.items.length}
                            viewMode={viewMode}
                          />
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
