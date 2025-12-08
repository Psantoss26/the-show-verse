'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { fetchWatchlistForUser, getExternalIds } from '@/lib/api/tmdb'
import { fetchOmdbByImdb } from '@/lib/api/omdb'
import {
  Loader2,
  Bookmark,
  FilmIcon,
  TvIcon,
} from 'lucide-react'

/**
 * Enriquecer items con IMDb en segundo plano
 * (no bloquea el primer render).
 */
async function enrichItemsWithImdb(items, batchSize = 6) {
  if (!Array.isArray(items) || items.length === 0) return items

  const imdbCache = new Map()
  const result = [...items]

  for (let i = 0; i < result.length; i += batchSize) {
    const slice = result.slice(i, i + batchSize)

    await Promise.all(
      slice.map(async (item, idx) => {
        const index = i + idx
        if (typeof item.imdbRating === 'number') return

        let imdbRating = null
        try {
          const mediaType =
            item.media_type || (item.title ? 'movie' : 'tv')

          const ext = await getExternalIds(mediaType, item.id)
          const imdbId = ext?.imdb_id
          if (!imdbId) {
            result[index] = { ...item, imdbRating: null }
            return
          }

          if (imdbCache.has(imdbId)) {
            imdbRating = imdbCache.get(imdbId)
          } else {
            const omdb = await fetchOmdbByImdb(imdbId)
            const raw = omdb?.imdbRating
            if (raw && raw !== 'N/A' && !Number.isNaN(Number(raw))) {
              imdbRating = Number(raw)
            } else {
              imdbRating = null
            }
            imdbCache.set(imdbId, imdbRating)
          }
        } catch {
          imdbRating = null
        }

        result[index] = { ...item, imdbRating }
      })
    )
  }

  return result
}

