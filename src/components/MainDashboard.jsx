// MainDashboard.jsx
'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Autoplay } from 'swiper'
import { AnimatePresence, motion } from 'framer-motion'
import 'swiper/swiper-bundle.css'
import Link from 'next/link'
import { Anton } from 'next/font/google'
import { Heart, HeartOff, BookmarkPlus, BookmarkMinus, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

import {
  fetchTopRatedMovies,
  fetchCultClassics,
  fetchMindBendingMovies,
  fetchTopActionMovies,
  fetchPopularInUS,
  fetchUnderratedMovies,
  fetchRisingMovies,
  fetchTrendingMovies,
  fetchPopularMovies,
  fetchRecommendedMovies,
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getMovieDetails,
  getExternalIds
} from '@/lib/api/tmdb'

import { fetchOmdbByImdb } from '@/lib/api/omdb'

const anton = Anton({ weight: '400', subsets: ['latin'] })

/* --- Hook para detectar dispositivo táctil --- */
const useIsTouchDevice = () => {
  const [isTouch, setIsTouch] = useState(false)
  useEffect(() => {
    const onTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    setIsTouch(onTouch)
  }, [])
  return isTouch
}

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

/* ========= elegir mejor backdrop: ES -> EN, y por calidad ========= */
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

/* ========= elegir mejor poster: ES -> EN, y por calidad ========= */
async function fetchMoviePosterEsThenEn(movieId) {
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

/* --------- precargar una imagen y resolver tras onload --------- */
function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false)
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = src
  })
}

