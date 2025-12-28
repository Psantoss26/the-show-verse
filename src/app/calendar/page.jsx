'use client'

import { useEffect, useState, useRef } from 'react'
import { format, isToday, addMonths, subMonths, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link' // Import Link for navigation
import {
  ImageOff,
  Loader2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar as CalendarIcon
} from 'lucide-react'

import { getMoviesByDate } from '@/lib/api/calendar'

// --- COMPONENTES UI AUXILIARES ---

function TmdbPoster({ path, alt, className = '' }) {
  const [failed, setFailed] = useState(false)

  if (!path || failed) {
    return (
      <div className={`bg-zinc-900 flex items-center justify-center text-zinc-700 ${className}`}>
        <ImageOff className="w-8 h-8 opacity-50" />
      </div>
    )
  }

  return (
    <img
      src={`https://image.tmdb.org/t/p/w342${path}`}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

function DateSelector({ selected, onSelect, currentMonth, onMonthChange, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const handleSelect = (date) => {
    if (date) {
      onSelect(date)
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className={`relative z-50 ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 bg-yellow-500 hover:bg-yellow-400 rounded-xl sm:rounded-2xl text-black shadow-lg shadow-yellow-900/20 transition-all group"
      >
        <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-black/70" />
        <span className="text-xs sm:text-sm font-bold capitalize truncate text-black">
          {format(selected, "d 'de' MMMM", { locale: es })}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-black/60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 -translate-x-1/2 mt-2 sm:mt-4 p-4 bg-[#161616] border border-white/10 rounded-3xl shadow-2xl z-50 w-[280px] sm:w-auto"
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
              classNames={{
                caption: "flex justify-center py-2 relative items-center mb-2",
                caption_label: "text-sm font-bold text-white capitalize",
                nav: "flex items-center",
                nav_button: "h-7 w-7 bg-transparent p-0 hover:bg-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors",
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse space-y-1",
                head_row: "flex mb-2",
                head_cell: "text-zinc-500 rounded-md w-8 sm:w-9 font-normal text-[0.75rem] uppercase",
                row: "flex w-full mt-1",
                cell: "text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                day: "h-8 w-8 sm:h-9 sm:w-9 p-0 font-normal hover:bg-white/10 rounded-full transition-colors text-zinc-300 hover:text-white",
                day_selected: "!bg-yellow-500 !text-black hover:!bg-yellow-400 font-bold shadow-md shadow-yellow-500/20",
                day_today: "text-yellow-400 font-bold border border-yellow-500/30",
                day_outside: "text-zinc-700 opacity-50",
                day_disabled: "text-zinc-700 opacity-50",
                day_hidden: "invisible",
              }}
              components={{
                IconLeft: () => <ChevronLeft className="w-4 h-4" />,
                IconRight: () => <ChevronRight className="w-4 h-4" />,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// --- PÁGINA PRINCIPAL ---

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const [selectedMovies, setSelectedMovies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setCurrentMonth(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    if (!selectedDate) return

    const fetchMovies = async () => {
      try {
        setLoading(true)
        setError(null)
        const movies = await getMoviesByDate(selectedDate)
        setSelectedMovies(Array.isArray(movies) ? movies : [])
      } catch (err) {
        console.error('Error al cargar estrenos:', err)
        setSelectedMovies([])
        setError('No se han podido cargar los estrenos.')
      } finally {
        setLoading(false)
      }
    }

    fetchMovies()
  }, [selectedDate])

  const isTodaySelected = isToday(selectedDate)

  // Handlers
  const goPrevDay = () => setSelectedDate(prev => subDays(prev, 1))
  const goNextDay = () => setSelectedDate(prev => addDays(prev, 1))

  const goPrevMonth = () => {
    const newDate = subMonths(selectedDate, 1)
    setSelectedDate(newDate)
    setCurrentMonth(newDate) // Sync month view
  }
  const goNextMonth = () => {
    const newDate = addMonths(selectedDate, 1)
    setSelectedDate(newDate)
    setCurrentMonth(newDate) // Sync month view
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans selection:bg-yellow-500/30 pb-20">

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[10%] w-[700px] h-[700px] bg-yellow-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-amber-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-2 sm:px-6 lg:px-8 py-6 lg:py-12">

        {/* Header Section */}
        {/* En desktop (xl) se pone en fila. En móvil es columna. */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 sm:gap-8 mb-8 sm:mb-12 animate-in fade-in slide-in-from-top-4 duration-500">

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

          {/* --- CONTROLES DE NAVEGACIÓN --- */}
          {/* En desktop (xl) es una fila continua. En móvil es columna. */}
          <div className="flex flex-col xl:flex-row gap-3 w-full xl:w-auto px-1 sm:px-0 xl:items-center">

            {/* Fila 1 (Móvil): Meses + Botón Hoy */}
            {/* En desktop (xl) esto se integra en la fila principal sin justificar between */}
            <div className="flex items-center justify-between w-full xl:w-auto gap-4">
              {/* Navegación Meses */}
              <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/5">
                <button
                  onClick={goPrevMonth}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition"
                  title="Mes anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] sm:text-xs font-bold text-zinc-300 uppercase tracking-widest px-3">
                  Mes
                </span>
                <button
                  onClick={goNextMonth}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition"
                  title="Mes siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Botón Volver a Hoy (Se muestra siempre, alineado a la derecha en móvil) */}
              {!isTodaySelected && (
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="px-4 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500 hover:text-black font-bold text-xs sm:text-sm transition ml-auto xl:ml-0 xl:order-last"
                >
                  Volver a Hoy
                </button>
              )}
            </div>

            {/* Separador Desktop */}
            <div className="h-8 w-[1px] bg-white/10 hidden xl:block mx-2" />

            {/* Fila 2 (Móvil): Días (Ancho completo) */}
            {/* En desktop (xl) esto sigue en la misma línea */}
            <div className="flex items-center gap-2 w-full xl:w-auto">
              <button
                onClick={goPrevDay}
                className="p-3 rounded-xl sm:rounded-2xl bg-zinc-900/50 border border-white/5 text-zinc-300 hover:text-white hover:border-white/20 transition shadow-lg flex-shrink-0"
                title="Día anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Selector fecha: flex-1 en móvil, ancho fijo en desktop si se quiere */}
              <DateSelector
                selected={selectedDate}
                onSelect={setSelectedDate}
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
                className="flex-1 xl:w-[280px]"
              />

              <button
                onClick={goNextDay}
                className="p-3 rounded-xl sm:rounded-2xl bg-zinc-900/50 border border-white/5 text-zinc-300 hover:text-white hover:border-white/20 transition shadow-lg flex-shrink-0"
                title="Día siguiente"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
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
            <p className="text-red-400/60 mt-2 text-sm">Inténtalo de nuevo más tarde.</p>
          </div>
        ) : selectedMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20 mx-2">
            <div className="w-24 h-24 bg-zinc-900/50 rounded-full flex items-center justify-center mb-6 border border-zinc-800/50">
              <CalendarIcon className="w-10 h-10 text-zinc-600" />
            </div>
            <h3 className="text-2xl font-bold text-zinc-300">Día tranquilo</h3>
            <p className="text-zinc-500 mt-2 max-w-md px-4">
              No hay grandes estrenos registrados para el <span className="text-yellow-400 font-bold">{format(selectedDate, "d 'de' MMMM", { locale: es })}</span>.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3 px-2 sm:px-0">
              <div className="h-px flex-1 bg-gradient-to-r from-yellow-500/50 to-transparent" />
              <span className="text-yellow-400 font-bold text-xs sm:text-sm tracking-widest uppercase">
                {selectedMovies.length} Lanzamientos
              </span>
            </div>

            {/* Grid: 3 columnas en móvil (grid-cols-3) */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-4 lg:gap-6">
              {selectedMovies.map((item) => {
                const isMovie = item.media_type === 'movie' || !!item.title
                const mediaType = item.media_type || (isMovie ? 'movie' : 'tv')
                const href = `/details/${mediaType}/${item.id}`
                const title = isMovie ? item.title : item.name
                const year = (isMovie ? item.release_date : item.first_air_date)?.slice(0, 4)
                const posterPath = item.poster_path || item.backdrop_path

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

                      {/* Overlay Gradiente Amarillo en Hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                      {/* Badge Tipo */}
                      <div className="hidden sm:block absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-bold uppercase tracking-wider text-white/80 shadow-lg">
                        {isMovie ? 'Cine' : 'TV'}
                      </div>

                      {/* Info Bottom */}
                      <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3 transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                        <h3 className="text-white font-bold text-[10px] sm:text-xs leading-tight line-clamp-2 drop-shadow-md group-hover:text-yellow-400 transition-colors">
                          {title}
                        </h3>
                        {year && (
                          <p className="text-zinc-400 text-[9px] sm:text-[10px] font-medium mt-0.5 hidden sm:block">
                            {year}
                          </p>
                        )}
                      </div>

                      {/* Rating Flotante */}
                      {item.vote_average > 0 && (
                        <div className="absolute top-1 left-1 sm:top-2 sm:left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/10 shadow-sm">
                          <span className="text-yellow-400 text-[9px] sm:text-[10px] font-black">
                            {item.vote_average.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}