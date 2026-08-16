"use client";


import OptimizedImage from "@/components/OptimizedImage";
import {
  memo,
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  isSameMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  ImageOff,
  Loader2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar as CalendarIcon,
  CheckCircle2,
  Bookmark,
  Heart,
  Film,
  MonitorPlay,
  SlidersHorizontal,
  RotateCcw,
  Search,
  X,
  Filter,
  Layers,
  ArrowUpDown,
  LayoutList,
  LayoutGrid,
  Grid3x3,
} from "lucide-react";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

import {
  getMoviesByDateRange,
  getMoviesByWindow,
  getTrackedEpisodesByDateRange,
  getTrackedEpisodesByWindow,
} from "@/lib/api/calendar";
import { formatPageTitle } from "@/lib/pageTitle";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";
import useModalGuard from "@/hooks/useModalGuard";

const TYPE_FILTERS = [
  { id: "all", label: "Todo" },
  { id: "movies", label: "Películas" },
  { id: "episodes", label: "Episodios" },
];

const GROUP_MODES = [
  { id: "day", label: "Día" },
  { id: "month", label: "Mes" },
  { id: "year", label: "Año" },
];

// Meses que se consultan por cada modo de agrupación: uno más que la unidad con
// la que se agrupa, para que cada grupo tenga hermanos con los que compararse.
// Agrupar por día sin más de un mes por delante no enseñaría nada nuevo.
const RANGE_MONTHS = { day: 1, month: 12, year: 24 };

// El orden por defecto es cronológico ascendente: en un calendario lo primero
// que interesa es lo que viene ANTES, al revés que en un historial.
const SORT_MODES = [
  { id: "date-asc", label: "Más próximo" },
  { id: "date-desc", label: "Más lejano" },
  { id: "title-asc", label: "Título A-Z" },
  { id: "title-desc", label: "Título Z-A" },
];

const CARD_VIEWS = [
  { id: "list", label: "Lista", Icon: LayoutList },
  { id: "compact", label: "Compacta", Icon: Grid3x3 },
  { id: "grid", label: "Rejilla", Icon: LayoutGrid },
];

const pad2 = (n) => String(n).padStart(2, "0");

// Texto comparable para el buscador: sin mayúsculas y sin tildes, para que
// "bicicleta" encuentre "La bicicleta de Bartali" y "asi" encuentre "Así".
const foldText = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Ajuste del menú que sobrevive a la visita.
//
// El valor NO se lee en el useState inicial a propósito: el servidor pinta el
// HTML sin acceso a localStorage, y arrancar con otro valor en el cliente
// rompería la hidratación. Se restaura en un efecto, y hasta que eso ocurre no
// se escribe nada —si no, el primer render pisaría con el valor por defecto lo
// que había guardado.
function useStoredSetting(storageKey, options, initial) {
  const [value, setValue] = useState(initial);
  const restored = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (options.some(({ id }) => id === saved)) setValue(saved);
    restored.current = true;
  }, [storageKey, options]);

  useEffect(() => {
    if (!restored.current) return;
    window.localStorage.setItem(storageKey, value);
  }, [storageKey, value]);

  return [value, setValue];
}

// --- COMPONENTES UI AUXILIARES ---

