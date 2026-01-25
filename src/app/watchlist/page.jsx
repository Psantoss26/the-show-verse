// /src/app/watchlist/page.jsx
'use client'

import { useEffect, useState, useMemo, useRef, useCallback, startTransition } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import { getExternalIds } from '@/lib/api/tmdb'
import { fetchOmdbByImdb } from '@/lib/api/omdb'
import { traktGetItemStatus, traktGetScoreboard } from '@/lib/api/traktClient'
import {
  Loader2,
  Bookmark,
  Film,
  FilterX,
  ChevronDown,
  CheckCircle2,
  ArrowUpDown,
  Layers,
  Search,
  Star,
} from 'lucide-react'

// ================== UTILS & CACHE ==================
const posterChoiceCache = new Map()
const posterInFlight = new Map()

const backdropChoiceCache = new Map()
const backdropInFlight = new Map()

// user ratings cache (IMPORTANT: do NOT cache "null" for long, or ratings won't refresh after voting)
const userRatingCache = new Map() // key -> { v: number|null, t: number }
const userRatingInFlight = new Map()

// trakt community rating cache
const traktScoreCache = new Map() // key -> { v: number|null, votes: number|null, t: number }
const traktScoreInFlight = new Map()

let traktConnectedKnown = null // null | boolean

const OMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const USER_RATING_TTL_MS = 10 * 60 * 1000
const USER_RATING_TTL_NULL_MS = 45 * 1000
const TRAKT_SCORE_TTL_MS = 24 * 60 * 60 * 1000

const TMDB_BASE = 'https://api.themoviedb.org/3'

function buildImg(path, size = 'w500') {
  return `https://image.tmdb.org/t/p/${size}${path}`
}

function clampNumber(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

function formatHalfSteps(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return null
  const r = Math.round(v * 2) / 2
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

function formatAvg(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—'
  const r = Math.round(v * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

function normText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
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

  const maxVotes = posters.reduce((max, p) => ((p.vote_count || 0) > max ? p.vote_count || 0 : max), 0)
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

function pickBestBackdropByLangResVotes(list, opts = {}) {
  const { preferLangs = ['en', 'en-US'], minWidth = 1200 } = opts
  if (!Array.isArray(list) || list.length === 0) return null

  const norm = (v) => (v ? String(v).toLowerCase().split('-')[0] : null)
  const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean))
  const isPreferredLang = (img) => preferSet.has(norm(img?.iso_639_1))

  const pool0 = minWidth > 0 ? list.filter((b) => (b?.width || 0) >= minWidth) : list
  const pool = pool0.length ? pool0 : list

  // ✅ SOLO 3 primeras EN (en orden). Si no hay EN => null (siempre EN)
  const top3en = []
  for (const b of pool) {
    if (isPreferredLang(b)) top3en.push(b)
    if (top3en.length === 3) break
  }
  if (!top3en.length) return null

  const isRes = (b, w, h) => (b?.width || 0) === w && (b?.height || 0) === h

  const b1080 = top3en.find((b) => isRes(b, 1920, 1080))
  if (b1080) return b1080

  const b1440 = top3en.find((b) => isRes(b, 2560, 1440))
  if (b1440) return b1440

  const b4k = top3en.find((b) => isRes(b, 3840, 2160))
  if (b4k) return b4k

  const b720 = top3en.find((b) => isRes(b, 1280, 720))
  if (b720) return b720

  return top3en[0]
}

async function fetchBestBackdropEN(type, id) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!apiKey || !type || !id) return null
  try {
    const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${apiKey}&include_image_language=en,en-US`
    const r = await fetch(url, { cache: 'force-cache' })
    if (!r.ok) return null
    const j = await r.json()
    const best = pickBestBackdropByLangResVotes(j?.backdrops, { preferLangs: ['en', 'en-US'], minWidth: 1200 })
    return best?.file_path || null
  } catch {
    return null
  }
}

async function getBestBackdropCached(type, id) {
  const key = `${type}:${id}`
  if (backdropChoiceCache.has(key)) return backdropChoiceCache.get(key)
  if (backdropInFlight.has(key)) return backdropInFlight.get(key)

  const p = (async () => {
    const chosen = await fetchBestBackdropEN(type, id)
    backdropChoiceCache.set(key, chosen || null)
    backdropInFlight.delete(key)
    return chosen || null
  })()

  backdropInFlight.set(key, p)
  return p
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
 * SmartPoster (soporta 'poster' o 'backdrop')
 */
function SmartPoster({ item, title, mode = 'poster' }) {
  const type = item.media_type || (item.title ? 'movie' : 'tv')
  const id = item.id

  const [src, setSrc] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let abort = false

    // ✅ evita 1-frame con imagen anterior
    setSrc(null)
    setReady(false)

    const load = async () => {
      if (mode === 'backdrop') {
        const bestBackdrop = await getBestBackdropCached(type, id)
        const finalPath = bestBackdrop || item.backdrop_path || item.poster_path || null
        const url = finalPath ? buildImg(finalPath, 'w1280') : null
        if (url) await preloadImage(url)
        if (!abort) {
          setSrc(url)
          setReady(!!url)
        }
        return
      }

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
  }, [mode, type, id, item.poster_path, item.backdrop_path])

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

// ================== small helpers ==================
function runPool(items, limit, worker) {
  return new Promise((resolve) => {
    const queue = [...items]
    let active = 0
    let done = 0
    const total = queue.length

    const next = () => {
      while (active < limit && queue.length) {
        const it = queue.shift()
        active++
        Promise.resolve(worker(it))
          .catch(() => { })
          .finally(() => {
            active--
            done++
            if (done >= total) resolve()
            else next()
          })
      }
      if (total === 0) resolve()
    }

    next()
  })
}

function hasOwn(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key)
}

/**
 * status:
 * - pending: todavía no se ha pedido / resuelto (undefined)
 * - none: resuelto pero no existe nota (null)
 * - value: number
 */
function getScoreStatus(mapObj, key) {
  if (!hasOwn(mapObj, key)) return { status: 'pending', value: null }
  const v = mapObj[key]
  if (typeof v === 'number' && !Number.isNaN(v)) return { status: 'value', value: v }
  return { status: 'none', value: null }
}

// ================== UI COMPONENTS ==================
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
    <div ref={ref} className={`relative ${open ? 'z-[9999]' : 'z-20'} ${className}`}>
      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 ml-1 hidden sm:block">{label}</div>

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
      className={`w-full px-3 py-2 rounded-lg text-left text-xs sm:text-sm transition flex items-center justify-between ${active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
        }`}
    >
      <span className="font-medium">{children}</span>
      {active && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
    </button>
  )
}

function AllGlyph({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}
function TvGlyph({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <path d="m17 2-5 5-5-5" />
    </svg>
  )
}
function PosterGlyph({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 12h6" opacity="0.5" />
    </svg>
  )
}
function BackdropGlyph({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 15l5.5-5.5L12 13l3.5-3.5L21 15" opacity="0.5" />
    </svg>
  )
}

// ✅ Tipo: Todo / Películas / Series
function MediaTypeIconSwitch({ value, onChange, className = '', widthClass = 'w-full' }) {
  const btnBase =
    'relative z-10 w-1/3 h-full rounded-lg grid place-items-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
  const active = 'bg-white/10 text-white'
  const inactive = 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'

  return (
    <div className={`${widthClass} ${className}`}>
      <div className="h-10 rounded-xl bg-zinc-900 border border-zinc-800 p-1 flex items-center overflow-hidden">
        <button type="button" aria-label="Todo" title="Todo" aria-pressed={value === 'all'} onClick={() => onChange('all')} className={`${btnBase} ${value === 'all' ? active : inactive}`}>
          <AllGlyph className="w-4 h-4" />
        </button>
        <button type="button" aria-label="Películas" title="Películas" aria-pressed={value === 'movie'} onClick={() => onChange('movie')} className={`${btnBase} ${value === 'movie' ? active : inactive}`}>
          <Film className="w-4 h-4" />
        </button>
        <button type="button" aria-label="Series" title="Series" aria-pressed={value === 'tv'} onClick={() => onChange('tv')} className={`${btnBase} ${value === 'tv' ? active : inactive}`}>
          <TvGlyph className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ✅ Vista: Portada / Backdrop
function CoverModeIconSwitch({ value, onChange, className = '', showLabel = false, widthClass = 'w-[72px] sm:w-[86px]' }) {
  const isBackdrop = value === 'backdrop'

  const btnBase =
    'relative z-10 w-1/2 h-full rounded-lg grid place-items-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
  const active = 'bg-white/10 text-white'
  const inactive = 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'

  return (
    <div className={`${widthClass} ${className}`}>
      {showLabel ? (
        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 ml-1 hidden sm:block">Vista</div>
      ) : null}

      <div className="h-10 rounded-xl bg-zinc-900 border border-zinc-800 p-1 flex items-center overflow-hidden">
        <button type="button" aria-label="Portada" title="Portada" aria-pressed={!isBackdrop} onClick={() => onChange('poster')} className={`${btnBase} ${!isBackdrop ? active : inactive}`}>
          <PosterGlyph className="w-4 h-4" />
        </button>
        <button type="button" aria-label="Backdrop" title="Backdrop" aria-pressed={isBackdrop} onClick={() => onChange('backdrop')} className={`${btnBase} ${isBackdrop ? active : inactive}`}>
          <BackdropGlyph className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Móvil mejorado + logos
function StatBox({ label, value, icon: Icon, imgSrc, colorClass }) {
  return (
    <div className="flex flex-col items-start min-w-0">
      <div className="flex items-center gap-1.5 mb-1 opacity-75 min-w-0">
        {imgSrc ? (
          <img src={imgSrc} alt={label} className="w-auto h-3 sm:h-3.5 object-contain opacity-85 shrink-0" />
        ) : Icon ? (
          <Icon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${colorClass}`} />
        ) : null}

        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-400 truncate">{label}</span>
      </div>

      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-lg sm:text-xl font-black text-white tabular-nums tracking-tight leading-none truncate">{value}</span>
      </div>
    </div>
  )
}

