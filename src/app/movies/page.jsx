'use client'

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation } from 'swiper'
import 'swiper/swiper-bundle.css'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { Anton } from 'next/font/google'
import { Heart, HeartOff, BookmarkPlus, BookmarkMinus, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

// [MODIFICADO] fetchTopRatedTMDb ya no se importa
import { fetchTopRatedIMDb } from '@/lib/api/tmdb'
import {
  fetchMovieSections,
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getMovieDetails,
  getExternalIds,
} from '@/lib/api/tmdb'
import { fetchOmdbByImdb } from '@/lib/api/omdb'

const anton = Anton({ weight: '400', subsets: ['latin'] })

/* ---------- helpers ---------- */
const yearOf = (m) => m?.release_date?.slice(0, 4) || ''
const ratingOf = (m) =>
  typeof m?.vote_average === 'number' && m.vote_average > 0 ? m.vote_average.toFixed(1) : '–'
const short = (t = '', n = 420) => (t.length > n ? t.slice(0, n - 1) + '…' : t)
const formatRuntime = (mins) => {
  if (!mins || typeof mins !== 'number') return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h <= 0) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

/* ---------- logos TMDB / IMDb ---------- */
function ImdbIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="8" fill="#F5C518" />
      <path d="M12 20h6v24h-6V20zm10 0h4l3 14 3-14h4v24h-4V28l-3 16h-2l-3-16v16h-4V20zm24 0h6c4 0 6 2.3 6 6.2V38c0 3.9-2 6-6 6h-6V20zm6 20c1.6 0 2-.7 2-2.5v-9c0-1.8-.4-2.5-2-2.5h-2v14h2z" fill="#000"/>
    </svg>
  )
}
function TmdbIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden>
      <rect width="256" height="256" rx="40" fill="#01d277" />
      <text x="50%" y="57%" textAnchor="middle" fontSize="120" fontWeight="700" fill="#003b2b" fontFamily="Arial,Helvetica,sans-serif">TM</text>
      <text x="50%" y="82%" textAnchor="middle" fontSize="120" fontWeight="700" fill="#003b2b" fontFamily="Arial,Helvetica,sans-serif">Db</text>
    </svg>
  )
}