function TmdbPoster({ path, alt, className = "" }) {
  const [failed, setFailed] = useState(false);

  if (!path || failed) {
    return (
      <div
        className={`bg-zinc-900 flex items-center justify-center text-zinc-700 ${className}`}
      >
        <ImageOff className="w-8 h-8 opacity-50" />
      </div>
    );
  }

  return (
    <OptimizedImage
      src={`https://image.tmdb.org/t/p/w342${path}`}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function TmdbBackdrop({ path, fallbackPath, alt, className = "" }) {
  const [failed, setFailed] = useState(false);
  const imagePath = failed ? fallbackPath : path || fallbackPath;

  if (!imagePath) {
    return (
      <div
        className={`bg-zinc-900 flex items-center justify-center text-zinc-700 ${className}`}
      >
        <ImageOff className="w-8 h-8 opacity-50" />
      </div>
    );
  }

  const size = imagePath === fallbackPath && !path ? "w342" : "w780";

  return (
    <OptimizedImage
      src={`https://image.tmdb.org/t/p/${size}${imagePath}`}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}


// --- MODELO UNIFICADO ---
//
// Estrenos y episodios llegan de dos sitios con formas distintas, pero el menú
// (tipo, agrupación, orden y modo de vista) tiene que operar sobre UNA lista,
// igual que en Historial. Estas dos funciones los dejan con la misma forma.
//
// Cada item guarda las DOS imágenes: el póster (2:3) para las vistas de rejilla
// y compacta, y el fondo apaisado (16:9) para la de lista. Así los tres modos
// valen para los dos tipos, que es de lo que se trata; cada uno se queda con la
// que le toca y usa la otra de reserva cuando TMDB no tiene la buena.
function normalizeMovieItem(item) {
  const isMovie = item?.media_type === "movie" || !!item?.title;
  const mediaType = item?.media_type || (isMovie ? "movie" : "tv");
  const raw = isMovie ? item?.release_date : item?.first_air_date;
  const date = raw ? new Date(`${raw}T00:00:00`) : null;

  return {
    key: `movie:${mediaType}:${item?.id}`,
    kind: "movie",
    title: (isMovie ? item?.title : item?.name) || "Sin título",
    subtitle: raw ? String(raw).slice(0, 4) : null,
    date: date && Number.isFinite(date.getTime()) ? date : null,
    href: `/details/${mediaType}/${item?.id}`,
    posterPath: item?.poster_path || item?.backdrop_path || null,
    backdropPath: item?.backdrop_path || item?.poster_path || null,
    favorite: false,
    watchlist: false,
  };
}

function normalizeEpisodeItem(item) {
  const show = item?.show || {};
  const episode = item?.episode || {};
  const season = Number(episode?.season || 0);
  const number = Number(episode?.number || 0);
  const aired = item?.first_aired ? new Date(item.first_aired) : null;
  const source = Array.isArray(item?.source) ? item.source : [];
  const epLabel = `T${season || "?"} · E${number || "?"}`;

  return {
    key: `episode:${item?.id ?? `${show?.tmdbId}-${season}-${number}`}`,
    kind: "episode",
    title: show?.title || "Serie",
    subtitle: episode?.title ? `${epLabel} · ${episode.title}` : epLabel,
    date: aired && Number.isFinite(aired.getTime()) ? aired : null,
    href:
      show?.tmdbId && season > 0 && number > 0
        ? `/details/tv/${show.tmdbId}/season/${season}/episode/${number}`
        : `/details/tv/${show?.tmdbId}`,
    posterPath: show?.poster_path || show?.backdrop_path || null,
    backdropPath: show?.backdrop_path || show?.poster_path || null,
    favorite: source.includes("favorite"),
    watchlist: source.includes("watchlist"),
  };
}

function badgeDateParts(date) {
  if (!date) return null;
  return {
    day: format(date, "d"),
    month: format(date, "MMM", { locale: es })
      .replace(".", "")
      .slice(0, 3)
      .toUpperCase(),
  };
}

// --- TARJETAS ---
//
// Las tres vistas del Historial, con sus mismas medidas y acabados: el anillo
// interior en hover, el póster 2:3 en rejilla y compacta, y la fila con fondo
// apaisado en lista. Solo cambia el color de acento (ámbar) y lo que se cuenta
// de cada ficha: aquí, la fecha de estreno o emisión.

function CalendarHoverIndicator({ kind, dateParts, compact = false }) {
  const itemClassName = compact ? "h-7 w-7" : "h-9 w-8";
  const iconClassName = compact ? "h-4 w-4" : "h-5 w-5";
  const dateClassName = compact
    ? "h-7 w-[3.65rem] text-[11px]"
    : "h-9 w-16 text-sm";

  return (
    <div
      className={`pointer-events-none absolute ${compact ? "bottom-1.5 px-0.5" : "bottom-2 px-1"} inset-x-0 z-20 mx-auto hidden w-fit items-center overflow-hidden rounded-full opacity-0 ${LIQUID_GLASS_PANEL} text-white shadow-xl transition-opacity duration-200 ease-out motion-reduce:transition-none lg:flex lg:group-hover:opacity-100`}
      aria-hidden="true"
    >
      <span
        className={`grid ${itemClassName} shrink-0 place-items-center ${kind === "movie" ? "text-sky-400" : "text-violet-400"}`}
      >
        {kind === "movie" ? (
          <Film className={`block ${iconClassName}`} />
        ) : (
          <MonitorPlay className={`block ${iconClassName}`} />
        )}
      </span>
      {dateParts ? (
        <span
          className={`grid ${dateClassName} shrink-0 place-items-center whitespace-nowrap font-bold uppercase leading-none tracking-wide text-zinc-100 subpixel-antialiased`}
        >
          <span className="tabular-nums leading-none">
            {dateParts.day} {dateParts.month}
          </span>
        </span>
      ) : null}
    </div>
  );
}

// Marca de favorito/pendiente. Es propia de Calendario —el Historial usa esa
// esquina para borrar—, así que ocupa el mismo sitio con el mismo acabado.
function CalendarSourceBadge({ item, compact = false }) {
  if (!item.favorite && !item.watchlist) return null;

  return (
    <div
      className={`pointer-events-none absolute top-0 left-0 z-20 flex items-center gap-1.5 rounded-br-2xl border-r border-b backdrop-blur-md shadow-sm ${
        compact ? "p-1.5" : "p-2 sm:p-2.5"
      } ${
        item.favorite
          ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
          : "bg-sky-500/15 border-sky-500/30 text-sky-300"
      }`}
    >
      {item.watchlist && (
        <Bookmark className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
      )}
      {item.favorite && (
        <Heart
          className={`fill-current ${compact ? "w-3.5 h-3.5" : "w-4 h-4"}`}
        />
      )}
    </div>
  );
}

// Retraso de entrada en cascada, tarjeta a tarjeta, como en Historial.
function entranceDelay(index, total) {
  return total > 30 ? Math.min(index * 0.015, 0.25) : index * 0.03;
}

const CalendarListCard = memo(function CalendarListCard({
  item,
  index = 0,
  total = 0,
}) {
  const dateLabel = item.date
    ? format(item.date, "d 'de' MMMM 'de' yyyy", { locale: es })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.25,
        delay: entranceDelay(index, total),
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      <Link
        href={item.href}
        className="block relative overflow-hidden bg-zinc-900/30 rounded-xl hover:bg-zinc-900/60 transition-colors group"
      >
        {/* Borde en overlay para que los indicadores queden por debajo */}
        <div className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] transition-shadow duration-300 group-hover:shadow-[inset_0_0_0_2.5px_rgba(234,179,8,0.95)]" />
        <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4 pr-4 transition-all">
          <div className="w-[140px] sm:w-[210px] aspect-video rounded-lg relative shadow-md bg-zinc-900 shrink-0">
            <div className="absolute inset-0 rounded-[inherit] overflow-hidden">
              <TmdbBackdrop
                path={item.backdropPath}
                fallbackPath={item.posterPath}
                alt={item.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <CalendarSourceBadge item={item} />
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            <h4 className="text-white font-bold text-base leading-tight truncate transition-colors group-hover:text-yellow-300">
              {item.title}
            </h4>
            {dateLabel && (
              <time
                dateTime={item.date.toISOString()}
                className="text-xs font-semibold leading-tight text-zinc-300"
              >
                {dateLabel}
              </time>
            )}
            {item.subtitle && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                <span className="truncate max-w-[260px]">{item.subtitle}</span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
});

const CalendarCompactCard = memo(function CalendarCompactCard({
  item,
  index = 0,
  total = 0,
}) {
  const dateParts = badgeDateParts(item.date);

  return (
    <motion.div
      className="relative z-0 overflow-visible focus-within:z-[40] hover:z-[50]"
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.25,
        delay: entranceDelay(index, total),
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      <Link href={item.href} className="block">
        <motion.div
          className="relative aspect-[2/3] compact-card group overflow-hidden rounded-lg bg-zinc-900 shadow-md transition-shadow duration-300"
          whileHover={{
            scale: 1.15,
            zIndex: 100,
            boxShadow:
              "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
          }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          style={{ transformOrigin: "center center" }}
        >
          <div className="absolute inset-0 rounded-[inherit] overflow-hidden">
            <TmdbPoster
              path={item.posterPath}
              alt={item.title}
              className="w-full h-full object-cover"
            />
            <CalendarSourceBadge item={item} compact />
            <CalendarHoverIndicator
              kind={item.kind}
              dateParts={dateParts}
              compact
            />
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
});

const CalendarGridCard = memo(function CalendarGridCard({
  item,
  index = 0,
  total = 0,
}) {
  const dateParts = badgeDateParts(item.date);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.25,
        delay: entranceDelay(index, total),
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      <Link href={item.href} className="block">
        {/* Hover SOLO en escritorio: en táctil se queda "pegado". */}
        <div className="relative aspect-[2/3] group overflow-hidden rounded-xl bg-zinc-900 shadow-md lg:hover:shadow-yellow-900/20 transition-all">
          <div className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] transition-shadow duration-300 lg:group-hover:shadow-[inset_0_0_0_2.5px_rgba(234,179,8,0.95)]" />
          <div className="absolute inset-0 rounded-[inherit] overflow-hidden">
            <TmdbPoster
              path={item.posterPath}
              alt={item.title}
              className="w-full h-full object-cover"
            />
            <CalendarSourceBadge item={item} />
            <CalendarHoverIndicator kind={item.kind} dateParts={dateParts} />

            {/* Banda inferior con el texto: en escritorio la sustituye el
                indicador flotante del hover. */}
            <div className="absolute inset-x-0 bottom-0 z-10 lg:hidden p-3 pt-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none">
              <h5 className="text-white font-bold text-xs leading-tight line-clamp-2">
                {item.title}
              </h5>
              {item.subtitle && (
                <div className="mt-0.5 text-[10px] text-zinc-200/80 leading-tight line-clamp-1">
                  {item.subtitle}
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
});

// Rejilla de 6 semanas que empieza en lunes, con los días de relleno del mes
// anterior y el siguiente. La comparten el calendario del selector de fecha y el
// panel lateral: así los dos colocan cada día en la misma casilla.
function buildMonthGrid(y, m) {
  const first = new Date(y, m, 1);
  const firstDow = first.getDay();
  const offset = (firstDow - 1 + 7) % 7;
  const start = new Date(y, m, 1 - offset);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      week.push(d);
    }
    weeks.push(week);
  }
  return weeks;
}

// Clave de día en hora LOCAL. `toISOString()` no vale: pasa a UTC y en horario
// de verano manda los primeros minutos del día al día anterior.
const dayKey = (date) => format(date, "yyyy-MM-dd");

function formatGroupHeader(date, mode) {
  if (mode === "year") return format(date, "yyyy");
  if (mode === "month") return format(date, "MMMM 'de' yyyy", { locale: es });
  return format(date, "EEEE, d 'de' MMMM", { locale: es });
}

// Desplegable del menú, calcado del de Historial.
//
// El menú se RENDERIZA POR PORTAL en <body> con position:fixed calculado desde
// el botón. Así no lo recorta el stacking context de la barra (el
// `backdrop-blur` crea uno que ocultaba el `absolute` anterior); el menú queda
// siempre visible por encima de todo.
function InlineDropdown({ label, valueLabel, icon: Icon, children }) {
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
        onClick={() => setOpen((v) => !v)}
        aria-label={`${label}: ${valueLabel}`}
        className="h-11 min-w-0 w-full inline-flex items-center justify-between gap-3 px-4 rounded-2xl transition-[min-width,background-color,color] text-sm lg:w-auto lg:max-w-none lg:min-w-0 2xl:min-w-[140px] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10"
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="w-4 h-4 shrink-0 text-yellow-500" />}
          {/* Calendario mete en la barra DOS controles más que Historial (las
              flechas y el rango). En pantallas que no dan para tanto, la
              etiqueta se va y queda icono + valor, que es lo que identifica el
              desplegable; el nombre completo vuelve en cuanto hay sitio. */}
          <span className="inline lg:hidden 2xl:inline shrink-0 overflow-hidden whitespace-nowrap text-zinc-500 font-bold text-xs uppercase tracking-wider">
            {label}:
          </span>
          <span className="min-w-0 truncate font-semibold text-white">
            {valueLabel}
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
      {active && <CheckCircle2 className="w-4 h-4 text-yellow-500" />}
    </button>
  );
}

// Calendario lateral, mismo patrón que el del Historial: la rejilla del mes con
// un punto en los días que traen algo. La diferencia está en lo que hace un
// clic. En Historial FILTRA la lista; aquí NAVEGA, porque el modelo de esta
// página es una fecha seleccionada y un rango, no una lista que acotar: pulsar
// un día salta a ese día en vista "Día".
//
// El mes que enseña es independiente del seleccionado —se puede curiosear
// noviembre sin salir de agosto— y solo se sincroniza cuando cambia la
// selección.
function CalendarSidePanel({
  monthDate,
  onPrev,
  onNext,
  countsByDay,
  selectedYmd,
  onSelectDay,
  onShowMonth,
  loading = false,
  className = "",
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const monthLabel = format(monthDate, "MMMM yyyy", { locale: es });
  const todayKey = dayKey(new Date());
  const dow = ["L", "M", "X", "J", "V", "S", "D"];

  return (
    <div
      className={`bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-xl rounded-3xl p-6 sm:p-8 ${
        className || "sticky top-6"
      }`}
    >
      <div className="flex items-center justify-between mb-8">
        <div className="min-w-0">
          <h3 className="text-white font-bold capitalize text-2xl tracking-tight truncate">
            {monthLabel}
          </h3>
          <p className="text-sm text-yellow-500/70 mt-1 font-medium">
            {loading ? "Buscando estrenos…" : "Pulsa un día para verlo"}
          </p>
        </div>
        <div className="flex gap-2 bg-black/20 rounded-xl p-1.5 shadow-inner shrink-0">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Mes anterior"
            className="p-2 hover:bg-white/10 rounded-lg transition text-zinc-300"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Mes siguiente"
            className="p-2 hover:bg-white/10 rounded-lg transition text-zinc-300"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3 mb-4">
        {dow.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-bold text-zinc-400 uppercase tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-3">
        {weeks.flat().map((d) => {
          const inMonth = d.getMonth() === month;
          const key = dayKey(d);
          const count = countsByDay[key] || 0;
          const selected = selectedYmd === key;
          const isTodayCell = todayKey === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(d)}
              disabled={!inMonth}
              title={count > 0 ? `${count} en este día` : undefined}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200 text-sm font-bold
                ${!inMonth ? "opacity-0 pointer-events-none" : "text-zinc-200"}
                ${
                  selected
                    ? "bg-gradient-to-br from-yellow-400 to-yellow-500 text-black shadow-lg shadow-yellow-500/20 z-10 scale-110"
                    : isTodayCell
                      ? "bg-white/10 text-white ring-[2.5px] ring-inset ring-yellow-500/95"
                      : "bg-white/5 hover:bg-white/10 hover:text-white hover:scale-105"
                }`}
            >
              <span>{d.getDate()}</span>
              {count > 0 && !selected && (
                <div className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-yellow-500" />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onShowMonth}
        className="mt-8 w-full py-3 text-sm font-bold text-yellow-400 hover:text-yellow-300 flex items-center justify-center gap-2 border-t border-white/10 uppercase tracking-wide transition-colors"
      >
        <CalendarIcon className="w-4 h-4" /> Ver todo el mes
      </button>
    </div>
  );
}

// Móvil: el mismo panel a pantalla completa, servido por portal para que no lo
// recorte el `backdrop-blur` de la barra desde la que se abre. Se accede con el
// botón del calendario del menú móvil.
function MobileCalendarOverlay({
  open,
  onClose,
  monthDate,
  onPrev,
  onNext,
  countsByDay,
  selectedYmd,
  onSelectDay,
  onShowMonth,
  loading,
}) {
  useModalGuard({ open, onClose });

  if (!open) return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-4 sm:p-6"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        aria-hidden="true"
      />
      <motion.div
        className="relative z-10 my-auto w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        <CalendarSidePanel
          monthDate={monthDate}
          onPrev={onPrev}
          onNext={onNext}
          countsByDay={countsByDay}
          selectedYmd={selectedYmd}
          onSelectDay={(date) => {
            onSelectDay(date);
            onClose();
          }}
          onShowMonth={() => {
            onShowMonth();
            onClose();
          }}
          loading={loading}
          className="w-full"
        />
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// --- PÁGINA PRINCIPAL ---

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [selectedMovies, setSelectedMovies] = useState([]);
  const [trackedEpisodes, setTrackedEpisodes] = useState([]);
  const [moviesLoading, setMoviesLoading] = useState(true);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [episodeError, setEpisodeError] = useState(null);
  const [error, setError] = useState(null);

  // Controles del menú, los mismos que en Historial, y todos recordados: al
  // volver a la página está como se dejó. La agrupación arranca en "Mes", que es
  // la lectura natural de un calendario de estrenos.
  const [typeFilter, setTypeFilter] = useStoredSetting(
    "showverse:calendar:typeFilter",
    TYPE_FILTERS,
    "all",
  );
  const [groupBy, setGroupBy] = useStoredSetting(
    "showverse:calendar:groupBy",
    GROUP_MODES,
    "month",
  );
  const [sortBy, setSortBy] = useStoredSetting(
    "showverse:calendar:sortBy",
    SORT_MODES,
    "date-asc",
  );
  const [cardView, setCardView] = useStoredSetting(
    "showverse:calendar:cardView",
    CARD_VIEWS,
    "grid",
  );
  const [query, setQuery] = useState("");

  // Menú fijo: en móvil los controles secundarios viven en un panel desplegable,
  // igual que en Historial, para que la fila principal quepa en una pantalla
  // estrecha.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileCalendarOpen, setMobileCalendarOpen] = useState(false);
  const filtersRef = useRef(null);
  const { isSticky: filtersSticky, isPinned: filtersPinned } =
    useStickyToolbarState(filtersRef);

  // Mes que enseña el calendario lateral, y cuántas cosas cae cada día de ese
  // mes. Es un rango distinto del que se está viendo (el panel siempre muestra
  // un mes entero), así que se pide aparte y se guarda por mes: volver a un mes
  // ya visitado no repite la llamada.
  const [panelMonth, setPanelMonth] = useState(() => startOfMonth(new Date()));
  const [monthCounts, setMonthCounts] = useState({});
  const [monthCountsLoading, setMonthCountsLoading] = useState(false);
  const monthCountsCache = useRef(new Map());

  useEffect(() => {
    document.title = formatPageTitle("Calendario");
  }, []);

  // El panel lateral sigue a la ventana: al saltar de mes, se abre por ese mes.
  useEffect(() => {
    setPanelMonth(startOfMonth(selectedDate));
  }, [selectedDate]);

  // Días marcados del mes del panel. Se piden las dos fuentes del mes entero
  // (estrenos + episodios de tus series) y se cuentan por día.
  useEffect(() => {
    const cacheKey = format(panelMonth, "yyyy-MM");
    const cached = monthCountsCache.current.get(cacheKey);
    if (cached) {
      setMonthCounts(cached);
      setMonthCountsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const start = startOfMonth(panelMonth);
    const end = endOfMonth(panelMonth);

    const loadCounts = async () => {
      setMonthCountsLoading(true);
      try {
        // Las dos fuentes son independientes: si una falla, el panel sigue
        // marcando los días de la otra en vez de quedarse en blanco.
        const [movies, episodes] = await Promise.all([
          getMoviesByDateRange(start, end).catch(() => []),
          getTrackedEpisodesByDateRange(start, end.getDate()).catch(() => null),
        ]);
        if (cancelled) return;

        const counts = {};
        const bump = (key) => {
          if (key) counts[key] = (counts[key] || 0) + 1;
        };

        for (const movie of Array.isArray(movies) ? movies : []) {
          const raw = movie?.release_date || movie?.first_air_date;
          // Las fechas de estreno ya vienen como "YYYY-MM-DD" sin hora.
          if (raw) bump(String(raw).slice(0, 10));
        }
        for (const item of Array.isArray(episodes?.items)
          ? episodes.items
          : []) {
          // `first_aired` sí trae hora en UTC: se pasa por la fecha local para
          // que un episodio de medianoche caiga en el día que se ve en pantalla.
          const aired = item?.first_aired ? new Date(item.first_aired) : null;
          if (aired && Number.isFinite(aired.getTime())) bump(dayKey(aired));
        }

        monthCountsCache.current.set(cacheKey, counts);
        setMonthCounts(counts);
      } finally {
        if (!cancelled) setMonthCountsLoading(false);
      }
    };

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [panelMonth]);

  // LA VENTANA LA MARCA LA AGRUPACIÓN.
  //
  // Ya no hay botones de rango: agrupar por Día pide un mes (y salen sus días),
  // por Mes pide un año (y salen sus meses) y por Año, dos. Cada ventana empieza
  // en el mes seleccionado —hoy al entrar—, así que el mes actual va primero y
  // lo que sigue es futuro, que es lo que se busca en un calendario.
  const dateRange = useMemo(() => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(addMonths(start, RANGE_MONTHS[groupBy] - 1));
    return { start, end };
  }, [selectedDate, groupBy]);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        setMoviesLoading(true);
        setError(null);
        const movies = await getMoviesByWindow(dateRange.start, dateRange.end);
        setSelectedMovies(Array.isArray(movies) ? movies : []);
      } catch (err) {
        console.error("Error al cargar estrenos:", err);
        setSelectedMovies([]);
        setError("No se han podido cargar los estrenos.");
      } finally {
        setMoviesLoading(false);
      }
    };

    fetchMovies();
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    const fetchTrackedEpisodes = async () => {
      try {
        setEpisodesLoading(true);
        setEpisodeError(null);
        const data = await getTrackedEpisodesByWindow(
          dateRange.start,
          dateRange.end,
        );
        setTrackedEpisodes(Array.isArray(data?.items) ? data.items : []);
        if (data?.error) setEpisodeError(data.error);
      } catch (err) {
        console.error("Error al cargar episodios:", err);
        setTrackedEpisodes([]);
        setEpisodeError("No se han podido cargar los episodios de tus series.");
      } finally {
        setEpisodesLoading(false);
      }
    };

    fetchTrackedEpisodes();
  }, [dateRange.start, dateRange.end]);

  // "Hoy" aquí es la ventana que arranca en el mes en curso, no un día suelto:
  // es a donde vuelve el botón de reinicio.
  const isTodaySelected = isSameMonth(selectedDate, new Date());

  const rangeLabel = useMemo(
    () =>
      RANGE_MONTHS[groupBy] === 1
        ? format(dateRange.start, "MMMM 'de' yyyy", { locale: es })
        : `${format(dateRange.start, "MMM yyyy", { locale: es })} – ${format(dateRange.end, "MMM yyyy", { locale: es })}`,
    [dateRange, groupBy],
  );

  const sortedTrackedEpisodes = useMemo(
    () =>
      [...trackedEpisodes].sort((a, b) =>
        (a?.first_aired || "").localeCompare(b?.first_aired || ""),
      ),
    [trackedEpisodes],
  );

  const hasMovies = selectedMovies.length > 0;
  const hasEpisodes = sortedTrackedEpisodes.length > 0;
  const hasAnyItems = hasMovies || hasEpisodes;

  // Las dos fuentes, con la misma forma y en una sola lista.
  const allItems = useMemo(
    () => [
      ...selectedMovies.map(normalizeMovieItem),
      ...sortedTrackedEpisodes.map(normalizeEpisodeItem),
    ],
    [selectedMovies, sortedTrackedEpisodes],
  );

  const visibleItems = useMemo(() => {
    const byType = allItems.filter((item) => {
      if (typeFilter === "movies") return item.kind === "movie";
      if (typeFilter === "episodes") return item.kind === "episode";
      return true;
    });

    // La búsqueda mira también el subtítulo: en un episodio ahí va el nombre del
    // capítulo, que es por lo que se busca tantas veces como por el de la serie.
    const needle = foldText(query.trim());
    const found = needle
      ? byType.filter(
          (item) =>
            foldText(item.title).includes(needle) ||
            foldText(item.subtitle).includes(needle),
        )
      : byType;

    const time = (item) => item.date?.getTime() ?? 0;
    return [...found].sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return time(b) - time(a);
        case "title-asc":
          return a.title.localeCompare(b.title, "es");
        case "title-desc":
          return b.title.localeCompare(a.title, "es");
        case "date-asc":
        default:
          return time(a) - time(b);
      }
    });
  }, [allItems, typeFilter, sortBy, query]);

  // Agrupación por día, mes o año. Las cabeceras siguen el sentido cronológico
  // del orden elegido; con orden por título mandan igualmente las fechas, que es
  // lo que da estructura a la página.
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of visibleItems) {
      // Sin fecha no hay grupo posible: ni los estrenos ni los episodios llegan
      // así, pero un dato incompleto no debe tumbar el listado.
      if (!item.date) continue;
      const d = item.date;
      const key =
        groupBy === "year"
          ? `${d.getFullYear()}-01-01`
          : groupBy === "month"
            ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`
            : dayKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }

    const keys = [...map.keys()].sort((a, b) =>
      sortBy === "date-desc"
        ? new Date(b).getTime() - new Date(a).getTime()
        : new Date(a).getTime() - new Date(b).getTime(),
    );
    return keys.map((key) => ({
      key,
      date: new Date(key),
      items: map.get(key) || [],
    }));
  }, [visibleItems, groupBy, sortBy]);

  // Índice GLOBAL de cada tarjeta para que la cascada de entrada sea continua en
  // toda la página, no reiniciada en cada grupo.
  const cardOrder = useMemo(() => {
    const offsets = [];
    let acc = 0;
    for (const group of groups) {
      offsets.push(acc);
      acc += group.items.length;
    }
    return { offsets, total: acc };
  }, [groups]);

  const typeLabel =
    TYPE_FILTERS.find(({ id }) => id === typeFilter)?.label ?? "Todo";
  const groupLabel =
    GROUP_MODES.find(({ id }) => id === groupBy)?.label ?? "Día";
  const sortLabel =
    SORT_MODES.find(({ id }) => id === sortBy)?.label ?? "Más próximo";
  const loading =
    (moviesLoading && !hasEpisodes) || (episodesLoading && !hasMovies);

  // El calendario lateral es AHORA la única forma de moverse por el tiempo: ya
  // no hay flechas ni selector de fecha en el menú. Pulsar un día lleva la
  // ventana a su mes.
  const goToDay = useCallback((date) => {
    setSelectedDate(date);
  }, []);

  const showPanelMonth = useCallback(() => {
    setSelectedDate(startOfMonth(panelMonth));
  }, [panelMonth]);

  const selectedYmd = dayKey(selectedDate);

  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans selection:bg-yellow-500/30 pb-20">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-yellow-600/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-yellow-700/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-amber-800/25 blur-[120px] sm:blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-2 sm:px-6 lg:px-8 py-6 lg:py-12">
        {/* Header Section */}
        <div className="relative z-30 mb-8 sm:mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
          {/* Título. Los controles ya no viven aquí: están en la barra fija de
              abajo, que los mantiene a mano al bajar por el listado. */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px w-12 bg-yellow-500" />
              <span className="text-yellow-400 font-bold uppercase tracking-widest text-xs">
                ESTRENOS
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              Calendario
              <span className="text-yellow-500">.</span>
            </h1>
            <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
              Consulta las fechas de emisión y próximos estrenos.
            </p>
          </div>

        </div>

        {/* Layout Principal: contenido a la izquierda, calendario a la derecha. */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8 items-start">
          <div className="min-w-0">

            {/* MENÚ FIJO. Mismo patrón que el del Historial: en escritorio una sola
                fila con todo; en móvil la fila principal y un panel desplegable con
                lo secundario. `data-menu-pinned` es lo que enciende el cristal del
                navbar sobre la barra cuando queda pegada (regla en globals.css). */}
            <motion.div
              ref={filtersRef}
              data-menu-pinned={filtersPinned}
              className="sticky top-14 z-[70] space-y-3 mb-6 transition-all duration-300 sm:top-20"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              {/* Móvil: fila principal + panel de controles. Antes de fijarse el
                  panel va en el flujo y empuja el contenido; una vez fijada la barra
                  (filtersSticky) pasa a overlay para no desplazar nada. */}
              <div className="relative z-10 lg:hidden">
                <div className="relative flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-500 z-10 pointer-events-none" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar..."
                      className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-yellow-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Limpiar búsqueda"
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                      >
                        <X className="w-3.5 h-3.5 text-zinc-500" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setMobileCalendarOpen(true)}
                    aria-label="Abrir calendario"
                    className="h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:bg-black/30"
                  >
                    <CalendarDays className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen((v) => !v)}
                    aria-label="Filtros y vista"
                    aria-expanded={mobileFiltersOpen}
                    className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
                      mobileFiltersOpen
                        ? "text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.3)]"
                        : "text-zinc-200 hover:bg-black/30"
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                  </button>
                </div>

                <AnimatePresence>
                  {mobileFiltersOpen && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      className={`z-[80] mt-2 origin-top overflow-hidden ${
                        filtersSticky ? "absolute left-0 right-0 top-full" : "relative"
                      }`}
                    >
                      <div className="space-y-2">
                        {/* Fila 1 - Tipo y Agrupar */}
                        <div className="flex gap-2">
                          <div className="min-w-0 flex-1">
                            <InlineDropdown
                              label="Tipo"
                              valueLabel={typeLabel}
                              icon={Filter}
                            >
                              {({ close }) =>
                                TYPE_FILTERS.map(({ id, label }) => (
                                  <DropdownItem
                                    key={id}
                                    active={typeFilter === id}
                                    onClick={() => {
                                      setTypeFilter(id);
                                      close();
                                    }}
                                  >
                                    {label}
                                  </DropdownItem>
                                ))
                              }
                            </InlineDropdown>
                          </div>
                          <div className="min-w-0 flex-1">
                            <InlineDropdown
                              label="Agrupar"
                              valueLabel={groupLabel}
                              icon={Layers}
                            >
                              {({ close }) =>
                                GROUP_MODES.map(({ id, label }) => (
                                  <DropdownItem
                                    key={id}
                                    active={groupBy === id}
                                    onClick={() => {
                                      setGroupBy(id);
                                      close();
                                    }}
                                  >
                                    {label}
                                  </DropdownItem>
                                ))
                              }
                            </InlineDropdown>
                          </div>
                        </div>

                        {/* Fila 2 - Ordenar y modos de tarjeta */}
                        <div className="flex gap-2">
                          <div className="min-w-0 flex-1">
                            <InlineDropdown
                              label="Ordenar"
                              valueLabel={sortLabel}
                              icon={ArrowUpDown}
                            >
                              {({ close }) =>
                                SORT_MODES.map(({ id, label }) => (
                                  <DropdownItem
                                    key={id}
                                    active={sortBy === id}
                                    onClick={() => {
                                      setSortBy(id);
                                      close();
                                    }}
                                  >
                                    {label}
                                  </DropdownItem>
                                ))
                              }
                            </InlineDropdown>
                          </div>
                          <div className="flex rounded-xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                            {CARD_VIEWS.map(({ id, label, Icon }) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setCardView(id)}
                                aria-label={label}
                                title={label}
                                className={`px-3 h-full rounded-lg transition-all flex items-center ${
                                  cardView === id
                                    ? "bg-gradient-to-br from-yellow-400 to-yellow-500 text-black shadow-lg shadow-yellow-500/20"
                                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedDate(new Date())}
                          disabled={isTodaySelected}
                          className="w-full h-11 flex items-center justify-center gap-2 rounded-2xl text-xs font-bold uppercase tracking-wide transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-yellow-400 hover:text-yellow-300 hover:bg-black/30 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <RotateCcw className="w-4 h-4" /> Volver a hoy
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Escritorio: una sola fila con todo */}
              <div className="hidden lg:flex gap-3 relative z-10">
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-500 z-10 pointer-events-none" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por título..."
                    className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-yellow-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Limpiar búsqueda"
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-zinc-500" />
                    </button>
                  )}
                </div>

                <InlineDropdown label="Tipo" valueLabel={typeLabel} icon={Filter}>
                  {({ close }) =>
                    TYPE_FILTERS.map(({ id, label }) => (
                      <DropdownItem
                        key={id}
                        active={typeFilter === id}
                        onClick={() => {
                          setTypeFilter(id);
                          close();
                        }}
                      >
                        {label}
                      </DropdownItem>
                    ))
                  }
                </InlineDropdown>

                <InlineDropdown
                  label="Agrupar"
                  valueLabel={groupLabel}
                  icon={Layers}
                >
                  {({ close }) =>
                    GROUP_MODES.map(({ id, label }) => (
                      <DropdownItem
                        key={id}
                        active={groupBy === id}
                        onClick={() => {
                          setGroupBy(id);
                          close();
                        }}
                      >
                        {label}
                      </DropdownItem>
                    ))
                  }
                </InlineDropdown>

                <InlineDropdown
                  label="Ordenar"
                  valueLabel={sortLabel}
                  icon={ArrowUpDown}
                >
                  {({ close }) =>
                    SORT_MODES.map(({ id, label }) => (
                      <DropdownItem
                        key={id}
                        active={sortBy === id}
                        onClick={() => {
                          setSortBy(id);
                          close();
                        }}
                      >
                        {label}
                      </DropdownItem>
                    ))
                  }
                </InlineDropdown>

                <div className="flex rounded-xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                  {CARD_VIEWS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCardView(id)}
                      aria-label={label}
                      title={label}
                      className={`px-3 h-full rounded-lg transition-all flex items-center ${
                        cardView === id
                          ? "bg-gradient-to-br from-yellow-400 to-yellow-500 text-black shadow-lg shadow-yellow-500/20"
                          : "text-zinc-400 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>

                {/* Icono y no texto: el botón está SIEMPRE, deshabilitado cuando ya
                    estás en hoy. Si apareciera y desapareciera, la barra cambiaría
                    de anchura al navegar por los días. */}
                <button
                  type="button"
                  onClick={() => setSelectedDate(new Date())}
                  disabled={isTodaySelected}
                  title="Volver a hoy"
                  aria-label="Volver a hoy"
                  className="h-11 w-11 rounded-2xl transition-all flex items-center justify-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-yellow-400 hover:bg-black/30 hover:text-yellow-300 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-yellow-400"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </motion.div>

            {/* Content Area */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32">
                <Loader2 className="w-10 h-10 animate-spin text-yellow-500 mb-4" />
                <span className="text-zinc-500 text-sm font-medium animate-pulse">
                  Consultando fecha...
                </span>
              </div>
            ) : error && !hasAnyItems ? (
              <div className="rounded-[2rem] flex flex-col items-center justify-center py-32 text-center bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg mx-2">
                <ImageOff className="w-16 h-16 text-red-500/50 mb-4" />
                <h3 className="text-xl font-bold text-red-200">{error}</h3>
                <p className="text-red-400/60 mt-2 text-sm">
                  Inténtalo de nuevo más tarde.
                </p>
              </div>
            ) : !hasAnyItems ? (
              <div className="flex flex-col items-center justify-center py-40 text-center rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg mx-2 border border-white/10">
                <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 bg-white/5 shadow-sm border border-white/10">
                  <CalendarIcon className="w-10 h-10 text-zinc-600" />
                </div>
                <h3 className="text-2xl font-bold text-zinc-300">
                  {RANGE_MONTHS[groupBy] === 1
                    ? "Mes tranquilo"
                    : "Periodo tranquilo"}
                </h3>
                <p className="text-zinc-500 mt-2 max-w-md px-4">
                  No hay estrenos registrados ni episodios de tus series para{" "}
                  <span className="text-yellow-400 font-bold capitalize">
                    {rangeLabel}
                  </span>
                  .
                </p>
              </div>
            ) : (
              <>
                {/* Header con info del período */}
                <div className="mb-6 sm:mb-8 px-2 sm:px-0">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/40 to-yellow-500/15" />
                    <div className="relative overflow-hidden inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-1.5 text-center">
                      <span className="text-yellow-100 font-bold text-xs sm:text-sm tracking-widest uppercase block drop-shadow-sm">
                        {selectedMovies.length} películas ·{" "}
                        {sortedTrackedEpisodes.length} episodios
                      </span>
                      <span className="text-yellow-300/80 text-[10px] sm:text-xs capitalize block ml-2">
                        ({rangeLabel})
                      </span>
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent via-yellow-500/40 to-yellow-500/15" />
                  </div>
                </div>

                {/* Los estrenos han cargado pero tus episodios no: se avisa en
                    vez de dejar la lista corta sin explicación. */}
                {episodeError && (
                  <div className="mb-6 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-3 text-center text-sm text-red-200 mx-2 sm:mx-0">
                    {episodeError}
                  </div>
                )}

                {visibleItems.length === 0 ? (
                  <div className="py-24 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20">
                    <LayoutList className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
                    <p className="text-zinc-500 font-medium">
                      {query
                        ? "No se encontraron resultados."
                        : "No hay nada de ese tipo en este periodo."}
                    </p>
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="mt-4 text-yellow-500 text-sm font-bold hover:underline"
                      >
                        Limpiar búsqueda
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTypeFilter("all")}
                        className="mt-4 text-yellow-500 text-sm font-bold hover:underline"
                      >
                        Ver todo
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-8 px-2 sm:px-0">
                    {groups.map((group, groupIndex) => {
                      // Índice global de la primera tarjeta del grupo, para que
                      // la cascada de entrada no se reinicie en cada cabecera.
                      const baseIndex = cardOrder.offsets[groupIndex] ?? 0;

                      return (
                        <div key={group.key}>
                          <div className="flex items-center gap-3 py-1.5 sm:py-4 mb-2">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/40 to-yellow-500/15" />
                            <div className="relative overflow-hidden inline-flex max-w-[80%] items-center gap-2 rounded-xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-1.5 text-xs sm:text-sm">
                              <span className="relative z-10 truncate font-black uppercase tracking-wide text-yellow-100 drop-shadow-sm">
                                {formatGroupHeader(group.date, groupBy)}
                              </span>
                              <span className="relative z-10 shrink-0 text-[10px] font-bold text-yellow-300/80">
                                {group.items.length}{" "}
                                {group.items.length === 1 ? "título" : "títulos"}
                              </span>
                            </div>
                            <div className="h-px flex-1 bg-gradient-to-l from-transparent via-yellow-500/40 to-yellow-500/15" />
                          </div>

                          {cardView === "grid" ? (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                              {group.items.map((item, idx) => (
                                <CalendarGridCard
                                  key={item.key}
                                  item={item}
                                  index={baseIndex + idx}
                                  total={cardOrder.total}
                                />
                              ))}
                            </div>
                          ) : cardView === "compact" ? (
                            <div className="compact-cards-grid grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-2">
                              {group.items.map((item, idx) => (
                                <CalendarCompactCard
                                  key={item.key}
                                  item={item}
                                  index={baseIndex + idx}
                                  total={cardOrder.total}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                              {group.items.map((item, idx) => (
                                <CalendarListCard
                                  key={item.key}
                                  item={item}
                                  index={baseIndex + idx}
                                  total={cardOrder.total}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Derecha: calendario del mes (solo escritorio ancho). En pantallas
              menores el mismo panel se abre desde el botón del menú. */}
          <motion.div
            className="hidden xl:block space-y-6 sticky top-20"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <CalendarSidePanel
              monthDate={panelMonth}
              onPrev={() => setPanelMonth((d) => subMonths(d, 1))}
              onNext={() => setPanelMonth((d) => addMonths(d, 1))}
              countsByDay={monthCounts}
              selectedYmd={selectedYmd}
              onSelectDay={goToDay}
              onShowMonth={showPanelMonth}
              loading={monthCountsLoading}
            />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {mobileCalendarOpen && (
          <MobileCalendarOverlay
            open={mobileCalendarOpen}
            onClose={() => setMobileCalendarOpen(false)}
            monthDate={panelMonth}
            onPrev={() => setPanelMonth((d) => subMonths(d, 1))}
            onNext={() => setPanelMonth((d) => addMonths(d, 1))}
            countsByDay={monthCounts}
            selectedYmd={selectedYmd}
            onSelectDay={goToDay}
            onShowMonth={showPanelMonth}
            loading={monthCountsLoading}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
