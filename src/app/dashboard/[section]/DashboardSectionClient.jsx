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
  Bookmark,
  CheckCircle2,
  ChevronDown,
  Eye,
  Film,
  Filter,
  Grid2X2,
  Layers3,
  LayoutGrid,
  List,
  MonitorPlay,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { formatPageTitle } from "@/lib/pageTitle";
import { deriveSectionLabel } from "@/lib/dashboard/sectionLabel";
import {
  normalizeSearchText,
  titleMatchesQuery,
} from "@/lib/search/titleMatching";
import { tmdbImageLangsParam } from "@/lib/tmdb/imageLanguages";
import { pickByLanguageLadder } from "@/lib/tmdb/imageLanguageLadder";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";
import usePageToolbarSearchFit from "@/hooks/usePageToolbarSearchFit";
import LiquidButton from "@/components/LiquidButton";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import HoverExpandCard from "@/components/ui/HoverExpandCard";
import MobileFiltersPanel from "@/components/ui/MobileFiltersPanel";
import PageStatCard from "@/components/ui/PageStatCard";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import useUserTitleStates, {
  userTitleKey,
} from "@/lib/hooks/useUserTitleStates";
import {
  peekListArtwork,
  requestListArtwork,
} from "@/lib/tmdb/artworkBatch";
import {
  isSectionImageMode,
  isSectionViewMode,
  writeSectionViewPrefsCookie,
} from "@/lib/dashboard/sectionViewPrefs";
import {
  fetchImdbScoresForItems,
  getScoreItemKey,
  readScoreCache,
  writeScoreCache,
} from "@/lib/userLists/listScoreCache";

const EMPTY_SCORES = new Map();

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

// `short`: el valor en el botón del panel móvil, como en Favoritos ("Reciente",
// "Sin agr."), para que quepa entero junto a su rótulo.
const SORT_OPTIONS = [
  { key: "rank", label: "Ranking original", short: "Ranking" },
  { key: "title-asc", label: "Título A-Z", short: "A-Z" },
  { key: "title-desc", label: "Título Z-A", short: "Z-A" },
  { key: "rating-desc", label: "Mejor valoración", short: "Mejor" },
  { key: "rating-asc", label: "Peor valoración", short: "Peor" },
  { key: "date-desc", label: "Más recientes", short: "Reciente" },
  { key: "date-asc", label: "Más antiguos", short: "Antiguo" },
];

const GROUP_OPTIONS = [
  { key: "none", label: "Sin agrupar", short: "Sin agr." },
  { key: "media", label: "Tipo", short: "Tipo" },
  { key: "genre", label: "Género", short: "Género" },
  { key: "year", label: "Año", short: "Año" },
  { key: "decade", label: "Década", short: "Década" },
  { key: "rating", label: "Valoración", short: "Valoración" },
];

const VIEW_MODE_BUTTONS = [
  ["list", List, "Vista lista"],
  ["compact", Grid2X2, "Vista compacta"],
  ["grid", LayoutGrid, "Vista cuadrícula"],
];
const IMAGE_MODE_BUTTONS = [
  ["poster", Film, "Pósters"],
  ["backdrop", MonitorPlay, "Fondos"],
];
// Botón activo de los selectores de vista: el acento de la sección (ámbar) con
// la forma de los de Favoritos.
const ACTIVE_TOGGLE_CLASS =
  "bg-gradient-to-br from-amber-400 to-yellow-600 text-black shadow-lg shadow-amber-500/20";
const INACTIVE_TOGGLE_CLASS = "text-zinc-400 hover:text-white hover:bg-white/10";

const VIEW_MODE_STORAGE_KEY = "showverse:dashboard-section:viewMode:v3";
const IMAGE_MODE_STORAGE_KEY = "showverse:dashboard-section:imageMode";
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

