// /src/app/watchlist/page.jsx
'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import { getExternalIds } from '@/lib/api/tmdb'
import { fetchOmdbByImdb } from '@/lib/api/omdb'
import {
  Loader2,
  Bookmark,
  Film,
  FilterX,
  ChevronDown,
  CheckCircle2,
  Calendar,
  ArrowUpDown,
} from 'lucide-react'

// ================== UTILS & CACHE ==================
const posterChoiceCache = new Map()
const posterInFlight = new Map()
const OMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000

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
  const key = type === 'tv' ? `showverse:tv:${id}:poster` : `showverse:movie:${id}:poster`
  return window.localStorage.getItem(key) || null
}

function pickBestPosterEN(posters) {
  if (!Array.isArray(posters) || posters.length === 0) return null

  const maxVotes = posters.reduce(
    (max, p) => ((p.vote_count || 0) > max ? (p.vote_count || 0) : max),
    0
  )
  const withMaxVotes = posters.filter((p) => (p.vote_count || 0) === maxVotes)
  if (!withMaxVotes.length) return null

  const preferredLangs = new Set(['en', 'en-US'])
  const enGroup = withMaxVotes.filter((p) => p.iso_639_1 && preferredLangs.has(p.iso_639_1))
  const nullLang = withMaxVotes.filter((p) => p.iso_639_1 === null)
  const candidates = enGroup.length ? enGroup : nullLang.length ? nullLang : withMaxVotes

  return [...candidates].sort((a, b) => {
    const va = (b.vote_average || 0) - (a.vote_average || 0)
    if (va !== 0) return va
    return (b.width || 0) - (a.width || 0)
  })[0] || null
}

