// src/components/DetailsClient.jsx
'use client'

import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/swiper-bundle.css'
import EpisodeRatingsGrid from '@/components/EpisodeRatingsGrid'
import { saveArtworkOverride } from '@/lib/artworkApi'

import {
  CalendarIcon,
  ClockIcon,
  FilmIcon,
  GlobeIcon,
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
  Library,
  Trophy
} from 'lucide-react'

/* === cuenta / api === */
import { useAuth } from '@/context/AuthContext'
import {
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getExternalIds,
  getMovieDetails
} from '@/lib/api/tmdb'
import { fetchOmdbByImdb } from '@/lib/api/omdb'
import StarRating from './StarRating'

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

// --- Helpers de Imágenes ---
const mergeUniqueImages = (current, incoming) => {
  const seen = new Set(current.map((img) => img.file_path))
  const merged = [...current]
  for (const img of incoming || []) {
    if (seen.has(img.file_path)) continue
    seen.add(img.file_path)
    merged.push(img)
  }
  return merged
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

  // 1) Prioridad absoluta: mayor número de votos
  const maxVotes = list.reduce((max, img) => {
    const vc = img.vote_count || 0
    return vc > max ? vc : max
  }, 0)

  const withMaxVotes = list.filter((img) => (img.vote_count || 0) === maxVotes)

  const preferredLangs = new Set(['es', 'es-ES', 'en', 'en-US'])

  // 2) Dentro del grupo de MÁS VOTOS, si hay ES/EN, las priorizamos
  const preferred = withMaxVotes.filter(
    (img) => img.iso_639_1 && preferredLangs.has(img.iso_639_1)
  )

  const candidates = preferred.length ? preferred : withMaxVotes

  // 3) Entre esas candidatas, ordenamos por media de votos y tamaño
  const sorted = [...candidates].sort((a, b) => {
    const va = (b.vote_average || 0) - (a.vote_average || 0)
    if (va !== 0) return va
    return (b.width || 0) - (a.width || 0)
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

const slugifyForSeriesGraph = (name) => {
  if (!name) return ''
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

const SectionTitle = ({ title, icon: Icon }) => (
  <div className="flex items-center gap-3 mb-6 border-l-4 border-yellow-500 pl-4 py-1">
    {Icon && <Icon className="text-yellow-500 w-6 h-6" />}
    <h2 className="text-2xl md:text-3xl font-bold text-white tracking-wide">
      {title}
    </h2>
  </div>
)

const MetaItem = ({ icon: Icon, label, value, colorClass = 'text-gray-400' }) => {
  if (!value) return null
  return (
    <div className="flex-grow basis-[190px] max-w-full flex items-center gap-3 bg-neutral-800/40 p-3 rounded-xl border border-neutral-700/50 hover:bg-neutral-800 transition-colors h-[72px]">
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
  const tmdbWatchUrl =
    watchLink ||
    (type && id ? `https://www.themoviedb.org/${type}/${id}/watch` : null)

  const [showAdminImages, setShowAdminImages] = useState(false)
  const [reviewLimit, setReviewLimit] = useState(2)
  const [useBackdrop, setUseBackdrop] = useState(true)

  const { session, account } = useAuth()
  const isAdmin =
    account?.username === 'psantos26' || account?.name === 'psantos26'

  const [favLoading, setFavLoading] = useState(false)
  const [wlLoading, setWlLoading] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [watchlist, setWatchlist] = useState(false)

  const [userRating, setUserRating] = useState(null)
  const [ratingLoading, setRatingLoading] = useState(false)
  const [ratingError, setRatingError] = useState('')

  const endpointType = type === 'tv' ? 'tv' : 'movie'

  // ====== PREFERENCIAS DE IMÁGENES ======
  const posterStorageKey = `showverse:${endpointType}:${id}:poster`
  const previewBackdropStorageKey = `showverse:${endpointType}:${id}:backdrop`
  const backgroundStorageKey = `showverse:${endpointType}:${id}:background`

  const [selectedPosterPath, setSelectedPosterPath] = useState(null)
  const [selectedPreviewBackdropPath, setSelectedPreviewBackdropPath] =
    useState(null)
  const [selectedBackgroundPath, setSelectedBackgroundPath] = useState(null)

  const [basePosterPath, setBasePosterPath] = useState(
    data.poster_path || data.profile_path || null
  )
  const [baseBackdropPath, setBaseBackdropPath] = useState(
    data.backdrop_path || null
  )
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

  /**
   * ✅ FIX PRINCIPAL (flash de portada):
   * Reset SINCRÓNICO al cambiar de id/type para que nunca se pinte
   * la portada del item anterior.
   *
   * - Reinicia basePoster/baseBackdrop/imagesState a partir de "data" actual
   * - Carga overrides de localStorage antes del primer paint
   * - Deja artworkInitialized=false y luego initArtwork lo pone a true
   */
  useLayoutEffect(() => {
    setArtworkInitialized(false)

    // Reset base a lo que viene en data (para el nuevo item)
    setBasePosterPath(data.poster_path || data.profile_path || null)
    setBaseBackdropPath(data.backdrop_path || null)

    setImagesState({
      posters: data.poster_path ? [{ file_path: data.poster_path, from: 'main' }] : [],
      backdrops: data.backdrop_path ? [{ file_path: data.backdrop_path, from: 'main' }] : []
    })
    setImagesLoading(false)
    setImagesError('')
    setActiveImagesTab('posters')

    // Reset overrides
    setSelectedPosterPath(null)
    setSelectedPreviewBackdropPath(null)
    setSelectedBackgroundPath(null)

    // Cargar overrides (sync) antes del paint
    if (typeof window !== 'undefined') {
      try {
        const savedPoster = window.localStorage.getItem(posterStorageKey)
        const savedPreviewBackdrop = window.localStorage.getItem(previewBackdropStorageKey)
        const savedBackground = window.localStorage.getItem(backgroundStorageKey)

        if (savedPoster) setSelectedPosterPath(savedPoster)
        if (savedPreviewBackdrop) setSelectedPreviewBackdropPath(savedPreviewBackdrop)

        if (savedBackground) {
          setSelectedBackgroundPath(savedBackground)
        } else if (savedPreviewBackdrop) {
          setSelectedBackgroundPath(savedPreviewBackdrop)
          window.localStorage.setItem(backgroundStorageKey, savedPreviewBackdrop)
        }
      } catch {
        // ignore
      }
    }
  }, [
    id,
    endpointType,
    // por si Next actualiza data sin cambiar id (edge cases)
    data?.poster_path,
    data?.backdrop_path,
    data?.profile_path
  ])

  // ====== Inicializar artwork (mejoras + preload para evitar flicker) ======
  useEffect(() => {
    let cancelled = false

    const initArtwork = async () => {
      // ya venimos con reset sync, pero por seguridad:
      setArtworkInitialized(false)

      let poster = data.poster_path || data.profile_path || null
      let backdrop = data.backdrop_path || null

      // Si ya vienen imágenes embebidas, aplicamos mejor poster sin esperar red
      if (data?.images) {
        const bestPoster = pickBestImage(data.images.posters || [])
        if (bestPoster?.file_path) poster = bestPoster.file_path

        setImagesState((prev) => ({
          posters: mergeUniqueImages(prev.posters, data.images.posters || []),
          backdrops: mergeUniqueImages(prev.backdrops, data.images.backdrops || [])
        }))
      }

      // TV: traer images y escoger mejor
      if (endpointType === 'tv' && TMDB_API_KEY) {
        try {
          setImagesLoading(true)
          setImagesError('')

          const { posters, backdrops } = await fetchTVImages(id)
          const bestPoster = pickBestPosterTV(posters)
          const bestBackdropForBackground = pickBestBackdropTVNeutralFirst(backdrops)

          // Preload del póster candidato para evitar “cambio” brusco
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

      // Movie: traer posters y escoger mejor (solo si no venían embebidas)
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
            // Preload para evitar swap “cutre”
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
        // Base final (si hay override, displayPosterPath seguirá usando selectedPosterPath)
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

  // ====== Account States ======
  useEffect(() => {
    let cancel = false
    const load = async () => {
      try {
        if (!session || !account?.id) return
        const st = await getMediaAccountStates(type, id, session)
        if (!cancel) {
          setFavorite(!!st.favorite)
          setWatchlist(!!st.watchlist)
          const ratedValue =
            st?.rated && typeof st.rated.value === 'number'
              ? st.rated.value
              : null
          setUserRating(ratedValue)
        }
      } catch { }
    }
    load()
    return () => {
      cancel = true
    }
  }, [type, id, session, account])

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = '/login'
      return true
    }
    return false
  }

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
    } catch (err) {
      setRatingError(err.message)
    } finally {
      setRatingLoading(false)
    }
  }

  // ====== Extras: IMDb rating + Awards ======
  const [extras, setExtras] = useState({ imdbRating: null, awards: null })
  useEffect(() => {
    let abort = false
    const run = async () => {
      try {
        let imdb = data?.imdb_id || null
        if (!imdb) {
          if (type === 'movie') {
            const details = await getMovieDetails(id)
            imdb = details?.imdb_id || null
            if (!imdb) {
              const ext = await getExternalIds('movie', id)
              imdb = ext?.imdb_id || null
            }
          } else {
            const ext = await getExternalIds('tv', id)
            imdb = ext?.imdb_id || null
          }
        }
        if (!imdb) {
          if (!abort) setExtras({ imdbRating: null, awards: null })
          return
        }
        const omdb = await fetchOmdbByImdb(imdb)
        const rating =
          omdb?.imdbRating && omdb.imdbRating !== 'N/A'
            ? Number(omdb.imdbRating)
            : null
        const awards =
          typeof omdb?.Awards === 'string' && omdb.Awards.trim()
            ? omdb.Awards.trim()
            : null
        if (!abort) setExtras({ imdbRating: rating, awards })
      } catch {
        if (!abort) setExtras({ imdbRating: null, awards: null })
      }
    }
    run()
    return () => {
      abort = true
    }
  }, [type, id, data?.imdb_id])

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

  const directors =
    type === 'movie'
      ? data.credits?.crew?.filter((c) => c.job === 'Director') || []
      : data.created_by || []
  const production =
    data.production_companies?.slice(0, 2).map((c) => c.name).join(', ') || null
  const countries =
    data.production_countries?.map((c) => c.iso_3166_1).join(', ') || null
  const languages =
    data.spoken_languages?.map((l) => l.english_name || l.name).join(', ') || null

  // ====== IMDb para RECOMENDACIONES ======
  const [recImdbRatings, setRecImdbRatings] = useState({})

  useEffect(() => {
    let abort = false

    const loadImdbForRecs = async () => {
      if (!recommendations || recommendations.length === 0) {
        if (!abort) setRecImdbRatings({})
        return
      }

      try {
        const entries = await Promise.all(
          recommendations.slice(0, 15).map(async (rec) => {
            try {
              const raw =
                rec.imdb_rating ?? rec.imdbRating ?? rec.imdbScore ?? null
              if (raw != null && raw !== 'N/A') {
                const n = Number(raw)
                return [rec.id, Number.isFinite(n) ? n : null]
              }

              const mediaType =
                rec.media_type === 'movie' || rec.media_type === 'tv'
                  ? rec.media_type
                  : type === 'tv'
                    ? 'tv'
                    : 'movie'

              const ext = await getExternalIds(mediaType, rec.id)
              const imdbId = ext?.imdb_id
              if (!imdbId) return [rec.id, null]

              const omdb = await fetchOmdbByImdb(imdbId)
              const r =
                omdb?.imdbRating && omdb.imdbRating !== 'N/A'
                  ? Number(omdb.imdbRating)
                  : null

              return [rec.id, Number.isFinite(r) ? r : null]
            } catch {
              return [rec.id, null]
            }
          })
        )

        if (!abort) {
          const map = {}
          for (const [rid, rating] of entries) map[rid] = rating
          setRecImdbRatings(map)
        }
      } catch {
        if (!abort) setRecImdbRatings({})
      }
    }

    loadImdbForRecs()
    return () => {
      abort = true
    }
  }, [recommendations, type])

  return (
    <div className="relative min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-yellow-500/30">
      {/* --- BACKGROUND & OVERLAY --- */}
      <div className="fixed inset-0 z-0">
        {useBackdrop && artworkInitialized && displayBackdropPath ? (
          <div
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
            style={{
              backgroundImage: `url(https://image.tmdb.org/t/p/original${displayBackdropPath})`
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-[#0a0a0a]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/90 to-black/40 backdrop-blur-[4px]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#101010] via-transparent to-transparent opacity-80" />
      </div>

      {/* --- BOTÓN TOGGLE BACKDROP --- */}
      <button
        onClick={() => setUseBackdrop(!useBackdrop)}
        className="absolute top-4 right-4 z-50 p-2.5 rounded-full bg-black/40 hover:bg-black/90 backdrop-blur-md border border-white/20 transition-all text-white/80 hover:text-white shadow-lg"
        title="Alternar fondo"
      >
        <ImageIcon className="w-5 h-5" />
      </button>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <div className="relative z-10 px-4 py-8 lg:py-12 max-w-7xl mx-auto">
        {/* HEADER HERO SECTION */}
        <div className="flex flex-col lg:flex-row gap-10 mb-16 animate-in fade-in duration-700 slide-in-from-bottom-4">
          {/* POSTER */}
          <div className="w-full lg:w-[350px] flex-shrink-0 flex flex-col gap-5">
            <div className="relative group rounded-xl overflow-hidden shadow-2xl shadow-black/60 border border-white/10 bg-black/40 transition-all duration-500 hover:shadow-[0_25px_60px_rgba(0,0,0,0.95)] hover:border-yellow-500/60">
              {displayPosterPath ? (
                <>
                  <img
                    src={`https://image.tmdb.org/t/p/w780${displayPosterPath}`}
                    alt={title}
                    className="w-full h-auto object-cover transform-gpu transition-transform duration-700 group-hover:scale-[1.12] group-hover:-translate-y-1 group-hover:rotate-[0.6deg] group-hover:saturate-150"
                  />
                  <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                </>
              ) : (
                <div className="w-full aspect-[2/3] bg-neutral-900 flex items-center justify-center">
                  <ImageOff className="w-12 h-12 text-neutral-700" />
                </div>
              )}
            </div>

            {/* Plataformas */}
            {providers && providers.length > 0 && (
              <div className="flex flex-wrap justify-center lg:justify-start gap-3 p-1">
                {providers.map((p) => (
                  <a
                    key={p.provider_id}
                    href={tmdbWatchUrl || '#'}
                    target={tmdbWatchUrl ? '_blank' : undefined}
                    rel={tmdbWatchUrl ? 'noreferrer' : undefined}
                    title={p.provider_name}
                    className="flex items-center justify-center"
                  >
                    <img
                      src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                      alt={p.provider_name}
                      className="w-10 h-10 rounded-lg object-contain hover:scale-110 hover:-translate-y-0.5 transition-transform cursor-pointer"
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
                {data.release_date && (
                  <span className="text-2xl md:text-3xl font-light text-gray-400 ml-3">
                    ({data.release_date.split('-')[0]})
                  </span>
                )}
              </h1>

              <div className="flex items-center mt-3 gap-3 shrink-0">
                <button
                  onClick={toggleFavorite}
                  disabled={favLoading}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border transform-gpu ${favorite
                    ? 'bg-red-500/20 border-red-500 text-red-500 hover:bg-red-500/30 hover:shadow-[0_0_25px_rgba(248,113,113,0.4)]'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:shadow-lg'
                    }`}
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
                >
                  {wlLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : watchlist ? (
                    <BookmarkMinus className="fill-current w-6 h-6" />
                  ) : (
                    <BookmarkPlus className="w-6 h-6" />
                  )}
                </button>
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
            <div className="flex items-center gap-6 py-2 border-y border-white/10">
              <div className="flex items-center gap-2">
                <img src="/logo-TMDb.png" alt="TMDb" className="h-5 w-auto" />
                <span className="text-xl font-bold text-emerald-400">
                  {data.vote_average?.toFixed(1)}
                </span>
              </div>

              {extras.imdbRating && (
                <div className="flex items-center gap-2 border-l border-white/10 pl-6">
                  <img src="/logo-IMDb.png" alt="IMDb" className="h-5 w-auto" />
                  <span className="text-xl font-bold text-yellow-400">
                    {extras.imdbRating}
                  </span>
                </div>
              )}

              {session && (
                <div className="flex items-center gap-2 border-l border-white/10 pl-6">
                  <StarRating
                    rating={userRating}
                    onRating={sendRating}
                    onClearRating={clearRating}
                    disabled={ratingLoading}
                  />
                </div>
              )}

              {!session && (
                <p className="ml-auto text-xs text-gray-400">
                  Inicia sesión para puntuar.
                </p>
              )}
            </div>

            {ratingError && <p className="text-xs text-red-400 mt-1">{ratingError}</p>}

            {/* Tagline & Overview */}
            <div>
              {data.tagline && (
                <p className="text-xl text-gray-400 italic font-light mb-3">
                  "{data.tagline}"
                </p>
              )}
              <p className="text-gray-300 text-lg leading-relaxed text-justify md:text-left">
                {data.overview}
              </p>
            </div>

            {/* Links Externos – solo icono */}
            <div className="flex gap-2 flex-wrap">
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
                  src="/logo-filmaffinity.png"
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
                    src="/logo-seriesgraph.png"
                    alt="SeriesGraph"
                    className="w-9 h-9 object-contain rounded-lg"
                  />
                </a>
              )}
            </div>

            {/* METADATOS */}
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-3">
                {type === 'movie' && data.original_title && (
                  <MetaItem
                    icon={FilmIcon}
                    label="Título Original"
                    value={data.original_title}
                    colorClass="text-blue-400"
                  />
                )}

                {type === 'tv' && data.original_name && (
                  <MetaItem
                    icon={FilmIcon}
                    label="Título Original"
                    value={data.original_name}
                    colorClass="text-blue-400"
                  />
                )}

                {directors.length > 0 && (
                  <MetaItem
                    icon={Users}
                    label={type === 'movie' ? 'Director' : 'Creado por'}
                    value={directors.map((d) => d.name).join(', ')}
                    colorClass="text-rose-400"
                  />
                )}

                {type === 'movie' && data.runtime && (
                  <MetaItem
                    icon={ClockIcon}
                    label="Duración"
                    value={`${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m`}
                    colorClass="text-purple-400"
                  />
                )}

                {languages && (
                  <MetaItem
                    icon={Languages}
                    label="Idiomas"
                    value={languages}
                    colorClass="text-indigo-400"
                  />
                )}

                {type === 'tv' && countries && (
                  <MetaItem
                    icon={MapPin}
                    label="País"
                    value={countries}
                    colorClass="text-red-400"
                  />
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {type === 'movie' ? (
                  <>
                    {countries && (
                      <MetaItem
                        icon={MapPin}
                        label="País"
                        value={countries}
                        colorClass="text-red-400"
                      />
                    )}

                    {data.budget > 0 && (
                      <MetaItem
                        icon={BadgeDollarSignIcon}
                        label="Presupuesto"
                        value={`$${(data.budget / 1_000_000).toFixed(1)}M`}
                        colorClass="text-yellow-500"
                      />
                    )}

                    {data.revenue > 0 && (
                      <MetaItem
                        icon={TrendingUp}
                        label="Recaudación"
                        value={`$${(data.revenue / 1_000_000).toFixed(1)}M`}
                        colorClass="text-emerald-500"
                      />
                    )}
                  </>
                ) : (
                  <>
                    <MetaItem
                      icon={CalendarIcon}
                      label="Estado"
                      value={data.status}
                      colorClass="text-blue-300"
                    />
                    <MetaItem
                      icon={MonitorPlay}
                      label="Episodios"
                      value={`${data.number_of_episodes} Episodios`}
                      colorClass="text-pink-400"
                    />
                    <MetaItem
                      icon={Layers}
                      label="Temporadas"
                      value={`${data.number_of_seasons} Temporadas`}
                      colorClass="text-orange-400"
                    />
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {data.belongs_to_collection && (
                  <MetaItem
                    icon={Library}
                    label="Colección"
                    value={data.belongs_to_collection.name}
                    colorClass="text-teal-400"
                  />
                )}

                {production && (
                  <MetaItem
                    icon={Building2}
                    label="Producción"
                    value={production}
                    colorClass="text-zinc-400"
                  />
                )}

                {extras.awards && (
                  <MetaItem
                    icon={Trophy}
                    label="Premios"
                    value={extras.awards}
                    colorClass="text-yellow-500"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ADMIN: SELECCIÓN DE IMÁGENES */}
        {(type === 'movie' || type === 'tv') && isAdmin && (
          <div className="mb-12 border border-neutral-800 bg-neutral-900/40 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowAdminImages(!showAdminImages)}
              className="w-full flex items-center justify-between p-4 px-6 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ImageIcon className="text-yellow-500" />
                <span className="font-bold text-gray-200">
                  Administrar Portadas y Fondos
                </span>
              </div>
              {showAdminImages ? (
                <ChevronUp className="text-gray-400" />
              ) : (
                <ChevronDown className="text-gray-400" />
              )}
            </button>

            {showAdminImages && (
              <div className="p-6 border-t border-neutral-800 animate-in slide-in-from-top-2">
                <div className="flex flex-wrap items-center gap-4 mb-6">
                  <div className="flex bg-neutral-950 rounded-lg p-1 border border-neutral-800">
                    {['posters', 'backdrops', 'background'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveImagesTab(tab)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeImagesTab === tab
                          ? 'bg-neutral-800 text-white shadow'
                          : 'text-gray-400 hover:text-gray-200'
                          }`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleResetArtwork}
                    className="text-xs text-red-400 hover:text-red-300 hover:underline ml-auto"
                  >
                    Restaurar valores por defecto
                  </button>
                </div>

                {imagesLoading && (
                  <div className="text-gray-400 flex items-center gap-2">
                    <Loader2 className="animate-spin w-4 h-4" /> Cargando TMDb...
                  </div>
                )}
                {imagesError && <p className="text-red-400 text-sm">{imagesError}</p>}

                <div
                  className="relative group"
                  onMouseEnter={() => setIsHoveredImages(true)}
                  onMouseLeave={() => setIsHoveredImages(false)}
                >
                  {showPrevImages && (
                    <button
                      onClick={handlePrevImagesClick}
                      className="absolute left-0 top-0 bottom-0 z-20 w-16 bg-gradient-to-r from-black to-transparent flex items-center justify-start pl-2 text-white hover:text-yellow-400 transition-colors"
                    >
                      <div className="bg-black/50 rounded-full p-1">
                        <ChevronDown className="rotate-90 w-8 h-8" />
                      </div>
                    </button>
                  )}

                  <div
                    ref={imagesScrollRef}
                    onScroll={handleImagesScroll}
                    className="flex gap-4 overflow-x-auto pb-4 no-scrollbar scroll-smooth"
                  >
                    {(activeImagesTab === 'posters'
                      ? imagesState.posters
                      : imagesState.backdrops
                    ).map((img, idx) => {
                      const isActive =
                        activeImagesTab === 'posters'
                          ? displayPosterPath === img.file_path
                          : activeImagesTab === 'backdrops'
                            ? selectedPreviewBackdropPath === img.file_path
                            : displayBackdropPath === img.file_path

                      const aspectClass =
                        activeImagesTab === 'posters'
                          ? 'w-[140px] aspect-[2/3]'
                          : 'w-[280px] aspect-[16/9]'

                      return (
                        <div
                          key={img.file_path + idx}
                          onClick={() => {
                            if (activeImagesTab === 'posters')
                              handleSelectPoster(img.file_path)
                            else if (activeImagesTab === 'backdrops')
                              handleSelectPreviewBackdrop(img.file_path)
                            else handleSelectBackground(img.file_path)
                          }}
                          className={`relative flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border-2 transition-all transform-gpu hover:scale-105 hover:-translate-y-1 ${isActive
                            ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                            : 'border-transparent hover:border-white/30'
                            }`}
                        >
                          <img
                            src={`https://image.tmdb.org/t/p/w300${img.file_path}`}
                            className={`${aspectClass} object-cover`}
                            alt="option"
                          />
                          {isActive && (
                            <div className="absolute top-2 right-2 w-3 h-3 bg-emerald-500 rounded-full shadow shadow-black" />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCopyImageUrl(img.file_path)
                            }}
                            className="absolute bottom-2 right-2 p-1 bg-black/60 rounded text-white opacity-0 group-hover:opacity-100 hover:bg-black transition-opacity"
                          >
                            <LinkIcon size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {showNextImages && (
                    <button
                      onClick={handleNextImagesClick}
                      className="absolute right-0 top-0 bottom-0 z-20 w-16 bg-gradient-to-l from-black to-transparent flex items-center justify-end pr-2 text-white hover:text-yellow-400 transition-colors"
                    >
                      <div className="bg-black/50 rounded-full p-1">
                        <ChevronDown className="-rotate-90 w-8 h-8" />
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* === REPARTO PRINCIPAL (Cast) === */}
        {castData && castData.length > 0 && (
          <section className="mb-16">
            <SectionTitle title="Reparto Principal" icon={UsersIconComponent} />
            <Swiper
              spaceBetween={20}
              slidesPerView={2}
              breakpoints={{
                500: { slidesPerView: 3 },
                768: { slidesPerView: 4 },
                1024: { slidesPerView: 5 },
                1280: { slidesPerView: 6 }
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
                          className="w-full h-full object-cover transition-transform duration-500 transform-gpu group-hover:scale-[1.12] group-hover:-translate-y-1 group-hover:rotate-[0.5deg] group-hover:grayscale-0 grayscale-[20%]"
                        />
                      ) : (
                        <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500">
                          <UsersIconComponent size={40} />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-70 group-hover:opacity-90 transition-opacity duration-300" />
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-white font-bold text-sm truncate leading-tight">
                          {actor.name}
                        </p>
                        <p className="text-gray-300 text-xs truncate">
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
                <EpisodeRatingsGrid
                  ratings={ratings}
                  initialSource="avg"
                  density="compact"
                />
              )}
            </div>
          </section>
        )}

        {/* === RECOMENDACIONES === */}
        {recommendations && recommendations.length > 0 && (
          <section className="mb-16">
            <SectionTitle title="Recomendaciones" icon={MonitorPlay} />

            <Swiper
              spaceBetween={16}
              slidesPerView={2}
              breakpoints={{
                500: { slidesPerView: 3 },
                768: { slidesPerView: 4 },
                1024: { slidesPerView: 5 },
                1280: { slidesPerView: 6 }
              }}
            >
              {recommendations.slice(0, 15).map((rec) => {
                const tmdbScore =
                  typeof rec.vote_average === 'number' && rec.vote_average > 0
                    ? rec.vote_average
                    : null

                const imdbScore =
                  recImdbRatings[rec.id] != null
                    ? recImdbRatings[rec.id]
                    : undefined

                return (
                  <SwiperSlide key={rec.id}>
                    <a
                      href={`/details/${rec.media_type || type}/${rec.id}`}
                      className="block group"
                    >
                      <div className="mt-3 relative rounded-lg overflow-hidden cursor-pointer shadow-lg hover:shadow-2xl hover:shadow-yellow-500/25 transition-all duration-300 transform-gpu hover:scale-105 hover:-translate-y-1 bg-black/40">
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
                              <img
                                src="/logo-TMDb.png"
                                alt="TMDb"
                                className="w-auto h-3"
                              />
                              <span className="text-emerald-400 text-[10px] font-bold font-mono">
                                {tmdbScore.toFixed(1)}
                              </span>
                            </div>
                          )}

                          {imdbScore && (
                            <div className="bg-black/85 backdrop-blur-md px-2 py-1 rounded-full border border-yellow-500/60 flex items-center gap-1.5 shadow-xl transform-gpu scale-95 translate-y-1 transition-all duration-300 delay-150 group-hover:scale-110 group-hover:translate-y-0">
                              <img
                                src="/logo-IMDb.png"
                                alt="IMDb"
                                className="w-auto h-3"
                              />
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

        {/* CRÍTICAS */}
        {reviews && reviews.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-6">
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
      </div>
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
