// src/components/DetailsClient.jsx
'use client'

import { useRef, useState, useEffect } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/swiper-bundle.css'
import EpisodeRatingsGrid from '@/components/EpisodeRatingsGrid'

import {
  CalendarIcon,
  ClockIcon,
  FilmIcon,
  GlobeIcon,
  StarIcon,
  MessageSquareIcon,
  BadgeDollarSignIcon,
  LinkIcon,
  TagIcon,
  ImageIcon,
  ImageOff,
  Heart,
  HeartOff,
  BookmarkPlus,
  BookmarkMinus,
  Loader2
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

// Fusiona imágenes nuevas con las actuales evitando duplicados por file_path
const mergeUniqueImages = (current, incoming) => {
  const seen = new Set(current.map((img) => img.file_path))
  const merged = [...current]
  for (const img of incoming || []) {
    if (!seen.has(img.file_path)) {
      seen.add(img.file_path)
      merged.push(img)
    }
  }
  return merged
}

export default function DetailsClient({
  type,
  id,
  data,
  recommendations,
  castData,
  providers,
  reviews
}) {
  const title = data.title || data.name
  const recRef = useRef()
  const [reviewLimit, setReviewLimit] = useState(2)
  const [useBackdrop, setUseBackdrop] = useState(true)

  // ====== ESTADOS DE CUENTA ======
  const { session, account } = useAuth()
  const [favLoading, setFavLoading] = useState(false)
  const [wlLoading, setWlLoading] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [watchlist, setWatchlist] = useState(false)

  // Rating del usuario en TMDb
  const [userRating, setUserRating] = useState(null) // número 1-10 o null
  const [ratingLoading, setRatingLoading] = useState(false)
  const [ratingError, setRatingError] = useState('')

  // endpoint para rating / imágenes
  const endpointType = type === 'tv' ? 'tv' : 'movie'

  // ====== PREFERENCIAS DE IMÁGENES ======
  // Portada
  const posterStorageKey = `showverse:${endpointType}:${id}:poster`
  // Backdrop de VISTA PREVIA (mantiene la clave antigua para no romper nada)
  const previewBackdropStorageKey = `showverse:${endpointType}:${id}:backdrop`
  // Fondo de la vista de detalles (nuevo)
  const backgroundStorageKey = `showverse:${endpointType}:${id}:background`

  const [selectedPosterPath, setSelectedPosterPath] = useState(null)
  const [selectedPreviewBackdropPath, setSelectedPreviewBackdropPath] =
    useState(null)
  const [selectedBackgroundPath, setSelectedBackgroundPath] = useState(null)

  // Todas las imágenes (inicialmente al menos la portada/backdrop principal)
  const [imagesState, setImagesState] = useState(() => ({
    posters: data.poster_path
      ? [{ file_path: data.poster_path, from: 'main' }]
      : [],
    backdrops: data.backdrop_path
      ? [{ file_path: data.backdrop_path, from: 'main' }]
      : []
  }))
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imagesError, setImagesError] = useState('')
  const [activeImagesTab, setActiveImagesTab] = useState('posters') // 'posters' | 'backdrops' | 'background'

  // Scroll horizontal de la fila de imágenes
  const imagesScrollRef = useRef(null)
  const [isHoveredImages, setIsHoveredImages] = useState(false)
  const [canPrevImages, setCanPrevImages] = useState(false)
  const [canNextImages, setCanNextImages] = useState(false)

  // Imagen final que se usa para la portada grande y el fondo
  const displayPosterPath =
    selectedPosterPath || data.poster_path || data.profile_path || null

  // El fondo del detalle SOLO depende de selectedBackgroundPath
  const displayBackdropPath =
    selectedBackgroundPath || data.backdrop_path || null

  // ====== ESTADOS DE CUENTA (fetch) ======
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
      } catch {
        // silencioso
      }
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

  // ====== RATING TMDb ======
  const sendRating = async (value) => {
    if (requireLogin() || ratingLoading || !TMDB_API_KEY) return
    try {
      setRatingLoading(true)
      setRatingError('')
      setUserRating(value)

      const url = `https://api.themoviedb.org/3/${endpointType}/${id}/rating?api_key=${TMDB_API_KEY}&session_id=${session}`

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8'
        },
        body: JSON.stringify({ value })
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.status_message || 'No se pudo guardar la puntuación')
      }
    } catch (err) {
      console.error(err)
      setRatingError(err.message || 'No se pudo guardar la puntuación.')
    } finally {
      setRatingLoading(false)
    }
  }

  const clearRating = async () => {
    if (requireLogin() || ratingLoading || userRating == null || !TMDB_API_KEY)
      return
    try {
      setRatingLoading(true)
      setRatingError('')
      setUserRating(null)

      const url = `https://api.themoviedb.org/3/${endpointType}/${id}/rating?api_key=${TMDB_API_KEY}&session_id=${session}`

      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json;charset=utf-8'
        }
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.status_message || 'No se pudo borrar la puntuación')
      }
    } catch (err) {
      console.error(err)
      setRatingError(err.message || 'No se pudo borrar la puntuación.')
    } finally {
      setRatingLoading(false)
    }
  }

  // ====== EXTRAS: IMDb rating + premios ======
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

  // === Ratings por episodio (TV) ===
  const [ratings, setRatings] = useState(null)
  const [ratingsError, setRatingsError] = useState(null)
  const [ratingsLoading, setRatingsLoading] = useState(false)
  useEffect(() => {
    let ignore = false
    async function load() {
      if (type !== 'tv') return
      setRatingsLoading(true)
      setRatingsError(null)
      try {
        const res = await fetch(`/api/tv/${id}/ratings?excludeSpecials=true`)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'No se pudo obtener ratings')
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

  // ====== Cargar selección guardada de imágenes ======
  useEffect(() => {
    if (typeof window === 'undefined') return

    const savedPoster = window.localStorage.getItem(posterStorageKey)
    const savedPreviewBackdrop = window.localStorage.getItem(
      previewBackdropStorageKey
    )
    const savedBackground = window.localStorage.getItem(backgroundStorageKey)

    if (savedPoster) setSelectedPosterPath(savedPoster)
    if (savedPreviewBackdrop) setSelectedPreviewBackdropPath(savedPreviewBackdrop)

    // Migración suave: si no hay fondo guardado pero sí backdrop previo, úsalo como fondo
    if (savedBackground) {
      setSelectedBackgroundPath(savedBackground)
    } else if (savedPreviewBackdrop) {
      setSelectedBackgroundPath(savedPreviewBackdrop)
      window.localStorage.setItem(backgroundStorageKey, savedPreviewBackdrop)
    }
  }, [posterStorageKey, previewBackdropStorageKey, backgroundStorageKey])

  // ====== Cargar imágenes de TMDb ======
  useEffect(() => {
    let abort = false

    // Si el servidor ya ha devuelto images con append_to_response=images
    if (data?.images && !abort) {
      setImagesState((prev) => ({
        posters: mergeUniqueImages(prev.posters, data.images.posters || []),
        backdrops: mergeUniqueImages(prev.backdrops, data.images.backdrops || [])
      }))
      return
    }

    // Solo hacemos fetch extra para películas
    if (type !== 'movie') return

    if (!TMDB_API_KEY) {
      setImagesError(
        'Falta NEXT_PUBLIC_TMD_API_KEY para cargar las imágenes desde TMDb.'
      )
      return
    }

    const fetchImages = async () => {
      try {
        setImagesLoading(true)
        setImagesError('')

        const url = `https://api.themoviedb.org/3/movie/${id}/images?api_key=${TMDB_API_KEY}&include_image_language=en,null,es`
        const res = await fetch(url)
        const json = await res.json()

        if (!res.ok) {
          throw new Error(json?.status_message || 'No se pudieron obtener las imágenes')
        }

        if (!abort) {
          setImagesState((prev) => ({
            posters: mergeUniqueImages(prev.posters, json.posters || []),
            backdrops: mergeUniqueImages(prev.backdrops, json.backdrops || [])
          }))
        }
      } catch (err) {
        if (!abort) {
          console.error(err)
          setImagesError(
            err.message || 'No se pudieron obtener las imágenes disponibles.'
          )
        }
      } finally {
        if (!abort) setImagesLoading(false)
      }
    }

    fetchImages()

    return () => {
      abort = true
    }
  }, [type, id, data?.images])

  // ====== Handlers selección de poster / backdrops / fondo ======
  const handleSelectPoster = (filePath) => {
    setSelectedPosterPath(filePath)
    if (typeof window !== 'undefined') {
      if (filePath) {
        window.localStorage.setItem(posterStorageKey, filePath)
      } else {
        window.localStorage.removeItem(posterStorageKey)
      }
    }
  }

  // Backdrop para VISTA PREVIA
  const handleSelectPreviewBackdrop = (filePath) => {
    setSelectedPreviewBackdropPath(filePath)
    if (typeof window !== 'undefined') {
      if (filePath) {
        window.localStorage.setItem(previewBackdropStorageKey, filePath)
      } else {
        window.localStorage.removeItem(previewBackdropStorageKey)
      }
    }
  }

  // Fondo de la vista de detalles
  const handleSelectBackground = (filePath) => {
    setSelectedBackgroundPath(filePath)
    if (typeof window !== 'undefined') {
      if (filePath) {
        window.localStorage.setItem(backgroundStorageKey, filePath)
      } else {
        window.localStorage.removeItem(backgroundStorageKey)
      }
    }
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
  }

  // ====== Scroll horizontal imágenes: cálculo de flechas ======
  const updateImagesNav = () => {
    const el = imagesScrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const hasOverflow = scrollWidth > clientWidth + 1
    setCanPrevImages(hasOverflow && scrollLeft > 0)
    setCanNextImages(
      hasOverflow && scrollLeft + clientWidth < scrollWidth - 1
    )
  }

  const handleImagesScroll = () => {
    updateImagesNav()
  }

  const handlePrevImagesClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const el = imagesScrollRef.current
    if (!el) return
    el.scrollBy({ left: -400, behavior: 'smooth' })
  }

  const handleNextImagesClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const el = imagesScrollRef.current
    if (!el) return
    el.scrollBy({ left: 400, behavior: 'smooth' })
  }

  useEffect(() => {
    updateImagesNav()
    const onResize = () => updateImagesNav()
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResize)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onResize)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesState, activeImagesTab])

  const showPrevImages = isHoveredImages && canPrevImages
  const showNextImages = isHoveredImages && canNextImages

  // ===== UI helpers =====
  const scrollLeft = (ref) =>
    ref.current.scrollBy({ left: -400, behavior: 'smooth' })
  const scrollRight = (ref) =>
    ref.current.scrollBy({ left: 400, behavior: 'smooth' })
  const filmAffinitySearchUrl = `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(
    data.title || data.name
  )}`

  return (
    <div className="relative min-h-screen">
      {/* Fondo difuminado */}
      {useBackdrop && displayBackdropPath ? (
        <>
          <div
            className="absolute inset-4 z-0 bg-cover bg-center blur-[10px]"
            style={{
              backgroundImage: `url(https://image.tmdb.org/t/p/original${displayBackdropPath})`
            }}
          />
          <div className="absolute inset-0 z-0" />
        </>
      ) : (
        <div className="absolute inset-0 z-0 bg-black" />
      )}

      {/* Botón alternar fondo */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={() => setUseBackdrop((prev) => !prev)}
          className="p-2 rounded-full transition-colors"
          aria-label="Alternar fondo"
        >
          <ImageIcon
            className={`w-6 h-6 ${
              useBackdrop
                ? 'text-blue-500 hover:text-blue-400'
                : 'text-gray-500 hover:text-gray-400'
            }`}
          />
        </button>
      </div>

      {/* Capa oscura */}
      <div className="absolute inset-0 z-0 bg-black/50" />

      {/* Contenido */}
      <div className="relative z-10 px-4 py-10 lg:py-16 max-w-6xl mx-auto text-white">
        {/* Cabecera */}
        <div className="flex flex-col lg:flex-row gap-8 mb-12">
          <div className="w-full lg:w-1/3 max-w-sm flex flex-col gap-4">
            {displayPosterPath ? (
              <img
                src={`https://image.tmdb.org/t/p/w500${displayPosterPath}`}
                alt={title}
                className="rounded-lg shadow-lg w-full h-auto object-cover"
              />
            ) : (
              <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center rounded-lg shadow-lg">
                <ImageOff size={64} className="text-gray-500" />
              </div>
            )}

            {/* Plataformas */}
            {providers && providers.length > 0 && (
              <div className="mt-2">
                <div className="flex flex-wrap gap-1">
                  {providers.map((p) => (
                    <div key={p.provider_id} className="p-2 flex items-center">
                      <img
                        src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                        alt={p.provider_name}
                        className="w-10 h-10 object-contain rounded-lg transition-transform duration-300 ease-in-out hover:scale-110"
                      />
                    </div>
                  ))}
                  <a
                    href={`https://www.themoviedb.org/${type}/${id}/watch`}
                    target="_blank"
                    className="p-2 flex items-center"
                    rel="noreferrer"
                  >
                    <img
                      src="https://play-lh.googleusercontent.com/Riuz226TXAawu8ZXlL7wnsjtMHkTMTDh_RSRiozAdoKe2TyGG4cLp3rPB0CxQFEUzFc"
                      alt="JustWatch"
                      className="object-contain w-11 h-11 rounded-lg transition-transform duration-300 ease-in-out hover:scale-110"
                    />
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-4">
            {/* Título + icon buttons */}
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-4xl font-bold mt-2">{title}</h1>

              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={toggleFavorite}
                  disabled={favLoading}
                  title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                  className="w-10 h-10 rounded-full bg-neutral-700/60 hover:bg-neutral-600/80 backdrop-blur-sm border border-neutral-600/50 flex items-center justify-center text-white transition-colors disabled:opacity-60"
                >
                  {favLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : favorite ? (
                    <HeartOff className="w-5 h-5" />
                  ) : (
                    <Heart className="w-5 h-5" />
                  )}
                </button>

                <button
                  onClick={toggleWatchlist}
                  disabled={wlLoading}
                  title={
                    watchlist ? 'Quitar de pendientes' : 'Añadir a pendientes'
                  }
                  className="w-10 h-10 rounded-full bg-neutral-700/60 hover:bg-neutral-600/80 backdrop-blur-sm border border-neutral-600/50 flex items-center justify-center text-white transition-colors disabled:opacity-60"
                >
                  {wlLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : watchlist ? (
                    <BookmarkMinus className="w-5 h-5" />
                  ) : (
                    <BookmarkPlus className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Fila: TMDb + IMDb + Premios */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-5 text-emerald-300">
                <span className="inline-flex items-center gap-2">
                  <img
                    src="/logo-TMDb.png"
                    alt="TMDb"
                    className="h-4 w-auto rounded-[3px]"
                  />
                  <span className="text-white/90">
                    {Number(data.vote_average || 0).toFixed(1)}
                  </span>
                </span>

                {typeof extras.imdbRating === 'number' && (
                  <span className="inline-flex items-center gap-2">
                    <img
                      src="/logo-IMDb.png"
                      alt="IMDb"
                      className="h-4 w-auto"
                    />
                    <span className="text-white/90">
                      {extras.imdbRating.toFixed(1)}
                    </span>
                  </span>
                )}

                {extras.awards && (
                  <span className="truncate">{extras.awards}</span>
                )}
              </div>

              {/* Tu puntuación */}
              {session && account?.id ? (
                <div className="mt-2 text-sm text-gray-200">
                  {ratingLoading && !ratingError && (
                    <div className="flex items-center gap-2 mb-2 h-10">
                      <Loader2 className="w-4 h-4 animate-spin text-yellow-300" />
                      <span className="text-gray-300">Guardando...</span>
                    </div>
                  )}

                  <div className={ratingLoading ? 'hidden' : ''}>
                    <StarRating
                      rating={userRating}
                      onRating={sendRating}
                      onClearRating={clearRating}
                      disabled={ratingLoading}
                    />
                  </div>

                  {ratingError && (
                    <p className="mt-1 text-xs text-red-400">{ratingError}</p>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-xs text-gray-400">
                  Inicia sesión para poder puntuar esta{' '}
                  {type === 'tv' ? 'serie' : 'película'}.
                </p>
              )}
            </div>

            {/* Tagline + overview */}
            {data.tagline && (
              <p className="italic text-gray-300 mt-1">
                <TagIcon className="inline w-4 h-4 mr-1" /> {data.tagline}
              </p>
            )}
            {data.overview && (
              <p className="text-gray-300 text-base leading-relaxed">
                <MessageSquareIcon className="inline w-4 h-4 mr-1" />{' '}
                {data.overview}
              </p>
            )}

            {/* Enlaces externos */}
            {(data.homepage || data.imdb_id) && (
              <div className="flex flex-wrap gap-4 items-center">
                {data.homepage && (
                  <a
                    href={data.homepage}
                    target="_blank"
                    className="text-green-400 hover:underline inline-flex items-center gap-2"
                    rel="noreferrer"
                  >
                    <LinkIcon className="w-4 h-4 text-green-300" />
                    <strong>Sitio web</strong>
                  </a>
                )}
                {(data.imdb_id || extras.imdbRating !== null) && (
                  <>
                    {data.imdb_id && (
                      <a
                        href={`https://www.imdb.com/title/${data.imdb_id}`}
                        target="_blank"
                        className="text-yellow-400 hover:underline inline-flex items-center gap-2"
                        rel="noreferrer"
                      >
                        <LinkIcon className="w-4 h-4 text-yellow-300" />
                        <strong>IMDb</strong>
                      </a>
                    )}
                    <a
                      href={filmAffinitySearchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline inline-flex items-center gap-2"
                    >
                      <LinkIcon className="w-4 h-4 text-blue-300" />
                      <strong>FilmAffinity</strong>
                    </a>
                  </>
                )}
              </div>
            )}

            {/* Chips de géneros */}
            <div className="flex flex-wrap gap-2">
              {data.genres?.map((genre) => {
                const genreColors = {
                  Acción: 'bg-red-500',
                  Aventura: 'bg-amber-600',
                  Animación: 'bg-orange-500',
                  Comedia: 'bg-yellow-400',
                  Crimen: 'bg-rose-700',
                  Documental: 'bg-slate-500',
                  Drama: 'bg-blue-500',
                  Familia: 'bg-indigo-400',
                  Fantasía: 'bg-fuchsia-600',
                  Historia: 'bg-zinc-600',
                  Terror: 'bg-purple-700',
                  Música: 'bg-emerald-500',
                  Misterio: 'bg-teal-700',
                  Romance: 'bg-pink-500',
                  'Ciencia ficción': 'bg-cyan-600',
                  'Película de TV': 'bg-lime-600',
                  Suspense: 'bg-green-500',
                  Bélica: 'bg-gray-600',
                  Western: 'bg-neutral-600'
                }
                const genreColor =
                  genreColors[genre.name] || 'bg-gray-600'
                return (
                  <span
                    key={genre.id}
                    className={`${genreColor} text-white px-3 py-1.5 rounded-full text-sm`}
                  >
                    {genre.name}
                  </span>
                )
              })}
            </div>

            {/* Tabla de metadatos */}
            <div className="text-sm text-gray-300 bg-gray-800 p-5 rounded-lg shadow-md space-y-1">
              {data.original_title && (
                <p>
                  <FilmIcon className="inline w-4 h-4 mr-2 text-blue-400" />{' '}
                  <strong>Título original:</strong> {data.original_title}
                </p>
              )}
              {data.release_date && (
                <p>
                  <CalendarIcon className="inline w-4 h-4 mr-2 text-green-400" />{' '}
                  <strong>Estreno:</strong> {data.release_date}
                </p>
              )}
              {data.runtime && (
                <p>
                  <ClockIcon className="inline w-4 h-4 mr-2 text-yellow-400" />{' '}
                  <strong>Duración:</strong> {data.runtime} min
                </p>
              )}
              {data.original_language && (
                <p>
                  <GlobeIcon className="inline w-4 h-4 mr-2 text-purple-400" />{' '}
                  <strong>Idioma:</strong> {data.original_language}
                </p>
              )}
              {data.vote_average && (
                <p>
                  <StarIcon className="inline w-4 h-4 mr-2 text-yellow-300" />{' '}
                  <strong>Nota media:</strong>{' '}
                  {data.vote_average.toFixed(1)}
                </p>
              )}
              {data.vote_count && (
                <p>
                  <StarIcon className="inline w-4 h-4 mr-2 text-yellow-300" />{' '}
                  <strong>Votos:</strong> {data.vote_count}
                </p>
              )}
              {type === 'tv' && (
                <>
                  {data.first_air_date && (
                    <p>
                      <CalendarIcon className="inline w-4 h-4 mr-2 text-green-400" />{' '}
                      <strong>Primera emisión:</strong>{' '}
                      {data.first_air_date}
                    </p>
                  )}
                  {data.last_air_date && (
                    <p>
                      <CalendarIcon className="inline w-4 h-4 mr-2 text-red-400" />{' '}
                      <strong>Última emisión:</strong> {data.last_air_date}
                    </p>
                  )}
                  {data.number_of_seasons && (
                    <p>
                      <FilmIcon className="inline w-4 h-4 mr-2 text-blue-300" />{' '}
                      <strong>Temporadas:</strong>{' '}
                      {data.number_of_seasons}
                    </p>
                  )}
                  {data.number_of_episodes && (
                    <p>
                      <FilmIcon className="inline w-4 h-4 mr-2 text-blue-300" />{' '}
                      <strong>Episodios:</strong>{' '}
                      {data.number_of_episodes}
                    </p>
                  )}
                  {data.episode_run_time?.[0] && (
                    <p>
                      <ClockIcon className="inline w-4 h-4 mr-2 text-yellow-400" />{' '}
                      <strong>Duración por episodio:</strong>{' '}
                      {data.episode_run_time[0]} min
                    </p>
                  )}
                  {data.status && (
                    <p>
                      <StarIcon className="inline w-4 h-4 mr-2 text-gray-300" />{' '}
                      <strong>Estado:</strong> {data.status}
                    </p>
                  )}
                </>
              )}
              {data.budget > 0 && (
                <p>
                  <BadgeDollarSignIcon className="inline w-4 h-4 mr-2 text-green-500" />{' '}
                  <strong>Presupuesto:</strong> $
                  {data.budget.toLocaleString()}
                </p>
              )}
              {data.revenue > 0 && (
                <p>
                  <BadgeDollarSignIcon className="inline w-4 h-4 mr-2 text-green-500" />{' '}
                  <strong>Recaudación:</strong> $
                  {data.revenue.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* === SELECCIÓN DE IMÁGENES (solo películas) === */}
        {type === 'movie' && (
          <section className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">
                  Imágenes de la película
                </h2>
                <p className="text-xs text-gray-400">
                  Elige la portada, el backdrop de vista previa y el fondo de la
                  ficha. Se guardará en este navegador para futuras visitas.
                </p>
              </div>

              {(selectedPosterPath ||
                selectedPreviewBackdropPath ||
                selectedBackgroundPath) && (
                <button
                  onClick={handleResetArtwork}
                  className="px-3 py-1 text-xs rounded-full bg-neutral-800 hover:bg-neutral-700 text-gray-200 border border-neutral-600"
                >
                  Restaurar imágenes por defecto
                </button>
              )}
            </div>

            {/* Tabs posters / backdrops / fondo */}
            <div className="inline-flex items-center bg-neutral-900/80 rounded-full p-1 border border-neutral-700 mb-4">
              <button
                type="button"
                onClick={() => setActiveImagesTab('posters')}
                className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                  activeImagesTab === 'posters'
                    ? 'bg-white text-black'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Portadas
              </button>
              <button
                type="button"
                onClick={() => setActiveImagesTab('backdrops')}
                className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                  activeImagesTab === 'backdrops'
                    ? 'bg-white text-black'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Backdrops
              </button>
              <button
                type="button"
                onClick={() => setActiveImagesTab('background')}
                className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                  activeImagesTab === 'background'
                    ? 'bg-white text-black'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Fondo
              </button>
            </div>

            {/* Estado de carga / error */}
            {imagesLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-300 mb-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando imágenes desde TMDb...
              </div>
            )}
            {imagesError && (
              <div className="bg-red-600/20 border border-red-700 text-red-300 p-3 rounded-lg mb-3 text-sm">
                {imagesError}
              </div>
            )}

            {/* Listado de imágenes con flechas y fondo difuminado lateral */}
            <div
              className="relative"
              onMouseEnter={() => setIsHoveredImages(true)}
              onMouseLeave={() => setIsHoveredImages(false)}
            >
              <div
                ref={imagesScrollRef}
                onScroll={handleImagesScroll}
                className="flex gap-3 overflow-x-auto pb-2 no-scrollbar"
              >
                {(activeImagesTab === 'posters'
                  ? imagesState.posters
                  : imagesState.backdrops
                ).map((img) => {
                  const filePath = img.file_path

                  const isPosterTab = activeImagesTab === 'posters'
                  const isPreviewTab = activeImagesTab === 'backdrops'
                  const isBackgroundTab = activeImagesTab === 'background'

                  let isActive = false
                  if (isPosterTab) {
                    isActive = displayPosterPath === filePath
                  } else if (isPreviewTab) {
                    isActive = selectedPreviewBackdropPath === filePath
                  } else if (isBackgroundTab) {
                    isActive = displayBackdropPath === filePath
                  }

                  const handleClick = () => {
                    if (isPosterTab) {
                      handleSelectPoster(filePath)
                    } else if (isPreviewTab) {
                      handleSelectPreviewBackdrop(filePath)
                    } else {
                      handleSelectBackground(filePath)
                    }
                  }

                  return (
                    <button
                      key={`${activeImagesTab}-${filePath}`}
                      type="button"
                      onClick={handleClick}
                      className={`relative flex-shrink-0 rounded-lg overflow-hidden border-2 ${
                        isActive
                          ? 'border-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.6)]'
                          : 'border-transparent hover:border-neutral-500'
                      } transition-all`}
                    >
                      <img
                        src={`https://image.tmdb.org/t/p/${
                          isPosterTab ? 'w342' : 'w780'
                        }${filePath}`}
                        alt={`${title} ${
                          isPosterTab ? 'poster' : 'backdrop'
                        }`}
                        className={`${
                          isPosterTab
                            ? 'w-[150px] aspect-[2/3]'
                            : 'w-[260px] aspect-[16/9]'
                        } object-cover`}
                      />

                      {isActive && (
                        <div className="absolute top-1 left-1 px-2 py-0.5 rounded-full bg-emerald-500/90 text-[10px] font-semibold text-black">
                          Usando
                        </div>
                      )}
                    </button>
                  )
                })}

                {/* Sin resultados en la pestaña actual */}
                {!imagesLoading &&
                  !imagesError &&
                  (activeImagesTab === 'posters'
                    ? imagesState.posters.length === 0
                    : imagesState.backdrops.length === 0) && (
                    <div className="text-sm text-gray-400">
                      No hay{' '}
                      {activeImagesTab === 'posters'
                        ? 'portadas'
                        : activeImagesTab === 'backdrops'
                        ? 'backdrops'
                        : 'fondos'}{' '}
                      adicionales disponibles para esta película.
                    </div>
                  )}
              </div>

              {/* LATERAL IZQUIERDO – franja difuminada */}
              {showPrevImages && (
                <button
                  type="button"
                  onClick={handlePrevImagesClick}
                  className="absolute inset-y-0 left-0 w-20 z-30
                             hidden sm:flex items-center justify-start
                             bg-gradient-to-r from-black/80 via-black/55 to-transparent
                             hover:from-black/95 hover:via-black/75
                             transition-colors pointer-events-auto"
                >
                  <span className="ml-3 text-3xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
                    ‹
                  </span>
                </button>
              )}

              {/* LATERAL DERECHO – franja difuminada */}
              {showNextImages && (
                <button
                  type="button"
                  onClick={handleNextImagesClick}
                  className="absolute inset-y-0 right-0 w-20 z-30
                             hidden sm:flex items-center justify-end
                             bg-gradient-to-l from-black/80 via-black/55 to-transparent
                             hover:from-black/95 hover:via-black/75
                             transition-colors pointer-events-auto"
                >
                  <span className="mr-3 text-3xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
                    ›
                  </span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* === Puntuaciones por episodio (TV) === */}
        {type === 'tv' && (
          <section className="mt-10">
            {ratingsLoading && (
              <div className="text-sm text-gray-300">
                Cargando ratings…
              </div>
            )}
            {ratingsError && (
              <div className="bg-red-600/20 border border-red-700 text-red-300 p-3 rounded-lg">
                {ratingsError}
              </div>
            )}
            {ratings && (
              <EpisodeRatingsGrid
                ratings={ratings}
                initialSource="avg"
                density="compact"
              />
            )}
          </section>
        )}

        {/* Reparto */}
        {castData && castData.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-white mb-4">
              Reparto principal
            </h2>
            <Swiper
              spaceBetween={20}
              slidesPerView={6}
              breakpoints={{
                640: { slidesPerView: 1, spaceBetween: 10 },
                768: { slidesPerView: 2, spaceBetween: 10 },
                1024: { slidesPerView: 6, spaceBetween: 20 }
              }}
            >
              {castData.slice(0, 20).map((actor) => (
                <SwiperSlide
                  key={actor.id}
                  className="flex-shrink-0 text-center"
                >
                  <div className="relative">
                    <a
                      href={`/details/person/${actor.id}`}
                      className="block"
                    >
                      {actor.profile_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w300${actor.profile_path}`}
                          alt={actor.name}
                          className="w-full aspect-[2/3] object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center rounded-lg">
                          <ImageOff
                            size={48}
                            className="text-gray-500"
                          />
                        </div>
                      )}
                      <div className="text-white p-2">
                        <p className="font-semibold text-sm">
                          {actor.name}
                        </p>
                        {actor.character && (
                          <p className="text-xs text-gray-400">
                            {actor.character}
                          </p>
                        )}
                      </div>
                    </a>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        )}

        {/* Críticas */}
        {reviews && reviews.length > 0 && (
          <div className="mt-12">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                Críticas de usuarios
              </h2>
              {reviewLimit < reviews.length && (
                <button
                  onClick={() => setReviewLimit(reviewLimit + 2)}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
                >
                  Ver más críticas
                </button>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {reviews.slice(0, reviewLimit).map((review) => {
                const {
                  author,
                  content,
                  created_at,
                  id: rid,
                  author_details
                } = review
                const avatar = author_details?.avatar_path?.includes(
                  '/https'
                )
                  ? author_details.avatar_path.slice(1)
                  : `https://image.tmdb.org/t/p/w45${author_details?.avatar_path}`
                const rating = author_details?.rating

                return (
                  <div
                    key={rid}
                    className="bg-gray-800 p-4 rounded-lg flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-3">
                      {author_details?.avatar_path && (
                        <img
                          src={avatar}
                          alt={author}
                          className="w-10 h-10 rounded-full object-cover border border-gray-600"
                        />
                      )}
                      <div>
                        <p className="text-white font-semibold">
                          {author_details?.username || author}
                        </p>
                        <p className="text-sm text-gray-400">
                          {new Date(created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {rating && (
                      <p className="text-yellow-400 text-sm mt-1">
                        <strong>{rating} ⭐</strong>
                      </p>
                    )}

                    <p
                      className="text-gray-300 whitespace-pre-wrap text-sm mb-2"
                      dangerouslySetInnerHTML={{
                        __html: content.slice(0, 300) + '...'
                      }}
                    />

                    <a
                      href={`https://www.themoviedb.org/review/${rid}`}
                      target="_blank"
                      className="text-blue-400 text-sm self-start"
                      rel="noreferrer"
                    >
                      Leer más →
                    </a>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recomendaciones */}
        {recommendations && recommendations.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-white mb-4">
              Recomendaciones
            </h2>
            <Swiper
              spaceBetween={20}
              slidesPerView={6}
              breakpoints={{
                640: { slidesPerView: 1, spaceBetween: 10 },
                768: { slidesPerView: 2, spaceBetween: 10 },
                1024: { slidesPerView: 6, spaceBetween: 20 }
              }}
            >
              {recommendations.slice(0, 20).map((rec) => (
                <SwiperSlide
                  key={rec.id}
                  className="flex-shrink-0 text-center"
                >
                  <div className="relative">
                    <a
                      href={`/details/${rec.media_type || type}/${rec.id}`}
                      className="block"
                    >
                      {rec.poster_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w300${rec.poster_path}`}
                          alt={rec.title || rec.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center rounded-lg">
                          <ImageOff
                            size={48}
                            className="text-gray-500"
                          />
                        </div>
                      )}
                      <div className="text-white p-2">
                        <p className="font-semibold text-sm">
                          {rec.title || rec.name}
                        </p>
                        {rec.vote_average && (
                          <p className="text-xs text-yellow-400">
                            ⭐ {rec.vote_average.toFixed(1)}
                          </p>
                        )}
                      </div>
                    </a>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        )}
      </div>
    </div>
  )
}
