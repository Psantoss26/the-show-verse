// DetailsClient.jsx
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
  Star as StarIcon,
  MessageSquareIcon,
  BadgeDollarSignIcon,
  LinkIcon,
  TagIcon,
  ChevronLeft,
  ImageIcon,
  ChevronRight,
  ImageOff,
  Heart,
  Bookmark,
  BookmarkCheck,
} from 'lucide-react'

/* ========================
 * Helpers de sesión (cliente)
 * ======================== */
function getCookie(name) {
  if (typeof document === 'undefined') return null
  const row = document.cookie.split('; ').find(r => r.startsWith(`${name}=`))
  return row ? decodeURIComponent(row.split('=')[1]) : null
}

function getTmdbSessionId() {
  try {
    // 1) localStorage 'tmdb_session_id'
    const s1 = localStorage.getItem('tmdb_session_id')
    if (s1) return s1
    // 2) localStorage 'tmdb_account' -> { session_id }
    const acc = JSON.parse(localStorage.getItem('tmdb_account') || 'null')
    if (acc?.session_id) return acc.session_id
    // 3) cookie 'tmdb_session_id'
    const s3 = getCookie('tmdb_session_id')
    if (s3) return s3
  } catch {}
  return null
}

/** =======================
 *  Componente rating estrellas (0.5 pasos → 0..10)
 *  ======================= */
