// /src/app/movies/page.jsx
'use client'

import { useRef, useEffect, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation } from 'swiper'
import { AnimatePresence, motion } from 'framer-motion'
import 'swiper/swiper-bundle.css'
import Link from 'next/link'
import { Anton } from 'next/font/google'
import {
  Heart,
  HeartOff,
  BookmarkPlus,
  BookmarkMinus,
  Loader2
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

import {
  fetchPopularMedia,
  fetchTopRatedIMDb,
  fetchMoviesByGenre,
  fetchMediaByKeyword,
  fetchMovieSections,
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getMovieDetails,
  getExternalIds
} from '@/lib/api/tmdb'

import { fetchOmdbByImdb } from '@/lib/api/omdb'

const anton = Anton({ weight: '400', subsets: ['latin'] })

/* --- Hook: detectar dispositivo táctil --- */
const useIsTouchDevice = () => {
  const [isTouch, setIsTouch] = useState(false)
  useEffect(() => {
    const onTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    setIsTouch(onTouch)
  }, [])
  return isTouch
}

/* --- Icons: IMDb + TMDb (inline SVG) --- */
const IMDbIcon = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 64 64"
    className={className}
    aria-label="IMDb"
    role="img"
  >
    <rect x="2" y="12" width="60" height="40" rx="6" fill="#F5C518" />
    <path
      d="M14 24h4v16h-4V24zm8 0h4v16h-4V24zm6 0h6c2.76 0 4 1.24 4 4v8c0 2.76-1.24 4-4 4h-6V24zm4 4v8h2c.67 0 1-.33 1-1v-6c0-.67-.33-1-1-1h-2zm12-4h4v16h-4V24z"
      fill="#000"
    />
  </svg>
)

const TMDbIcon = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 64 64"
    className={className}
    aria-label="TMDb"
    role="img"
  >
    <rect x="4" y="8" width="56" height="48" rx="10" fill="#01D277" />
    <path
      d="M18 24h-4v-4h12v4h-4v16h-4V24zm14-4h4l3 7 3-7h4v20h-4V28l-3 7h-2l-3-7v12h-4V20zm20 0h4v20h-4V20z"
      fill="#001A0F"
      opacity=".95"
    />
  </svg>
)

/* ---------- helpers ---------- */
const yearOf = (m) =>
  m?.release_date?.slice(0, 4) || m?.first_air_date?.slice(0, 4) || ''

const ratingOf = (m) =>
  typeof m?.vote_average === 'number' && m.vote_average > 0
    ? m.vote_average.toFixed(1)
    : '–'

const short = (t = '', n = 420) =>
  t.length > n ? t.slice(0, n - 1) + '…' : t

const formatRuntime = (mins) => {
  if (!mins || typeof mins !== 'number') return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h <= 0) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

const buildImg = (path, size = 'original') =>
  `https://image.tmdb.org/t/p/${size}${path}`

const MOVIE_GENRES = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Ciencia ficción',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'Bélica',
  37: 'Western'
}

/* ======== Curado de listas tipo Netflix/Prime ======== */
const sortByVotes = (list = []) =>
  [...list].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))

function curateList(
  list,
  { minVotes = 0, minRating = 0, minSize = 20, maxSize = 60 } = {}
) {
  if (!Array.isArray(list)) return []

  const sorted = sortByVotes(list)

  const applyFilter = (minV, minR) =>
    sorted.filter((m) => {
      const votes = m?.vote_count || 0
      const rating = typeof m?.vote_average === 'number' ? m.vote_average : 0
      return votes >= minV && rating >= minR
    })

  // 1) intento con filtro “fuerte”
  let current = applyFilter(minVotes, minRating)
  if (current.length >= minSize) return current.slice(0, maxSize)

  // 2) relajar filtros en varios pasos para asegurar tamaño mínimo
  const steps = [
    { factorV: 0.7, deltaR: -0.3 },
    { factorV: 0.5, deltaR: -0.6 },
    { factorV: 0.3, deltaR: -1.0 },
    { factorV: 0.1, deltaR: -1.5 }
  ]

  let mv = minVotes
  let mr = minRating

  for (const step of steps) {
    mv = Math.max(0, Math.round(mv * step.factorV))
    mr = Math.max(0, mr + step.deltaR)
    current = applyFilter(mv, mr)
    if (current.length >= minSize) return current.slice(0, maxSize)
  }

  // 3) fallback: top por votos sin filtro, asegurando mínimo
  if (sorted.length === 0) return []
  const size = Math.min(sorted.length, Math.max(minSize, maxSize))
  return sorted.slice(0, size)
}

