
// src/components/DetailsClient.jsx
'use client'

import { useRef, useState, useEffect, useLayoutEffect, useMemo, useCallback, useTransition } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/swiper-bundle.css'
import { AnimatePresence, motion } from 'framer-motion'
import EpisodeRatingsGrid from '@/components/EpisodeRatingsGrid'
import { saveArtworkOverride } from '@/lib/artworkApi'

import {
  CalendarIcon,
  ClockIcon,
  FilmIcon,
  StarIcon,
  MessageSquareIcon,
  BadgeDollarSignIcon,
  LinkIcon,
  ImageIcon,
  ImageOff,
  Heart,
  BookmarkPlus,
  BookmarkMinus,
  Loader2,
  ChevronDown,
  ChevronUp,
  MonitorPlay,
  TrendingUp,
  Layers,
  Users,
  Building2,
  MapPin,
  Languages,
  Trophy,
  ListVideo,
  Check,
  X,
  Plus,
  Search,
  RotateCcw,
  Play,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Star,
  Eye,
  List,
  LibraryBig,
  MessageSquare
} from 'lucide-react'

/* === cuenta / api === */
import { useAuth } from '@/context/AuthContext'
import {
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getExternalIds
} from '@/lib/api/tmdb'
import { fetchOmdbByImdb } from '@/lib/api/omdb'
import StarRating from './StarRating'
import TraktWatchedControl from '@/components/trakt/TraktWatchedControl'
import TraktWatchedModal from '@/components/trakt/TraktWatchedModal'
import TraktEpisodesWatchedModal from '@/components/trakt/TraktEpisodesWatchedModal'
import {
  traktGetItemStatus,
  traktSetWatched,
  traktAddWatchPlay,
  traktUpdateWatchPlay,
  traktRemoveWatchPlay,
  traktGetShowWatched,
  traktSetEpisodeWatched,
  traktGetComments,
  traktGetLists,
  traktGetShowSeasons,
  traktGetStats,
  traktGetScoreboard,
  traktSetRating
} from '@/lib/api/traktClient'
import DetailsSectionMenu from './DetailsSectionMenu'

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

// =====================================================
// ✅ Helpers (IMDB cache + idle scheduling)
// =====================================================

const OMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000

const readOmdbCache = (imdbId) => {
  if (!imdbId || typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(`showverse:omdb:${imdbId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const t = Number(parsed?.t || 0)
    const fresh = Number.isFinite(t) && Date.now() - t < OMDB_CACHE_TTL_MS
    return { ...parsed, fresh }
  } catch {
    return null
  }
}

const writeOmdbCache = (imdbId, patch) => {
  if (!imdbId || typeof window === 'undefined') return
  try {
    const prev = readOmdbCache(imdbId) || {}
    const next = {
      t: Date.now(),
      imdbRating: patch?.imdbRating ?? prev?.imdbRating ?? null,
      imdbVotes: patch?.imdbVotes ?? prev?.imdbVotes ?? null,
      awards: patch?.awards ?? prev?.awards ?? null,
      rtScore: patch?.rtScore ?? prev?.rtScore ?? null,     // ✅ NEW
      mcScore: patch?.mcScore ?? prev?.mcScore ?? null      // ✅ NEW
    }
    window.sessionStorage.setItem(`showverse:omdb:${imdbId}`, JSON.stringify(next))
  } catch {
    // ignore
  }
}

const runIdle = (cb) => {
  if (typeof window === 'undefined') return
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(() => cb?.(), { timeout: 1200 })
  }
  return window.setTimeout(() => cb?.(), 250)
}

const omdbGetRatingValue = (omdb, source) => {
  const arr = Array.isArray(omdb?.Ratings) ? omdb.Ratings : []
  const hit = arr.find(
    (r) => String(r?.Source || '').toLowerCase() === String(source || '').toLowerCase()
  )
  return typeof hit?.Value === 'string' ? hit.Value.trim() : null
}

const parseOmdbScore0to100 = (value) => {
  if (!value || value === 'N/A') return null
  const s = String(value).trim() // "73%" | "74/100" | "74"
  const m = s.match(/(\d+(\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

const extractOmdbExtraScores = (omdb) => {
  const rtRaw = omdbGetRatingValue(omdb, 'Rotten Tomatoes') // "73%"
  const mcRaw = omdbGetRatingValue(omdb, 'Metacritic')      // "74/100"
  const metaRaw = typeof omdb?.Metascore === 'string' ? omdb.Metascore : null // "74" o "N/A"

  const rtScore = parseOmdbScore0to100(rtRaw)
  const mcScore = parseOmdbScore0to100(mcRaw && mcRaw !== 'N/A' ? mcRaw : metaRaw)

  return { rtScore, mcScore }
}

// --- Helpers de Imágenes ---
const mergeUniqueImages = (current = [], incoming = []) => {
  const map = new Map()

  // 1) mete lo actual
  for (const img of current) {
    const fp = img?.file_path
    if (!fp) continue
    map.set(fp, img)
  }

  // 2) enriquece/actualiza con lo nuevo (manteniendo file_path único)
  for (const img of incoming || []) {
    const fp = img?.file_path
    if (!fp) continue
    const prev = map.get(fp)
    map.set(fp, prev ? { ...prev, ...img } : img)
  }

  return Array.from(map.values())
}

const buildOriginalImageUrl = (filePath) =>
  `https://image.tmdb.org/t/p/original${filePath}`

const preloadTmdb = (filePath, size = 'w780') => {
  if (!filePath || typeof window === 'undefined') return Promise.resolve()
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = `https://image.tmdb.org/t/p/${size}${filePath}`
  })
}

async function fetchTVImages(showId) {
  if (!TMDB_API_KEY) return { posters: [], backdrops: [] }
  const url = `https://api.themoviedb.org/3/tv/${showId}/images?api_key=${TMDB_API_KEY}`
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.status_message || 'Error al cargar imágenes')
  return {
    posters: Array.isArray(json.posters) ? json.posters : [],
    backdrops: Array.isArray(json.backdrops) ? json.backdrops : []
  }
}

function pickBestImage(list) {
  if (!Array.isArray(list) || list.length === 0) return null

  const maxVotes = list.reduce((max, img) => {
    const vc = img.vote_count || 0
    return vc > max ? vc : max
  }, 0)

  const withMaxVotes = list.filter((img) => (img.vote_count || 0) === maxVotes)

  const preferredLangs = new Set(['es', 'es-ES', 'en', 'en-US'])
  const preferred = withMaxVotes.filter(
    (img) => img.iso_639_1 && preferredLangs.has(img.iso_639_1)
  )

  const candidates = preferred.length ? preferred : withMaxVotes

  const sorted = [...candidates].sort((a, b) => {
    const va = (b.vote_average || 0) - (a.vote_average || 0)
    if (va !== 0) return va
    return (b.width || 0) - (a.width || 0)
  })

  return sorted[0] || null
}

function pickBestNeutralPosterByResVotes(list, opts = {}) {
  const { resolutionWindow = 0.98, minWidth = 600 } = opts
  if (!Array.isArray(list) || list.length === 0) return null

  const area = (img) => (img?.width || 0) * (img?.height || 0)

  // solo portadas sin idioma (iso_639_1 null/undefined/'')
  const neutral = list.filter((p) => p?.file_path && !p?.iso_639_1)
  const pool0 = neutral.length ? neutral : list.filter((p) => p?.file_path)

  const sizeFiltered = minWidth > 0 ? pool0.filter((p) => (p?.width || 0) >= minWidth) : pool0
  const pool1 = sizeFiltered.length ? sizeFiltered : pool0

  const maxArea = Math.max(...pool1.map(area))
  const threshold = maxArea * (typeof resolutionWindow === 'number' ? resolutionWindow : 1.0)
  const pool2 = pool1.filter((p) => area(p) >= threshold)

  const sorted = [...pool2].sort((a, b) => {
    const aA = area(a)
    const bA = area(b)
    if (bA !== aA) return bA - aA
    const w = (b.width || 0) - (a.width || 0)
    if (w !== 0) return w
    const vc = (b.vote_count || 0) - (a.vote_count || 0)
    if (vc !== 0) return vc
    const va = (b.vote_average || 0) - (a.vote_average || 0)
    return va
  })

  return sorted[0] || pool1[0] || null
}

// 1. Formateador de números (1.5M, 20k)
const formatShortNumber = (num) => {
  if (!num) return null
  const n = Number(num)
  if (isNaN(n)) return null
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

/* VisualMetaCard: Preparada para Flexbox dinámico */
function VisualMetaCard({ icon: Icon, label, value, className = '' }) {
  if (!value) return null;

  return (
    // 'w-auto' deja que el flex del padre decida el ancho.
    <div className={`flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5 h-full ${className}`}>
      <div className="p-2 rounded-lg shrink-0 bg-white/5 text-zinc-400 mt-0.5">
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-0.5">
          {label}
        </span>
        <span className="text-sm font-bold text-zinc-100 leading-tight whitespace-normal break-words">
          {value}
        </span>
      </div>
    </div>
  );
}

/* ====================================================================
 * MISMO CRITERIO QUE MainDashboard:
 *  - Backdrops: EN -> resolución -> votos
 * ==================================================================== */
function pickBestBackdropByLangResVotes(list, opts = {}) {
  const {
    preferLangs = ['en', 'en-US'],
    resolutionWindow = 0.98,
    minWidth = 1200
  } = opts

  if (!Array.isArray(list) || list.length === 0) return null

  const area = (img) => (img?.width || 0) * (img?.height || 0)
  const lang = (img) => img?.iso_639_1 || null

  const sizeFiltered = minWidth > 0 ? list.filter((b) => (b?.width || 0) >= minWidth) : list
  const pool0 = sizeFiltered.length ? sizeFiltered : list

  const hasPreferred = pool0.some((b) => preferLangs.includes(lang(b)))
  const pool1 = hasPreferred ? pool0.filter((b) => preferLangs.includes(lang(b))) : pool0

  const maxArea = Math.max(...pool1.map(area))
  const threshold = maxArea * (typeof resolutionWindow === 'number' ? resolutionWindow : 1.0)
  const pool2 = pool1.filter((b) => area(b) >= threshold)

  const sorted = [...pool2].sort((a, b) => {
    const aA = area(a)
    const bA = area(b)
    if (bA !== aA) return bA - aA
    const w = (b.width || 0) - (a.width || 0)
    if (w !== 0) return w
    const vc = (b.vote_count || 0) - (a.vote_count || 0)
    if (vc !== 0) return vc
    const va = (b.vote_average || 0) - (a.vote_average || 0)
    return va
  })

  return sorted[0] || null
}

const pickBestPosterTV = (posters) => {
  const best = pickBestImage(posters || [])
  return best?.file_path || null
}

const pickBestBackdropTVNeutralFirst = (backs) => {
  const best = pickBestImage(backs || [])
  return best?.file_path || null
}

const pickBestBackdropForPreview = (backs) => {
  const all = Array.isArray(backs) ? backs : []
  if (!all.length) return null

  const allowed = new Set(['es', 'en'])
  const langBacks = all.filter((img) => allowed.has((img?.iso_639_1 || '').toLowerCase()))

  const best = pickBestImage(langBacks.length ? langBacks : all)
  return best?.file_path || null
}

const slugifyForSeriesGraph = (name) => {
  if (!name) return ''
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

const formatDateEs = (iso) => {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return iso
  }
}

const formatVoteCount = (v) => {
  const n =
    typeof v === 'number'
      ? v
      : Number(String(v || '').replace(/,/g, '').trim())

  if (!Number.isFinite(n) || n <= 0) return null

  return new Intl.NumberFormat('es-ES', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(n)
}

const stripHtml = (s) => String(s || '').replace(/<[^>]*>?/gm, '').trim()

const formatDateTimeEs = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

// Sentimiento derivado de comentarios (heurístico, estable y rápido)
const buildSentimentFromComments = (comments = []) => {
  const POS = [
    'amazing', 'beautiful', 'great', 'stunning', 'incredible', 'masterpiece', 'immersive', 'spectacle',
    'love', 'fantastic', 'brilliant', 'excellent', 'iconic',
    'impresionante', 'increible', 'hermoso', 'espectacular', 'genial', 'magnífico', 'maravilloso'
  ]
  const NEG = [
    'boring', 'generic', 'predictable', 'weak', 'bad', 'terrible', 'awful', 'dull', 'cliche', 'overrated',
    'lazy', 'flat', 'slow', 'shallow', 'mediocre',
    'aburrido', 'genérico', 'predecible', 'flojo', 'malo', 'lento', 'sobrevalorado', 'insípido'
  ]

  const norm = (t) => stripHtml(t).toLowerCase()
  const splitSentences = (t) =>
    norm(t)
      .split(/(?<=[\.\!\?])\s+|\n+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => x.length >= 28 && x.length <= 140)

  const score = (s, lex) => lex.reduce((acc, w) => (s.includes(w) ? acc + 1 : acc), 0)

  const pool = []
  for (const c of comments) {
    const text = c?.comment?.comment ?? c?.comment ?? ''
    const likes = Number(c?.likes || 0)
    for (const sent of splitSentences(text)) {
      const p = score(sent, POS)
      const n = score(sent, NEG)
      if (p === 0 && n === 0) continue
      pool.push({ sent, likes, p, n })
    }
  }

  // ordena por “fuerza” y likes
  const pos = [...pool]
    .filter((x) => x.p > x.n)
    .sort((a, b) => (b.p - a.p) || (b.likes - a.likes))
  const neg = [...pool]
    .filter((x) => x.n > x.p)
    .sort((a, b) => (b.n - a.n) || (b.likes - a.likes))

  const uniq = (arr, max) => {
    const out = []
    const seen = new Set()
    for (const it of arr) {
      if (seen.has(it.sent)) continue
      seen.add(it.sent)
      out.push(it.sent)
      if (out.length >= max) break
    }
    return out
  }

  return {
    pros: uniq(pos, 4),
    cons: uniq(neg, 4)
  }
}

const SectionTitle = ({ title, icon: Icon }) => (
  <div className="flex items-center gap-3 mb-6 border-l-4 border-yellow-500 pl-4 py-1">
    {Icon && <Icon className="text-yellow-500 w-6 h-6" />}
    <h2 className="text-2xl md:text-3xl font-bold text-white tracking-wide">
      {title}
    </h2>
  </div>
)

const MetaItem = ({
  icon: Icon,
  label,
  value,
  colorClass = 'text-gray-400',
  className = ''
}) => {
  if (!value) return null
  return (
    <div
      className={`min-w-0 max-w-full flex items-center gap-3 bg-neutral-800/40 p-3 rounded-xl
      border border-neutral-700/50 hover:bg-neutral-800 transition-colors h-[68px] md:h-[72px] ${className}`}
    >
      <div className={`p-2 rounded-lg bg-neutral-900/80 shrink-0 ${colorClass}`}>
        <Icon size={18} />
      </div>
      <div className="flex flex-col min-w-0 overflow-hidden">
        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider truncate">
          {label}
        </span>
        <span
          className="text-sm text-gray-200 font-medium leading-tight truncate whitespace-nowrap"
          title={typeof value === 'string' ? value : ''}
        >
          {value}
        </span>
      </div>
    </div>
  )
}

const toneStyles = {
  tmdb: 'border-emerald-500/25 bg-emerald-500/10',
  trakt: 'border-red-500/25 bg-red-500/10',
  imdb: 'border-yellow-500/25 bg-yellow-500/10',
  rt: 'border-rose-500/25 bg-rose-500/10',
  mc: 'border-lime-500/25 bg-lime-500/10',
  jw: 'border-emerald-500/25 bg-emerald-500/10',
  neutral: 'border-white/10 bg-white/5'
}

function ScoreBadge({
  tone = 'neutral',
  logo,
  alt,
  label,
  value,
  suffix,
  sublabel,
  subvalue,
  href,
  title
}) {
  if (value == null || value === '') return null

  const Box = ({ children }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title || label}
        className="group"
      >
        {children}
      </a>
    ) : (
      children
    )

  return (
    <Box>
      <div
        className={`shrink-0 rounded-2xl border ${toneStyles[tone] || toneStyles.neutral}
        px-3 py-2 flex items-center gap-2 transition hover:bg-white/10`}
      >
        {logo ? (
          <img src={logo} alt={alt || label} className="h-4 w-auto opacity-90" />
        ) : null}

        <div className="leading-none">
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-extrabold text-white">
              {value}
              {suffix ? <span className="text-[11px] text-zinc-300 ml-0.5">{suffix}</span> : null}
            </span>
            {subvalue != null && (
              <span className="text-[11px] text-zinc-400 ml-1">
                {subvalue}
              </span>
            )}
          </div>

          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            {sublabel || label}
          </div>
        </div>
      </div>
    </Box>
  )
}

function StatChip({ icon: Icon, label, value }) {
  if (value == null) return null
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-zinc-200" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-extrabold text-white leading-none">
          {value}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          {label}
        </div>
      </div>
    </div>
  )
}

function ProviderRatingBox({
  title,
  logo,
  connected = true,
  rating,
  loading,
  disabled,
  onRate,
  onClear,
  onConnect
}) {
  return (
    <div className="flex-1 rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {logo ? <img src={logo} alt={title} className="h-4 w-auto opacity-90" /> : null}
          <div className="text-xs font-extrabold text-white truncate">{title}</div>
        </div>

        {!connected && (
          <button
            type="button"
            onClick={onConnect}
            className="text-[11px] font-bold px-3 py-1 rounded-full bg-yellow-500 text-black hover:brightness-110"
          >
            Conectar
          </button>
        )}
      </div>

      <div className="mt-2">
        {connected ? (
          <StarRating
            rating={rating}
            onRating={onRate}
            onClearRating={onClear}
            disabled={disabled || loading}
          />
        ) : (
          <div className="text-[11px] text-zinc-400 mt-2">
            Conecta para puntuar.
          </div>
        )}
      </div>
    </div>
  )
}

// =====================================================================
// ✅ TMDb LISTS helpers (client-side)
// =====================================================================

async function tmdbFetchAllUserLists({ accountId, sessionId, language = 'es-ES' }) {
  if (!TMDB_API_KEY) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY')
  if (!accountId || !sessionId) throw new Error('Falta sesión para cargar listas')

  const all = []
  let page = 1
  let totalPages = 1
  const maxPages = 5

  while (page <= totalPages && page <= maxPages) {
    const url = `https://api.themoviedb.org/3/account/${accountId}/lists?api_key=${TMDB_API_KEY}&session_id=${sessionId}&language=${language}&page=${page}`
    const res = await fetch(url)
    const json = await res.json()
    if (!res.ok) throw new Error(json?.status_message || 'Error cargando listas')
    totalPages = Number(json?.total_pages || 1)
    const results = Array.isArray(json?.results) ? json.results : []
    all.push(...results)
    page += 1
  }

  return all
}

