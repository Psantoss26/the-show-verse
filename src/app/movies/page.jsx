'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation } from 'swiper'
import { AnimatePresence, motion } from 'framer-motion'
import 'swiper/swiper-bundle.css'
import Link from 'next/link'
import { Anton } from 'next/font/google'
import { Heart, HeartOff, BookmarkPlus, BookmarkMinus, Loader2 } from 'lucide-react'
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
  <svg viewBox="0 0 64 64" className={className} aria-label="IMDb" role="img">
    <rect x="2" y="12" width="60" height="40" rx="6" fill="#F5C518" />
    <path d="M14 24h4v16h-4V24zm8 0h4v16h-4V24zm6 0h6c2.76 0 4 1.24 4 4v8c0 2.76-1.24 4-4 4h-6V24zm4 4v8h2c.67 0 1-.33 1-1v-6c0-.67-.33-1-1-1h-2zm12-4h4v16h-4V24z" fill="#000"/>
  </svg>
)

const TMDbIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 64 64" className={className} aria-label="TMDb" role="img">
    <rect x="4" y="8" width="56" height="48" rx="10" fill="#01D277" />
    <path d="M18 24h-4v-4h12v4h-4v16h-4V24zm14-4h4l3 7 3-7h4v20h-4V28l-3 7h-2l-3-7v12h-4V20zm20 0h4v20h-4V20z" fill="#001A0F" opacity=".95"/>
  </svg>
)

/* ---------- helpers ---------- */
const yearOf = (m) =>
  m?.release_date?.slice(0, 4) || m?.first_air_date?.slice(0, 4) || ''

const ratingOf = (m) =>
  typeof m?.vote_average === 'number' && m.vote_average > 0
    ? m.vote_average.toFixed(1)
    : '–'

const short = (t = '', n = 420) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

const formatRuntime = (mins) => {
  if (!mins || typeof mins !== 'number') return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h <= 0) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

const buildImg = (path, size = 'original') =>
  `https://image.tmdb.org/t/p/${size}${path}`

/* ======== Curado de listas tipo Netflix/Prime ======== */
const sortByVotes = (list = []) =>
  [...list].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))