/* ========= Backdrop preferido (ES -> EN) ========= */
async function fetchBackdropEsThenEn(movieId) {
  try {
    const url =
      `https://api.themoviedb.org/3/movie/${movieId}/images` +
      `?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}` +
      `&language=es-ES&include_image_language=es,es-ES,en,en-US`
    const r = await fetch(url, { cache: 'force-cache' })
    const j = await r.json()
    const backs = Array.isArray(j?.backdrops) ? j.backdrops : []

    const pickBest = (arr) => {
      if (!arr.length) return null
      const sorted = [...arr].sort((a, b) => {
        const vc = (b.vote_count || 0) - (a.vote_count || 0)
        if (vc !== 0) return vc
        const va = (b.vote_average || 0) - (a.vote_average || 0)
        if (va !== 0) return va
        return (b.width || 0) - (a.width || 0)
      })
      const topVote = sorted[0]?.vote_count || 0
      const topSet = sorted.filter((x) => (x.vote_count || 0) === topVote)
      topSet.sort((a, b) => (b.width || 0) - (a.width || 0))
      return topSet[0] || sorted[0]
    }

    const es = backs.filter(
      (b) => b.iso_639_1 === 'es' || b.iso_639_1 === 'es-ES'
    )
    const en = backs.filter(
      (b) => b.iso_639_1 === 'en' || b.iso_639_1 === 'en-US'
    )

    const bestES = pickBest(es)
    if (bestES?.file_path) return bestES.file_path

    const bestEN = pickBest(en)
    if (bestEN?.file_path) return bestEN.file_path

    return null
  } catch {
    return null
  }
}

/* ========= Poster preferido (ES -> EN) ========= */
async function fetchPosterEsThenEn(movieId) {
  try {
    const url =
      `https://api.themoviedb.org/3/movie/${movieId}/images` +
      `?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}` +
      `&language=es-ES&include_image_language=es,es-ES,en,en-US`
    const r = await fetch(url, { cache: 'force-cache' })
    const j = await r.json()
    const posters = Array.isArray(j?.posters) ? j.posters : []

    const pickBest = (arr) => {
      if (!arr.length) return null
      const sorted = [...arr].sort((a, b) => {
        const vc = (b.vote_count || 0) - (a.vote_count || 0)
        if (vc !== 0) return vc
        const va = (b.vote_average || 0) - (a.vote_average || 0)
        if (va !== 0) return va
        return (b.width || 0) - (a.width || 0)
      })
      const topVote = sorted[0]?.vote_count || 0
      const topSet = sorted.filter((x) => (x.vote_count || 0) === topVote)
      topSet.sort((a, b) => (b.width || 0) - (a.width || 0))
      return topSet[0] || sorted[0]
    }

    const es = posters.filter(
      (p) => p.iso_639_1 === 'es' || p.iso_639_1 === 'es-ES'
    )
    const en = posters.filter(
      (p) => p.iso_639_1 === 'en' || p.iso_639_1 === 'en-US'
    )

    const bestES = pickBest(es)
    if (bestES?.file_path) return bestES.file_path

    const bestEN = pickBest(en)
    if (bestEN?.file_path) return bestEN.file_path

    return null
  } catch {
    return null
  }
}

/* --------- Precargar imagen (resolve tras onload) --------- */
function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false)
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = src
  })
}

/* =================== CACHÉS COMPARTIDOS =================== */
const movieExtrasCache = new Map() // movie.id -> { runtime, awards, imdbRating }
const movieBackdropCache = new Map() // movie.id -> backdrop file_path

