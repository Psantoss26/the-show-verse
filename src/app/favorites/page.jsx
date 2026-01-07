// /src/app/favorites/page.jsx
'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import { getExternalIds } from '@/lib/api/tmdb'
import { fetchOmdbByImdb } from '@/lib/api/omdb'
import {
  Loader2,
  Heart,
  Film,
  FilterX,
  ChevronDown,
  CheckCircle2,
  Calendar,
  ArrowUpDown,
  Layers,
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
 * SmartPoster sin “parpadeo” de layout:
 * - contenedor siempre con aspect ratio fijo (lo pone el wrapper padre)
 * - skeleton + img en absoluto (no mueve el grid)
 * - evitamos “saltos” por aparición de scrollbar: el wrapper de página usa overflow-y-scroll
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
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'
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

function DropdownSectionLabel({ children }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider font-black text-zinc-600">
      {children}
    </div>
  )
}

// ================== TMDb account pagination ==================
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

// ================== SORT / GROUP HELPERS ==================
function getItemTitle(item) {
  return (item?.title || item?.name || '').toString()
}

function getItemDateStr(item) {
  const d = item?.media_type === 'movie' ? item?.release_date : item?.first_air_date
  return d || ''
}

function getItemYear(item) {
  const d = getItemDateStr(item)
  if (!d || d.length < 4) return null
  const y = parseInt(d.slice(0, 4), 10)
  return Number.isFinite(y) ? y : null
}

function parseDateMs(str) {
  if (!str) return 0
  const t = Date.parse(str)
  return Number.isFinite(t) ? t : 0
}

function getCreatedAtMs(item) {
  // TMDb account lists suelen incluir created_at
  return parseDateMs(item?.created_at || '')
}

function ratingBucketInfo(v) {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return { key: 0, label: 'Sin nota', order: 999 }
  if (n >= 9) return { key: 90, label: '9.0–10', order: 0 }
  if (n >= 8) return { key: 80, label: '8.0–8.9', order: 1 }
  if (n >= 7) return { key: 70, label: '7.0–7.9', order: 2 }
  if (n >= 6) return { key: 60, label: '6.0–6.9', order: 3 }
  if (n >= 5) return { key: 50, label: '5.0–5.9', order: 4 }
  if (n >= 4) return { key: 40, label: '4.0–4.9', order: 5 }
  return { key: 10, label: '0.1–3.9', order: 6 }
}

function compareStringAsc(a, b) {
  return a.localeCompare(b)
}

function buildComparator(sortBy) {
  switch (sortBy) {
    case 'added_desc':
      return (a, b) => getCreatedAtMs(b) - getCreatedAtMs(a)
    case 'added_asc':
      return (a, b) => getCreatedAtMs(a) - getCreatedAtMs(b)

    case 'year_desc':
      return (a, b) => (getItemYear(b) || 0) - (getItemYear(a) || 0)
    case 'year_asc':
      return (a, b) => (getItemYear(a) || 0) - (getItemYear(b) || 0)

    case 'rating_desc':
      return (a, b) => (b.vote_average || 0) - (a.vote_average || 0)
    case 'rating_asc':
      return (a, b) => (a.vote_average || 0) - (b.vote_average || 0)

    case 'vote_count_desc':
      return (a, b) => (b.vote_count || 0) - (a.vote_count || 0)

    case 'popularity_desc':
      return (a, b) => (b.popularity || 0) - (a.popularity || 0)
    case 'popularity_asc':
      return (a, b) => (a.popularity || 0) - (b.popularity || 0)

    case 'language_asc':
      return (a, b) =>
        compareStringAsc((a.original_language || '').toUpperCase(), (b.original_language || '').toUpperCase())

    case 'type_asc':
      return (a, b) => (a.media_type === 'movie' ? 0 : 1) - (b.media_type === 'movie' ? 0 : 1)

    case 'title_desc':
      return (a, b) => getItemTitle(b).toLowerCase().localeCompare(getItemTitle(a).toLowerCase())

    case 'title_asc':
    default:
      return (a, b) => getItemTitle(a).toLowerCase().localeCompare(getItemTitle(b).toLowerCase())
  }
}

