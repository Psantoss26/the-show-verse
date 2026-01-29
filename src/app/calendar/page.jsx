"use client";

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
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
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
} from "lucide-react";

import { getMoviesByDate, getMoviesByDateRange } from "@/lib/api/calendar";

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
    <img
      src={`https://image.tmdb.org/t/p/w342${path}`}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
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
        className="w-full h-10 inline-flex items-center justify-between gap-2 px-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-sm text-zinc-300"
      >
        <div className="flex items-center gap-2 truncate">
          {Icon && <Icon className="w-4 h-4 text-zinc-500" />}
          <span className="font-medium text-white truncate">{valueLabel}</span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute left-0 top-full z-[99999] mt-2 w-full min-w-[160px] rounded-xl border border-zinc-800 bg-[#121212] shadow-2xl overflow-hidden"
          >
            <div className="p-1 space-y-0.5">
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
      className={`w-full px-3 py-2 rounded-lg text-left text-xs sm:text-sm transition flex items-center justify-between ${
        active
          ? "bg-zinc-800 text-white"
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
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
        <div className="w-full flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl sm:rounded-2xl text-yellow-400 shadow-lg cursor-not-allowed">
          <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-xs sm:text-sm font-bold capitalize truncate">
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
        className="w-full flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 bg-yellow-500 hover:bg-yellow-400 rounded-xl sm:rounded-2xl text-black shadow-lg shadow-yellow-900/20 transition-all group"
      >
        <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-black/70" />
        <span className="text-xs sm:text-sm font-bold capitalize truncate text-black">
          {buttonText}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-black/60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 -translate-x-1/2 mt-2 sm:mt-4 p-4 bg-[#161616] border border-white/10 rounded-3xl shadow-2xl z-[99999] w-[280px] sm:w-auto"
          >
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={handleSelect}
              month={currentMonth}
              onMonthChange={onMonthChange}
              locale={es}
              showOutsideDays
              className="!m-0"
              modifiers={
                viewMode === "week"
                  ? {
                      selectedWeek: (date) =>
                        isSameWeek(date, selected, {
                          locale: es,
                          weekStartsOn: 1,
                        }),
                    }
                  : {}
              }
              modifiersClassNames={
                viewMode === "week"
                  ? {
                      selectedWeek: "!bg-yellow-500/20 !text-yellow-300",
                    }
                  : {}
              }
              classNames={{
                caption: "flex justify-center py-2 relative items-center mb-2",
                caption_label: "text-sm font-bold text-yellow-400 capitalize",
                nav: "flex items-center",
                nav_button:
                  "h-7 w-7 bg-transparent p-0 hover:bg-yellow-500/20 rounded-full flex items-center justify-center text-yellow-500/70 hover:text-yellow-400 transition-colors",
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse space-y-1",
                head_row: "flex mb-2",
                head_cell:
                  "text-zinc-500 rounded-md w-8 sm:w-9 font-normal text-[0.75rem] uppercase",
                row: "flex w-full mt-1",
                cell: "text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                day: "h-8 w-8 sm:h-9 sm:w-9 p-0 font-normal hover:bg-yellow-500/10 rounded-full transition-colors text-zinc-300 hover:text-white",
                day_selected:
                  "!bg-yellow-500 !text-black hover:!bg-yellow-400 font-bold shadow-md shadow-yellow-500/20",
                day_today:
                  "text-yellow-400 font-bold border border-yellow-500/30",
                day_outside: "text-zinc-700 opacity-50",
                day_disabled: "text-zinc-700 opacity-50",
                day_hidden: "invisible",
              }}
              components={{
                IconLeft: () => (
                  <ChevronLeft className="w-4 h-4 text-yellow-500" />
                ),
                IconRight: () => (
                  <ChevronRight className="w-4 h-4 text-yellow-500" />
                ),
              }}
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
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return "day";
    const saved = window.localStorage.getItem("showverse:calendar:viewMode");
    return saved || "day";
  });

  const [selectedMovies, setSelectedMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Persistir modo de vista
  useEffect(() => {
    if (typeof window === "undefined") return;
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
        setLoading(true);
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
        setLoading(false);
      }
    };

    fetchMovies();
  }, [selectedDate, viewMode, dateRange.start, dateRange.end]);

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
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans selection:bg-yellow-500/30 pb-20">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[10%] w-[700px] h-[700px] bg-yellow-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-amber-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-2 sm:px-6 lg:px-8 py-6 lg:py-12">
        {/* Header Section */}
        <div className="relative z-30 flex flex-col xl:flex-row xl:items-end justify-between gap-6 sm:gap-8 mb-8 sm:mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
          {/* Título */}
          <div className="flex items-center gap-4 px-2 sm:px-0">
            <div className="p-3 sm:p-4 bg-yellow-500/10 rounded-2xl sm:rounded-3xl border border-yellow-500/20">
              <CalendarDays className="w-8 h-8 sm:w-10 sm:h-10 text-yellow-500" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
                Calendario
              </h1>
              <p className="text-zinc-400 mt-1 sm:mt-2 font-medium text-xs sm:text-base">
                Estrenos de Cine y Televisión
              </p>
            </div>
          </div>

          {/* --- CONTROLES DE NAVEGACIÓN Y VISTA --- */}
          <div className="flex flex-col xl:flex-row gap-3 w-full xl:w-auto px-1 sm:px-0 xl:items-end">
            {/* Dropdown Vista */}
            <Dropdown
              label="Vista"
              valueLabel={viewLabel}
              icon={CalendarDays}
              className="w-full xl:w-[180px]"
            >
              {({ close }) => (
                <>
                  <DropdownItem
                    active={viewMode === "day"}
                    onClick={() => {
                      setViewMode("day");
                      close();
                    }}
                  >
                    Día
                  </DropdownItem>

                  <DropdownItem
                    active={viewMode === "week"}
                    onClick={() => {
                      setViewMode("week");
                      close();
                    }}
                  >
                    Semana
                  </DropdownItem>

                  <DropdownItem
                    active={viewMode === "month"}
                    onClick={() => {
                      setViewMode("month");
                      close();
                    }}
                  >
                    Mes completo
                  </DropdownItem>
                </>
              )}
            </Dropdown>

            {/* Navegación período actual */}
            <div className="flex items-center gap-2 w-full xl:w-auto">
              <button
                onClick={goPrev}
                className="p-3 rounded-xl sm:rounded-2xl bg-zinc-900/50 border border-white/5 text-zinc-300 hover:text-white hover:border-white/20 transition shadow-lg flex-shrink-0"
                title={`${viewMode === "month" ? "Mes" : viewMode === "week" ? "Semana" : "Día"} anterior`}
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
                className="p-3 rounded-xl sm:rounded-2xl bg-zinc-900/50 border border-white/5 text-zinc-300 hover:text-white hover:border-white/20 transition shadow-lg flex-shrink-0"
                title={`${viewMode === "month" ? "Mes" : viewMode === "week" ? "Semana" : "Día"} siguiente`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Botón Volver a Hoy */}
            {!isTodaySelected && (
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-4 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500 hover:text-black font-bold text-xs sm:text-sm transition"
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
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-red-900/30 rounded-3xl bg-red-900/5 mx-2">
            <ImageOff className="w-16 h-16 text-red-500/50 mb-4" />
            <h3 className="text-xl font-bold text-red-200">{error}</h3>
            <p className="text-red-400/60 mt-2 text-sm">
              Inténtalo de nuevo más tarde.
            </p>
          </div>
        ) : selectedMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20 mx-2">
            <div className="w-24 h-24 bg-zinc-900/50 rounded-full flex items-center justify-center mb-6 border border-zinc-800/50">
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
              No hay grandes estrenos registrados para{" "}
              <span className="text-yellow-400 font-bold capitalize">
                {dateRangeLabel}
              </span>
              .
            </p>
          </div>
        ) : (
          <>
            {/* Header con info del período */}
            <div className="mb-6 sm:mb-8 px-2 sm:px-0">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-yellow-500/50 to-transparent" />
                <div className="text-center">
                  <span className="text-yellow-400 font-bold text-xs sm:text-sm tracking-widest uppercase block">
                    {selectedMovies.length} Lanzamientos
                  </span>
                  {viewMode !== "day" && (
                    <span className="text-zinc-500 text-[10px] sm:text-xs mt-1 capitalize block">
                      {dateRangeLabel}
                    </span>
                  )}
                </div>
                <div className="h-px flex-1 bg-gradient-to-l from-yellow-500/50 to-transparent" />
              </div>
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
                  const isMovie = item.media_type === "movie" || !!item.title;
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
                      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg sm:rounded-xl bg-zinc-900 shadow-md ring-1 ring-white/5 transition-all duration-500 group-hover:shadow-[0_0_20px_rgba(234,179,8,0.25)] group-hover:scale-[1.03] z-0 group-hover:z-10">
                        <TmdbPoster
                          path={posterPath}
                          alt={title}
                          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                        />

                        {/* Overlay en hover */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between">
                          {/* Badge Tipo en hover - Esquina superior derecha */}
                          <div className="p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-end items-start transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                            <span
                              className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shadow-sm backdrop-blur-md ${
                                isMovie
                                  ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                                  : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                              }`}
                            >
                              {isMovie ? "PELÍCULA" : "SERIE"}
                            </span>
                          </div>

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
                            className={`absolute top-1 left-1 sm:top-2 sm:left-2 px-1.5 py-1 rounded-lg backdrop-blur-md border shadow-lg ${
                              dateBadgeInfo.isToday
                                ? "bg-yellow-500/90 border-yellow-400/50 text-black"
                                : "bg-black/80 border-white/20 text-white"
                            }`}
                          >
                            <div className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider leading-none">
                              {dateBadgeInfo.dayName}
                            </div>
                            <div className="text-sm sm:text-base font-black leading-none mt-0.5">
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
          </>
        )}
      </div>
    </div>
  );
}