/* ---------- Portal flotante grande (sin parpadeo) ---------- */
function HoverPreviewPortal({ open, anchorRect, movie, onClose, onCancelClose }) {
  const { session, account } = useAuth()

  const [loadingStates, setLoadingStates] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  // extras + backdrop preferido cacheado
  const [extras, setExtras] = useState({ runtime: null, awards: null, imdbRating: null })
  const [backdropPath, setBackdropPath] = useState(null)
  const [backdropReady, setBackdropReady] = useState(false)
  const extrasCache = useRef(new Map())   // movie.id -> extras
  const backdropCache = useRef(new Map()) // movie.id -> backdrop_path ES/EN

  useEffect(() => {
    let cancel = false
    const load = async () => {
      if (!open || !movie || !session || !account?.id) {
        setFavorite(false); setWatchlist(false); return
      }
      try {
        setLoadingStates(true)
        const type = movie.media_type || 'movie'
        const st = await getMediaAccountStates(type, movie.id, session)
        if (!cancel) { setFavorite(!!st.favorite); setWatchlist(!!st.watchlist) }
      } catch {}
      finally { if (!cancel) setLoadingStates(false) }
    }
    load()
    return () => { cancel = true }
  }, [open, movie, session, account])

  useEffect(() => {
    let abort = false
    const loadExtrasAndBackdrop = async () => {
      if (!open || !movie) {
        setExtras({ runtime: null, awards: null, imdbRating: null })
        setBackdropPath(null)
        setBackdropReady(false)
        return
      }

      // 1) Backdrop ES->EN con preload y caché
      const cachedBackdrop = backdropCache.current.get(movie.id)
      if (cachedBackdrop) {
        if (!abort) {
          setBackdropPath(cachedBackdrop)
          setBackdropReady(true)
        }
      } else {
        setBackdropReady(false)
        const preferredPath = await fetchBackdropEsThenEn(movie.id)
        const chosen = preferredPath || null
        const url = chosen ? buildImg(chosen, 'w1280') : null
        await preloadImage(url)
        if (!abort) {
          backdropCache.current.set(movie.id, chosen)
          setBackdropPath(chosen)
          setBackdropReady(!!chosen)
        }
      }

      // 2) Extras (con caché)
      const cached = extrasCache.current.get(movie.id)
      if (cached) {
        if (!abort) setExtras(cached)
        return
      }

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
        if (!abort) setExtras({ runtime: null, awards: null, imdbRating: null })
      }
    }
    loadExtrasAndBackdrop()
    return () => { abort = true }
  }, [open, movie])

  const MIN_W = 420, MAX_W = 750
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
    if (!session || !account?.id) { window.location.href = '/login'; return true }
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
      setFavorite((v) => !v); setError('No se pudo actualizar favoritos.')
    } finally { setUpdating(false) }
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
      setWatchlist((v) => !v); setError('No se pudo actualizar pendientes.')
    } finally { setUpdating(false) }
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
                srcSet={`${buildImg(backdropPath, 'w780')} 780w, ${buildImg(
                  backdropPath,
                  'w1280'
                )} 1280w, ${buildImg(backdropPath, 'original')} 2400w`}
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
              <img src="/logo-TMDb.png" alt="TMDb" className="h-4 w-auto" loading="lazy" decoding="async" />
              <span className="font-medium">{ratingOf(movie)}</span>
            </span>
            {typeof extras?.imdbRating === 'number' && (
              <span className="inline-flex items-center gap-1.5">
                <img src="/logo-IMDb.png" alt="IMDb" className="h-4 w-auto" loading="lazy" decoding="async" />
                <span className="font-medium">{extras.imdbRating.toFixed(1)}</span>
              </span>
            )}
          </div>

          <h4 className="text-xl md:text-2xl font-semibold mb-2">{movie.title || movie.name}</h4>

          {extras?.awards && (
            <div className="mt-1 text-[12px] md:text-xs text-emerald-300">{extras.awards}</div>
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
                {loadingStates || updating ? <Loader2 className="w-4 h-4 animate-spin" /> : favorite ? <HeartOff className="w-5 h-5" /> : <Heart className="w-5 h-5" />}
              </button>
              <button
                onClick={handleToggleWatchlist}
                disabled={loadingStates || updating}
                title={watchlist ? 'Quitar de pendientes' : 'Añadir a pendientes'}
                className="w-10 h-10 rounded-full bg-neutral-700/60 hover:bg-neutral-600/80 backdrop-blur-sm border border-neutral-600/50 flex items-center justify-center text-white transition-colors disabled:opacity-60"
              >
                {loadingStates || updating ? <Loader2 className="w-4 h-4 animate-spin" /> : watchlist ? <BookmarkMinus className="w-5 h-5" /> : <BookmarkPlus className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ====================================================================
 * Portada de película ES->EN + preload + caché por movie.id
 * ==================================================================== */
function PosterImage({ movie, cache }) {
  const [posterPath, setPosterPath] = useState(
    movie.poster_path || movie.backdrop_path || movie.profile_path || null
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
      const preferred = await fetchMoviePosterEsThenEn(movie.id)
      const chosen =
        preferred ||
        movie.poster_path ||
        movie.backdrop_path ||
        movie.profile_path ||
        null
      const url = chosen ? buildImg(chosen, 'w300') : null
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
          src={buildImg(posterPath, 'w300')}
          alt={movie.title || movie.name}
          className="w-full h-full object-cover rounded-3xl aspect-[2/3] transition-transform duration-300 hover:scale-105"
          loading="lazy"
          decoding="async"
        />
      )}
    </>
  )
}

export default function MainDashboard({ sessionId = null }) {
  const [ready, setReady] = useState(false)
  const [dashboardData, setDashboardData] = useState({})
  const [hover, setHover] = useState(null)
  const isTouchDevice = useIsTouchDevice()

  const openTimerRef = useRef(null)
  const closeTimerRef = useRef(null)

  // Caché global de portadas (movie.id -> file_path)
  const posterCacheRef = useRef(new Map())

  useEffect(() => {
    const loadData = async () => {
      try {
        const [
          topRated, cult, mind, action, us, underrated, rising, trending, popular
        ] = await Promise.all([
          fetchTopRatedMovies(),
          fetchCultClassics(),
          fetchMindBendingMovies(),
          fetchTopActionMovies(),
          fetchPopularInUS(),
          fetchUnderratedMovies(),
          fetchRisingMovies(),
          fetchTrendingMovies(),
          fetchPopularMovies()
        ])

        const recommended = sessionId ? await fetchRecommendedMovies(sessionId) : []

        // Reemplazo para el hero ANTES de renderizar (sin flicker)
        const topRatedWithBackdrop = await Promise.all(
          topRated.map(async (m) => {
            const preferred = await fetchBackdropEsThenEn(m.id)
            return { ...m, backdrop_path: preferred || m.backdrop_path || null }
          })
        )

        setDashboardData({
          topRated: topRatedWithBackdrop,
          cult,
          mind,
          action,
          us,
          underrated,
          rising,
          trending,
          popular,
          recommended
        })
        setReady(true)
      } catch (err) {
        console.error('Error cargando dashboard:', err)
      }
    }
    loadData()
  }, [sessionId])

  if (!ready) return null

  /* ---------- Hover handlers ---------- */
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

  /* ---------- Fila reusable ---------- */
  const Row = ({ title, items }) => {
    if (!items || items.length === 0) return null

    const swiperRef = useRef(null)
    const [isHoveredRow, setIsHoveredRow] = useState(false)
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)

    // ¿Hay preview abierta de una película de ESTA fila?
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

    const showPrev = (isHoveredRow || hasActivePreview) && canPrev
    const showNext = (isHoveredRow || hasActivePreview) && canNext

    return (
      <div className="relative group">
        <h3 className="text-2xl sm:text-3xl md:text-4xl font-[730] text-primary-text mb-4 sm:text-left">
          <span className={`bg-gradient-to-b from-blue-600 via-blue-400 to-white bg-clip-text text-transparent tracking-widest uppercase ${anton.className}`}>
            {title}
          </span>
        </h3>

        <div
          className="relative"
          onMouseEnter={() => setIsHoveredRow(true)}
          onMouseLeave={() => setIsHoveredRow(false)}
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
            {items?.map((m) => (
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

          {/* Lateral izquierdo */}
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

          {/* Lateral derecho */}
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

  /* ---------- Carrusel hero ---------- */
  const TopRatedHero = () => {
    const swiperRef = useRef(null)
    const [isHoveredHero, setIsHoveredHero] = useState(false)
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)

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
      slideBy(-1)
    }

    const handleNextClick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      slideBy(1)
    }

    const showPrev = isHoveredHero && canPrev
    const showNext = isHoveredHero && canNext

    return (
      <div className="relative group mb-10 sm:mb-14">
        <div
          className="relative"
          onMouseEnter={() => setIsHoveredHero(true)}
          onMouseLeave={() => setIsHoveredHero(false)}
        >
          <Swiper
            spaceBetween={20}
            slidesPerView={3}
            autoplay={{ delay: 5000 }}
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
            modules={[Navigation, Autoplay]}
            className="group relative"
            breakpoints={{
              0: { slidesPerView: 1, spaceBetween: 12 },
              640: { slidesPerView: 2, spaceBetween: 16 },
              1024: { slidesPerView: 3, spaceBetween: 20 }
            }}
          >
            {dashboardData.topRated?.map((movie) => (
              <SwiperSlide key={movie.id}>
                <Link href={`/details/movie/${movie.id}`}>
                  <div className="relative cursor-pointer overflow-hidden rounded-3xl">
                    <img
                      src={buildImg(movie.backdrop_path, 'w1280')}
                      srcSet={`${buildImg(movie.backdrop_path, 'w780')} 780w, ${buildImg(
                        movie.backdrop_path,
                        'w1280'
                      )} 1280w, ${buildImg(movie.backdrop_path, 'original')} 2400w`}
                      sizes="(min-width:1536px) 1200px, (min-width:1280px) 1100px, (min-width:1024px) 900px, 95vw"
                      alt={movie.title}
                      className="w-full h-full object-cover rounded-3xl hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </Link>
              </SwiperSlide>
            ))}
          </Swiper>

          {/* Flecha izquierda hero */}
          {showPrev && (
            <button
              type="button"
              onClick={handlePrevClick}
              className="absolute inset-y-0 left-0 w-32 z-20
                         hidden sm:flex items-center justify-start
                         bg-gradient-to-r from-black/75 via-black/45 to-transparent
                         hover:from-black/90 hover:via-black/65
                         transition-colors pointer-events-auto"
            >
              <span className="ml-6 text-4xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
                ‹
              </span>
            </button>
          )}

          {/* Flecha derecha hero */}
          {showNext && (
            <button
              type="button"
              onClick={handleNextClick}
              className="absolute inset-y-0 right-0 w-32 z-20
                         hidden sm:flex items-center justify-end
                         bg-gradient-to-l from-black/75 via-black/45 to-transparent
                         hover:from-black/90 hover:via-black/65
                         transition-colors pointer-events-auto"
            >
              <span className="mr-6 text-4xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
                ›
              </span>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-6 text-white bg-black">
      <TopRatedHero />

      <div className="space-y-12">
        <Row title="Populares" items={dashboardData.popular} />
        <Row title="Tendencias Semanales" items={dashboardData.trending} />
        <Row title="Guiones Complejos" items={dashboardData.mind} />
        <Row title="Top Acción" items={dashboardData.action} />
        <Row title="Populares en EE.UU." items={dashboardData.us} />
        <Row title="Películas de Culto" items={dashboardData.cult} />
        <Row title="Infravaloradas" items={dashboardData.underrated} />
        <Row title="En Ascenso" items={dashboardData.rising} />
        {dashboardData.recommended?.length > 0 && (
          <Row title="Recomendadas Para Ti" items={dashboardData.recommended} />
        )}
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
