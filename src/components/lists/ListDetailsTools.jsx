"use client";

import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { setLocalStorageItem } from "@/lib/storage/localStorageBudget";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { LIQUID_GLASS_SURFACE } from "@/lib/ui/liquidGlass";
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
import { TitleRow } from "@/components/details/sectionSheet/SectionSheetRows";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import {
  saveUserDetailsSequence,
  saveUserDetailsSequenceFromLink,
} from "@/lib/navigation/userDetailsSequence";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";
import {
  MOBILE_REVEAL_ANIMATED,
  MOBILE_REVEAL_ANIMATED_PROPS,
  MOBILE_REVEAL_BASE,
  MOBILE_REVEAL_PIECE_PROPS,
  MobileHeroRevealContext,
} from "@/components/details/MobileDetailsHero";
import { useEnglishPosterItems } from "@/lib/tmdb/useEnglishPosterItems";
import {
  normalizeSearchText,
  titleMatchesQuery,
} from "@/lib/search/titleMatching";
import { useTitleNameSearch } from "@/lib/search/useTitleNameSearch";
import MobileOptionsSheet, { SheetOption, SheetOptionGroup, useInOptionsSheet } from "@/components/ui/MobileOptionsSheet";

const DETAILS_HREF_RE = /^\/details\/(movie|tv)\/(\d+)(?:[/?#]|$)/;
// Lo que ha de pasar sin scroll para dar el hover por intencionado: los
// pointerover de mientras son tarjetas que cruzan bajo el cursor. Chrome manda
// el suyo sintético ~160-190 ms después del último evento de scroll (medido).
const SCROLL_SETTLE_MS = 300;
// Vecinas (a cada lado) cuya nota se precalienta con la del hover.
const HOVER_NEARBY_TITLES = 6;

const INITIAL_RENDER_COUNT = 60;
// Tarjetas en carga mientras llegan los títulos (dos filas en escritorio).
const LOADING_PLACEHOLDER_CARDS = 12;
const RENDER_BATCH_SIZE = 60;

// Dentro de la hoja de filtros móvil (MobileOptionsSheet) el desplegable se
// pinta como un grupo con todas sus opciones a la vista.
// Barra de herramientas (buscador, filtros, vistas, borrar): el mismo cristal
// líquido que la sinopsis y el marcador de la cabecera (LIQUID_GLASS_SURFACE +
// LiquidGlassOpticalLayers como primer hijo), no el degradado plano de antes.
const LIST_TOOL_GLASS = `rounded-2xl ${LIQUID_GLASS_SURFACE}`;
// El foco del buscador se marca en su cristal (el input va transparente dentro).
const LIST_SEARCH_FOCUS = "focus-within:ring-2 focus-within:ring-inset focus-within:ring-purple-500/50";

function InlineDropdown(props) {
  if (useInOptionsSheet()) {
    return <SheetOptionGroup label={props.label} icon={props.icon}>{props.children}</SheetOptionGroup>;
  }
  return <InlineDropdownMenu {...props} />;
}

function InlineDropdownMenu({ label, valueLabel, icon: Icon, children }) {
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
        className={`inline-flex h-11 w-full items-center justify-between gap-3 px-4 text-sm text-zinc-200 transition-colors hover:text-white lg:min-w-[145px] ${LIST_TOOL_GLASS}`}
      >
        <LiquidGlassOpticalLayers />
        <div className="relative z-10 flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-purple-400" /> : null}
          <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-zinc-500">
            {label}:
          </span>
          <span className="truncate font-semibold text-white">
            {valueLabel}
          </span>
        </div>
        <ChevronDown
          className={`relative z-10 h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
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
                style={{
                  ...menuStyle,
                }}
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

// Dentro de la hoja de filtros móvil, cada opción es una píldora.
function DropdownItem(props) {
  if (useInOptionsSheet()) {
    return <SheetOption active={props.active} onClick={props.onClick}>{props.children}</SheetOption>;
  }
  return <DropdownMenuItem {...props} />;
}

function DropdownMenuItem({ active, onClick, children }) {
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
    posterLoading: Boolean(item?._englishPosterPending),
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
    .filter(({ item, meta }) => {
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

const VIEW_SWITCHER_OPTIONS = [
  { id: "grid", icon: Grid3X3, label: "Grid", sheetLabel: "Cuadrícula" },
  { id: "compact", icon: Rows3, label: "Compacto", sheetLabel: "Compacta" },
  { id: "list", icon: List, label: "Lista", sheetLabel: "Lista" },
];

function ViewSwitcher({ viewMode, setViewMode, className = "", fill = false }) {
  // En la hoja de filtros móvil, las vistas como píldoras con su nombre.
  if (useInOptionsSheet()) {
    return (
      <SheetOptionGroup label="Vista" icon={Grid3X3}>
        {VIEW_SWITCHER_OPTIONS.map(({ id, icon, sheetLabel }) => (
          <SheetOption key={id} icon={icon} active={viewMode === id} onClick={() => setViewMode(id)}>
            {sheetLabel}
          </SheetOption>
        ))}
      </SheetOptionGroup>
    );
  }
  return (
    <div
      className={`flex h-11 items-center p-1 ${LIST_TOOL_GLASS} ${className}`}
    >
      <LiquidGlassOpticalLayers />
      {VIEW_SWITCHER_OPTIONS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => setViewMode(id)}
          title={label}
          // Radio concéntrico al del contenedor: rounded-2xl (16px) menos su
          // relleno p-1 (4px) = 12px. Con rounded-lg el resaltado del modo
          // activo quedaba más cuadrado que la zona que lo alberga.
          className={`relative z-10 flex h-full min-w-10 items-center justify-center rounded-xl px-3 transition ${
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

// Alterna el MODO BORRAR, como el de Continuar viendo: solo con él activo cada
// tarjeta muestra su papelera, y quitar un título pide confirmación (ver
// ListItemRemoveControl). Va en la barra: junto al buscador en móvil y tras los
// modos de vista en escritorio.
function DeleteModeToggle({ editMode, setEditMode }) {
  return (
    <button
      type="button"
      onClick={() => setEditMode(!editMode)}
      title={editMode ? "Salir del modo borrar" : "Borrar títulos"}
      aria-label={editMode ? "Salir del modo borrar" : "Borrar títulos"}
      aria-pressed={editMode}
      className={`flex h-11 w-11 shrink-0 items-center justify-center text-sm font-bold transition-colors ${LIST_TOOL_GLASS} ${
        editMode ? "text-red-400" : "text-zinc-200 hover:text-white"
      }`}
    >
      <LiquidGlassOpticalLayers />
      {editMode ? <X className="relative z-10 h-4 w-4" /> : <Trash2 className="relative z-10 h-4 w-4" />}
    </button>
  );
}

// AJUSTES GUARDADOS, como en las páginas de usuario (Favoritos, Pendientes…):
// tipo, orden, agrupación y modo de vista se recuerdan en localStorage, uno
// por cada clase de página (`prefsKey`: listas o colecciones), y valen para
// todas las de esa clase. La búsqueda no se guarda.
//
// Se leen tras montar (en un layout effect, antes de pintar) y no en el
// `useState` inicial: estas páginas se pintan en el servidor, que no ve
// localStorage, y React no corrige al hidratar lo que no coincide.
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const LIST_PREF_VIEW_MODES = new Set(VIEW_SWITCHER_OPTIONS.map(({ id }) => id));

function readListPref(key, valid) {
  try {
    const saved = window.localStorage.getItem(key);
    return saved && valid(saved) ? saved : null;
  } catch {
    return null;
  }
}

function useListPref(prefsKey, name, fallback, valid) {
  const [value, setValue] = useState(fallback);
  const key = `showverse:${prefsKey}Details:${name}`;
  const restoredRef = useRef(false);
  useClientLayoutEffect(() => {
    const saved = readListPref(key, valid);
    restoredRef.current = true;
    if (saved != null) setValue(saved);
  }, [key]);
  const update = useCallback(
    (next) => {
      setValue(next);
      if (restoredRef.current) setLocalStorageItem(key, next);
    },
    [key],
  );
  return [value, update];
}

const isTypeFilter = (value) => Object.hasOwn(typeLabel, value);
const isSortBy = (value) => Object.hasOwn(sortLabel, value);
const isGroupBy = (value) => Object.hasOwn(groupLabel, value);
const isViewMode = (value) => LIST_PREF_VIEW_MODES.has(value);

export default function FilterableListItems({
  items,
  getMeta = getListItemMeta,
  renderCard,
  renderAction,
  emptyTitle = "No hay elementos",
  emptyText = "No se encontraron títulos con estos filtros.",
  // Solo quien puede gestionar la lista ve el modo borrar.
  editable = false,
  // Listas de la comunidad: los títulos sin portada (sin póster inglés en
  // TMDb, o cuya imagen no carga) no se enseñan, en vez de dejar un hueco gris.
  // En las listas propias se quedan: el usuario tiene que poder verlos y
  // quitarlos.
  hideMissingPosters = false,
  // Los títulos aún no han llegado: tarjetas en carga, no el aviso de vacía.
  loading = false,
  // (mediaType, tmdbId) al pasar el ratón (o el foco) por un título: la
  // página pide ahí su nota de IMDb si no la tiene (useListImdbRatings).
  onTitleHover,
  // Con qué ajustes guardados va esta página (ver useListPref).
  prefsKey = "list",
}) {
  const previewClick = usePreviewOpen();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useListPref(prefsKey, "typeFilter", "all", isTypeFilter);
  const [sortBy, setSortBy] = useListPref(prefsKey, "sortBy", "list-order", isSortBy);
  const [groupBy, setGroupBy] = useListPref(prefsKey, "groupBy", "none", isGroupBy);
  const [viewMode, setViewMode] = useListPref(prefsKey, "viewMode", "grid", isViewMode);
  const [editMode, setEditMode] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filtersRef = useRef(null);
  const { isPinned: filtersPinned } = useStickyToolbarState(filtersRef);
  // Al VOLVER (atrás/adelante) se renderizan todos los items de golpe para que la
  // altura del documento sea correcta al instante y el scroll se restaure sin saltos.
  const isBackNav = useIsHistoryNavigation();
  const heroReveal = useContext(MobileHeroRevealContext);
  const revealPiece = heroReveal ? MOBILE_REVEAL_PIECE_PROPS : undefined;
  const [visibleCount, setVisibleCount] = useState(
    isBackNav ? Number.MAX_SAFE_INTEGER : INITIAL_RENDER_COUNT,
  );
  // Evita que el efecto de reinicio (que fija visibleCount a INITIAL_RENDER_COUNT)
  // se ejecute en el PRIMER render tras volver: mantendría el render completo.
  const skipInitialResetRef = useRef(isBackNav);
  const loadMoreRef = useRef(null);

  // La búsqueda mira también el nombre en inglés y en español: se piden con el
  // tipo y el id de TMDb normalizados de cada elemento (su meta).
  const searchMetas = useMemo(
    () => (Array.isArray(items) ? items.map((item, index) => getMeta(item, index)) : []),
    [items, getMeta],
  );
  const titleNamesVersion = useTitleNameSearch(searchMetas, q);
  const entries = useMemo(
    () => filterAndSortItems(items, getMeta, q, typeFilter, sortBy),
    // titleNamesVersion: recalcular al llegar los nombres en inglés y español.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, getMeta, q, typeFilter, sortBy, titleNamesVersion],
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
  // No se pinta el poster_path almacenado (que puede estar localizado en
  // español) durante la resolución asíncrona: cada hueco queda neutro hasta
  // disponer del artwork inglés final.
  const englishPosterItems = useEnglishPosterItems(visibleItems, true, {
    hideOriginalPosters: true,
  });
  // Tarjetas cuya imagen no cargó (solo con `hideMissingPosters`).
  const [brokenPosters, setBrokenPosters] = useState(() => new Set());
  const markPosterBroken = useCallback((path) => {
    if (!path) return;
    setBrokenPosters((current) => {
      if (current.has(path)) return current;
      const next = new Set(current);
      next.add(path);
      return next;
    });
  }, []);
  const visibleGroupsWithEnglishPosters = useMemo(() => {
    let itemIndex = 0;
    return visibleGroups
      .map((group) => ({
        ...group,
        entries: group.entries
          .map((entry) => {
            const item = englishPosterItems[itemIndex++] || entry.item;
            return { ...entry, item, meta: getMeta(item, entry.index) };
          })
          .filter(
            (entry) =>
              !hideMissingPosters ||
              !(
                entry.item?._englishPosterMissing ||
                brokenPosters.has(entry.meta.posterPath)
              ),
          ),
      }))
      .filter((group) => group.entries.length);
  }, [visibleGroups, englishPosterItems, getMeta, hideMissingPosters, brokenPosters]);
  const posterErrorHandler = (entry) =>
    hideMissingPosters ? () => markPosterBroken(entry.meta.posterPath) : undefined;

  useEffect(() => {
    if (skipInitialResetRef.current) {
      skipInitialResetRef.current = false;
      return;
    }
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

  // Anterior/Siguiente en la ficha (gesto móvil y flechas de escritorio) recorre
  // esta lista en el orden en que se ve. Se guarda el orden completo de los
  // grupos, no solo las tarjetas montadas: el resto se pinta por lotes.
  const captureDetailsSequence = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[href^="/details/"]');
    if (!link) return;

    const hrefs = groups.flatMap((group) =>
      group.entries.map((entry) => entry.meta.href),
    );
    if (!saveUserDetailsSequence(hrefs, link.getAttribute("href"))) {
      saveUserDetailsSequenceFromLink(link, event.currentTarget);
    }
  };

  // Delegado en el contenedor: vale para las tarjetas propias y para las de
  // `renderCard`, y para las filas de la vista lista. Solo ratón y teclado: en
  // táctil no hay hover y el toque abre la ficha.
  //
  // La nota se pide EN EL MISMO hover, sin esperar. Lo único que se descarta es
  // lo que pasa bajo el cursor mientras la página se desplaza (con la rueda
  // sobre la parrilla cruzaban decenas de tarjetas y cada una pedía su nota):
  // al parar el scroll se pide solo la tarjeta en la que ha quedado el cursor.
  const hoverStateRef = useRef({ link: null, scrollAt: 0, x: -1, y: -1, timer: 0 });
  const titlesRootRef = useRef(null);
  const requestTitleImdb = (link) => {
    const match = link?.getAttribute("href")?.match(DETAILS_HREF_RE);
    if (!match) return;
    // Las tarjetas de alrededor (orden de la parrilla) van en la misma
    // petición: al pasar a la siguiente, su nota ya está.
    const links = titlesRootRef.current
      ? [...titlesRootRef.current.querySelectorAll('a[href^="/details/"]')]
      : [];
    const index = links.indexOf(link);
    const nearby = [];
    if (index >= 0) {
      for (let offset = 1; offset <= HOVER_NEARBY_TITLES; offset += 1) {
        for (const neighbour of [links[index - offset], links[index + offset]]) {
          const near = neighbour?.getAttribute("href")?.match(DETAILS_HREF_RE);
          if (near) nearby.push([near[1], Number(near[2])]);
        }
      }
    }
    onTitleHover(match[1], Number(match[2]), nearby);
  };
  useEffect(() => {
    if (!onTitleHover) return undefined;
    const state = hoverStateRef.current;
    const onScroll = () => {
      state.scrollAt = performance.now();
      clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        const root = titlesRootRef.current;
        if (!root || state.x < 0) return;
        const under = document.elementFromPoint(state.x, state.y);
        const link = under?.closest?.('a[href^="/details/"]');
        if (link && root.contains(link) && link.matches(":hover")) {
          state.link = link;
          requestTitleImdb(link);
        }
      }, SCROLL_SETTLE_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(state.timer);
    };
    // requestTitleImdb solo depende de onTitleHover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTitleHover]);
  const handleTitlePointerOver = (event) => {
    if (event.pointerType !== "mouse") return;
    const state = hoverStateRef.current;
    state.x = event.clientX;
    state.y = event.clientY;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[href^="/details/"]');
    if (link === state.link) return;
    state.link = link;
    if (!link || performance.now() - state.scrollAt < SCROLL_SETTLE_MS) return;
    requestTitleImdb(link);
  };
  const handleTitleFocus = (event) => {
    const target = event.target;
    if (target instanceof Element) {
      requestTitleImdb(target.closest('a[href^="/details/"]'));
    }
  };

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
        posterLoading={entry.meta.posterLoading}
        onPosterError={posterErrorHandler(entry)}
        disableHover={viewMode === "compact"}
      />
    );
  };

  return (
    <div
      className="space-y-7"
      onClickCapture={captureDetailsSequence}
      ref={titlesRootRef}
      onPointerOver={onTitleHover ? handleTitlePointerOver : undefined}
      onFocusCapture={onTitleHover ? handleTitleFocus : undefined}
    >
      <motion.div
        ref={filtersRef}
        data-menu-pinned={filtersPinned}
        // Con la cabecera inmersiva móvil (UnifiedListDetailsLayout) aparece
        // al pasar el navbar inferior, como la sinopsis, y entra y sale
        // animada como el marcador (en sus piezas de cristal: `revealPiece`).
        {...(heroReveal ? { ...heroReveal, ...MOBILE_REVEAL_ANIMATED_PROPS } : {})}
        className={`relative sticky top-[calc(3.5rem+var(--sv-safe-top))] z-[70] mb-4 space-y-1 transition-all duration-300 sm:top-[calc(5rem+var(--sv-safe-top))] ${
          heroReveal ? `${MOBILE_REVEAL_BASE} ${MOBILE_REVEAL_ANIMATED}` : ""
        }`}
        initial={isBackNav ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex gap-2 lg:hidden">
          <div {...revealPiece} className={`flex-1 ${LIST_TOOL_GLASS} ${LIST_SEARCH_FOCUS}`}>
            <LiquidGlassOpticalLayers />
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 shrink-0 -translate-y-1/2 text-purple-400"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar..."
              className="relative z-10 h-11 w-full rounded-2xl bg-transparent py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-zinc-400 focus:outline-none"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-md p-1 transition-colors hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            ) : null}
          </div>
          <button
            {...revealPiece}
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center transition-colors ${LIST_TOOL_GLASS} ${
              mobileFiltersOpen ? "text-white" : "text-zinc-200 hover:text-white"
            }`}
          >
            <LiquidGlassOpticalLayers />
            <Filter className="relative z-10 h-4 w-4" />
          </button>
          {editable ? (
            <DeleteModeToggle editMode={editMode} setEditMode={setEditMode} />
          ) : null}
        </div>

        <MobileOptionsSheet
          open={mobileFiltersOpen}
          onClose={() => setMobileFiltersOpen(false)}
          accent="purple"
        >
          <TypeDropdown typeFilter={typeFilter} setTypeFilter={setTypeFilter} />
          <SortDropdown sortBy={sortBy} setSortBy={setSortBy} />
          <GroupDropdown groupBy={groupBy} setGroupBy={setGroupBy} />
          <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
        </MobileOptionsSheet>

        <div className="hidden gap-3 lg:flex">
          <div className={`min-w-[260px] flex-1 ${LIST_TOOL_GLASS} ${LIST_SEARCH_FOCUS}`}>
            <LiquidGlassOpticalLayers />
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 shrink-0 -translate-y-1/2 text-purple-400"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título..."
              className="relative z-10 h-11 w-full rounded-2xl bg-transparent py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-zinc-400 focus:outline-none"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-md p-1 transition-colors hover:bg-white/10"
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
          {editable ? (
            <DeleteModeToggle editMode={editMode} setEditMode={setEditMode} />
          ) : null}
        </div>
      </motion.div>

      {entries.length === 0 && loading ? (
        <div className={listPosterGridClass} aria-busy="true">
          {Array.from({ length: LOADING_PLACEHOLDER_CARDS }, (_, index) => (
            <ListPosterCard key={index} posterLoading disableHover />
          ))}
        </div>
      ) : entries.length === 0 ? (
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
              <ul className="space-y-2">
                {group.entries.map((entry) => {
                  const action = renderAction
                    ? renderAction(entry.item, entry.meta, editMode)
                    : null;
                  return (
                    <li
                      key={`${entry.meta.mediaType}-${entry.meta.id}-${entry.index}-list`}
                    >
                      <TitleRow
                        item={entry.item}
                        mediaType={entry.meta.mediaType}
                        href={entry.meta.href}
                        onClick={
                          entry.meta.href
                            ? previewClick(
                                {
                                  id: entry.meta.id,
                                  title: entry.meta.title,
                                  name: entry.meta.title,
                                  poster_path: entry.meta.posterPath,
                                },
                                { mediaType: entry.meta.mediaType },
                              )
                            : undefined
                        }
                        title={entry.meta.title}
                        year={entry.meta.year}
                        voteAverage={entry.meta.voteAverage}
                        posterPath={entry.meta.posterPath}
                        posterLoading={entry.meta.posterLoading}
                        onPosterError={posterErrorHandler(entry)}
                        showImdb={Boolean(
                          entry.meta.imdbRating != null ||
                            entry.meta.voteAverage != null,
                        )}
                        imdbRating={entry.meta.imdbRating}
                        action={action}
                      />
                    </li>
                  );
                })}
              </ul>
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