async function tmdbListItemStatus({ listId, movieId, sessionId }) {
  if (!TMDB_API_KEY) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY')
  if (!listId || !movieId) return false

  const url = `https://api.themoviedb.org/3/list/${listId}/item_status?api_key=${TMDB_API_KEY}&movie_id=${movieId}${sessionId ? `&session_id=${sessionId}` : ''}`
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.status_message || 'Error comprobando item_status')
  return !!json?.item_present
}

async function tmdbAddMovieToList({ listId, movieId, sessionId }) {
  if (!TMDB_API_KEY) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY')
  if (!listId || !movieId || !sessionId) throw new Error('Falta sesión para añadir a lista')

  const url = `https://api.themoviedb.org/3/list/${listId}/add_item?api_key=${TMDB_API_KEY}&session_id=${sessionId}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
    body: JSON.stringify({ media_id: movieId })
  })
  const json = await res.json()

  if (!res.ok) {
    if (json?.status_code === 8) return { ok: true, duplicate: true, json }
    throw new Error(json?.status_message || 'Error añadiendo a la lista')
  }

  if (json?.success === true || json?.status_code === 12 || json?.status_code === 1) {
    return { ok: true, duplicate: false, json }
  }

  if (json?.status_code === 8) return { ok: true, duplicate: true, json }
  throw new Error(json?.status_message || 'Error añadiendo a la lista')
}

async function tmdbCreateList({ name, description, sessionId, language = 'es' }) {
  if (!TMDB_API_KEY) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY')
  if (!sessionId) throw new Error('Falta sesión para crear lista')

  const url = `https://api.themoviedb.org/3/list?api_key=${TMDB_API_KEY}&session_id=${sessionId}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
    body: JSON.stringify({
      name,
      description: description || '',
      language
    })
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.status_message || 'Error creando lista')
  if (!json?.list_id) throw new Error('TMDb no devolvió list_id')
  return json.list_id
}

// =====================================================================
// ✅ Modal: Añadir a lista
// =====================================================================