/* ======== Preferencias de artwork guardadas en localStorage ======== */
function getArtworkPreference(movieId) {
  if (typeof window === 'undefined') {
    return { poster: null, backdrop: null }
  }
  const posterKey = `showverse:movie:${movieId}:poster`
  const backdropKey = `showverse:movie:${movieId}:backdrop`
  const poster = window.localStorage.getItem(posterKey)
  const backdrop = window.localStorage.getItem(backdropKey)
  return {
    poster: poster || null,
    backdrop: backdrop || null
  }
}

/* ====================================================================
 * Portada normal (2:3), mismo alto que la vista previa
 * ==================================================================== */
function PosterImage({ movie, cache, heightClass }) {
  const [posterPath, setPosterPath] = useState(
    movie.poster_path || movie.backdrop_path || null
  )
  const [ready, setReady] = useState(!!posterPath)

  useEffect(() => {
    let abort = false

    const load = async () => {
      if (!movie) return

      // 1) Preferencia del usuario (poster o backdrop elegido en DetailsClient)
      const { poster: userPoster, backdrop: userBackdrop } =
        getArtworkPreference(movie.id)
      const userPreferred = userPoster || userBackdrop || null

      if (userPreferred) {
        const url = buildImg(userPreferred, 'w342')
        await preloadImage(url)
        if (!abort) {
          cache.current.set(movie.id, userPreferred)
          setPosterPath(userPreferred)
          setReady(true)
        }
        return
      }

      // 2) Cache en memoria
      const cached = cache.current.get(movie.id)
      if (cached) {
        const url = buildImg(cached, 'w342')
        await preloadImage(url)
        if (!abort) {
          setPosterPath(cached)
          setReady(true)
        }
        return
      }

      // 3) Lógica normal: mejor poster ES/EN
      setReady(false)
      const preferred = await fetchPosterEsThenEn(movie.id)
      const chosen = preferred || movie.poster_path || movie.backdrop_path || null
      const url = chosen ? buildImg(chosen, 'w342') : null
      await preloadImage(url)
      if (!abort) {
        cache.current.set(movie.id, chosen)
        setPosterPath(chosen)
        setReady(!!chosen)
      }
    }

    load()
    return () => {
      abort = true
    }
  }, [movie, cache])

  return (
    <>
      {!ready && (
        <div
          className={`w-full ${heightClass} rounded-3xl bg-neutral-800 animate-pulse`}
        />
      )}
      {ready && posterPath && (
        <img
          src={buildImg(posterPath, 'w342')}
          alt={movie.title || movie.name}
          className={`w-full ${heightClass} object-cover rounded-3xl`}
          loading="lazy"
          decoding="async"
        />
      )}
    </>
  )
}

/* ====================================================================
 * Vista previa inline tipo Amazon (backdrop horizontal)
 * ==================================================================== */
