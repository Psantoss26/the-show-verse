'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Autoplay } from 'swiper'
import { AnimatePresence, motion } from 'framer-motion'
import 'swiper/swiper-bundle.css'
import Link from 'next/link'
import { Anton } from 'next/font/google'

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
} from '@/lib/api/tmdb'

const anton = Anton({ weight: '400', subsets: ['latin'] })

/* ---------- helpers ---------- */
const yearOf = (m) =>
  m?.release_date?.slice(0, 4) || m?.first_air_date?.slice(0, 4) || ''
const ratingOf = (m) =>
  typeof m?.vote_average === 'number' && m.vote_average > 0
    ? m.vote_average.toFixed(1)
    : '–'
const short = (t = '', n = 420) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

/* ---------- Portal flotante grande (tipo Netflix/Prime) ---------- */
function HoverPreviewPortal({ open, anchorRect, movie, onClose }) {
  // Tamaño del panel: ancho grande con límite a viewport
  const GAP = 12
  const MIN_W = 420
  const MAX_W = 750

  const calc = useCallback(() => {
    if (!anchorRect) return { left: 0, top: 0, width: MIN_W }
    const vw = window.innerWidth
    const w = Math.min(MAX_W, Math.max(MIN_W, anchorRect.width * 2.6))
    // centrar respecto al centro del póster
    let left = anchorRect.left + anchorRect.width / 2 - w / 2
    // clamp a viewport
    left = Math.max(8, Math.min(left, vw - w - 8))
    // que el top pegue un poco arriba del póster, pero sin salirse
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

  // Cierre suave para permitir pasar del póster al panel
  const leaveTimer = useRef(null)
  const startClose = () => {
    clearTimeout(leaveTimer.current)
    leaveTimer.current = setTimeout(onClose, 120)
  }
  const cancelClose = () => clearTimeout(leaveTimer.current)

  if (!open || !movie || !anchorRect) return null

  const backdrop = movie.backdrop_path || movie.poster_path
  const href = `/details/movie/${movie.id}`

  return (
    <AnimatePresence>
      <motion.div
        key={movie.id}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        onMouseEnter={cancelClose}
        onMouseLeave={startClose}
        style={{
          position: 'fixed',
          left: pos.left,
          top: pos.top,
          width: pos.width,
          zIndex: 80,
          pointerEvents: 'auto',
        }}
        className="rounded-3xl overflow-hidden bg-[#0b0b0b] border border-neutral-800 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        {/* Imagen horizontal grande */}
        <Link href={href} className="block">
          <img
            src={`https://image.tmdb.org/t/p/w1280${backdrop}`}
            alt={movie.title || movie.name}
            className="w-full object-cover aspect-video"
            loading="lazy"
          />
        </Link>

        {/* Banda inferior con detalles */}
        <div className="p-4 md:p-5">
          <div className="mb-1 flex items-center gap-3 text-sm text-neutral-300">
            {yearOf(movie) && <span>{yearOf(movie)}</span>}
            <span className="flex items-center gap-1">
              <span className="text-yellow-400">★</span>
              {ratingOf(movie)}
            </span>
          </div>

          <h4 className="text-xl md:text-2xl font-semibold mb-2">
            {movie.title || movie.name}
          </h4>

          {movie.overview && (
            <p className="text-sm md:text-base text-neutral-200 leading-relaxed">
              {short(movie.overview)}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Link href={href}>
              <button className="px-4 py-2 rounded-2xl bg-white text-black text-sm font-semibold hover:bg-neutral-200 transition-colors">
                Ver detalles
              </button>
            </Link>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default function MainDashboard({ sessionId = null }) {
  const [ready, setReady] = useState(false)
  const [dashboardData, setDashboardData] = useState({})
  const [hover, setHover] = useState(null) // { movie, rect }

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
          popular,
        ] = await Promise.all([
          fetchTopRatedMovies(),
          fetchCultClassics(),
          fetchMindBendingMovies(),
          fetchTopActionMovies(),
          fetchPopularInUS(),
          fetchUnderratedMovies(),
          fetchRisingMovies(),
          fetchTrendingMovies(),
          fetchPopularMovies(),
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
          recommended,
        })

        setReady(true)
      } catch (err) {
        console.error('Error cargando dashboard:', err)
      }
    }

    loadData()
  }, [sessionId])

  if (!ready) return null

  const sections = [
    { title: 'Populares', key: 'popular' },
    { title: 'Tendencias Semanales', key: 'trending' },
    { title: 'Guiones Complejos', key: 'mind' },
    { title: 'Top Acción', key: 'action' },
    { title: 'Populares en EE.UU.', key: 'us' },
    { title: 'Películas de Culto', key: 'cult' },
    { title: 'Infravaloradas', key: 'underrated' },
    { title: 'En Ascenso', key: 'rising' },
    ...(dashboardData.recommended?.length > 0
      ? [{ title: 'Recomendadas Para Ti', key: 'recommended' }]
      : []),
  ]

  /* ---------- handlers hover ---------- */
  const onEnter = (movie, e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHover({ movie, rect })
  }
  const onLeave = () => {
    // damos margen para poder entrar en el panel
    setTimeout(() => setHover((h) => (h?.locked ? h : null)), 80)
  }
  const closeHover = () => setHover(null)

  /* ---------- Sección reusable (cada fila) ---------- */
  const Row = ({ title, items, sectionKey }) => (
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
          1280: { slidesPerView: 10, spaceBetween: 20 },
        }}
      >
        {items?.map((m) => (
          <SwiperSlide key={m.id}>
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

  /* ---------- Carrusel hero (igual que tenías) ---------- */
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
          1024: { slidesPerView: 3, spaceBetween: 20 },
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
        <Row title="Populares" items={dashboardData.popular} sectionKey="popular" />
        <Row title="Tendencias Semanales" items={dashboardData.trending} sectionKey="trending" />
        <Row title="Guiones Complejos" items={dashboardData.mind} sectionKey="mind" />
        <Row title="Top Acción" items={dashboardData.action} sectionKey="action" />
        <Row title="Populares en EE.UU." items={dashboardData.us} sectionKey="us" />
        <Row title="Películas de Culto" items={dashboardData.cult} sectionKey="cult" />
        <Row title="Infravaloradas" items={dashboardData.underrated} sectionKey="underrated" />
        <Row title="En Ascenso" items={dashboardData.rising} sectionKey="rising" />
        {dashboardData.recommended?.length > 0 && (
          <Row title="Recomendadas Para Ti" items={dashboardData.recommended} sectionKey="recommended" />
        )}
      </div>

      {/* Panel grande fuera del flujo, pegado a la tarjeta hovered */}
      <HoverPreviewPortal
        open={!!hover?.movie}
        anchorRect={hover?.rect || null}
        movie={hover?.movie || null}
        onClose={closeHover}
      />
    </div>
  )
}