function curateList(
  list,
  {
    minVotes = 0,
    minRating = 0,
    minSize = 20,
    maxSize = 60
  } = {}
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

    const es = backs.filter((b) => b.iso_639_1 === 'es' || b.iso_639_1 === 'es-ES')
    const en = backs.filter((b) => b.iso_639_1 === 'en' || b.iso_639_1 === 'en-US')

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

    const es = posters.filter((p) => p.iso_639_1 === 'es' || p.iso_639_1 === 'es-ES')
    const en = posters.filter((p) => p.iso_639_1 === 'en' || p.iso_639_1 === 'en-US')

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

/* ====================================================================
 * Portal flotante (hover) con backdrops ES->EN + preload + caché
 * ==================================================================== */
function HoverPreviewPortal({ open, anchorRect, movie, onClose, onCancelClose }) {
  const { session, account } = useAuth()

  const [loadingStates, setLoadingStates] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  const [extras, setExtras] = useState({ runtime: null, awards: null, imdbRating: null })
  const [backdropPath, setBackdropPath] = useState(null)
  const [backdropReady, setBackdropReady] = useState(false)

  // movie.id -> { runtime, awards, imdbRating }
  const extrasCache = useRef(new Map())
  // movie.id -> file_path elegido (ES/EN o fallback)
  const backdropCache = useRef(new Map())

  // Estados de cuenta
  useEffect(() => {
    let cancel = false
    const load = async () => {
      if (!open || !movie || !session || !account?.id) {
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
    return () => { cancel = true }
  }, [open, movie, session, account])

  // Carga backdrop + extras (con cachés) sin flicker
  useEffect(() => {
    let abort = false
    const loadAll = async () => {
      if (!open || !movie) {
        setBackdropPath(null)
        setBackdropReady(false)
        setExtras({ runtime: null, awards: null, imdbRating: null })
        return
      }

      // 1) Backdrop preferido con fallback a backdrop_path / poster_path
      const cachedBackdrop = backdropCache.current.get(movie.id)
      if (cachedBackdrop) {
        if (!abort) {
          setBackdropPath(cachedBackdrop)
          setBackdropReady(true)
        }
      } else {
        setBackdropReady(false)
        const preferred = await fetchBackdropEsThenEn(movie.id)
        const chosen =
          preferred || movie.backdrop_path || movie.poster_path || null
        const url = chosen ? buildImg(chosen, 'w1280') : null
        await preloadImage(url)
        if (!abort) {
          backdropCache.current.set(movie.id, chosen)
          setBackdropPath(chosen)
          setBackdropReady(!!chosen)
        }
      }

      // 2) Extras (runtime, premios, IMDb) con caché
      const cached = extrasCache.current.get(movie.id)
      if (cached) {
        if (!abort) setExtras(cached)
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
              if (rawAwards && typeof rawAwards === 'string' && rawAwards.trim()) {
                awards = rawAwards.trim()
              }
              const r = omdb?.imdbRating
              if (r && !Number.isNaN(Number(r))) {
                imdbRating = Number(r)
              }
            }
          } catch {}

          const next = { runtime, awards, imdbRating }
          extrasCache.current.set(movie.id, next)
          if (!abort) setExtras(next)
        } catch {
          // si peta todo, extras vacíos
        }
      }
    }
    loadAll()
    return () => { abort = true }
  }, [open, movie])

  // Layout/posición del panel
  const MIN_W = 420
  const MAX_W = 750
  const calc = useCallback(() => {
    if (!anchorRect) return { left: 0, top: 0, width: MIN_W }
    const vw = window.innerWidth
    const w = Math.min(MAX_W, Math.max(MIN_W, anchorRect.width * 2.6))
    let left = anchorRect.left + anchorRect.width / 2 - w / 2
    left = Math.max(8, Math.min(left, vw - w - 8))
    let top = anchorRect.top - 24
    if (top < 8) top = 8
    return { left, top, width: w }
  }, [anchorRect])

  const [pos, setPos] = useState(() => calc())

  useEffect(() => {
    if (!open) return
    const update = () => setPos(calc())
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update)
    }
  }, [open, calc])

  if (!open || !movie || !anchorRect) return null

  const href = `/details/movie/${movie.id}`

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = '/login'
      return true
    }
    return false
  }

  const handleToggleFavorite = async () => {
    if (requireLogin() || updating || !movie) return
    try {
      setUpdating(true); setError('')
      const next = !favorite; setFavorite(next)
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

  const handleToggleWatchlist = async () => {
    if (requireLogin() || updating || !movie) return
    try {
      setUpdating(true); setError('')
      const next = !watchlist; setWatchlist(next)
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

  return (
    <AnimatePresence>
      <motion.div
        key={movie.id}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onMouseEnter={onCancelClose}
        onMouseLeave={onClose}
        style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, zIndex: 80, pointerEvents: 'auto' }}
        className="hidden lg:block rounded-3xl overflow-hidden bg-[#0b0b0b] border border-neutral-800 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        <Link href={href} className="block relative group/preview">
          <div className="w-full aspect-video relative">
            {!backdropReady && (
              <div className="absolute inset-0 bg-neutral-900 animate-pulse" />
            )}
            {backdropReady && backdropPath && (
              <img
                src={buildImg(backdropPath, 'w1280')}
                srcSet={`${buildImg(backdropPath,'w780')} 780w, ${buildImg(backdropPath,'w1280')} 1280w, ${buildImg(backdropPath,'original')} 2400w`}
                sizes="(min-width:1536px) 1200px, (min-width:1280px) 1100px, (min-width:1024px) 900px, 95vw"
                alt={movie.title || movie.name}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-[#0b0b0b] to-transparent pointer-events-none" />
        </Link>

        <div className="p-4 md:p-5 pt-3">
          <div className="mb-1 flex items-center gap-3 text-sm text-neutral-300 flex-wrap">
            {yearOf(movie) && <span>{yearOf(movie)}</span>}
            {extras?.runtime && <span>• {formatRuntime(extras.runtime)}</span>}
            <span className="inline-flex items-center gap-1.5">
              <TMDbIcon className="w-4 h-4" />
              <span className="font-medium">{ratingOf(movie)}</span>
            </span>
            {typeof extras?.imdbRating === 'number' && (
              <span className="inline-flex items-center gap-1.5">
                <IMDbIcon className="w-4 h-4" />
                <span className="font-medium">{extras.imdbRating.toFixed(1)}</span>
              </span>
            )}
          </div>

          <h4 className="text-xl md:text-2xl font-semibold mb-2">
            {movie.title || movie.name}
          </h4>

          {extras?.awards && (
            <div className="mt-1 text-[12px] md:text-xs text-emerald-300">
              {extras.awards}
            </div>
          )}

          {movie.overview && (
            <p className="mt-2 text-sm md:text-base text-neutral-200 leading-relaxed line-clamp-3">
              {short(movie.overview)}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Link href={href}>
              <button className="px-4 py-2 rounded-2xl bg-white text-black text-sm font-semibold hover:bg-neutral-200 transition-colors">
                Ver detalles
              </button>
            </Link>
            <div className="flex-grow flex justify-end gap-2">
              <button
                onClick={handleToggleFavorite}
                disabled={loadingStates || updating}
                title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                className="w-10 h-10 rounded-full bg-neutral-700/60 hover:bg-neutral-600/80 backdrop-blur-sm border border-neutral-600/50 flex items-center justify-center text-white transition-colors disabled:opacity-60"
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
                title={watchlist ? 'Quitar de pendientes' : 'Añadir a pendientes'}
                className="w-10 h-10 rounded-full bg-neutral-700/60 hover:bg-neutral-600/80 backdrop-blur-sm border border-neutral-600/50 flex items-center justify-center text-white transition-colors disabled:opacity-60"
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

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/* Poster con la misma lógica ES->EN + preload + caché por movie.id */
function PosterImage({ movie, cache }) {
  const [posterPath, setPosterPath] = useState(
    movie.poster_path || movie.backdrop_path || null
  )
  const [ready, setReady] = useState(!!posterPath)

  useEffect(() => {
    let abort = false
    const load = async () => {
      if (!movie) return

      const cached = cache.current.get(movie.id)
      if (cached) {
        if (!abort) {
          setPosterPath(cached)
          setReady(true)
        }
        return
      }

      setReady(false)
      const preferred = await fetchPosterEsThenEn(movie.id)
      const chosen =
        preferred || movie.poster_path || movie.backdrop_path || null
      const url = chosen ? buildImg(chosen, 'w342') : null
      await preloadImage(url)
      if (!abort) {
        cache.current.set(movie.id, chosen)
        setPosterPath(chosen)
        setReady(!!chosen)
      }
    }

    load()
    return () => { abort = true }
  }, [movie, cache])

  return (
    <>
      {!ready && (
        <div className="w-full h-full aspect-[2/3] rounded-3xl bg-neutral-800 animate-pulse" />
      )}
      {ready && posterPath && (
        <img
          src={buildImg(posterPath, 'w342')}
          alt={movie.title || movie.name}
          className="w-full h-full object-cover rounded-3xl aspect-[2/3] transition-transform duration-300 hover:scale-105"
          loading="lazy"
          decoding="async"
        />
      )}
    </>
  )
}

/* * ====================================================================
 * Componente Principal: MoviesPage
 * ==================================================================== */
export default function MoviesPage() {
  const [ready, setReady] = useState(false)
  const [dashboardData, setDashboardData] = useState({})
  const [hover, setHover] = useState(null)
  const isTouchDevice = useIsTouchDevice()

  const openTimerRef = useRef(null)
  const closeTimerRef = useRef(null)

  const prevRef = useRef(null)
  const nextRef = useRef(null)

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
          // Populares del momento (sirve como “Tendencias”)
          fetchPopularMedia({ type: 'movie', language: lang }),
          // Top IMDb
          fetchTopRatedIMDb({
            type: 'movie',
            minVotes: 15000,
            language: lang,
            limit: 80
          }),
          // Géneros principales
          fetchMoviesByGenre({ type: 'movie', genreId: 28,  minVotes: 1000, language: lang }), // Acción
          fetchMoviesByGenre({ type: 'movie', genreId: 878, minVotes: 1000, language: lang }), // Sci-Fi
          fetchMoviesByGenre({ type: 'movie', genreId: 53,  minVotes: 1000, language: lang }), // Thrillers
          fetchMediaByKeyword({ type: 'movie', keywordId: 9715, minVotes: 500, language: lang }), // Venganza
          fetchMovieSections ? fetchMovieSections({ language: lang }) : Promise.resolve({})
        ])

        // Curado con tamaño mínimo garantizado
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

        // Secciones predefinidas (décadas, premiadas, top10, superéxito, por género...)
        const curatedBaseSections = {}
        for (const [key, list] of Object.entries(baseSections || {})) {
          if (!Array.isArray(list)) continue

          // Top 10: no filtramos para garantizar las 10
          if (key === 'Top 10 hoy en España') {
            curatedBaseSections[key] = sortByVotes(list).slice(0, 10)
            continue
          }

          let params
          if (key === 'Premiadas') {
            params = { minVotes: 1200, minRating: 6.8, minSize: 20, maxSize: 60 }
          } else if (key === 'Superéxito') {
            params = { minVotes: 3000, minRating: 6.5, minSize: 25, maxSize: 60 }
          } else if (key.startsWith('Década de')) {
            params = { minVotes: 800, minRating: 6.2, minSize: 15, maxSize: 60 }
          } else if (key === 'Por género') {
            // este lo tratamos aparte fuera del bucle
            continue
          } else {
            params = { minVotes: 700, minRating: 6.0, minSize: 20, maxSize: 60 }
          }

          curatedBaseSections[key] = curateList(list, params)
        }

        // Por género: aplicamos curado por cada género
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

  /* ---------- handlers hover con delay ---------- */
  const onEnter = (movie, e) => {
    if (isTouchDevice) return
    const rect = e.currentTarget.getBoundingClientRect()
    clearTimeout(closeTimerRef.current)
    clearTimeout(openTimerRef.current)
    if (hover) {
      setHover({ movie, rect })
    } else {
      openTimerRef.current = setTimeout(() => setHover({ movie, rect }), 400)
    }
  }

  const onLeave = () => {
    if (isTouchDevice) return
    clearTimeout(openTimerRef.current)
    closeTimerRef.current = setTimeout(() => setHover(null), 150)
  }

  const cancelCloseHover = () => {
    if (isTouchDevice) return
    clearTimeout(closeTimerRef.current)
  }

  const closeHover = () => {
    clearTimeout(openTimerRef.current)
    clearTimeout(closeTimerRef.current)
    setHover(null)
  }

    /* ---------- Sección reusable (cada fila) ---------- */
  const Row = ({ title, items }) => {
    if (!items || items.length === 0) return null

    const swiperRef = useRef(null)
    const [isHovered, setIsHovered] = useState(false)
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)

    // ¿Hay una vista previa abierta de una peli de ESTA fila?
    const hasActivePreview =
      !!hover?.movie && items.some((m) => m.id === hover.movie.id)

    const computeSlidesPerView = (swiper) => {
      if (!swiper) return 1
      const param = swiper.params.slidesPerView
      if (typeof param === 'number') return param
      if (typeof swiper.slidesPerViewDynamic === 'function') {
        const dyn = swiper.slidesPerViewDynamic()
        if (typeof dyn === 'number' && dyn > 0) return dyn
      }
      return 1
    }

    const updateNav = (swiper) => {
      if (!swiper) return
      const total = swiper.slides.length
      const spv = computeSlidesPerView(swiper)
      const hasOverflow = total > spv
      setCanPrev(hasOverflow && !swiper.isBeginning)
      setCanNext(hasOverflow && !swiper.isEnd)
    }

    const handleSwiper = (swiper) => {
      swiperRef.current = swiper
      updateNav(swiper)
    }

    const slideBy = (delta) => {
      const swiper = swiperRef.current
      if (!swiper) return

      const total = swiper.slides.length
      if (!total) return

      const active = swiper.activeIndex || 0
      const spv = computeSlidesPerView(swiper)
      const maxIndex = Math.max(0, total - spv)
      const target = Math.min(Math.max(active + delta, 0), maxIndex)

      swiper.slideTo(target)
    }

    const handlePrevClick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      slideBy(-6)
    }

    const handleNextClick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      slideBy(6)
    }

    // Flechas visibles si:
    // - hay overflow
    // - y el ratón está sobre la fila O hay preview activa de esta fila
    const showPrev = (isHovered || hasActivePreview) && canPrev
    const showNext = (isHovered || hasActivePreview) && canNext

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
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Swiper
            spaceBetween={20}
            slidesPerView={10}
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
              0: { slidesPerView: 3, spaceBetween: 12 },
              480: { slidesPerView: 4, spaceBetween: 14 },
              768: { slidesPerView: 6, spaceBetween: 16 },
              1024: { slidesPerView: 8, spaceBetween: 18 },
              1280: { slidesPerView: 10, spaceBetween: 20 }
            }}
          >
            {items.map((m) => (
              <SwiperSlide key={m.id}>
                <Link href={`/details/movie/${m.id}`}>
                  <div
                    className="relative cursor-pointer overflow-hidden rounded-3xl"
                    onMouseEnter={(e) => onEnter(m, e)}
                    onMouseLeave={onLeave}
                  >
                    <PosterImage movie={m} cache={posterCacheRef} />
                  </div>
                </Link>
              </SwiperSlide>
            ))}
          </Swiper>

          {/* LATERAL IZQUIERDO – difuminado de arriba a abajo y hacia dentro */}
          {showPrev && (
            <button
              type="button"
              onClick={handlePrevClick}
              className="absolute inset-y-0 left-0 w-28 z-20
                         hidden sm:flex items-center justify-start
                         bg-gradient-to-r from-black/70 via-black/40 to-transparent
                         hover:from-black/85 hover:via-black/60
                         transition-colors pointer-events-auto"
            >
              <span className="ml-4 text-3xl font-semibold text-white drop-shadow-[0_0_8px_rgba(0,0,0,0.9)]">
                ‹
              </span>
            </button>
          )}

          {/* LATERAL DERECHO – difuminado */}
          {showNext && (
            <button
              type="button"
              onClick={handleNextClick}
              className="absolute inset-y-0 right-0 w-28 z-20
                         hidden sm:flex items-center justify-end
                         bg-gradient-to-l from-black/70 via-black/40 to-transparent
                         hover:from-black/85 hover:via-black/60
                         transition-colors pointer-events-auto"
            >
              <span className="mr-4 text-3xl font-semibold text-white drop-shadow-[0_0_8px_rgba(0,0,0,0.9)]">
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
          <Row key={`genre-${gname}`} title={`Por género — ${gname}`} items={list} />
        ) : null
      )}
    </>
  )

  return (
    <div className="px-8 py-2 text-white bg-black">
      <div className="space-y-12 pt-10">
        {dashboardData['Top 10 hoy en España']?.length ? (
          <Row title="Top 10 hoy en España" items={dashboardData['Top 10 hoy en España']} />
        ) : null}

        {dashboardData.popular?.length > 0 && (
          <Row title="Tendencias ahora mismo" items={dashboardData.popular} />
        )}

        {dashboardData.top_imdb?.length > 0 && (
          <Row title="Imprescindibles según IMDb" items={dashboardData.top_imdb} />
        )}

        {dashboardData['Superéxito']?.length ? (
          <Row title="Taquillazos que no puedes perderte" items={dashboardData['Superéxito']} />
        ) : null}

        {dashboardData['Premiadas']?.length ? (
          <Row title="Premiadas y nominadas" items={dashboardData['Premiadas']} />
        ) : null}

        {dashboardData.action?.length > 0 && (
          <Row title="Acción taquillera" items={dashboardData.action} />
        )}

        {dashboardData.scifi?.length > 0 && (
          <Row title="Ciencia ficción espectacular" items={dashboardData.scifi} />
        )}

        {dashboardData.thrillers?.length > 0 && (
          <Row title="Thrillers intensos" items={dashboardData.thrillers} />
        )}

        {dashboardData.vengeance?.length > 0 && (
          <Row title="Historias de venganza" items={dashboardData.vengeance} />
        )}

        {dashboardData['Década de 1990']?.length ? (
          <Row title="Clásicos de los 90" items={dashboardData['Década de 1990']} />
        ) : null}
        {dashboardData['Década de 2000']?.length ? (
          <Row title="Favoritas de los 2000" items={dashboardData['Década de 2000']} />
        ) : null}
        {dashboardData['Década de 2010']?.length ? (
          <Row title="Hits de los 2010" items={dashboardData['Década de 2010']} />
        ) : null}
        {dashboardData['Década de 2020']?.length ? (
          <Row title="Lo mejor de los 2020" items={dashboardData['Década de 2020']} />
        ) : null}

        <GenreRows groups={dashboardData['Por género']} />
      </div>

      <HoverPreviewPortal
        open={!!hover?.movie}
        anchorRect={hover?.rect || null}
        movie={hover?.movie || null}
        onClose={closeHover}
        onCancelClose={cancelCloseHover}
      />
    </div>
  )
}
