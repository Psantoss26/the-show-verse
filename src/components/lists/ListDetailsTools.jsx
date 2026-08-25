"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  Trash2,
  X,
} from "lucide-react";
import ListPosterCard, {
  listPosterGridClass,
} from "@/components/lists/ListPosterCard";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";
import { useEnglishPosterItems } from "@/lib/tmdb/useEnglishPosterItems";
import {
  normalizeSearchText,
  titleMatchesQuery,
} from "@/lib/search/titleMatching";

const INITIAL_RENDER_COUNT = 60;
const RENDER_BATCH_SIZE = 60;

function InlineDropdown({ label, valueLabel, icon: Icon, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  // Misma capa que los selectores de páginas de usuario: el portal evita que
  // el blur del panel de filtros se sume al del menú y lo vuelva opaco.
  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return;

    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = Math.min(rect.width, window.innerWidth - 24);
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - menuWidth - 12),
    );
    const availableBelow = window.innerHeight - rect.bottom - 12;

    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width: menuWidth,
      maxHeight: Math.max(64, Math.min(448, availableBelow)),
      zIndex: 1000,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      const target = event.target;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

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
    <div ref={ref} className="relative min-w-0 w-full lg:w-auto lg:shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 px-4 text-sm text-zinc-200 shadow-lg backdrop-blur-lg transition hover:from-white/15 hover:to-white/10 hover:text-white lg:min-w-[145px]"
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-purple-400" /> : null}
          <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-zinc-500">
            {label}:
          </span>
          <span className="truncate font-semibold text-white">
            {valueLabel}
          </span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
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
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
        active
          ? "bg-white/10 font-bold text-white"
          : "text-zinc-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="font-medium">{children}</span>
      {active ? <CheckCircle2 className="h-4 w-4 text-purple-400" /> : null}
    </button>
  );
}

export function getListItemMeta(item) {
  const mediaType =
    item?.media_type || (item?.name && !item?.title ? "tv" : "movie");
  const title = item?.title || item?.name || "Sin título";
  const date = item?.release_date || item?.first_air_date || "";
  const year = /^\d{4}/.test(date)
    ? date.slice(0, 4)
    : item?.year
      ? String(item.year)
      : "";
  const posterPath = item?.poster_path || item?.backdrop_path || null;
  const href =
    item?.href || (item?.id ? `/details/${mediaType}/${item.id}` : null);
  const voteAverage =
    typeof item?.vote_average === "number" ? item.vote_average : null;
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
  const needle = normalizeSearchText(q);

  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index, meta: getMeta(item, index) }))
    .filter(({ meta }) => {
      if (typeFilter === "movies" && meta.mediaType !== "movie") return false;
      if (typeFilter === "shows" && meta.mediaType !== "tv") return false;
      if (!needle) return true;
      return titleMatchesQuery(item, needle) || titleMatchesQuery(meta, needle);
    })
    .sort((a, b) => {
      if (sortBy === "list-order") return a.index - b.index;
      if (sortBy === "title-asc")
        return a.meta.title.localeCompare(b.meta.title);
      if (sortBy === "title-desc")
        return b.meta.title.localeCompare(a.meta.title);
      if (sortBy === "rating-desc")
        return (b.meta.voteAverage || 0) - (a.meta.voteAverage || 0);
      if (sortBy === "rating-asc")
        return (a.meta.voteAverage || 0) - (b.meta.voteAverage || 0);
      if (sortBy === "year-desc")
        return Number(b.meta.year || 0) - Number(a.meta.year || 0);
      if (sortBy === "year-asc")
        return Number(a.meta.year || 0) - Number(b.meta.year || 0);
      if (sortBy === "added-asc")
        return String(a.meta.addedAt).localeCompare(String(b.meta.addedAt));
      return String(b.meta.addedAt).localeCompare(String(a.meta.addedAt));
    });
}