async function fetchBestPosterEN(type, id) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!apiKey || !type || !id) return null
  try {
    const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${apiKey}&include_image_language=en,en-US,null`
    const r = await fetch(url, { cache: 'force-cache' })
    if (!r.ok) return null
    const j = await r.json()
    return pickBestPosterEN(j?.posters)?.file_path || null
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

/**
 * SmartPoster sin “saltos”:
 * - contenedor con aspect ratio (lo pone el wrapper padre)
 * - skeleton + img en absoluto (no mueve el layout)
 * - page wrapper con overflow-y-scroll (evita shift por scrollbar)
 */
function SmartPoster({ item, title }) {
  const type = item.media_type || (item.title ? 'movie' : 'tv')
  const id = item.id

  const [src, setSrc] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let abort = false

    const load = async () => {
      setReady(false)

      const pref = getPosterPreference(type, id)
      if (pref) {
        const url = buildImg(pref, 'w500')
        await preloadImage(url)
        if (!abort) {
          setSrc(url)
          setReady(true)
        }
        return
      }

      const best = await getBestPosterCached(type, id)
      const finalPath = best || item.poster_path || item.backdrop_path || null
      const url = finalPath ? buildImg(finalPath, 'w500') : null

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
  }, [type, id, item.poster_path, item.backdrop_path])

  return (
    <div className="relative w-full h-full">
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 transition-opacity duration-300 ${ready && src ? 'opacity-0' : 'opacity-100'
          }`}
      >
        <Film className="w-8 h-8 text-neutral-700" />
      </div>

      {src ? (
        <img
          src={src}
          alt={title}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 transition-transform duration-700 ease-out group-hover:scale-110 ${ready ? 'opacity-100' : 'opacity-0'
            }`}
        />
      ) : null}
    </div>
  )
}

const readOmdbCache = (imdbId) => {
  if (!imdbId || typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(`showverse:omdb:${imdbId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return { ...parsed, fresh: Date.now() - (parsed?.t || 0) < OMDB_CACHE_TTL_MS }
  } catch {
    return null
  }
}
const writeOmdbCache = (imdbId, patch) => {
  if (!imdbId || typeof window === 'undefined') return
  try {
    const prev = readOmdbCache(imdbId) || {}
    const next = { t: Date.now(), imdbRating: patch?.imdbRating ?? prev?.imdbRating ?? null }
    window.sessionStorage.setItem(`showverse:omdb:${imdbId}`, JSON.stringify(next))
  } catch { }
}

// --- UI COMPONENTS ---
function Dropdown({ label, valueLabel, icon: Icon, children, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <div ref={ref} className={`relative z-30 ${className}`}>
      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 ml-1 hidden sm:block">
        {label}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-10 inline-flex items-center justify-between gap-2 px-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-sm text-zinc-300"
      >
        <div className="flex items-center gap-2 truncate">
          {Icon && <Icon className="w-4 h-4 text-zinc-500" />}
          <span className="font-medium text-white truncate">{valueLabel}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="absolute left-0 top-full z-[1000] mt-2 w-full min-w-[160px] rounded-xl border border-zinc-800 bg-[#121212] shadow-2xl overflow-hidden"
          >
            <div className="p-1 space-y-0.5">{children({ close: () => setOpen(false) })}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DropdownItem({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2 rounded-lg text-left text-xs sm:text-sm transition flex items-center justify-between
        ${active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
    >
      <span className="font-medium">{children}</span>
      {active && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
    </button>
  )
}

// ================== TMDb account pagination (watchlist) ==================
const TMDB_BASE = 'https://api.themoviedb.org/3'

function getSessionId(session) {
  if (!session) return null
  if (typeof session === 'string') return session
  return session.session_id || session.id || session.sessionId || null
}

async function fetchAccountListPage({ accountId, sessionId, listKind, mediaType, page }) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!apiKey || !accountId || !sessionId) throw new Error('Missing TMDb auth')

  const base = listKind === 'favorites' ? 'favorite' : 'watchlist'
  const suffix = mediaType === 'movie' ? 'movies' : 'tv'

  const url = new URL(`${TMDB_BASE}/account/${accountId}/${base}/${suffix}`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('session_id', sessionId)
  url.searchParams.set('sort_by', 'created_at.desc')
  url.searchParams.set('page', String(page || 1))

  const r = await fetch(url.toString(), { cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.status_message || 'TMDb request failed')

  const results = Array.isArray(j?.results) ? j.results : []
  const withType = results.map((it) => ({ ...it, media_type: mediaType }))

  return {
    page: j?.page || page || 1,
    total_pages: j?.total_pages || 1,
    total_results: j?.total_results || withType.length,
    results: withType,
  }
}

// --- MAIN PAGE ---
export default function WatchlistPage() {
  const { session, account, hydrated } = useAuth()
  const [authStatus, setAuthStatus] = useState('checking')

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  // Filters
  const [typeFilter, setTypeFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('')
  const [sortBy, setSortBy] = useState('rating_desc')

  // Totales reales (TMDb)
  const [totalMovie, setTotalMovie] = useState(0)
  const [totalTv, setTotalTv] = useState(0)

  // ---- Infinite scroll UI ----
  const UI_BATCH = 21
  const INITIAL_VISIBLE = 42
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const sentinelRef = useRef(null)

  // ---- TMDb pagination state ----
  const [nextMoviePage, setNextMoviePage] = useState(1)
  const [nextTvPage, setNextTvPage] = useState(1)
  const [hasMoreMovie, setHasMoreMovie] = useState(true)
  const [hasMoreTv, setHasMoreTv] = useState(true)

  // Dedup
  const seenRef = useRef(new Set())

  // Evitar auto-loadMore “sin scroll”
  const userScrolledRef = useRef(false)
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 0) userScrolledRef.current = true
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Lazy Ratings
  const [imdbRatings, setImdbRatings] = useState({})
  const imdbRatingsRef = useRef({})
  const imdbInFlightRef = useRef(new Set())
  const imdbTimersRef = useRef({})
  const imdbIdCacheRef = useRef({})
  const unmountedRef = useRef(false)

  useEffect(() => {
    imdbRatingsRef.current = imdbRatings
  }, [imdbRatings])

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      Object.values(imdbTimersRef.current).forEach((t) => window.clearTimeout(t))
    }
  }, [])

  // Auth logic
  useEffect(() => {
    if (!hydrated) return
    if (session && account?.id) setAuthStatus('authenticated')
    else setAuthStatus('anonymous')
  }, [session, account, hydrated])

  // Reset visible when filters/sort change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE)
  }, [typeFilter, yearFilter, sortBy])

  // Initial load (precarga para llegar a 42)
  useEffect(() => {
    let cancelled = false
    if (authStatus === 'checking') return

    if (authStatus === 'anonymous') {
      setItems([])
      setLoading(false)
      setError(null)
      setVisibleCount(INITIAL_VISIBLE)
      setTotalMovie(0)
      setTotalTv(0)
      return
    }

    const load = async () => {
      const sessionId = getSessionId(session)
      if (!sessionId || !account?.id) return

      setLoading(true)
      setError(null)
      setLoadingMore(false)

      // reset paging
      setNextMoviePage(1)
      setNextTvPage(1)
      setHasMoreMovie(true)
      setHasMoreTv(true)
      seenRef.current = new Set()

      try {
        // page 1 movie + tv
        const [m1, t1] = await Promise.all([
          fetchAccountListPage({ accountId: account.id, sessionId, listKind: 'watchlist', mediaType: 'movie', page: 1 }),
          fetchAccountListPage({ accountId: account.id, sessionId, listKind: 'watchlist', mediaType: 'tv', page: 1 }),
        ])

        if (cancelled) return

        setTotalMovie(m1.total_results || 0)
        setTotalTv(t1.total_results || 0)

        const merged = [...m1.results, ...t1.results]
        const unique = []
        for (const it of merged) {
          const k = `${it.media_type}:${it.id}`
          if (!seenRef.current.has(k)) {
            seenRef.current.add(k)
            unique.push(it)
          }
        }

        // precarga extra para llegar a 42 (máx 2 requests extra)
        let unique2 = [...unique]
        let moviePageLoaded = 1
        let tvPageLoaded = 1

        if (unique2.length < INITIAL_VISIBLE && m1.page < m1.total_pages) {
          const m2 = await fetchAccountListPage({
            accountId: account.id,
            sessionId,
            listKind: 'watchlist',
            mediaType: 'movie',
            page: 2,
          })
          moviePageLoaded = 2
          for (const it of m2.results) {
            const k = `${it.media_type}:${it.id}`
            if (!seenRef.current.has(k)) {
              seenRef.current.add(k)
              unique2.push(it)
            }
          }
        }

        if (unique2.length < INITIAL_VISIBLE && t1.page < t1.total_pages) {
          const t2 = await fetchAccountListPage({
            accountId: account.id,
            sessionId,
            listKind: 'watchlist',
            mediaType: 'tv',
            page: 2,
          })
          tvPageLoaded = 2
          for (const it of t2.results) {
            const k = `${it.media_type}:${it.id}`
            if (!seenRef.current.has(k)) {
              seenRef.current.add(k)
              unique2.push(it)
            }
          }
        }

        if (!cancelled) {
          setItems(unique2)
          setVisibleCount(INITIAL_VISIBLE)

          setNextMoviePage(moviePageLoaded + 1)
          setNextTvPage(tvPageLoaded + 1)

          setHasMoreMovie(moviePageLoaded < m1.total_pages)
          setHasMoreTv(tvPageLoaded < t1.total_pages)
        }
      } catch {
        if (!cancelled) setError('No se ha podido cargar tu lista de pendientes.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [authStatus, session, account])

  // Prefetch IMDb
  const prefetchImdb = useCallback(async (item) => {
    if (!item?.id || typeof window === 'undefined') return
    const mediaType = item.media_type || (item.title ? 'movie' : 'tv')
    const key = `${mediaType}:${item.id}`
    if (imdbRatingsRef.current?.[key] !== undefined || imdbInFlightRef.current.has(key)) return

    imdbTimersRef.current[key] = window.setTimeout(async () => {
      try {
        imdbInFlightRef.current.add(key)
        let imdbId = imdbIdCacheRef.current?.[key]
        if (!imdbId) {
          const ext = await getExternalIds(mediaType, item.id)
          imdbId = ext?.imdb_id
          if (imdbId) imdbIdCacheRef.current[key] = imdbId
        }
        if (!imdbId) {
          if (!unmountedRef.current) setImdbRatings((p) => ({ ...p, [key]: null }))
          return
        }
        const cached = readOmdbCache(imdbId)
        if (cached?.imdbRating != null) {
          if (!unmountedRef.current) setImdbRatings((p) => ({ ...p, [key]: cached.imdbRating }))
          if (cached?.fresh) return
        }
        const omdb = await fetchOmdbByImdb(imdbId)
        const r = omdb?.imdbRating && omdb.imdbRating !== 'N/A' ? Number(omdb.imdbRating) : null
        if (!unmountedRef.current) setImdbRatings((p) => ({ ...p, [key]: r }))
        writeOmdbCache(imdbId, { imdbRating: r })
      } catch {
        if (!unmountedRef.current) setImdbRatings((p) => ({ ...p, [key]: null }))
      } finally {
        imdbInFlightRef.current.delete(key)
      }
    }, 150)
  }, [])

  // Process & Sort
  const processedItems = useMemo(() => {
    let list = [...items]
    if (typeFilter !== 'all') list = list.filter((i) => i.media_type === typeFilter)

    if (yearFilter.trim()) {
      list = list.filter((i) => {
        const date = i.media_type === 'movie' ? i.release_date : i.first_air_date
        return date && date.slice(0, 4) === yearFilter.trim()
      })
    }

    list.sort((a, b) => {
      const dateA = a.media_type === 'movie' ? a.release_date : a.first_air_date
      const dateB = b.media_type === 'movie' ? b.release_date : b.first_air_date
      const yearA = dateA ? parseInt(dateA.slice(0, 4)) : 0
      const yearB = dateB ? parseInt(dateB.slice(0, 4)) : 0
      const titleA = (a.title || a.name || '').toLowerCase()
      const titleB = (b.title || b.name || '').toLowerCase()

      switch (sortBy) {
        case 'year_desc':
          return yearB - yearA
        case 'year_asc':
          return yearA - yearB
        case 'rating_desc':
          return (b.vote_average || 0) - (a.vote_average || 0)
        case 'rating_asc':
          return (a.vote_average || 0) - (b.vote_average || 0)
        case 'title_desc':
          return titleB.localeCompare(titleA)
        default:
          return titleA.localeCompare(titleB)
      }
    })

    return list
  }, [items, typeFilter, yearFilter, sortBy])

  const visibleItems = useMemo(() => processedItems.slice(0, visibleCount), [processedItems, visibleCount])

  const canFetchRemote = useMemo(() => {
    const wantMovie = (typeFilter === 'all' || typeFilter === 'movie') && hasMoreMovie
    const wantTv = (typeFilter === 'all' || typeFilter === 'tv') && hasMoreTv
    return wantMovie || wantTv
  }, [typeFilter, hasMoreMovie, hasMoreTv])

  const canLoadMore = visibleCount < processedItems.length || canFetchRemote

  const loadMore = useCallback(async () => {
    if (loading || loadingMore) return
    if (!canLoadMore) return

    // 1) Si ya hay más local, mostramos +21
    if (visibleCount < processedItems.length) {
      setVisibleCount((v) => v + UI_BATCH)
      return
    }

    // 2) Si no hay más local, pedimos a TMDb
    const sessionId = getSessionId(session)
    if (!sessionId || !account?.id) return

    const wantMovie = (typeFilter === 'all' || typeFilter === 'movie') && hasMoreMovie
    const wantTv = (typeFilter === 'all' || typeFilter === 'tv') && hasMoreTv
    if (!wantMovie && !wantTv) return

    setLoadingMore(true)
    try {
      const tasks = []
      if (wantMovie) {
        tasks.push(
          fetchAccountListPage({
            accountId: account.id,
            sessionId,
            listKind: 'watchlist',
            mediaType: 'movie',
            page: nextMoviePage,
          }).then((res) => ({ kind: 'movie', res }))
        )
      }
      if (wantTv) {
        tasks.push(
          fetchAccountListPage({
            accountId: account.id,
            sessionId,
            listKind: 'watchlist',
            mediaType: 'tv',
            page: nextTvPage,
          }).then((res) => ({ kind: 'tv', res }))
        )
      }

      const results = await Promise.all(tasks)

      setItems((prev) => {
        const next = [...prev]
        for (const r of results) {
          for (const it of r.res.results) {
            const k = `${it.media_type}:${it.id}`
            if (!seenRef.current.has(k)) {
              seenRef.current.add(k)
              next.push(it)
            }
          }
        }
        return next
      })

      for (const r of results) {
        const { kind, res } = r
        if (kind === 'movie') {
          setNextMoviePage((p) => p + 1)
          setHasMoreMovie(res.page < res.total_pages)
        } else {
          setNextTvPage((p) => p + 1)
          setHasMoreTv(res.page < res.total_pages)
        }
      }

      setVisibleCount((v) => v + UI_BATCH)
    } catch {
      setError('Error cargando más pendientes.')
    } finally {
      setLoadingMore(false)
    }
  }, [
    loading,
    loadingMore,
    canLoadMore,
    visibleCount,
    processedItems.length,
    session,
    account,
    typeFilter,
    hasMoreMovie,
    hasMoreTv,
    nextMoviePage,
    nextTvPage,
  ])

  // IntersectionObserver (solo cuando el usuario ya hizo scroll)
  useEffect(() => {
    if (!canLoadMore) return
    const el = sentinelRef.current
    if (!el) return

    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (!first?.isIntersecting) return
        if (!userScrolledRef.current) return
        loadMore()
      },
      { root: null, rootMargin: '300px 0px', threshold: 0 }
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore, canLoadMore])

  const totalForHeader = useMemo(() => {
    if (typeFilter === 'movie') return totalMovie || 0
    if (typeFilter === 'tv') return totalTv || 0
    return (totalMovie || 0) + (totalTv || 0)
  }, [typeFilter, totalMovie, totalTv])

  // --- UI states ---
  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#101010] overflow-y-scroll flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    )
  }

  if (authStatus === 'anonymous') {
    return (
      <div className="min-h-screen bg-[#101010] overflow-y-scroll max-w-7xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-center">
        <Bookmark className="w-16 h-16 text-neutral-700 mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">Pendientes</h1>
        <p className="text-neutral-400 mb-6">Inicia sesión para ver tu lista de seguimiento.</p>
        <Link href="/login" className="px-6 py-2 bg-white text-black rounded-full font-bold hover:bg-neutral-200">
          Iniciar Sesión
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#101010] overflow-y-scroll text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Background Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
              <Bookmark className="w-8 h-8 text-blue-500 fill-current" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-white tracking-tight">Pendientes</h1>
              <p className="text-neutral-400 mt-1 font-medium">{totalForHeader} títulos en total</p>
            </div>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full xl:w-auto">
            <Dropdown
              label="Tipo"
              valueLabel={typeFilter === 'all' ? 'Todo' : typeFilter === 'movie' ? 'Películas' : 'Series'}
              icon={Film}
            >
              {({ close }) => (
                <>
                  <DropdownItem active={typeFilter === 'all'} onClick={() => { setTypeFilter('all'); close() }}>
                    Todo
                  </DropdownItem>
                  <DropdownItem active={typeFilter === 'movie'} onClick={() => { setTypeFilter('movie'); close() }}>
                    Películas
                  </DropdownItem>
                  <DropdownItem active={typeFilter === 'tv'} onClick={() => { setTypeFilter('tv'); close() }}>
                    Series
                  </DropdownItem>
                </>
              )}
            </Dropdown>

            <Dropdown
              label="Ordenar"
              valueLabel={sortBy.includes('year') ? 'Año' : sortBy.includes('rating') ? 'Nota' : 'Título'}
              icon={ArrowUpDown}
            >
              {({ close }) => (
                <>
                  <DropdownItem active={sortBy === 'rating_desc'} onClick={() => { setSortBy('rating_desc'); close() }}>
                    Nota (+ a -)
                  </DropdownItem>
                  <DropdownItem active={sortBy === 'year_desc'} onClick={() => { setSortBy('year_desc'); close() }}>
                    Año (Reciente)
                  </DropdownItem>
                  <DropdownItem active={sortBy === 'year_asc'} onClick={() => { setSortBy('year_asc'); close() }}>
                    Año (Antiguo)
                  </DropdownItem>
                  <DropdownItem active={sortBy === 'title_asc'} onClick={() => { setSortBy('title_asc'); close() }}>
                    A - Z
                  </DropdownItem>
                </>
              )}
            </Dropdown>

            <div className="col-span-2 sm:col-span-2 relative group">
              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 ml-1 hidden sm:block">
                Año
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-zinc-300 transition-colors" />
                <input
                  type="number"
                  placeholder="Filtrar por año..."
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
            <span className="text-neutral-500 text-sm font-medium animate-pulse">Cargando tu lista...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-400">{error}</div>
        ) : processedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/20">
            <FilterX className="w-16 h-16 text-neutral-700 mb-4" />
            <h3 className="text-xl font-bold text-neutral-300">Sin resultados</h3>
            <button
              onClick={() => {
                setTypeFilter('all')
                setYearFilter('')
                setSortBy('rating_desc')
              }}
              className="mt-4 text-sm text-blue-500 font-bold hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-6">
              {visibleItems.map((item) => {
                const isMovie = item.media_type === 'movie'
                const mediaType = item.media_type || (isMovie ? 'movie' : 'tv')
                const href = `/details/${mediaType}/${item.id}`
                const title = isMovie ? item.title : item.name
                const date = isMovie ? item.release_date : item.first_air_date
                const year = date ? date.slice(0, 4) : ''
                const imdbKey = `${mediaType}:${item.id}`
                const imdbScore = imdbRatings[imdbKey]

                return (
                  <Link
                    key={`${mediaType}-${item.id}`}
                    href={href}
                    className="group block relative w-full h-full"
                    title={title}
                    onMouseEnter={() => prefetchImdb(item)}
                    onFocus={() => prefetchImdb(item)}
                  >
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-white/5 transition-all duration-500 group-hover:shadow-[0_0_25px_rgba(255,255,255,0.08)] z-0">
                      <SmartPoster item={item} title={title} />

                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between">
                        {/* Top: Type & Ratings */}
                        <div className="p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                          <span
                            className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shadow-sm backdrop-blur-md ${isMovie
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                              : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                              }`}
                          >
                            {isMovie ? 'PELÍCULA' : 'SERIE'}
                          </span>

                          <div className="flex flex-col items-end gap-1">
                            {item.vote_average > 0 && (
                              <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                                <span className="text-emerald-400 text-xs font-black font-mono tracking-tight">
                                  {item.vote_average.toFixed(1)}
                                </span>
                                <img src="/logo-TMDb.png" alt="" className="w-auto h-2.5 opacity-100" />
                              </div>
                            )}
                            {typeof imdbScore === 'number' && imdbScore > 0 && (
                              <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                                <span className="text-yellow-400 text-xs font-black font-mono tracking-tight">
                                  {imdbScore.toFixed(1)}
                                </span>
                                <img src="/logo-IMDb.png" alt="" className="w-auto h-3 opacity-100" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Bottom: Info */}
                        <div className="p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 text-left">
                          <h3 className="text-white font-bold text-xs sm:text-sm leading-tight line-clamp-2 drop-shadow-md">
                            {title}
                          </h3>
                          {year && (
                            <p className="text-yellow-500 text-[10px] sm:text-xs font-bold mt-0.5 drop-shadow-md">
                              {year}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>

            {/* Sentinel + Loader */}
            <div ref={sentinelRef} className="h-10" />
            {(loadingMore || canLoadMore) && (
              <div className="flex items-center justify-center py-10">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-neutral-400 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    Cargando más...
                  </div>
                ) : (
                  <div className="text-neutral-600 text-xs">Desliza para cargar más</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
