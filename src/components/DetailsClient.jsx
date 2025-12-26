// src/components/DetailsClient.jsx
'use client'

import { useRef, useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
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
  ListPlus,
  Check,
  X,
  Plus,
  Search,
  RotateCcw,
  Play,
  ExternalLink,
  Eye,
  EyeOff
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
import {
  traktGetItemStatus,
  traktSetWatched,
  traktAddWatchPlay,
  traktUpdateWatchPlay,
  traktRemoveWatchPlay
} from '@/lib/api/traktClient'


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
  const [overviewOpen, setOverviewOpen] = useState(false)

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

    setOverviewOpen(false)

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

  const sendRating = async (value) => {
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
      if (!res.ok) throw new Error('Error al guardar puntuación')
      if (syncTrakt && trakt.connected) {
        // Trakt: 1..10 entero
        await setTraktRatingSafe(value)
      }
    } catch (err) {
      setRatingError(err.message)
    } finally {
      setRatingLoading(false)
    }
  }

  const clearRating = async () => {
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
      if (!res.ok) throw new Error('Error al borrar puntuación')
      if (syncTrakt && trakt.connected) {
        // Trakt: 1..10 entero
        await setTraktRatingSafe(null)
      }
    } catch (err) {
      setRatingError(err.message)
    } finally {
      setRatingLoading(false)
    }
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
      await traktSetRating({ type: traktType, tmdbId: id, rating: valueOrNull })
      setTrakt((p) => ({ ...p, rating: valueOrNull == null ? null : Math.round(valueOrNull) }))
    } finally {
      setTraktBusy('')
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

  const limitedProviders = Array.isArray(providers) ? providers.slice(0, 7) : []

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
        {/* HEADER HERO SECTION */}
        <div className="flex flex-col lg:flex-row gap-10 mb-16 animate-in fade-in duration-700 slide-in-from-bottom-4">
          {/* POSTER */}
          <div className="w-full lg:w-[350px] flex-shrink-0 flex flex-col gap-5">
            <div className="relative group rounded-xl overflow-hidden shadow-2xl shadow-black/60 border border-white/10 bg-black/40 transition-all duration-500 hover:shadow-[0_25px_60px_rgba(0,0,0,0.95)] hover:border-yellow-500/60">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setUseBackdrop((v) => !v)
                }}
                className={`absolute top-3 right-3 z-20 p-2.5 rounded-full backdrop-blur-md border transition-all shadow-lg
                  opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto
                  ${useBackdrop
                    ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200 hover:bg-yellow-500/30'
                    : 'bg-black/40 border-white/20 text-white/80 hover:bg-black/80 hover:text-white'
                  }`}
                title={useBackdrop ? 'Desactivar fondo' : 'Activar fondo'}
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              <div className="relative aspect-[2/3] bg-neutral-900">
                {/* ✅ Skeleton mientras inicializa o mientras carga la imagen */}
                {showPosterSkeleton && (
                  <div className="absolute inset-0 animate-pulse bg-neutral-800/60" />
                )}

                {/* ✅ Imagen (fade-in cuando termina de cargar) */}
                {displayPosterPath && !posterImgError && (
                  <>
                    <img
                      src={`https://image.tmdb.org/t/p/w780${displayPosterPath}`}
                      alt={title}
                      onLoad={() => setPosterImgLoaded(true)}
                      onError={() => {
                        setPosterImgError(true)
                        setPosterImgLoaded(true)
                      }}
                      className={`w-full h-full object-cover transform-gpu transition-all duration-700
          ${posterImgLoaded ? 'opacity-100' : 'opacity-0'}
          group-hover:scale-[1.12] group-hover:-translate-y-1 group-hover:rotate-[0.6deg] group-hover:saturate-150`}
                    />
                    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                  </>
                )}

                {/* ✅ Solo muestra "no hay portada" cuando YA sabemos que no existe */}
                {(showNoPoster || posterImgError) && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ImageOff className="w-12 h-12 text-neutral-700" />
                  </div>
                )}
              </div>
            </div>

            {limitedProviders && limitedProviders.length > 0 && (
              <div className="grid grid-cols-7 gap-2 place-items-center overflow-visible py-1">
                {limitedProviders.map((p) => (
                  <a
                    key={p.provider_id}
                    href={tmdbWatchUrl || '#'}
                    target={tmdbWatchUrl ? '_blank' : undefined}
                    rel={tmdbWatchUrl ? 'noreferrer' : undefined}
                    title={p.provider_name}
                    className="relative overflow-visible hover:z-10"
                  >
                    <img
                      src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                      alt={p.provider_name}
                      className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg object-contain cursor-pointer
                     transform-gpu will-change-transform
                     hover:scale-110 hover:-translate-y-0.5 transition-transform"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* INFO COLUMN */}
          <div className="flex-1 flex flex-col gap-5">
            {/* Título y Acciones */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white leading-tight drop-shadow-lg tracking-tight">
                {title}
                {yearIso && (
                  <span className="text-2xl md:text-2xl font-light text-gray-400 ml-3">
                    ({yearIso})
                  </span>
                )}
              </h1>

              <div className="flex items-center mt-3 gap-3 shrink-0">
                <button
                  onClick={() => openVideo(preferredVideo)}
                  disabled={!preferredVideo}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border transform-gpu
                    ${preferredVideo
                      ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/25 hover:shadow-[0_0_25px_rgba(234,179,8,0.25)]'
                      : 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                    }`}
                  title={preferredVideo ? 'Ver tráiler / vídeo' : 'No hay vídeos disponibles'}
                >
                  <Play className="w-6 h-6" />
                </button>

                <TraktWatchedControl
                  connected={trakt.connected}
                  watched={trakt.watched}
                  plays={trakt.plays}
                  busy={!!traktBusy}
                  onOpen={() => setTraktWatchedOpen(true)}
                />

                <button
                  onClick={toggleFavorite}
                  disabled={favLoading}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border transform-gpu ${favorite
                    ? 'bg-red-500/20 border-red-500 text-red-500 hover:bg-red-500/30 hover:shadow-[0_0_25px_rgba(248,113,113,0.4)]'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:shadow-lg'
                    }`}
                  title="Favorito"
                >
                  {favLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : favorite ? (
                    <Heart className="fill-current w-6 h-6" />
                  ) : (
                    <Heart className="w-6 h-6" />
                  )}
                </button>

                <button
                  onClick={toggleWatchlist}
                  disabled={wlLoading}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border transform-gpu ${watchlist
                    ? 'bg-blue-500/20 border-blue-500 text-blue-400 hover:bg-blue-500/30 hover:shadow-[0_0_25px_rgba(59,130,246,0.4)]'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:shadow-lg'
                    }`}
                  title="Pendiente"
                >
                  {wlLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : watchlist ? (
                    <BookmarkMinus className="fill-current w-6 h-6" />
                  ) : (
                    <BookmarkPlus className="w-6 h-6" />
                  )}
                </button>

                {canUseLists && (
                  <button
                    onClick={openListsModal}
                    disabled={listsPresenceLoading}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border transform-gpu
                      ${inAnyList
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 hover:bg-emerald-500/30 hover:shadow-[0_0_25px_rgba(16,185,129,0.35)]'
                        : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:shadow-lg'
                      }`}
                    title="Añadir a listas"
                  >
                    {listsPresenceLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ListPlus className="w-6 h-6" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Tags / Géneros */}
            <div className="flex flex-wrap gap-2 text-sm font-medium">
              {data.genres?.map((g) => (
                <span
                  key={g.id}
                  className="px-3 py-1 rounded-full bg-white/10 text-gray-200 border border-white/5 hover:bg-white/20 transition-colors cursor-default"
                >
                  {g.name}
                </span>
              ))}
            </div>

            {/* RATINGS BADGES */}
            <div className="py-2 border-y border-white/10">
              {/* ✅ MÓVIL: una sola fila, compacto, sin scroll (oculta Metacritic) */}
              <div className="sm:hidden grid grid-flow-col auto-cols-fr items-center -ml-2 mr-2">
                {/* TMDb */}
                <div className="flex items-center justify-center gap-1 min-w-0">
                  <img src="/logo-TMDb.png" alt="TMDb" className="h-3 w-auto opacity-90" />
                  <span className="text-[13px] font-extrabold text-emerald-400 leading-none">
                    {data.vote_average?.toFixed(1)}
                  </span>
                </div>

                {/* IMDb */}
                {extras.imdbRating && (
                  <div className="flex items-center justify-center gap-1 min-w-0">
                    <img src="/logo-IMDb.png" alt="IMDb" className="h-3.5 w-auto opacity-90" />
                    <span className="text-[13px] font-extrabold text-yellow-400 leading-none">
                      {Number(extras.imdbRating).toFixed(1)}
                    </span>
                  </div>
                )}

                {/* Rotten Tomatoes (✅ se mantiene en móvil) */}
                {extras.rtScore != null && (
                  <div className="flex items-center justify-center gap-1 min-w-0">
                    <img
                      src="/logo-RottenTomatoes.png"
                      alt="Rotten Tomatoes"
                      className="h-3.5 w-auto opacity-90"
                    />
                    <span className="text-[13px] font-extrabold text-rose-300 leading-none">
                      {Math.round(extras.rtScore)}
                    </span>
                  </div>
                )}

                {/* Metacritic (✅ móvil: solo número, sin /100 para que quepa) */}
                {extras.mcScore != null && (
                  <div className="flex items-center justify-center gap-1 min-w-0">
                    <img
                      src="/logo-Metacritic.png"
                      alt="Metacritic"
                      className="h-3.5 w-auto opacity-90"
                    />
                    <span className="text-[13px] font-extrabold text-lime-200 leading-none">
                      {Math.round(extras.mcScore)}
                    </span>
                  </div>
                )}

                {trakt.connected && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTraktWatchedOpen(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-zinc-200
             hover:bg-white/10 transition"
                        title="Ver historial de visionados (Trakt)"
                      >
                        <img src="/logo-Trakt.png" alt="Trakt" className="h-3.5 w-auto opacity-90" />
                        <span className="font-semibold">Trakt</span>

                        <span className={trakt.watched ? 'text-emerald-300' : 'text-zinc-400'}>
                          {trakt.watched ? 'Visto' : 'No visto'}
                        </span>

                        {/* veces vistas */}
                        {Number(trakt.plays || 0) > 0 && (
                          <span className="text-zinc-400">· {trakt.plays}×</span>
                        )}

                        {/* últimas fechas (si tienes history). Ajusta watched_at -> watchedAt si tu API lo devuelve así */}
                        {Array.isArray(trakt.history) && trakt.history.length > 0 ? (
                          <span className="text-zinc-500">
                            · Últ.: {new Date(trakt.history[0].watched_at).toLocaleDateString('es-ES')}
                            {trakt.history[1]?.watched_at
                              ? `, ${new Date(trakt.history[1].watched_at).toLocaleDateString('es-ES')}`
                              : ''}
                          </span>
                        ) : trakt.lastWatchedAt ? (
                          <span className="text-zinc-500">
                            · Últ.: {new Date(trakt.lastWatchedAt).toLocaleDateString('es-ES')}
                          </span>
                        ) : null}

                        <span className="ml-1 inline-flex items-center justify-center w-6 h-6 rounded-lg bg-black/25 border border-white/10">
                          <Eye className="w-3.5 h-3.5" />
                        </span>
                      </button>

                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-zinc-200 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="accent-yellow-500"
                          checked={syncTrakt}
                          onChange={(e) => setSyncTrakt(e.target.checked)}
                        />
                        Sincronizar con Trakt (nota + watchlist)
                      </label>

                      {/* Si quieres también el botón de watchlist Trakt “manual” (opcional) */}
                      {/* <button onClick={toggleTraktWatchlist} ...>...</button> */}
                    </div>

                    {endpointType === 'tv' && trakt.progress && (
                      <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="text-sm font-bold text-white">
                            Progreso en Trakt
                            {typeof trakt.progress.percentage === 'number' ? (
                              <span className="text-zinc-400 font-semibold ml-2">
                                {Math.round(trakt.progress.percentage)}%
                              </span>
                            ) : null}
                          </div>

                          {trakt.progress.next_episode && (
                            <div className="text-xs text-zinc-300">
                              S{trakt.progress.next_episode.season}E{trakt.progress.next_episode.number}
                              {trakt.progress.next_episode.title ? ` · ${trakt.progress.next_episode.title}` : ''}
                            </div>
                          )}
                        </div>

                        {typeof trakt.progress.percentage === 'number' && (
                          <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500/70"
                              style={{ width: `${Math.max(0, Math.min(100, trakt.progress.percentage))}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Usuario */}
                <div className="flex items-center justify-center min-w-0">
                  {session ? (
                    accountStatesLoading ? (
                      <div className="inline-flex items-center justify-center px-2 py-1 rounded-xl border border-white/10 bg-white/5">
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
                      </div>
                    ) : (
                      <div className="scale-[0.85] origin-center">
                        <StarRating
                          rating={userRating}
                          onRating={sendRating}
                          onClearRating={clearRating}
                          disabled={ratingLoading}
                        />
                      </div>
                    )
                  ) : (
                    <span className="text-[11px] font-semibold text-gray-400">Login</span>
                  )}
                </div>
              </div>

              {/* ✅ DESKTOP/TABLET: tu diseño original intacto */}
              <div
                className="hidden sm:flex items-center flex-nowrap overflow-x-auto pr-2
      [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
      divide-x divide-white/10"
              >
                {/* TMDb */}
                <div className="flex items-center gap-2 pr-3 shrink-0 whitespace-nowrap">
                  <img src="/logo-TMDb.png" alt="TMDb" className="h-3.5 sm:h-3.5 w-auto" />
                  <div className="flex items-baseline gap-1.5 sm:gap-2">
                    <span className="text-lg sm:text-xl font-bold text-emerald-400">
                      {data.vote_average?.toFixed(1)}
                    </span>
                    {formatVoteCount(data.vote_count) && (
                      <span className="text-[10px] sm:text-[11px] text-zinc-400">
                        {formatVoteCount(data.vote_count)}
                      </span>
                    )}
                  </div>
                </div>

                {/* IMDb */}
                {extras.imdbRating && (
                  <div className="flex items-center gap-2 px-3 shrink-0 whitespace-nowrap">
                    <img src="/logo-IMDb.png" alt="IMDb" className="h-4.5 sm:h-5 w-auto" />
                    <div className="flex items-baseline gap-1.5 sm:gap-2">
                      <span className="text-lg sm:text-xl font-bold text-yellow-400">
                        {extras.imdbRating}
                      </span>
                      {formatVoteCount(extras.imdbVotes) && (
                        <span className="text-[10px] sm:text-[11px] text-zinc-400">
                          {formatVoteCount(extras.imdbVotes)}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Rotten Tomatoes */}
                {extras.rtScore != null && (
                  <div className="flex items-center gap-2 px-3 shrink-0 whitespace-nowrap">
                    <img
                      src="/logo-RottenTomatoes.png"
                      alt="Rotten Tomatoes"
                      className="h-4.5 sm:h-5 w-auto"
                    />
                    <div className="flex items-baseline gap-1.5 sm:gap-2">
                      <span className="text-lg sm:text-xl font-bold text-rose-300">
                        {Math.round(extras.rtScore)}
                        <span className="text-[10px] sm:text-[11px] text-zinc-400 ml-1">%</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Metacritic (✅ solo desktop) */}
                {extras.mcScore != null && (
                  <div className="flex items-center gap-2 px-3 shrink-0 whitespace-nowrap">
                    <img
                      src="/logo-Metacritic.png"
                      alt="Metacritic"
                      className="h-4.5 sm:h-5 w-auto"
                    />
                    <div className="flex items-baseline gap-1.5 sm:gap-2">
                      <span className="text-lg sm:text-xl font-bold text-lime-200">
                        {Math.round(extras.mcScore)}
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-zinc-400">/100</span>
                    </div>
                  </div>
                )}

                {/* Usuario */}
                {session && (
                  <div className="flex items-center px-3 shrink-0 whitespace-nowrap">
                    {accountStatesLoading ? (
                      <div className="inline-flex items-center justify-center px-2.5 py-2 rounded-xl border border-white/10 bg-white/5">
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
                      </div>
                    ) : (
                      <StarRating
                        rating={userRating}
                        onRating={sendRating}
                        onClearRating={clearRating}
                        disabled={ratingLoading}
                      />
                    )}
                  </div>
                )}

                {!session && (
                  <p className="px-3 shrink-0 whitespace-nowrap text-[11px] sm:text-xs text-gray-400 sm:ml-auto">
                    Inicia sesión para puntuar.
                  </p>
                )}
              </div>
            </div>

            {ratingError && <p className="text-xs text-red-400 mt-1">{ratingError}</p>}

            {/* Links Externos */}
            <div className="flex gap-2 flex-wrap mt-1">
              {data.homepage && (
                <a
                  href={data.homepage}
                  target="_blank"
                  rel="noreferrer"
                  title="Web oficial"
                  className="group flex items-center justify-center w-10 h-10 rounded-2xl transition-transform duration-200 transform-gpu hover:scale-110 active:scale-95"
                >
                  <img
                    src="/logo-Web.png"
                    alt="Web oficial"
                    className="w-9 h-9 object-contain rounded-lg"
                  />
                </a>
              )}

              {tmdbDetailUrl && (
                <a
                  href={tmdbDetailUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="The Movie Database"
                  className="group flex items-center justify-center w-10 h-10 rounded-2xl transition-transform duration-200 transform-gpu hover:scale-110 active:scale-95"
                >
                  <img
                    src="/logo-TMDb.png"
                    alt="TMDb"
                    className="w-9 h-9 object-contain rounded-lg"
                  />
                </a>
              )}

              {data.imdb_id && (
                <a
                  href={`https://www.imdb.com/title/${data.imdb_id}`}
                  target="_blank"
                  rel="noreferrer"
                  title="IMDb"
                  className="group flex items-center justify-center w-10 h-10 rounded-2xl transition-transform duration-200 transform-gpu hover:scale-110 active:scale-95"
                >
                  <img
                    src="/logo-IMDb.png"
                    alt="IMDb"
                    className="w-9 h-9 object-contain rounded-lg"
                  />
                </a>
              )}

              <a
                href={filmAffinitySearchUrl}
                target="_blank"
                rel="noreferrer"
                title="FilmAffinity"
                className="group flex items-center justify-center w-10 h-10 rounded-2xl transition-transform duration-200 transform-gpu hover:scale-110 active:scale-95"
              >
                <img
                  src="/logoFilmaffinity.png"
                  alt="FilmAffinity"
                  className="w-9 h-9 object-contain rounded-lg"
                />
              </a>

              {type === 'tv' && seriesGraphUrl && (
                <a
                  href={seriesGraphUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="SeriesGraph"
                  className="group flex items-center justify-center w-10 h-10 rounded-2xl transition-transform duration-200 transform-gpu hover:scale-110 active:scale-95"
                >
                  <img
                    src="/logoseriesgraph.png"
                    alt="SeriesGraph"
                    className="w-9 h-9 object-contain rounded-lg"
                  />
                </a>
              )}
            </div>

            {/* ✅ Resumen plegable (oculto por defecto) */}
            <div>
              <button
                type="button"
                onClick={() => setOverviewOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-4 px-4 py-3 rounded-2xl
                  bg-white/5 border border-white/10 hover:bg-white/10 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-black/25 border border-white/10 flex items-center justify-center shrink-0">
                    <MessageSquareIcon className="w-5 h-5 text-zinc-200" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-white truncate">Resumen</div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      {overviewOpen ? 'Ocultar sinopsis' : 'Mostrar sinopsis'}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 text-zinc-300">
                  {overviewOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </button>

              <AnimatePresence initial={false}>
                {overviewOpen && (
                  <motion.div
                    key="overview"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pt-4 pb-4">
                      {data?.tagline && (
                        <p className="text-gray-300/70 text-[20px] sm:text-[20px] italic mb-4">
                          “{data.tagline}”
                        </p>
                      )}

                      {data?.overview ? (
                        <p className="text-gray-300 text-sm sm:text-base md:text-lg leading-relaxed text-justify md:text-left">
                          {data.overview}
                        </p>
                      ) : (
                        <p className="text-sm text-zinc-400">No hay resumen disponible.</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* METADATOS / CARACTERÍSTICAS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {type === 'movie' ? (
                <>
                  {data.original_title && (
                    <MetaItem
                      icon={FilmIcon}
                      label="Título original"
                      value={data.original_title}
                      colorClass="text-blue-400"
                      className="col-span-2 md:col-span-2"
                    />
                  )}

                  {movieDirector && (
                    <MetaItem
                      icon={Users}
                      label="Director"
                      value={movieDirector}
                      colorClass="text-rose-400"
                      className="col-span-2 md:col-span-2"
                    />
                  )}

                  {releaseDateValue && (
                    <MetaItem
                      icon={CalendarIcon}
                      label={releaseDateLabel}
                      value={releaseDateValue}
                      colorClass="text-blue-300"
                      className="col-span-1"
                    />
                  )}

                  {runtimeValue && (
                    <MetaItem
                      icon={ClockIcon}
                      label="Duración"
                      value={runtimeValue}
                      colorClass="text-purple-400"
                      className="col-span-1"
                    />
                  )}

                  {directorNames && (
                    <MetaItem
                      icon={Users}
                      label="Director"
                      value={directorNames}
                      colorClass="text-rose-400"
                      className="col-span-2 md:col-span-2"
                    />
                  )}

                  {budgetValue && (
                    <MetaItem
                      icon={BadgeDollarSignIcon}
                      label="Presupuesto"
                      value={budgetValue}
                      colorClass="text-yellow-500"
                      className="col-span-1"
                    />
                  )}

                  {revenueValue && (
                    <MetaItem
                      icon={TrendingUp}
                      label="Recaudación"
                      value={revenueValue}
                      colorClass="text-emerald-500"
                      className="col-span-1"
                    />
                  )}

                  {production && (
                    <MetaItem
                      icon={Building2}
                      label="Producción"
                      value={production}
                      colorClass="text-zinc-400"
                      className={hasAwards ? 'col-span-2 md:col-span-2' : 'col-span-2 md:col-span-4'}
                    />
                  )}

                  {extras.awards && (
                    <MetaItem
                      icon={Trophy}
                      label="Premios"
                      value={extras.awards}
                      colorClass="text-yellow-500"
                      className={hasProduction ? 'col-span-2 md:col-span-2' : 'col-span-2 md:col-span-4'}
                    />
                  )}
                </>
              ) : (
                <>
                  {data.original_name && (
                    <MetaItem
                      icon={FilmIcon}
                      label="Título original"
                      value={data.original_name}
                      colorClass="text-blue-400"
                      className="col-span-2 md:col-span-2"
                    />
                  )}

                  {createdByNames && (
                    <MetaItem
                      icon={Users}
                      label="Creado por"
                      value={createdByNames}
                      colorClass="text-rose-400"
                      className="col-span-2 md:col-span-2"
                    />
                  )}

                  {releaseDateValue && (
                    <MetaItem
                      icon={CalendarIcon}
                      label="Primera emisión"
                      value={releaseDateValue}
                      colorClass="text-blue-300"
                      className="col-span-1"
                    />
                  )}

                  {lastAirDateValue && (
                    <MetaItem
                      icon={CalendarIcon}
                      label="Última emisión"
                      value={lastAirDateValue}
                      colorClass="text-blue-300"
                      className="col-span-1"
                    />
                  )}

                  {data.status && (
                    <MetaItem
                      icon={StarIcon}
                      label="Estado"
                      value={data.status}
                      colorClass="text-yellow-400"
                      className="col-span-1"
                    />
                  )}

                  {network && (
                    <MetaItem
                      icon={Building2}
                      label="Canal"
                      value={network}
                      colorClass="text-zinc-300"
                      className="col-span-1"
                    />
                  )}

                  {typeof data.number_of_seasons === 'number' && (
                    <MetaItem
                      icon={Layers}
                      label="Temporadas"
                      value={`${data.number_of_seasons}`}
                      colorClass="text-orange-400"
                      className="col-span-1"
                    />
                  )}

                  {typeof data.number_of_episodes === 'number' && (
                    <MetaItem
                      icon={MonitorPlay}
                      label="Episodios"
                      value={`${data.number_of_episodes}`}
                      colorClass="text-pink-400"
                      className="col-span-1"
                    />
                  )}

                  {languages && (
                    <MetaItem
                      icon={Languages}
                      label="Idiomas"
                      value={languages}
                      colorClass="text-indigo-400"
                      className="col-span-1"
                    />
                  )}

                  {countries && (
                    <MetaItem
                      icon={MapPin}
                      label="País"
                      value={countries}
                      colorClass="text-red-400"
                      className="col-span-1"
                    />
                  )}

                  {production && (
                    <MetaItem
                      icon={Building2}
                      label="Producción"
                      value={production}
                      colorClass="text-zinc-400"
                      className={hasAwards ? 'col-span-2 md:col-span-2' : 'col-span-2 md:col-span-4'}
                    />
                  )}

                  {extras.awards && (
                    <MetaItem
                      icon={Trophy}
                      label="Premios"
                      value={extras.awards}
                      colorClass="text-yellow-500"
                      className={hasProduction ? 'col-span-2 md:col-span-2' : 'col-span-2 md:col-span-4'}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

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

        {/* EPISODIOS (TV) */}
        {type === 'tv' && ratings && (
          <section className="mb-16">
            <SectionTitle title="Valoración de Episodios" icon={TrendingUp} />
            <div className="p-6">
              {ratingsLoading && (
                <p className="text-sm text-gray-300 mb-2">Cargando ratings…</p>
              )}
              {ratingsError && (
                <p className="text-sm text-red-400 mb-2">{ratingsError}</p>
              )}
              {!ratingsError && (
                <EpisodeRatingsGrid ratings={ratings} initialSource="avg" density="compact" />
              )}
            </div>
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
      </div>

      {/* ✅ MODAL: Vídeos / Trailer */}
      <VideoModal open={videoModalOpen} onClose={closeVideo} video={activeVideo} />

      <TraktWatchedModal
        open={traktWatchedOpen}
        onClose={() => setTraktWatchedOpen(false)}
        traktUrl={trakt.traktUrl}
        plays={trakt.plays}
        history={trakt.history || []}
        onAddPlay={handleTraktAddPlay}
        onUpdatePlay={handleTraktUpdatePlay}
        onRemovePlay={handleTraktRemovePlay}
        busy={!!traktBusy}
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