/* ---------- IMÁGENES LOCALIZADAS: ES → EN ---------- */
async function fetchLocalizedPair(type, id) {
  try {
    const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&include_image_language=es-ES,es,en-US,en`
    const r = await fetch(url, { cache: 'force-cache' })
    const j = await r.json()
    const all = Array.isArray(j?.backdrops) ? j.backdrops : []
    const es = all.filter(b => b.iso_639_1 === 'es' || b.iso_639_1 === 'es-ES')
    const en = all.filter(b => b.iso_639_1 === 'en' || b.iso_639_1 === 'en-US')
    const pick = (arr) => {
      const a = arr.slice().sort((A,B) => (B.vote_count||0)-(A.vote_count||0))
      return [a[0]?.file_path || null, a[1]?.file_path || (a[0]?.file_path || null)]
    }
    let [card, preview] = pick(es)
    if (!card) [card, preview] = pick(en)
    return { card, preview }
  } catch {
    return { card: null, preview: null }
  }
}

async function prefetchListWithLimit(list, type, cacheRef, limit = 8) {
  const q = [...list]
  const workers = new Array(Math.min(limit, q.length)).fill(0).map(async () => {
    while (q.length) {
      const item = q.shift()
      if (!item) break
      if (!cacheRef.current.has(item.id)) {
        const pair = await fetchLocalizedPair(type, item.id)
        cacheRef.current.set(item.id, pair)
      }
      const pair = cacheRef.current.get(item.id)
      item._locCard = pair.card || item.backdrop_path || item.poster_path || null
      item._locPreview = pair.preview || item._locCard
    }
  })
  await Promise.all(workers)
}

/* ---------- PREVIEW (sin pedir imágenes; usa las ya prefetched) ---------- */
function HoverPreview({ open, anchorRect, movie, onClose, locCacheRef }) {
  const { session, account } = useAuth()
  const [favorite, setFavorite] = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [loadingStates, setLoadingStates] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const [extras, setExtras] = useState({ runtime: null, awards: null, imdbRating: null })

  const pair = movie ? (locCacheRef.current.get(movie.id) || { card: movie._locCard, preview: movie._locPreview }) : null
  const previewBackdrop = pair?.preview || pair?.card || null

  // posición/anchura
  const MIN_W = 520, MAX_W = 820
  const computePos = useCallback(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920
    const rect = anchorRect || { left: 0, top: 0, width: 360 }
    const w = Math.min(MAX_W, Math.max(MIN_W, rect.width * 2.3))
    let left = rect.left + rect.width / 2 - w / 2
    left = Math.max(8, Math.min(left, vw - w - 8))
    let top = rect.top - 12
    if (top < 8) top = 8
    return { left, top, width: w }
  }, [anchorRect])
  const [pos, setPos] = useState(() => computePos())
  useEffect(() => {
    const u = () => setPos(computePos())
    u()
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', u)
      window.addEventListener('scroll', u, { passive: true })
      return () => { window.removeEventListener('resize', u); window.removeEventListener('scroll', u) }
    }
  }, [computePos])

  // hover grace
  const t = useRef(null)
  const startClose = () => { clearTimeout(t.current); t.current = setTimeout(onClose, 120) }
  const cancelClose = () => clearTimeout(t.current)

  // Cache/Rate-limit para estados de cuenta
  const STATES_TTL = 120000
  const statesCacheRef = useRef(new Map())
  const inflightRef = useRef(new Map())
  const gateRef = useRef({
    queue: [], active: 0, MAX_ACTIVE: 1, GAP_MS: 350,
    run() {
      if (!this.queue.length || this.active >= this.MAX_ACTIVE) return
      this.active++
      const { fn, resolve, reject } = this.queue.shift()
      fn().then(resolve).catch(reject).finally(() => {
        this.active--; setTimeout(() => this.run(), this.GAP_MS)
      })
    },
    exec(fn) { return new Promise((resolve, reject) => { this.queue.push({ fn, resolve, reject }); this.run() }) }
  })

  useEffect(() => {
    let cancel = false
    if (!open || !movie || !session || !account?.id) { setFavorite(false); setWatchlist(false); return }
    const now = Date.now()
    const cached = statesCacheRef.current.get(movie.id)
    if (cached && now - cached.t < STATES_TTL) {
      setFavorite(!!cached.favorite); setWatchlist(!!cached.watchlist); return
    }
    const delay = setTimeout(async () => {
      if (cancel) return
      try {
        setLoadingStates(true)
        let p = inflightRef.current.get(movie.id)
        if (!p) {
          p = gateRef.current.exec(() => getMediaAccountStates('movie', movie.id, session))
          inflightRef.current.set(movie.id, p)
        }
        const st = await p
        if (cancel) return
        const next = { favorite: !!st.favorite, watchlist: !!st.watchlist, t: Date.now() }
        statesCacheRef.current.set(movie.id, next)
        setFavorite(next.favorite); setWatchlist(next.watchlist)
      } catch {}
      finally { inflightRef.current.delete(movie.id); if (!cancel) setLoadingStates(false) }
    }, 200)
    return () => { cancel = true; clearTimeout(delay) }
  }, [open, movie, session, account])

  // extras (cache local)
  const extrasCache = useRef(new Map())
  useEffect(() => {
    let abort = false
    const run = async () => {
      if (!open || !movie) return
      const cached = extrasCache.current.get(movie.id)
      if (cached) { setExtras(cached); return }
      let runtime = null, awards = null, imdbRating = null
      try {
        const d = await getMovieDetails(movie.id)
        runtime = d?.runtime ?? null
        let imdb = d?.imdb_id
        if (!imdb) {
          const ext = await getExternalIds('movie', movie.id)
          imdb = ext?.imdb_id || null
        }
        if (imdb) {
          const omdb = await fetchOmdbByImdb(imdb)
          const raw = omdb?.Awards
          if (raw && typeof raw === 'string' && raw.trim()) awards = raw.trim()
          if (omdb?.imdbRating && omdb.imdbRating !== 'N/A') imdbRating = Number(omdb.imdbRating)
        }
      } catch {}
      const next = { runtime, awards, imdbRating }
      extrasCache.current.set(movie.id, next)
      if (!abort) setExtras(next)
    }
    run()
    return () => { abort = true }
  }, [open, movie])

  const requireLogin = () => { if (!session || !account?.id) { window.location.href = '/login'; return true } return false }
  const toggleFav = async () => {
    if (requireLogin() || updating || !movie) return
    try {
      setUpdating(true); setError('')
      const next = !favorite; setFavorite(next)
      await markAsFavorite({ accountId: account.id, sessionId: session, type: 'movie', mediaId: movie.id, favorite: next })
    } catch { setFavorite(v => !v); setError('No se pudo actualizar favoritos.') }
    finally { setUpdating(false) }
  }
  const toggleWatch = async () => {
    if (requireLogin() || updating || !movie) return
    try {
      setUpdating(true); setError('')
      const next = !watchlist; setWatchlist(next)
      await markInWatchlist({ accountId: account.id, sessionId: session, type: 'movie', mediaId: movie.id, watchlist: next })
    } catch { setWatchlist(v => !v); setError('No se pudo actualizar pendientes.') }
    finally { setUpdating(false) }
  }

  const href = movie ? `/details/movie/${movie.id}` : '#'
  if (!open || !movie || !anchorRect || !previewBackdrop) return null

  return (
    <AnimatePresence>
      <motion.div
        key={movie.id}
        initial={{ opacity: 0, scale: 0.92, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 14 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        onMouseEnter={cancelClose}
        onMouseLeave={startClose}
        style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, zIndex: 80, pointerEvents: 'auto' }}
        className="rounded-3xl overflow-hidden bg-[#0b0b0b] border border-neutral-800 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        <Link href={href} className="block relative">
          <img
            src={`https://image.tmdb.org/t/p/w1280${previewBackdrop}`}
            srcSet={`https://image.tmdb.org/t/p/w780${previewBackdrop} 780w, https://image.tmdb.org/t/p/w1280${previewBackdrop} 1280w`}
            sizes="(min-width:1536px) 820px, (min-width:1280px) 760px, (min-width:1024px) 660px, 90vw"
            alt={movie.title}
            className="w-full object-cover aspect-video"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-[#0b0b0b] to-transparent" />
        </Link>

        <div className="p-4 md:p-5 pt-3">
          <div className="mb-1 flex items-center gap-3 text-sm text-neutral-300 flex-wrap">
            {yearOf(movie) && <span>{yearOf(movie)}</span>}
            {extras.runtime && <span>• {formatRuntime(extras.runtime)}</span>}
            <span className="flex items-center gap-1"><TmdbIcon className="w-5 h-5"/>{ratingOf(movie)}</span>
            {typeof extras.imdbRating === 'number' && (
              <span className="flex items-center gap-1"><ImdbIcon className="w-5 h-5"/>{extras.imdbRating.toFixed(1)}</span>
            )}
          </div>

          <h4 className="text-lg md:text-xl font-semibold mb-1">{movie.title}</h4>

          {extras.awards && <div className="mt-1 text-[12px] md:text-xs text-emerald-300">{extras.awards}</div>}

          {movie.overview && (
            <p className="mt-2 text-sm md:text-[15px] text-neutral-200 leading-relaxed line-clamp-3">
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
                onClick={toggleFav}
                disabled={loadingStates || updating}
                title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                className="w-10 h-10 rounded-full bg-neutral-700/60 hover:bg-neutral-600/80 backdrop-blur-sm border border-neutral-600/50 flex items-center justify-center text-white transition-colors disabled:opacity-60"
              >
                {loadingStates || updating ? <Loader2 className="w-4 h-4 animate-spin" /> : favorite ? <HeartOff className="w-5 h-5" /> : <Heart className="w-5 h-5" />}
              </button>

              <button
                onClick={toggleWatch}
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

/* ---------- Tarjeta (usa _locCard ya precargado) ---------- */
function MovieCard({ movie, onEnter, onLeave }) {
  const img = movie._locCard
  const imdbBadge = movie?._imdb?.rating

  return (
    <div
      className="relative rounded-3xl overflow-hidden cursor-pointer"
      onMouseEnter={(e) => onEnter(movie, e.currentTarget)}
      onMouseLeave={onLeave}
    >
      {img ? (
        <img
          src={`https://image.tmdb.org/t/p/w780${img}`}
          srcSet={`https://image.tmdb.org/t/p/w780${img} 780w, https://image.tmdb.org/t/p/w1280${img} 1280w`}
          sizes="(min-width:1536px) 600px, (min-width:1280px) 520px, (min-width:1024px) 440px, (min-width:768px) 360px, 88vw"
          alt={movie.title}
          className="w-full aspect-video object-cover transition-transform duration-200 hover:scale-[1.03]"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="w-full aspect-video bg-neutral-800 flex items-center justify-center">
          <span className="text-neutral-300 text-xs px-2 text-center">{movie.title}</span>
        </div>
      )}
      {imdbBadge && (
        <span className="absolute top-2 left-2 bg-[#F5C518] text-black text-xs font-bold px-2 py-0.5 rounded">
          IMDb {Number(imdbBadge).toFixed(1)}
        </span>
      )}
    </div>
  )
}

/* ---------- Página ---------- */
export default function MoviesPage() {
  const [sections, setSections] = useState({})
  const [ready, setReady] = useState(false)

  // Hover
  const [hoverId, setHoverId] = useState(null)
  const hoverMovieRef = useRef(null)
  const anchorRectRef = useRef(null)

  // Caché de imágenes localizadas
  const locCacheRef = useRef(new Map())

  // timers
  const openTimer = useRef(null)
  const closeTimer = useRef(null)
  const clearOpen = () => openTimer.current && clearTimeout(openTimer.current)
  const clearClose = () => closeTimer.current && clearTimeout(closeTimer.current)

  const pageRand = useMemo(() => Math.max(1, Math.floor(Math.random() * 10) + 1), [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // [MODIFICADO] 1) Traemos datos base, quitamos tmdbTop
        const [base, imdbTop] = await Promise.all([
          fetchMovieSections({ pageRand }),
          // fetchTopRatedTMDb({ type: 'movie', minVotes: 1000, page: 1 }), // <-- ELIMINADO
          fetchTopRatedIMDb({ type: 'movie', pages: 3, limit: 20, minVotes: 15000 }),
        ])
        if (!alive) return

        // [MODIFICADO] 2) Prefetch imágenes localizadas
        const tmp = {
          // 'Más votadas (TMDb)': tmdbTop || [], // <-- ELIMINADO
          'Más votadas (IMDb)': imdbTop || [],
          ...(base || {}),
        }

        // prefetch por cada sección con límite de concurrencia
        const allLists = Object.values(tmp).filter(Array.isArray)
        for (const list of allLists) {
          await prefetchListWithLimit(list, 'movie', locCacheRef, 8)
        }

        // 3) Guardamos secciones decoradas y activamos UI
        setSections(tmp)
        setReady(true)
      } catch (e) {
        console.error(e)
      }
    })()
    return () => { alive = false; clearOpen(); clearClose() }
  }, [pageRand])

  const handleEnterCard = useCallback((movie, el) => {
    clearClose()
    if (!el || typeof el.getBoundingClientRect !== 'function') return
    const rect = el.getBoundingClientRect()
    if (hoverId === movie.id) return
    clearOpen()
    openTimer.current = setTimeout(() => {
      anchorRectRef.current = rect
      hoverMovieRef.current = movie
      setHoverId(movie.id)
    }, 120)
  }, [hoverId])

  const handleLeaveCard = useCallback(() => {
    clearOpen()
    clearClose()
    closeTimer.current = setTimeout(() => {
      setHoverId(null)
      hoverMovieRef.current = null
      anchorRectRef.current = null
    }, 120)
  }, [])

  const closePreviewNow = useCallback(() => {
    clearOpen(); clearClose()
    setHoverId(null)
    hoverMovieRef.current = null
    anchorRectRef.current = null
  }, [])

  if (!ready) return null

  const Row = ({ title, items }) => (
    <div className="relative group mb-10">
      <h2 className={`mb-4 text-2xl sm:text-3xl font-[730] bg-gradient-to-b from-blue-600 via-blue-400 to-white bg-clip-text text-transparent uppercase tracking-widest ${anton.className}`}>
        {title}
      </h2>

      <Swiper
        spaceBetween={18}
        slidesPerView={6.2}
        navigation
        modules={[Navigation]}
        breakpoints={{
          0: { slidesPerView: 1.3, spaceBetween: 10 },
          480: { slidesPerView: 2.1, spaceBetween: 12 },
          768: { slidesPerView: 3.5, spaceBetween: 14 },
          1024: { slidesPerView: 5, spaceBetween: 16 },
          1280: { slidesPerView: 6.2, spaceBetween: 18 },
        }}
        className="group"
      >
        {items?.map((m) => (
          <SwiperSlide key={`${title}-${m.id}`}>
            <MovieCard movie={m} onEnter={handleEnterCard} onLeave={handleLeaveCard} />
          </SwiperSlide>
        ))}
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
    <div className="px-6 md:px-8 py-6 text-white bg-black">
      {/* [MODIFICADO] Se eliminan TMDb y 'Más votadas', se renombra IMDb */}
      {/* {sections['Más votadas (TMDb)']?.length ? <Row title="Más votadas (TMDb)" items={sections['Más votadas (TMDb)']} /> : null} */}
      {sections['Más votadas (IMDb)']?.length ? <Row title="Más votadas" items={sections['Más votadas (IMDb)']} /> : null}
      {/* {sections['Más votadas']?.length ? <Row title="Más votadas" items={sections['Más votadas']} /> : null} */}
      
      {sections['Década de 1990']?.length ? <Row title="Década de 1990" items={sections['Década de 1990']} /> : null}
      {sections['Década de 2000']?.length ? <Row title="Década de 2000" items={sections['Década de 2000']} /> : null}
      {sections['Década de 2010']?.length ? <Row title="Década de 2010" items={sections['Década de 2010']} /> : null}
      {sections['Década de 2020']?.length ? <Row title="Década de 2020" items={sections['Década de 2020']} /> : null}
      {sections['Premiadas']?.length ? <Row title="Premiadas" items={sections['Premiadas']} /> : null}
      {sections['Top 10 hoy en España']?.length ? <Row title="Top 10 hoy en España" items={sections['Top 10 hoy en España']} /> : null}
      {sections['Superéxito']?.length ? <Row title="Películas de superéxito" items={sections['Superéxito']} /> : null}
      <GenreRows groups={sections['Por género']} />

      <HoverPreview
        open={!!hoverId && !!hoverMovieRef.current}
        anchorRect={anchorRectRef.current}
        movie={hoverMovieRef.current}
        onClose={closePreviewNow}
        locCacheRef={locCacheRef}
      />
    </div>
  )
}