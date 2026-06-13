"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  Filter,
  Grid3X3,
  Layers3,
  List,
  Rows3,
  Search,
  X,
} from "lucide-react";
import ListPosterCard, { listPosterGridClass } from "@/components/lists/ListPosterCard";

const INITIAL_RENDER_COUNT = 60;
const RENDER_BATCH_SIZE = 60;

function InlineDropdown({ label, valueLabel, icon: Icon, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative w-full lg:w-auto lg:shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
            setOpen(false);
          }
        }}
        className="inline-flex h-11 w-full items-center justify-between gap-3 rounded-xl bg-gradient-to-br from-white/10 to-white/5 px-4 text-sm text-zinc-200 shadow-lg backdrop-blur-lg transition hover:from-white/15 hover:to-white/10 hover:text-white lg:min-w-[145px]"
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-purple-400" /> : null}
          <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-zinc-500">
            {label}:
          </span>
          <span className="truncate font-semibold text-white">{valueLabel}</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            tabIndex={-1}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute left-0 top-full z-[100] mt-2 w-full overflow-y-auto overflow-x-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 p-2 shadow-2xl backdrop-blur-2xl"
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
          ? "bg-white/15 text-white"
          : "text-zinc-400 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="font-medium">{children}</span>
      {active ? <CheckCircle2 className="h-3.5 w-3.5 text-purple-400" /> : null}
    </button>
  );
}

export function getListItemMeta(item) {
  const mediaType = item?.media_type || (item?.name && !item?.title ? "tv" : "movie");
  const title = item?.title || item?.name || "Sin título";
  const date = item?.release_date || item?.first_air_date || "";
  const year = /^\d{4}/.test(date) ? date.slice(0, 4) : item?.year ? String(item.year) : "";
  const posterPath = item?.poster_path || item?.backdrop_path || null;
  const href = item?.href || (item?.id ? `/details/${mediaType}/${item.id}` : null);
  const voteAverage = typeof item?.vote_average === "number" ? item.vote_average : null;
  const addedAt = item?.listed_at || item?.created_at || item?.added_at || "";

  return {
    id: item?.id,
    title,
    mediaType,
    year,
    posterPath,
    href,
    voteAverage,
    imdbRating: item?.imdbRating,
    addedAt,
  };
}

const typeLabel = {
  all: "Todo",
  movies: "Películas",
  shows: "Series",
};

const sortLabel = {
  "list-order": "Orden de lista",
  "title-asc": "A-Z",
  "title-desc": "Z-A",
  "rating-desc": "Mejor valorados",
  "rating-asc": "Peor valorados",
  "year-desc": "Más recientes",
  "year-asc": "Más antiguos",
  "added-desc": "Añadido reciente",
  "added-asc": "Añadido antiguo",
};

const groupLabel = {
  none: "Sin agrupar",
  type: "Tipo",
  year: "Año",
  decade: "Década",
  rating: "Puntuación",
};

function filterAndSortItems(items, getMeta, q, typeFilter, sortBy) {
  const needle = q.trim().toLowerCase();

  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index, meta: getMeta(item, index) }))
    .filter(({ meta }) => {
      if (typeFilter === "movies" && meta.mediaType !== "movie") return false;
      if (typeFilter === "shows" && meta.mediaType !== "tv") return false;
      if (!needle) return true;
      return String(meta.title || "").toLowerCase().includes(needle);
    })
    .sort((a, b) => {
      if (sortBy === "list-order") return a.index - b.index;
      if (sortBy === "title-asc") return a.meta.title.localeCompare(b.meta.title);
      if (sortBy === "title-desc") return b.meta.title.localeCompare(a.meta.title);
      if (sortBy === "rating-desc") return (b.meta.voteAverage || 0) - (a.meta.voteAverage || 0);
      if (sortBy === "rating-asc") return (a.meta.voteAverage || 0) - (b.meta.voteAverage || 0);
      if (sortBy === "year-desc") return Number(b.meta.year || 0) - Number(a.meta.year || 0);
      if (sortBy === "year-asc") return Number(a.meta.year || 0) - Number(b.meta.year || 0);
      if (sortBy === "added-asc") return String(a.meta.addedAt).localeCompare(String(b.meta.addedAt));
      return String(b.meta.addedAt).localeCompare(String(a.meta.addedAt));
    });
}

