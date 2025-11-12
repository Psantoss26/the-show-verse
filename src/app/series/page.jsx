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
  // Importamos las funciones de descubrimiento
  fetchPopularMedia,
  fetchTopRatedIMDb,
  fetchMoviesByGenre, // Usamos la misma función, asumiendo que es genérica (recibe 'type')
  fetchMediaByKeyword,
  fetchTVSections, // Específica para series
  // Funciones de cuenta
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getDetails, // <-- [CORREGIDO] Importamos 'getDetails' en lugar de 'getTvDetails'
  getExternalIds
} from '@/lib/api/tmdb'

import { fetchOmdbByImdb } from '@/lib/api/omdb'

const anton = Anton({ weight: '400', subsets: ['latin'] })

/* --- Icons: IMDb + TMDb (inline SVG) --- */
const IMDbIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 64 64" className={className} aria-label="IMDb" role="img">
    <rect x="2" y="12" width="60" height="40" rx="6" fill="#F5C518" />
    <path
      d="M14 24h4v16h-4V24zm8 0h4v16h-4V24zm6 0h6c2.76 0 4 1.24 4 4v8c0 2.76-1.24 4-4 4h-6V24zm4 4v8h2c.67 0 1-.33 1-1v-6c0-.67-.33-1-1-1h-2zm12-4h4v16h-4V24z"
      fill="#000"
    />
  </svg>
)

const TMDbIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 64 64" className={className} aria-label="TMDb" role="img">
    <rect x="4" y="8" width="56" height="48" rx="10" fill="#01D277" />
    <path
      d="M18 24h-4v-4h12v4h-4v16h-4V24zm14-4h4l3 7 3-7h4v20h-4V28l-3 7h-2l-3-7v12h-4V20zm20 0h4v20h-4V20z"
      fill="#001A0F"
      opacity=".95"
    />
  </svg>
)

/* ---------- helpers ---------- */
// Modificado para priorizar 'first_air_date'
const yearOf = (m) =>
  m?.first_air_date?.slice(0, 4) || m?.release_date?.slice(0, 4) || ''

const ratingOf = (m) =>
  typeof m?.vote_average === 'number' && m.vote_average > 0
    ? m.vote_average.toFixed(1)
    : '–'

const short = (t = '', n = 420) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

// Misma función, recibirá el 'episode_run_time'
const formatRuntime = (mins) => {
  if (!mins || typeof mins !== 'number') return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h <= 0) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

