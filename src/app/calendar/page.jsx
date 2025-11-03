'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { ImageOff } from 'lucide-react'

import { getMoviesByDate } from '@/lib/api/calendar'

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedMovies, setSelectedMovies] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedDate) return

    const fetchMovies = async () => {
      setLoading(true)
      const movies = await getMoviesByDate(selectedDate)
      setSelectedMovies(movies)
      setLoading(false)
    }

    fetchMovies()
  }, [selectedDate])

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden text-white bg-black">
        {/* Calendario fijo ajustado */}
        <div className="w-[350px] h-full flex flex-col justify-start px-6 pt-8 bg-[#111] border-r border-gray-800 flex-shrink-0">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            📅 Calendario de Estrenos
        </h2>

        <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            locale={es}
            className="!text-white [&_.rdp-day]:rounded-full [&_.rdp-day]:w-10 [&_.rdp-day]:h-10 
                    [&_.rdp-day_selected]:bg-blue-600 [&_.rdp-day_selected]:text-white 
                    [&_.rdp-day_today]:border [&_.rdp-day_today]:border-yellow-400 
                    [&_.rdp-day:hover]:bg-gray-700 [&_.rdp-caption_label]:text-white [&_.rdp]:space-y-4"
        />

        <p className="mt-6 text-sm text-gray-400 leading-tight">
            Selecciona una fecha para ver los estrenos.
        </p>
        </div>

      {/* Galería con scroll */}
      <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <h2 className="text-2xl font-bold mb-6">
          Estrenos del {format(selectedDate, 'd/M/yyyy')}
        </h2>

        {selectedMovies.length === 0 ? (
          <p className="text-gray-500">No hay estrenos registrados para este día.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8 gap-4">
            {selectedMovies.map((movie) => (
              <a
                key={movie.id}
                href={`/details/movie/${movie.id}`}
                className="block rounded-lg overflow-hidden hover:opacity-90 transition"
              >
                {movie.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`}
                    alt={movie.title}
                    className="w-full h-[400px] object-cover rounded-lg"
                  />
                ) : (
                  <div className="w-full h-[400px] bg-gray-800 flex items-center justify-center rounded-lg text-gray-500">
                    <ImageOff size={64} />
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