function groupKey(item, groupBy) {
  if (groupBy === 'type') {
    const t = item?.media_type === 'movie' ? 'movie' : 'tv'
    return { key: t, label: t === 'movie' ? 'Películas' : 'Series', order: t === 'movie' ? 0 : 1 }
  }

  if (groupBy === 'year') {
    const y = getItemYear(item)
    return { key: y ?? 'none', label: y ? String(y) : 'Sin fecha', order: y ? -y : 999999 }
  }

  if (groupBy === 'decade') {
    const y = getItemYear(item)
    if (!y) return { key: 'none', label: 'Sin fecha', order: 999999 }
    const d = Math.floor(y / 10) * 10
    return { key: d, label: `${d}s`, order: -d }
  }

  if (groupBy === 'rating') {
    const info = ratingBucketInfo(item?.vote_average || 0)
    return { key: info.key, label: info.label, order: info.order }
  }

  if (groupBy === 'language') {
    const code = (item?.original_language || '').toString().trim()
    const lbl = code ? code.toUpperCase() : '??'
    return { key: lbl, label: `Idioma: ${lbl}`, order: lbl }
  }

  if (groupBy === 'added_month') {
    const ms = getCreatedAtMs(item)
    if (!ms) return { key: 'none', label: 'Sin fecha', order: 999999 }
    const d = new Date(ms)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const k = `${y}-${m}`
    // orden desc por mes
    return { key: k, label: `Añadido: ${k}`, order: -parseDateMs(`${y}-${m}-01`) }
  }

  return { key: 'all', label: '', order: 0 }
}

function groupIntoSections(items, groupBy, sortBy) {
  if (!groupBy || groupBy === 'none') {
    const sorted = [...items].sort(buildComparator(sortBy))
    return [{ key: 'all', label: null, items: sorted }]
  }

  const map = new Map()
  for (const it of items) {
    const g = groupKey(it, groupBy)
    const entry = map.get(g.key) || { key: g.key, label: g.label, order: g.order, items: [] }
    entry.items.push(it)
    map.set(g.key, entry)
  }

  const comparator = buildComparator(sortBy)
  const sections = [...map.values()].map((s) => ({
    key: s.key,
    label: s.label,
    order: s.order,
    items: [...s.items].sort(comparator),
  }))

  // orden grupos determinista
  sections.sort((a, b) => {
    if (typeof a.order === 'number' && typeof b.order === 'number') return a.order - b.order
    if (typeof a.order === 'string' && typeof b.order === 'string') return a.order.localeCompare(b.order)
    return String(a.order).localeCompare(String(b.order))
  })

  return sections
}

function takeVisibleSections(sections, maxItems) {
  if (!Array.isArray(sections) || maxItems <= 0) return []
  let remaining = maxItems
  const out = []
  for (const s of sections) {
    if (remaining <= 0) break
    const slice = s.items.slice(0, remaining)
    if (slice.length) {
      out.push({ ...s, items: slice })
      remaining -= slice.length
    }
  }
  return out
}