function groupItems(entries, groupBy) {
  if (groupBy === "none") return [{ key: "all", title: "Todos", entries }];

  const map = new Map();
  for (const entry of entries) {
    let key = "Sin datos";
    if (groupBy === "type")
      key = entry.meta.mediaType === "tv" ? "Series" : "Películas";
    if (groupBy === "year") key = entry.meta.year || "Sin año";
    if (groupBy === "decade") {
      const year = Number(entry.meta.year || 0);
      key = year ? `${Math.floor(year / 10) * 10}s` : "Sin década";
    }
    if (groupBy === "rating") {
      const rating = Number(entry.meta.voteAverage || 0);
      key =
        rating >= 8
          ? "Excelente"
          : rating >= 7
            ? "Notable"
            : rating > 0
              ? "Correcta"
              : "Sin nota";
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

function ViewSwitcher({ viewMode, setViewMode, className = "", fill = false }) {
  return (
    <div
      className={`flex h-11 items-center rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-1 shadow-lg backdrop-blur-lg ${className}`}
    >
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
            fill ? "flex-1" : ""
          } ${
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

// Alterna el MODO BORRAR. En escritorio el botón de eliminar de cada tarjeta
// aparece al pasar el ratón por encima; en un móvil no hay hover, así que sin
// esto no había forma de quitar títulos de una lista desde el teléfono.
function DeleteModeToggle({ editMode, setEditMode }) {
  return (
    <button
      type="button"
      onClick={() => setEditMode(!editMode)}
      title={editMode ? "Salir del modo borrar" : "Borrar títulos"}
      aria-label={editMode ? "Salir del modo borrar" : "Borrar títulos"}
      aria-pressed={editMode}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-white/10 to-white/5 text-sm font-bold shadow-lg backdrop-blur-lg transition-all ${
        editMode
          ? "text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
          : "text-zinc-200 hover:bg-black/30"
      }`}
    >
      {editMode ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}

export default function FilterableListItems({
  items,
  getMeta = getListItemMeta,
  renderCard,
  emptyTitle = "No hay elementos",
  emptyText = "No se encontraron títulos con estos filtros.",
  // Solo quien puede gestionar la lista ve el modo borrar.
  editable = false,
}) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("list-order");
  const [groupBy, setGroupBy] = useState("none");
  const [viewMode, setViewMode] = useState("grid");
  const [editMode, setEditMode] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filtersRef = useRef(null);
  const { isSticky: filtersSticky, isPinned: filtersPinned } =
    useStickyToolbarState(filtersRef);
  // Al VOLVER (atrás/adelante) se renderizan todos los items de golpe para que la
  // altura del documento sea correcta al instante y el scroll se restaure sin saltos.
  const isBackNav = useIsHistoryNavigation();
  const [visibleCount, setVisibleCount] = useState(
    isBackNav ? Number.MAX_SAFE_INTEGER : INITIAL_RENDER_COUNT,
  );
  // Evita que el efecto de reinicio (que fija visibleCount a INITIAL_RENDER_COUNT)
  // se ejecute en el PRIMER render tras volver: mantendría el render completo.
  const skipInitialResetRef = useRef(isBackNav);
  const loadMoreRef = useRef(null);

  const entries = useMemo(
    () => filterAndSortItems(items, getMeta, q, typeFilter, sortBy),
    [items, getMeta, q, typeFilter, sortBy],
  );
  const groups = useMemo(
    () => groupItems(entries, groupBy),
    [entries, groupBy],
  );
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
  // Solo se resuelven los títulos ya montados en pantalla. Así una lista de
  // cientos de elementos no dispara la resolución de artwork completa al abrir.
  const visibleItems = useMemo(
    () => visibleGroups.flatMap((group) => group.entries.map((entry) => entry.item)),
    [visibleGroups],
  );
  const englishPosterItems = useEnglishPosterItems(visibleItems);
  const visibleGroupsWithEnglishPosters = useMemo(() => {
    let itemIndex = 0;
    return visibleGroups.map((group) => ({
      ...group,
      entries: group.entries.map((entry) => {
        const item = englishPosterItems[itemIndex++] || entry.item;
        return { ...entry, item, meta: getMeta(item, entry.index) };
      }),
    }));
  }, [visibleGroups, englishPosterItems, getMeta]);

  useEffect(() => {
    if (skipInitialResetRef.current) {
      skipInitialResetRef.current = false;
      return;
    }
    setVisibleCount(INITIAL_RENDER_COUNT);
  }, [q, typeFilter, sortBy, groupBy, viewMode]);

  // Salir del modo borrar al cerrar el panel: dejarlo activo sin el menú a la
  // vista haría que un toque en una tarjeta borrara sin contexto.
  useEffect(() => {
    if (!mobileFiltersOpen && editMode) setEditMode(false);
  }, [mobileFiltersOpen, editMode]);

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
    if (renderCard) return renderCard(entry.item, entry.meta, viewMode, editMode);
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
        ref={filtersRef}
        data-menu-pinned={filtersPinned}
        className="relative sticky top-14 z-[70] mb-4 space-y-1 transition-all duration-300 sm:top-20"
        initial={isBackNav ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex gap-2 lg:hidden">
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 shrink-0 -translate-y-1/2 text-purple-400"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar..."
              className="h-11 w-full rounded-2xl bg-gradient-to-br from-white/10 to-white/5 py-2.5 pl-10 pr-10 text-sm text-white shadow-lg backdrop-blur-lg placeholder:text-zinc-400 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all ${
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
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className={`overflow-visible lg:hidden ${
                filtersSticky
                  ? "absolute left-0 right-0 top-full z-[80] !mt-2"
                  : "relative"
              }`}
            >
              {/* DOS CONTROLES POR FILA, como en Historial: antes iban a uno
                  por fila hasta 640px, así que en un móvil el panel ocupaba
                  cuatro filas y dejaba medio ancho sin usar. */}
              <div className="space-y-2 pt-2">
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <TypeDropdown
                      typeFilter={typeFilter}
                      setTypeFilter={setTypeFilter}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <SortDropdown sortBy={sortBy} setSortBy={setSortBy} />
                  </div>
                </div>

                {/* Última fila: agrupar + modos de vista + borrar */}
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <GroupDropdown groupBy={groupBy} setGroupBy={setGroupBy} />
                  </div>
                  <div className="flex min-w-0 flex-1 gap-2">
                    <ViewSwitcher
                      viewMode={viewMode}
                      setViewMode={setViewMode}
                      className="min-w-0 flex-1"
                      fill
                    />
                    {editable ? (
                      <DeleteModeToggle
                        editMode={editMode}
                        setEditMode={setEditMode}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="hidden gap-3 lg:flex">
          <div className="relative min-w-[260px] flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 shrink-0 -translate-y-1/2 text-purple-400"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título..."
              className="h-11 w-full rounded-2xl bg-gradient-to-br from-white/10 to-white/5 py-2.5 pl-10 pr-10 text-sm text-white shadow-lg backdrop-blur-lg placeholder:text-zinc-400 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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
        visibleGroupsWithEnglishPosters.map((group) => (
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
        <div ref={loadMoreRef} className="h-8 w-full" aria-hidden="true" />
      ) : null}
    </div>
  );
}

// Cada filtro por separado para poder COLOCARLOS: el panel de móvil los reparte
// en filas de dos, y el de escritorio los pone seguidos.
function TypeDropdown({ typeFilter, setTypeFilter }) {
  return (
    <InlineDropdown
      label="Tipo"
      valueLabel={typeLabel[typeFilter]}
      icon={Filter}
    >
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
  );
}

function SortDropdown({ sortBy, setSortBy }) {
  return (
    <InlineDropdown
      label="Ordenar"
      valueLabel={sortLabel[sortBy]}
      icon={ArrowUpDown}
    >
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
  );
}

function GroupDropdown({ groupBy, setGroupBy }) {
  return (
    <InlineDropdown
      label="Agrupar"
      valueLabel={groupLabel[groupBy]}
      icon={Layers3}
    >
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
      <TypeDropdown typeFilter={typeFilter} setTypeFilter={setTypeFilter} />
      <SortDropdown sortBy={sortBy} setSortBy={setSortBy} />
      <GroupDropdown groupBy={groupBy} setGroupBy={setGroupBy} />
    </>
  );
}
