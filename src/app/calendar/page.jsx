// src/app/calendar/page.jsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { ImageOff, Loader2, FilmIcon, TvIcon } from 'lucide-react'

import { getMoviesByDate } from '@/lib/api/calendar'

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedMovies, setSelectedMovies] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!selectedDate) return

    const fetchMovies = async () => {
      try {
        setLoading(true)
        setError(null)
        const movies = await getMoviesByDate(selectedDate)
        setSelectedMovies(Array.isArray(movies) ? movies : [])
      } catch (err) {
        console.error('Error al cargar estrenos para esta fecha:', err)
        setSelectedMovies([])
        setError('No se han podido cargar los estrenos para esta fecha.')
      } finally {
        setLoading(false)
      }
    }

    fetchMovies()
  }, [selectedDate])

  const titleDate = format(selectedDate, "d 'de' MMMM yyyy", { locale: es })
  const isTodaySelected = isToday(selectedDate)

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden text-white bg-black">
      {/* COLUMNA IZQUIERDA: CALENDARIO */}
      <div className="w-[350px] h-full flex flex-col justify-start px-6 pt-8 bg-[#111] border-r border-gray-800 flex-shrink-0">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          📅 Calendario de Estrenos
        </h2>
        <p className="text-xs text-neutral-400 mb-4 max-w-[260px]">
          Consulta qué películas y series se estrenan cada día.
        </p>

        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          locale={es}
          showOutsideDays
          // 👇 MISMO DISEÑO QUE TENÍAS, SOLO CLASES
          className="
            rdp
            !text-white
            [&_.rdp-day]:rounded-full
            [&_.rdp-day]:w-10
            [&_.rdp-day]:h-10
            [&_.rdp-day_selected]:bg-blue-600
            [&_.rdp-day_selected]:text-white
            [&_.rdp-day_today]:border
            [&_.rdp-day_today]:border-yellow-400
            [&_.rdp-day:not(.rdp-day_selected)]:hover:bg-gray-700
            [&_.rdp-caption_label]:text-white
            space-y-4
          "
          // 👇 AQUÍ FORZAMOS QUE LAS SEMANAS SEAN 7 COLUMNAS
          styles={{
            table: {
              width: '100%',
            },
            head_row: {
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            },
            row: {
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            },
            cell: {
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '4px 0',
            },
          }}
        />

        <p className="mt-6 text-sm text-gray-400 leading-tight">
          Selecciona una fecha del calendario para ver los estrenos
          programados ese día.
        </p>
      </div>

      {/* COLUMNA DERECHA: ESTRENOS DEL DÍA */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
              Estrenos
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-white mt-1">
              {isTodaySelected ? 'Hoy' : 'Día seleccionado'} ·{' '}
              <span className="text-neutral-300">{titleDate}</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-2">
              {selectedMovies.length > 0
                ? `${selectedMovies.length} título${selectedMovies.length === 1 ? '' : 's'
                } programado${selectedMovies.length === 1 ? '' : 's'
                } para este día.`
                : 'No hay estrenos registrados para esta fecha.'}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-neutral-300">
            <Loader2 className="w-7 h-7 animate-spin text-yellow-500" />
            <span className="text-sm">
              Cargando estrenos para{' '}
              <span className="font-semibold">{titleDate}</span>...
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-red-700 rounded-xl bg-red-950/20">
            <ImageOff className="w-12 h-12 text-red-500 mb-3" />
            <p className="text-red-400 text-lg mb-2">{error}</p>
            <p className="text-sm text-red-200/70 max-w-md">
              Puede ser un problema temporal con la API. Inténtalo de nuevo en unos minutos.
            </p>
          </div>
        ) : selectedMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-neutral-800 rounded-xl bg-neutral-900/20">
            <ImageOff className="w-12 h-12 text-neutral-600 mb-3" />
            <p className="text-neutral-300 text-lg mb-2">
              No hay estrenos para esta fecha.
            </p>
            <p className="text-sm text-neutral-500 max-w-md">
              Prueba a moverte por el calendario para descubrir otros días con
              lanzamientos de cine y series.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-5 pb-6">
            {selectedMovies.map((item) => {
              const isMovie = item.media_type === 'movie' || !!item.title
              const mediaType = item.media_type || (isMovie ? 'movie' : 'tv')
              const href = `/details/${mediaType}/${item.id}`
              const title = isMovie ? item.title : item.name
              const date = isMovie ? item.release_date : item.first_air_date

              const imagePath = item.poster_path
                ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                : item.backdrop_path
                  ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}`
                  : null

              const rating =
                typeof item.vote_average === 'number' &&
                  item.vote_average > 0
                  ? item.vote_average.toFixed(1)
                  : null

              return (
                <Link
                  key={`${mediaType}-${item.id}-${date || ''}`}
                  href={href}
                  className="group block"
                  title={title}
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900 shadow-xl group-hover:shadow-emerald-900/30 group-hover:shadow-2xl transition-all duration-500 ease-out group-hover:-translate-y-2 border border-white/5 group-hover:border-white/20">
                    {imagePath ? (
                      <img
                        src={imagePath}
                        alt={title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-neutral-600 p-4 text-center bg-neutral-800">
                        <ImageOff className="w-10 h-10 mb-2 opacity-60" />
                        <span className="text-xs font-medium">
                          Sin imagen
                        </span>
                      </div>
                    )}

                    {/* overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    {/* tipo */}
                    <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-md px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider text-white/90 border border-white/10 shadow-lg z-10 flex items-center gap-1.5">
                      {isMovie ? (
                        <FilmIcon className="w-3 h-3" />
                      ) : (
                        <TvIcon className="w-3 h-3" />
                      )}
                      <span>{isMovie ? 'Película' : 'Serie'}</span>
                    </div>

                    {/* rating TMDb */}
                    {rating && (
                      <div className="absolute bottom-2 right-2 bg-black/85 backdrop-blur-md px-2 py-1 rounded-full border border-emerald-500/60 flex items-center gap-1.5 shadow-xl transform-gpu opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                        <img
                          src="/logo-TMDb.png"
                          alt="TMDb"
                          className="w-auto h-3"
                        />
                        <span className="text-emerald-400 text-[10px] font-bold font-mono">
                          {rating}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-2">
                    <h3 className="text-sm font-semibold text-white line-clamp-2">
                      {title}
                    </h3>
                    {date && (
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {date.slice(0, 4)}
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