// --- MAIN PAGE ---
export default function FavoritesPage() {
  const { session, account, hydrated } = useAuth()
  const [authStatus, setAuthStatus] = useState('checking')

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  const [typeFilter, setTypeFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('')
  const [groupBy, setGroupBy] = useState('none')
  const [sortBy, setSortBy] = useState('added_desc')

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

  // IMDb lazy ratings
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

  // Reset visible when filters/group/sort change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE)
  }, [typeFilter, yearFilter, sortBy, groupBy])

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
        const [m1, t1] = await Promise.all([
          fetchAccountListPage({ accountId: account.id, sessionId, listKind: 'favorites', mediaType: 'movie', page: 1 }),
          fetchAccountListPage({ accountId: account.id, sessionId, listKind: 'favorites', mediaType: 'tv', page: 1 }),
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
            listKind: 'favorites',
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
            listKind: 'favorites',
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
        if (!cancelled) setError('Error cargando favoritos.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [authStatus, session, account])

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

  // 1) Filtrado base (tipo + año)
  const filteredItems = useMemo(() => {
    let list = [...items]
    if (typeFilter !== 'all') list = list.filter((i) => i.media_type === typeFilter)

    if (yearFilter.trim()) {
      list = list.filter((i) => {
        const date = i.media_type === 'movie' ? i.release_date : i.first_air_date
        return date && date.slice(0, 4) === yearFilter.trim()
      })
    }
    return list
  }, [items, typeFilter, yearFilter])

  // 2) Agrupar + ordenar (determinista)
  const sections = useMemo(() => groupIntoSections(filteredItems, groupBy, sortBy), [filteredItems, groupBy, sortBy])

  // Total filtrado (para infinito)
  const totalFiltered = useMemo(() => sections.reduce((acc, s) => acc + (s.items?.length || 0), 0), [sections])

  // 3) Secciones visibles según visibleCount
  const visibleSections = useMemo(() => takeVisibleSections(sections, visibleCount), [sections, visibleCount])

  const canFetchRemote = useMemo(() => {
    const wantMovie = (typeFilter === 'all' || typeFilter === 'movie') && hasMoreMovie
    const wantTv = (typeFilter === 'all' || typeFilter === 'tv') && hasMoreTv
    return wantMovie || wantTv
  }, [typeFilter, hasMoreMovie, hasMoreTv])

  const canLoadMore = visibleCount < totalFiltered || canFetchRemote

  const loadMore = useCallback(async () => {
    if (loading || loadingMore) return
    if (!canLoadMore) return

    // 1) Si ya hay más local (filtrado), solo mostramos +21
    if (visibleCount < totalFiltered) {
      setVisibleCount((v) => v + UI_BATCH)
      return
    }

    // 2) Pedimos más a TMDb
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
            listKind: 'favorites',
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
            listKind: 'favorites',
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
      setError('Error cargando más favoritos.')
    } finally {
      setLoadingMore(false)
    }
  }, [
    loading,
    loadingMore,
    canLoadMore,
    visibleCount,
    totalFiltered,
    session,
    account,
    typeFilter,
    hasMoreMovie,
    hasMoreTv,
    nextMoviePage,
    nextTvPage,
  ])

  // IntersectionObserver
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

  const GROUP_LABELS = {
    none: 'Sin agrupar',
    type: 'Tipo',
    year: 'Año',
    decade: 'Década',
    rating: 'Puntuación',
    language: 'Idioma',
    added_month: 'Añadido (mes)',
  }

  const SORT_LABELS = {
    added_desc: 'Añadido (reciente)',
    added_asc: 'Añadido (antiguo)',
    rating_desc: 'Nota (+ a -)',
    rating_asc: 'Nota (- a +)',
    year_desc: 'Año (reciente)',
    year_asc: 'Año (antiguo)',
    title_asc: 'Título (A–Z)',
    title_desc: 'Título (Z–A)',
    popularity_desc: 'Popularidad (+)',
    popularity_asc: 'Popularidad (-)',
    vote_count_desc: 'Votos (+)',
    language_asc: 'Idioma (A–Z)',
    type_asc: 'Tipo (pelis→series)',
  }

  // --- UI states ---
  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#101010] overflow-y-scroll flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-red-500" />
      </div>
    )
  }

  if (authStatus === 'anonymous') {
    return (
      <div className="min-h-screen bg-[#101010] overflow-y-scroll max-w-7xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-center">
        <Heart className="w-16 h-16 text-neutral-700 mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">Favoritas</h1>
        <p className="text-neutral-400 mb-6">Inicia sesión para ver tu colección.</p>
        <Link href="/login" className="px-6 py-2 bg-white text-black rounded-full font-bold hover:bg-neutral-200">
          Iniciar Sesión
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#101010] overflow-y-scroll text-gray-100 font-sans selection:bg-red-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[600px] h-[600px] bg-red-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500/10 rounded-2xl border border-red-500/20">
              <Heart className="w-8 h-8 text-red-500 fill-current" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-white tracking-tight">Favoritas</h1>
              <p className="text-neutral-400 mt-1 font-medium">{totalForHeader} títulos en total</p>
            </div>
          </div>

          {/* Filtros (responsive) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full xl:w-[720px]">
            <Dropdown
              label="Tipo"
              valueLabel={typeFilter === 'all' ? 'Todo' : typeFilter === 'movie' ? 'Películas' : 'Series'}
              icon={Film}
            >
              {({ close }) => (
                <>
                  <DropdownItem
                    active={typeFilter === 'all'}
                    onClick={() => {
                      setTypeFilter('all')
                      close()
                    }}
                  >
                    Todo
                  </DropdownItem>
                  <DropdownItem
                    active={typeFilter === 'movie'}
                    onClick={() => {
                      setTypeFilter('movie')
                      close()
                    }}
                  >
                    Películas
                  </DropdownItem>
                  <DropdownItem
                    active={typeFilter === 'tv'}
                    onClick={() => {
                      setTypeFilter('tv')
                      close()
                    }}
                  >
                    Series
                  </DropdownItem>
                </>
              )}
            </Dropdown>

            <Dropdown label="Agrupar" valueLabel={GROUP_LABELS[groupBy] || 'Sin agrupar'} icon={Layers}>
              {({ close }) => (
                <>
                  <DropdownItem
                    active={groupBy === 'none'}
                    onClick={() => {
                      setGroupBy('none')
                      close()
                    }}
                  >
                    Sin agrupar
                  </DropdownItem>
                  <DropdownSectionLabel>Por contenido</DropdownSectionLabel>
                  <DropdownItem
                    active={groupBy === 'type'}
                    onClick={() => {
                      setGroupBy('type')
                      close()
                    }}
                  >
                    Tipo (pelis / series)
                  </DropdownItem>
                  <DropdownItem
                    active={groupBy === 'language'}
                    onClick={() => {
                      setGroupBy('language')
                      close()
                    }}
                  >
                    Idioma original
                  </DropdownItem>

                  <DropdownSectionLabel>Por fechas</DropdownSectionLabel>
                  <DropdownItem
                    active={groupBy === 'year'}
                    onClick={() => {
                      setGroupBy('year')
                      close()
                    }}
                  >
                    Año
                  </DropdownItem>
                  <DropdownItem
                    active={groupBy === 'decade'}
                    onClick={() => {
                      setGroupBy('decade')
                      close()
                    }}
                  >
                    Década
                  </DropdownItem>
                  <DropdownItem
                    active={groupBy === 'added_month'}
                    onClick={() => {
                      setGroupBy('added_month')
                      close()
                    }}
                  >
                    Añadido (mes)
                  </DropdownItem>

                  <DropdownSectionLabel>Por puntuación</DropdownSectionLabel>
                  <DropdownItem
                    active={groupBy === 'rating'}
                    onClick={() => {
                      setGroupBy('rating')
                      close()
                    }}
                  >
                    Puntuación TMDb
                  </DropdownItem>
                </>
              )}
            </Dropdown>

            <Dropdown
              className="col-span-2 sm:col-span-1"
              label="Ordenar"
              valueLabel={SORT_LABELS[sortBy] || 'Orden'}
              icon={ArrowUpDown}
            >
              {({ close }) => (
                <>
                  <DropdownSectionLabel>Recomendado</DropdownSectionLabel>
                  <DropdownItem
                    active={sortBy === 'added_desc'}
                    onClick={() => {
                      setSortBy('added_desc')
                      close()
                    }}
                  >
                    Añadido (reciente)
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === 'rating_desc'}
                    onClick={() => {
                      setSortBy('rating_desc')
                      close()
                    }}
                  >
                    Nota (+ a -)
                  </DropdownItem>

                  <DropdownSectionLabel>Fechas</DropdownSectionLabel>
                  <DropdownItem
                    active={sortBy === 'year_desc'}
                    onClick={() => {
                      setSortBy('year_desc')
                      close()
                    }}
                  >
                    Año (reciente)
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === 'year_asc'}
                    onClick={() => {
                      setSortBy('year_asc')
                      close()
                    }}
                  >
                    Año (antiguo)
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === 'added_asc'}
                    onClick={() => {
                      setSortBy('added_asc')
                      close()
                    }}
                  >
                    Añadido (antiguo)
                  </DropdownItem>

                  <DropdownSectionLabel>Texto</DropdownSectionLabel>
                  <DropdownItem
                    active={sortBy === 'title_asc'}
                    onClick={() => {
                      setSortBy('title_asc')
                      close()
                    }}
                  >
                    Título (A–Z)
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === 'title_desc'}
                    onClick={() => {
                      setSortBy('title_desc')
                      close()
                    }}
                  >
                    Título (Z–A)
                  </DropdownItem>

                  <DropdownSectionLabel>Otras</DropdownSectionLabel>
                  <DropdownItem
                    active={sortBy === 'popularity_desc'}
                    onClick={() => {
                      setSortBy('popularity_desc')
                      close()
                    }}
                  >
                    Popularidad (+)
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === 'popularity_asc'}
                    onClick={() => {
                      setSortBy('popularity_asc')
                      close()
                    }}
                  >
                    Popularidad (-)
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === 'vote_count_desc'}
                    onClick={() => {
                      setSortBy('vote_count_desc')
                      close()
                    }}
                  >
                    Votos (+)
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === 'language_asc'}
                    onClick={() => {
                      setSortBy('language_asc')
                      close()
                    }}
                  >
                    Idioma (A–Z)
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === 'type_asc'}
                    onClick={() => {
                      setSortBy('type_asc')
                      close()
                    }}
                  >
                    Tipo (pelis→series)
                  </DropdownItem>
                </>
              )}
            </Dropdown>

            <div className="col-span-2 sm:col-span-1 relative group">
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

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-red-500 mb-4" />
            <span className="text-neutral-500 text-sm font-medium animate-pulse">Cargando tu colección...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-400">{error}</div>
        ) : totalFiltered === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/20">
            <FilterX className="w-16 h-16 text-neutral-700 mb-4" />
            <h3 className="text-xl font-bold text-neutral-300">Sin resultados</h3>
            <button
              onClick={() => {
                setTypeFilter('all')
                setYearFilter('')
                setGroupBy('none')
                setSortBy('added_desc')
              }}
              className="mt-4 text-sm text-red-500 font-bold hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <>
            {groupBy === 'none' ? (
              // Sin agrupar: una única sección (visibleSections[0])
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-6">
                {(visibleSections[0]?.items || []).map((item) => {
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
            ) : (
              // Agrupado: secciones
              <div className="space-y-10">
                {visibleSections.map((section) => (
                  <div key={`group-${String(section.key)}`}>
                    <div className="flex items-baseline justify-between gap-4 mb-4">
                      <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-neutral-200">
                        {section.label}
                      </h2>
                      <span className="text-xs text-neutral-500 font-bold">{section.items.length}</span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-6">
                      {section.items.map((item) => {
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
                  </div>
                ))}
              </div>
            )}

            {/* Sentinel + Loader */}
            <div ref={sentinelRef} className="h-10" />
            {(loadingMore || canLoadMore) && (
              <div className="flex items-center justify-center py-10">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-neutral-400 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin text-red-500" />
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