function groupItems(entries, groupBy) {
  if (groupBy === "none") return [{ key: "all", title: "Todos", entries }];

  const map = new Map();
  for (const entry of entries) {
    let key = "Sin datos";
    if (groupBy === "type") key = entry.meta.mediaType === "tv" ? "Series" : "Películas";
    if (groupBy === "year") key = entry.meta.year || "Sin año";
    if (groupBy === "decade") {
      const year = Number(entry.meta.year || 0);
      key = year ? `${Math.floor(year / 10) * 10}s` : "Sin década";
    }
    if (groupBy === "rating") {
      const rating = Number(entry.meta.voteAverage || 0);
      key = rating >= 8 ? "Excelente" : rating >= 7 ? "Notable" : rating > 0 ? "Correcta" : "Sin nota";
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  }

  return Array.from(map.entries()).map(([key, groupedEntries]) => ({
    key,
    title: key,
    entries: groupedEntries,
  }));
}

function ViewSwitcher({ viewMode, setViewMode }) {
  return (
    <div className="flex h-11 items-center rounded-xl bg-gradient-to-br from-white/10 to-white/5 p-1 shadow-lg backdrop-blur-lg">
      {[
        { id: "grid", icon: Grid3X3, label: "Grid" },
        { id: "compact", icon: Rows3, label: "Compacto" },
        { id: "list", icon: List, label: "Lista" },
      ].map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => setViewMode(id)}
          title={label}
          className={`flex h-full min-w-10 items-center justify-center rounded-lg px-3 transition ${
            viewMode === id
              ? "bg-white/90 text-black shadow-lg"
              : "text-zinc-400 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export default function FilterableListItems({
  items,
  getMeta = getListItemMeta,
  renderCard,
  emptyTitle = "No hay elementos",
  emptyText = "No se encontraron títulos con estos filtros.",
}) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("list-order");
  const [groupBy, setGroupBy] = useState("none");
  const [viewMode, setViewMode] = useState("grid");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT);
  const loadMoreRef = useRef(null);

  const entries = useMemo(
    () => filterAndSortItems(items, getMeta, q, typeFilter, sortBy),
    [items, getMeta, q, typeFilter, sortBy],
  );
  const groups = useMemo(() => groupItems(entries, groupBy), [entries, groupBy]);
  const visibleGroups = useMemo(() => {
    let remaining = visibleCount;
    const nextGroups = [];

    for (const group of groups) {
      if (remaining <= 0) break;
      const visibleEntries = group.entries.slice(0, remaining);
      if (visibleEntries.length) {
        nextGroups.push({ ...group, entries: visibleEntries });
        remaining -= visibleEntries.length;
      }
    }

    return nextGroups;
  }, [groups, visibleCount]);
  const hasMoreEntries = visibleCount < entries.length;

  useEffect(() => {
    setVisibleCount(INITIAL_RENDER_COUNT);
  }, [q, typeFilter, sortBy, groupBy, viewMode]);

  useEffect(() => {
    if (!hasMoreEntries) return;
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) =>
            Math.min(current + RENDER_BATCH_SIZE, entries.length),
          );
        }
      },
      { rootMargin: "900px 0px", threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [entries.length, hasMoreEntries]);

  const renderEntry = (entry) => {
    if (renderCard) return renderCard(entry.item, entry.meta, viewMode);
    return (
      <ListPosterCard
        key={`${entry.meta.mediaType}-${entry.meta.id}-${entry.index}`}
        href={entry.meta.href}
        title={entry.meta.title}
        year={entry.meta.year}
        mediaType={entry.meta.mediaType}
        posterPath={entry.meta.posterPath}
        voteAverage={entry.meta.voteAverage}
        imdbRating={entry.meta.imdbRating}
        disableHover={viewMode === "compact"}
      />
    );
  };

  return (
    <div className="space-y-7">
      <motion.div
        className="sticky top-20 z-[70] mb-4 space-y-1 transition-all duration-300"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex gap-2 lg:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar..."
              className="h-11 w-full rounded-xl bg-gradient-to-br from-white/10 to-white/5 py-2.5 pl-10 pr-10 text-sm text-white shadow-lg backdrop-blur-lg placeholder:text-zinc-400 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all ${
              mobileFiltersOpen
                ? "bg-gradient-to-br from-white/15 to-white/10 text-white shadow-lg backdrop-blur-lg"
                : "bg-gradient-to-br from-white/10 to-white/5 text-zinc-200 shadow-lg backdrop-blur-lg hover:from-white/15 hover:to-white/10 hover:text-white"
            }`}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>

        <AnimatePresence>
          {mobileFiltersOpen ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-visible lg:hidden"
            >
              <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                <FilterDropdowns
                  typeFilter={typeFilter}
                  setTypeFilter={setTypeFilter}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  groupBy={groupBy}
                  setGroupBy={setGroupBy}
                />
                <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="hidden gap-3 lg:flex">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título..."
              className="h-11 w-full rounded-xl bg-gradient-to-br from-white/10 to-white/5 py-2.5 pl-10 pr-10 text-sm text-white shadow-lg backdrop-blur-lg placeholder:text-zinc-400 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            ) : null}
          </div>
          <FilterDropdowns
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            groupBy={groupBy}
            setGroupBy={setGroupBy}
          />
          <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
        </div>
      </motion.div>

      {entries.length === 0 ? (
        <div className="rounded-3xl bg-black/[0.08] bg-gradient-to-br from-white/10 via-transparent to-black/15 py-20 text-center shadow-none backdrop-blur-[28px]">
          <h3 className="text-lg font-bold text-zinc-300">{emptyTitle}</h3>
          <p className="mt-1 text-sm text-zinc-500">{emptyText}</p>
        </div>
      ) : (
        visibleGroups.map((group) => (
          <section key={group.key} className="space-y-4">
            {groupBy !== "none" ? (
              <div className="flex items-center justify-between rounded-2xl bg-black/[0.08] bg-gradient-to-br from-white/10 via-transparent to-black/15 px-4 py-3 shadow-none backdrop-blur-[28px]">
                <h2 className="text-xl font-black text-white">{group.title}</h2>
                <span className="text-xs font-bold text-zinc-500">
                  {group.entries.length} títulos
                </span>
              </div>
            ) : null}

            {viewMode === "list" ? (
              <div className="space-y-3">
                {group.entries.map((entry) => (
                  <Link
                    key={`${entry.meta.mediaType}-${entry.meta.id}-${entry.index}-list`}
                    href={entry.meta.href || "#"}
                    className="group flex items-center gap-4 rounded-xl bg-black/[0.08] bg-gradient-to-br from-white/10 via-transparent to-black/15 p-3 shadow-none backdrop-blur-[28px] transition hover:bg-white/10"
                  >
                    <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                      <ListPosterCard
                        title={entry.meta.title}
                        mediaType={entry.meta.mediaType}
                        posterPath={entry.meta.posterPath}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-bold text-white group-hover:text-purple-200">
                        {entry.meta.title}
                      </h3>
                      <p className="text-sm text-zinc-500">
                        {entry.meta.mediaType === "tv" ? "Serie" : "Película"}
                        {entry.meta.year ? ` · ${entry.meta.year}` : ""}
                      </p>
                    </div>
                    {entry.meta.voteAverage ? (
                      <span className="font-mono text-sm font-black text-emerald-300">
                        {entry.meta.voteAverage.toFixed(1)}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            ) : (
              <div
                className={
                  viewMode === "compact"
                    ? "relative z-0 grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8"
                    : listPosterGridClass
                }
              >
                {group.entries.map(renderEntry)}
              </div>
            )}
          </section>
        ))
      )}

      {hasMoreEntries ? (
        <div
          ref={loadMoreRef}
          className="h-8 w-full"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

function FilterDropdowns({
  typeFilter,
  setTypeFilter,
  sortBy,
  setSortBy,
  groupBy,
  setGroupBy,
}) {
  return (
    <>
      <InlineDropdown label="Tipo" valueLabel={typeLabel[typeFilter]} icon={Filter}>
        {({ close }) => (
          <>
            {[
              ["all", "Todo"],
              ["movies", "Películas"],
              ["shows", "Series"],
            ].map(([value, label]) => (
              <DropdownItem
                key={value}
                active={typeFilter === value}
                onClick={() => {
                  setTypeFilter(value);
                  close();
                }}
              >
                {label}
              </DropdownItem>
            ))}
          </>
        )}
      </InlineDropdown>

      <InlineDropdown label="Ordenar" valueLabel={sortLabel[sortBy]} icon={ArrowUpDown}>
        {({ close }) => (
          <>
            {Object.entries(sortLabel).map(([value, label]) => (
              <DropdownItem
                key={value}
                active={sortBy === value}
                onClick={() => {
                  setSortBy(value);
                  close();
                }}
              >
                {label}
              </DropdownItem>
            ))}
          </>
        )}
      </InlineDropdown>

      <InlineDropdown label="Agrupar" valueLabel={groupLabel[groupBy]} icon={Layers3}>
        {({ close }) => (
          <>
            {Object.entries(groupLabel).map(([value, label]) => (
              <DropdownItem
                key={value}
                active={groupBy === value}
                onClick={() => {
                  setGroupBy(value);
                  close();
                }}
              >
                {label}
              </DropdownItem>
            ))}
          </>
        )}
      </InlineDropdown>
    </>
  );
}