/* ---------- Portal flotante grande (Lógica para Series) ---------- */
function HoverPreviewPortal({ open, anchorRect, show, onClose }) {
  const { session, account } = useAuth()

  // Estados de cuenta
  const [loadingStates, setLoadingStates] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  // Extras: incluye backdropPath, title y overview en español
  const [extras, setExtras] = useState({ 
    runtime: null, 
    awards: null, 
    imdbRating: null,
    backdropPath: null,
    title: null, // 'name' en el caso de series
    overview: null
  })
  const extrasCache = useRef(new Map())

  // Cargar estados (fav/watchlist)
  useEffect(() => {
    let cancel = false
    const load = async () => {
      if (!open || !show || !session || !account?.id) {
        setFavorite(false); setWatchlist(false); return
      }
      try {
        setLoadingStates(true)
        const type = show.media_type || 'tv' // <-- TIPO 'tv'
        const st = await getMediaAccountStates(type, show.id, session)
        if (!cancel) { setFavorite(!!st.favorite); setWatchlist(!!st.watchlist) }
      } catch (e) { console.error(e) } 
      finally { if (!cancel) setLoadingStates(false) }
    }
    load()
    return () => { cancel = true }
  }, [open, show, session, account])

  // Cargar extras (runtime, premios, E imágenes/texto en 'es')
  useEffect(() => {
    let abort = false
    const loadExtras = async () => {
      if (!open || !show) {
        setExtras({ runtime: null, awards: null, imdbRating: null, backdropPath: null, title: null, overview: null })
        return
      }

      const cached = extrasCache.current.get(show.id)
      if (cached) { setExtras(cached); return }

      try {
        let runtime = null
        let bestBackdrop = null
        let esTitle = null
        let esOverview = null
        
        try {
          // [CORREGIDO] Usamos getDetails('tv', ...)
          const details = await getDetails('tv', show.id, {
            language: 'es-ES',
            append_to_response: 'images',
            include_image_language: 'es,en,null'
          })
          
          runtime = details?.episode_run_time?.[0] ?? null
          esTitle = details?.name || null
          esOverview = details?.overview || null
          
          const esBackdrop = details?.images?.backdrops?.find(b => b.iso_639_1 === 'es');
          const enBackdrop = details?.images?.backdrops?.find(b => b.iso_639_1 === 'en');
          const defaultBackdrop = details?.images?.backdrops?.[0];
          bestBackdrop = esBackdrop?.file_path || enBackdrop?.file_path || defaultBackdrop?.file_path || null;

        } catch (e) { console.error("Error fetching details/images:", e) }

        let awards = null
        let imdbRating = null
        try {
          let imdb = show?.imdb_id
          if (!imdb) {
            const ext = await getExternalIds('tv', show.id)
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
        } catch (e) { console.error("Error fetching OMDb:", e) }

        const next = { runtime, awards, imdbRating, backdropPath: bestBackdrop, title: esTitle, overview: esOverview }
        if (!abort) {
          extrasCache.current.set(show.id, next)
          setExtras(next)
        }
      } catch (e) {
        if (!abort) setExtras({ runtime: null, awards: null, imdbRating: null, backdropPath: null, title: null, overview: null })
      }
    }
    loadExtras()
    return () => { abort = true }
  }, [open, show])

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

  // Hover grace period
  const leaveTimer = useRef(null)
  const startClose = () => {
    clearTimeout(leaveTimer.current)
    leaveTimer.current = setTimeout(onClose, 120)
  }
  const cancelClose = () => clearTimeout(leaveTimer.current)

  // Handlers de botones
  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = '/login'
      return true
    }
    return false
  }
  const handleToggleFavorite = async () => {
    if (requireLogin() || updating || !show) return
    try {
      setUpdating(true); setError('')
      const next = !favorite; setFavorite(next)
      await markAsFavorite({
        accountId: account.id, sessionId: session,
        type: show.media_type || 'tv', mediaId: show.id, favorite: next
      })
    } catch (e) {
      console.error(e); setFavorite((v) => !v); setError('No se pudo actualizar favoritos.')
    } finally { setUpdating(false) }
  }
  const handleToggleWatchlist = async () => {
    if (requireLogin() || updating || !show) return
    try {
      setUpdating(true); setError('')
      const next = !watchlist; setWatchlist(next)
      await markInWatchlist({
        accountId: account.id, sessionId: session,
        type: show.media_type || 'tv', mediaId: show.id, watchlist: next
      })
    } catch (e) {
      console.error(e); setWatchlist((v) => !v); setError('No se pudo actualizar pendientes.')
    } finally { setUpdating(false) }
  }


  if (!open || !show || !anchorRect) return null

  // Prioriza el backdrop, título y overview en español desde 'extras'
  const backdrop = extras.backdropPath || show.backdrop_path || show.poster_path
  const title = extras.title || show.name // 'name' para series
  const overview = extras.overview || show.overview
  const href = `/details/tv/${show.id}`

  return (
    <AnimatePresence>
      <motion.div
        key={show.id}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onMouseEnter={cancelClose}
        onMouseLeave={startClose}
        style={{
          position: 'fixed',
          left: pos.left,
          top: pos.top,
          width: pos.width,
          zIndex: 80,
          pointerEvents: 'auto'
        }}
        className="rounded-3xl overflow-hidden bg-[#0b0b0b] border border-neutral-800 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        <Link href={href} className="block relative group/preview">
          <img
            src={`https://image.tmdb.org/t/p/w1280${backdrop}`}
            alt={title}
            className="w-full object-cover aspect-video"
            loading="lazy"
          />
          <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-[#0b0b0b] to-transparent" />
        </Link>

        <div className="p-4 md:p-5 pt-3">
          <div className="mb-1 flex items-center gap-3 text-sm text-neutral-300 flex-wrap">
            {yearOf(show) && <span>{yearOf(show)}</span>}
            {extras?.runtime && <span>• {formatRuntime(extras.runtime)}</span>}
            <span className="inline-flex items-center gap-1.5">
              <TMDbIcon className="w-4 h-4" />
              <span className="font-medium">{ratingOf(show)}</span>
            </span>
            {typeof extras?.imdbRating === 'number' && (
              <span className="inline-flex items-center gap-1.5">
                <IMDbIcon className="w-4 h-4" />
                <span className="font-medium">{extras.imdbRating.toFixed(1)}</span>
              </span>
            )}
          </div>

          <h4 className="text-xl md:text-2xl font-semibold mb-2">
            {title}
          </h4>

          {extras?.awards && (
            <div className="mt-1 text-[12px] md:text-xs text-emerald-300">
              {extras.awards}
            </div>
          )}

          {overview && (
            <p className="mt-2 text-sm md:text-base text-neutral-200 leading-relaxed line-clamp-3">
              {short(overview)}
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

/* * ====================================================================
 * Componente Principal: SeriesPage
 * ====================================================================
 */
export default function SeriesPage({ sessionId = null }) {
  const [ready, setReady] = useState(false)
  const [dashboardData, setDashboardData] = useState({})
  const [hover, setHover] = useState(null) // { show, rect }

  const prevRef = useRef(null)
  const nextRef = useRef(null)

  // Carga de datos para la página de series
  useEffect(() => {
    const loadData = async () => {
      try {
        const lang = 'es-ES' // Pedimos todo en español
        
        const [
          popular,
          top_imdb,
          drama,
          scifi_fantasy,
          crime,
          animation,
          baseSections // Secciones de fetchTVSections
        ] = await Promise.all([
          fetchPopularMedia({ type: 'tv', language: lang }),
          fetchTopRatedIMDb({ type: 'tv', minVotes: 5000, language: lang, limit: 20 }), // Menos votos para series
          
          fetchMoviesByGenre({ type: 'tv', genreId: 18, minVotes: 1000, language: lang }), // Drama
          fetchMoviesByGenre({ type: 'tv', genreId: 10765, minVotes: 1000, language: lang }), // Sci-Fi & Fantasy
          fetchMoviesByGenre({ type: 'tv', genreId: 80, minVotes: 1000, language: lang }),  // Crimen
          fetchMoviesByGenre({ type: 'tv', genreId: 16, minVotes: 500, language: lang }), // Animación
          
          fetchTVSections ? fetchTVSections({ language: lang }) : Promise.resolve({}) // Asumiendo que esta función existe
        ])

        setDashboardData({
          popular,
          top_imdb,
          drama,
          scifi_fantasy,
          crime,
          animation,
          ...baseSections // Añadimos las secciones base (En emisión, etc.)
        })

        setReady(true)
      } catch (err) {
        console.error('Error cargando la página de series:', err)
      }
    }

    loadData()
  }, [])

  if (!ready) {
    return <div className="h-screen bg-black" />
  }

  /* ---------- handlers hover ---------- */
  const onEnter = (show, e) => { // Renombrado a 'show'
    const rect = e.currentTarget.getBoundingClientRect()
    setHover({ show, rect }) // Renombrado a 'show'
  }
  const onLeave = () => {
    setTimeout(() => setHover((h) => (h?.locked ? h : null)), 80)
  }
  const closeHover = () => setHover(null)

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
            <div
              className="relative cursor-pointer overflow-hidden rounded-3xl"
              onMouseEnter={(e) => onEnter(m, e)}
              onMouseLeave={onLeave}
            >
              {/* Usamos poster_path y aspect-[2/3] para portadas VERTICALES */}
              <img
                src={`https://image.tmdb.org/t/p/w342${m.poster_path}`}
                alt={m.name || m.title} // 'name' es principal para series
                className="w-full h-full object-cover rounded-3xl aspect-[2/3] transition-transform duration-300 hover:scale-105"
                loading="lazy"
              />
            </div>
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

  const GenreRows = ({ groups }) => (
    <>
      {Object.entries(groups || {}).map(([gname, list]) =>
        list?.length ? <Row key={`genre-${gname}`} title={`Por género — ${gname}`} items={list} /> : null
      )}
    </>
  )

  return (
    <div className="px-8 py-2 text-white bg-black">
      <div className="space-y-12 pt-10">
        {/* Filas de la página de series */}
        {dashboardData.popular?.length > 0 && (
          <Row title="Populares" items={dashboardData.popular} />
        )}
        {dashboardData.top_imdb?.length > 0 && (
          <Row title="Más Votadas" items={dashboardData.top_imdb} />
        )}
        {dashboardData.drama?.length > 0 && (
          <Row title="Dramas Populares" items={dashboardData.drama} />
        )}
        {dashboardData.scifi_fantasy?.length > 0 && (
          <Row title="Sci-Fi y Fantasía" items={dashboardData.scifi_fantasy} />
        )}
        {dashboardData.crime?.length > 0 && (
          <Row title="Series de Crimen" items={dashboardData.crime} />
        )}
         {dashboardData.animation?.length > 0 && (
          <Row title="Animación" items={dashboardData.animation} />
        )}

        {/* Filas de 'fetchTVSections' (En emisión, etc.) */}
        {dashboardData['Top 10 hoy en España']?.length ? <Row title="Top 10 hoy en España" items={dashboardData['Top 10 hoy en España']} /> : null}
        {dashboardData['En Emisión']?.length ? <Row title="En Emisión" items={dashboardData['En Emisión']} /> : null}
        {dashboardData['Aclamadas por la crítica']?.length ? <Row title="Aclamadas por la crítica" items={dashboardData['Aclamadas por la crítica']} /> : null}
        <GenreRows groups={dashboardData['Por género']} />
      </div>

      {/* Panel flotante */}
      <HoverPreviewPortal
        open={!!hover?.show}
        anchorRect={hover?.rect || null}
        show={hover?.show || null} // <-- Pasamos 'show'
        onClose={closeHover}
      />
    </div>
  )
}