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
  getLogos,
  // estados/acciones de cuenta
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  // helpers TMDB para runtime / external ids
  getMovieDetails,
  getExternalIds
} from '@/lib/api/tmdb'

import { fetchOmdbByImdb } from '@/lib/api/omdb'

const anton = Anton({ weight: '400', subsets: ['latin'] })

/* --- Hook para detectar dispositivo táctil --- */
const useIsTouchDevice = () => {
  const [isTouch, setIsTouch] = useState(false)
  useEffect(() => {
    // Solo se ejecuta en el cliente
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

/* ---------- Portal flotante grande ---------- */
function HoverPreviewPortal({ open, anchorRect, movie, onClose, onCancelClose }) {
  const { session, account } = useAuth()

  // Estados de cuenta
  const [loadingStates, setLoadingStates] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  // Extras
  const [extras, setExtras] = useState({ runtime: null, awards: null, imdbRating: null })
  const extrasCache = useRef(new Map())

  // Cargar estados (fav/watchlist)
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
        if (!cancel) {
          setFavorite(!!st.favorite)
          setWatchlist(!!st.watchlist)
        }
      } catch (e) { console.error(e) } 
      finally { if (!cancel) setLoadingStates(false) }
    }
    load()
    return () => { cancel = true }
  }, [open, movie, session, account])

  // Cargar extras (runtime + premios + imdbRating)
  useEffect(() => {
    let abort = false
    const loadExtras = async () => {
      if (!open || !movie) {
        setExtras({ runtime: null, awards: null, imdbRating: null })
        return
      }

      const cached = extrasCache.current.get(movie.id)
      if (cached) {
        setExtras(cached)
        return
      }
      
      setExtras({ runtime: null, awards: null, imdbRating: null });

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
        if (!abort) {
          extrasCache.current.set(movie.id, next)
          setExtras(next)
        }
      } catch (e) {
        if (!abort) setExtras({ runtime: null, awards: null, imdbRating: null })
      }
    }
    loadExtras()
    return () => { abort = true }
  }, [open, movie])

  // Layout/posición del panel
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

  const backdrop = movie.backdrop_path || movie.poster_path
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
    } catch (e) {
      console.error(e)
      setFavorite((v) => !v)
      setError('No se pudo actualizar favoritos.')
    } finally {
      setUpdating(false)
    }
  }

  const handleToggleWatchlist = async () => {
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
    } catch (e) {
      console.error(e)
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
        style={{
          position: 'fixed',
          left: pos.left,
          top: pos.top,
          width: pos.width,
          zIndex: 80,
          pointerEvents: 'auto'
        }}
        className="hidden lg:block rounded-3xl overflow-hidden bg-[#0b0b0b] border border-neutral-800 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        {/* Imagen horizontal */}
        <Link href={href} className="block relative group/preview">
          <img
            src={`https://image.tmdb.org/t/p/w1280${backdrop}`}
            alt={movie.title || movie.name}
            className="w-full object-cover aspect-video"
            loading="lazy"
          />
          <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-[#0b0b0b] to-transparent" />
        </Link>

        {/* Detalles + acciones */}
        <div className="p-4 md:p-5 pt-3">
          <div className="mb-1 flex items-center gap-3 text-sm text-neutral-300 flex-wrap">
            {yearOf(movie) && <span>{yearOf(movie)}</span>}
            {extras?.runtime && <span>• {formatRuntime(extras.runtime)}</span>}

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

export default function MainDashboard({ sessionId = null }) {
  const [ready, setReady] = useState(false)
  const [dashboardData, setDashboardData] = useState({})
  const [hover, setHover] = useState(null)
  const isTouchDevice = useIsTouchDevice()

  const openTimerRef = useRef(null)
  const closeTimerRef = useRef(null)
 
  const prevRef = useRef(null)
  const nextRef = useRef(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [
          topRated,
          cult,
          mind,
          action,
          us,
          underrated,
          rising,
          trending,
          popular
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

        const recommended = sessionId
          ? await fetchRecommendedMovies(sessionId)
          : []

        const topRatedWithLogos = await Promise.all(
          topRated.map(async (movie) => {
            const logo = await getLogos('movie', movie.id)
            return { ...movie, logo_path: logo }
          })
        )

        setDashboardData({
          topRated: topRatedWithLogos,
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

  /* ---------- [MODIFICADO] handlers hover con lógica de swap ---------- */
  
  const onEnter = (movie, e) => {
    if (isTouchDevice) return; 
    
    const rect = e.currentTarget.getBoundingClientRect();
    
    clearTimeout(closeTimerRef.current);
    clearTimeout(openTimerRef.current);
    
    if (hover) {
      // Si el portal YA ESTÁ ABIERTO, cambia el contenido inmediatamente
      setHover({ movie, rect });
    } else {
      // Si el portal ESTÁ CERRADO, espera 400ms para abrirlo
      openTimerRef.current = setTimeout(() => {
        setHover({ movie, rect });
      }, 400); // 400ms de retraso
    }
  };

  const onLeave = () => {
    if (isTouchDevice) return;
    
    clearTimeout(openTimerRef.current); // Cancela cualquier apertura pendiente
    
    closeTimerRef.current = setTimeout(() => {
      setHover(null);
    }, 150); // 150ms de gracia
  };

  const cancelCloseHover = () => {
      if (isTouchDevice) return;
      clearTimeout(closeTimerRef.current);
  };
  
  const closeHover = () => {
    clearTimeout(openTimerRef.current);
    clearTimeout(closeTimerRef.current);
    setHover(null);
  };

  /* ---------- Sección reusable (cada fila) ---------- */
  const Row = ({ title, items }) => (
    <div className="relative group">
      <h3 className="text-2xl sm:text-3xl md:text-4xl font-[730] text-primary-text mb-4 sm:text-left">
        <span
          className={`bg-gradient-to-b from-blue-600 via-blue-400 to-white bg-clip-text text-transparent tracking-widest uppercase ${anton.className}`}
        >
          {title}
        </span>
      </h3>

      <Swiper
        spaceBetween={20}
        slidesPerView={10}
        navigation={{ prevEl: prevRef.current, nextEl: nextRef.current }}
        onInit={(swiper) => {
          swiper.params.navigation.prevEl = prevRef.current
          swiper.params.navigation.nextEl = nextRef.current
          swiper.navigation.init()
          swiper.navigation.update()
        }}
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
                <img
                  src={`https://image.tmdb.org/t/p/w300${m.poster_path || m.profile_path || m.backdrop_path}`}
                  alt={m.title || m.name}
                  className="w-full h-full object-cover rounded-3xl aspect-[2/3] transition-transform duration-300 hover:scale-105"
                  loading="lazy"
                />
              </div>
            </Link>
          </SwiperSlide>
        ))}

        <div
          ref={prevRef}
          className="swiper-button-prev !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        />
        <div
          ref={nextRef}
          className="swiper-button-next !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        />
      </Swiper>
    </div>
  )

  /* ---------- Carrusel hero ---------- */
  const TopRatedHero = () => (
    <div className="relative group mb-10 sm:mb-14">
      <Swiper
        spaceBetween={20}
        slidesPerView={3}
        autoplay={{ delay: 5000 }}
        navigation={{ prevEl: prevRef.current, nextEl: nextRef.current }}
        onInit={(swiper) => {
          swiper.params.navigation.prevEl = prevRef.current
          swiper.params.navigation.nextEl = nextRef.current
          swiper.navigation.init()
          swiper.navigation.update()
        }}
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
                  src={`https://image.tmdb.org/t/p/original${movie.backdrop_path}`}
                  alt={movie.title}
                  className="w-full h-full object-cover rounded-3xl hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                {movie.logo_path && (
                  <img
                    src={`https://image.tmdb.org/t/p/w200${movie.logo_path}`}
                    alt={`${movie.title} logo`}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 h-18 object-contain max-w-[50%] pointer-events-none"
                  />
                )}
              </div>
            </Link>
          </SwiperSlide>
        ))}
        <div
          ref={prevRef}
          className="swiper-button-prev hidden sm:flex !text-white !w-8 !h-8 !items-center !justify-center group-hover:opacity-100 transition-opacity duration-300"
        />
        <div
          ref={nextRef}
          className="swiper-button-next hidden sm:flex !text-white !w-8 !h-8 !items-center !justify-center group-hover:opacity-100 transition-opacity duration-300"
        />
      </Swiper>
    </div>
  )

  return (
    <div className="px-8 py-2 text-white bg-black">
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

      {/* Panel flotante */}
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