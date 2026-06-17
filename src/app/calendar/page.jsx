"use client";


import OptimizedImage from "@/components/OptimizedImage";
import { useEffect, useState, useRef, useMemo } from "react";
import {
  format,
  isToday,
  addMonths,
  subMonths,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  subWeeks,
  isSameWeek,
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
  Tv2,
  Film,
  MonitorPlay,
} from "lucide-react";

import {
  getMoviesByDate,
  getMoviesByDateRange,
  getTrackedEpisodesByDateRange,
} from "@/lib/api/calendar";
import { formatPageTitle } from "@/lib/pageTitle";

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

function EpisodeCard({ item, viewMode }) {
  const show = item?.show || {};
  const episode = item?.episode || {};
  const title = show?.title || "Serie";
  const season = Number(episode?.season || 0);
  const number = Number(episode?.number || 0);
  const href =
    show?.tmdbId && season > 0 && number > 0
      ? `/details/tv/${show.tmdbId}/season/${season}/episode/${number}`
      : `/details/tv/${show.tmdbId}`;
  const airedDate = item?.first_aired ? new Date(item.first_aired) : null;
  const validAiredDate =
    airedDate && Number.isFinite(airedDate.getTime()) ? airedDate : null;
  const source = Array.isArray(item?.source) ? item.source : [];
  const isFavorite = source.includes("favorite");
  const isWatchlist = source.includes("watchlist");

  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-lg transition-transform duration-500 hover:scale-[1.03] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg hover:shadow-[0_20px_25px_-5px_rgba(168,85,247,0.15)]"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-zinc-900">
        <TmdbBackdrop
          path={show?.backdrop_path}
          fallbackPath={show?.poster_path}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/10" />

        {(isWatchlist || isFavorite) && (
          <div
            className={`absolute top-0 left-0 z-20 p-2 sm:p-2.5 flex items-center gap-1.5 rounded-br-2xl border-r border-b backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu origin-top-left scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 ${
              isFavorite
                ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                : "bg-sky-500/15 border-sky-500/30 text-sky-300"
            }`}
          >
            {isWatchlist && (
              <Bookmark className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            )}
            {isFavorite && (
              <Heart className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current" />
            )}
          </div>
        )}

        {viewMode !== "day" && validAiredDate && (
          <div
            className={`absolute top-0 right-0 z-20 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-bl-2xl border-l border-b backdrop-blur-md shadow-sm text-center ${
              isToday(validAiredDate)
                ? "bg-yellow-500/20 border-yellow-500/30 text-yellow-400"
                : "bg-white/5 border-white/10 text-zinc-200"
            }`}
          >
            <div className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider leading-none mb-0.5 opacity-90">
              {format(validAiredDate, "EEE", { locale: es })}
            </div>
            <div className="text-sm sm:text-base font-black leading-none drop-shadow-md">
              {format(validAiredDate, "d")}
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="line-clamp-1 text-sm font-black leading-tight text-white drop-shadow-md">
            {title}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-zinc-300">
            T{season || "?"} · E{number || "?"}
            {episode?.title ? ` · ${episode.title}` : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}

function CustomCalendar({
  selected,
  onSelect,
  currentMonth,
  onMonthChange,
  viewMode,
}) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const buildMonthGrid = (y, m) => {
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
  };

  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const dow = ["L", "M", "X", "J", "V", "S", "D"];

  const goPrev = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onMonthChange(subMonths(currentMonth, 1));
  };
  const goNext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onMonthChange(addMonths(currentMonth, 1));
  };

  return (
    <div className="w-[280px] sm:w-[320px] p-2 flex flex-col gap-4">
      <div className="flex items-center justify-between px-2">
        <button
          type="button"
          onClick={goPrev}
          className="p-1.5 hover:bg-white/10 rounded-lg transition text-yellow-500"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-sm font-bold text-yellow-400 capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: es })}
        </div>
        <button
          type="button"
          onClick={goNext}
          className="p-1.5 hover:bg-white/10 rounded-lg transition text-yellow-500"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-7 mb-2">
          {dow.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-bold text-zinc-500"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {weeks.flat().map((d, i) => {
            const key = format(d, "yyyy-MM-dd");
            const selKey = format(selected, "yyyy-MM-dd");
            const isSel = key === selKey;

            let isSelWeek = false;
            if (viewMode === "week") {
              isSelWeek = isSameWeek(d, selected, {
                locale: es,
                weekStartsOn: 1,
              });
            }

            const inMonth = d.getMonth() === month;
            const isTodayDate = isToday(d);

            return (
              <div
                key={i}
                className="flex justify-center items-center h-8 sm:h-9 relative"
              >
                {isSelWeek && !isSel && (
                  <div className="absolute inset-0 bg-yellow-500/10 rounded-md" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    onSelect(d);
                    onMonthChange(d);
                  }}
                  className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm transition-all z-10 ${
                    isSel
                      ? "bg-gradient-to-br from-yellow-400 to-yellow-500 text-black font-bold shadow-md shadow-yellow-500/20 scale-105"
                      : isSelWeek
                        ? "text-yellow-400 font-bold hover:bg-yellow-500/20"
                        : isTodayDate
                          ? "bg-white/5 text-yellow-400 font-bold border border-yellow-500/30 hover:bg-white/10"
                          : inMonth
                            ? "text-zinc-300 hover:bg-white/10 hover:text-white"
                            : "text-zinc-600 hover:bg-white/5 hover:text-zinc-400"
                  }`}
                >
                  {d.getDate()}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Dropdown({ label, valueLabel, icon: Icon, children, className = "" }) {
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
    <div
      ref={ref}
      className={`relative ${open ? "z-[99999]" : "z-20"} ${className}`}
    >
      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 ml-1 hidden sm:block">
        {label}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-11 inline-flex items-center justify-between gap-2 px-3 rounded-xl transition text-sm bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10"
      >
        <div className="flex items-center gap-2 truncate">
          {Icon && <Icon className="w-4 h-4 text-zinc-500" />}
          <span className="font-medium text-white truncate">{valueLabel}</span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute left-0 top-full z-[99999] mt-2 w-full rounded-2xl bg-zinc-950/95 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl shadow-2xl p-2 border border-white/10"
          >
            <div className="space-y-1">
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
      className={`w-full px-3 py-2 rounded-xl text-left text-xs sm:text-sm transition flex items-center justify-between ${
        active
          ? "bg-white/10 text-white font-bold"
          : "text-zinc-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="font-medium">{children}</span>
      {active && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
    </button>
  );
}

function DateSelector({
  selected,
  onSelect,
  currentMonth,
  onMonthChange,
  viewMode = "day",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const handleSelect = (date) => {
    if (date) {
      onSelect(date);
      setOpen(false);
    }
  };

  // Texto del botón según el modo
  const buttonText = useMemo(() => {
    switch (viewMode) {
      case "week":
        return `Semana · ${format(selected, "d 'de' MMM", { locale: es })}`;
      case "month":
        return `Mes · ${format(selected, "MMMM", { locale: es })}`;
      case "day":
      default:
        return `Día · ${format(selected, "d 'de' MMMM", { locale: es })}`;
    }
  }, [selected, viewMode]);

  // En modo mes, no mostramos el selector
  if (viewMode === "month") {
    return (
      <div className={className}>
        <div className="w-full flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl shadow-lg cursor-not-allowed bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-lg opacity-70">
          <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-xs sm:text-sm font-bold capitalize truncate text-zinc-300">
            {buttonText}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`relative ${open ? "z-[99999]" : "z-50"} ${className}`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all group bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-lg shadow-lg hover:from-white/15 hover:to-white/10"
      >
        <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
        <span className="text-xs sm:text-sm font-bold capitalize truncate text-white">
          {buttonText}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: 10, scale: 0.95, x: "-50%" }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 mt-2 sm:mt-4 p-4 bg-zinc-950/95 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-2xl rounded-3xl shadow-2xl z-[99999] w-auto"
          >
            <CustomCalendar
              selected={selected}
              onSelect={handleSelect}
              currentMonth={currentMonth}
              onMonthChange={onMonthChange}
              viewMode={viewMode}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- PÁGINA PRINCIPAL ---

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState("week");

  const [selectedMovies, setSelectedMovies] = useState([]);
  const [trackedEpisodes, setTrackedEpisodes] = useState([]);
  const [moviesLoading, setMoviesLoading] = useState(true);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [traktConnected, setTraktConnected] = useState(null);
  const [episodeError, setEpisodeError] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = formatPageTitle("Calendario");
  }, []);

  // Cargar modo de vista guardado solo en el cliente
  useEffect(() => {
    const saved = window.localStorage.getItem("showverse:calendar:viewMode");
    if (saved && (saved === "day" || saved === "week" || saved === "month")) {
      setViewMode(saved);
    }
  }, []);

  // Persistir modo de vista
  useEffect(() => {
    window.localStorage.setItem("showverse:calendar:viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    setCurrentMonth(selectedDate);
  }, [selectedDate]);

  // Calcular rango de fechas según el modo
  const dateRange = useMemo(() => {
    switch (viewMode) {
      case "week":
        return {
          start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
          end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
        };
      case "month":
        return {
          start: startOfMonth(selectedDate),
          end: endOfMonth(selectedDate),
        };
      case "day":
      default:
        return { start: selectedDate, end: selectedDate };
    }
  }, [selectedDate, viewMode]);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        setMoviesLoading(true);
        setError(null);

        let movies;
        if (viewMode === "day") {
          movies = await getMoviesByDate(selectedDate);
        } else {
          movies = await getMoviesByDateRange(dateRange.start, dateRange.end);
        }

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
  }, [selectedDate, viewMode, dateRange.start, dateRange.end]);

  useEffect(() => {
    const fetchTrackedEpisodes = async () => {
      try {
        setEpisodesLoading(true);
        setEpisodeError(null);

        const data = await getTrackedEpisodesByDateRange(
          dateRange.start,
          dateRange.end,
        );

        setTraktConnected(data?.connected === true);
        setTrackedEpisodes(Array.isArray(data?.items) ? data.items : []);
        if (data?.error) setEpisodeError(data.error);
      } catch (err) {
        console.error("Error al cargar episodios Trakt:", err);
        setTrackedEpisodes([]);
        setEpisodeError("No se han podido cargar tus episodios de Trakt.");
      } finally {
        setEpisodesLoading(false);
      }
    };

    fetchTrackedEpisodes();
  }, [dateRange.start, dateRange.end]);

  const isTodaySelected = isToday(selectedDate);

  // Label para el modo de vista
  const viewLabel = useMemo(() => {
    switch (viewMode) {
      case "week":
        return "Semana";
      case "month":
        return "Mes completo";
      case "day":
      default:
        return "Día";
    }
  }, [viewMode]);

  // Label para el rango de fechas mostrado
  const dateRangeLabel = useMemo(() => {
    switch (viewMode) {
      case "week":
        return `${format(dateRange.start, "d 'de' MMM", { locale: es })} - ${format(dateRange.end, "d 'de' MMM 'de' yyyy", { locale: es })}`;
      case "month":
        return format(selectedDate, "MMMM 'de' yyyy", { locale: es });
      case "day":
      default:
        return format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: es });
    }
  }, [selectedDate, viewMode, dateRange]);

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
  const loading =
    (moviesLoading && !hasEpisodes) || (episodesLoading && !hasMovies);

  // Handlers
  const goPrev = () => {
    switch (viewMode) {
      case "week":
        setSelectedDate((prev) => subWeeks(prev, 1));
        break;
      case "month":
        setSelectedDate((prev) => subMonths(prev, 1));
        break;
      case "day":
      default:
        setSelectedDate((prev) => subDays(prev, 1));
    }
  };

  const goNext = () => {
    switch (viewMode) {
      case "week":
        setSelectedDate((prev) => addWeeks(prev, 1));
        break;
      case "month":
        setSelectedDate((prev) => addMonths(prev, 1));
        break;
      case "day":
      default:
        setSelectedDate((prev) => addDays(prev, 1));
    }
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans selection:bg-yellow-500/30 pb-20">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-yellow-600/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-yellow-700/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-amber-800/25 blur-[120px] sm:blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-2 sm:px-6 lg:px-8 py-6 lg:py-12">
        {/* Header Section */}
        <div className="relative z-30 flex flex-col xl:flex-row xl:items-end justify-between gap-6 sm:gap-8 mb-8 sm:mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
          {/* Título */}
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

          {/* --- CONTROLES DE NAVEGACIÓN Y VISTA --- */}
          <div className="flex flex-col xl:flex-row gap-3 w-full xl:w-auto px-1 sm:px-0 xl:items-end">
            {/* Menú Vista */}
            <div className="w-full xl:w-auto">
              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 ml-1 hidden sm:block">
                Vista
              </div>
              <div className="flex items-center gap-1.5 rounded-xl p-1 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-lg shadow-lg">
                <button
                  onClick={() => setViewMode("day")}
                  className={`flex-1 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    viewMode === "day"
                      ? "bg-gradient-to-br from-yellow-400 to-yellow-500 text-black shadow-lg shadow-yellow-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  Día
                </button>
                <button
                  onClick={() => setViewMode("week")}
                  className={`flex-1 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    viewMode === "week"
                      ? "bg-gradient-to-br from-yellow-400 to-yellow-500 text-black shadow-lg shadow-yellow-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  Semana
                </button>
                <button
                  onClick={() => setViewMode("month")}
                  className={`flex-1 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    viewMode === "month"
                      ? "bg-gradient-to-br from-yellow-400 to-yellow-500 text-black shadow-lg shadow-yellow-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  Mes
                </button>
              </div>
            </div>

            {/* Navegación período actual */}
            <div className="flex items-center gap-2 w-full xl:w-auto">
              <button
                onClick={goPrev}
                className="p-3 rounded-xl sm:rounded-2xl transition shadow-lg flex-shrink-0 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-lg text-zinc-200 hover:from-white/15 hover:to-white/10 hover:text-white"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Selector fecha: flex-1 en móvil, ancho fijo en desktop */}
              <DateSelector
                selected={selectedDate}
                onSelect={setSelectedDate}
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
                viewMode={viewMode}
                className="flex-1 xl:w-[280px]"
              />

              <button
                onClick={goNext}
                className="p-3 rounded-xl sm:rounded-2xl transition shadow-lg flex-shrink-0 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-lg text-zinc-200 hover:from-white/15 hover:to-white/10 hover:text-white"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Botón Volver a Hoy */}
            {!isTodaySelected && (
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm transition font-bold bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-lg shadow-lg text-yellow-400 hover:from-white/15 hover:to-white/10 hover:text-yellow-300"
              >
                Volver a Hoy
              </button>
            )}
          </div>
        </div>

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
              {viewMode === "day"
                ? "Día tranquilo"
                : viewMode === "week"
                  ? "Semana tranquila"
                  : "Mes tranquilo"}
            </h3>
            <p className="text-zinc-500 mt-2 max-w-md px-4">
              No hay estrenos registrados ni episodios de tus series para{" "}
              <span className="text-yellow-400 font-bold capitalize">
                {dateRangeLabel}
              </span>
              .
            </p>
            {traktConnected === false && (
              <Link
                href={`/api/trakt/auth/start?next=${encodeURIComponent("/calendar")}`}
                className="mt-6 rounded-xl px-4 py-2 text-sm font-bold transition bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-purple-300 hover:text-white hover:from-white/15 hover:to-white/10"
              >
                Conectar Trakt
              </Link>
            )}
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
                  {viewMode !== "day" && (
                    <span className="text-yellow-300/80 text-[10px] sm:text-xs capitalize block ml-2">
                      ({dateRangeLabel})
                    </span>
                  )}
                </div>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent via-yellow-500/40 to-yellow-500/15" />
              </div>
            </div>

            {(episodesLoading ||
              hasEpisodes ||
              traktConnected === false ||
              episodeError) && (
              <section className="mb-10 px-2 sm:px-0">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-purple-300">
                      <Tv2 className="h-4 w-4" />
                      <h2 className="text-lg font-black tracking-tight text-white sm:text-2xl">
                        Episodios de tus series
                      </h2>
                    </div>
                  </div>
                  {hasEpisodes && (
                    <span className="w-fit rounded-full px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-purple-300 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                      {sortedTrackedEpisodes.length} episodios
                    </span>
                  )}
                </div>

                {episodesLoading ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="aspect-[16/9] animate-pulse rounded-xl border border-white/5 bg-zinc-900"
                      />
                    ))}
                  </div>
                ) : traktConnected === false ? (
                  <div className="flex flex-col items-start gap-3 rounded-[2rem] p-5 sm:flex-row sm:items-center sm:justify-between bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                    <div>
                      <h3 className="font-bold text-purple-100">
                        Conecta Trakt para ver tus episodios
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        El calendario podrá cruzar tus pendientes y favoritas
                        con los próximos estrenos.
                      </p>
                    </div>
                    <Link
                      href={`/api/trakt/auth/start?next=${encodeURIComponent("/calendar")}`}
                      className="rounded-xl px-4 py-2 text-sm font-bold transition bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-purple-300 hover:text-white hover:from-white/15 hover:to-white/10"
                    >
                      Conectar
                    </Link>
                  </div>
                ) : hasEpisodes ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {sortedTrackedEpisodes.map((item) => (
                      <EpisodeCard
                        key={item.id}
                        item={item}
                        viewMode={viewMode}
                      />
                    ))}
                  </div>
                ) : episodeError ? (
                  <div className="rounded-[2rem] p-4 text-sm text-red-200 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-center">
                    {episodeError}
                  </div>
                ) : (
                  <div className="rounded-[2rem] p-5 text-sm text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-center">
                    No hay episodios de tus series para este periodo.
                  </div>
                )}
              </section>
            )}

            {hasMovies && (
              <section className="px-2 sm:px-0">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-yellow-400" />
                    <h2 className="text-lg font-black tracking-tight text-white sm:text-2xl">
                      Películas
                    </h2>
                  </div>
                  <span className="w-fit rounded-full px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-yellow-300 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                    {selectedMovies.length} lanzamientos
                  </span>
                </div>

                {/* Grid continuo con badges de fecha en semana/mes */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-4 lg:gap-6">
                  {(() => {
                    // Ordenar películas por fecha si estamos en vista semana/mes
                    const sortedMovies =
                      viewMode !== "day"
                        ? [...selectedMovies].sort((a, b) => {
                            const dateA =
                              a.media_type === "movie" || a.title
                                ? a.release_date
                                : a.first_air_date;
                            const dateB =
                              b.media_type === "movie" || b.title
                                ? b.release_date
                                : b.first_air_date;
                            return (dateA || "").localeCompare(dateB || "");
                          })
                        : selectedMovies;

                    return sortedMovies.map((item) => {
                      const isMovie =
                        item.media_type === "movie" || !!item.title;
                      const mediaType =
                        item.media_type || (isMovie ? "movie" : "tv");
                      const href = `/details/${mediaType}/${item.id}`;
                      const title = isMovie ? item.title : item.name;
                      const releaseDate = isMovie
                        ? item.release_date
                        : item.first_air_date;
                      const year = releaseDate?.slice(0, 4);
                      const posterPath = item.poster_path || item.backdrop_path;

                      // Calcular info de fecha para badge en vistas semana/mes
                      let dateBadgeInfo = null;
                      if (viewMode !== "day" && releaseDate) {
                        const date = new Date(releaseDate + "T00:00:00");
                        const isDateToday = isToday(date);
                        const dayNum = format(date, "d");
                        const dayName = format(date, "EEE", { locale: es });

                        dateBadgeInfo = {
                          isToday: isDateToday,
                          dayNum,
                          dayName,
                        };
                      }

                      return (
                        <Link
                          key={`${mediaType}-${item.id}`}
                          href={href}
                          className="group relative block animate-in fade-in zoom-in-95 duration-500"
                        >
                          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md sm:rounded-lg shadow-md transition-all duration-500 group-hover:shadow-[0_20px_25px_-5px_rgba(234,179,8,0.15)] group-hover:scale-[1.03] z-0 group-hover:z-10 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg">
                            <TmdbPoster
                              path={posterPath}
                              alt={title}
                              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                            />

                            <div
                              className={`hidden lg:block absolute top-0 left-0 z-20 p-2 sm:p-2.5 rounded-br-2xl border-r border-b backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu origin-top-left scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 ${
                                isMovie
                                  ? "bg-sky-500/15 border-sky-500/30 text-sky-300"
                                  : "bg-purple-500/15 border-purple-500/30 text-purple-300"
                              }`}
                            >
                              {isMovie ? (
                                <Film className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                              ) : (
                                <MonitorPlay className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                              )}
                            </div>

                            {/* Overlay en hover */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end">
                              {/* Badge Tipo en hover - Esquina superior derecha */}
                              <div />

                              {/* Info Bottom en hover */}
                              <div className="p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md text-xs sm:text-sm">
                                  {title}
                                </h3>
                                {year && (
                                  <p className="text-yellow-500 text-[10px] sm:text-xs font-bold mt-0.5 drop-shadow-md">
                                    {year}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Badge Fecha (siempre visible en vistas semana/mes) */}
                            {dateBadgeInfo && (
                              <div
                                className={`absolute top-0 right-0 z-20 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-bl-2xl border-l border-b backdrop-blur-md shadow-sm text-center ${
                                  dateBadgeInfo.isToday
                                    ? "bg-yellow-500/20 border-yellow-500/30 text-yellow-400"
                                    : "bg-white/5 border-white/10 text-zinc-200"
                                }`}
                              >
                                <div className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider leading-none mb-0.5 opacity-90">
                                  {dateBadgeInfo.dayName}
                                </div>
                                <div className="text-sm sm:text-base font-black leading-none drop-shadow-md">
                                  {dateBadgeInfo.dayNum}
                                </div>
                              </div>
                            )}
                          </div>
                        </Link>
                      );
                    });
                  })()}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
