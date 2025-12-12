'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { fetchFavoritesForUser, getExternalIds } from '@/lib/api/tmdb'
import { fetchOmdbByImdb } from '@/lib/api/omdb'
import { Loader2, Heart, FilmIcon, TvIcon } from 'lucide-react'

// ================== Posters "best EN" (Favoritas/Pendientes) ==================
const posterChoiceCache = new Map() // key -> file_path|null
const posterInFlight = new Map() // key -> Promise

function buildImg(path, size = 'w500') {
  return `https://image.tmdb.org/t/p/${size}${path}`
}

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false)
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = src
  })
}

function getPosterPreference(type, id) {
  if (typeof window === 'undefined') return null
  const key =
    type === 'tv'
      ? `showverse:tv:${id}:poster`
      : `showverse:movie:${id}:poster`
  return window.localStorage.getItem(key) || null
}

function pickBestPosterEN(posters) {
  if (!Array.isArray(posters) || posters.length === 0) return null

  // 1) Máximo vote_count (prioridad absoluta)
  const maxVotes = posters.reduce((max, p) => {
    const vc = p.vote_count || 0
    return vc > max ? vc : max
  }, 0)

  const withMaxVotes = posters.filter((p) => (p.vote_count || 0) === maxVotes)
  if (!withMaxVotes.length) return null

  const preferredLangs = new Set(['en', 'en-US'])

  // 2) Dentro del grupo de más votos: preferimos EN
  const enGroup = withMaxVotes.filter(
    (p) => p.iso_639_1 && preferredLangs.has(p.iso_639_1)
  )

  // 3) Si no hay EN, aceptamos sin idioma (null) antes que otros idiomas
  const nullLang = withMaxVotes.filter((p) => p.iso_639_1 === null)

  const candidates = enGroup.length
    ? enGroup
    : nullLang.length
      ? nullLang
      : withMaxVotes

  // 4) Orden final: vote_average desc, resolución (width) desc
  const sorted = [...candidates].sort((a, b) => {
    const va = (b.vote_average || 0) - (a.vote_average || 0)
    if (va !== 0) return va
    return (b.width || 0) - (a.width || 0)
  })

  return sorted[0] || null
}

async function fetchBestPosterEN(type, id) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!apiKey || !type || !id) return null

  try {
    const url =
      `https://api.themoviedb.org/3/${type}/${id}/images` +
      `?api_key=${apiKey}` +
      `&include_image_language=en,en-US,null`

    const r = await fetch(url, { cache: 'force-cache' })
    if (!r.ok) return null
    const j = await r.json()
    const posters = Array.isArray(j?.posters) ? j.posters : []
    return pickBestPosterEN(posters)?.file_path || null
  } catch {
    return null
  }
}

async function getBestPosterCached(type, id) {
  const key = `${type}:${id}`
  if (posterChoiceCache.has(key)) return posterChoiceCache.get(key)

  if (posterInFlight.has(key)) return posterInFlight.get(key)

  const p = (async () => {
    const chosen = await fetchBestPosterEN(type, id)
    posterChoiceCache.set(key, chosen || null)
    posterInFlight.delete(key)
    return chosen || null
  })()

  posterInFlight.set(key, p)
  return p
}

function SmartPoster({ item, title }) {
  const [src, setSrc] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let abort = false

    const load = async () => {
      setReady(false)

      const type = item.media_type || (item.title ? 'movie' : 'tv')

      // 0) Preferencia del usuario (si existe)
      const pref = getPosterPreference(type, item.id)
      if (pref) {
        const url = buildImg(pref, 'w500')
        await preloadImage(url)
        if (!abort) {
          setSrc(url)
          setReady(true)
        }
        return
      }

      // 1) Mejor EN (votos/calidad/resolución) cacheado
      const best = await getBestPosterCached(type, item.id)

      // 2) Fallbacks
      const fallbackPath = best || item.poster_path || item.backdrop_path || null
      const url = fallbackPath ? buildImg(fallbackPath, 'w500') : null
      if (url) await preloadImage(url)

      if (!abort) {
        setSrc(url)
        setReady(!!url)
      }
    }

    load()
    return () => {
      abort = true
    }
  }, [item])

  if (!ready || !src) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-neutral-600 p-4 text-center bg-neutral-800">
        <FilmIcon className="w-12 h-12 mb-2 opacity-50" />
        <span className="text-sm font-medium">{title}</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={title}
      loading="lazy"
      decoding="async"
      className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
    />
  )
}
// ======================================================================