function StarRating({ value10, onChange, onClear }) {
  const [hover, setHover] = useState(null) // 0..10
  const current = hover ?? value10 ?? 0

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center">
        {[0, 1, 2, 3, 4].map((i) => {
          const leftVal = i * 2 + 1 // 0.5, 2.5, ...
          const rightVal = (i + 1) * 2 // 1.0, 3.0, ...
          const fill = Math.min(Math.max(current - i * 2, 0), 2) // 0..2 por estrella

          return (
            <div key={i} className="relative w-8 h-8">
              {/* base */}
              <StarIcon className="w-8 h-8 text-zinc-600" />
              {/* mitad izquierda */}
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${Math.min(fill, 1) * 100}%` }}>
                <StarIcon className="w-8 h-8 text-yellow-400 fill-yellow-400" />
              </div>
              {/* mitad derecha extra si >1 */}
              {fill > 1 && (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ left: '50%', width: `${(fill - 1) * 100}%` }}
                >
                  <StarIcon className="w-8 h-8 text-yellow-400 fill-yellow-400" />
                </div>
              )}
              {/* zonas click/hover */}
              <button
                className="absolute left-0 top-0 h-full w-1/2"
                onMouseEnter={() => setHover(leftVal)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onChange(leftVal)}
                aria-label={`${(leftVal / 2).toFixed(1)} estrellas`}
              />
              <button
                className="absolute right-0 top-0 h-full w-1/2"
                onMouseEnter={() => setHover(rightVal)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onChange(rightVal)}
                aria-label={`${(rightVal / 2).toFixed(1)} estrellas`}
              />
            </div>
          )
        })}
      </div>

      {value10 != null ? (
        <button onClick={onClear} className="text-xs text-zinc-400 hover:text-zinc-200 underline">
          Quitar mi puntuación ({(value10 / 2).toFixed(1)})
        </button>
      ) : (
        <span className="text-xs text-zinc-400">Tu nota</span>
      )}
    </div>
  )
}

export default function DetailsClient({ type, id, data, recommendations, castData, providers, reviews }) {
  const image = data.poster_path || data.profile_path
  const title = data.title || data.name
  const recRef = useRef()
  const [reviewLimit, setReviewLimit] = useState(2)
  const [useBackdrop, setUseBackdrop] = useState(true)

  const scrollLeft = (ref) => ref.current.scrollBy({ left: -400, behavior: 'smooth' })
  const scrollRight = (ref) => ref.current.scrollBy({ left: 400, behavior: 'smooth' })

  const filmAffinitySearchUrl = `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(
    data.title || data.name
  )}`

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

  // === Estado TMDb del usuario (solo PELÍCULAS) ===
  const [sessionId, setSessionId] = useState(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [fav, setFav] = useState(false)
  const [wl, setWl] = useState(false)
  // myRating en TU escala (0..10, pasos 0.5). TMDB usa 0.5..10 → multiplicamos/dividimos x2
  const [myRating, setMyRating] = useState(null)

  useEffect(() => {
    const s = getTmdbSessionId()
    setSessionId(s)
    setSessionReady(true)
    console.log('[TMDB] sessionId detectado en DetailsClient:', s)
  }, [])

  // Cargar account_states (y normalizar rating)
  useEffect(() => {
    if (type !== 'movie' || !sessionId || !id) return
    let ignore = false
    const load = async () => {
      const r = await fetch(`/api/tmdb/account/states/movies/${id}?session_id=${sessionId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!ignore && r.ok) {
        setFav(!!j.favorite)
        setWl(!!j.watchlist)
        const v =
          j?.rated && typeof j.rated === 'object' && j.rated.value != null ? j.rated.value * 2 : null
        setMyRating(v)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [type, id, sessionId])

  // Helper para refrescar states tras una acción
  const refreshStates = async () => {
    if (type !== 'movie' || !sessionId || !id) return
    const r = await fetch(`/api/tmdb/account/states/movies/${id}?session_id=${sessionId}`, { cache: 'no-store' })
    if (!r.ok) return
    const j = await r.json()
    setFav(!!j.favorite)
    setWl(!!j.watchlist)
    const v = j?.rated && typeof j.rated === 'object' && j.rated.value != null ? j.rated.value * 2 : null
    setMyRating(v)
  }

  const toggleFavorite = async () => {
    if (!sessionId) return alert('Inicia sesión en TMDb')
    const want = !fav
    setFav(want) // UI optimista
    try {
      await fetch('/api/tmdb/account/favorite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          media_id: Number(id),
          media_type: 'movie',
          favorite: want,
        }),
      })
      await refreshStates()
    } catch {
      setFav(!want) // revertir si falla
    }
  }

  const toggleWatchlist = async () => {
    if (!sessionId) return alert('Inicia sesión en TMDb')
    const want = !wl
    setWl(want) // UI optimista
    try {
      await fetch('/api/tmdb/account/watchlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          media_id: Number(id),
          media_type: 'movie',
          watchlist: want,
        }),
      })
      await refreshStates()
    } catch {
      setWl(!want) // revertir si falla
    }
  }

  const submitRating = async (value10) => {
    if (!sessionId) return alert('Inicia sesión en TMDb')
    setMyRating(value10) // UI optimista
    try {
      await fetch(`/api/tmdb/movies/${id}/rating`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, value: value10 / 2 }), // TMDB espera 0.5..10
      })
      await refreshStates()
    } catch {
      await refreshStates()
    }
  }

  const clearRating = async () => {
    if (!sessionId) return alert('Inicia sesión en TMDb')
    const prev = myRating
    setMyRating(null) // UI optimista
    try {
      await fetch(`/api/tmdb/movies/${id}/rating?session_id=${sessionId}`, { method: 'DELETE' })
      await refreshStates()
    } catch {
      setMyRating(prev) // revertir si falla
    }
  }

  return (
    <div className="relative min-h-screen">
      {/* Fondo difuminado */}
      {useBackdrop && data.backdrop_path ? (
        <>
          <div
            className="absolute inset-4 z-0 bg-cover bg-center blur-[10px]"
            style={{
              backgroundImage: `url(https://image.tmdb.org/t/p/original${data.backdrop_path})`,
            }}
          />
          <div className="absolute inset-0 z-0" />
        </>
      ) : (
        <div className="absolute inset-0 z-0 bg-black" />
      )}

      {/* Botón de alternancia de fondo */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={() => setUseBackdrop((prev) => !prev)}
          className="p-2 rounded-full transition-colors"
          aria-label="Alternar fondo"
        >
          <ImageIcon
            className={`w-6 h-6 ${
              useBackdrop ? 'text-blue-500 hover:text-blue-400' : 'text-gray-500 hover:text-gray-400'
            }`}
          />
        </button>
      </div>

      {/* Capa oscura sutil opcional para contraste */}
      <div className="absolute inset-0 z-0 bg-black/50" />

      {/* Contenido principal */}
      <div className="relative z-10 px-4 py-10 lg:py-16 max-w-6xl mx-auto text-white">
        {/* Cabecera */}
        <div className="flex flex-col lg:flex-row gap-8 mb-12">
          <div className="w-full lg:w-1/3 max-w-sm flex flex-col gap-4">
            {image ? (
              <img
                src={`https://image.tmdb.org/t/p/w500${image}`}
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

                  {/* Icono de JustWatch */}
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

          <div className="flex-1 flex flex-col gap-6">
            {/* Título + acciones */}
            <div>
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-4xl font-bold mb-2 mt-2">{title}</h1>

                {/* Acciones (solo películas) */}
                {type === 'movie' && (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={toggleFavorite}
                      disabled={!sessionReady}
                      className={`px-3 py-1.5 rounded-full border text-sm flex items-center gap-1
                        ${
                          fav
                            ? 'bg-red-600/20 text-red-400 border-red-500/40'
                            : 'text-zinc-300 border-zinc-600 hover:bg-zinc-800'
                        } ${!sessionReady ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={fav ? 'Quitar de Favoritos' : 'Añadir a Favoritos'}
                    >
                      <Heart className={`w-4 h-4 ${fav ? 'fill-red-500 text-red-500' : ''}`} />
                      <span>Favorito</span>
                    </button>

                    <button
                      onClick={toggleWatchlist}
                      disabled={!sessionReady}
                      className={`px-3 py-1.5 rounded-full border text-sm flex items-center gap-1
                        ${
                          wl
                            ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                            : 'text-zinc-300 border-zinc-600 hover:bg-zinc-800'
                        } ${!sessionReady ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={wl ? 'Quitar de Watchlist' : 'Añadir a Watchlist'}
                    >
                      {wl ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                      <span>Watchlist</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Tagline */}
              {data.tagline && (
                <p className="italic text-gray-300 mb-4">
                  <TagIcon className="inline w-4 h-4 mr-1" /> {data.tagline}
                </p>
              )}

              {/* Overview */}
              {data.overview && (
                <p className="text-gray-300 text-base leading-relaxed">
                  <MessageSquareIcon className="inline w-4 h-4 mr-1" /> {data.overview}
                </p>
              )}

              {/* Mis estrellas (solo películas) */}
              {type === 'movie' && (
                <div className="mt-2">
                  <StarRating
                    value10={myRating}
                    onChange={(v) => (sessionReady ? submitRating(v) : null)}
                    onClear={() => (sessionReady ? clearRating() : null)}
                  />
                </div>
              )}
            </div>

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
                {data.imdb_id && (
                  <>
                    <a
                      href={`https://www.imdb.com/title/${data.imdb_id}`}
                      target="_blank"
                      className="text-yellow-400 hover:underline inline-flex items-center gap-2"
                      rel="noreferrer"
                    >
                      <LinkIcon className="w-4 h-4 text-yellow-300" />
                      <strong>IMDb</strong>
                    </a>

                    <a
                      href={`https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(title)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline inline-flex items-center gap-2"
                    >
                      <LinkIcon className="w-4 h-4 text-blue-300" />
                      <strong>FilmAffinity</strong>
                    </a>
                  </>
                )}
                {type === 'tv' && data.imdb_id && (
                  <a
                    href={`https://tvcharts.co/show/${title.toLowerCase().split(' ').join('-')}-${data.imdb_id}`}
                    target="_blank"
                    className="text-pink-400 hover:underline inline-flex items-center gap-2"
                    rel="noreferrer"
                  >
                    <LinkIcon className="w-4 h-4 text-pink-300" />
                    <strong>TV Charts</strong>
                  </a>
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
                  Western: 'bg-neutral-600',
                }
                const genreColor = genreColors[genre.name] || 'bg-gray-600'
                return (
                  <span key={genre.id} className={`${genreColor} text-white px-3 py-1.5 rounded-full text-sm`}>
                    {genre.name}
                  </span>
                )
              })}
            </div>

            {/* Datos básicos */}
            <div className="text-sm text-gray-300 bg-gray-800 p-5 rounded-lg shadow-md space-y-1">
              {data.original_title && (
                <p>
                  <FilmIcon className="inline w-4 h-4 mr-2 text-blue-400" /> <strong>Título original:</strong>{' '}
                  {data.original_title}
                </p>
              )}
              {data.release_date && (
                <p>
                  <CalendarIcon className="inline w-4 h-4 mr-2 text-green-400" /> <strong>Estreno:</strong>{' '}
                  {data.release_date}
                </p>
              )}
              {data.runtime && (
                <p>
                  <ClockIcon className="inline w-4 h-4 mr-2 text-yellow-400" /> <strong>Duración:</strong>{' '}
                  {data.runtime} min
                </p>
              )}
              {data.original_language && (
                <p>
                  <GlobeIcon className="inline w-4 h-4 mr-2 text-purple-400" /> <strong>Idioma:</strong>{' '}
                  {data.original_language}
                </p>
              )}
              {data.vote_average && (
                <p>
                  <StarIcon className="inline w-4 h-4 mr-2 text-yellow-300" /> <strong>Nota media:</strong>{' '}
                  {data.vote_average.toFixed(1)}
                </p>
              )}
              {data.vote_count && (
                <p>
                  <StarIcon className="inline w-4 h-4 mr-2 text-yellow-300" /> <strong>Votos:</strong>{' '}
                  {data.vote_count}
                </p>
              )}
              {type === 'tv' && (
                <>
                  {data.first_air_date && (
                    <p>
                      <CalendarIcon className="inline w-4 h-4 mr-2 text-green-400" /> <strong>Primera emisión:</strong>{' '}
                      {data.first_air_date}
                    </p>
                  )}
                  {data.last_air_date && (
                    <p>
                      <CalendarIcon className="inline w-4 h-4 mr-2 text-red-400" /> <strong>Última emisión:</strong>{' '}
                      {data.last_air_date}
                    </p>
                  )}
                  {data.number_of_seasons && (
                    <p>
                      <FilmIcon className="inline w-4 h-4 mr-2 text-blue-300" /> <strong>Temporadas:</strong>{' '}
                      {data.number_of_seasons}
                    </p>
                  )}
                  {data.number_of_episodes && (
                    <p>
                      <FilmIcon className="inline w-4 h-4 mr-2 text-blue-300" /> <strong>Episodios:</strong>{' '}
                      {data.number_of_episodes}
                    </p>
                  )}
                  {data.episode_run_time?.[0] && (
                    <p>
                      <ClockIcon className="inline w-4 h-4 mr-2 text-yellow-400" /> <strong>Duración por episodio:</strong>{' '}
                      {data.episode_run_time[0]} min
                    </p>
                  )}
                  {data.status && (
                    <p>
                      <StarIcon className="inline w-4 h-4 mr-2 text-gray-300" /> <strong>Estado:</strong> {data.status}
                    </p>
                  )}
                </>
              )}
              {data.budget > 0 && (
                <p>
                  <BadgeDollarSignIcon className="inline w-4 h-4 mr-2 text-green-500" /> <strong>Presupuesto:</strong> $
                  {data.budget.toLocaleString()}
                </p>
              )}
              {data.revenue > 0 && (
                <p>
                  <BadgeDollarSignIcon className="inline w-4 h-4 mr-2 text-green-500" /> <strong>Recaudación:</strong> $
                  {data.revenue.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* === Sección de Puntuaciones por episodio === */}
        {type === 'tv' && (
          <section className="mt-10">
            {ratingsLoading && <div className="text-sm text-gray-300">Cargando ratings…</div>}
            {ratingsError && (
              <div className="bg-red-600/20 border border-red-700 text-red-300 p-3 rounded-lg">{ratingsError}</div>
            )}
            {ratings && <EpisodeRatingsGrid ratings={ratings} initialSource="avg" density="compact" />}
          </section>
        )}

        {/* Carrusel de Reparto principal */}
        {castData && castData.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-white mb-4">Reparto principal</h2>
            <Swiper
              spaceBetween={20}
              slidesPerView={6}
              breakpoints={{
                640: { slidesPerView: 1, spaceBetween: 10 },
                768: { slidesPerView: 2, spaceBetween: 10 },
                1024: { slidesPerView: 6, spaceBetween: 20 },
              }}
            >
              {castData.slice(0, 20).map((actor) => (
                <SwiperSlide key={actor.id} className="flex-shrink-0 text-center">
                  <div className="relative">
                    <a href={`/details/person/${actor.id}`} className="block">
                      {actor.profile_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w300${actor.profile_path}`}
                          alt={actor.name}
                          className="w-full aspect-[2/3] object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center rounded-lg">
                          <ImageOff size={48} className="text-gray-500" />
                        </div>
                      )}

                      <div className="text-white p-2">
                        <p className="font-semibold text-sm">{actor.name}</p>
                        {actor.character && <p className="text-xs text-gray-400">{actor.character}</p>}
                      </div>
                    </a>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        )}

        {/* Carrusel de Críticas */}
        {reviews && reviews.length > 0 && (
          <div className="mt-12">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">Críticas de usuarios</h2>
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
                const { author, content, created_at, id, author_details } = review
                const avatar = author_details?.avatar_path?.includes('/https')
                  ? author_details.avatar_path.slice(1)
                  : `https://image.tmdb.org/t/p/w45${author_details?.avatar_path}`
                const rating = author_details?.rating

                return (
                  <div key={id} className="bg-gray-800 p-4 rounded-lg flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      {author_details?.avatar_path && (
                        <img
                          src={avatar}
                          alt={author}
                          className="w-10 h-10 rounded-full object-cover border border-gray-600"
                        />
                      )}
                      <div>
                        <p className="text-white font-semibold">{author_details?.username || author}</p>
                        <p className="text-sm text-gray-400">{new Date(created_at).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {rating && (
                      <p className="text-yellow-400 text-sm mt-1">
                        <strong>{rating} ⭐</strong>
                      </p>
                    )}

                    <p
                      className="text-gray-300 whitespace-pre-wrap text-sm mb-2"
                      dangerouslySetInnerHTML={{ __html: content.slice(0, 300) + '...' }}
                    />

                    <a
                      href={`https://www.themoviedb.org/review/${id}`}
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

        {/* Carrusel de Recomendaciones */}
        {recommendations && recommendations.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-white mb-4">Recomendaciones</h2>
            <Swiper
              spaceBetween={20}
              slidesPerView={6}
              breakpoints={{
                640: { slidesPerView: 1, spaceBetween: 10 },
                768: { slidesPerView: 2, spaceBetween: 10 },
                1024: { slidesPerView: 6, spaceBetween: 20 },
              }}
            >
              {recommendations.slice(0, 20).map((rec) => (
                <SwiperSlide key={rec.id} className="flex-shrink-0 text-center">
                  <div className="relative">
                    {/* Enlace para redirigir al detalle de la recomendación */}
                    <a href={`/details/${rec.media_type || type}/${rec.id}`} className="block">
                      {rec.poster_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w300${rec.poster_path}`}
                          alt={rec.title || rec.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center rounded-lg">
                          <ImageOff size={48} className="text-gray-500" />
                        </div>
                      )}

                      <div className="text-white p-2">
                        <p className="font-semibold text-sm">{rec.title || rec.name}</p>
                        {rec.vote_average && (
                          <p className="text-xs text-yellow-400">⭐ {rec.vote_average.toFixed(1)}</p>
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