function normText(value) {
  return normalizeSearchText(value);
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
  const year = getYear(item);

  if (groupBy === "media") {
    return {
      key: type,
      label: type === "movie" ? "Películas" : "Series",
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

// Escalera de idioma de toda la app (inglés → español → original → sin
// idioma, lib/tmdb/imageLanguageLadder); dentro de cada idioma, el más grande.
function pickDashboardBackdrop(backdrops = [], originalLanguage) {
  const area = (img) => (img?.width || 0) * (img?.height || 0);
  const pickLargest = (list) =>
    list.reduce((best, img) => (area(img) > area(best) ? img : best), list[0]);
  return pickByLanguageLadder(backdrops, pickLargest, { originalLanguage })?.file_path || null;
}

async function fetchDashboardBackdrop(type, id, originalLanguage) {
  if (!TMDB_API_KEY || !type || !id) return null;
  try {
    const url =
      `https://api.themoviedb.org/3/${type}/${id}/images` +
      `?api_key=${TMDB_API_KEY}&${tmdbImageLangsParam(originalLanguage)}`;
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return null;
    const json = await response.json();
    return pickDashboardBackdrop(json?.backdrops || [], originalLanguage);
  } catch {
    return null;
  }
}

function dashboardImageKey(item) {
  return `${resolveType(item)}:${item?.id}`;
}

// Backdrop de la tarjeta: el del lote de arte (/api/tmdb/artwork, el mismo que
// usan las filas del dashboard) y, si el lote no responde, /images directo.
// `undefined` = aún sin respuesta.
function peekDashboardBackdrop(item) {
  const picks = peekListArtwork(resolveType(item), item?.id);
  return picks ? picks.dashboardBackdrop || null : undefined;
}

async function loadDashboardBackdrop(item) {
  const type = resolveType(item);
  const picks = await requestListArtwork(type, item?.id);
  if (picks) return picks.dashboardBackdrop || null;
  return fetchDashboardBackdrop(type, item?.id, item?.original_language);
}

// Las primeras tarjetas (lo que cabe en la primera pantalla de la rejilla más
// densa) piden su imagen ya; el resto, al acercarse.
const EAGER_IMAGE_COUNT = 24;
// Tarjetas que entran animadas: lo que cabe en la primera pantalla de la
// rejilla más densa (compacta, 8 columnas × 6 filas). Favoritos lo estima con
// el viewport; aquí tiene que valer ya en el HTML del servidor.
const ENTRY_ANIMATED_CARDS = 48;

function PosterImage({
  item,
  mode = "poster",
  title,
  previewBackdropPath,
  backdropPending = false,
  eager = false,
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
    // Backdrop aún en camino (lote de arte): el fondo de la tarjeta, sin el
    // icono de «sin imagen», que se veía como tarjeta rota un instante.
    if (backdropPending) return <div className="h-full w-full bg-zinc-900" />;
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
      loading={eager ? "eager" : "lazy"}
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
    // Como en Favoritos: el menú mide lo que su contenido (nunca menos que su
    // botón ni más que la ventana). Al estrecharse la barra el botón queda en
    // un icono y el menú no debe heredar ese ancho.
    const menuMaxWidth = window.innerWidth - 24;
    const measured = menuRef.current?.offsetWidth || rect.width;
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - Math.min(measured, menuMaxWidth) - 12),
    );

    const availableBelow = window.innerHeight - rect.bottom - 12;
    const menuMaxHeight = Math.max(64, Math.min(448, availableBelow));

    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width: "max-content",
      minWidth: rect.width,
      maxWidth: menuMaxWidth,
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
        className="h-11 min-w-0 w-full inline-flex items-center justify-between gap-3 px-4 rounded-2xl transition text-sm sv-page-toolbar-trigger lg:min-w-[140px] lg:w-auto lg:max-w-none bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-amber-400" />}
          <span
            className={`sv-page-toolbar-label text-zinc-500 font-bold text-xs uppercase tracking-wider ${
              compactMobile ? "hidden sm:inline" : ""
            }`}
          >
            {label}:
          </span>
          <span className="sv-page-toolbar-value hidden min-w-0 truncate font-semibold text-white sm:inline lg:overflow-visible lg:whitespace-nowrap">
            {valueLabel}
          </span>
          <span className="sv-page-toolbar-value min-w-0 truncate font-semibold text-white sm:hidden">
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
                className="flex flex-col overflow-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl p-2 shadow-2xl"
                style={{
                  ...menuStyle,
                }}
              >
                <div
                  className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-color:#3f3f46_transparent]"
                  style={{ scrollbarWidth: "thin", scrollbarGutter: "stable" }}
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

function DropdownItem({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2 rounded-xl text-left text-sm transition flex items-center justify-between gap-6 ${
        active
          ? "bg-white/10 text-white font-bold"
          : "text-zinc-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="font-medium whitespace-nowrap">{children}</span>
      {/* Hueco de la marca siempre reservado: el menú mide lo que su contenido. */}
      {active ? (
        <CheckCircle2 className="w-4 h-4 shrink-0 text-amber-400" />
      ) : (
        <span aria-hidden="true" className="w-4 h-4 shrink-0" />
      )}
    </button>
  );
}

// Píldora de cristal del hover: la de Favoritos y la de Pendientes EN UNA.
//  - Siempre, el tipo (película / serie).
//  - En FAVORITOS: lo que enseña Favoritos —visionados (veces en películas, ojo
//    en series vistas) y la nota del usuario—.
//  - Si no: lo que enseña Pendientes —nota de TMDb y de IMDb—.
//  - En PENDIENTES, además, su marcador.
// Sin sesión no hay favoritos ni pendientes: queda la versión de las notas.
function SectionHoverIndicator({
  type,
  tmdbScore,
  imdbScore,
  favorite = false,
  watchlisted = false,
  watchCount = 0,
  userRating,
  compact = false,
}) {
  const tmdb = Number(tmdbScore);
  const imdb = Number(imdbScore);
  const hasTmdb = Number.isFinite(tmdb) && tmdb > 0;
  const hasImdb = Number.isFinite(imdb) && imdb > 0;
  const hasUserRating = userRating != null && Number(userRating) > 0;
  const count = Number.isFinite(Number(watchCount)) ? Math.max(0, Number(watchCount)) : 0;
  const itemClassName = compact ? "h-7 w-8" : "h-9 w-10";
  const iconClassName = compact ? "h-4 w-4" : "h-5 w-5";
  const valueClassName = compact ? "h-7 w-8 text-base" : "h-9 w-10 text-xl";

  return (
    <div
      className={`pointer-events-none absolute ${compact ? "bottom-1.5 px-1" : "bottom-2 px-1.5"} left-1/2 z-20 hidden -translate-x-1/2 translate-y-3 scale-95 opacity-0 items-center overflow-hidden rounded-full ${LIQUID_GLASS_PANEL} text-white shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:flex lg:group-hover:translate-y-0 lg:group-hover:scale-100 lg:group-hover:opacity-100 will-change-transform transform-gpu`}
      aria-hidden="true"
    >
      <span
        className={`flex ${itemClassName} shrink-0 items-center justify-center ${type === "movie" ? "text-sky-400" : "text-violet-400"}`}
      >
        {type === "movie" ? (
          <Film className={iconClassName} />
        ) : (
          <MonitorPlay className={iconClassName} />
        )}
      </span>
      {favorite ? (
        <>
          {type === "movie" ? (
            <span
              className={`flex ${valueClassName} shrink-0 items-center justify-center font-black leading-none tabular-nums text-emerald-400`}
            >
              {count}
            </span>
          ) : count > 0 ? (
            <span
              className={`flex ${itemClassName} shrink-0 items-center justify-center text-emerald-400`}
            >
              <Eye className={iconClassName} />
            </span>
          ) : null}
          {hasUserRating ? (
            <span
              className={`flex ${valueClassName} shrink-0 items-center justify-center font-black leading-none text-amber-300`}
            >
              <span className="tabular-nums leading-none">{userRating}</span>
            </span>
          ) : null}
        </>
      ) : (
        <>
          {hasTmdb ? (
            <span
              className={`flex ${valueClassName} shrink-0 items-center justify-center font-black leading-none tabular-nums text-sky-400`}
            >
              {tmdb.toFixed(1)}
            </span>
          ) : null}
          {hasImdb ? (
            <span
              className={`flex ${valueClassName} shrink-0 items-center justify-center font-black leading-none tabular-nums text-amber-300`}
            >
              {imdb.toFixed(1)}
            </span>
          ) : null}
        </>
      )}
      {watchlisted ? (
        <span
          className={`flex ${itemClassName} shrink-0 items-center justify-center text-blue-400`}
        >
          <Bookmark className={`${iconClassName} fill-current`} />
        </span>
      ) : null}
    </div>
  );
}

// Tarjeta de las secciones del dashboard. Mismo diseño que las de Favoritos (y
// el resto de páginas de usuario): en reposo solo la imagen; en hover, el aro
// de color de la página (ámbar aquí, rojo en Favoritos) y la píldora de estado.
// En lista, título y año. Al pulsar se abre la ficha rápida en el drawer.
function SectionCard({
  item,
  index,
  totalItems = 0,
  viewMode,
  imageMode = "poster",
  previewBackdropPath,
  backdropPending = false,
  watchCount = 0,
  userRating = null,
  favorite = false,
  watchlisted = false,
  initialImdbScore,
}) {
  const type = resolveType(item);
  // Nota de IMDb: la de la caché compartida con Pendientes o, si no está, se
  // pide al pasar el ratón por primera vez (igual que en Pendientes).
  const [imdbScore, setImdbScore] = useState(initialImdbScore ?? null);
  const imdbRequestedRef = useRef(false);
  useEffect(() => {
    if (initialImdbScore != null) setImdbScore(initialImdbScore);
  }, [initialImdbScore]);
  const loadImdbScore = useCallback(async () => {
    if (imdbScore != null || imdbRequestedRef.current) return;
    imdbRequestedRef.current = true;
    const key = getScoreItemKey(item);
    try {
      const batch = await fetchImdbScoresForItems([item]);
      const value = Number(batch?.items?.[key]?.rating);
      if (Number.isFinite(value) && value > 0) {
        setImdbScore(value);
        writeScoreCache("imdb", new Map([[key, value]]), new Set([key]));
      }
    } catch {
      // Sin nota de IMDb: la píldora se queda con la de TMDb.
    }
  }, [imdbScore, item]);
  const title = getTitle(item);
  const year = getYear(item);
  const href = `/details/${type === "tv" ? "tv" : "movie"}/${item.id}`;
  const previewClick = usePreviewOpen();
  const onPreviewClick = previewClick(item, { mediaType: type });
  const effectiveImageMode = viewMode === "list" ? "backdrop" : imageMode;
  const aspect =
    effectiveImageMode === "backdrop" ? "aspect-[16/9]" : "aspect-[2/3]";
  // ENTRADA = la de Favoritos: fundido + leve escala (y subida en lista y
  // compacta), en cascada, solo lo que cabe en pantalla. En CSS (ver
  // `.sv-section-card-*` en globals.css): la lista llega pintada del servidor.
  // Se decide UNA vez, al montar: si la clase cambiara al reordenar, la
  // animación volvería a arrancar. Al volver atrás no se anima.
  const isBackNav = useIsHistoryNavigation();
  const [entry] = useState(() =>
    !isBackNav && index < ENTRY_ANIMATED_CARDS
      ? {
          className:
            viewMode === "list" || viewMode === "compact"
              ? " sv-section-card-rise"
              : " sv-section-card-grow",
          style: {
            "--sv-enter-delay": `${Math.round(
              (totalItems > 30 ? Math.min(index * 0.015, 0.25) : index * 0.03) * 1000,
            )}ms`,
          },
        }
      : { className: "", style: undefined },
  );
  // El hover gana al foco (ver Favoritos): la tarjeta señalada queda siempre
  // encima, también de la que conserva el foco tras abrir su ficha rápida.
  const shellClassName =
    "relative z-0 overflow-visible focus-within:z-[40] hover:z-[50]" +
    entry.className;
  const indicator = (compact) => (
    <SectionHoverIndicator
      type={type}
      tmdbScore={item?.vote_average}
      imdbScore={imdbScore}
      favorite={favorite}
      watchlisted={watchlisted}
      watchCount={watchCount}
      userRating={userRating}
      compact={compact}
    />
  );

  if (viewMode === "list") {
    return (
      <motion.div
        className={shellClassName}
        style={entry.style}
        initial={false}
        layout
      >
        <Link
          href={href}
          prefetch={false}
          onClick={onPreviewClick}
          className="relative block bg-zinc-900/30 rounded-xl hover:bg-zinc-900/60 transition-colors group overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(245,158,11,0.95)]"
        >
          <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4">
            <div className="w-[180px] sm:w-[280px] aspect-video rounded-lg overflow-hidden relative shadow-md bg-zinc-900 shrink-0">
              <PosterImage
                item={item}
                mode="backdrop"
                title={title}
                previewBackdropPath={previewBackdropPath}
                backdropPending={backdropPending}
                eager={index < EAGER_IMAGE_COUNT}
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              <div className="flex items-center gap-2">
                <h3 className="text-white font-bold text-base leading-tight truncate transition-colors group-hover:text-amber-300">
                  {title}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium leading-tight tracking-[0.08em] text-zinc-400 tabular-nums">
                {year && <span>{year}</span>}
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  if (viewMode === "compact") {
    return (
      <motion.div
        className={shellClassName}
        style={entry.style}
        initial={false}
        layout
      >
        <Link
          href={href}
          prefetch={false}
          onClick={onPreviewClick}
          className="block"
        >
          <HoverExpandCard
            cellClassName={aspect}
            className="group overflow-hidden rounded-lg bg-zinc-900 shadow-md"
            onMouseEnter={loadImdbScore}
          >
            <PosterImage
              item={item}
              mode={effectiveImageMode}
              title={title}
              previewBackdropPath={previewBackdropPath}
              backdropPending={backdropPending}
              eager={index < EAGER_IMAGE_COUNT}
            />
            {indicator(true)}
          </HoverExpandCard>
        </Link>
      </motion.div>
    );
  }

  return (
    <div className={shellClassName} style={entry.style}>
      <Link
        href={href}
        prefetch={false}
        onClick={onPreviewClick}
        className="block"
      >
        <div
          className={`relative ${aspect} group rounded-xl overflow-hidden bg-zinc-900 shadow-md lg:hover:shadow-amber-900/20 transition-shadow duration-300`}
          onMouseEnter={loadImdbScore}
        >
          {/* Aro del hover por encima de la imagen y de la píldora. */}
          <div className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] transition-shadow duration-300 group-hover:shadow-[inset_0_0_0_2.5px_rgba(245,158,11,0.95)]" />
          <PosterImage
            item={item}
            mode={effectiveImageMode}
            title={title}
            previewBackdropPath={previewBackdropPath}
            backdropPending={backdropPending}
            eager={index < EAGER_IMAGE_COUNT}
          />
          {indicator(false)}
        </div>
      </Link>
    </div>
  );
}

function GroupDivider({
  title,
  count,
  isFirstGroup = false,
  mobileFiltersOpen = false,
}) {
  return (
    <div
      className={
        isFirstGroup
          ? mobileFiltersOpen
            ? "mt-0 mb-5 flex items-center gap-3"
            : "mt-2 mb-5 flex items-center gap-3"
          : "my-5 flex items-center gap-3"
      }
    >
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

export default function DashboardSectionClient({
  section,
  initialData = null,
  initialTitle = null,
  initialDescription = null,
  initialViewMode = null,
  initialImageMode = null,
  initialBackdrops = null,
}) {
  // La lista llega normalmente con la página (ver page.jsx): sin petición ni
  // esqueletos. Solo si el servidor no la pudo dar, se pide aquí.
  const serverData = initialData?.section === section ? initialData : null;
  const [data, setData] = useState(serverData);
  const [loading, setLoading] = useState(!serverData);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [mediaFilter, setMediaFilter] = useState("all");
  const [sortBy, setSortBy] = useState("rank");
  const [groupBy, setGroupBy] = useState("none");
  // Por defecto, la rejilla de Favoritos.
  const [viewMode, setViewMode] = useState(initialViewMode || "grid");
  const [imageMode, setImageMode] = useState(initialImageMode || "poster");
  // Entrada (framer) de los bloques de grupo, que solo se montan al agrupar,
  // después de abrir la página: nunca sobre lo que entrega el servidor, que
  // con `initial` de framer saldría invisible hasta hidratar.
  const [entryAnimations, setEntryAnimations] = useState(!serverData);
  // Al volver atrás la página se ve tal cual estaba, sin entrada.
  const isBackNav = useIsHistoryNavigation();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const router = useRouter();
  const toolbarSearchFitRef = usePageToolbarSearchFit();
  const filtersRef = useRef(null);
  const { isSticky: filtersSticky, isPinned: filtersPinned } =
    useStickyToolbarState(filtersRef);
  const [previewBackdropsByItem, setPreviewBackdropsByItem] = useState(
    () => initialBackdrops || {},
  );

  useEffect(() => {
    setEntryAnimations(true);
  }, []);

  useEffect(() => {
    document.title = formatPageTitle(data?.title || initialTitle || "Dashboard");
  }, [data?.title, initialTitle]);

  // Vista guardada antes de que existiera la cookie (solo localStorage): se
  // recupera aquí una vez y, desde entonces, la cookie la trae el servidor.
  useEffect(() => {
    try {
      const savedView = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (!initialViewMode && isSectionViewMode(savedView)) {
        setViewMode(savedView);
      }
      const savedImage = window.localStorage.getItem(IMAGE_MODE_STORAGE_KEY);
      if (!initialImageMode && isSectionImageMode(savedImage)) {
        setImageMode(savedImage);
      }
    } catch {
      // Sin almacenamiento: la vista por defecto.
    }
  }, [initialImageMode, initialViewMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
      window.localStorage.setItem(IMAGE_MODE_STORAGE_KEY, imageMode);
    } catch {
      // Sin almacenamiento: queda la cookie.
    }
    writeSectionViewPrefsCookie(viewMode, imageMode);
  }, [imageMode, viewMode]);

  useEffect(() => {
    if (serverData) return undefined;
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
  }, [section, serverData]);

  const rawItems = useMemo(
    () => (Array.isArray(data?.items) ? data.items : []),
    [data?.items],
  );

  // Backdrops (vista lista o modo backdrop) por el lote de arte, EN ORDEN y
  // por tandas: cada tarjeta se pinta en cuanto llega la suya, sin esperar a
  // las 200. Lo ya resuelto en esta visita (p. ej. las filas del dashboard)
  // está desde el primer render (peekDashboardBackdrop).
  const wantsPreviewBackdrops = viewMode === "list" || imageMode === "backdrop";
  useEffect(() => {
    if (!wantsPreviewBackdrops || rawItems.length === 0) return undefined;

    let cancelled = false;
    const pending = rawItems.filter((item) => {
      const type = resolveType(item);
      return (
        Number.isFinite(Number(item?.id)) &&
        (type === "movie" || type === "tv") &&
        initialBackdrops?.[dashboardImageKey(item)] === undefined &&
        peekDashboardBackdrop(item) === undefined
      );
    });
    const BATCH = 16;
    for (let start = 0; start < pending.length; start += BATCH) {
      const chunk = pending.slice(start, start + BATCH);
      Promise.all(
        chunk.map(async (item) => [
          dashboardImageKey(item),
          await loadDashboardBackdrop(item).catch(() => null),
        ]),
      ).then((entries) => {
        if (cancelled) return;
        setPreviewBackdropsByItem((current) => ({
          ...current,
          ...Object.fromEntries(entries),
        }));
      });
    }

    return () => {
      cancelled = true;
    };
  }, [initialBackdrops, rawItems, wantsPreviewBackdrops]);

  const filtered = useMemo(() => {
    const q = normText(deferredQuery);
    return rawItems.filter((item) => {
      const type = resolveType(item);
      if (mediaFilter !== "all" && type !== mediaFilter) return false;
      if (!q) return true;
      return (
        titleMatchesQuery(item, q) ||
        normText(getGenreLabel(item)).includes(q) ||
        normText(getYear(item)).includes(q)
      );
    });
  }, [rawItems, deferredQuery, mediaFilter]);

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
    (item) => {
      if (!wantsPreviewBackdrops) return undefined;
      const known = previewBackdropsByItem[dashboardImageKey(item)];
      return known !== undefined ? known : peekDashboardBackdrop(item);
    },
    [previewBackdropsByItem, wantsPreviewBackdrops],
  );

  const isPreviewBackdropPending = useCallback(
    (item) => wantsPreviewBackdrops && getPreviewBackdropPath(item) === undefined,
    [getPreviewBackdropPath, wantsPreviewBackdrops],
  );

  // Visionados y nota del usuario para la píldora del hover (como Favoritos).
  const { watchCounts, ratings, favorites, watchlist } = useUserTitleStates();
  // Notas de IMDb ya conocidas (caché compartida con Favoritos y Pendientes).
  // Se lee una vez, en cliente: localStorage no existe al renderizar en servidor.
  const [imdbCache, setImdbCache] = useState(EMPTY_SCORES);
  useEffect(() => {
    setImdbCache(readScoreCache("imdb"));
  }, []);
  const userStateOf = useCallback(
    (item) => {
      const key = userTitleKey(resolveType(item), item.id);
      return {
        watchCount: watchCounts.get(key) || 0,
        userRating: ratings.get(key) ?? null,
        favorite: favorites.has(key),
        watchlisted: watchlist.has(key),
        initialImdbScore: imdbCache.get(getScoreItemKey(item)) ?? null,
      };
    },
    [watchCounts, ratings, favorites, watchlist, imdbCache],
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
    for (const item of rawItems) {
      if (resolveType(item) === "movie") movies += 1;
      else shows += 1;
    }
    return { movies, shows };
  }, [rawItems]);

  const sectionLabel = data?.title ? deriveSectionLabel(data.title) : null;

  const sortOption = SORT_OPTIONS.find((option) => option.key === sortBy);
  const sortLabel = sortOption?.label || "Orden";
  const sortShortLabel = sortOption?.short || sortLabel;
  const groupOption = GROUP_OPTIONS.find((option) => option.key === groupBy);
  const groupLabel = groupOption?.label || "Agrupar";
  const groupShortLabel = groupOption?.short || groupLabel;
  const mediaTypeLabel =
    mediaFilter === "all" ? "Todo" : mediaFilter === "movie" ? "Películas" : "Series";

  // Opciones de los desplegables, compartidas por el panel móvil y la barra.
  const renderMediaOptions = ({ close }) =>
    [
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
    ));
  const renderSortOptions = ({ close }) =>
    SORT_OPTIONS.map((option) => (
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
    ));
  const renderGroupOptions = ({ close }) =>
    GROUP_OPTIONS.map((option) => (
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
    ));

  return (
    <main className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-amber-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-amber-500/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-yellow-600/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-amber-700/25 blur-[120px] sm:blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Entrada de Favoritos, en CSS (ver `.sv-section-*` en globals.css). */}
        {/* Cabecera de Favoritos: etiqueta, título con sus acciones al lado
            (aquí, volver al dashboard), descripción y estadísticas. */}
        <header className={`mb-6 sm:mb-10${isBackNav ? "" : " sv-section-header-in"}`}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              {/* La misma etiqueta que lleva la sección en el dashboard
                  (TENDENCIAS, POPULARES, PARA TI, ANTICIPADAS…). */}
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px w-12 bg-amber-500" />
                <span className="text-amber-400 font-bold uppercase tracking-widest text-xs">
                  {sectionLabel || "Dashboard"}
                </span>
              </div>
              <div className="flex items-center gap-6">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                  {data?.title || initialTitle || "Sección"}
                  <span className="text-amber-500">.</span>
                </h1>
                <LiquidButton
                  onClick={() => router.push("/")}
                  activeColor="amber"
                  groupId="dashboard-section-header-actions"
                  title="Volver al dashboard"
                  aria-label="Volver al dashboard"
                  className="!bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15"
                >
                  <ArrowLeft className="w-5 h-5" />
                </LiquidButton>
              </div>
              {/* Más ancha que en Favoritos: estas descripciones son más largas
                  y, en dos líneas, la cabecera crecía y descolocaba las cifras. */}
              <p className="mt-2 text-zinc-400 max-w-3xl text-lg hidden md:block">
                {data?.description ||
                  initialDescription ||
                  "Explora todos los títulos de esta sección."}
              </p>
            </div>

            {!loading && (
              <div
                className={`flex gap-2 md:gap-4 w-full lg:w-auto justify-center lg:justify-end${
                  isBackNav ? "" : " sv-section-stats-in"
                }`}
              >
                {[
                  { label: "Total", value: rawItems.length, icon: Star, color: "text-amber-400", delay: 500 },
                  { label: "Películas", value: stats.movies, icon: Film, color: "text-sky-400", delay: 600 },
                  { label: "Series", value: stats.shows, icon: MonitorPlay, color: "text-purple-400", delay: 700 },
                ].map(({ label, value, icon, color, delay }) => (
                  <div
                    key={label}
                    className={`min-w-0 flex-1 lg:flex-none${isBackNav ? "" : " sv-section-stat-in"}`}
                    style={isBackNav ? undefined : { "--sv-enter-delay": `${delay}ms` }}
                  >
                    <PageStatCard
                      label={label}
                      value={value}
                      icon={icon}
                      colorClass={color}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Barra de filtros de Favoritos: en móvil, buscador + botón de
            filtros con su panel (Tipo · Agrupar / Orden · vistas · imagen);
            en escritorio, una sola fila que ajusta el buscador
            (usePageToolbarSearchFit). */}
        <section
          ref={filtersRef}
          data-menu-pinned={filtersPinned}
          data-grouped={groupBy !== "none" ? "" : undefined}
          className={`relative sticky top-14 z-[70] space-y-1 transition-all duration-300 sm:top-20 sm:mb-5 lg:mb-6 ${
            groupBy === "none" ? "mb-6" : "mb-2"
          }${isBackNav ? "" : " sv-section-toolbar-in"}`}
        >
          <div className="relative z-10 flex gap-2 lg:hidden">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 z-10 pointer-events-none" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar..."
                className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
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
              className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
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

          <MobileFiltersPanel
            open={mobileFiltersOpen}
            className={`z-[80] lg:hidden ${
              filtersSticky ? "absolute left-0 right-0 top-full" : "relative"
            }`}
            gapClassName="pt-2"
            contentClassName="space-y-2"
          >
            <div className="flex gap-2">
              <div className="flex-1">
                <Dropdown
                  label="Tipo"
                  valueLabel={mediaTypeLabel}
                  icon={Filter}
                >
                  {renderMediaOptions}
                </Dropdown>
              </div>
              <div className="flex-1">
                <Dropdown
                  label="Agrupar"
                  valueLabel={groupLabel}
                  mobileValueLabel={groupShortLabel}
                  compactMobile
                  icon={Layers3}
                >
                  {renderGroupOptions}
                </Dropdown>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Dropdown
                  label="Orden"
                  valueLabel={sortLabel}
                  mobileValueLabel={sortShortLabel}
                  icon={ArrowUpDown}
                >
                  {renderSortOptions}
                </Dropdown>
              </div>
              <div className="flex-1 flex gap-2">
                <div className="flex rounded-2xl p-1 h-11 items-center flex-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                  {VIEW_MODE_BUTTONS.map(([mode, Icon, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      aria-label={label}
                      aria-pressed={viewMode === mode}
                      className={`flex-1 h-full px-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center ${
                        viewMode === mode ? ACTIVE_TOGGLE_CLASS : INACTIVE_TOGGLE_CLASS
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setImageMode(imageMode === "poster" ? "backdrop" : "poster")
                  }
                  aria-label={
                    imageMode === "poster" ? "Mostrar fondos" : "Mostrar pósters"
                  }
                  className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
                    imageMode === "backdrop"
                      ? "text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.28)]"
                      : "text-zinc-200 hover:bg-black/30"
                  }`}
                >
                  {imageMode === "poster" ? (
                    <Film className="w-4 h-4" />
                  ) : (
                    <MonitorPlay className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </MobileFiltersPanel>

          <div
            ref={toolbarSearchFitRef}
            className="sv-page-toolbar relative z-10 hidden lg:flex gap-3"
          >
            <div className="sv-page-toolbar-search relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 z-10 pointer-events-none" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por título..."
                className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
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

            <Dropdown label="Tipo" valueLabel={mediaTypeLabel} icon={Filter}>
              {renderMediaOptions}
            </Dropdown>

            <Dropdown label="Ordenar" valueLabel={sortLabel} icon={ArrowUpDown}>
              {renderSortOptions}
            </Dropdown>

            <Dropdown label="Agrupar" valueLabel={groupLabel} icon={Layers3}>
              {renderGroupOptions}
            </Dropdown>

            <div className="flex rounded-2xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
              {VIEW_MODE_BUTTONS.map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  aria-label={label}
                  aria-pressed={viewMode === mode}
                  className={`px-3 h-full rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    viewMode === mode ? ACTIVE_TOGGLE_CLASS : INACTIVE_TOGGLE_CLASS
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            <div className="flex rounded-2xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
              {IMAGE_MODE_BUTTONS.map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setImageMode(mode)}
                  aria-label={label}
                  aria-pressed={imageMode === mode}
                  className={`px-3 h-full rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    imageMode === mode ? ACTIVE_TOGGLE_CLASS : INACTIVE_TOGGLE_CLASS
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </section>

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
                initial={entryAnimations ? { opacity: 0, y: 20 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: groupIndex * 0.1 }}
              >
                <GroupDivider
                  title={group.label}
                  count={group.items.length}
                  isFirstGroup={groupIndex === 0}
                  mobileFiltersOpen={mobileFiltersOpen}
                />
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
                      {...userStateOf(item)}
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
                {...userStateOf(item)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