function InlinePreviewCard({ movie, heightClass }) {
  const { session, account } = useAuth()

  const [extras, setExtras] = useState({
    runtime: null,
    awards: null,
    imdbRating: null
  })
  const [backdropPath, setBackdropPath] = useState(null)
  const [backdropReady, setBackdropReady] = useState(false)

  const [loadingStates, setLoadingStates] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  // Estados de cuenta
  useEffect(() => {
    let cancel = false
    const load = async () => {
      if (!movie || !session || !account?.id) {
        setFavorite(false)
        setWatchlist(false)
        return
      }
      try {
        setLoadingStates(true)
        const type = movie.media_type || 'movie'
        const st = await getMediaAccountStates(type, movie.id, session)
        if (!cancel) {
          setFavorite(!!st.favorite)
          setWatchlist(!!st.watchlist)
        }
      } catch {
        // silencio
      } finally {
        if (!cancel) setLoadingStates(false)
      }
    }
    load()
    return () => {
      cancel = true
    }
  }, [movie, session, account])

  // Backdrop + extras con caché y preferencia de usuario
  useEffect(() => {
    let abort = false
    if (!movie) return

    const loadAll = async () => {
      // 1) Backdrop preferido por el usuario (o incluso poster)
      const { poster: userPoster, backdrop: userBackdrop } =
        getArtworkPreference(movie.id)
      const userPreferredBackdrop = userBackdrop || userPoster || null

      if (userPreferredBackdrop) {
        movieBackdropCache.set(movie.id, userPreferredBackdrop)
        const url = buildImg(userPreferredBackdrop, 'w1280')
        await preloadImage(url)
        if (!abort) {
          setBackdropPath(userPreferredBackdrop)
          setBackdropReady(true)
        }
      } else {
        // 2) Backdrop desde caché o TMDb
        const cachedBackdrop = movieBackdropCache.get(movie.id)
        if (cachedBackdrop !== undefined) {
          if (!abort) {
            setBackdropPath(cachedBackdrop)
            if (cachedBackdrop) {
              const url = buildImg(cachedBackdrop, 'w1280')
              await preloadImage(url)
              if (!abort) setBackdropReady(true)
            } else {
              setBackdropReady(false)
            }
          }
        } else {
          try {
            const preferred = await fetchBackdropEsThenEn(movie.id)
            const chosen = preferred || movie.backdrop_path || null
            movieBackdropCache.set(movie.id, chosen)
            if (chosen) {
              const url = buildImg(chosen, 'w1280')
              await preloadImage(url)
              if (!abort) {
                setBackdropPath(chosen)
                setBackdropReady(true)
              }
            } else if (!abort) {
              setBackdropPath(null)
              setBackdropReady(false)
            }
          } catch {
            if (!abort) {
              setBackdropPath(null)
              setBackdropReady(false)
            }
          }
        }
      }

      // 3) Extras
      const cachedExtras = movieExtrasCache.get(movie.id)
      if (cachedExtras) {
        if (!abort) setExtras(cachedExtras)
      } else {
        try {
          let runtime = null
          try {
            const details = await getMovieDetails(movie.id)
            runtime = details?.runtime ?? null
          } catch {}

          let awards = null
          let imdbRating = null
          try {
            let imdb = movie?.imdb_id
            if (!imdb) {
              const ext = await getExternalIds('movie', movie.id)
              imdb = ext?.imdb_id || null
            }
            if (imdb) {
              const omdb = await fetchOmdbByImdb(imdb)
              const rawAwards = omdb?.Awards
              if (
                rawAwards &&
                typeof rawAwards === 'string' &&
                rawAwards.trim()
              ) {
                awards = rawAwards.trim()
              }
              const r = omdb?.imdbRating
              if (r && !Number.isNaN(Number(r))) {
                imdbRating = Number(r)
              }
            }
          } catch {}

          const next = { runtime, awards, imdbRating }
          movieExtrasCache.set(movie.id, next)
          if (!abort) setExtras(next)
        } catch {
          if (!abort) {
            setExtras({ runtime: null, awards: null, imdbRating: null })
          }
        }
      }
    }

    loadAll()
    return () => {
      abort = true
    }
  }, [movie])

  const href = `/details/movie/${movie.id}`

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = '/login'
      return true
    }
    return false
  }

  // Evitar que los botones disparen la navegación
  const handleToggleFavorite = async (e) => {
    e.stopPropagation()
    if (requireLogin() || updating || !movie) return
    try {
      setUpdating(true)
      setError('')
      const next = !favorite
      setFavorite(next)
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type: movie.media_type || 'movie',
        mediaId: movie.id,
        favorite: next
      })
    } catch {
      setFavorite((v) => !v)
      setError('No se pudo actualizar favoritos.')
    } finally {
      setUpdating(false)
    }
  }

  const handleToggleWatchlist = async (e) => {
    e.stopPropagation()
    if (requireLogin() || updating || !movie) return
    try {
      setUpdating(true)
      setError('')
      const next = !watchlist
      setWatchlist(next)
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type: movie.media_type || 'movie',
        mediaId: movie.id,
        watchlist: next
      })
    } catch {
      setWatchlist((v) => !v)
      setError('No se pudo actualizar pendientes.')
    } finally {
      setUpdating(false)
    }
  }

  const backdrop =
    backdropPath || movie.backdrop_path || movie.poster_path || null
  const bgSrc = backdrop ? buildImg(backdrop, 'w1280') : null

  // Géneros legibles (máx 3)
  const genres = (() => {
    const ids =
      movie.genre_ids ||
      (Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : [])
    const names = ids.map((id) => MOVIE_GENRES[id]).filter(Boolean)
    return names.slice(0, 3).join(' • ')
  })()

  return (
    <div
      className={`relative rounded-3xl overflow-hidden bg-neutral-900 text-white shadow-xl ${heightClass} flex cursor-pointer`}
      onClick={() => {
        window.location.href = href
      }}
    >
      {/* Fondo backdrop */}
      <div className="absolute inset-0">
        {!backdropReady && (
          <div className="w-full h-full bg-neutral-900 animate-pulse" />
        )}

        {backdropReady && bgSrc && (
          <img
            src={bgSrc}
            alt={movie.title || movie.name}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        )}

        {/* Difuminado únicamente en la parte inferior */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]
                 bg-gradient-to-t from-black/95 via-black/65 to-transparent"
        />
      </div>

      {/* Contenido en franja inferior (sin título) */}
      <div className="relative z-10 flex-1 flex flex-col justify-end">
        <div className="px-4 sm:px-6 lg:px-8 pb-4 sm:pb-5 lg:pb-6">
          <div className="flex items-end justify-between gap-4">
            {/* Columna izquierda: meta + géneros + premios */}
            <div className="min-w-0 flex-1 space-y-1">
              {/* Línea de meta / ratings */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] sm:text-xs text-neutral-200">
                {yearOf(movie) && <span>{yearOf(movie)}</span>}
                {extras?.runtime && (
                  <span>• {formatRuntime(extras.runtime)}</span>
                )}

                <span className="inline-flex items-center gap-1.5">
                  <img
                    src="/logo-TMDb.png"
                    alt="TMDb"
                    className="h-4 w-auto"
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="font-medium">{ratingOf(movie)}</span>
                </span>

                {typeof extras?.imdbRating === 'number' && (
                  <span className="inline-flex items-center gap-1.5">
                    <img
                      src="/logo-IMDb.png"
                      alt="IMDb"
                      className="h-4 w-auto"
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="font-medium">
                      {extras.imdbRating.toFixed(1)}
                    </span>
                  </span>
                )}
              </div>

              {/* Géneros */}
              {genres && (
                <div className="text-[11px] sm:text-xs text-neutral-100/90 line-clamp-1 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
                  {genres}
                </div>
              )}

              {/* Premios / nominaciones */}
              {extras?.awards && (
                <div className="text-[11px] sm:text-xs text-emerald-300 line-clamp-2 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  {extras.awards}
                </div>
              )}
            </div>

            {/* Columna derecha: botones */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={handleToggleFavorite}
                disabled={loadingStates || updating}
                title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-neutral-700/70 hover:bg-neutral-600/90 backdrop-blur-sm border border-neutral-600/60 flex items-center justify-center text-white transition-colors disabled:opacity-60"
              >
                {loadingStates || updating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : favorite ? (
                  <HeartOff className="w-5 h-5" />
                ) : (
                  <Heart className="w-5 h-5" />
                )}
              </button>

              <button
                onClick={handleToggleWatchlist}
                disabled={loadingStates || updating}
                title={
                  watchlist ? 'Quitar de pendientes' : 'Añadir a pendientes'
                }
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-neutral-700/70 hover:bg-neutral-600/90 backdrop-blur-sm border border-neutral-600/60 flex items-center justify-center text-white transition-colors disabled:opacity-60"
              >
                {loadingStates || updating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : watchlist ? (
                  <BookmarkMinus className="w-5 h-5" />
                ) : (
                  <BookmarkPlus className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-2 text-[11px] text-red-400 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* * ====================================================================
 * Componente Principal: MoviesPage
 * ==================================================================== */
export default function MoviesPage() {
  const [ready, setReady] = useState(false)
  const [dashboardData, setDashboardData] = useState({})
  const isTouchDevice = useIsTouchDevice()

  // Caché global de portadas (movie.id -> file_path)
  const posterCacheRef = useRef(new Map())

  useEffect(() => {
    const loadData = async () => {
      try {
        const lang = 'es-ES'
        const [
          popular,
          top_imdb,
          action,
          scifi,
          thrillers,
          vengeance,
          baseSections
        ] = await Promise.all([
          fetchPopularMedia({ type: 'movie', language: lang }),
          fetchTopRatedIMDb({
            type: 'movie',
            minVotes: 15000,
            language: lang,
            limit: 80
          }),
          fetchMoviesByGenre({
            type: 'movie',
            genreId: 28,
            minVotes: 1000,
            language: lang
          }),
          fetchMoviesByGenre({
            type: 'movie',
            genreId: 878,
            minVotes: 1000,
            language: lang
          }),
          fetchMoviesByGenre({
            type: 'movie',
            genreId: 53,
            minVotes: 1000,
            language: lang
          }),
          fetchMediaByKeyword({
            type: 'movie',
            keywordId: 9715,
            minVotes: 500,
            language: lang
          }),
          fetchMovieSections
            ? fetchMovieSections({ language: lang })
            : Promise.resolve({})
        ])

        const curatedPopular = curateList(popular, {
          minVotes: 1500,
          minRating: 6.2,
          minSize: 30,
          maxSize: 80
        })

        const curatedTopIMDb = curateList(top_imdb, {
          minVotes: 20000,
          minRating: 7.3,
          minSize: 30,
          maxSize: 80
        })

        const curatedAction = curateList(action, {
          minVotes: 2000,
          minRating: 6.2,
          minSize: 25,
          maxSize: 70
        })

        const curatedScifi = curateList(scifi, {
          minVotes: 1500,
          minRating: 6.3,
          minSize: 20,
          maxSize: 60
        })

        const curatedThrillers = curateList(thrillers, {
          minVotes: 1500,
          minRating: 6.3,
          minSize: 20,
          maxSize: 60
        })

        const curatedVengeance = curateList(vengeance, {
          minVotes: 800,
          minRating: 6.0,
          minSize: 20,
          maxSize: 50
        })

        const curatedBaseSections = {}
        for (const [key, list] of Object.entries(baseSections || {})) {
          if (!Array.isArray(list)) continue

          if (key === 'Top 10 hoy en España') {
            curatedBaseSections[key] = sortByVotes(list).slice(0, 10)
            continue
          }

          let params
          if (key === 'Premiadas') {
            params = {
              minVotes: 1200,
              minRating: 6.8,
              minSize: 20,
              maxSize: 60
            }
          } else if (key === 'Superéxito') {
            params = {
              minVotes: 3000,
              minRating: 6.5,
              minSize: 25,
              maxSize: 60
            }
          } else if (key.startsWith('Década de')) {
            params = {
              minVotes: 800,
              minRating: 6.2,
              minSize: 15,
              maxSize: 60
            }
          } else if (key === 'Por género') {
            continue
          } else {
            params = {
              minVotes: 700,
              minRating: 6.0,
              minSize: 20,
              maxSize: 60
            }
          }

          curatedBaseSections[key] = curateList(list, params)
        }

        const curatedByGenre = {}
        const byGenreRaw = baseSections?.['Por género'] || {}
        for (const [gname, list] of Object.entries(byGenreRaw)) {
          if (!Array.isArray(list) || list.length === 0) continue
          curatedByGenre[gname] = curateList(list, {
            minVotes: 600,
            minRating: 6.0,
            minSize: 15,
            maxSize: 50
          })
        }
        if (Object.keys(curatedByGenre).length > 0) {
          curatedBaseSections['Por género'] = curatedByGenre
        }

        setDashboardData({
          popular: curatedPopular,
          top_imdb: curatedTopIMDb,
          action: curatedAction,
          scifi: curatedScifi,
          thrillers: curatedThrillers,
          vengeance: curatedVengeance,
          ...curatedBaseSections
        })
        setReady(true)
      } catch (err) {
        console.error('Error cargando la página de películas:', err)
      }
    }
    loadData()
  }, [])

  if (!ready) return <div className="h-screen bg-black" />

  /* ---------- Sección reusable (cada fila) ---------- */
  const Row = ({ title, items }) => {
    if (!items || items.length === 0) return null

    const swiperRef = useRef(null)
    const [isHoveredRow, setIsHoveredRow] = useState(false)
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)
    const [hoveredId, setHoveredId] = useState(null)

    const hasActivePreview = !!hoveredId
    const isTop10 = title === 'Top 10 hoy en España'

    const heightClass =
      'h-[220px] sm:h-[260px] md:h-[300px] xl:h-[340px]'

    const updateNav = (swiper) => {
      if (!swiper) return
      const hasOverflow = !swiper.isLocked
      setCanPrev(hasOverflow && !swiper.isBeginning)
      setCanNext(hasOverflow && !swiper.isEnd)
    }

    const handleSwiper = (swiper) => {
      swiperRef.current = swiper
      updateNav(swiper)
    }

    const handlePrevClick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const swiper = swiperRef.current
      if (!swiper) return
      const target = Math.max((swiper.activeIndex || 0) - 6, 0)
      swiper.slideTo(target)
    }

    const handleNextClick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const swiper = swiperRef.current
      if (!swiper) return
      const maxIndex = swiper.slides.length - 1
      const target = Math.min((swiper.activeIndex || 0) + 6, maxIndex)
      swiper.slideTo(target)
    }

    const showPrev = (isHoveredRow || hasActivePreview) && canPrev
    const showNext = (isHoveredRow || hasActivePreview) && canNext

    return (
      <div className="relative group">
        <h3 className="text-2xl sm:text-3xl md:text-4xl font-[730] text-primary-text mb-4 sm:text-left">
          <span
            className={`bg-gradient-to-b from-blue-600 via-blue-400 to-white bg-clip-text text-transparent tracking-widest uppercase ${anton.className}`}
          >
            {title}
          </span>
        </h3>

        <div
          className="relative"
          onMouseEnter={() => setIsHoveredRow(true)}
          onMouseLeave={() => {
            setIsHoveredRow(false)
            setHoveredId(null)
          }}
        >
          <Swiper
            spaceBetween={isTop10 ? 24 : 16}
            slidesPerView="auto"
            onSwiper={handleSwiper}
            onSlideChange={updateNav}
            onResize={updateNav}
            onReachBeginning={updateNav}
            onReachEnd={updateNav}
            loop={false}
            watchOverflow={true}
            grabCursor={!isTouchDevice}
            allowTouchMove={true}
            preventClicks={true}
            preventClicksPropagation={true}
            threshold={5}
            modules={[Navigation]}
            className="group relative"
            breakpoints={{
              0: { spaceBetween: isTop10 ? 16 : 12 },
              640: { spaceBetween: isTop10 ? 20 : 14 },
              1024: { spaceBetween: isTop10 ? 28 : 18 },
              1280: { spaceBetween: isTop10 ? 32 : 20 }
            }}
          >
            {items.map((m, i) => {
              const isActive = hoveredId === m.id
              const isLast = i === items.length - 1

              const base =
                'relative flex-shrink-0 transition-all duration-300 ease-out'

              const sizeClasses = isActive
                ? 'w-[390px] sm:w-[460px] md:w-[530px] xl:w-[600px] z-20'
                : 'w-[140px] sm:w-[170px] md:w-[190px] xl:w-[210px] z-10'

              const transformClass =
                isActive && isLast
                  ? '-translate-x-[250px] sm:-translate-x-[290px] md:-translate-x-[340px] xl:-translate-x-[390px]'
                  : ''

              const cardElement = (
                <div
                  className={`${base} ${sizeClasses} ${heightClass} ${transformClass}`}
                  onMouseEnter={() => setHoveredId(m.id)}
                  onMouseLeave={() =>
                    setHoveredId((prev) => (prev === m.id ? null : prev))
                  }
                >
                  <AnimatePresence initial={false} mode="wait">
                    {isActive ? (
                      <motion.div
                        key="preview"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                        className="w-full h-full"
                      >
                        <InlinePreviewCard
                          movie={m}
                          heightClass={heightClass}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="poster"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="w-full h-full"
                      >
                        <Link href={`/details/movie/${m.id}`}>
                          <PosterImage
                            movie={m}
                            cache={posterCacheRef}
                            heightClass={heightClass}
                          />
                        </Link>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )

              return (
                <SwiperSlide key={m.id} className="!w-auto select-none">
                  {isTop10 ? (
                    <div className="flex items-center">
                      <div
                        className="text-[150px] sm:text-[180px] md:text-[220px] xl:text-[260px] font-black z-0 select-none
                                    bg-gradient-to-b from-blue-900/40 via-blue-600/30 to-blue-400/20 bg-clip-text text-transparent
                                    drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]"
                        style={{
                          fontFamily:
                            'system-ui, -apple-system, sans-serif',
                          lineHeight: 0.8,
                          marginRight: '-0.15em',
                          marginLeft: '0.1em'
                        }}
                      >
                        {i + 1}
                      </div>
                      {cardElement}
                    </div>
                  ) : (
                    cardElement
                  )}
                </SwiperSlide>
              )
            })}
          </Swiper>

          {/* LATERAL IZQUIERDO – franja difuminada */}
          {showPrev && (
            <button
              type="button"
              onClick={handlePrevClick}
              className="absolute inset-y-0 left-0 w-28 z-30
                           hidden sm:flex items-center justify-start
                           bg-gradient-to-r from-black/80 via-black/55 to-transparent
                           hover:from-black/95 hover:via-black/75
                           transition-colors pointer-events-auto"
            >
              <span className="ml-4 text-3xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
                ‹
              </span>
            </button>
          )}

          {/* LATERAL DERECHO – franja difuminada */}
          {showNext && (
            <button
              type="button"
              onClick={handleNextClick}
              className="absolute inset-y-0 right-0 w-28 z-30
                           hidden sm:flex items-center justify-end
                           bg-gradient-to-l from-black/80 via-black/55 to-transparent
                           hover:from-black/95 hover:via-black/75
                           transition-colors pointer-events-auto"
            >
              <span className="mr-4 text-3xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
                ›
              </span>
            </button>
          )}
        </div>
      </div>
    )
  }

  const GenreRows = ({ groups }) => (
    <>
      {Object.entries(groups || {}).map(([gname, list]) =>
        list?.length ? (
          <Row
            key={`genre-${gname}`}
            title={`Por género — ${gname}`}
            items={list}
          />
        ) : null
      )}
    </>
  )

  return (
    <div className="px-8 py-2 text-white bg-black">
      <div className="space-y-12 pt-10">
        {dashboardData['Top 10 hoy en España']?.length ? (
          <Row
            title="Top 10 hoy en España"
            items={dashboardData['Top 10 hoy en España']}
          />
        ) : null}

        {dashboardData.popular?.length > 0 && (
          <Row title="Tendencias ahora mismo" items={dashboardData.popular} />
        )}

        {dashboardData.top_imdb?.length > 0 && (
          <Row
            title="Imprescindibles según IMDb"
            items={dashboardData.top_imdb}
          />
        )}

        {dashboardData['Superéxito']?.length ? (
          <Row
            title="Taquillazos que no puedes perderte"
            items={dashboardData['Superéxito']}
          />
        ) : null}

        {dashboardData['Premiadas']?.length ? (
          <Row
            title="Premiadas y nominadas"
            items={dashboardData['Premiadas']}
          />
        ) : null}

        {dashboardData.action?.length > 0 && (
          <Row title="Acción taquillera" items={dashboardData.action} />
        )}

        {dashboardData.scifi?.length > 0 && (
          <Row
            title="Ciencia ficción espectacular"
            items={dashboardData.scifi}
          />
        )}

        {dashboardData.thrillers?.length > 0 && (
          <Row title="Thrillers intensos" items={dashboardData.thrillers} />
        )}

        {dashboardData.vengeance?.length > 0 && (
          <Row
            title="Historias de venganza"
            items={dashboardData.vengeance}
          />
        )}

        {dashboardData['Década de 1990']?.length ? (
          <Row
            title="Clásicos de los 90"
            items={dashboardData['Década de 1990']}
          />
        ) : null}
        {dashboardData['Década de 2000']?.length ? (
          <Row
            title="Favoritas de los 2000"
            items={dashboardData['Década de 2000']}
          />
        ) : null}
        {dashboardData['Década de 2010']?.length ? (
          <Row
            title="Hits de los 2010"
            items={dashboardData['Década de 2010']}
          />
        ) : null}
        {dashboardData['Década de 2020']?.length ? (
          <Row
            title="Lo mejor de los 2020"
            items={dashboardData['Década de 2020']}
          />
        ) : null}

        <GenreRows groups={dashboardData['Por género']} />
      </div>
    </div>
  )
}