export default function WatchlistPage() {
  const { session, account } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const [typeFilter, setTypeFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('')
  const [sortBy, setSortBy] = useState('rating_desc')

  const [imdbLoaded, setImdbLoaded] = useState(false)

  // 1) Carga rápida desde TMDb
  useEffect(() => {
    const load = async () => {
      if (!session || !account?.id) {
        setLoading(false)
        return
      }
      try {
        const data = await fetchWatchlistForUser(account.id, session)
        const baseItems = Array.isArray(data) ? data : []
        setItems(baseItems)
        setImdbLoaded(false)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [session, account])

  // 2) Enriquecer con IMDb en segundo plano
  useEffect(() => {
    if (!session || !account?.id) return
    if (!items.length) return
    if (imdbLoaded) return

    let cancelled = false

    const run = async () => {
      try {
        const enriched = await enrichItemsWithImdb(items)
        if (!cancelled) {
          setItems(enriched)
          setImdbLoaded(true)
        }
      } catch {
        if (!cancelled) setImdbLoaded(true)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [items, session, account, imdbLoaded])

  const processedItems = useMemo(() => {
    let list = [...items]

    if (typeFilter !== 'all') {
      list = list.filter((item) => item.media_type === typeFilter)
    }

    if (yearFilter.trim()) {
      list = list.filter((item) => {
        const isMovie = item.media_type === 'movie'
        const date = isMovie ? item.release_date : item.first_air_date
        if (!date) return false
        return date.slice(0, 4) === yearFilter.trim()
      })
    }

    list.sort((a, b) => {
      const isMovieA = a.media_type === 'movie'
      const isMovieB = b.media_type === 'movie'
      const dateA = isMovieA ? a.release_date : a.first_air_date
      const dateB = isMovieB ? b.release_date : b.first_air_date
      const yearA = dateA ? parseInt(dateA.slice(0, 4)) : 0
      const yearB = dateB ? parseInt(dateB.slice(0, 4)) : 0
      const ratingA = typeof a.vote_average === 'number' ? a.vote_average : 0
      const ratingB = typeof b.vote_average === 'number' ? b.vote_average : 0
      const titleA = (isMovieA ? a.title : a.name || '').toLowerCase()
      const titleB = (isMovieB ? b.title : b.name || '').toLowerCase()

      switch (sortBy) {
        case 'year_desc':
          return yearB - yearA
        case 'year_asc':
          return yearA - yearB
        case 'rating_desc':
          return ratingB - ratingA
        case 'rating_asc':
          return ratingA - ratingB
        case 'title_desc':
          return titleB.localeCompare(titleA)
        case 'title_asc':
        default:
          return titleA.localeCompare(titleB)
      }
    })

    return list
  }, [items, typeFilter, yearFilter, sortBy])

  if (!session || !account?.id) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-4">Pendientes</h1>
        <p className="text-neutral-400">
          Inicia sesión en TMDb para ver tu lista de películas y series
          pendientes.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 flex items-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Cargando tu lista de pendientes...</span>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Cabecera + filtros */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-blue-400" />
          <h1 className="text-2xl font-bold">
            Pendientes
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          {/* Tipo */}
          <div className="h-9 flex gap-1 bg-neutral-900/70 border border-neutral-700 rounded-2xl p-1">
            <button
              className={`px-3 py-1 rounded-2xl ${typeFilter === 'all'
                ? 'bg-neutral-100 text-black'
                : 'text-neutral-300'
                }`}
              onClick={() => setTypeFilter('all')}
            >
              Todo
            </button>
            <button
              className={`px-3 py-1 rounded-2xl flex items-center gap-1 ${typeFilter === 'movie'
                ? 'bg-neutral-100 text-black'
                : 'text-neutral-300'
                }`}
              onClick={() => setTypeFilter('movie')}
            >
              <FilmIcon className="w-3 h-3" />
              Pelis
            </button>
            <button
              className={`px-3 py-1 rounded-2xl flex items-center gap-1 ${typeFilter === 'tv'
                ? 'bg-neutral-100 text-black'
                : 'text-neutral-300'
                }`}
              onClick={() => setTypeFilter('tv')}
            >
              <TvIcon className="w-3 h-3" />
              Series
            </button>
          </div>

          {/* Año */}
          <input
            type="number"
            inputMode="numeric"
            pattern="\d*"
            placeholder="Año"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="h-9 w-20 px-2.5 py-1 bg-neutral-900 border border-neutral-700 rounded-2xl text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {/* Orden */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="h-9 px-3 bg-neutral-900 border border-neutral-700 rounded-2xl text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="rating_desc">Puntuación ↓</option>
            <option value="rating_asc">Puntuación ↑</option>
            <option value="year_desc">Año ↓</option>
            <option value="year_asc">Año ↑</option>
            <option value="title_asc">Nombre A-Z</option>
            <option value="title_desc">Nombre Z-A</option>
          </select>
        </div>
      </div>

      {processedItems.length === 0 ? (
        <p className="text-neutral-400">
          No hay resultados con los filtros actuales.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {processedItems.map((item) => {
            const isMovie = item.media_type === 'movie'
            const href = `/details/${item.media_type || (isMovie ? 'movie' : 'tv')}/${item.id}`
            const title = isMovie ? item.title : item.name
            const date = isMovie ? item.release_date : item.first_air_date

            const imagePath =
              item.poster_path || item.backdrop_path || item.profile_path

            const tmdbRating =
              typeof item.vote_average === 'number' && item.vote_average > 0
                ? item.vote_average.toFixed(1)
                : '–'

            const imdbRating =
              typeof item.imdbRating === 'number' && item.imdbRating > 0
                ? item.imdbRating.toFixed(1)
                : '–'

            return (
              <Link
                key={`${item.media_type}-${item.id}`}
                href={href}
                className="group block"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-3xl bg-neutral-900 mb-2">
                  {imagePath ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w342${imagePath}`}
                      alt={title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-500">
                      Sin imagen
                    </div>
                  )}

                  {/* Peli / Serie icono */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/75 px-2 py-0.5 rounded-full text-[10px] uppercase">
                    {isMovie ? (
                      <FilmIcon className="w-3 h-4" />
                    ) : (
                      <TvIcon className="w-3 h-4" />
                    )}
                  </div>

                  {/* TMDb + IMDb: aparecen sólo al hacer hover, animando desde la derecha */}
                  <div
                    className="
                      pointer-events-none
                      absolute bottom-2 right-2
                      flex flex-col items-end gap-1
                      opacity-0 translate-x-4
                      transition-all duration-300
                      group-hover:opacity-100 group-hover:translate-x-0
                      group-focus-within:opacity-100 group-focus-within:translate-x-0
                    "
                  >
                    <div className="flex items-center gap-1 bg-black/85 px-2 py-0.5 rounded-full text-[10px]">
                      <img
                        src="/logo-TMDb.png"
                        alt="TMDb"
                        className="h-3 w-auto rounded-[2px]"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="text-neutral-50 font-medium">
                        {tmdbRating}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 bg-black/85 px-2 py-0.5 rounded-full text-[10px]">
                      <img
                        src="/logo-IMDb.png"
                        alt="IMDb"
                        className="h-3 w-auto"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="text-neutral-50 font-medium">
                        {imdbRating}
                      </span>
                    </div>
                  </div>
                </div>

                <h3 className="text-sm font-semibold line-clamp-2">
                  {title}
                </h3>
                {date && (
                  <p className="text-xs text-neutral-400">
                    {date.slice(0, 4)}
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
