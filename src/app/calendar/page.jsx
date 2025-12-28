'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { format, isToday, addMonths, subMonths, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ImageOff,
  Loader2,
  CalendarDays, // Icono diferente para calendario
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
      src={`https://image.tmdb.org/t/p/w500${path}`}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

function DateSelector({ selected, onSelect, currentMonth, onMonthChange }) {
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
    <div ref={ref} className="relative z-50">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 px-5 py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl text-white shadow-lg shadow-blue-900/20 transition-all group"
      >
        <CalendarIcon className="w-5 h-5 text-white/80" />
        <span className="text-sm font-bold capitalize">
          {format(selected, "d 'de' MMMM, yyyy", { locale: es })}
        </span>
        <ChevronDown className={`w-4 h-4 text-white/70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 -translate-x-1/2 mt-4 p-4 bg-[#161616] border border-white/10 rounded-3xl shadow-2xl z-50"
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
                head_cell: "text-zinc-500 rounded-md w-9 font-normal text-[0.8rem] uppercase",
                row: "flex w-full mt-1",
                cell: "text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                day: "h-9 w-9 p-0 font-normal hover:bg-white/10 rounded-full transition-colors text-zinc-300 hover:text-white",
                day_selected: "!bg-blue-600 !text-white hover:!bg-blue-500 font-bold shadow-md shadow-blue-500/20",
                day_today: "text-blue-400 font-bold border border-blue-500/30",
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
  // Estado extra para controlar el mes visible del calendario independientemente de la selección
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const [selectedMovies, setSelectedMovies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Sincronizar el mes visual cuando se selecciona una fecha lejana
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

  // Handlers para navegación
  const goPrevDay = () => setSelectedDate(prev => subDays(prev, 1))
  const goNextDay = () => setSelectedDate(prev => addDays(prev, 1))

  const goPrevMonth = () => {
    const newDate = subMonths(selectedDate, 1)
    setSelectedDate(newDate)
  }
  const goNextMonth = () => {
    const newDate = addMonths(selectedDate, 1)
    setSelectedDate(newDate)
  }

  return (
    // Cambio de color de selección a blue-500
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans selection:bg-blue-500/30 pb-20">

      {/* Fondo ambiental AZUL */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[10%] w-[700px] h-[700px] bg-blue-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-cyan-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">

        {/* Header Section */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-blue-500/10 rounded-3xl border border-blue-500/20">
              <CalendarDays className="w-10 h-10 text-blue-500" />
            </div>
            <div>
              <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                Calendario
              </h1>
              <p className="text-zinc-400 mt-2 font-medium text-base">
                Estrenos de Cine y Televisión
              </p>
            </div>
          </div>

          {/* --- CONTROLES DE NAVEGACIÓN (SIN FONDO NI BORDE EXTRA) --- */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">

            {/* Navegación Meses */}
            <div className="flex items-center gap-1">
              <button
                onClick={goPrevMonth}
                className="p-3 rounded-2xl text-zinc-500 hover:text-white hover:bg-white/5 transition"
                title="Mes anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">Mes</span>
              <button
                onClick={goNextMonth}
                className="p-3 rounded-2xl text-zinc-500 hover:text-white hover:bg-white/5 transition"
                title="Mes siguiente"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Separador sutil */}
            <div className="h-8 w-[1px] bg-white/10 hidden sm:block" />

            {/* Navegación Días + Selector */}
            <div className="flex items-center gap-3">
              <button
                onClick={goPrevDay}
                className="p-3 rounded-2xl bg-zinc-900/50 border border-white/5 text-zinc-300 hover:text-white hover:border-white/20 transition shadow-lg"
                title="Día anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <DateSelector
                selected={selectedDate}
                onSelect={setSelectedDate}
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
              />

              <button
                onClick={goNextDay}
                className="p-3 rounded-2xl bg-zinc-900/50 border border-white/5 text-zinc-300 hover:text-white hover:border-white/20 transition shadow-lg"
                title="Día siguiente"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {!isTodaySelected && (
              <button
                onClick={() => setSelectedDate(new Date())}
                className="ml-auto sm:ml-0 px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white font-bold text-sm transition border border-white/5"
              >
                Volver a Hoy
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
            <span className="text-zinc-500 text-sm font-medium animate-pulse">
              Consultando fecha...
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-red-900/30 rounded-3xl bg-red-900/5">
            <ImageOff className="w-16 h-16 text-red-500/50 mb-4" />
            <h3 className="text-xl font-bold text-red-200">{error}</h3>
            <p className="text-red-400/60 mt-2 text-sm">Inténtalo de nuevo más tarde.</p>
          </div>
        ) : selectedMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20">
            <div className="w-24 h-24 bg-zinc-900/50 rounded-full flex items-center justify-center mb-6 border border-zinc-800/50">
              <CalendarIcon className="w-10 h-10 text-zinc-600" />
            </div>
            <h3 className="text-2xl font-bold text-zinc-300">Día tranquilo</h3>
            <p className="text-zinc-500 mt-2 max-w-md">
              No hay grandes estrenos registrados para el <span className="text-blue-400 font-bold">{format(selectedDate, "d 'de' MMMM", { locale: es })}</span>.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-8 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-blue-500/50 to-transparent" />
              <span className="text-blue-400 font-bold text-sm tracking-widest uppercase">
                {selectedMovies.length} Lanzamientos
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
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
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-zinc-900 shadow-lg ring-1 ring-white/5 transition-all duration-500 group-hover:shadow-[0_0_30px_rgba(37,99,235,0.2)] group-hover:scale-[1.03] z-0 group-hover:z-10">
                      <TmdbPoster
                        path={posterPath}
                        alt={title}
                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                      />

                      {/* Overlay Gradiente Azulado en Hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                      {/* Badge Tipo */}
                      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white/90 shadow-lg">
                        {isMovie ? 'Película' : 'Serie'}
                      </div>

                      {/* Info Bottom (Slide Up Effect) */}
                      <div className="absolute bottom-0 left-0 right-0 p-5 transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                        <h3 className="text-white font-bold text-sm leading-tight line-clamp-2 drop-shadow-md group-hover:text-blue-400 transition-colors">
                          {title}
                        </h3>
                        {year && (
                          <p className="text-zinc-400 text-xs font-medium mt-1">
                            {year}
                          </p>
                        )}
                      </div>

                      {/* Rating Flotante */}
                      {item.vote_average > 0 && (
                        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 shadow-lg">
                          <span className="text-blue-400 text-xs font-black">
                            {item.vote_average.toFixed(1)}
                          </span>
                          <img src="/logo-TMDb.png" alt="TMDb" className="h-2.5 w-auto opacity-80" />
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