// --- Helper para enriquecer con IMDb ---
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
          const mediaType = item.media_type || (item.title ? 'movie' : 'tv')
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

export default function FavoritesPage() {
  const { session, account } = useAuth()

  // 'checking' | 'anonymous' | 'authenticated'
  const [authStatus, setAuthStatus] = useState('checking')

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true) // carga de favoritas
  const [error, setError] = useState(null)

  const [typeFilter, setTypeFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('')
  const [sortBy, setSortBy] = useState('rating_desc')

  const [imdbLoaded, setImdbLoaded] = useState(false)

  // === Estado de autenticación (sin parpadeos) ===
  useEffect(() => {
    if (session && account?.id) {
      setAuthStatus('authenticated')
    } else if (session === null || account === null) {
      // El contexto ya sabe que NO hay sesión
      setAuthStatus('anonymous')
    }
    // Mientras tanto seguimos en 'checking'
  }, [session, account])

  // === Carga inicial de favoritas (solo si autenticado) ===
  useEffect(() => {
    let cancelled = false

    if (authStatus === 'checking') return

    if (authStatus === 'anonymous') {
      setItems([])
      setLoading(false)
      setError(null)
      return
    }

    // authStatus === 'authenticated'
    const load = async () => {
      if (!session || !account?.id) return

      setLoading(true)
      setError(null)

      try {
        const data = await fetchFavoritesForUser(account.id, session)
        if (cancelled) return
        const baseItems = Array.isArray(data) ? data : []
        setItems(baseItems)
        setImdbLoaded(false)
      } catch (err) {
        if (cancelled) return
        console.error(err)
        setItems([])
        setError(
          'No se han podido cargar tus favoritas. Inténtalo de nuevo más tarde.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [authStatus, session, account])

  // === Enriquecer IMDb en segundo plano ===
  useEffect(() => {
    if (authStatus !== 'authenticated') return
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
  }, [authStatus, items, session, account, imdbLoaded])

  // === Lista filtrada/ordenada ===
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

  // === 1) Usuario anónimo (solo cuando YA sabemos que no hay sesión) ===
  if (authStatus === 'anonymous') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Heart className="w-16 h-16 text-neutral-700 mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">Favoritas</h1>
        <p className="text-neutral-400 max-w-md">
          Inicia sesión para acceder a tu colección personal de películas y
          series favoritas.
        </p>
        <Link
          href="/login"
          className="mt-6 px-6 py-2 bg-white text-black rounded-full font-bold hover:bg-neutral-200 transition-colors"
        >
          Iniciar Sesión
        </Link>
      </div>
    )
  }

  // === 2) Usuario autenticado o auth todavía resolviéndose ===
  const isInitialLoading = authStatus === 'checking' || loading

  return (
    <div className="min-h-screen bg-[#101010] text-gray-100 font-sans">
      <div className="max-w-[1600px] mx-auto px-4 py-12">
        {/* Cabecera + Filtros */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-500/10 rounded-full">
              <Heart className="w-6 h-6 text-red-500 fill-current" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Favoritas</h1>
              <p className="text-sm text-neutral-400">
                {items.length} títulos guardados
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro Tipo */}
            <div className="bg-neutral-900 border border-neutral-800 p-1 rounded-lg flex gap-1">
              {['all', 'movie', 'tv'].map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${typeFilter === type
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                >
                  {type === 'all'
                    ? 'Todo'
                    : type === 'movie'
                      ? 'Películas'
                      : 'Series'}
                </button>
              ))}
            </div>

            {/* Filtro Año */}
            <input
              type="number"
              placeholder="Año..."
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="h-10 w-24 px-3 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600 transition-colors"
            />

            {/* Ordenar Por */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-10 pl-3 pr-8 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-neutral-600 appearance-none cursor-pointer min-w-[140px] transition-colors"
              >
                <option value="rating_desc">Más valoradas</option>
                <option value="rating_asc">Menos valoradas</option>
                <option value="year_desc">Más recientes</option>
                <option value="year_asc">Más antiguas</option>
                <option value="title_asc">A - Z</option>
                <option value="title_desc">Z - A</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Contenido / Grid / Estados */}
        {isInitialLoading ? (
          <div className="flex items-center justify-center py-20 min-h-[50vh] gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-yellow-500" />
            <span className="text-neutral-300 text-lg">
              Cargando tu colección...
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-red-700 rounded-xl bg-red-950/20">
            <FilmIcon className="w-12 h-12 text-red-500 mb-3" />
            <p className="text-red-400 text-lg mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-4 py-2 text-sm font-semibold rounded-full bg-red-500 text-white hover:bg-red-400 transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : processedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-neutral-800 rounded-xl bg-neutral-900/20">
            <FilmIcon className="w-12 h-12 text-neutral-600 mb-3" />
            <p className="text-neutral-400 text-lg">
              No se encontraron resultados con estos filtros.
            </p>
            <button
              onClick={() => {
                setTypeFilter('all')
                setYearFilter('')
                setSortBy('rating_desc')
              }}
              className="mt-4 text-sm text-yellow-500 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {processedItems.map((item) => {
              const isMovie = item.media_type === 'movie'
              const href = `/details/${item.media_type || (isMovie ? 'movie' : 'tv')}/${item.id}`
              const title = isMovie ? item.title : item.name

              return (
                <Link
                  key={`${item.media_type}-${item.id}`}
                  href={href}
                  className="group block relative"
                  title={title}
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900 shadow-xl group-hover:shadow-emerald-900/30 group-hover:shadow-2xl transition-all duration-500 ease-out group-hover:-translate-y-2 z-0 border border-white/5 group-hover:border-white/20">
                    {/* Imagen (BEST EN + votos/calidad/resolución) */}
                    <SmartPoster item={item} title={title} />

                    {/* Overlay sutil */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    {/* Badge Tipo */}
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider text-white/90 border border-white/10 shadow-lg z-10">
                      {isMovie ? (
                        <FilmIcon className="w-3 h-3" />
                      ) : (
                        <TvIcon className="w-3 h-3" />
                      )}
                    </div>

                    {/* Badges TMDb / IMDb */}
                    <div className="absolute bottom-2 right-2 flex flex-row-reverse items-center gap-1 transform-gpu opacity-0 translate-y-2 translate-x-2 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all duration-300 ease-out z-10">
                      {/* TMDb */}
                      {item.vote_average > 0 && (
                        <div className="bg-black/85 backdrop-blur-md px-2 py-1 rounded-full border border-emerald-500/60 flex items-center gap-1.5 shadow-xl transform-gpu scale-95 translate-y-1 transition-all duration-300 delay-75 group-hover:scale-110 group-hover:translate-y-0">
                          <img
                            src="/logo-TMDb.png"
                            alt="TMDb"
                            className="w-auto h-3"
                          />
                          <span className="text-emerald-400 text-[10px] font-bold font-mono">
                            {item.vote_average.toFixed(1)}
                          </span>
                        </div>
                      )}

                      {/* IMDb */}
                      {item.imdbRating > 0 && (
                        <div className="bg-black/85 backdrop-blur-md px-2 py-1 rounded-full border border-yellow-500/60 flex items-center gap-1.5 shadow-xl transform-gpu scale-95 translate-y-1 transition-all duration-300 delay-150 group-hover:scale-110 group-hover:translate-y-0">
                          <img
                            src="/logo-IMDb.png"
                            alt="IMDb"
                            className="w-auto h-3"
                          />
                          <span className="text-yellow-400 text-[10px] font-bold font-mono">
                            {item.imdbRating.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
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