function AddToListModal({
  open,
  onClose,
  lists,
  loading,
  error,
  query,
  setQuery,
  membershipMap,
  busyListId,
  onAddToList,
  creating,
  createOpen,
  setCreateOpen,
  newName,
  setNewName,
  newDesc,
  setNewDesc,
  onCreateList
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const filtered = (lists || []).filter((l) => {
    const q = (query || '').trim().toLowerCase()
    if (!q) return true
    return (l?.name || '').toLowerCase().includes(q)
  })

  return (
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#101010]/95 shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-extrabold text-white">Añadir a lista</h3>
              <p className="text-sm text-zinc-400 mt-1">
                Selecciona una lista existente o crea una nueva.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-10 h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center"
              title="Cerrar"
            >
              <X className="w-5 h-5 text-zinc-200" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setCreateOpen((v) => !v)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm"
              >
                <Plus className="w-4 h-4" />
                Crear nueva lista
              </button>
            </div>

            {createOpen && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre (obligatorio)"
                    maxLength={60}
                    className="md:col-span-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                  />
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Descripción (opcional)"
                    maxLength={120}
                    className="md:col-span-2 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCreateList}
                    disabled={creating || !newName.trim()}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition
                      ${creating || !newName.trim()
                        ? 'bg-yellow-500/40 text-black/60 cursor-not-allowed'
                        : 'bg-yellow-500 text-black hover:brightness-110'
                      }`}
                  >
                    {creating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Crear y añadir
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar listas…"
                className="w-full rounded-xl bg-black/40 border border-white/10 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
              />
            </div>

            {loading && (
              <div className="text-sm text-zinc-400 inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando listas…
              </div>
            )}

            {!!error && <div className="text-sm text-red-400">{error}</div>}

            {!loading && filtered.length === 0 && (
              <div className="text-sm text-zinc-400 rounded-xl border border-white/10 bg-white/5 p-4">
                No hay listas que coincidan.
              </div>
            )}

            <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
              {filtered.map((l) => {
                const present = !!membershipMap?.[l.id]
                const busy = busyListId === l.id

                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => (!present && !busy ? onAddToList(l.id) : undefined)}
                    className={`w-full text-left rounded-2xl border transition p-4 flex items-center justify-between gap-3
                      ${present
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-yellow-500/30'
                      }`}
                    disabled={present || busy}
                    title={present ? 'Ya está en la lista' : 'Añadir a esta lista'}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">{l.name}</div>
                      <div className="text-xs text-zinc-400 mt-1 line-clamp-2">
                        {l.description || 'Sin descripción'}
                      </div>
                      <div className="text-xs text-zinc-500 mt-2">
                        {typeof l.item_count === 'number' ? `${l.item_count} items` : '—'}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <div
                        className={`w-11 h-11 rounded-full border flex items-center justify-center transition
                          ${present
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                            : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-yellow-500/10 hover:border-yellow-500/40 hover:text-yellow-200'
                          }`}
                      >
                        {busy ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : present ? (
                          <Check className="w-5 h-5" />
                        ) : (
                          <Plus className="w-5 h-5" />
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PosterStack({ posters = [] }) {
  const [hovered, setHovered] = useState(null)

  const imgs = posters.slice(0, 5)

  // CONFIGURACIÓN
  const POSTER_W = 96   // Ancho base (w-24)
  const STEP = 35       // Solape entre cartas
  const HOVER_GAP = 60  // Hueco extra al hacer hover

  // Ancho dinámico del contenedor para centrarlo
  const totalWidth = imgs.length > 0
    ? POSTER_W + (imgs.length - 1) * STEP + (hovered !== null ? HOVER_GAP : 0)
    : POSTER_W

  return (
    <div
      // Mantenemos items-end y un pequeño padding inferior para anclarlas al suelo
      className="relative flex h-full w-full items-end justify-center transition-all duration-300 pb-3"
      style={{ width: totalWidth }}
      onMouseLeave={() => setHovered(null)}
    >
      {imgs.map((src, idx) => {
        // Lógica de posición horizontal
        const isAfterHover = hovered !== null && idx > hovered
        const leftPosition = idx * STEP + (isAfterHover ? HOVER_GAP : 0)

        const isHover = hovered === idx
        const isAnyoneHovered = hovered !== null

        // Rotación suavizada tipo abanico
        const rotation = isHover ? 0 : (idx - (imgs.length - 1) / 2) * 5

        return (
          <div
            key={`${src}-${idx}`}
            className="absolute transition-all duration-500 cubic-bezier(0.25, 0.2, 0.25, 0.2)"
            style={{
              left: 0,
              transform: `translateX(${leftPosition}px) rotate(${rotation}deg)`,
              zIndex: isHover ? 50 : idx,
              transformOrigin: 'bottom center',
              // 🔥 CAMBIO AQUÍ: Reducimos la elevación de 20 a 8px
              bottom: isHover ? 4 : 0,
            }}
            onMouseEnter={() => setHovered(idx)}
            onClick={(e) => {
              e.preventDefault()
              setHovered(h => (h === idx ? null : idx))
            }}
          >
            <div
              className={`
                relative h-40 w-28 overflow-hidden rounded-xl border bg-zinc-900 shadow-2xl transition-all duration-300
                ${isHover
                  // Mantenemos el scale-110, pero ahora tiene espacio de sobra
                  ? 'scale-110 border-white/40 ring-1 ring-white/50 shadow-[0_0_30px_rgba(99,102,241,0.5)]'
                  : 'scale-100 border-white/10 shadow-black/60'
                }
                ${isAnyoneHovered && !isHover ? 'brightness-[0.4] blur-[0.5px]' : 'brightness-100'}
              `}
            >
              <img
                src={src}
                alt="Poster"
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {/* Brillo especular */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-white/10 opacity-60" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// =====================================================================
// ✅ VIDEOS / TRAILERS (TMDb) helpers + modal
// =====================================================================

const uniqBy = (arr, keyFn) => {
  const seen = new Set()
  const out = []
  for (const item of arr || []) {
    const k = keyFn(item)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

const isPlayableVideo = (v) => v?.site === 'YouTube' || v?.site === 'Vimeo'

const videoExternalUrl = (v) => {
  if (!v?.key) return null
  if (v.site === 'YouTube') return `https://www.youtube.com/watch?v=${v.key}`
  if (v.site === 'Vimeo') return `https://vimeo.com/${v.key}`
  return null
}

const videoEmbedUrl = (v, autoplay = true) => {
  if (!v?.key) return null
  if (v.site === 'YouTube') {
    const ap = autoplay ? 1 : 0
    return `https://www.youtube.com/embed/${v.key}?autoplay=${ap}&rel=0&modestbranding=1&playsinline=1`
  }
  if (v.site === 'Vimeo') {
    const ap = autoplay ? 1 : 0
    return `https://player.vimeo.com/video/${v.key}?autoplay=${ap}`
  }
  return null
}

const videoThumbUrl = (v) => {
  if (!v?.key) return null
  if (v.site === 'YouTube') return `https://img.youtube.com/vi/${v.key}/hqdefault.jpg`
  return null
}

const rankVideo = (v) => {
  const typeRank = {
    Trailer: 0,
    Teaser: 1,
    Clip: 2,
    Featurette: 3,
    'Behind the Scenes': 4
  }
  const lang = (v?.iso_639_1 || '').toLowerCase()
  const langRank = lang === 'es' ? 0 : lang === 'en' ? 1 : 2
  const siteRank = v?.site === 'YouTube' ? 0 : v?.site === 'Vimeo' ? 1 : 2
  const tRank = typeRank[v?.type] ?? 9
  const officialRank = v?.official ? 0 : 1

  return officialRank * 1000 + tRank * 100 + siteRank * 10 + langRank
}

const pickPreferredVideo = (videos) => {
  const playable = (videos || []).filter(isPlayableVideo)
  if (!playable.length) return null
  const sorted = [...playable].sort((a, b) => rankVideo(a) - rankVideo(b))
  return sorted[0] || null
}

function VideoModal({ open, onClose, video }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !video) return null

  const embed = videoEmbedUrl(video, true)
  const ext = videoExternalUrl(video)

  return (
    <div className="fixed inset-0 z-[10000]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#101010]/95 shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg md:text-xl font-extrabold text-white truncate">
                {video.name || 'Vídeo'}
              </h3>
              <p className="text-sm text-zinc-400 mt-1">
                {video.type || 'Video'} · {video.site || '—'}
                {video.iso_639_1 ? ` · ${video.iso_639_1.toUpperCase()}` : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-10 h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center"
              title="Cerrar"
            >
              <X className="w-5 h-5 text-zinc-200" />
            </button>
          </div>

          <div className="p-4 md:p-6">
            <div className="w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black">
              {embed ? (
                <iframe
                  key={video.key}
                  src={embed}
                  title={video.name || 'Video'}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-400">
                  No se puede reproducir este vídeo.
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-zinc-500">
                {video.published_at
                  ? `Publicado: ${new Date(video.published_at).toLocaleDateString()}`
                  : ''}
              </div>

              {ext && (
                <a
                  href={ext}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm text-zinc-200"
                  title="Abrir en una pestaña nueva"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir en {video.site}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================================================================

export default function DetailsClient({
  type,
  id,
  data,
  recommendations,
  castData,
  providers,
  watchLink,
  reviews
}) {
  const title = data.title || data.name
  const endpointType = type === 'tv' ? 'tv' : 'movie'
  const yearIso = (data.release_date || data.first_air_date || '')?.slice(0, 4)

  const tmdbDetailUrl =
    type && id ? `https://www.themoviedb.org/${type}/${id}` : null

  const tmdbWatchUrl =
    watchLink || (type && id ? `https://www.themoviedb.org/${type}/${id}/watch` : null)

  const [showAdminImages, setShowAdminImages] = useState(false)
  const [reviewLimit, setReviewLimit] = useState(2)
  const [useBackdrop, setUseBackdrop] = useState(true)

  const { session, account } = useAuth()
  const isAdmin = account?.username === 'psantos26' || account?.name === 'psantos26'

  const [favLoading, setFavLoading] = useState(false)
  const [wlLoading, setWlLoading] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [watchlist, setWatchlist] = useState(false)

  const [userRating, setUserRating] = useState(null)
  const [ratingLoading, setRatingLoading] = useState(false)
  const [ratingError, setRatingError] = useState('')

  const [accountStatesLoading, setAccountStatesLoading] = useState(false)

  // ✅ Resumen plegable (por defecto oculto)
  const [activeTab, setActiveTab] = useState('details')

  // ====== PREFERENCIAS DE IMÁGENES ======
  const posterStorageKey = `showverse:${endpointType}:${id}:poster`
  const previewBackdropStorageKey = `showverse:${endpointType}:${id}:backdrop`
  const backgroundStorageKey = `showverse:${endpointType}:${id}:background`

  const [selectedPosterPath, setSelectedPosterPath] = useState(null)
  const [selectedPreviewBackdropPath, setSelectedPreviewBackdropPath] = useState(null)
  const [selectedBackgroundPath, setSelectedBackgroundPath] = useState(null)

  const [basePosterPath, setBasePosterPath] = useState(data.poster_path || data.profile_path || null)
  const [baseBackdropPath, setBaseBackdropPath] = useState(data.backdrop_path || null)
  const [artworkInitialized, setArtworkInitialized] = useState(false)

  const [imagesState, setImagesState] = useState(() => ({
    posters: data.poster_path ? [{ file_path: data.poster_path, from: 'main' }] : [],
    backdrops: data.backdrop_path ? [{ file_path: data.backdrop_path, from: 'main' }] : []
  }))
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imagesError, setImagesError] = useState('')
  const [activeImagesTab, setActiveImagesTab] = useState('posters')

  const imagesScrollRef = useRef(null)
  const [isHoveredImages, setIsHoveredImages] = useState(false)
  const [canPrevImages, setCanPrevImages] = useState(false)
  const [canNextImages, setCanNextImages] = useState(false)

  // =====================================================================
  // ✅ LISTAS (estado + modal + detección)
  // =====================================================================

  const canUseLists = endpointType === 'movie' && !!TMDB_API_KEY

  const [listModalOpen, setListModalOpen] = useState(false)
  const [listsLoading, setListsLoading] = useState(false)
  const [listsError, setListsError] = useState('')
  const [userLists, setUserLists] = useState([])
  const [listQuery, setListQuery] = useState('')

  const [membershipMap, setMembershipMap] = useState({})
  const [listsPresenceLoading, setListsPresenceLoading] = useState(false)
  const [busyListId, setBusyListId] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [creatingList, setCreatingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListDesc, setNewListDesc] = useState('')

  const ratingWrapRef = useRef(null)

  const [supportsHover, setSupportsHover] = useState(false)
  const [mobileClearOpen, setMobileClearOpen] = useState(false)

  const [isMobileViewport, setIsMobileViewport] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // hover/puntero fino => desktop
    const mqHover = window.matchMedia('(hover: hover) and (pointer: fine)')
    const updateHover = () => setSupportsHover(!!mqHover.matches)
    updateHover()
    if (mqHover.addEventListener) mqHover.addEventListener('change', updateHover)
    else mqHover.addListener(updateHover)

    // viewport móvil (ajusta breakpoint si quieres)
    const mqMobile = window.matchMedia('(max-width: 640px)')
    const updateMobile = () => setIsMobileViewport(!!mqMobile.matches)
    updateMobile()
    if (mqMobile.addEventListener) mqMobile.addEventListener('change', updateMobile)
    else mqMobile.addListener(updateMobile)

    return () => {
      if (mqHover.removeEventListener) mqHover.removeEventListener('change', updateHover)
      else mqHover.removeListener(updateHover)

      if (mqMobile.removeEventListener) mqMobile.removeEventListener('change', updateMobile)
      else mqMobile.removeListener(updateMobile)
    }
  }, [])

  useEffect(() => {
    // si pasamos a desktop, cerramos el modo móvil del botón
    if (supportsHover) setMobileClearOpen(false)
  }, [supportsHover])

  useEffect(() => {
    // cerrar al tocar fuera en móvil
    if (supportsHover || !mobileClearOpen) return
    const onDown = (e) => {
      if (!ratingWrapRef.current) return
      if (!ratingWrapRef.current.contains(e.target)) setMobileClearOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [supportsHover, mobileClearOpen])

  const movieId = useMemo(() => {
    const n = Number(id)
    return Number.isFinite(n) ? n : null
  }, [id])

  const inAnyList = useMemo(() => {
    const vals = Object.values(membershipMap || {})
    return vals.some(Boolean)
  }, [membershipMap])

  const listActive = !listsPresenceLoading && inAnyList

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = '/login'
      return true
    }
    return false
  }

  const loadListsIfNeeded = async ({ abortRef } = {}) => {
    if (!session || !account?.id) return []
    if (!canUseLists) return []
    if (Array.isArray(userLists) && userLists.length > 0) return userLists

    const lists = await tmdbFetchAllUserLists({
      accountId: account.id,
      sessionId: session,
      language: 'es-ES'
    })
    if (abortRef?.current) return []
    setUserLists(lists)
    return lists
  }

  const loadPresenceForLists = async ({ lists, silent = false, abortRef } = {}) => {
    if (!session || !account?.id || !movieId) return
    if (!canUseLists) return

    if (!silent) setListsLoading(true)
    else setListsPresenceLoading(true)

    setListsError('')

    try {
      const base = Array.isArray(lists) && lists.length ? lists : await loadListsIfNeeded({ abortRef })
      if (abortRef?.current) return

      const ids = base.map((l) => l?.id).filter(Boolean)
      const concurrency = 5
      let idx = 0
      const nextMap = {}

      const worker = async () => {
        while (!abortRef?.current && idx < ids.length) {
          const listId = ids[idx++]
          try {
            const present = await tmdbListItemStatus({ listId, movieId, sessionId: session })
            nextMap[listId] = present
          } catch {
            nextMap[listId] = false
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()))
      if (abortRef?.current) return
      setMembershipMap(nextMap)
    } catch (e) {
      if (!abortRef?.current) setListsError(e?.message || 'Error cargando listas')
    } finally {
      if (!abortRef?.current) {
        if (!silent) setListsLoading(false)
        else setListsPresenceLoading(false)
      }
    }
  }

  useEffect(() => {
    const abortRef = { current: false }
    if (!session || !account?.id || !canUseLists || !movieId) {
      setMembershipMap({})
      setListsPresenceLoading(false)
      return
    }

    loadPresenceForLists({ silent: true, abortRef })
    return () => {
      abortRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, account?.id, canUseLists, movieId])

  const openListsModal = async () => {
    if (requireLogin()) return
    if (!canUseLists) return
    setListModalOpen(true)

    const abortRef = { current: false }
    setListsLoading(true)
    setListsError('')
    try {
      const lists = await tmdbFetchAllUserLists({
        accountId: account.id,
        sessionId: session,
        language: 'es-ES'
      })
      if (abortRef.current) return
      setUserLists(lists)
      await loadPresenceForLists({ lists, silent: false, abortRef })
    } catch (e) {
      if (!abortRef.current) setListsError(e?.message || 'Error cargando listas')
    } finally {
      if (!abortRef.current) setListsLoading(false)
    }
  }

  const closeListsModal = () => {
    setListModalOpen(false)
    setListQuery('')
    setListsError('')
    setCreateOpen(false)
    setNewListName('')
    setNewListDesc('')
  }

  const handleAddToSpecificList = async (listId) => {
    if (!session || !account?.id || !movieId) return
    if (!canUseLists) return
    if (membershipMap?.[listId]) return

    setBusyListId(listId)
    setListsError('')

    try {
      const res = await tmdbAddMovieToList({ listId, movieId, sessionId: session })
      setMembershipMap((prev) => ({ ...prev, [listId]: true }))

      setUserLists((prev) =>
        (prev || []).map((l) =>
          l.id === listId
            ? { ...l, item_count: (l.item_count || 0) + (res?.duplicate ? 0 : 1) }
            : l
        )
      )
    } catch (e) {
      setListsError(e?.message || 'Error añadiendo a la lista')
    } finally {
      setBusyListId(null)
    }
  }

  const handleCreateListAndAdd = async () => {
    if (!session || !account?.id || !movieId) return
    if (!canUseLists) return

    const n = newListName.trim()
    if (!n) return

    setCreatingList(true)
    setListsError('')
    try {
      const listId = await tmdbCreateList({
        name: n,
        description: newListDesc.trim(),
        sessionId: session,
        language: 'es'
      })

      const lists = await tmdbFetchAllUserLists({
        accountId: account.id,
        sessionId: session,
        language: 'es-ES'
      })
      setUserLists(lists)

      await tmdbAddMovieToList({ listId, movieId, sessionId: session })

      setMembershipMap((prev) => ({ ...prev, [listId]: true }))
      setUserLists((prev) =>
        (prev || []).map((l) =>
          l.id === listId ? { ...l, item_count: (l.item_count || 0) + 1 } : l
        )
      )

      setCreateOpen(false)
      setNewListName('')
      setNewListDesc('')
    } catch (e) {
      setListsError(e?.message || 'Error creando lista')
    } finally {
      setCreatingList(false)
    }
  }

  // =====================================================================
  // ✅ VIDEOS / TRAILERS
  // =====================================================================

  const [videos, setVideos] = useState([])
  const [videosLoading, setVideosLoading] = useState(false)
  const [videosError, setVideosError] = useState('')
  const [videoModalOpen, setVideoModalOpen] = useState(false)
  const [activeVideo, setActiveVideo] = useState(null)

  const preferredVideo = useMemo(() => pickPreferredVideo(videos), [videos])

  const openVideo = (v) => {
    if (!v) return
    setActiveVideo(v)
    setVideoModalOpen(true)
  }

  const closeVideo = () => {
    setVideoModalOpen(false)
    setActiveVideo(null)
  }

  useEffect(() => {
    setVideoModalOpen(false)
    setActiveVideo(null)
  }, [id, endpointType])

  useEffect(() => {
    let ignore = false

    const safeFetchVideos = async (language) => {
      if (!TMDB_API_KEY) return []
      try {
        const url = `https://api.themoviedb.org/3/${endpointType}/${id}/videos?api_key=${TMDB_API_KEY}&language=${language}`
        const res = await fetch(url)
        const json = await res.json()
        if (!res.ok) return []
        return Array.isArray(json?.results) ? json.results : []
      } catch {
        return []
      }
    }

    const load = async () => {
      if (!TMDB_API_KEY || !id) {
        setVideos([])
        setVideosError('')
        setVideosLoading(false)
        return
      }

      setVideosLoading(true)
      setVideosError('')

      try {
        const [es, en] = await Promise.all([safeFetchVideos('es-ES'), safeFetchVideos('en-US')])
        if (ignore) return

        const merged = uniqBy([...es, ...en], (v) => `${v.site}:${v.key}`)
          .filter(isPlayableVideo)

        merged.sort((a, b) => rankVideo(a) - rankVideo(b))
        setVideos(merged)
      } catch (e) {
        if (!ignore) setVideosError(e?.message || 'Error cargando vídeos')
      } finally {
        if (!ignore) setVideosLoading(false)
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [id, endpointType])

  // =====================================================================

  // ====== Filtros Portadas y fondos ======
  const [imagesResFilter, setImagesResFilter] = useState('all') // all | 720p | 1080p | 2k | 4k
  const [langES, setLangES] = useState(true)
  const [langEN, setLangEN] = useState(true)

  const [resMenuOpen, setResMenuOpen] = useState(false)
  const resMenuRef = useRef(null)

  // Cierra el menú al hacer click fuera
  useEffect(() => {
    if (!resMenuOpen) return
    const onDown = (e) => {
      if (!resMenuRef.current) return
      if (!resMenuRef.current.contains(e.target)) setResMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [resMenuOpen])

  // Cierra el menú si cambias de tab
  useEffect(() => {
    setResMenuOpen(false)
  }, [activeImagesTab])

  const imgLongSide = (img) => Math.max(Number(img?.width || 0), Number(img?.height || 0))

  const imgResBucket = (img) => {
    const long = imgLongSide(img)
    if (long >= 3840) return '4k'
    if (long >= 2560) return '2k'
    if (long >= 1920) return '1080p'
    if (long >= 1280) return '720p'
    return 'sd'
  }

  const imgResLabel = (img) => {
    const w = Number(img?.width || 0)
    const h = Number(img?.height || 0)
    return w > 0 && h > 0 ? `${w}×${h}` : null
  }

  useLayoutEffect(() => {
    setArtworkInitialized(false)

    setBasePosterPath(data.poster_path || data.profile_path || null)
    setBaseBackdropPath(data.backdrop_path || null)

    setImagesState({
      posters: data.poster_path ? [{ file_path: data.poster_path, from: 'main' }] : [],
      backdrops: data.backdrop_path ? [{ file_path: data.backdrop_path, from: 'main' }] : []
    })
    setImagesLoading(false)
    setImagesError('')
    setActiveImagesTab('posters')

    setSelectedPosterPath(null)
    setSelectedPreviewBackdropPath(null)
    setSelectedBackgroundPath(null)

    setActiveTab('details')
    setActiveSection('info')

    if (typeof window !== 'undefined') {
      try {
        const savedPoster = window.localStorage.getItem(posterStorageKey)
        const savedPreviewBackdrop = window.localStorage.getItem(previewBackdropStorageKey)
        const savedBackground = window.localStorage.getItem(backgroundStorageKey)

        if (savedPoster) setSelectedPosterPath(savedPoster)
        if (savedPreviewBackdrop) setSelectedPreviewBackdropPath(savedPreviewBackdrop)
        if (savedBackground) setSelectedBackgroundPath(savedBackground)
      } catch {
        // ignore
      }
    }
  }, [id, endpointType, data?.poster_path, data?.backdrop_path, data?.profile_path])

  useEffect(() => {
    let cancelled = false

    const initArtwork = async () => {
      setArtworkInitialized(false)

      let poster = data.poster_path || data.profile_path || null
      let backdrop = data.backdrop_path || null

      if (data?.images) {
        const bestPoster = pickBestImage(data.images.posters || [])
        if (bestPoster?.file_path) poster = bestPoster.file_path

        setImagesState((prev) => ({
          posters: mergeUniqueImages(prev.posters, data.images.posters || []),
          backdrops: mergeUniqueImages(prev.backdrops, data.images.backdrops || [])
        }))
      }

      if (endpointType === 'tv' && TMDB_API_KEY) {
        try {
          setImagesLoading(true)
          setImagesError('')

          const { posters, backdrops } = await fetchTVImages(id)
          const bestPoster = pickBestPosterTV(posters)
          const bestBackdropForBackground = pickBestBackdropTVNeutralFirst(backdrops)

          if (bestPoster) await preloadTmdb(bestPoster, 'w780')

          if (!cancelled) {
            if (bestPoster) poster = bestPoster
            if (bestBackdropForBackground) backdrop = bestBackdropForBackground

            setImagesState((prev) => ({
              posters: mergeUniqueImages(prev.posters, posters),
              backdrops: mergeUniqueImages(prev.backdrops, backdrops)
            }))
          }
        } catch (e) {
          if (!cancelled) console.error('Error cargando imágenes TV:', e)
        } finally {
          if (!cancelled) setImagesLoading(false)
        }
      }

      if (endpointType === 'movie' && !data?.images && TMDB_API_KEY) {
        try {
          setImagesLoading(true)
          setImagesError('')

          const url = `https://api.themoviedb.org/3/movie/${id}/images?api_key=${TMDB_API_KEY}&include_image_language=en,null,es`
          const res = await fetch(url)
          const json = await res.json()
          if (!res.ok) throw new Error(json?.status_message || 'Error al cargar imágenes')

          const posters = json.posters || []
          const backdrops = json.backdrops || []

          const bestPoster = pickBestImage(posters)
          if (bestPoster?.file_path) {
            await preloadTmdb(bestPoster.file_path, 'w780')
            poster = bestPoster.file_path
          }

          if (!cancelled) {
            setImagesState((prev) => ({
              posters: mergeUniqueImages(prev.posters, posters),
              backdrops: mergeUniqueImages(prev.backdrops, backdrops)
            }))
          }
        } catch (err) {
          if (!cancelled) setImagesError(err.message)
        } finally {
          if (!cancelled) setImagesLoading(false)
        }
      }

      if (!cancelled) {
        setBasePosterPath(poster)
        setBaseBackdropPath(backdrop)
        setArtworkInitialized(true)
      }
    }

    initArtwork()
    return () => {
      cancelled = true
    }
  }, [id, endpointType, data?.images, data?.poster_path, data?.backdrop_path, data?.profile_path])

  const displayPosterPath = artworkInitialized
    ? selectedPosterPath || basePosterPath || data.profile_path || null
    : null

  const displayBackdropPath = artworkInitialized
    ? selectedBackgroundPath || baseBackdropPath || null
    : null

  const mobileNeutralPosterPath = useMemo(() => {
    const best = pickBestNeutralPosterByResVotes(imagesState?.posters || [])?.file_path || null
    if (best) return best
    // fallback: primera sin idioma si no hay metadata de tamaños/votos
    return (
      (imagesState?.posters || []).find((p) => p?.file_path && !p?.iso_639_1)?.file_path ||
      null
    )
  }, [imagesState?.posters])

  const heroBackgroundPath = (() => {
    if (!useBackdrop || !artworkInitialized) return null

    // desktop: tu lógica actual
    const desktop = displayBackdropPath

    // móvil: si NO hay override, preferimos poster sin idioma
    const mobile =
      selectedBackgroundPath || // si el usuario eligió un fondo manual, respétalo
      mobileNeutralPosterPath ||
      basePosterPath ||
      data.poster_path ||
      data.profile_path ||
      desktop ||
      null

    return isMobileViewport ? mobile : desktop
  })()

  // ====== Account States ======
  useEffect(() => {
    let cancel = false

    const load = async () => {
      // si no hay sesión, no hay nada que cargar para “tu puntuación”
      if (!session || !account?.id) {
        setAccountStatesLoading(false)
        return
      }

      setAccountStatesLoading(true)

      try {
        const st = await getMediaAccountStates(type, id, session)
        if (cancel) return

        setFavorite(!!st.favorite)
        setWatchlist(!!st.watchlist)

        const ratedValue =
          st?.rated && typeof st.rated.value === 'number' ? st.rated.value : null
        setUserRating(ratedValue)
      } catch {
        // si falla, al menos dejamos de “cargar” para no bloquear la UI
      } finally {
        if (!cancel) setAccountStatesLoading(false)
      }
    }

    load()
    return () => {
      cancel = true
    }
  }, [type, id, session, account?.id])

  const toggleFavorite = async () => {
    if (requireLogin() || favLoading) return
    try {
      setFavLoading(true)
      const next = !favorite
      setFavorite(next)
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type,
        mediaId: id,
        favorite: next
      })
    } catch {
      setFavorite((v) => !v)
    } finally {
      setFavLoading(false)
    }
  }

  const toggleWatchlist = async () => {
    if (requireLogin() || wlLoading) return
    try {
      setWlLoading(true)
      const next = !watchlist
      setWatchlist(next)
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type,
        mediaId: id,
        watchlist: next
      })
    } catch {
      setWatchlist((v) => !v)
    } finally {
      setWlLoading(false)
    }
  }

  const sendTmdbRating = async (value, { skipSync = false } = {}) => {
    if (requireLogin() || ratingLoading || !TMDB_API_KEY) return
    try {
      setRatingLoading(true)
      setRatingError('')
      setUserRating(value)

      const url = `https://api.themoviedb.org/3/${endpointType}/${id}/rating?api_key=${TMDB_API_KEY}&session_id=${session}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify({ value })
      })
      if (!res.ok) throw new Error('Error al guardar puntuación en TMDb')

      // ✅ sync opcional hacia Trakt (sin bucle)
      if (!skipSync && syncTrakt && trakt.connected) {
        await setTraktRatingSafe(Math.round(value))
      }
    } catch (err) {
      setRatingError(err?.message || 'Error')
    } finally {
      setRatingLoading(false)
    }
  }

  const clearTmdbRating = async ({ skipSync = false } = {}) => {
    if (requireLogin() || ratingLoading || userRating == null || !TMDB_API_KEY) return
    try {
      setRatingLoading(true)
      setRatingError('')
      setUserRating(null)

      const url = `https://api.themoviedb.org/3/${endpointType}/${id}/rating?api_key=${TMDB_API_KEY}&session_id=${session}`
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json;charset=utf-8' }
      })
      if (!res.ok) throw new Error('Error al borrar puntuación en TMDb')

      if (!skipSync && syncTrakt && trakt.connected) {
        await setTraktRatingSafe(null)
      }
    } catch (err) {
      setRatingError(err?.message || 'Error')
    } finally {
      setRatingLoading(false)
    }
  }

  const sendTraktRating = async (value) => {
    if (!trakt.connected) {
      window.location.href = "/api/trakt/auth/start"
      return
    }
    // value Trakt: 1..10 entero
    await setTraktRatingSafe(value == null ? null : Math.round(value))

    // ✅ sync opcional hacia TMDb (sin bucle)
    if (syncTrakt && session && TMDB_API_KEY) {
      if (value == null) await clearTmdbRating({ skipSync: true })
      else await sendTmdbRating(value, { skipSync: true })
    }
  }

  const clearTraktRating = async () => {
    await sendTraktRating(null)
  }

  const traktType = endpointType === 'tv' ? 'show' : 'movie'

  const [trakt, setTrakt] = useState({
    loading: false,
    connected: false,
    found: false,
    traktUrl: null,
    watched: false,
    plays: 0,
    lastWatchedAt: null,
    rating: null,
    inWatchlist: false,
    progress: null,
    history: [],
    error: ''
  })

  const [traktBusy, setTraktBusy] = useState('') // 'watched' | 'watchlist' | 'history' | ''
  const [traktWatchedOpen, setTraktWatchedOpen] = useState(false)
  const [traktEpisodesOpen, setTraktEpisodesOpen] = useState(false)
  // ✅ EPISODIOS VISTOS (solo TV)
  const [watchedBySeason, setWatchedBySeason] = useState({}) // { [seasonNumber]: [episodeNumber...] }
  const [episodeBusyKey, setEpisodeBusyKey] = useState('')   // "S1E3" etc

  const [traktStats, setTraktStats] = useState(null)
  const [traktStatsLoading, setTraktStatsLoading] = useState(false)
  const [traktStatsError, setTraktStatsError] = useState('')

  const [tScoreboard, setTScoreboard] = useState({
    loading: false,
    error: '',
    found: false,
    rating: null,  // community rating (0..10)
    votes: null,   // community votes
    stats: {
      watchers: null,
      plays: null,
      collectors: null, // lo usamos como "libraries"
      comments: null,
      lists: null,
      favorited: null
    },
    external: {
      rtAudience: null,      // 🔌 preparado (si lo devuelves)
      justwatchRank: null,   // 🔌 preparado (si lo devuelves)
      justwatchDelta: null,  // 🔌 preparado (si lo devuelves)
      justwatchCountry: 'ES'
    }
  })

  // =====================================================================
  // ✅ TRAKT COMMUNITY: Sentimientos / Comentarios / Temporadas / Listas
  // =====================================================================

  const [tSentiment, setTSentiment] = useState({ loading: false, error: '', pros: [], cons: [], sourceCount: 0 })

  const [tCommentsTab, setTCommentsTab] = useState('likes30') // likes30 | likesAll | recent
  const [tComments, setTComments] = useState({ loading: false, error: '', items: [], page: 1, hasMore: false, total: 0 })

  const [tSeasons, setTSeasons] = useState({ loading: false, error: '', items: [] })

  const [tListsTab, setTListsTab] = useState('popular') // popular | trending (lo mostramos como "Following")
  const [tLists, setTLists] = useState({ loading: false, error: '', items: [], page: 1, hasMore: false, total: 0 })

  // Reset al cambiar de título
  useEffect(() => {
    setTSentiment({ loading: false, error: '', pros: [], cons: [], sourceCount: 0 })
    setTComments({ loading: false, error: '', items: [], page: 1, hasMore: false, total: 0 })
    setTCommentsTab('likes30')
    setTSeasons({ loading: false, error: '', items: [] })
    setTLists({ loading: false, error: '', items: [], page: 1, hasMore: false, total: 0 })
    setTListsTab('popular')
  }, [id, traktType])

  // 1) Sentimientos (derivados de comentarios top)
  useEffect(() => {
    let ignore = false

    const load = async () => {
      setTSentiment((p) => ({ ...p, loading: true, error: '' }))
      try {
        const r = await traktGetComments({
          type: traktType,         // 'movie' | 'show'
          tmdbId: id,
          sort: 'likes',
          page: 1,
          limit: 50
        })
        if (ignore) return
        const items = Array.isArray(r?.items) ? r.items : []
        const { pros, cons } = buildSentimentFromComments(items)
        setTSentiment({ loading: false, error: '', pros, cons, sourceCount: items.length })
      } catch (e) {
        if (!ignore) setTSentiment({ loading: false, error: e?.message || 'Error', pros: [], cons: [], sourceCount: 0 })
      }
    }

    load()
    return () => { ignore = true }
  }, [id, traktType]) // público: no depende de conexión

  // 2) Comentarios (tabs)
  useEffect(() => {
    let ignore = false

    const load = async () => {
      setTComments((p) => ({ ...p, loading: true, error: '' }))

      try {
        const isLikes30 = tCommentsTab === 'likes30'
        const sort = tCommentsTab === 'recent' ? 'newest' : 'likes'

        // Para likes30: pedimos más y filtramos por fecha
        const reqLimit = isLikes30 ? 50 : 20
        const page = isLikes30 ? 1 : tComments.page

        const r = await traktGetComments({
          type: traktType,
          tmdbId: id,
          sort,
          page,
          limit: reqLimit
        })

        if (ignore) return

        let items = Array.isArray(r?.items) ? r.items : []
        const total = Number(r?.pagination?.itemCount || 0)
        const hasMore = !!(r?.pagination?.pageCount && r?.pagination?.page < r?.pagination?.pageCount)

        if (isLikes30) {
          const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
          items = items.filter((c) => {
            const t = new Date(c?.created_at || 0).getTime()
            return Number.isFinite(t) && t >= cutoff
          })
          // Mantén máximo 20 para UI (puedes subirlo si quieres)
          items = items.slice(0, 20)
        }

        setTComments((p) => ({
          ...p,
          loading: false,
          error: '',
          items: p.page > 1 && !isLikes30 ? [...(p.items || []), ...items] : items,
          hasMore: !isLikes30 ? hasMore : false,
          total
        }))
      } catch (e) {
        if (!ignore) setTComments((p) => ({ ...p, loading: false, error: e?.message || 'Error' }))
      }
    }

    load()
    return () => { ignore = true }
  }, [id, traktType, tCommentsTab, tComments.page])

  // si cambia tab => resetea paginación
  useEffect(() => {
    setTComments((p) => ({ ...p, items: [], page: 1, hasMore: false, total: 0 }))
  }, [tCommentsTab])

  // 3) Temporadas (solo show)
  useEffect(() => {
    let ignore = false
    const load = async () => {
      if (type !== 'tv') return
      setTSeasons((p) => ({ ...p, loading: true, error: '' }))
      try {
        const r = await traktGetShowSeasons({ tmdbId: id, extended: 'full' })
        if (ignore) return
        setTSeasons({ loading: false, error: '', items: Array.isArray(r?.items) ? r.items : [] })
      } catch (e) {
        if (!ignore) setTSeasons({ loading: false, error: e?.message || 'Error', items: [] })
      }
    }
    load()
    return () => { ignore = true }
  }, [id, type])

  // 4) Listas (popular / trending)
  useEffect(() => {
    let ignore = false

    const load = async () => {
      setTLists((p) => ({ ...p, loading: true, error: '' }))
      try {
        const r = await traktGetLists({
          type: traktType,
          tmdbId: id,
          tab: tListsTab,
          page: tLists.page,
          limit: 10
        })
        if (ignore) return

        const items = Array.isArray(r?.items) ? r.items : []
        const total = Number(r?.pagination?.itemCount || 0)
        const hasMore = !!(r?.pagination?.pageCount && r?.pagination?.page < r?.pagination?.pageCount)

        setTLists((p) => ({
          ...p,
          loading: false,
          error: '',
          items: p.page > 1 ? [...(p.items || []), ...items] : items,
          hasMore,
          total
        }))
      } catch (e) {
        if (!ignore) setTLists((p) => ({ ...p, loading: false, error: e?.message || 'Error' }))
      }
    }

    load()
    return () => { ignore = true }
  }, [id, traktType, tListsTab, tLists.page])

  useEffect(() => {
    setTLists((p) => ({ ...p, items: [], page: 1, hasMore: false, total: 0 }))
  }, [tListsTab])

  const [syncTrakt, setSyncTrakt] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const v = window.localStorage.getItem('showverse:trakt:sync') === '1'
      setSyncTrakt(v)
    } catch { }
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem('showverse:trakt:sync', syncTrakt ? '1' : '0')
    } catch { }
  }, [syncTrakt])

  const reloadTraktStatus = async () => {
    setTrakt((p) => ({ ...p, loading: true, error: '' }))
    const json = await traktGetItemStatus({ type: traktType, tmdbId: id })

    setTrakt({
      loading: false,
      connected: !!json.connected,
      found: !!json.found,
      traktUrl: json.traktUrl || null,
      watched: !!json.watched,
      plays: Number(json.plays || 0),
      lastWatchedAt: json.lastWatchedAt || null,
      rating: typeof json.rating === 'number' ? json.rating : null, // si no usas rating, pon null
      inWatchlist: !!json.inWatchlist,
      progress: json.progress || null,
      history: Array.isArray(json.history) ? json.history : [],
      error: ''
    })
  }

  useEffect(() => {
    let ignore = false

    const load = async () => {
      setTScoreboard((p) => ({ ...p, loading: true, error: '' }))
      try {
        const r = await traktGetScoreboard({ type: traktType, tmdbId: id })
        if (ignore) return

        const rating = typeof r?.community?.rating === 'number' ? r.community.rating : null
        const votes = typeof r?.community?.votes === 'number' ? r.community.votes : null

        // stats (si vienen)
        const st = r?.stats || {}
        setTScoreboard({
          loading: false,
          error: '',
          found: !!r?.found,
          rating,
          votes,
          stats: {
            watchers: typeof st?.watchers === 'number' ? st.watchers : null,
            plays: typeof st?.plays === 'number' ? st.plays : null,
            collectors: typeof st?.collectors === 'number' ? st.collectors : null,
            comments: typeof st?.comments === 'number' ? st.comments : null,
            lists: typeof st?.lists === 'number' ? st.lists : null,
            favorited: typeof st?.favorited === 'number' ? st.favorited : null
          },
          external: {
            rtAudience: r?.external?.rtAudience ?? null,
            justwatchRank: r?.external?.justwatchRank ?? null,
            justwatchDelta: r?.external?.justwatchDelta ?? null,
            justwatchCountry: r?.external?.justwatchCountry ?? 'ES'
          }
        })
      } catch (e) {
        if (!ignore) {
          setTScoreboard((p) => ({
            ...p,
            loading: false,
            found: false,
            error: e?.message || 'Error cargando scoreboard'
          }))
        }
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [id, traktType])

  useEffect(() => {
    if (!id) return
    let cancelled = false

      ; (async () => {
        try {
          setTraktStatsLoading(true)
          setTraktStatsError('')

          const res = await traktGetStats({ type: traktType, tmdbId: id })
          if (cancelled) return

          // res puede venir como { stats } o directamente stats según lo implementes:
          setTraktStats(res?.stats ?? res ?? null)
        } catch (e) {
          if (cancelled) return
          setTraktStatsError(e?.message || 'No se pudieron cargar estadísticas de Trakt')
          setTraktStats(null)
        } finally {
          if (!cancelled) setTraktStatsLoading(false)
        }
      })()

    return () => {
      cancelled = true
    }
  }, [id, traktType])

  useEffect(() => {
    setTraktWatchedOpen(false)
    setTraktEpisodesOpen(false)
    setEpisodeBusyKey('')
    setTraktBusy('')
  }, [id, endpointType])

  useEffect(() => {
    if (!traktWatchedOpen) return
    reloadTraktStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traktWatchedOpen])

  useEffect(() => {
    let ignore = false

    const load = async () => {
      setTrakt((p) => ({ ...p, loading: true, error: '' }))
      try {
        const json = await traktGetItemStatus({ type: traktType, tmdbId: id })
        if (ignore) return

        setTrakt({
          loading: false,
          connected: !!json.connected,
          found: !!json.found,
          traktUrl: json.traktUrl || null,
          watched: !!json.watched,
          plays: Number(json.plays || 0),
          lastWatchedAt: json.lastWatchedAt || null,
          rating: typeof json.rating === 'number' ? json.rating : null, // si no usas rating, pon null
          inWatchlist: !!json.inWatchlist,
          progress: json.progress || null,
          history: Array.isArray(json.history) ? json.history : [],
          error: ''
        })
      } catch (e) {
        if (ignore) return
        setTrakt((p) => ({ ...p, loading: false, error: e?.message || 'Error cargando Trakt' }))
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [id, traktType])

  useEffect(() => {
    let ignore = false

    const loadEpisodeWatched = async () => {
      if (type !== 'tv') return
      if (!trakt?.connected) {
        setWatchedBySeason({})
        return
      }

      try {
        const r = await traktGetShowWatched({ tmdbId: id })
        if (ignore) return
        setWatchedBySeason(r?.watchedBySeason || {})
      } catch {
        if (!ignore) setWatchedBySeason({})
      }
    }

    loadEpisodeWatched()
    return () => { ignore = true }
  }, [type, id, trakt?.connected])

  // ✅ Refrescar episodios vistos al ABRIR el modal (evita que se quede en 0 o desincronizado)
  useEffect(() => {
    let ignore = false

    const refreshOnOpen = async () => {
      if (!traktEpisodesOpen) return
      if (type !== 'tv') return
      if (!trakt?.connected) return

      try {
        const r = await traktGetShowWatched({ tmdbId: id })
        if (ignore) return
        setWatchedBySeason(r?.watchedBySeason || {})
      } catch {
        // no machacamos a {} aquí para no “borrar” UI si falla el refresh
      }
    }

    refreshOnOpen()
    return () => { ignore = true }
  }, [traktEpisodesOpen, type, id, trakt?.connected])

  const toggleTraktWatched = async () => {
    if (!trakt.connected || traktBusy) return
    setTraktBusy('watched')
    try {
      const next = !trakt.watched
      await traktSetWatched({ type: traktType, tmdbId: id, watched: next })
      setTrakt((p) => ({
        ...p,
        watched: next,
        lastWatchedAt: next ? new Date().toISOString() : null,
        plays: next ? Math.max(1, p.plays || 0) : 0
      }))
    } finally {
      setTraktBusy('')
    }
  }

  const handleTraktAddPlay = async (yyyyMmDd) => {
    if (!trakt.connected || traktBusy) return
    setTraktBusy('history')
    try {
      await traktAddWatchPlay({ type: traktType, tmdbId: id, watchedAt: yyyyMmDd })
      await reloadTraktStatus()
    } finally {
      setTraktBusy('')
    }
  }

  const handleTraktUpdatePlay = async (historyId, yyyyMmDd) => {
    if (!trakt.connected || traktBusy) return
    setTraktBusy('history')
    try {
      await traktUpdateWatchPlay({ type: traktType, tmdbId: id, historyId, watchedAt: yyyyMmDd })
      await reloadTraktStatus()
    } finally {
      setTraktBusy('')
    }
  }

  const handleTraktRemovePlay = async (historyId) => {
    if (!trakt.connected || traktBusy) return
    setTraktBusy('history')
    try {
      await traktRemoveWatchPlay({ historyId })
      await reloadTraktStatus()
    } finally {
      setTraktBusy('')
    }
  }

  const setTraktRatingSafe = async (valueOrNull) => {
    if (!trakt.connected || traktBusy) return
    setTraktBusy('rating')
    try {
      await traktSetRating({
        type: traktType,                 // 'movie' | 'show'
        ids: { tmdb: Number(id) },        // ✅ lo que tu API route espera
        rating: valueOrNull              // puede ser number o null (borrar)
      })
      setTrakt((p) => ({ ...p, rating: valueOrNull == null ? null : Math.round(valueOrNull) }))
    } finally {
      setTraktBusy('')
    }
  }

  const toggleEpisodeWatched = async (seasonNumber, episodeNumber) => {
    if (type !== 'tv') return
    if (!trakt?.connected) return
    if (episodeBusyKey) return

    const key = `S${seasonNumber}E${episodeNumber}`
    setEpisodeBusyKey(key)

    const currentlyWatched = !!(watchedBySeason?.[seasonNumber]?.includes(episodeNumber))
    const next = !currentlyWatched

    // ✅ optimista
    setWatchedBySeason((prev) => {
      const cur = new Set(prev?.[seasonNumber] || [])
      if (next) cur.add(episodeNumber)
      else cur.delete(episodeNumber)
      return { ...prev, [seasonNumber]: Array.from(cur).sort((a, b) => a - b) }
    })

    try {
      const r = await traktSetEpisodeWatched({
        tmdbId: id,
        season: seasonNumber,
        episode: episodeNumber,
        watched: next,
        watchedAt: null
      })

      // ✅ Si el endpoint ya devuelve watchedBySeason (con el fix del backend), úsalo
      if (r?.watchedBySeason) {
        setWatchedBySeason(r.watchedBySeason)
      } else {
        // ✅ Fallback robusto: refetch del estado real
        const fresh = await traktGetShowWatched({ tmdbId: id })
        setWatchedBySeason(fresh?.watchedBySeason || {})
      }
    } catch {
      // rollback si falla
      setWatchedBySeason((prev) => {
        const cur = new Set(prev?.[seasonNumber] || [])
        if (!next) cur.add(episodeNumber)
        else cur.delete(episodeNumber)
        return { ...prev, [seasonNumber]: Array.from(cur).sort((a, b) => a - b) }
      })
    } finally {
      setEpisodeBusyKey('')
    }
  }

  // =====================================================
  // ✅ Extras: IMDb rating rápido + votos/premios en idle
  // =====================================================

  const [extras, setExtras] = useState({
    imdbRating: null,
    imdbVotes: null,
    awards: null,
    rtScore: null,
    mcScore: null
  })
  const [imdbVotesLoading, setImdbVotesLoading] = useState(false)

  useEffect(() => {
    let abort = false

    const resolveImdbId = async () => {
      const direct = data?.imdb_id || data?.external_ids?.imdb_id || null
      if (direct) return direct

      try {
        const ext = await getExternalIds(endpointType, id)
        return ext?.imdb_id || null
      } catch {
        return null
      }
    }

    const run = async () => {
      try {
        // reset “suave” al cambiar de título
        setExtras({ imdbRating: null, imdbVotes: null, awards: null, rtScore: null, mcScore: null })
        setImdbVotesLoading(false)

        const imdbId = await resolveImdbId()
        if (abort || !imdbId) return

        // ✅ cache instantáneo
        const cached = readOmdbCache(imdbId)
        if (cached?.imdbRating != null) {
          setExtras((prev) => ({ ...prev, imdbRating: cached.imdbRating }))
        }
        if (cached?.imdbVotes != null) {
          setExtras((prev) => ({ ...prev, imdbVotes: cached.imdbVotes }))
        }
        if (cached?.awards) {
          setExtras((prev) => ({ ...prev, awards: cached.awards }))
        }
        if (cached?.rtScore != null) {
          setExtras((prev) => ({ ...prev, rtScore: cached.rtScore }))
        }
        if (cached?.mcScore != null) {
          setExtras((prev) => ({ ...prev, mcScore: cached.mcScore }))
        }
        // si el cache está fresco y ya hay rating/votos, no hace falta pedir nada
        if (cached?.fresh && cached?.imdbRating != null && cached?.imdbVotes != null) return

        // ✅ pide OMDb (rating primero)
        const omdb = await fetchOmdbByImdb(imdbId)
        if (abort) return

        const imdbRating =
          omdb?.imdbRating && omdb.imdbRating !== 'N/A' ? Number(omdb.imdbRating) : null

        const { rtScore, mcScore } = extractOmdbExtraScores(omdb)

        // ✅ pinta lo “rápido” cuanto antes (IMDb + RT + MC)
        setExtras((prev) => ({
          ...prev,
          imdbRating: Number.isFinite(imdbRating) ? imdbRating : null,
          rtScore,
          mcScore
        }))

        writeOmdbCache(imdbId, {
          imdbRating: Number.isFinite(imdbRating) ? imdbRating : null,
          rtScore,
          mcScore
        })

        // votos/premios en idle (como ya lo tenías)
        setImdbVotesLoading(true)
        runIdle(() => {
          if (abort) return

          const votes =
            omdb?.imdbVotes && omdb.imdbVotes !== 'N/A'
              ? Number(String(omdb.imdbVotes).replace(/,/g, ''))
              : null

          const awards =
            typeof omdb?.Awards === 'string' && omdb.Awards.trim() ? omdb.Awards.trim() : null

          setExtras((prev) => ({
            ...prev,
            imdbVotes: Number.isFinite(votes) ? votes : null,
            awards
          }))

          writeOmdbCache(imdbId, {
            imdbVotes: Number.isFinite(votes) ? votes : null,
            awards
          })

          setImdbVotesLoading(false)
        })
      } catch {
        if (!abort) {
          setExtras({ imdbRating: null, imdbVotes: null, awards: null })
          setImdbVotesLoading(false)
        }
      }
    }

    run()
    return () => {
      abort = true
    }
  }, [type, id, data?.imdb_id, data?.external_ids?.imdb_id, endpointType])

  /* =========================================
   COMPONENTES AUXILIARES (MODIFICADOS)
========================================= */

  /* Badge de Puntuación: Ajustado para ser más sutil (texto más pequeño) */
  function CompactBadge({
    logo,
    label,
    value,
    sub,
    suffix,
    href,
    className = '',
    hideSubOnMobile = true
  }) {
    const Comp = href ? 'a' : 'div'

    return (
      <Comp
        href={href}
        target={href ? '_blank' : undefined}
        rel={href ? 'noopener noreferrer' : undefined}
        className={`
        flex items-center gap-2.5 group select-none min-w-0
        ${href ? 'cursor-pointer' : ''}
        ${className}
      `}
        title={sub ? `${label || ''} ${value ?? ''} · ${sub}`.trim() : undefined}
      >
        <img
          src={logo}
          alt={label || 'Provider'}
          className="h-5 w-auto object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-110"
        />

        <div className="flex flex-col justify-center leading-none min-w-0">
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-lg sm:text-xl font-black text-white tracking-tight drop-shadow-sm">
              {value != null ? value : '-'}
            </span>

            {suffix && (
              <span className="text-[10px] font-bold text-zinc-500 mb-0.5 shrink-0">
                {suffix}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 mt-0.5 min-w-0">
            {label && (
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest bg-white/5 px-1 rounded-sm shrink-0">
                {label}
              </span>
            )}

            {sub && (
              <span
                className={`
                text-[9px] font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors tracking-wide
                truncate
                ${hideSubOnMobile ? 'hidden sm:inline' : ''}
              `}
              >
                {sub}
              </span>
            )}
          </div>
        </div>
      </Comp>
    )
  }

  /* Botón de Enlace Externo (Estilo unificado con las tarjetas) */
  function ExternalLinkButton({ icon, href, title }) {
    if (!href) return null;
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all group"
        title={title}
      >
        {typeof icon === 'string' ? (
          <img src={icon} alt={title} className="w-5 h-5 object-contain opacity-70 group-hover:opacity-100 transition-opacity" />
        ) : (
          icon
        )}
      </a>
    );
  }

  /* Estadística Minimalista */
  function MiniStat({ icon: Icon, value, tooltip }) {
    return (
      <div className="flex items-center gap-2 group shrink-0" title={tooltip}>
        <div className="p-1.5 bg-white/5 rounded-full group-hover:bg-white/10 transition-colors">
          <Icon className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200" />
        </div>
        <span className="text-xs font-semibold text-zinc-400 font-mono tracking-tight group-hover:text-zinc-300">
          {value}
        </span>
      </div>
    );
  }

  /* NUEVO COMPONENTE: Botón de Puntuación Unificado 
     Muestra una estrella y permite puntuar o borrar nota.
  */
  function UnifiedRateButton({ rating, loading, onRate, connected, onConnect }) {
    // Si no hay conexión a ningún servicio, mostramos botón de conectar (por defecto a Login)
    if (!connected) {
      return (
        <button
          onClick={onConnect}
          className="flex items-center gap-2 px-3 h-9 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          title="Conectar para puntuar"
        >
          <Star className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Rate</span>
        </button>
      );
    }

    const hasRating = rating && rating > 0;

    return (
      <div className={`
      relative group flex items-center justify-center gap-2 px-3 h-9 rounded-full transition-all border cursor-pointer
      ${hasRating
          ? "bg-yellow-500/10 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]"
          : "bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10"}
    `}>
        {loading ? (
          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        ) : (
          <>
            {/* Estrella: Llena y amarilla si hay nota, contorno gris si no */}
            <Star
              className={`w-4 h-4 transition-colors ${hasRating ? "fill-yellow-500 text-yellow-500" : "text-zinc-400 group-hover:text-white"}`}
            />

            {/* Texto: La nota o la palabra "RATE" */}
            <span className={`text-sm font-black tracking-tight ${hasRating ? "text-yellow-500" : "text-zinc-400 group-hover:text-white"}`}>
              {hasRating ? rating : "RATE"}
            </span>
          </>
        )}

        {/* Selector invisible superpuesto */}
        {!loading && (
          <select
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
            value={rating || ""}
            onChange={(e) => {
              const val = e.target.value === "" ? null : Number(e.target.value);
              onRate(val);
            }}
            title="Tu Puntuación (TMDb + Trakt)"
          >
            <option value="">Borrar nota</option>
            <option disabled>──────────</option>
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(val => (
              <option key={val} value={val}>{val}</option>
            ))}
          </select>
        )}
      </div>
    );
  }

  // Lógica unificada para puntuar en ambos sitios
  const handleUnifiedRate = async (value) => {
    // Si no está conectado a nada, redirigir a login (TMDb es la base)
    if (!session) {
      window.location.href = '/login';
      return;
    }

    // 1. Gestionar TMDb
    if (value === null) {
      await clearTmdbRating({ skipSync: true });
    } else {
      await sendTmdbRating(value, { skipSync: true });
    }

    // 2. Gestionar Trakt (si está conectado)
    if (trakt.connected) {
      // Trakt usa null para borrar, o número entero
      await sendTraktRating(value); // sendTraktRating ya maneja null internamente
    }
  };

  // Calculamos una nota "visual" única (prioridad Trakt si existe, sino TMDb)
  const unifiedUserRating = trakt.connected && trakt.rating
    ? trakt.rating
    : userRating;

  // ====== Ratings Episodios (TV) ======
  const [ratings, setRatings] = useState(null)
  const [ratingsError, setRatingsError] = useState(null)
  const [ratingsLoading, setRatingsLoading] = useState(false)
  useEffect(() => {
    let ignore = false
    async function load() {
      if (type !== 'tv') return
      setRatingsLoading(true)
      try {
        const res = await fetch(`/api/tv/${id}/ratings?excludeSpecials=true`)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error)
        if (!ignore) setRatings(json)
      } catch (e) {
        if (!ignore) setRatingsError(e.message)
      } finally {
        if (!ignore) setRatingsLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [id, type])

  // ====== Handlers Artwork ======
  const handleSelectPoster = (filePath) => {
    setSelectedPosterPath(filePath)
    if (typeof window !== 'undefined') {
      filePath
        ? window.localStorage.setItem(posterStorageKey, filePath)
        : window.localStorage.removeItem(posterStorageKey)
    }
    saveArtworkOverride({ type: endpointType, id, kind: 'poster', filePath })
  }

  const handleSelectPreviewBackdrop = (filePath) => {
    setSelectedPreviewBackdropPath(filePath)
    if (typeof window !== 'undefined') {
      filePath
        ? window.localStorage.setItem(previewBackdropStorageKey, filePath)
        : window.localStorage.removeItem(previewBackdropStorageKey)
    }
    saveArtworkOverride({ type: endpointType, id, kind: 'backdrop', filePath })
  }

  const handleSelectBackground = (filePath) => {
    setSelectedBackgroundPath(filePath)
    if (typeof window !== 'undefined') {
      filePath
        ? window.localStorage.setItem(backgroundStorageKey, filePath)
        : window.localStorage.removeItem(backgroundStorageKey)
    }
    saveArtworkOverride({ type: endpointType, id, kind: 'background', filePath })
  }

  const handleResetArtwork = () => {
    setSelectedPosterPath(null)
    setSelectedPreviewBackdropPath(null)
    setSelectedBackgroundPath(null)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(posterStorageKey)
      window.localStorage.removeItem(previewBackdropStorageKey)
      window.localStorage.removeItem(backgroundStorageKey)
    }
    saveArtworkOverride({ type: endpointType, id, kind: 'poster', filePath: null })
    saveArtworkOverride({ type: endpointType, id, kind: 'backdrop', filePath: null })
    saveArtworkOverride({ type: endpointType, id, kind: 'background', filePath: null })
  }

  const handleCopyImageUrl = async (filePath) => {
    const url = buildOriginalImageUrl(filePath)
    try {
      navigator?.clipboard?.writeText
        ? await navigator.clipboard.writeText(url)
        : window.prompt('Copiar URL:', url)
    } catch {
      window.prompt('Copiar URL:', url)
    }
  }

  // Scroll Nav Logic
  const updateImagesNav = () => {
    const el = imagesScrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const hasOverflow = scrollWidth > clientWidth + 1
    setCanPrevImages(hasOverflow && scrollLeft > 0)
    setCanNextImages(hasOverflow && scrollLeft + clientWidth < scrollWidth - 1)
  }
  const handleImagesScroll = () => updateImagesNav()
  const handlePrevImagesClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    imagesScrollRef.current?.scrollBy({ left: -400, behavior: 'smooth' })
  }
  const handleNextImagesClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    imagesScrollRef.current?.scrollBy({ left: 400, behavior: 'smooth' })
  }
  useEffect(() => {
    updateImagesNav()
    window.addEventListener('resize', updateImagesNav)
    return () => window.removeEventListener('resize', updateImagesNav)
  }, [imagesState, activeImagesTab])

  const showPrevImages = isHoveredImages && canPrevImages
  const showNextImages = isHoveredImages && canNextImages

  const filmAffinitySearchUrl = `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(
    data.title || data.name
  )}`

  const seriesGraphUrl =
    type === 'tv' && data?.id && (data.name || data.original_name)
      ? `https://seriesgraph.com/show/${data.id}-${slugifyForSeriesGraph(
        data.original_name || data.name
      )}`
      : null

  // ====== Datos meta / características (reorganizadas) ======
  const directorsOrCreators =
    type === 'movie'
      ? data.credits?.crew?.filter((c) => c.job === 'Director') || []
      : data.created_by || []

  const directorNames =
    type === 'movie' && directorsOrCreators.length
      ? directorsOrCreators.map((d) => d.name).join(', ')
      : null

  const createdByNames =
    type === 'tv' && directorsOrCreators.length
      ? directorsOrCreators.map((d) => d.name).join(', ')
      : null

  const production =
    data.production_companies?.slice(0, 3).map((c) => c.name).join(', ') || null

  const hasProduction = !!production
  const hasAwards = !!extras?.awards

  const countries = (() => {
    const pc = Array.isArray(data.production_countries) ? data.production_countries : []
    if (pc.length) return pc.map((c) => c.iso_3166_1).filter(Boolean).join(', ') || null
    const oc = Array.isArray(data.origin_country) ? data.origin_country : []
    return oc.length ? oc.join(', ') : null
  })()

  const languages =
    data.spoken_languages?.map((l) => l.english_name || l.name).filter(Boolean).join(', ') ||
    (Array.isArray(data.languages) ? data.languages.join(', ') : null)

  const network =
    type === 'tv'
      ? (data.networks?.[0]?.name || data.networks?.[0]?.original_name || null)
      : null

  const releaseDateLabel =
    type === 'movie' ? 'Estreno' : 'Primera emisión'

  const releaseDateValue =
    type === 'movie' ? formatDateEs(data.release_date) : formatDateEs(data.first_air_date)

  const lastAirDateValue = type === 'tv' ? formatDateEs(data.last_air_date) : null

  const runtimeValue =
    type === 'movie' && data.runtime
      ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m`
      : null

  const budgetValue = type === 'movie' && data.budget > 0
    ? `$${(data.budget / 1_000_000).toFixed(1)}M`
    : null

  const revenueValue = type === 'movie' && data.revenue > 0
    ? `$${(data.revenue / 1_000_000).toFixed(1)}M`
    : null

  // ✅ Director (movie) — fallback si data no trae credits
  const [movieDirector, setMovieDirector] = useState(null)

  useEffect(() => {
    let ignore = false

    const loadDirector = async () => {
      if (type !== 'movie' || !id) {
        setMovieDirector(null)
        return
      }

      const crew = data?.credits?.crew
      if (Array.isArray(crew) && crew.length) {
        const dirs = crew.filter((c) => c?.job === 'Director').map((d) => d?.name).filter(Boolean)
        if (!ignore) setMovieDirector(dirs.length ? dirs.join(', ') : null)
        return
      }

      try {
        if (!TMDB_API_KEY) return
        const url = `https://api.themoviedb.org/3/movie/${id}/credits?api_key=${TMDB_API_KEY}`
        const res = await fetch(url)
        const json = await res.json()
        if (!res.ok) return

        const dirs = (json?.crew || [])
          .filter((c) => c?.job === 'Director')
          .map((d) => d?.name)
          .filter(Boolean)

        if (!ignore) setMovieDirector(dirs.length ? dirs.join(', ') : null)
      } catch {
        if (!ignore) setMovieDirector(null)
      }
    }

    loadDirector()
    return () => {
      ignore = true
    }
  }, [type, id, data?.credits])

  // ✅ MENÚ GLOBAL (nuevo)
  const [activeSection, setActiveSection] = useState('media')

  // ✅ Más fluido al cambiar secciones (evita bloqueo del render pesado)
  const [isSwitchingSection, startSectionTransition] = useTransition()

  const handleSectionChange = useCallback((id) => {
    // 1) actualiza el menú de forma fluida (no bloquea la UI si la sección es pesada)
    startSectionTransition(() => {
      setActiveSection(id)
    })
  }, [])

  // ✅ cuando cambie type, fija una sección inicial válida
  useEffect(() => {
    setActiveSection(type === 'tv' ? 'episodes' : 'media')
  }, [type])


  // Helpers (ponlos cerca de tus helpers)
  const mixedCount = (a, b) => {
    const A = Number(a || 0)
    const B = Number(b || 0)
    if (A > 0 && B > 0) return `${A}+${B}`
    if (A > 0) return A
    if (B > 0) return B
    return null
  }

  const sumCount = (...vals) => vals.reduce((acc, v) => acc + (Number(v || 0) || 0), 0)

  // Dentro del componente:
  const postersCount = imagesState?.posters?.length || 0
  const backdropsCount = imagesState?.backdrops?.length || 0
  const videosCount = videos?.length || 0
  const mediaCount = sumCount(postersCount, backdropsCount, videosCount)

  // Trakt comments + TMDb reviews (para el badge tipo "448+4")
  const traktCommentsCount = Number(tComments?.total || 0)
  const reviewsCount = Array.isArray(reviews) ? reviews.length : 0
  const commentsCount = mixedCount(traktCommentsCount, reviewsCount)

  // Otros counts
  const listsCount = Array.isArray(tLists?.items) ? tLists.items.length : 0
  const castCount = Array.isArray(castData) ? castData.length : 0
  const recsCount = Array.isArray(recommendations) ? recommendations.length : 0

  const sectionItems = useMemo(() => {
    const items = []

    // ✅ TV: Episodios
    if (type === 'tv') {
      items.push({
        id: 'episodes',
        label: 'Episodios',
        icon: TrendingUp,
        // si no tienes "ratings.length", puedes dejar count undefined
        count: Array.isArray(ratings) ? ratings.length : undefined
      })
    }

    // ✅ Media = Imágenes + Vídeos (unificado)
    const postersCount = imagesState?.posters?.length || 0
    const backdropsCount = imagesState?.backdrops?.length || 0
    const videosCount = Array.isArray(videos) ? videos.length : 0
    const mediaCount = postersCount + backdropsCount + videosCount

    items.push({
      id: 'media',
      label: 'Media',
      icon: ImageIcon,
      count: mediaCount || undefined
    })

    // ✅ Sentimientos
    items.push({
      id: 'sentiment',
      label: 'Sentimientos',
      icon: Sparkles
    })

    // ✅ Comentarios = Trakt + Críticas (unificado)
    const traktCommentsCount = Number(tComments?.total || 0) || 0
    const reviewsCount = Array.isArray(reviews) ? reviews.length : 0
    const commentsCount = traktCommentsCount + reviewsCount

    items.push({
      id: 'comments',
      label: 'Comentarios',
      icon: MessageSquareIcon,
      count: commentsCount || undefined
    })

    // ✅ TV: Temporadas
    if (type === 'tv') {
      items.push({
        id: 'seasons',
        label: 'Temporadas',
        icon: Layers,
        count: Array.isArray(tSeasons?.items) ? tSeasons.items.length : undefined
      })
    }

    // ✅ Listas
    items.push({
      id: 'lists',
      label: 'Listas',
      icon: ListVideo,
      count: Array.isArray(tLists?.items) ? tLists.items.length : undefined
    })

    // ✅ Reparto
    items.push({
      id: 'cast',
      label: 'Reparto',
      icon: Users,
      count: Array.isArray(castData) ? castData.length : undefined
    })

    // ✅ Recomendaciones (texto completo)
    items.push({
      id: 'recs',
      label: 'Recomendaciones',
      icon: MonitorPlay,
      count: Array.isArray(recommendations) ? recommendations.length : undefined
    })

    return items
  }, [
    type,
    ratings,
    imagesState?.posters,
    imagesState?.backdrops,
    videos,
    tComments?.total,
    reviews,
    tSeasons?.items,
    tLists?.items,
    castData,
    recommendations
  ])

  // =====================================================
  // ✅ IMDb para RECOMENDACIONES: SOLO HOVER (no auto)
  // =====================================================
  const [recImdbRatings, setRecImdbRatings] = useState({})
  const recImdbRatingsRef = useRef({})
  const recImdbInFlightRef = useRef(new Set())
  const recImdbTimersRef = useRef({})
  const recImdbIdCacheRef = useRef({})

  useEffect(() => {
    recImdbRatingsRef.current = recImdbRatings
  }, [recImdbRatings])

  useEffect(() => {
    // reset al cambiar de item
    setRecImdbRatings({})
    recImdbInFlightRef.current = new Set()
    recImdbTimersRef.current = {}
    recImdbIdCacheRef.current = {}
  }, [id, type])

  const prefetchRecImdb = useCallback((rec) => {
    if (!rec?.id) return
    if (typeof window === 'undefined') return

    const rid = rec.id
    // si ya está (aunque sea null) no vuelvas a pedir
    if (recImdbRatingsRef.current?.[rid] !== undefined) return
    if (recImdbInFlightRef.current.has(rid)) return

    // pequeño delay para evitar peticiones al pasar el ratón rápido
    if (recImdbTimersRef.current[rid]) return
    recImdbTimersRef.current[rid] = window.setTimeout(async () => {
      recImdbInFlightRef.current.add(rid)

      try {
        const mediaType =
          rec.media_type === 'movie' || rec.media_type === 'tv'
            ? rec.media_type
            : type === 'tv'
              ? 'tv'
              : 'movie'

        let imdbId = recImdbIdCacheRef.current?.[rid] || null
        if (!imdbId) {
          const ext = await getExternalIds(mediaType, rid)
          imdbId = ext?.imdb_id || null
          if (imdbId) recImdbIdCacheRef.current[rid] = imdbId
        }

        if (!imdbId) {
          setRecImdbRatings((prev) => ({ ...prev, [rid]: null }))
          return
        }

        // cache
        const cached = readOmdbCache(imdbId)
        if (cached?.imdbRating != null) {
          setRecImdbRatings((prev) => ({ ...prev, [rid]: cached.imdbRating }))
          if (cached?.fresh) return
        }

        const omdb = await fetchOmdbByImdb(imdbId)
        const r =
          omdb?.imdbRating && omdb.imdbRating !== 'N/A'
            ? Number(omdb.imdbRating)
            : null

        const safe = Number.isFinite(r) ? r : null
        setRecImdbRatings((prev) => ({ ...prev, [rid]: safe }))
        writeOmdbCache(imdbId, { imdbRating: safe })
      } catch {
        setRecImdbRatings((prev) => ({ ...prev, [rid]: null }))
      } finally {
        recImdbInFlightRef.current.delete(rid)
        if (recImdbTimersRef.current[rid]) {
          window.clearTimeout(recImdbTimersRef.current[rid])
          delete recImdbTimersRef.current[rid]
        }
      }
    }, 180)
  }, [type])

  const limitedProviders = Array.isArray(providers) ? providers.slice(0, 6) : []

  const [posterImgLoaded, setPosterImgLoaded] = useState(false)
  const [posterImgError, setPosterImgError] = useState(false)

  useEffect(() => {
    setPosterImgLoaded(false)
    setPosterImgError(false)
  }, [id, endpointType, displayPosterPath])

  const showNoPoster = artworkInitialized && !displayPosterPath
  const showPosterSkeleton =
    !artworkInitialized || (displayPosterPath && !posterImgLoaded && !posterImgError)

  return (
    <div className="relative min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-yellow-500/30">
      {/* --- BACKGROUND & OVERLAY --- */}
      <div className="fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a]">
        {useBackdrop && artworkInitialized && heroBackgroundPath ? (
          <>
            {/* ✅ Capa base: SIEMPRE cubre (evita marcos laterales) */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(https://image.tmdb.org/t/p/original${heroBackgroundPath})`,
                transform: 'scale(1)',
                filter: 'blur(14px) brightness(0.65) saturate(1.05)'
              }}
            />

            {/* ✅ Capa detalle: zoom OUT (scale < 1) */}
            <div
              className="absolute inset-0 bg-cover transition-opacity duration-1000"
              style={{
                backgroundImage: `url(https://image.tmdb.org/t/p/original${heroBackgroundPath})`,
                backgroundPosition: 'center top',
                transform: 'scale(1)',
                transformOrigin: 'center top'
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-[#0a0a0a]" />
        )}

        {/* ✅ Sombreado superior + laterales (sin “marcos”) */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/60 via-transparent to-transparent" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#101010]/60 via-transparent to-transparent" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-l from-[#101010]/60 via-transparent to-transparent" />

        {/* Tus overlays originales */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/60 to-black/20 backdrop-blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#101010] via-transparent to-transparent opacity-30" />
      </div>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <div className="relative z-10 px-4 py-8 lg:py-12 max-w-7xl mx-auto">
        {/* =================================================================
            HEADER HERO SECTION (Diseño Final Solicitado)
           ================================================================= */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-12 animate-in fade-in duration-700 slide-in-from-bottom-4 items-start">

          {/* --- COLUMNA IZQUIERDA: POSTER + PROVIDERS --- */}
          <div className="w-full max-w-[280px] lg:max-w-[320px] mx-auto lg:mx-0 flex-shrink-0 flex flex-col gap-5 relative z-10">

            {/* Poster Card */}
            <div className="relative group rounded-xl overflow-hidden shadow-2xl shadow-black/80 border border-white/10 bg-black/40 transition-all duration-500 hover:shadow-[0_0_40px_rgba(255,255,255,0.08)]">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setUseBackdrop((v) => !v);
                }}
                className={`absolute top-2 right-2 z-20 p-2 rounded-full backdrop-blur-md border transition-all shadow-lg
        opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto
        ${useBackdrop
                    ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200 hover:bg-yellow-500/30'
                    : 'bg-black/40 border-white/20 text-white/80 hover:bg-black/80 hover:text-white'
                  }`}
                title={useBackdrop ? 'Desactivar fondo' : 'Activar fondo'}
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              <div className="relative aspect-[2/3] bg-neutral-900">
                {showPosterSkeleton && (
                  <div className="absolute inset-0 animate-pulse bg-neutral-800/60" />
                )}
                {displayPosterPath && !posterImgError && (
                  <img
                    src={`https://image.tmdb.org/t/p/w780${displayPosterPath}`}
                    alt={title}
                    onLoad={() => setPosterImgLoaded(true)}
                    onError={() => { setPosterImgError(true); setPosterImgLoaded(true); }}
                    className={`w-full h-full object-cover transform-gpu transition-all duration-700
            ${posterImgLoaded ? 'opacity-100' : 'opacity-0'}
            group-hover:scale-[1.03] group-hover:saturate-110`}
                  />
                )}
                {(showNoPoster || posterImgError) && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ImageOff className="w-10 h-10 text-neutral-700" />
                  </div>
                )}
              </div>
            </div>

            {/* Providers Grid */}
            {limitedProviders && limitedProviders.length > 0 && (
              // CAMBIO APLICADO: Añadido 'py-2' (padding vertical) para dar espacio al hover:scale
              <div className="flex flex-row flex-nowrap justify-center items-center gap-2 w-full px-1 py-2 overflow-x-auto [scrollbar-width:none]">
                {limitedProviders.map((p) => (
                  <a
                    key={p.provider_id}
                    href={tmdbWatchUrl || '#'}
                    target={tmdbWatchUrl ? '_blank' : undefined}
                    rel={tmdbWatchUrl ? 'noreferrer' : undefined}
                    title={p.provider_name}
                    // z-10 en hover asegura que se superponga si están muy juntos
                    className="relative flex-shrink-0 transition-transform transform hover:scale-110 hover:brightness-110 hover:z-10"
                  >
                    <img
                      src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                      alt={p.provider_name}
                      // Iconos ligeramente más pequeños en móvil (w-9) para que quepan 7 mejor
                      className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl shadow-lg object-contain bg-white/5"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* --- COLUMNA DERECHA: INFO + TABS --- */}
          <div className="flex-1 flex flex-col min-w-0 w-full">

            {/* 1. TÍTULO Y CABECERA */}
            <div className="mb-5">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1] tracking-tight text-balance drop-shadow-xl mb-3">
                {title}
              </h1>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base md:text-lg font-medium text-zinc-300">
                {yearIso && <span className="text-white font-bold tracking-wide">{yearIso}</span>}

                {runtimeValue && (
                  <>
                    <span className="text-zinc-600 text-[10px]">●</span>
                    <span>{runtimeValue}</span>
                  </>
                )}

                {data.status && (
                  <>
                    <span className="text-zinc-600 text-[10px]">●</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${data.status === 'Ended' || data.status === 'Canceled'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                      {data.status}
                    </span>
                  </>
                )}

                {/* Géneros */}
                <div className="flex flex-wrap items-center gap-1.5 ml-1">
                  {data.genres?.slice(0, 3).map(g => (
                    <span key={g.id} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-white/10 text-zinc-400 bg-white/5">
                      {g.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. BARRA DE ACCIONES PRINCIPALES */}
            <div className="flex flex-wrap items-center gap-3 mb-8">
              {/* Botón Tráiler (Solo icono) */}
              <button
                onClick={() => openVideo(preferredVideo)}
                disabled={!preferredVideo}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center transition-all transform-gpu hover:scale-110 shadow-lg group
                  ${preferredVideo
                    ? 'bg-white text-black hover:bg-yellow-400'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'}
                `}
                title={preferredVideo ? 'Ver Tráiler' : 'Sin Tráiler'}
              >
                <Play className={`w-5 h-5 fill-current ${preferredVideo ? 'ml-0.5' : ''}`} />
              </button>

              <div className="w-px h-8 bg-white/10 mx-1 hidden sm:block" />

              <TraktWatchedControl
                connected={trakt.connected}
                watched={trakt.watched}
                plays={trakt.plays}
                busy={!!traktBusy}
                onOpen={() => {
                  if (!trakt.connected) window.location.href = "/api/trakt/auth/start"
                  else if (endpointType === 'tv') setTraktEpisodesOpen(true)
                  else setTraktWatchedOpen(true)
                }}
              />

              <button
                onClick={toggleFavorite}
                disabled={favLoading}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors border ${favorite
                  ? 'border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                  }`}
                title="Favorito"
              >
                {favLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className={`w-5 h-5 ${favorite ? 'fill-current' : ''}`} />}
              </button>

              <button
                onClick={toggleWatchlist}
                disabled={wlLoading}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors border ${watchlist
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                  }`}
                title="Watchlist"
              >
                {wlLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <BookmarkPlus className={`w-5 h-5 ${watchlist ? 'fill-current' : ''}`} />}
              </button>

              {canUseLists && (
                <button
                  onClick={openListsModal}
                  disabled={listsPresenceLoading}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors border ${listActive
                    ? 'border-purple-500/50 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20'
                    : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  title="Añadir a lista"
                >
                  {listsPresenceLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ListVideo className="w-5 h-5" />}
                </button>
              )}
            </div>

            {/* ✅ 3. SCOREBOARD INTEGRADO */}
            <div className="w-full border border-white/10 bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden mb-6">
              <div className="px-4 py-3 flex items-center gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

                {/* A. Ratings */}
                <div className="flex items-center gap-5 shrink-0">
                  {tScoreboard.loading && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />}

                  <CompactBadge logo="/logo-TMDb.png" value={data.vote_average?.toFixed(1)} sub={`${formatVoteCount(data.vote_count)} votes`} href={tmdbDetailUrl} />

                  {tScoreboard.rating != null && (
                    <CompactBadge logo="/logo-Trakt.png" value={Math.round(tScoreboard.rating * 10)} suffix="%" sub={`${formatVoteCount(tScoreboard.votes)} votes`} href={trakt?.traktUrl} />
                  )}

                  {extras.imdbRating && (
                    <CompactBadge logo="/logo-IMDb.png" value={Number(extras.imdbRating).toFixed(1)} sub={`${formatVoteCount(extras.imdbVotes)} votes`} href={data.imdb_id ? `https://www.imdb.com/title/${data.imdb_id}` : undefined} />
                  )}

                  {(tScoreboard?.external?.rtAudience != null || extras.rtScore != null) && (
                    <CompactBadge logo="/logo-RottenTomatoes.png" value={tScoreboard?.external?.rtAudience != null ? Math.round(tScoreboard.external.rtAudience) : (extras.rtScore != null ? Math.round(extras.rtScore) : null)} suffix="%" />
                  )}

                  {extras.mcScore != null && (
                    <CompactBadge logo="/logo-Metacritic.png" value={Math.round(extras.mcScore)} suffix="/100" />
                  )}
                </div>

                <div className="w-px h-6 bg-white/10 shrink-0" />

                {/* B. Enlaces Externos (FilmAffinity actualizado) */}
                <div className="flex items-center gap-2 shrink-0">
                  <ExternalLinkButton icon="/logo-Web.png" href={data.homepage} title="Web Oficial" />
                  <ExternalLinkButton icon="/logoFilmaffinity.png" href={filmAffinitySearchUrl} title="FilmAffinity" />
                  {type === 'tv' && <ExternalLinkButton icon="/logoseriesgraph.png" href={seriesGraphUrl} title="SeriesGraph" />}
                </div>

                <div className="w-px h-6 bg-white/10 shrink-0 ml-auto" />

                {/* C. Controles Usuario: Rate (SIN Sync) */}
                <div className="flex items-center gap-3 shrink-0">
                  <UnifiedRateButton
                    rating={unifiedUserRating}
                    loading={accountStatesLoading || ratingLoading || !!traktBusy}
                    onRate={handleUnifiedRate}
                    connected={!!session}
                    onConnect={() => (window.location.href = '/login')}
                  />
                </div>
              </div>

              {/* Footer de Estadísticas */}
              {!tScoreboard.loading && (
                <div className="px-4 py-2 border-t border-white/5 bg-black/10 flex items-center gap-6 overflow-x-auto [scrollbar-width:none]">
                  <MiniStat icon={Eye} value={formatVoteCount(tScoreboard?.stats?.watchers ?? 0)} tooltip="Watchers" />
                  <MiniStat icon={Play} value={formatVoteCount(tScoreboard?.stats?.plays ?? 0)} tooltip="Plays" />
                  <MiniStat icon={List} value={formatVoteCount(tScoreboard?.stats?.lists ?? 0)} tooltip="Lists" />
                  <MiniStat icon={Heart} value={formatVoteCount(tScoreboard?.stats?.favorited ?? 0)} tooltip="Favorited" />
                </div>
              )}

              {(!!tScoreboard.error || ratingError) && (
                <div className="px-4 pb-2 text-xs text-red-400 text-center bg-black/25 backdrop-blur-md">
                  {tScoreboard.error || ratingError}
                </div>
              )}
            </div>

            {/* 4. CONTENEDOR TABS Y CONTENIDO */}
            <div className="mb-6">

              {/* --- MENÚ DE NAVEGACIÓN --- */}
              <div className="flex flex-wrap items-center gap-6 mb-4 border-b border-white/10 pb-1">
                {[
                  { id: 'details', label: 'Detalles' },
                  { id: 'production', label: 'Producción' },
                  { id: 'synopsis', label: 'Sinopsis' },
                  ...(extras.awards ? [{ id: 'awards', label: 'Premios' }] : [])
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`pb-2 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 
          ${activeTab === tab.id
                        ? 'text-white border-yellow-500'
                        : 'text-zinc-500 border-transparent hover:text-zinc-300'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* --- ÁREA DE CONTENIDO --- */}
              <div className="relative min-h-[100px]">
                <AnimatePresence mode="wait">

                  {/* 1. SINOPSIS */}
                  {activeTab === 'synopsis' && (
                    <motion.div
                      key="synopsis"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                        {data.tagline && (
                          <div className="text-yellow-500/80 text-lg font-serif italic mb-3">
                            “{data.tagline}”
                          </div>
                        )}
                        <p className="text-zinc-200 text-base md:text-lg leading-relaxed text-justify whitespace-pre-line">
                          {data.overview || 'No hay descripción disponible.'}
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* 2. DETALLES */}
                  {activeTab === 'details' && (
                    <motion.div
                      key="details"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      {/* MÓVIL: flex-col (vertical) -> Ocupan todo el ancho, no se cortan.
             DESKTOP (lg): flex-row + flex-nowrap (horizontal) -> Una sola línea optimizada.
          */}
                      <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">

                        <VisualMetaCard
                          icon={type === 'movie' ? FilmIcon : MonitorPlay}
                          label="Título Original"
                          value={type === 'movie' ? data.original_title : data.original_name}
                          expanded={true} // Permite 2 líneas y ancho extra en desktop
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />

                        <VisualMetaCard
                          icon={MapPin}
                          label="País"
                          value={countries || '—'}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />

                        <VisualMetaCard
                          icon={Languages}
                          label="Idiomas"
                          value={languages || '—'}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />

                        <VisualMetaCard
                          icon={CalendarIcon}
                          label={type === 'movie' ? 'Estreno' : 'Inicio'}
                          value={releaseDateValue || '—'}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />

                      </div>
                    </motion.div>
                  )}

                  {/* 3. PRODUCCIÓN Y EQUIPO */}
                  {activeTab === 'production' && (
                    <motion.div
                      key="production"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      {/* Mismo formato: Vertical en móvil, Horizontal en Desktop */}
                      <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">

                        {/* 1. Director / Creadores */}
                        <VisualMetaCard
                          icon={Users}
                          label={type === 'movie' ? 'Director' : 'Creadores'}
                          value={movieDirector || createdByNames || 'Desconocido'}
                          expanded={true}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />

                        {/* 2. Presupuesto (Cine) o Fecha Fin (TV) */}
                        {type === 'movie' ? (
                          <VisualMetaCard
                            icon={BadgeDollarSignIcon}
                            label="Presupuesto"
                            value={budgetValue || '—'}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />
                        ) : (
                          <VisualMetaCard
                            icon={CalendarIcon}
                            label={data.status === 'Ended' ? 'Finalización' : 'Última emisión'}
                            value={lastAirDateValue || 'En emisión'}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />
                        )}

                        {/* 3. Recaudación (Cine) o Formato (TV) */}
                        {type === 'movie' ? (
                          <VisualMetaCard
                            icon={TrendingUp}
                            label="Recaudación"
                            value={revenueValue || '—'}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />
                        ) : (
                          <VisualMetaCard
                            icon={Layers}
                            label="Formato"
                            value={data.number_of_seasons ? `${data.number_of_seasons} Temp. / ${data.number_of_episodes} Caps.` : '—'}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />
                        )}

                        {/* 4. Producción / Canal */}
                        <VisualMetaCard
                          icon={Building2}
                          label={network ? 'Canal' : 'Producción'}
                          value={network || production || '—'}
                          expanded={true} // Vital para que no se recorte lateralmente
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />

                      </div>
                    </motion.div>
                  )}

                  {/* 4. PREMIOS */}
                  {activeTab === 'awards' && extras.awards && (
                    <motion.div
                      key="awards"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="relative overflow-hidden rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-transparent p-6">
                        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full pointer-events-none" />

                        <div className="flex items-start gap-4 relative z-10">
                          <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500 shrink-0">
                            <Trophy className="w-8 h-8" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-white mb-2">Reconocimientos</h3>
                            <p className="text-base font-medium text-yellow-100/90 leading-relaxed whitespace-pre-line">
                              {extras.awards}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* ===================================================== */}
        {/* ✅ MENÚ GLOBAL + CONTENIDO (tipo ActorDetails) */}
        <div className="mt-10">
          <DetailsSectionMenu
            items={sectionItems}
            activeId={activeSection}
            onChange={handleSectionChange}
            columns={type === 'tv' ? 5 : 4}
          />

          <div className="mt-6 min-w-0">
            <AnimatePresence mode="sync" initial={false}>

              {/* ===== INFO (aquí pegas tu bloque de tabs: detalles/producción/sinopsis/premios) ===== */}
              {activeSection === 'info' && (
                <motion.div
                  key="info"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.12 }}
                >
                </motion.div>
              )}

              {/* ===== EPISODIOS ===== */}
              {activeSection === 'episodes' && (
                <motion.div
                  key="episodes"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {type === 'tv' ? (
                    <section className="mb-10">
                      <SectionTitle title="Valoración de Episodios" icon={TrendingUp} />
                      <div className="p-2">
                        {ratingsLoading && (
                          <p className="text-sm text-gray-300 mb-2">Cargando ratings…</p>
                        )}
                        {ratingsError && (
                          <p className="text-sm text-red-400 mb-2">{ratingsError}</p>
                        )}
                        {!ratingsLoading && !ratingsError && !ratings && (
                          <p className="text-sm text-zinc-400 mb-2">No hay datos de episodios disponibles.</p>
                        )}
                        {!!ratings && !ratingsError && (
                          <EpisodeRatingsGrid
                            ratings={ratings}
                            initialSource="avg"
                            density="compact"
                            traktConnected={trakt.connected}
                            watchedBySeason={watchedBySeason}
                            episodeBusyKey={episodeBusyKey}
                            onToggleEpisodeWatched={toggleEpisodeWatched}
                          />
                        )}
                      </div>
                    </section>
                  ) : (
                    <div className="text-sm text-zinc-400">Esta sección solo aplica a series.</div>
                  )}
                </motion.div>
              )}

              {/* ===== IMÁGENES ===== */}
              {activeSection === 'media' && (
                <motion.div
                  key="media"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* ✅ PORTADAS Y FONDOS */}
                  {(type === 'movie' || type === 'tv') && (
                    <section className="mb-10">
                      <SectionTitle title="Portadas y fondos" icon={ImageIcon} />

                      {/* Barra superior: tabs + filtros + reset (alineado correctamente) */}
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div className="flex flex-wrap items-end gap-4">
                          {/* Tabs */}
                          <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 w-fit">
                            {['posters', 'backdrops', 'background'].map((tab) => (
                              <button
                                key={tab}
                                type="button"
                                onClick={() => setActiveImagesTab(tab)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${activeImagesTab === tab ? 'bg-white/10 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'}
              `}
                              >
                                {tab === 'posters' ? 'Portada' : tab === 'backdrops' ? 'Vista previa' : 'Fondo'}
                              </button>
                            ))}
                          </div>

                          {/* Filtros */}
                          <div className="flex flex-wrap items-end gap-3">
                            {/* Resolución (siempre visible) */}
                            <div ref={resMenuRef} className="relative">
                              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                                Resolución
                              </div>

                              <button
                                type="button"
                                onClick={() => setResMenuOpen((v) => !v)}
                                className="inline-flex items-center justify-between gap-2 min-w-[140px]
                px-3 py-2 rounded-xl bg-black/35 border border-white/10
                hover:bg-black/45 hover:border-white/15 transition text-sm text-zinc-200"
                              >
                                <span className="font-semibold">
                                  {imagesResFilter === 'all'
                                    ? 'Todas'
                                    : imagesResFilter === '720p'
                                      ? '720p'
                                      : imagesResFilter === '1080p'
                                        ? '1080p'
                                        : imagesResFilter === '2k'
                                          ? '2K'
                                          : '4K'}
                                </span>
                                <ChevronDown className={`w-4 h-4 transition-transform ${resMenuOpen ? 'rotate-180' : ''}`} />
                              </button>

                              <AnimatePresence>
                                {resMenuOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                                    transition={{ duration: 0.14, ease: 'easeOut' }}
                                    className="absolute left-0 top-full z-[9999] mt-2 w-44 rounded-2xl
                    border border-white/10 bg-[#101010]/95 shadow-2xl overflow-hidden backdrop-blur"
                                  >
                                    <div className="py-1">
                                      {[
                                        { id: 'all', label: 'Todas' },
                                        { id: '720p', label: '720p' },
                                        { id: '1080p', label: '1080p' },
                                        { id: '2k', label: '2K' },
                                        { id: '4k', label: '4K' }
                                      ].map((opt) => {
                                        const active = imagesResFilter === opt.id
                                        return (
                                          <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => {
                                              setImagesResFilter(opt.id)
                                              setResMenuOpen(false)
                                            }}
                                            className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between
                            transition ${active ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5'}`}
                                          >
                                            <span className="font-semibold">{opt.label}</span>
                                            {active && <Check className="w-4 h-4 text-emerald-300" />}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>

                            {/* Idioma (solo en Portada y Vista previa) */}
                            {activeImagesTab !== 'background' && (
                              <div>
                                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                                  Idioma
                                </div>
                                <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 w-fit">
                                  <button
                                    type="button"
                                    onClick={() => setLangES((v) => !v)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                    ${langES ? 'bg-white/10 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
                                  >
                                    ES
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setLangEN((v) => !v)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                    ${langEN ? 'bg-white/10 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
                                  >
                                    EN
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Reset */}
                        <button
                          type="button"
                          onClick={handleResetArtwork}
                          className="inline-flex items-center justify-center w-10 h-10 rounded-xl
          border border-red-500/30 bg-red-500/10 text-red-400
          hover:text-red-300 hover:bg-red-500/15 hover:border-red-500/45 transition"
                          title="Restaurar valores por defecto"
                          aria-label="Restaurar valores por defecto"
                        >
                          <RotateCcw className="w-5 h-5" />
                        </button>
                      </div>

                      {imagesLoading && (
                        <div className="text-sm text-zinc-400 inline-flex items-center gap-2 mb-3">
                          <Loader2 className="w-4 h-4 animate-spin" /> Cargando imágenes…
                        </div>
                      )}
                      {!!imagesError && <div className="text-sm text-red-400 mb-3">{imagesError}</div>}

                      {(() => {
                        const rawList = activeImagesTab === 'posters' ? imagesState.posters : imagesState.backdrops

                        const isPoster = activeImagesTab === 'posters'
                        const aspect = isPoster ? 'aspect-[2/3]' : 'aspect-[16/9]'
                        const size = isPoster ? 'w342' : 'w780'

                        // ✅ Activas separadas (fix: Vista previa ya NO marca el fondo)
                        const currentPosterActive =
                          (selectedPosterPath || basePosterPath || data.poster_path || data.profile_path) ?? null

                        // ✅ si hay un selectedPreviewBackdropPath guardado pero NO es ES/EN, lo ignoramos
                        const selectedPreviewObj = selectedPreviewBackdropPath
                          ? (imagesState.backdrops || []).find((b) => b?.file_path === selectedPreviewBackdropPath)
                          : null

                        const selectedPreviewLang = (selectedPreviewObj?.iso_639_1 || '').toLowerCase()
                        const selectedPreviewValid =
                          !selectedPreviewObj || selectedPreviewLang === 'es' || selectedPreviewLang === 'en'

                        const previewFallback =
                          pickBestBackdropByLangResVotes(imagesState.backdrops)?.file_path ||
                          data.backdrop_path ||
                          null

                        const currentPreviewActive =
                          selectedPreviewBackdropPath || previewFallback

                        const currentBackgroundActive =
                          (selectedBackgroundPath || baseBackdropPath || data.backdrop_path) ?? null

                        const activePath =
                          activeImagesTab === 'posters'
                            ? currentPosterActive
                            : activeImagesTab === 'backdrops'
                              ? currentPreviewActive
                              : currentBackgroundActive

                        const filtered = (rawList || []).filter((img) => {
                          const fp = img?.file_path
                          if (!fp) return false

                          // ✅ Siempre mostramos la activa aunque los filtros no coincidan (para no “perder” el check)
                          if (fp === activePath) return true

                          // Resolución
                          if (imagesResFilter !== 'all') {
                            const b = imgResBucket(img)
                            const target = imagesResFilter === '2k' ? '2k' : imagesResFilter
                            if (b !== target) return false
                          }

                          if (activeImagesTab === 'background') {
                            // Fondo: solo sin idioma
                            return !img?.iso_639_1
                          }

                          // Portada / Vista previa: solo ES/EN según toggles
                          const lang = (img?.iso_639_1 || '').toLowerCase()
                          if (!lang) return false
                          const okES = lang === 'es' && langES
                          const okEN = lang === 'en' && langEN
                          return okES || okEN
                        })

                        const ordered = (() => {
                          const idx = (filtered || []).findIndex((x) => x?.file_path === activePath)
                          if (idx <= 0) return filtered
                          return [filtered[idx], ...filtered.slice(0, idx), ...filtered.slice(idx + 1)]
                        })()

                        if (!Array.isArray(filtered) || filtered.length === 0) {
                          return (
                            <div className="text-sm text-zinc-400">
                              No hay imágenes disponibles con los filtros actuales.
                            </div>
                          )
                        }

                        return (
                          // ✅ Limita overflow lateral sin cortar la animación vertical
                          <div className="relative overflow-x-hidden overflow-y-visible">
                            {/* padding lateral: evita que 1ª/última “muerdan” el borde */}
                            <div className="px-2 sm:px-3">
                              <Swiper
                                key={activeImagesTab}
                                spaceBetween={12}
                                slidesPerView={isPoster ? 3 : 1}
                                breakpoints={
                                  isPoster
                                    ? {
                                      640: { slidesPerView: 4, spaceBetween: 14 },
                                      768: { slidesPerView: 5, spaceBetween: 16 },
                                      1024: { slidesPerView: 6, spaceBetween: 18 },
                                      1280: { slidesPerView: 7, spaceBetween: 18 }
                                    }
                                    : {
                                      640: { slidesPerView: 2, spaceBetween: 14 },
                                      768: { slidesPerView: 3, spaceBetween: 16 },
                                      1024: { slidesPerView: 4, spaceBetween: 18 },
                                      1280: { slidesPerView: 4, spaceBetween: 18 }
                                    }
                                }
                                className="pb-8"
                              >
                                {ordered.map((img, idx) => {
                                  const filePath = img?.file_path
                                  if (!filePath) return null

                                  const isActive = activePath === filePath
                                  const resText = imgResLabel(img)

                                  return (
                                    <SwiperSlide key={filePath} className="h-full pt-3 pb-3">
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => {
                                          if (activeImagesTab === 'posters') handleSelectPoster(filePath)
                                          else if (activeImagesTab === 'backdrops') handleSelectPreviewBackdrop(filePath)
                                          else handleSelectBackground(filePath)
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            if (activeImagesTab === 'posters') handleSelectPoster(filePath)
                                            else if (activeImagesTab === 'backdrops') handleSelectPreviewBackdrop(filePath)
                                            else handleSelectBackground(filePath)
                                          }
                                        }}
                                        className={`group relative w-full rounded-2xl overflow-hidden border cursor-pointer
                        transition-all duration-300 transform-gpu hover:-translate-y-1
                        ${isActive
                                            ? 'border-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.28)]'
                                            : 'border-white/10 bg-black/25 hover:bg-black/35 hover:border-yellow-500/30'
                                          }`}
                                        title="Seleccionar"
                                      >
                                        <div className={`w-full ${aspect} bg-black/40`}>
                                          <img
                                            src={`https://image.tmdb.org/t/p/${size}${filePath}`}
                                            alt="option"
                                            loading="lazy"
                                            decoding="async"
                                            // ✅ Solo escala la imagen (no el card) -> no recorta laterales en bordes
                                            className="w-full h-full object-cover transition-transform duration-700 transform-gpu
                            group-hover:scale-[1.08]"
                                          />
                                        </div>

                                        {isActive && (
                                          <div className="absolute top-2 right-2 w-3 h-3 bg-emerald-500 rounded-full shadow shadow-black" />
                                        )}

                                        {/* ✅ SOLO RESOLUCIÓN al hover */}
                                        {resText && (
                                          <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[10px] font-bold tracking-wide px-2 py-1 rounded-full
                            bg-black/70 border border-white/15 text-zinc-100">
                                              {resText}
                                            </span>
                                          </div>
                                        )}

                                        {/* copiar URL (hover) */}
                                        <div
                                          role="button"
                                          tabIndex={0}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleCopyImageUrl(filePath)
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              handleCopyImageUrl(filePath)
                                            }
                                          }}
                                          className="absolute bottom-2 right-2 p-1.5 bg-black/60 rounded-lg text-white
                          opacity-0 group-hover:opacity-100 hover:bg-black transition-opacity"
                                          title="Copiar URL"
                                        >
                                          <LinkIcon size={14} />
                                        </div>
                                      </div>
                                    </SwiperSlide>
                                  )
                                })}
                              </Swiper>
                            </div>
                          </div>
                        )
                      })()}
                    </section>
                  )}

                  {/* === TRÁILER Y VÍDEOS === */}
                  {TMDB_API_KEY && (
                    <section className="mt-6">
                      <SectionTitle title="Tráiler y vídeos" icon={MonitorPlay} />

                      <div className="rounded-2xl p-0 mb-10">
                        {videosLoading && (
                          <div className="text-sm text-zinc-400 inline-flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Cargando vídeos…
                          </div>
                        )}

                        {!!videosError && <div className="text-sm text-red-400">{videosError}</div>}

                        {!videosLoading && !videosError && videos.length === 0 && (
                          <div className="text-sm text-zinc-400">
                            No hay tráileres o vídeos disponibles en TMDb para este título.
                          </div>
                        )}

                        {videos.length > 0 && (
                          <Swiper
                            spaceBetween={12}
                            slidesPerView={2}
                            breakpoints={{
                              640: { slidesPerView: 2, spaceBetween: 16 },
                              768: { slidesPerView: 3, spaceBetween: 16 },
                              1024: { slidesPerView: 4, spaceBetween: 16 },
                              1280: { slidesPerView: 4, spaceBetween: 16 }
                            }}
                            className="pb-2"
                          >
                            {videos.slice(0, 20).map((v) => {
                              const thumb = videoThumbUrl(v)
                              const fallbackPath = displayBackdropPath || displayPosterPath
                              const fallback = fallbackPath
                                ? `https://image.tmdb.org/t/p/w780${fallbackPath}`
                                : '/placeholder.png'

                              return (
                                <SwiperSlide key={`${v.site}:${v.key}`} className="h-full">
                                  <button
                                    type="button"
                                    onClick={() => openVideo(v)}
                                    title={v.name || 'Ver vídeo'}
                                    className="w-full h-full text-left flex flex-col rounded-2xl overflow-hidden
                            border border-white/10 bg-black/25 hover:bg-black/35 hover:border-yellow-500/30 transition"
                                  >
                                    <div className="relative aspect-video overflow-hidden">
                                      <img
                                        src={thumb || fallback}
                                        alt={v.name || 'Video'}
                                        className="w-full h-full object-cover transform-gpu transition-transform duration-500 hover:scale-[1.05]"
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-14 h-14 rounded-full bg-black/55 border border-white/15 flex items-center justify-center transition-transform hover:scale-105">
                                          <Play className="w-7 h-7 text-yellow-300 translate-x-[1px]" />
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex flex-col flex-1 p-4 items-start">
                                      {/* ✅ Título arriba (1 línea siempre) */}
                                      <div className="w-full min-h-[22px]">
                                        <div className="font-bold text-white leading-snug text-sm sm:text-[16px] line-clamp-1 truncate">
                                          {v.name || 'Vídeo'}
                                        </div>
                                      </div>

                                      {/* ✅ Propiedades debajo, alineadas a la izquierda */}
                                      <div className="mt-3 flex flex-wrap items-center gap-1.5 ml-[-4px]">
                                        {v.type && (
                                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-200">
                                            {v.type}
                                          </span>
                                        )}
                                        {v.iso_639_1 && (
                                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-200">
                                            {v.iso_639_1.toUpperCase()}
                                          </span>
                                        )}
                                        {v.official && (
                                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-200">
                                            Official
                                          </span>
                                        )}
                                      </div>

                                      {/* ✅ Fuente y fecha abajo, mismo margen izquierdo */}
                                      <div className="mt-auto pt-3 text-xs text-zinc-400 flex items-center gap-2">
                                        <span className="font-semibold text-zinc-200">{v.site || '—'}</span>
                                        {v.published_at && (
                                          <>
                                            <span className="text-zinc-600">·</span>
                                            <span className="shrink-0">
                                              {new Date(v.published_at).toLocaleDateString('es-ES')}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                </SwiperSlide>
                              )
                            })}
                          </Swiper>
                        )}
                      </div>
                    </section>
                  )}
                </motion.div>
              )}

              {/* ===== SENTIMIENTOS ===== */}
              {activeSection === 'sentiment' && (
                <motion.div
                  key="sentiment"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* ===================================================== */}
                  {/* ✅ TRAKT: SENTIMIENTOS (AI SUMMARY) */}
                  <section className="mb-12">
                    <SectionTitle title="Análisis de Sentimientos" icon={Sparkles} />

                    <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-black/40 backdrop-blur-sm shadow-2xl">
                      {/* Header del bloque */}
                      <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-inner">
                            <img src="/logo-Trakt.png" alt="Trakt" className="h-full w-full object-cover" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold leading-tight text-white">Trakt Community Pulse</h3>
                            <p className="text-xs font-medium text-zinc-400">
                              Resumen por IA basado en comentarios sobre <span className="text-zinc-200">{title}</span>
                            </p>
                          </div>
                        </div>
                        {tSentiment.loading && <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />}
                      </div>

                      <div className="p-6">
                        {tSentiment.error ? (
                          <div className="rounded-xl bg-red-500/10 p-4 text-center text-sm font-medium text-red-400 border border-red-500/20">
                            {tSentiment.error}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            {/* Columna Positiva */}
                            <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/10 to-transparent p-5">
                              <div className="mb-4 flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                                  <ThumbsUp className="h-4 w-4" />
                                </div>
                                <span className="font-bold tracking-wide text-emerald-100">Lo Bueno</span>
                              </div>

                              {tSentiment.pros?.length ? (
                                <ul className="space-y-3">
                                  {tSentiment.pros.map((s, i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300">
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                                      <span>{s}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="text-sm italic text-zinc-500">No hay suficientes datos positivos.</div>
                              )}
                            </div>

                            {/* Columna Negativa */}
                            <div className="relative overflow-hidden rounded-2xl border border-rose-500/20 bg-gradient-to-b from-rose-500/10 to-transparent p-5">
                              <div className="mb-4 flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white shadow-lg shadow-rose-500/20">
                                  <ThumbsDown className="h-4 w-4" />
                                </div>
                                <span className="font-bold tracking-wide text-rose-100">Lo Malo</span>
                              </div>

                              {tSentiment.cons?.length ? (
                                <ul className="space-y-3">
                                  {tSentiment.cons.map((s, i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300">
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]" />
                                      <span>{s}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="text-sm italic text-zinc-500">No hay suficientes datos negativos.</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </motion.div>
              )}

              {/* ===== COMENTARIOS ===== */}
              {activeSection === 'comments' && (
                <motion.div
                  key="comments"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* CRÍTICAS */}
                  {reviews && reviews.length > 0 && (
                    <section className="mb-10">
                      <div className="flex items-center justify-between mb-2">
                        <SectionTitle title="Críticas de Usuarios" icon={MessageSquareIcon} />
                        {reviewLimit < reviews.length && (
                          <button
                            onClick={() => setReviewLimit((prev) => prev + 2)}
                            className="text-sm text-yellow-500 hover:text-yellow-400 font-semibold uppercase tracking-wide"
                          >
                            Ver más
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {reviews.slice(0, reviewLimit).map((r) => {
                          const avatar = r.author_details?.avatar_path
                            ? r.author_details.avatar_path.startsWith('/https')
                              ? r.author_details.avatar_path.slice(1)
                              : `https://image.tmdb.org/t/p/w185${r.author_details.avatar_path}`
                            : `https://ui-avatars.com/api/?name=${r.author}&background=random`

                          return (
                            <div
                              key={r.id}
                              className="bg-neutral-800/40 p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-colors flex flex-col gap-4"
                            >
                              <div className="flex items-center gap-4">
                                <img
                                  src={avatar}
                                  alt={r.author}
                                  className="w-12 h-12 rounded-full object-cover shadow-lg"
                                />
                                <div>
                                  <h4 className="font-bold text-white">{r.author}</h4>
                                  <div className="flex items-center gap-2 text-xs text-gray-400">
                                    <span>{new Date(r.created_at).toLocaleDateString()}</span>
                                    {r.author_details?.rating && (
                                      <span className="text-yellow-500 bg-yellow-500/10 px-2 rounded font-bold">
                                        ★ {r.author_details.rating}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="text-gray-300 text-sm leading-relaxed line-clamp-4 italic">
                                "{r.content.replace(/<[^>]*>?/gm, '')}"
                              </div>

                              <a
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 text-xs font-semibold hover:underline mt-auto self-start"
                              >
                                Leer review completa en TMDb &rarr;
                              </a>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )}
                  {/* ===================================================== */}
                  {/* ✅ TRAKT: COMENTARIOS */}
                  <section className="mb-12">
                    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                      <SectionTitle title="Comentarios" icon={MessageSquareIcon} />

                      <div className="flex items-center gap-2">
                        <a
                          href={trakt?.traktUrl ? `${trakt.traktUrl}/comments` : `https://trakt.tv/search?query=${encodeURIComponent(title)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 transition hover:border-yellow-500/50 hover:bg-yellow-500/10 hover:text-yellow-400"
                        >
                          <span className="hidden sm:inline">Ver en Trakt</span>
                          {tComments.total > 0 && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white">{tComments.total}</span>}
                          <ExternalLink className="h-3 w-3 opacity-50 transition group-hover:opacity-100" />
                        </a>

                        <a
                          href={trakt?.traktUrl ? `${trakt.traktUrl}/comments` : `https://trakt.tv/search?query=${encodeURIComponent(title)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-full bg-white text-black px-4 py-2 text-xs font-bold uppercase tracking-wider transition hover:bg-zinc-200"
                        >
                          <Plus className="h-3 w-3" />
                          <span className="hidden sm:inline">Escribir</span>
                        </a>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/20 backdrop-blur-sm">
                      {/* Filtros estilo Tabs Modernos */}
                      <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-4 py-3">
                        <div className="flex gap-1 rounded-xl bg-black/40 p-1">
                          {[
                            { id: 'likes30', label: 'Top 30 Días' },
                            { id: 'likesAll', label: 'Top Histórico' },
                            { id: 'recent', label: 'Recientes' }
                          ].map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setTCommentsTab(t.id)}
                              className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${tCommentsTab === t.id
                                ? 'bg-zinc-700 text-white shadow-md'
                                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                                }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                        {tComments.loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
                      </div>

                      <div className="space-y-4 p-4 sm:p-6">
                        {tComments.error && <div className="text-center text-sm text-red-400">{tComments.error}</div>}

                        {!tComments.loading && !tComments.error && (tComments.items || []).length === 0 && (
                          <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                            <MessageSquareIcon className="mb-2 h-8 w-8 opacity-20" />
                            <p className="text-sm">Sé el primero en comentar.</p>
                          </div>
                        )}

                        {(tComments.items || []).slice(0, 10).map((c) => {
                          const user = c?.user || {}
                          const avatar = user?.images?.avatar?.full || user?.images?.avatar?.medium || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || user?.username || 'User')}`
                          const text = stripHtml(c?.comment?.comment ?? c?.comment ?? '')
                          const created = c?.created_at ? formatDateTimeEs(c.created_at) : ''
                          const likes = Number(c?.likes || 0)

                          return (
                            <div key={String(c?.id || `${user?.username}-${created}`)} className="group relative flex gap-4 rounded-2xl bg-white/5 p-5 transition hover:bg-white/10">
                              {/* Avatar */}
                              <div className="shrink-0">
                                <img src={avatar} alt={user?.username} className="h-12 w-12 rounded-full object-cover shadow-lg ring-2 ring-white/10 transition group-hover:ring-white/20" />
                              </div>

                              {/* Content */}
                              <div className="min-w-0 flex-1">
                                <div className="mb-1 flex items-baseline justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-white group-hover:text-yellow-400 transition-colors cursor-pointer">
                                      {user?.name || user?.username || 'Usuario'}
                                    </span>
                                    {user?.vip && <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-500">VIP</span>}
                                  </div>
                                  <span className="text-xs text-zinc-500">{created}</span>
                                </div>

                                <div className="relative text-sm leading-relaxed text-zinc-300">
                                  {/* Icono de comillas decorativo */}
                                  <span className="absolute -left-3 -top-1 font-serif text-4xl text-white/5">“</span>
                                  <p className="whitespace-pre-line">{text}</p>
                                </div>

                                {/* Actions Footer */}
                                <div className="mt-3 flex items-center gap-4 border-t border-white/5 pt-3">
                                  <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-1 text-xs font-medium text-emerald-400">
                                    <ThumbsUp className="h-3 w-3" /> {likes}
                                  </div>
                                  <a
                                    href={trakt?.traktUrl ? `${trakt.traktUrl}/comments` : undefined}
                                    target="_blank" rel="noreferrer"
                                    className="ml-auto text-xs font-semibold text-zinc-500 hover:text-white transition-colors"
                                  >
                                    Responder en Trakt →
                                  </a>
                                </div>
                              </div>
                            </div>
                          )
                        })}

                        {tComments.hasMore && (
                          <button
                            type="button"
                            onClick={() => setTComments((p) => ({ ...p, page: (p.page || 1) + 1 }))}
                            className="w-full rounded-xl border border-dashed border-white/10 py-4 text-xs font-bold uppercase tracking-widest text-zinc-400 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                          >
                            Cargar más comentarios
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                </motion.div>
              )}

              {/* ===== TEMPORADAS ===== */}
              {activeSection === 'seasons' && (
                <motion.div
                  key="seasons"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* ===================================================== */}
                  {/* ✅ TRAKT: TEMPORADAS (Con Progreso Visual) */}
                  {type === 'tv' && (
                    <section className="mb-12">
                      <SectionTitle title="Temporadas" icon={Layers} />

                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {tSeasons.loading && <div className="col-span-full py-10 flex justify-center"><Loader2 className="animate-spin text-white/50" /></div>}

                        {!tSeasons.loading && (tSeasons.items || []).map((s) => {
                          const sn = Number(s?.number)
                          const titleSeason = sn === 0 ? 'Especiales' : `Temporada ${sn}`
                          const rating = typeof s?.rating === 'number' ? s.rating : null

                          // Lógica de progreso
                          const tmdbSeason = (data?.seasons || []).find((x) => Number(x?.season_number) === sn)
                          const totalEp = Number(tmdbSeason?.episode_count || 0) || null
                          const watchedEp = Array.isArray(watchedBySeason?.[sn]) ? watchedBySeason[sn].length : 0
                          const percentage = totalEp ? Math.round((watchedEp / totalEp) * 100) : 0

                          // Color basado en progreso
                          const isComplete = percentage === 100
                          const barColor = isComplete ? 'bg-emerald-500' : 'bg-yellow-500'

                          return (
                            <div key={sn} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-all hover:-translate-y-1 hover:border-white/20 hover:bg-white/10 hover:shadow-xl">
                              {/* Fondo decorativo del número de temporada */}
                              <div className="absolute -right-4 -top-6 text-[100px] font-black text-white/5 select-none transition group-hover:text-white/10">
                                {sn}
                              </div>

                              <div className="relative p-5">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <h4 className="text-lg font-extrabold text-white">{titleSeason}</h4>
                                    <div className="mt-1 flex items-center gap-2 text-xs font-medium text-zinc-400">
                                      {rating && (
                                        <span className="flex items-center gap-1 text-yellow-400">
                                          <Star className="h-3 w-3 fill-yellow-400" /> {rating.toFixed(1)}
                                        </span>
                                      )}
                                      {totalEp && <span>• {totalEp} episodios</span>}
                                    </div>
                                  </div>

                                  {trakt?.traktUrl && (
                                    <a
                                      href={`${trakt.traktUrl}/seasons/${sn}`}
                                      target="_blank" rel="noreferrer"
                                      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-zinc-400 transition hover:bg-white hover:text-black"
                                      title="Ver en Trakt"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  )}
                                </div>

                                {/* Barra de Progreso */}
                                {totalEp !== null && (
                                  <div className="mt-6">
                                    <div className="mb-1.5 flex items-end justify-between text-xs font-bold">
                                      <span className={percentage > 0 ? 'text-white' : 'text-zinc-500'}>
                                        {watchedEp} <span className="text-zinc-500 font-normal">vistos</span>
                                      </span>
                                      <span className="text-zinc-500">{percentage}%</span>
                                    </div>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                      <div
                                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                        style={{ width: `${percentage}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )}
                </motion.div>
              )}

              {/* ===== LISTAS ===== */}
              {activeSection === 'lists' && (
                <motion.div
                  key="lists"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* ===================================================== */}
                  {/* ✅ TRAKT: LISTAS (DISEÑO MEJORADO) */}
                  <section className="mb-12">
                    <div className="mb-6 flex items-center justify-between">
                      <SectionTitle title="Listas Populares" icon={ListVideo} />

                      {/* Selector de Listas */}
                      <div className="flex rounded-lg bg-white/5 p-1 border border-white/10 backdrop-blur-md">
                        {['popular', 'trending'].map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setTListsTab(tab)}
                            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all rounded-md ${tListsTab === tab
                              ? 'bg-white text-black shadow-lg scale-105'
                              : 'text-zinc-400 hover:text-white hover:bg-white/5'
                              }`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                      {tLists.loading && (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-500 gap-3">
                          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                          <span className="text-sm font-medium animate-pulse">Buscando listas y portadas...</span>
                        </div>
                      )}

                      {!tLists.loading &&
                        (tLists.items || []).map((row) => {
                          const list = row?.list || row || {}
                          const user = row?.user || list?.user || {}
                          const previews = row?.previewPosters || [] // Las imágenes que trae la API nueva

                          const name = list?.name || 'Lista'
                          const itemCount = Number(list?.item_count || list?.items || 0)
                          const likes = Number(list?.likes || 0)
                          const username = user?.username || user?.name
                          const slug = list?.ids?.slug || list?.ids?.trakt
                          const url = username && slug ? `https://trakt.tv/users/${username}/lists/${slug}` : null
                          const avatar = user?.images?.avatar?.full || `https://ui-avatars.com/api/?name=${username}&background=random`

                          return (
                            <a
                              key={String(list?.ids?.trakt || name)}
                              href={url || '#'}
                              target={url ? '_blank' : undefined}
                              rel="noreferrer"
                              className={`group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/40 backdrop-blur-sm transition-all duration-500 hover:border-indigo-500/30 hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)] ${!url && 'pointer-events-none'
                                }`}
                            >
                              {/* 1. SECCIÓN VISUAL (PORTADAS APILADAS CON HUECO EN HOVER) */}
                              <div className="relative h-52 w-full bg-gradient-to-b from-white/5 to-transparent p-6 overflow-visible">
                                {previews.length > 0 ? (
                                  <div className="h-full w-full flex items-center justify-center overflow-visible">
                                    <PosterStack posters={previews} />
                                  </div>
                                ) : (
                                  <div className="flex h-full items-center justify-center opacity-10">
                                    <ListVideo className="h-20 w-20" />
                                  </div>
                                )}
                              </div>

                              {/* 2. CONTENIDO DE TEXTO */}
                              <div className="relative flex flex-1 flex-col justify-between bg-black/20 p-5 backdrop-blur-md">
                                <div>
                                  <h4 className="line-clamp-1 text-lg font-bold text-white transition-colors group-hover:text-indigo-400">
                                    {name}
                                  </h4>

                                  {list?.description && (
                                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                                      {stripHtml(list.description)}
                                    </p>
                                  )}
                                </div>

                                {/* Footer de la tarjeta */}
                                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                                  <div className="flex items-center gap-2">
                                    <img src={avatar} alt={username} className="h-6 w-6 rounded-full ring-1 ring-white/20" />
                                    <span className="text-xs font-medium text-zinc-300 group-hover:text-white truncate max-w-[100px]">
                                      {username}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-3 text-xs font-bold text-zinc-500">
                                    <span className="flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-zinc-300">
                                      {itemCount} items
                                    </span>
                                    <span className="flex items-center gap-1 transition-colors group-hover:text-pink-500">
                                      <ThumbsUp className="h-3 w-3" /> {likes}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </a>
                          )
                        })}
                    </div>

                    {tLists.hasMore && (
                      <div className="mt-8 flex justify-center">
                        <button
                          onClick={() => setTLists((p) => ({ ...p, page: (p.page || 1) + 1 }))}
                          className="group relative inline-flex items-center justify-center overflow-hidden rounded-full p-0.5 font-bold focus:outline-none"
                        >
                          <span className="absolute h-full w-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></span>
                          <span className="relative flex items-center gap-2 rounded-full bg-black px-6 py-2.5 transition-all duration-300 group-hover:bg-opacity-0">
                            <span className="bg-gradient-to-r from-indigo-200 to-white bg-clip-text text-transparent group-hover:text-white">
                              Cargar más listas
                            </span>
                            <ChevronDown className="h-4 w-4 text-indigo-300 group-hover:text-white" />
                          </span>
                        </button>
                      </div>
                    )}
                  </section>
                </motion.div>
              )}

              {/* ===== REPARTO ===== */}
              {activeSection === 'cast' && (
                <motion.div
                  key="cast"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* === REPARTO PRINCIPAL (Cast) === */}
                  {castData && castData.length > 0 && (
                    <section className="mb-16">
                      <SectionTitle title="Reparto Principal" icon={Users} />
                      <Swiper
                        spaceBetween={12}
                        slidesPerView={3}
                        breakpoints={{
                          500: { slidesPerView: 3, spaceBetween: 14 },
                          768: { slidesPerView: 4, spaceBetween: 16 },
                          1024: { slidesPerView: 5, spaceBetween: 18 },
                          1280: { slidesPerView: 6, spaceBetween: 20 }
                        }}
                        className="pb-8"
                      >
                        {castData.slice(0, 20).map((actor) => (
                          <SwiperSlide key={actor.id}>
                            <a
                              href={`/details/person/${actor.id}`}
                              className="mt-3 block group relative bg-neutral-800/80 rounded-xl overflow-hidden shadow-lg border border-transparent hover:border-yellow-500/60 hover:shadow-2xl hover:shadow-yellow-500/25 transition-all duration-300 transform-gpu hover:-translate-y-1"
                            >
                              <div className="aspect-[2/3] overflow-hidden relative">
                                {actor.profile_path ? (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w342${actor.profile_path}`}
                                    alt={actor.name}
                                    className="w-full h-full object-cover transition-transform duration-500 transform-gpu group-hover:scale-[1.10] group-hover:-translate-y-1 group-hover:rotate-[0.4deg] group-hover:grayscale-0 grayscale-[18%]"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500">
                                    <UsersIconComponent size={40} />
                                  </div>
                                )}

                                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-75 group-hover:opacity-90 transition-opacity duration-300" />

                                <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3">
                                  <p className="text-white font-extrabold text-[11px] sm:text-sm leading-tight line-clamp-1">
                                    {actor.name}
                                  </p>
                                  <p className="text-gray-300 text-[10px] sm:text-xs leading-tight line-clamp-1">
                                    {actor.character}
                                  </p>
                                </div>
                              </div>
                            </a>
                          </SwiperSlide>
                        ))}
                      </Swiper>
                    </section>
                  )}
                </motion.div>
              )}

              {/* ===== RECOMENDACIONES ===== */}
              {activeSection === 'recs' && (
                <motion.div
                  key="recs"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* === RECOMENDACIONES === */}
                  {recommendations && recommendations.length > 0 && (
                    <section className="mb-16">
                      <SectionTitle title="Recomendaciones" icon={MonitorPlay} />

                      <Swiper
                        spaceBetween={12}
                        slidesPerView={3}
                        breakpoints={{
                          500: { slidesPerView: 3, spaceBetween: 14 },
                          768: { slidesPerView: 4, spaceBetween: 16 },
                          1024: { slidesPerView: 5, spaceBetween: 18 },
                          1280: { slidesPerView: 6, spaceBetween: 20 }
                        }}
                      >
                        {recommendations.slice(0, 15).map((rec) => {
                          const tmdbScore =
                            typeof rec.vote_average === 'number' && rec.vote_average > 0
                              ? rec.vote_average
                              : null

                          const imdbScore =
                            recImdbRatings[rec.id] != null ? recImdbRatings[rec.id] : undefined

                          return (
                            <SwiperSlide key={rec.id}>
                              <a href={`/details/${rec.media_type || type}/${rec.id}`} className="block group">
                                <div
                                  className="mt-3 relative rounded-xl overflow-hidden cursor-pointer shadow-lg hover:shadow-2xl hover:shadow-yellow-500/25 transition-all duration-300 transform-gpu hover:scale-105 hover:-translate-y-1 bg-black/40 aspect-[2/3]"
                                  onMouseEnter={() => prefetchRecImdb(rec)}  // ✅ SOLO HOVER
                                  onFocus={() => prefetchRecImdb(rec)}       // ✅ accesibilidad
                                >
                                  <img
                                    src={
                                      rec.poster_path
                                        ? `https://image.tmdb.org/t/p/w342${rec.poster_path}`
                                        : '/placeholder.png'
                                    }
                                    alt={rec.title || rec.name}
                                    className="w-full h-full object-cover"
                                  />

                                  <div className="absolute bottom-2 right-2 flex flex-row-reverse items-center gap-1 transform-gpu opacity-0 translate-y-2 translate-x-2 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all duration-300 ease-out">
                                    {tmdbScore && (
                                      <div className="bg-black/85 backdrop-blur-md px-2 py-1 rounded-full border border-emerald-500/60 flex items-center gap-1.5 shadow-xl transform-gpu scale-95 translate-y-1 transition-all duration-300 delay-75 group-hover:scale-110 group-hover:translate-y-0">
                                        <img src="/logo-TMDb.png" alt="TMDb" className="w-auto h-3" />
                                        <span className="text-emerald-400 text-[10px] font-bold font-mono">
                                          {tmdbScore.toFixed(1)}
                                        </span>
                                      </div>
                                    )}

                                    {imdbScore != null && (
                                      <div className="bg-black/85 backdrop-blur-md px-2 py-1 rounded-full border border-yellow-500/60 flex items-center gap-1.5 shadow-xl transform-gpu scale-95 translate-y-1 transition-all duration-300 delay-150 group-hover:scale-110 group-hover:translate-y-0">
                                        <img src="/logo-IMDb.png" alt="IMDb" className="w-auto h-3" />
                                        <span className="text-yellow-400 text-[10px] font-bold font-mono">
                                          {Number(imdbScore).toFixed(1)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </a>
                            </SwiperSlide>
                          )
                        })}
                      </Swiper>
                    </section>
                  )}

                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        {/* ===================================================== */}
      </div>
      {/* ✅ MODAL: Vídeos / Trailer */}
      <VideoModal open={videoModalOpen} onClose={closeVideo} video={activeVideo} />

      <TraktWatchedModal
        open={traktWatchedOpen}
        onClose={() => {
          setTraktWatchedOpen(false)
          setTraktBusy('')
        }}
        title={title}
        connected={trakt.connected}
        found={trakt.found}
        traktUrl={trakt.traktUrl}
        watched={trakt.watched}
        plays={trakt.plays}
        lastWatchedAt={trakt.lastWatchedAt}
        history={trakt.history}
        busyKey={traktBusy}
        onToggleWatched={toggleTraktWatched}
        onAddPlay={handleTraktAddPlay}
        onUpdatePlay={handleTraktUpdatePlay}
        onRemovePlay={handleTraktRemovePlay}
      />

      <TraktEpisodesWatchedModal
        open={traktEpisodesOpen}
        onClose={() => {
          setTraktEpisodesOpen(false)
          setEpisodeBusyKey('')
        }}
        tmdbId={id}
        title={title}
        connected={trakt.connected}
        seasons={data?.seasons || []}
        watchedBySeason={watchedBySeason}
        busyKey={episodeBusyKey}
        onToggleEpisodeWatched={toggleEpisodeWatched}
      />

      {/* ✅ MODAL: Añadir a lista */}
      <AddToListModal
        open={listModalOpen}
        onClose={closeListsModal}
        lists={userLists}
        loading={listsLoading}
        error={listsError}
        query={listQuery}
        setQuery={setListQuery}
        membershipMap={membershipMap}
        busyListId={busyListId}
        onAddToList={handleAddToSpecificList}
        creating={creatingList}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        newName={newListName}
        setNewName={setNewListName}
        newDesc={newListDesc}
        setNewDesc={setNewListDesc}
        onCreateList={handleCreateListAndAdd}
      />
    </div>
  )
}

// Icon helper para el reparto
const UsersIconComponent = ({ size = 24, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)