// Skeleton loader para las tarjetas
function CardSkeleton({ mode = 'poster' }) {
  const wrapAspect = mode === 'backdrop' ? 'aspect-[16/9]' : 'aspect-[2/3]'

  return (
    <div className={`relative ${wrapAspect} w-full overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-white/5`}>
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-800/50 via-neutral-900/50 to-neutral-800/50 animate-pulse" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"
        style={{
          backgroundSize: '200% 100%',
          animation: 'shimmer 2s infinite'
        }}
      />
    </div>
  )
}

function GroupDivider({ title, stats, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0

  return (
    <motion.div
      className="my-8 sm:my-10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="relative overflow-hidden rounded-2xl bg-[#0a0a0a] border border-white/[0.08]">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/[0.03] via-transparent to-transparent opacity-50" />

        <div className="relative px-4 sm:px-6 py-4 sm:py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-1.5 h-10 sm:h-12 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.35)] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight line-clamp-2 sm:line-clamp-1">{title}</h2>
              <div className="mt-1 text-xs sm:text-sm text-zinc-500 font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-zinc-300 font-bold">{count}</span>
                <span>items</span>
                <span className="hidden sm:inline w-1 h-1 rounded-full bg-zinc-700" />
                <span className="opacity-90">{pct}% del total</span>
              </div>
            </div>
          </div>

          <div className="pt-3 sm:pt-4 lg:pt-0 border-t border-white/5 lg:border-t-0 w-full lg:w-auto">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-4">
              <StatBox label="IMDb" value={formatAvg(stats?.imdb?.avg)} imgSrc="/logo-IMDb.png" />
              <StatBox label="Trakt" value={formatAvg(stats?.trakt?.avg)} imgSrc="/logo-Trakt.png" />
              <StatBox label="TMDb" value={formatAvg(stats?.tmdb?.avg)} imgSrc="/logo-TMDb.png" />
              <div className="sm:pl-4 sm:border-l border-white/10">
                <StatBox label="Tu media" value={formatAvg(stats?.my?.avg)} icon={Star} colorClass="text-amber-400 fill-amber-400" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ================== TMDb account pagination ==================
function getSessionId(session) {
  if (!session) return null
  if (typeof session === 'string') return session
  return session.session_id || session.id || session.sessionId || null
}

async function fetchAccountListPage({ accountId, sessionId, listKind, mediaType, page, language }) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!apiKey || !accountId || !sessionId) throw new Error('Missing TMDb auth')

  const base = listKind === 'favorites' ? 'favorite' : 'watchlist'
  const suffix = mediaType === 'movie' ? 'movies' : 'tv'

  const url = new URL(`${TMDB_BASE}/account/${accountId}/${base}/${suffix}`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('session_id', sessionId)
  url.searchParams.set('sort_by', 'created_at.desc')
  url.searchParams.set('page', String(page || 1))
  if (language) url.searchParams.set('language', language)

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
    _lang: language || null,
  }
}

function applyLangFields(item, lang) {
  const isES = typeof lang === 'string' && lang.toLowerCase().startsWith('es')
  const isEN = typeof lang === 'string' && lang.toLowerCase().startsWith('en')

  const mediaType = item.media_type || (item.title ? 'movie' : 'tv')
  if (mediaType === 'movie') {
    const t = item.title || item.original_title || ''
    if (isES) item._title_es = t
    if (isEN) item._title_en = t
  } else {
    const n = item.name || item.original_name || ''
    if (isES) item._name_es = n
    if (isEN) item._name_en = n
  }
  return item
}

function mergeLangInto(base, alt, altLang) {
  if (!alt) return base
  const out = { ...base }

  applyLangFields(out, base?._lang || null)
  const tmp = applyLangFields({ ...alt }, altLang)

  if (tmp._title_es) out._title_es = tmp._title_es
  if (tmp._title_en) out._title_en = tmp._title_en
  if (tmp._name_es) out._name_es = tmp._name_es
  if (tmp._name_en) out._name_en = tmp._name_en

  return out
}

async function fetchAccountListPageBilingual({ accountId, sessionId, listKind, mediaType, page }) {
  const [esRes, enRes] = await Promise.allSettled([
    fetchAccountListPage({ accountId, sessionId, listKind, mediaType, page, language: 'es-ES' }),
    fetchAccountListPage({ accountId, sessionId, listKind, mediaType, page, language: 'en-US' }),
  ])

  const esOk = esRes.status === 'fulfilled' ? esRes.value : null
  const enOk = enRes.status === 'fulfilled' ? enRes.value : null
  const base = esOk || enOk
  if (!base) throw new Error('TMDb request failed')

  const baseLang = base === esOk ? 'es-ES' : 'en-US'
  const alt = base === esOk ? enOk : esOk
  const altLang = base === esOk ? 'en-US' : 'es-ES'

  const altMap = new Map()
  if (alt?.results?.length) {
    for (const it of alt.results) altMap.set(it.id, it)
  }

  const merged = []
  for (const it of base.results || []) {
    const a = altMap.get(it.id)
    const b2 = mergeLangInto({ ...it, _lang: baseLang }, a, altLang)
    merged.push(b2)
    altMap.delete(it.id)
  }

  for (const [, it] of altMap.entries()) {
    const extra = mergeLangInto({ ...it, _lang: altLang }, null, null)
    merged.push(extra)
  }

  return {
    page: base.page,
    total_pages: base.total_pages,
    total_results: base.total_results,
    results: merged.map((x) => {
      applyLangFields(x, baseLang)
      if (altLang) applyLangFields(x, altLang)
      return x
    }),
  }
}

// ================== USER / TRAKT SCORE FETCHERS ==================
function makeKey(mediaType, id) {
  return `${mediaType}:${id}`
}
function toTraktType(mediaType) {
  return mediaType === 'movie' ? 'movie' : 'show'
}

async function fetchTmdbUserRating({ mediaType, id, sessionId }) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!apiKey || !sessionId) return null
  try {
    const url = new URL(`${TMDB_BASE}/${mediaType}/${id}/account_states`)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('session_id', sessionId)

    const r = await fetch(url.toString(), { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return null

    const rated = j?.rated
    if (rated && typeof rated === 'object' && typeof rated.value === 'number') return rated.value
    return null
  } catch {
    return null
  }
}

async function getUnifiedUserRatingCached({ mediaType, id, sessionId, getImdbId }) {
  const key = makeKey(mediaType, id)
  const now = Date.now()

  const cached = userRatingCache.get(key)
  if (cached) {
    const ttl = cached.v == null ? USER_RATING_TTL_NULL_MS : USER_RATING_TTL_MS
    if (now - cached.t < ttl) return cached.v
  }

  if (userRatingInFlight.has(key)) return userRatingInFlight.get(key)

  const p = (async () => {
    const tmdb = await fetchTmdbUserRating({ mediaType, id, sessionId })
    if (typeof tmdb === 'number') {
      userRatingCache.set(key, { v: tmdb, t: Date.now() })
      userRatingInFlight.delete(key)
      return tmdb
    }

    if (traktConnectedKnown === false) {
      userRatingCache.set(key, { v: null, t: Date.now() })
      userRatingInFlight.delete(key)
      return null
    }

    try {
      const imdbId = await getImdbId?.(mediaType, id)
      const res = await traktGetItemStatus({
        type: toTraktType(mediaType),
        tmdbId: id,
        imdbId: imdbId || undefined,
      })

      if (typeof res?.connected === 'boolean') traktConnectedKnown = res.connected
      const tr = clampNumber(res?.rating)
      userRatingCache.set(key, { v: tr, t: Date.now() })
      userRatingInFlight.delete(key)
      return tr
    } catch {
      userRatingCache.set(key, { v: null, t: Date.now() })
      userRatingInFlight.delete(key)
      return null
    }
  })()

  userRatingInFlight.set(key, p)
  return p
}

async function getTraktCommunityScoreCached({ mediaType, id }) {
  const key = makeKey(mediaType, id)
  const now = Date.now()
  const cached = traktScoreCache.get(key)
  if (cached && now - cached.t < TRAKT_SCORE_TTL_MS) return cached

  if (traktScoreInFlight.has(key)) return traktScoreInFlight.get(key)

  const p = (async () => {
    try {
      const r = await traktGetScoreboard({ type: toTraktType(mediaType), tmdbId: id })
      const rating = typeof r?.community?.rating === 'number' ? r.community.rating : null
      const votes = typeof r?.community?.votes === 'number' ? r.community.votes : null
      const payload = { v: rating, votes, t: Date.now() }
      traktScoreCache.set(key, payload)
      traktScoreInFlight.delete(key)
      return payload
    } catch {
      const payload = { v: null, votes: null, t: Date.now() }
      traktScoreCache.set(key, payload)
      traktScoreInFlight.delete(key)
      return payload
    }
  })()

  traktScoreInFlight.set(key, p)
  return p
}

// ================== MAIN PAGE ==================
export default function WatchlistPage() {
  const { session, account, hydrated } = useAuth()
  const [authStatus, setAuthStatus] = useState('checking')

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  // Filters / Group / Sort
  const [typeFilter, setTypeFilter] = useState(() => {
    if (typeof window === 'undefined') return 'all'
    const saved = window.localStorage.getItem('showverse:watchlist:typeFilter')
    return saved || 'all'
  })
  const [query, setQuery] = useState('')
  const [groupBy, setGroupBy] = useState(() => {
    if (typeof window === 'undefined') return 'none'
    const saved = window.localStorage.getItem('showverse:watchlist:groupBy')
    return saved || 'none'
  })
  const [sortBy, setSortBy] = useState(() => {
    if (typeof window === 'undefined') return 'added_desc'
    const saved = window.localStorage.getItem('showverse:watchlist:sortBy')
    return saved || 'added_desc'
  })

  // ✅ NUEVO: modo portada/backdrop (persistido)
  const [coverMode, setCoverMode] = useState(() => {
    if (typeof window === 'undefined') return 'poster'
    const saved = window.localStorage.getItem('showverse:watchlist:coverMode')
    return saved === 'poster' || saved === 'backdrop' ? saved : 'poster'
  })

  // Persistir filtros en localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('showverse:watchlist:typeFilter', typeFilter)
  }, [typeFilter])
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('showverse:watchlist:groupBy', groupBy)
  }, [groupBy])
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('showverse:watchlist:sortBy', sortBy)
  }, [sortBy])
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('showverse:watchlist:coverMode', coverMode)
  }, [coverMode])

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

  // Totals
  const [totalMovie, setTotalMovie] = useState(0)
  const [totalTv, setTotalTv] = useState(0)

  // ---- Load-all (when filtering/sorting/grouping/searching) ----
  const [loadingAll, setLoadingAll] = useState(false)
  const allLoadedRef = useRef(false)
  const loadingAllRef = useRef(false)

  const nextMoviePageRef = useRef(nextMoviePage)
  const nextTvPageRef = useRef(nextTvPage)
  const hasMoreMovieRef = useRef(hasMoreMovie)
  const hasMoreTvRef = useRef(hasMoreTv)

  useEffect(() => { nextMoviePageRef.current = nextMoviePage }, [nextMoviePage])
  useEffect(() => { nextTvPageRef.current = nextTvPage }, [nextTvPage])
  useEffect(() => { hasMoreMovieRef.current = hasMoreMovie }, [hasMoreMovie])
  useEffect(() => { hasMoreTvRef.current = hasMoreTv }, [hasMoreTv])

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

  // Detectar touch/coarse pointer
  const isTouchRef = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(hover: none), (pointer: coarse)')
    const apply = () => { isTouchRef.current = !!mql.matches }
    apply()
    mql.addEventListener?.('change', apply)
    return () => mql.removeEventListener?.('change', apply)
  }, [])

  // “Hover” en móvil: card activa temporalmente
  const [activeCardKey, setActiveCardKey] = useState(null)
  const activeTimerRef = useRef(0)
  const activateCard = useCallback((k) => {
    setActiveCardKey(k)
    if (typeof window !== 'undefined') {
      window.clearTimeout(activeTimerRef.current)
      activeTimerRef.current = window.setTimeout(() => setActiveCardKey(null), 2600)
    }
  }, [])
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') window.clearTimeout(activeTimerRef.current)
    }
  }, [])
  useEffect(() => {
    setActiveCardKey(null)
  }, [coverMode])

  // IMDb ratings
  const [imdbRatings, setImdbRatings] = useState({})
  const imdbRatingsRef = useRef({})
  const imdbInFlightRef = useRef(new Set())
  const imdbTimersRef = useRef({})
  const imdbIdCacheRef = useRef({})
  const unmountedRef = useRef(false)

  // User ratings (unified)
  const [myRatings, setMyRatings] = useState({})
  const myRatingsRef = useRef({})
  const myInFlightRef = useRef(new Set())

  // Trakt community ratings
  const [traktScores, setTraktScores] = useState({})
  const traktScoresRef = useRef({})
  const traktInFlightRef = useRef(new Set())

  useEffect(() => { imdbRatingsRef.current = imdbRatings }, [imdbRatings])
  useEffect(() => { myRatingsRef.current = myRatings }, [myRatings])
  useEffect(() => { traktScoresRef.current = traktScores }, [traktScores])

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

  const wantsFullCollection =
    authStatus === 'authenticated' &&
    (typeFilter !== 'all' || groupBy !== 'none' || sortBy !== 'added_desc' || !!query.trim())

  const sortNeedsImdb = sortBy.startsWith('imdb_')
  const sortNeedsTrakt = sortBy.startsWith('trakt_')
  const sortNeedsMy = sortBy.startsWith('my_')

  const groupNeedsImdb = groupBy === 'imdb_rating'
  const groupNeedsTrakt = groupBy === 'trakt_rating'
  const groupNeedsMy = groupBy === 'user_rating'

  const needsImdb = sortNeedsImdb || groupNeedsImdb
  const needsTrakt = sortNeedsTrakt || groupNeedsTrakt
  const needsMyForGrouping = sortNeedsMy || groupNeedsMy

  // Reset visible when filters/group/sort change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE)
  }, [typeFilter, query, groupBy, sortBy])

  // Clear rating caches + state when coming back
  useEffect(() => {
    const refresh = () => {
      userRatingCache.clear()
      userRatingInFlight.clear()
      traktConnectedKnown = null

      setMyRatings({})
      setTraktScores({})
      myInFlightRef.current = new Set()
      traktInFlightRef.current = new Set()
    }

    refresh()

    const onFocus = () => refresh()
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

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
      allLoadedRef.current = false
      loadingAllRef.current = false
      setLoadingAll(false)
      return
    }

    const load = async () => {
      const sessionId = getSessionId(session)
      if (!sessionId || !account?.id) return

      setLoading(true)
      setError(null)
      setLoadingMore(false)

      setNextMoviePage(1)
      setNextTvPage(1)
      setHasMoreMovie(true)
      setHasMoreTv(true)
      nextMoviePageRef.current = 1
      nextTvPageRef.current = 1
      hasMoreMovieRef.current = true
      hasMoreTvRef.current = true
      allLoadedRef.current = false
      loadingAllRef.current = false
      setLoadingAll(false)

      seenRef.current = new Set()

      try {
        const [m1, t1] = await Promise.all([
          fetchAccountListPageBilingual({ accountId: account.id, sessionId, listKind: 'watchlist', mediaType: 'movie', page: 1 }),
          fetchAccountListPageBilingual({ accountId: account.id, sessionId, listKind: 'watchlist', mediaType: 'tv', page: 1 }),
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

        let unique2 = [...unique]
        let moviePageLoaded = 1
        let tvPageLoaded = 1

        if (unique2.length < INITIAL_VISIBLE && m1.page < m1.total_pages) {
          const m2 = await fetchAccountListPageBilingual({ accountId: account.id, sessionId, listKind: 'watchlist', mediaType: 'movie', page: 2 })
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
          const t2 = await fetchAccountListPageBilingual({ accountId: account.id, sessionId, listKind: 'watchlist', mediaType: 'tv', page: 2 })
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
          nextMoviePageRef.current = moviePageLoaded + 1
          nextTvPageRef.current = tvPageLoaded + 1

          const mHas = moviePageLoaded < m1.total_pages
          const tHas = tvPageLoaded < t1.total_pages
          setHasMoreMovie(mHas)
          setHasMoreTv(tHas)
          hasMoreMovieRef.current = mHas
          hasMoreTvRef.current = tHas

          if (!mHas && !tHas) allLoadedRef.current = true
        }
      } catch {
        if (!cancelled) setError('No se ha podido cargar tu lista de pendientes.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [authStatus, session, account])

  // External IDs helper
  const getImdbId = useCallback(async (mediaType, id) => {
    const k = makeKey(mediaType, id)
    let imdbId = imdbIdCacheRef.current?.[k]
    if (imdbId) return imdbId
    const ext = await getExternalIds(mediaType, id)
    imdbId = ext?.imdb_id || null
    if (imdbId) imdbIdCacheRef.current[k] = imdbId
    return imdbId
  }, [])

  const prefetchImdb = useCallback(async (item, opts = {}) => {
    if (!item?.id || typeof window === 'undefined') return
    const delayMs = typeof opts?.delayMs === 'number' ? opts.delayMs : 150

    const mediaType = item.media_type || (item.title ? 'movie' : 'tv')
    const key = makeKey(mediaType, item.id)

    if (hasOwn(imdbRatingsRef.current, key) || imdbInFlightRef.current.has(key)) return

    const run = async () => {
      try {
        imdbInFlightRef.current.add(key)

        const imdbId = await getImdbId(mediaType, item.id)
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
    }

    if (delayMs > 0) imdbTimersRef.current[key] = window.setTimeout(run, delayMs)
    else await run()
  }, [getImdbId])

  const prefetchMyRating = useCallback(async (item) => {
    const sessionId = getSessionId(session)
    if (!item?.id || !sessionId) return
    const mediaType = item.media_type || (item.title ? 'movie' : 'tv')
    const key = makeKey(mediaType, item.id)

    if (hasOwn(myRatingsRef.current, key) || myInFlightRef.current.has(key)) return

    myInFlightRef.current.add(key)
    try {
      const v = await getUnifiedUserRatingCached({ mediaType, id: item.id, sessionId, getImdbId })
      if (!unmountedRef.current) setMyRatings((p) => ({ ...p, [key]: v }))
    } finally {
      myInFlightRef.current.delete(key)
    }
  }, [session, getImdbId])

  const prefetchTraktScore = useCallback(async (item) => {
    if (!item?.id) return
    const mediaType = item.media_type || (item.title ? 'movie' : 'tv')
    const key = makeKey(mediaType, item.id)
    if (hasOwn(traktScoresRef.current, key) || traktInFlightRef.current.has(key)) return

    traktInFlightRef.current.add(key)
    try {
      const payload = await getTraktCommunityScoreCached({ mediaType, id: item.id })
      if (!unmountedRef.current) setTraktScores((p) => ({ ...p, [key]: payload?.v ?? null }))
    } finally {
      traktInFlightRef.current.delete(key)
    }
  }, [])

  const processedItems = useMemo(() => {
    let list = [...items]

    if (typeFilter !== 'all') list = list.filter((i) => i.media_type === typeFilter)

    const q = normText(query)
    if (q) {
      list = list.filter((i) => {
        const mediaType = i.media_type || (i.title ? 'movie' : 'tv')
        const candidates = mediaType === 'movie'
          ? [i.title, i._title_es, i._title_en, i.original_title]
          : [i.name, i._name_es, i._name_en, i.original_name]
        return candidates.filter(Boolean).map(normText).some((t) => t.includes(q))
      })
    }

    const getYear = (i) => {
      const date = i.media_type === 'movie' ? i.release_date : i.first_air_date
      const y = date ? parseInt(date.slice(0, 4), 10) : 0
      return Number.isFinite(y) ? y : 0
    }

    const getAddedTs = (i) => {
      const v = i?.created_at
      const ts = v ? Date.parse(v) : 0
      return Number.isFinite(ts) ? ts : 0
    }

    const getTitle = (i) => normText(i.title || i.name || i._title_es || i._name_es || i._title_en || i._name_en || '')

    const getImdb = (i) => imdbRatings?.[makeKey(i.media_type, i.id)]
    const getMy = (i) => myRatings?.[makeKey(i.media_type, i.id)]
    const getTrakt = (i) => traktScores?.[makeKey(i.media_type, i.id)]

    list.sort((a, b) => {
      const ya = getYear(a)
      const yb = getYear(b)
      const ta = getTitle(a)
      const tb = getTitle(b)

      switch (sortBy) {
        case 'added_desc': return getAddedTs(b) - getAddedTs(a)
        case 'added_asc': return getAddedTs(a) - getAddedTs(b)

        case 'year_desc': return yb - ya
        case 'year_asc': return ya - yb

        case 'tmdb_desc': return (b.vote_average || 0) - (a.vote_average || 0)
        case 'tmdb_asc': return (a.vote_average || 0) - (b.vote_average || 0)

        case 'imdb_desc': {
          const ib = getImdb(b); const ia = getImdb(a)
          return (typeof ib === 'number' ? ib : -1) - (typeof ia === 'number' ? ia : -1)
        }
        case 'imdb_asc': {
          const ib = getImdb(b); const ia = getImdb(a)
          return (typeof ia === 'number' ? ia : 999) - (typeof ib === 'number' ? ib : 999)
        }

        case 'trakt_desc': {
          const rb = getTrakt(b); const ra = getTrakt(a)
          return (typeof rb === 'number' ? rb : -1) - (typeof ra === 'number' ? ra : -1)
        }
        case 'trakt_asc': {
          const rb = getTrakt(b); const ra = getTrakt(a)
          return (typeof ra === 'number' ? ra : 999) - (typeof rb === 'number' ? rb : 999)
        }

        case 'my_desc': {
          const mb = getMy(b); const ma = getMy(a)
          return (typeof mb === 'number' ? mb : -1) - (typeof ma === 'number' ? ma : -1)
        }
        case 'my_asc': {
          const mb = getMy(b); const ma = getMy(a)
          return (typeof ma === 'number' ? ma : 999) - (typeof mb === 'number' ? mb : 999)
        }

        case 'title_desc': return tb.localeCompare(ta)
        case 'title_asc':
        default: return ta.localeCompare(tb)
      }
    })

    return list
  }, [items, typeFilter, query, sortBy, sortNeedsImdb ? imdbRatings : null, sortNeedsTrakt ? traktScores : null, sortNeedsMy ? myRatings : null])

  useEffect(() => {
    if (!wantsFullCollection) return
    setVisibleCount(Math.max(INITIAL_VISIBLE, processedItems.length))
  }, [wantsFullCollection, processedItems.length])

  const visibleItems = useMemo(() => processedItems.slice(0, visibleCount), [processedItems, visibleCount])

  const canFetchRemote = useMemo(() => {
    const wantMovie = (typeFilter === 'all' || typeFilter === 'movie') && hasMoreMovie
    const wantTv = (typeFilter === 'all' || typeFilter === 'tv') && hasMoreTv
    return wantMovie || wantTv
  }, [typeFilter, hasMoreMovie, hasMoreTv])

  const canLoadMore = visibleCount < processedItems.length || canFetchRemote

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || loadingAll) return
    if (!canLoadMore) return

    if (visibleCount < processedItems.length) {
      setVisibleCount((v) => v + UI_BATCH)
      return
    }

    const sessionId = getSessionId(session)
    if (!sessionId || !account?.id) return

    const wantMovie = (typeFilter === 'all' || typeFilter === 'movie') && hasMoreMovie
    const wantTv = (typeFilter === 'all' || typeFilter === 'tv') && hasMoreTv
    if (!wantMovie && !wantTv) return

    setLoadingMore(true)
    try {
      const tasks = []
      if (wantMovie) {
        tasks.push(fetchAccountListPageBilingual({ accountId: account.id, sessionId, listKind: 'watchlist', mediaType: 'movie', page: nextMoviePage }).then((res) => ({ kind: 'movie', res })))
      }
      if (wantTv) {
        tasks.push(fetchAccountListPageBilingual({ accountId: account.id, sessionId, listKind: 'watchlist', mediaType: 'tv', page: nextTvPage }).then((res) => ({ kind: 'tv', res })))
      }

      const results = await Promise.all(tasks)

      setItems((prev) => {
        const next = [...prev]
        for (const r of results) {
          const res = r.res
          for (const it of res.results) {
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
    loading, loadingMore, loadingAll, canLoadMore,
    visibleCount, processedItems.length, session, account,
    typeFilter, hasMoreMovie, hasMoreTv, nextMoviePage, nextTvPage,
  ])

  useEffect(() => {
    if (!canLoadMore) return
    const el = sentinelRef.current
    if (!el) return

    const obs = new IntersectionObserver((entries) => {
      const first = entries[0]
      if (!first?.isIntersecting) return
      if (!userScrolledRef.current) return
      loadMore()
    }, { root: null, rootMargin: '300px 0px', threshold: 0 })

    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore, canLoadMore])

  const ensureAllWatchlistLoaded = useCallback(async () => {
    const sessionId = getSessionId(session)
    if (!sessionId || !account?.id) return
    if (loadingAllRef.current || allLoadedRef.current) return

    loadingAllRef.current = true
    setLoadingAll(true)

    try {
      let mPage = nextMoviePageRef.current
      let tPage = nextTvPageRef.current
      let mHas = hasMoreMovieRef.current
      let tHas = hasMoreTvRef.current

      while (mHas || tHas) {
        const tasks = []
        if (mHas) tasks.push(fetchAccountListPageBilingual({ accountId: account.id, sessionId, listKind: 'watchlist', mediaType: 'movie', page: mPage }).then((res) => ({ kind: 'movie', res })))
        if (tHas) tasks.push(fetchAccountListPageBilingual({ accountId: account.id, sessionId, listKind: 'watchlist', mediaType: 'tv', page: tPage }).then((res) => ({ kind: 'tv', res })))
        if (!tasks.length) break

        const results = await Promise.all(tasks)

        startTransition(() => {
          setItems((prev) => {
            const next = [...prev]
            for (const r of results) {
              for (const it of r.res.results || []) {
                const k = `${it.media_type}:${it.id}`
                if (!seenRef.current.has(k)) {
                  seenRef.current.add(k)
                  next.push(it)
                }
              }
            }
            return next
          })
        })

        for (const r of results) {
          if (r.kind === 'movie') { mHas = r.res.page < r.res.total_pages; mPage = r.res.page + 1 }
          else { tHas = r.res.page < r.res.total_pages; tPage = r.res.page + 1 }
        }

        nextMoviePageRef.current = mPage
        nextTvPageRef.current = tPage
        hasMoreMovieRef.current = mHas
        hasMoreTvRef.current = tHas

        setNextMoviePage(mPage)
        setNextTvPage(tPage)
        setHasMoreMovie(mHas)
        setHasMoreTv(tHas)
      }

      allLoadedRef.current = true
    } finally {
      loadingAllRef.current = false
      setLoadingAll(false)
    }
  }, [session, account])

  useEffect(() => {
    if (!wantsFullCollection) return
    if (loading) return
    ensureAllWatchlistLoaded()
  }, [wantsFullCollection, ensureAllWatchlistLoaded, loading])

  // Prefetch “Mi nota” para UI (lo visible)
  useEffect(() => {
    if (authStatus !== 'authenticated') return
    const sessionId = getSessionId(session)
    if (!sessionId) return

    runPool(
      visibleItems.filter((it) => !hasOwn(myRatingsRef.current, makeKey(it.media_type, it.id))),
      6,
      async (it) => prefetchMyRating(it)
    )
  }, [authStatus, session, visibleItems, prefetchMyRating])

  // Prefetch “Mi nota” para agrupar/ordenar por mi nota
  useEffect(() => {
    if (!needsMyForGrouping) return
    if (authStatus !== 'authenticated') return
    const sessionId = getSessionId(session)
    if (!sessionId) return

    runPool(
      processedItems.filter((it) => !hasOwn(myRatingsRef.current, makeKey(it.media_type, it.id))),
      6,
      async (it) => prefetchMyRating(it)
    )
  }, [needsMyForGrouping, authStatus, session, processedItems, prefetchMyRating])

  // Prefetch IMDb cuando se necesita
  useEffect(() => {
    if (!needsImdb) return
    runPool(
      processedItems.filter((it) => !hasOwn(imdbRatingsRef.current, makeKey(it.media_type, it.id))),
      2,
      async (it) => prefetchImdb(it, { delayMs: 0 })
    )
  }, [needsImdb, processedItems, prefetchImdb])

  // Prefetch Trakt cuando se necesita
  useEffect(() => {
    if (!needsTrakt) return
    runPool(
      processedItems.filter((it) => !hasOwn(traktScoresRef.current, makeKey(it.media_type, it.id))),
      4,
      async (it) => prefetchTraktScore(it)
    )
  }, [needsTrakt, processedItems, prefetchTraktScore])

  const totalForHeader = useMemo(() => {
    if (typeFilter === 'movie') return totalMovie || 0
    if (typeFilter === 'tv') return totalTv || 0
    return (totalMovie || 0) + (totalTv || 0)
  }, [typeFilter, totalMovie, totalTv])

  const groupedSections = useMemo(() => {
    if (groupBy === 'none') return null

    const getYear = (i) => {
      const date = i.media_type === 'movie' ? i.release_date : i.first_air_date
      const y = date ? parseInt(date.slice(0, 4), 10) : 0
      return Number.isFinite(y) ? y : 0
    }

    const keyToScoreBucket = (prefix, score, mode = 'int') => {
      if (typeof score !== 'number') return { key: 'no', label: `${prefix} · Sin nota` }
      if (mode === 'half') {
        const s = Math.round(score * 2) / 2
        const lbl = formatHalfSteps(s) || String(s)
        return { key: String(s), label: `${prefix} · ${lbl}` }
      }
      const b = Math.floor(score)
      const hi = b === 10 ? '10' : `${b}.x`
      return { key: String(b), label: `${prefix} · ${hi}` }
    }

    const groups = new Map()

    for (const it of visibleItems) {
      const mediaType = it.media_type || (it.title ? 'movie' : 'tv')
      const k = makeKey(mediaType, it.id)

      let gKey = 'no'
      let gLabel = 'Sin agrupar'

      if (groupBy === 'year') {
        const y = getYear(it)
        gKey = y ? String(y) : 'no'
        gLabel = y ? `Año · ${y}` : 'Año · Desconocido'
      } else if (groupBy === 'decade') {
        const y = getYear(it)
        const d = y ? Math.floor(y / 10) * 10 : 0
        gKey = d ? String(d) : 'no'
        gLabel = d ? `Década · ${d}s` : 'Década · Desconocida'
      } else if (groupBy === 'tmdb_rating') {
        const r = clampNumber(it.vote_average)
        const out = keyToScoreBucket('TMDb', r, 'int')
        gKey = out.key
        gLabel = out.label
      } else if (groupBy === 'imdb_rating') {
        const st = getScoreStatus(imdbRatings, k)
        if (st.status === 'pending') { gKey = 'pending'; gLabel = 'IMDb · Cargando...' }
        else if (st.status === 'none') { gKey = 'no'; gLabel = 'IMDb · Sin nota' }
        else {
          const out = keyToScoreBucket('IMDb', st.value, 'int')
          gKey = out.key
          gLabel = out.label
        }
      } else if (groupBy === 'trakt_rating') {
        const st = getScoreStatus(traktScores, k)
        if (st.status === 'pending') { gKey = 'pending'; gLabel = 'Trakt · Cargando...' }
        else if (st.status === 'none') { gKey = 'no'; gLabel = 'Trakt · Sin nota' }
        else {
          const out = keyToScoreBucket('Trakt', st.value, 'int')
          gKey = out.key
          gLabel = out.label
        }
      } else if (groupBy === 'user_rating') {
        const st = getScoreStatus(myRatings, k)
        if (st.status === 'pending') { gKey = 'pending'; gLabel = 'Mi nota · Cargando...' }
        else if (st.status === 'none') { gKey = 'no'; gLabel = 'Mi nota · Sin nota' }
        else {
          const out = keyToScoreBucket('Mi nota', st.value, 'half')
          gKey = out.key
          gLabel = out.label
        }
      }

      if (!groups.has(gKey)) groups.set(gKey, { title: gLabel, items: [] })
      groups.get(gKey).items.push(it)
    }

    const entries = [...groups.entries()].map(([k, v]) => {
      const tmdbVals = v.items.map((it) => (typeof it.vote_average === 'number' ? it.vote_average : null))
      const imdbVals = v.items.map((it) => {
        const kk = makeKey(it.media_type, it.id)
        const val = imdbRatings?.[kk]
        return typeof val === 'number' ? val : null
      })
      const traktVals = v.items.map((it) => {
        const kk = makeKey(it.media_type, it.id)
        const val = traktScores?.[kk]
        return typeof val === 'number' ? val : null
      })
      const myVals = v.items.map((it) => {
        const kk = makeKey(it.media_type, it.id)
        const val = myRatings?.[kk]
        return typeof val === 'number' ? val : null
      })

      const avgOf = (vals) => {
        const nums = vals.filter((v) => typeof v === 'number' && !Number.isNaN(v))
        if (!nums.length) return { avg: null, n: 0 }
        const sum = nums.reduce((a, b) => a + b, 0)
        return { avg: sum / nums.length, n: nums.length }
      }

      return {
        k,
        ...v,
        stats: {
          tmdb: avgOf(tmdbVals),
          imdb: avgOf(imdbVals),
          trakt: avgOf(traktVals),
          my: avgOf(myVals),
        },
      }
    })

    const toNum = (k) => {
      if (k === 'no' || k === 'pending') return -999
      const n = Number(k)
      return Number.isFinite(n) ? n : -999
    }
    const sortNumDesc = (a, b) => toNum(b.k) - toNum(a.k)

    if (groupBy === 'year' || groupBy === 'decade' || groupBy.endsWith('rating') || groupBy === 'user_rating') {
      entries.sort(sortNumDesc)
    }

    const rank = (k) => (k === 'no' ? 2 : k === 'pending' ? 1 : 0)
    entries.sort((a, b) => rank(a.k) - rank(b.k))

    return entries
  }, [groupBy, visibleItems, imdbRatings, traktScores, myRatings])

  const sortLabel = useMemo(() => {
    switch (sortBy) {
      case 'added_desc': return 'Añadido (reciente)'
      case 'added_asc': return 'Añadido (antiguo)'
      case 'year_desc': return 'Año (reciente)'
      case 'year_asc': return 'Año (antiguo)'
      case 'tmdb_desc': return 'TMDb (alta)'
      case 'tmdb_asc': return 'TMDb (baja)'
      case 'imdb_desc': return 'IMDb (alta)'
      case 'imdb_asc': return 'IMDb (baja)'
      case 'trakt_desc': return 'Trakt (alta)'
      case 'trakt_asc': return 'Trakt (baja)'
      case 'my_desc': return 'Mi nota (alta)'
      case 'my_asc': return 'Mi nota (baja)'
      case 'title_desc': return 'Z - A'
      case 'title_asc':
      default: return 'A - Z'
    }
  }, [sortBy])

  const groupLabel = useMemo(() => {
    switch (groupBy) {
      case 'year': return 'Año'
      case 'decade': return 'Década'
      case 'tmdb_rating': return 'Nota TMDb'
      case 'imdb_rating': return 'Nota IMDb'
      case 'trakt_rating': return 'Nota Trakt'
      case 'user_rating': return 'Mi nota'
      default: return 'Sin agrupar'
    }
  }, [groupBy])

  // Grid class según vista
  const gridClass = useMemo(() => {
    if (coverMode === 'backdrop') {
      return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-3 sm:gap-6'
    }
    return 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-6'
  }, [coverMode])

  const renderCard = useCallback((item, index) => {
    const isMovie = item.media_type === 'movie'
    const mediaType = item.media_type || (item.title ? 'movie' : 'tv')
    const href = `/details/${mediaType}/${item.id}`
    const title = isMovie ? item.title : item.name
    const date = isMovie ? item.release_date : item.first_air_date
    const year = date ? date.slice(0, 4) : ''
    const k = makeKey(mediaType, item.id)

    const imdbScore = imdbRatings[k]
    const myScore = myRatings[k]
    const myLabel = formatHalfSteps(myScore)

    const cardKey = `${mediaType}:${item.id}`
    const isActive = activeCardKey === cardKey

    const onPrefetch = () => {
      prefetchImdb(item)
      prefetchMyRating(item)
      prefetchTraktScore(item)
    }

    const onClick = (e) => {
      if (isTouchRef.current && !isActive) {
        e.preventDefault()
        e.stopPropagation()
        onPrefetch()
        activateCard(cardKey)
        return
      }
    }

    const wrapAspect = coverMode === 'backdrop' ? 'aspect-[16/9]' : 'aspect-[2/3]'
    const hoverShadow = 'transition-all duration-500 group-hover:shadow-[0_0_25px_rgba(255,255,255,0.08)]'
    const ring = 'ring-1 ring-white/5'
    const overlayBase = 'absolute inset-0 transition-opacity duration-300 flex flex-col justify-between'
    const overlayOpacity = isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'

    const topTransform = isActive ? 'translate-y-0' : '-translate-y-2 group-hover:translate-y-0 group-focus-within:translate-y-0'
    const bottomTransform = isActive ? 'translate-y-0' : 'translate-y-4 group-hover:translate-y-0 group-focus-within:translate-y-0'

    const myTransform = isActive
      ? 'opacity-100 translate-y-0 scale-100'
      : 'opacity-0 translate-y-1 scale-[0.98] group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100'

    return (
      <motion.div
        key={`${mediaType}-${item.id}`}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.4,
          delay: Math.min(index * 0.03, 0.6),
          ease: [0.25, 0.1, 0.25, 1]
        }}
        layout
      >
        <Link
          href={href}
          className="group block relative w-full h-full"
          title={title}
          onMouseEnter={onPrefetch}
          onFocus={onPrefetch}
          onClick={onClick}
        >
          <div className={`relative ${wrapAspect} w-full overflow-hidden rounded-xl bg-neutral-900 shadow-lg ${ring} ${hoverShadow} z-0`}>
            <SmartPoster key={`${mediaType}:${item.id}:${coverMode}`} item={item} title={title} mode={coverMode} />

            <div className={`${overlayBase} ${overlayOpacity}`}>
              <div className={`p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform ${topTransform} transition-transform duration-300`}>
                <span
                  className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shadow-sm backdrop-blur-md ${isMovie ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                    }`}
                >
                  {isMovie ? 'PELÍCULA' : 'SERIE'}
                </span>

                <div className="flex flex-col items-end gap-1">
                  {item.vote_average > 0 && (
                    <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                      <span className="text-emerald-400 text-xs font-black font-mono tracking-tight">{item.vote_average.toFixed(1)}</span>
                      <img src="/logo-TMDb.png" alt="" className="w-auto h-2.5 opacity-100" />
                    </div>
                  )}
                  {typeof imdbScore === 'number' && imdbScore > 0 && (
                    <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                      <span className="text-yellow-400 text-xs font-black font-mono tracking-tight">{imdbScore.toFixed(1)}</span>
                      <img src="/logo-IMDb.png" alt="" className="w-auto h-3 opacity-100" />
                    </div>
                  )}
                </div>
              </div>

              <div className={`p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform ${bottomTransform} transition-transform duration-300`}>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0 text-left">
                    <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md text-xs sm:text-sm">{title}</h3>
                    {year && <p className="text-yellow-500 text-[10px] sm:text-xs font-bold mt-0.5 drop-shadow-md">{year}</p>}
                  </div>

                  {myLabel ? (
                    <div className={`shrink-0 self-end transition-all duration-300 ${myTransform}`}>
                      <span className="text-2xl font-black text-yellow-400 tracking-tighter drop-shadow-[0_2px_10px_rgba(250,204,21,0.5)]">{myLabel}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    )
  }, [coverMode, imdbRatings, myRatings, activeCardKey, prefetchImdb, prefetchMyRating, prefetchTraktScore, activateCard])

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
        <p className="text-neutral-400 mb-6">Inicia sesión para ver tu lista.</p>
        <Link href="/login" className="px-6 py-2 bg-white text-black rounded-full font-bold hover:bg-neutral-200">
          Iniciar Sesión
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#101010] overflow-y-scroll text-gray-100 font-sans selection:bg-blue-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header */}
        <motion.div
          className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
              <Bookmark className="w-8 h-8 text-blue-500 fill-current" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-white tracking-tight">Pendientes</h1>
              <p className="text-neutral-400 mt-1 font-medium">{totalForHeader} títulos en total</p>
            </div>
          </div>

          {/* Controles (desktop: todo en 1 línea; móvil: 2 líneas) */}
          <div className="w-full xl:w-auto">
            <div className="grid grid-cols-2 gap-3 sm:[grid-template-columns:minmax(0,1.35fr)_repeat(2,minmax(0,1fr))_minmax(0,1.25fr)]">
              {/* ✅ Tipo + Vista juntos (iconos) */}
              <div className="w-full">
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 ml-1 hidden sm:block">
                      Tipo
                    </div>
                    <MediaTypeIconSwitch
                      value={typeFilter}
                      onChange={(v) => startTransition(() => setTypeFilter(v))}
                      widthClass="w-full"
                    />
                  </div>

                  <div className="shrink-0">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 ml-1 hidden sm:block">
                      Vista
                    </div>
                    <CoverModeIconSwitch
                      value={coverMode}
                      onChange={(v) => startTransition(() => setCoverMode(v))}
                      showLabel={false}
                      widthClass="w-[72px] sm:w-[86px]"
                    />
                  </div>
                </div>
              </div>

              <Dropdown label="Agrupar" valueLabel={groupLabel} icon={Layers}>
                {({ close }) => (
                  <>
                    <DropdownItem active={groupBy === 'none'} onClick={() => { setGroupBy('none'); close() }}>
                      Sin agrupar
                    </DropdownItem>
                    <DropdownItem active={groupBy === 'year'} onClick={() => { setGroupBy('year'); close() }}>
                      Año
                    </DropdownItem>
                    <DropdownItem active={groupBy === 'decade'} onClick={() => { setGroupBy('decade'); close() }}>
                      Década
                    </DropdownItem>
                    <DropdownItem active={groupBy === 'tmdb_rating'} onClick={() => { setGroupBy('tmdb_rating'); close() }}>
                      Nota TMDb
                    </DropdownItem>
                    <DropdownItem active={groupBy === 'trakt_rating'} onClick={() => { setGroupBy('trakt_rating'); close() }}>
                      Nota Trakt
                    </DropdownItem>
                    <DropdownItem active={groupBy === 'imdb_rating'} onClick={() => { setGroupBy('imdb_rating'); close() }}>
                      Nota IMDb
                    </DropdownItem>
                    <DropdownItem active={groupBy === 'user_rating'} onClick={() => { setGroupBy('user_rating'); close() }}>
                      Mi nota
                    </DropdownItem>
                  </>
                )}
              </Dropdown>

              <Dropdown label="Ordenar" valueLabel={sortLabel} icon={ArrowUpDown}>
                {({ close }) => (
                  <>
                    <DropdownItem active={sortBy === 'added_desc'} onClick={() => { setSortBy('added_desc'); close() }}>
                      Añadido (reciente)
                    </DropdownItem>
                    <DropdownItem active={sortBy === 'added_asc'} onClick={() => { setSortBy('added_asc'); close() }}>
                      Añadido (antiguo)
                    </DropdownItem>

                    <DropdownItem active={sortBy === 'tmdb_desc'} onClick={() => { setSortBy('tmdb_desc'); close() }}>
                      TMDb (alta)
                    </DropdownItem>
                    <DropdownItem active={sortBy === 'tmdb_asc'} onClick={() => { setSortBy('tmdb_asc'); close() }}>
                      TMDb (baja)
                    </DropdownItem>

                    <DropdownItem active={sortBy === 'trakt_desc'} onClick={() => { setSortBy('trakt_desc'); close() }}>
                      Trakt (alta)
                    </DropdownItem>
                    <DropdownItem active={sortBy === 'trakt_asc'} onClick={() => { setSortBy('trakt_asc'); close() }}>
                      Trakt (baja)
                    </DropdownItem>

                    <DropdownItem active={sortBy === 'imdb_desc'} onClick={() => { setSortBy('imdb_desc'); close() }}>
                      IMDb (alta)
                    </DropdownItem>
                    <DropdownItem active={sortBy === 'imdb_asc'} onClick={() => { setSortBy('imdb_asc'); close() }}>
                      IMDb (baja)
                    </DropdownItem>

                    <DropdownItem active={sortBy === 'my_desc'} onClick={() => { setSortBy('my_desc'); close() }}>
                      Mi nota (alta)
                    </DropdownItem>
                    <DropdownItem active={sortBy === 'my_asc'} onClick={() => { setSortBy('my_asc'); close() }}>
                      Mi nota (baja)
                    </DropdownItem>

                    <DropdownItem active={sortBy === 'year_desc'} onClick={() => { setSortBy('year_desc'); close() }}>
                      Año (reciente)
                    </DropdownItem>
                    <DropdownItem active={sortBy === 'year_asc'} onClick={() => { setSortBy('year_asc'); close() }}>
                      Año (antiguo)
                    </DropdownItem>

                    <DropdownItem active={sortBy === 'title_asc'} onClick={() => { setSortBy('title_asc'); close() }}>
                      A - Z
                    </DropdownItem>
                    <DropdownItem active={sortBy === 'title_desc'} onClick={() => { setSortBy('title_desc'); close() }}>
                      Z - A
                    </DropdownItem>
                  </>
                )}
              </Dropdown>

              {/* Search */}
              <div className="relative group z-10">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 ml-1 hidden sm:block">
                  Buscar
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-zinc-300 transition-colors" />
                  <input
                    type="text"
                    placeholder="Buscar"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-all"
                  />
                  {query?.trim() ? (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition"
                    >
                      Limpiar
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3 mb-6">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-neutral-400 text-sm font-medium">Cargando tu lista...</span>
            </div>
            <div className={gridClass}>
              {Array.from({ length: INITIAL_VISIBLE }).map((_, i) => (
                <motion.div
                  key={`skeleton-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: Math.min(i * 0.02, 0.4),
                    ease: 'easeOut'
                  }}
                >
                  <CardSkeleton mode={coverMode} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : error ? (
          <div className="text-center py-20 text-red-400">{error}</div>
        ) : processedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/20">
            <FilterX className="w-16 h-16 text-neutral-700 mb-4" />
            <h3 className="text-xl font-bold text-neutral-300">Sin resultados</h3>
            <button
              onClick={() => {
                setTypeFilter('all')
                setGroupBy('none')
                setSortBy('added_desc')
                setQuery('')
              }}
              className="mt-4 text-sm text-blue-500 font-bold hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`covers-${coverMode}`}
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -15, scale: 0.98 }}
                  transition={{
                    duration: 0.35,
                    ease: [0.25, 0.1, 0.25, 1]
                  }}
                  className="will-change-transform"
                >
                  {groupedSections ? (
                    <div>
                      {groupedSections.map((section) => (
                        <div key={`grp-${section.k}`}>
                          <GroupDivider title={section.title} stats={section.stats} count={section.items.length} total={visibleItems.length} />
                          <div className={gridClass}>{section.items.map((item, idx) => renderCard(item, idx))}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={gridClass}>{visibleItems.map((item, idx) => renderCard(item, idx))}</div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* ✅ fuera del motion para que el observer no se rompa al cambiar vista */}
              <div ref={sentinelRef} className="h-10" />
            </div>

            {(loadingAll || loadingMore || canLoadMore) && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                {loadingAll ? (
                  <div className="flex items-center gap-2 text-neutral-400 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    Cargando la colección completa para aplicar filtros…
                  </div>
                ) : loadingMore ? (
                  <div className="flex items-center gap-2 text-neutral-400 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    Cargando más...
                  </div>
                ) : canLoadMore ? (
                  <div className="text-neutral-600 text-xs">Desliza para cargar más</div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div >
  )
}
