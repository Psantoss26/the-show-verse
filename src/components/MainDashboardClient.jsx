// /src/components/MainDashboardClient.jsx
'use client'

import { useRef, useEffect, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Autoplay } from 'swiper'
import { AnimatePresence, motion } from 'framer-motion'
import 'swiper/swiper-bundle.css'
import Link from 'next/link'
import { Anton } from 'next/font/google'
import {
    Heart,
    HeartOff,
    BookmarkPlus,
    BookmarkMinus,
    Loader2,
    Play,
    X
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

import {
    getMediaAccountStates,
    markAsFavorite,
    markInWatchlist,
    getMovieDetails,
    getExternalIds
} from '@/lib/api/tmdb'

import { fetchOmdbByImdb } from '@/lib/api/omdb'
import { fetchArtworkOverrides } from '@/lib/artworkApi'

const anton = Anton({ weight: '400', subsets: ['latin'] })

/* --- Hook para detectar dispositivo táctil --- */
const useIsTouchDevice = () => {
    const [isTouch, setIsTouch] = useState(false)
    useEffect(() => {
        const onTouch =
            typeof window !== 'undefined' &&
            ('ontouchstart' in window || navigator.maxTouchPoints > 0)
        setIsTouch(onTouch)
    }, [])
    return isTouch
}

/* ✅ NUEVO: layout móvil SOLO por ancho (Tailwind sm = 640px) */
const useIsMobileViewport = (maxWidth = 639) => {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        if (typeof window === 'undefined') return

        const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)

        const update = () => setIsMobile(!!mq.matches)
        update()

        // Safari/old Android compatibility
        if (mq.addEventListener) mq.addEventListener('change', update)
        else mq.addListener(update)

        return () => {
            if (mq.removeEventListener) mq.removeEventListener('change', update)
            else mq.removeListener(update)
        }
    }, [maxWidth])

    return isMobile
}

/* ---------- helpers ---------- */
const yearOf = (m) =>
    m?.release_date?.slice(0, 4) || m?.first_air_date?.slice(0, 4) || ''

const ratingOf = (m) =>
    typeof m?.vote_average === 'number' && m.vote_average > 0
        ? m.vote_average.toFixed(1)
        : '–'

const formatRuntime = (mins) => {
    if (!mins || typeof mins !== 'number') return null
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h <= 0) return `${m} min`
    return m ? `${h} h ${m} min` : `${h} h`
}

const buildImg = (path, size = 'original') =>
    `https://image.tmdb.org/t/p/${size}${path}`

const GENRES = {
    28: 'Acción',
    12: 'Aventura',
    16: 'Animación',
    35: 'Comedia',
    80: 'Crimen',
    99: 'Documental',
    18: 'Drama',
    10751: 'Familia',
    14: 'Fantasía',
    36: 'Historia',
    27: 'Terror',
    10402: 'Música',
    9648: 'Misterio',
    10749: 'Romance',
    878: 'Ciencia ficción',
    10770: 'TV Movie',
    53: 'Thriller',
    10752: 'Bélica',
    37: 'Western',

    // TV
    10759: 'Acción y aventura',
    10765: 'Ciencia ficción y fantasía',
    10762: 'Infantil',
    10763: 'Noticias',
    10764: 'Reality',
    10766: 'Telenovela',
    10767: 'Talk show',
    10768: 'Guerra y política'
}

/* --------- precargar una imagen --------- */
function preloadImage(src) {
    return new Promise((resolve) => {
        if (!src) return resolve(false)
        const img = new Image()
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = src
    })
}

/* =================== CACHÉS COMPARTIDOS (cliente) =================== */
const movieExtrasCache = new Map() // movie.id -> { runtime, awards, imdbRating }
const movieBackdropCache = new Map() // movie.id -> backdrop file_path | null | undefined
const movieImagesCache = new Map() // movie.id -> { posters, backdrops }

/* ======== Preferencias de artwork guardadas en localStorage ======== */
function getArtworkPreference(movieId) {
    if (typeof window === 'undefined') {
        return { poster: null, backdrop: null }
    }
    const posterKey = `showverse:movie:${movieId}:poster`
    const backdropKey = `showverse:movie:${movieId}:backdrop`
    const poster = window.localStorage.getItem(posterKey)
    const backdrop = window.localStorage.getItem(backdropKey)
    return {
        poster: poster || null,
        backdrop: backdrop || null
    }
}

/* ====================================================================
 * NUEVO CRITERIO BACKDROPS:
 *  1) Idioma EN (si existe)
 *  2) Mejor resolución (área)
 *  3) Votos (vote_count, luego vote_average)
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

/* ====================================================================
 * MISMO CRITERIO QUE BACKDROPS, PERO PARA POSTERS:
 *  1) Idioma EN (si existe)
 *  2) Mejor resolución (área = width*height)
 *  3) De las de máxima resolución => la PRIMERA (estable)
 * ==================================================================== */
function pickBestPosterByLangThenResolution(list, opts = {}) {
    const {
        preferLangs = ['en', 'en-US'],
        minWidth = 500
    } = opts

    if (!Array.isArray(list) || list.length === 0) return null

    const area = (img) => (img?.width || 0) * (img?.height || 0)
    const lang = (img) => img?.iso_639_1 || null

    const sizeFiltered =
        minWidth > 0 ? list.filter((p) => (p?.width || 0) >= minWidth) : list
    const pool0 = sizeFiltered.length ? sizeFiltered : list

    const hasPreferred = pool0.some((p) => preferLangs.includes(lang(p)))
    const pool1 = hasPreferred ? pool0.filter((p) => preferLangs.includes(lang(p))) : pool0

    let maxArea = 0
    for (const p of pool1) maxArea = Math.max(maxArea, area(p))

    for (const p of pool1) {
        if (area(p) === maxArea) return p
    }

    return null
}

/* ========= Cargar / cachear imágenes de TMDb (posters + backdrops) ========= */
async function getMovieImages(movieId) {
    if (movieImagesCache.has(movieId)) return movieImagesCache.get(movieId)

    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
    if (!apiKey) {
        const fallback = { posters: [], backdrops: [] }
        movieImagesCache.set(movieId, fallback)
        return fallback
    }

    try {
        const url =
            `https://api.themoviedb.org/3/movie/${movieId}/images` +
            `?api_key=${apiKey}` +
            `&include_image_language=en,en-US,es,es-ES,null`

        const r = await fetch(url, { cache: 'force-cache' })
        const j = await r.json()
        const posters = Array.isArray(j?.posters) ? j.posters : []
        const backdrops = Array.isArray(j?.backdrops) ? j.backdrops : []

        const data = { posters, backdrops }
        movieImagesCache.set(movieId, data)
        return data
    } catch {
        const fallback = { posters: [], backdrops: [] }
        movieImagesCache.set(movieId, fallback)
        return fallback
    }
}

/* ========= Backdrop preferido (NUEVO criterio: EN -> resolución -> votos) ========= */
async function fetchBestBackdrop(movieId) {
    const { backdrops } = await getMovieImages(movieId)
    if (!Array.isArray(backdrops) || backdrops.length === 0) return null

    const best = pickBestBackdropByLangResVotes(backdrops, {
        preferLangs: ['en', 'en-US'],
        resolutionWindow: 0.98,
        minWidth: 1200
    })

    return best?.file_path || null
}

/* ========= Poster preferido (NUEVO criterio estable) ========= */
async function fetchBestPoster(movieId) {
    const { posters } = await getMovieImages(movieId)
    if (!Array.isArray(posters) || posters.length === 0) return null

    const best = pickBestPosterByLangThenResolution(posters, {
        preferLangs: ['en', 'en-US'],
        minWidth: 500
    })

    return best?.file_path || null
}

/* =================== TRAILERS (TMDb videos) =================== */
const movieTrailerCache = new Map() // movieId -> { key, site, type } | null
const movieTrailerInFlight = new Map() // movieId -> Promise

function pickBestTrailer(videos) {
    if (!Array.isArray(videos) || videos.length === 0) return null

    const yt = videos.filter((v) => v?.site === 'YouTube' && v?.key)
    if (!yt.length) return null

    const preferredLang = yt.filter(
        (v) =>
            v?.iso_639_1 === 'en' ||
            v?.iso_3166_1 === 'US' ||
            v?.iso_3166_1 === 'GB'
    )

    const pool = preferredLang.length ? preferredLang : yt
    const trailers = pool.filter((v) => v?.type === 'Trailer')
    const teasers = pool.filter((v) => v?.type === 'Teaser')
    const candidates = trailers.length ? trailers : teasers.length ? teasers : pool

    const score = (v) => {
        const official = v?.official ? 100 : 0
        const typeScore = v?.type === 'Trailer' ? 50 : v?.type === 'Teaser' ? 20 : 0
        const size = typeof v?.size === 'number' ? v.size : 0
        return official + typeScore + size
    }

    return [...candidates].sort((a, b) => score(b) - score(a))[0] || null
}

async function fetchBestTrailer(movieId) {
    try {
        const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
        if (!apiKey || !movieId) return null

        const url =
            `https://api.themoviedb.org/3/movie/${movieId}/videos` +
            `?api_key=${apiKey}&language=en-US`

        const r = await fetch(url, { cache: 'force-cache' })
        if (!r.ok) return null

        const j = await r.json()
        const results = Array.isArray(j?.results) ? j.results : []
        const best = pickBestTrailer(results)

        if (!best?.key) return null
        return { key: best.key, site: best.site, type: best.type }
    } catch {
        return null
    }
}

async function getBestTrailerCached(movieId) {
    if (movieTrailerCache.has(movieId)) return movieTrailerCache.get(movieId)
    if (movieTrailerInFlight.has(movieId)) return movieTrailerInFlight.get(movieId)

    const p = (async () => {
        const t = await fetchBestTrailer(movieId)
        movieTrailerCache.set(movieId, t || null)
        movieTrailerInFlight.delete(movieId)
        return t || null
    })()

    movieTrailerInFlight.set(movieId, p)
    return p
}

/* ====================================================================
 * Portada (2:3)
 * ✅ Mobile layout SOLO en pantallas pequeñas (no por touch)
 * ==================================================================== */
function PosterImage({ movie, cache, heightClass, isMobile }) {
    const [posterPath, setPosterPath] = useState(null)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        let abort = false

        const load = async () => {
            if (!movie) return

            // 1) Preferencia del usuario (poster)
            const { poster: userPoster } = getArtworkPreference(movie.id)
            if (userPoster) {
                const url = buildImg(userPoster, 'w342')
                await preloadImage(url)
                if (!abort) {
                    cache.current.set(movie.id, userPoster)
                    setPosterPath(userPoster)
                    setReady(true)
                }
                return
            }

            // 2) Cache en memoria
            const cached = cache.current.get(movie.id)
            if (cached) {
                const url = buildImg(cached, 'w342')
                await preloadImage(url)
                if (!abort) {
                    setPosterPath(cached)
                    setReady(true)
                }
                return
            }

            // 3) Lógica normal
            setReady(false)
            const preferred = await fetchBestPoster(movie.id)
            const chosen =
                preferred ||
                movie.poster_path ||
                movie.backdrop_path ||
                movie.profile_path ||
                null

            const url = chosen ? buildImg(chosen, 'w342') : null
            await preloadImage(url)
            if (!abort) {
                cache.current.set(movie.id, chosen)
                setPosterPath(chosen)
                setReady(!!chosen)
            }
        }

        load()
        return () => {
            abort = true
        }
    }, [movie, cache])

    // ✅ Layout mobile SOLO si isMobile
    const boxClass = isMobile ? 'aspect-[2/3]' : heightClass

    if (!ready || !posterPath) {
        return (
            <div className={`w-full ${boxClass} rounded-3xl bg-neutral-800 animate-pulse`} />
        )
    }

    // Desktop/tablet: estética normal
    if (!isMobile) {
        return (
            <img
                src={buildImg(posterPath, 'w342')}
                alt={movie.title || movie.name}
                className={`w-full ${boxClass} object-cover rounded-3xl`}
                loading="lazy"
                decoding="async"
            />
        )
    }

    // Mobile: poster completo con fondo blur
    return (
        <div className={`relative w-full ${boxClass} rounded-3xl overflow-hidden bg-neutral-900`}>
            <img
                src={buildImg(posterPath, 'w342')}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-xl opacity-35 scale-110"
                loading="lazy"
                decoding="async"
            />
            <img
                src={buildImg(posterPath, 'w342')}
                alt={movie.title || movie.name}
                className="absolute inset-0 w-full h-full object-contain"
                loading="lazy"
                decoding="async"
            />
        </div>
    )
}

/* ====================================================================
 * Vista previa inline tipo Amazon (backdrop horizontal) + TRAILER
 * ==================================================================== */
function InlinePreviewCard({ movie, heightClass }) {
    const { session, account } = useAuth()

    const [extras, setExtras] = useState({
        runtime: null,
        awards: null,
        imdbRating: null
    })
    const [backdropPath, setBackdropPath] = useState(null)
    const [backdropReady, setBackdropReady] = useState(false)

    const [loadingStates, setLoadingStates] = useState(false)
    const [favorite, setFavorite] = useState(false)
    const [watchlist, setWatchlist] = useState(false)
    const [updating, setUpdating] = useState(false)
    const [error, setError] = useState('')

    const [showTrailer, setShowTrailer] = useState(false)
    const [trailer, setTrailer] = useState(null)
    const [trailerLoading, setTrailerLoading] = useState(false)
    const trailerIframeRef = useRef(null)

    useEffect(() => {
        setShowTrailer(false)
        setTrailer(null)
        setTrailerLoading(false)
    }, [movie?.id])

    useEffect(() => {
        let cancel = false
        const load = async () => {
            if (!movie || !session || !account?.id) {
                setFavorite(false)
                setWatchlist(false)
                return
            }
            try {
                setLoadingStates(true)
                const type = movie.media_type || 'movie'
                const st = await getMediaAccountStates(type, movie.id, session)
                if (!cancel) {
                    setFavorite(!!st.favorite)
                    setWatchlist(!!st.watchlist)
                }
            } catch {
                // silencio
            } finally {
                if (!cancel) setLoadingStates(false)
            }
        }
        load()
        return () => {
            cancel = true
        }
    }, [movie, session, account])

    useEffect(() => {
        let abort = false
        if (!movie) return

        const loadAll = async () => {
            const { backdrop: userBackdrop } = getArtworkPreference(movie.id)
            const userPreferredBackdrop = userBackdrop || null

            if (userPreferredBackdrop) {
                movieBackdropCache.set(movie.id, userPreferredBackdrop)
                const url = buildImg(userPreferredBackdrop, 'w1280')
                await preloadImage(url)
                if (!abort) {
                    setBackdropPath(userPreferredBackdrop)
                    setBackdropReady(true)
                }
            } else {
                const cachedBackdrop = movieBackdropCache.get(movie.id)
                if (cachedBackdrop !== undefined) {
                    if (!abort) {
                        setBackdropPath(cachedBackdrop)
                        if (cachedBackdrop) {
                            const url = buildImg(cachedBackdrop, 'w1280')
                            await preloadImage(url)
                            if (!abort) setBackdropReady(true)
                        } else {
                            setBackdropReady(false)
                        }
                    }
                } else {
                    try {
                        const preferred = await fetchBestBackdrop(movie.id)
                        const chosen =
                            preferred ||
                            movie.backdrop_path ||
                            movie.poster_path ||
                            movie.profile_path ||
                            null

                        movieBackdropCache.set(movie.id, chosen)

                        if (chosen) {
                            const url = buildImg(chosen, 'w1280')
                            await preloadImage(url)
                            if (!abort) {
                                setBackdropPath(chosen)
                                setBackdropReady(true)
                            }
                        } else if (!abort) {
                            setBackdropPath(null)
                            setBackdropReady(false)
                        }
                    } catch {
                        if (!abort) {
                            setBackdropPath(null)
                            setBackdropReady(false)
                        }
                    }
                }
            }

            const cachedExtras = movieExtrasCache.get(movie.id)
            if (cachedExtras) {
                if (!abort) setExtras(cachedExtras)
            } else {
                try {
                    let runtime = null
                    try {
                        const details = await getMovieDetails(movie.id)
                        runtime = details?.runtime ?? null
                    } catch { }

                    let awards = null
                    let imdbRating = null
                    try {
                        let imdb = movie?.imdb_id
                        if (!imdb) {
                            const ext = await getExternalIds('movie', movie.id)
                            imdb = ext?.imdb_id || null
                        }
                        if (imdb) {
                            const omdb = await fetchOmdbByImdb(imdb)
                            const rawAwards = omdb?.Awards
                            if (rawAwards && typeof rawAwards === 'string' && rawAwards.trim()) {
                                awards = rawAwards.trim()
                            }
                            const r = omdb?.imdbRating
                            if (r && !Number.isNaN(Number(r))) {
                                imdbRating = Number(r)
                            }
                        }
                    } catch { }

                    const next = { runtime, awards, imdbRating }
                    movieExtrasCache.set(movie.id, next)
                    if (!abort) setExtras(next)
                } catch {
                    if (!abort) setExtras({ runtime: null, awards: null, imdbRating: null })
                }
            }
        }

        loadAll()
        return () => {
            abort = true
        }
    }, [movie])

    const href = `/details/movie/${movie.id}`

    const requireLogin = () => {
        if (!session || !account?.id) {
            window.location.href = '/login'
            return true
        }
        return false
    }

    const handleToggleFavorite = async (e) => {
        e.stopPropagation()
        if (requireLogin() || updating || !movie) return
        try {
            setUpdating(true)
            setError('')
            const next = !favorite
            setFavorite(next)
            await markAsFavorite({
                accountId: account.id,
                sessionId: session,
                type: movie.media_type || 'movie',
                mediaId: movie.id,
                favorite: next
            })
        } catch {
            setFavorite((v) => !v)
            setError('No se pudo actualizar favoritos.')
        } finally {
            setUpdating(false)
        }
    }

    const handleToggleWatchlist = async (e) => {
        e.stopPropagation()
        if (requireLogin() || updating || !movie) return
        try {
            setUpdating(true)
            setError('')
            const next = !watchlist
            setWatchlist(next)
            await markInWatchlist({
                accountId: account.id,
                sessionId: session,
                type: movie.media_type || 'movie',
                mediaId: movie.id,
                watchlist: next
            })
        } catch {
            setWatchlist((v) => !v)
            setError('No se pudo actualizar pendientes.')
        } finally {
            setUpdating(false)
        }
    }

    const handleToggleTrailer = async (e) => {
        e.stopPropagation()

        if (showTrailer) {
            setShowTrailer(false)
            return
        }

        try {
            setTrailerLoading(true)
            setError('')

            const t = await getBestTrailerCached(movie.id)

            if (!t?.key) {
                setTrailer(null)
                setShowTrailer(false)
                setError('No hay trailer disponible para este título.')
                return
            }

            setTrailer(t)
            setShowTrailer(true)
        } catch {
            setTrailer(null)
            setShowTrailer(false)
            setError('No se pudo cargar el trailer.')
        } finally {
            setTrailerLoading(false)
        }
    }

    const resolvedBackdrop =
        backdropPath || movie.backdrop_path || movie.poster_path || movie.profile_path || null
    const bgSrc = resolvedBackdrop ? buildImg(resolvedBackdrop, 'w1280') : null

    const genres = (() => {
        const ids =
            movie.genre_ids ||
            (Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : [])
        const names = ids.map((id) => GENRES[id]).filter(Boolean)
        return names.slice(0, 2).join(' • ')
    })()

    const trailerSrc =
        trailer?.key
            ? `https://www.youtube-nocookie.com/embed/${trailer.key}` +
            `?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` +
            `&controls=0&iv_load_policy=3&disablekb=1&fs=0` +
            `&enablejsapi=1&origin=${typeof window !== 'undefined'
                ? encodeURIComponent(window.location.origin)
                : ''
            }`
            : null

    return (
        <div
            className={`rounded-3xl overflow-hidden bg-neutral-900 text-white shadow-xl ${heightClass} grid grid-rows-[76%_24%] cursor-pointer`}
            onClick={() => {
                window.location.href = href
            }}
        >
            <div className="relative w-full h-full bg-black">
                {!showTrailer && !backdropReady && (
                    <div className="absolute inset-0 bg-neutral-900 animate-pulse" />
                )}

                {!showTrailer && backdropReady && bgSrc && (
                    <img
                        src={bgSrc}
                        alt={movie.title || movie.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                    />
                )}

                {showTrailer && (
                    <>
                        {(trailerLoading || !trailerSrc) && (
                            <div className="absolute inset-0 bg-neutral-900 animate-pulse" />
                        )}

                        {trailerSrc && (
                            <div className="absolute inset-0 overflow-hidden">
                                <iframe
                                    key={trailer.key}
                                    className="absolute left-1/2 top-1/2
                    w-[140%] h-[180%]
                    -translate-x-1/2 -translate-y-1/2
                    pointer-events-none"
                                    src={trailerSrc}
                                    title={`Trailer - ${movie.title || movie.name}`}
                                    allow="autoplay; encrypted-media; picture-in-picture"
                                    allowFullScreen={false}
                                    onLoad={() => {
                                        try {
                                            // Mantengo tu lógica existente
                                            const win = trailerIframeRef.current?.contentWindow
                                            if (!win) return

                                            const target = 'https://www.youtube-nocookie.com'
                                            const cmd = (func, args = []) =>
                                                win.postMessage(
                                                    JSON.stringify({ event: 'command', func, args }),
                                                    target
                                                )

                                            setTimeout(() => {
                                                cmd('unMute')
                                                cmd('setVolume', [30])
                                            }, 120)
                                        } catch { }
                                    }}
                                    ref={trailerIframeRef}
                                />
                            </div>
                        )}
                    </>
                )}

                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-2
            bg-gradient-to-b from-transparent via-black/55 to-neutral-950/95"
                />
            </div>

            <div className="w-full h-full bg-neutral-950/95 border-t border-neutral-800">
                <div className="h-full px-4 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3 text-[11px] sm:text-xs text-neutral-200">
                            {yearOf(movie) && <span>{yearOf(movie)}</span>}
                            {extras?.runtime && <span>• {formatRuntime(extras.runtime)}</span>}

                            <span className="inline-flex items-center gap-1.5">
                                <img
                                    src="/logo-TMDb.png"
                                    alt="TMDb"
                                    className="h-4 w-auto"
                                    loading="lazy"
                                    decoding="async"
                                />
                                <span className="font-medium">{ratingOf(movie)}</span>
                            </span>

                            {typeof extras?.imdbRating === 'number' && (
                                <span className="inline-flex items-center gap-1.5">
                                    <img
                                        src="/logo-IMDb.png"
                                        alt="IMDb"
                                        className="h-4 w-auto"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                    <span className="font-medium">
                                        {extras.imdbRating.toFixed(1)}
                                    </span>
                                </span>
                            )}
                        </div>

                        {genres && (
                            <div className="mt-1 text-[11px] sm:text-xs text-neutral-100/90 line-clamp-1">
                                {genres}
                            </div>
                        )}

                        {extras?.awards && (
                            <div className="mt-1 text-[11px] sm:text-xs text-emerald-300 line-clamp-1">
                                {extras.awards}
                            </div>
                        )}

                        {error && (
                            <p className="mt-1 text-[11px] text-red-400 line-clamp-1">
                                {error}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                        <button
                            onClick={handleToggleTrailer}
                            disabled={trailerLoading}
                            title={showTrailer ? 'Cerrar trailer' : 'Ver trailer'}
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-neutral-700/70 hover:bg-neutral-600/90 border border-neutral-600/60 flex items-center justify-center text-white transition-colors disabled:opacity-60"
                        >
                            {trailerLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : showTrailer ? (
                                <X className="w-5 h-5" />
                            ) : (
                                <Play className="w-5 h-5" />
                            )}
                        </button>

                        <button
                            onClick={handleToggleFavorite}
                            disabled={loadingStates || updating}
                            title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-neutral-700/70 hover:bg-neutral-600/90 border border-neutral-600/60 flex items-center justify-center text-white transition-colors disabled:opacity-60"
                        >
                            {loadingStates || updating ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : favorite ? (
                                <HeartOff className="w-5 h-5" />
                            ) : (
                                <Heart className="w-5 h-5" />
                            )}
                        </button>

                        <button
                            onClick={handleToggleWatchlist}
                            disabled={loadingStates || updating}
                            title={watchlist ? 'Quitar de pendientes' : 'Añadir a pendientes'}
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-neutral-700/70 hover:bg-neutral-600/90 border border-neutral-600/60 flex items-center justify-center text-white transition-colors disabled:opacity-60"
                        >
                            {loadingStates || updating ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : watchlist ? (
                                <BookmarkMinus className="w-5 h-5" />
                            ) : (
                                <BookmarkPlus className="w-5 h-5" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ---------- Fila reusable ---------- */
function Row({ title, items, isTouchDevice, isMobile, posterCacheRef }) {
    if (!items || items.length === 0) return null

    const swiperRef = useRef(null)
    const [isHoveredRow, setIsHoveredRow] = useState(false)
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)
    const [hoveredId, setHoveredId] = useState(null)

    const hasActivePreview = !!hoveredId
    const heightClassDesktop = 'h-[220px] sm:h-[260px] md:h-[300px] xl:h-[340px]'

    // ✅ Mobile layout SOLO si isMobile (no por touch)
    const posterBoxClass = isMobile ? 'aspect-[2/3]' : heightClassDesktop

    const updateNav = (swiper) => {
        if (!swiper) return
        const hasOverflow = !swiper.isLocked
        setCanPrev(hasOverflow && !swiper.isBeginning)
        setCanNext(hasOverflow && !swiper.isEnd)
    }

    const handleSwiper = (swiper) => {
        swiperRef.current = swiper
        updateNav(swiper)
    }

    const handlePrevClick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const swiper = swiperRef.current
        if (!swiper) return
        swiper.slidePrev()
    }

    const handleNextClick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const swiper = swiperRef.current
        if (!swiper) return
        swiper.slideNext()
    }

    const showPrev = (isHoveredRow || hasActivePreview) && canPrev
    const showNext = (isHoveredRow || hasActivePreview) && canNext

    // ✅ Tablet/desktop (>=640): siempre comportamiento "ordenador" (auto)
    const breakpointsRow = isMobile
        ? { 0: { slidesPerView: 3, spaceBetween: 12 } }
        : {
            640: { slidesPerView: 'auto', spaceBetween: 14 },
            1024: { slidesPerView: 'auto', spaceBetween: 18 },
            1280: { slidesPerView: 'auto', spaceBetween: 20 }
        }

    return (
        <div className="relative group">
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-[730] text-primary-text mb-4 sm:text-left">
                <span
                    className={`bg-gradient-to-b from-blue-600 via-blue-400 to-white bg-clip-text text-transparent tracking-widest uppercase ${anton.className}`}
                >
                    {title}
                </span>
            </h3>

            <div
                className="relative"
                onMouseEnter={() => setIsHoveredRow(true)}
                onMouseLeave={() => {
                    setIsHoveredRow(false)
                    setHoveredId(null)
                }}
            >
                <Swiper
                    slidesPerView={isMobile ? 3 : 'auto'}
                    spaceBetween={isMobile ? 12 : 18}
                    onSwiper={handleSwiper}
                    onSlideChange={updateNav}
                    onResize={updateNav}
                    onReachBeginning={updateNav}
                    onReachEnd={updateNav}
                    loop={false}
                    watchOverflow={true}
                    grabCursor={!isTouchDevice}
                    allowTouchMove={true}
                    preventClicks={true}
                    preventClicksPropagation={true}
                    threshold={5}
                    modules={[Navigation]}
                    className="group relative"
                    breakpoints={breakpointsRow}
                >
                    {items.map((m, i) => {
                        // ✅ Preview solo en "modo ordenador" y con hover real
                        const isActive = !isMobile && !isTouchDevice && hoveredId === m.id
                        const isLast = i === items.length - 1

                        const base = 'relative flex-shrink-0 transition-all duration-300 ease-out'

                        // ✅ En mobile: 3 por fila. En tablet/desktop: tus tamaños de siempre
                        const sizeClasses = isMobile
                            ? 'w-full'
                            : isActive
                                ? 'w-[320px] sm:w-[320px] md:w-[430px] xl:w-[480px] z-20'
                                : 'w-[140px] sm:w-[140px] md:w-[190px] xl:w-[210px] z-10'

                        const transformClass =
                            !isMobile && !isTouchDevice && isActive && isLast
                                ? 'sm:-translate-x-[190px] md:-translate-x-[260px] xl:-translate-x-[290px]'
                                : ''

                        return (
                            <SwiperSlide
                                key={m.id}
                                className={isMobile ? 'select-none' : '!w-auto select-none'}
                            >
                                <div
                                    className={`${base} ${sizeClasses} ${posterBoxClass} ${transformClass}`}
                                    onMouseEnter={() => {
                                        if (!isMobile && !isTouchDevice) setHoveredId(m.id)
                                    }}
                                    onMouseLeave={() =>
                                        setHoveredId((prev) => (prev === m.id ? null : prev))
                                    }
                                >
                                    <AnimatePresence initial={false} mode="wait">
                                        {isActive ? (
                                            <motion.div
                                                key="preview"
                                                initial={{ opacity: 0, scale: 0.98 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.98 }}
                                                transition={{ duration: 0.18 }}
                                                className="w-full h-full hidden sm:block"
                                            >
                                                <InlinePreviewCard movie={m} heightClass={heightClassDesktop} />
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="poster"
                                                initial={{ opacity: 0, scale: 0.98 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.98 }}
                                                transition={{ duration: 0.15 }}
                                                className="w-full h-full"
                                            >
                                                <Link href={`/details/movie/${m.id}`}>
                                                    <PosterImage
                                                        movie={m}
                                                        cache={posterCacheRef}
                                                        heightClass={posterBoxClass}
                                                        isMobile={isMobile}
                                                    />
                                                </Link>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </SwiperSlide>
                        )
                    })}
                </Swiper>

                {showPrev && !isTouchDevice && (
                    <button
                        type="button"
                        onClick={handlePrevClick}
                        className="absolute inset-y-0 left-0 w-28 z-30
              hidden sm:flex items-center justify-start
              bg-gradient-to-r from-black/80 via-black/55 to-transparent
              hover:from-black/95 hover:via-black/75
              transition-colors pointer-events-auto"
                    >
                        <span className="ml-4 text-3xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
                            ‹
                        </span>
                    </button>
                )}

                {showNext && !isTouchDevice && (
                    <button
                        type="button"
                        onClick={handleNextClick}
                        className="absolute inset-y-0 right-0 w-28 z-30
              hidden sm:flex items-center justify-end
              bg-gradient-to-l from-black/80 via-black/55 to-transparent
              hover:from-black/95 hover:via-black/75
              transition-colors pointer-events-auto"
                    >
                        <span className="mr-4 text-3xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
                            ›
                        </span>
                    </button>
                )}
            </div>
        </div>
    )
}

/* ---------- Carrusel hero (backdrops) ---------- */
function TopRatedHero({ items, isTouchDevice, isMobile }) {
    if (!items || items.length === 0) return null

    const swiperRef = useRef(null)
    const [isHoveredHero, setIsHoveredHero] = useState(false)
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)

    const [heroBackdrops, setHeroBackdrops] = useState({})
    const [heroLoaded, setHeroLoaded] = useState(false)

    useEffect(() => {
        if (!items || items.length === 0) {
            setHeroLoaded(true)
            return
        }

        let canceled = false

        const load = async () => {
            try {
                const ids = items.map((m) => m.id).filter(Boolean)
                if (!ids.length) {
                    if (!canceled) setHeroLoaded(true)
                    return
                }

                let overrides = {}
                try {
                    overrides = await fetchArtworkOverrides({
                        type: 'movie',
                        kind: 'backdrop',
                        ids
                    })
                } catch (err) {
                    console.error('Error cargando overrides de hero', err)
                    overrides = {}
                }

                const entries = await Promise.all(
                    items.map(async (movie) => {
                        const id = movie.id
                        if (!id) return [null, null]

                        const override = overrides?.[id] || null
                        if (override) {
                            await preloadImage(buildImg(override, 'w780'))
                            return [id, override]
                        }

                        const { backdrop: userBackdrop } = getArtworkPreference(id)
                        if (userBackdrop) {
                            await preloadImage(buildImg(userBackdrop, 'w780'))
                            return [id, userBackdrop]
                        }

                        let chosen = await fetchBestBackdrop(id)
                        if (!chosen) chosen = movie.backdrop_path || movie.poster_path || null

                        if (chosen) await preloadImage(buildImg(chosen, 'w780'))
                        return [id, chosen]
                    })
                )

                if (canceled) return

                const map = {}
                for (const [id, path] of entries) {
                    if (!id) continue
                    map[id] = path
                }

                setHeroBackdrops(map)
                setHeroLoaded(true)
            } catch (err) {
                if (canceled) return
                console.error('Error cargando backdrops del hero', err)

                const map = {}
                for (const movie of items) {
                    map[movie.id] = movie.backdrop_path || movie.poster_path || null
                }
                setHeroBackdrops(map)
                setHeroLoaded(true)
            }
        }

        load()

        return () => {
            canceled = true
        }
    }, [items])

    const updateNav = (swiper) => {
        if (!swiper) return
        const hasOverflow = !swiper.isLocked
        setCanPrev(hasOverflow && !swiper.isBeginning)
        setCanNext(hasOverflow && !swiper.isEnd)
    }

    const handleSwiper = (swiper) => {
        swiperRef.current = swiper
        updateNav(swiper)
    }

    const handlePrevClick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const swiper = swiperRef.current
        if (!swiper) return
        swiper.slidePrev()
    }

    const handleNextClick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const swiper = swiperRef.current
        if (!swiper) return
        swiper.slideNext()
    }

    const showPrev = isHoveredHero && canPrev
    const showNext = isHoveredHero && canNext

    return (
        <div className="relative group mb-10 sm:mb-14">
            <div
                className="relative"
                onMouseEnter={() => setIsHoveredHero(true)}
                onMouseLeave={() => setIsHoveredHero(false)}
            >
                {!heroLoaded ? (
                    <div className="flex gap-4 overflow-hidden">
                        {items.slice(0, 1).map((movie) => (
                            <div
                                key={movie.id}
                                className="w-full rounded-3xl bg-neutral-900 aspect-[16/9] animate-pulse"
                            />
                        ))}
                    </div>
                ) : (
                    <>
                        <Swiper
                            slidesPerView={isTouchDevice ? 1 : 3}
                            spaceBetween={isTouchDevice ? 12 : 16}
                            autoplay={{ delay: 5000 }}
                            onSwiper={handleSwiper}
                            onSlideChange={updateNav}
                            onResize={updateNav}
                            onReachBeginning={updateNav}
                            onReachEnd={updateNav}
                            loop={false}
                            watchOverflow={true}
                            grabCursor={!isTouchDevice}
                            allowTouchMove={true}
                            preventClicks={true}
                            preventClicksPropagation={true}
                            threshold={5}
                            modules={[Navigation, Autoplay]}
                            className="group relative"
                            breakpoints={{
                                0: { slidesPerView: 1, spaceBetween: 12 },
                                768: { slidesPerView: isTouchDevice ? 1 : 3, spaceBetween: 14 },
                                1024: { slidesPerView: isTouchDevice ? 1 : 3, spaceBetween: 16 }
                            }}
                        >
                            {items.map((movie) => {
                                const heroBackdrop = heroBackdrops[movie.id] || null

                                const slideClass = isTouchDevice ? '!w-full select-none' : 'select-none'

                                if (!heroBackdrop) {
                                    return (
                                        <SwiperSlide
                                            key={movie.id}
                                            className={slideClass}
                                        >
                                            <Link href={`/details/movie/${movie.id}`}>
                                                <div className="relative rounded-3xl bg-neutral-900 aspect-[16/9]" />
                                            </Link>
                                        </SwiperSlide>
                                    )
                                }

                                return (
                                    <SwiperSlide
                                        key={movie.id}
                                        className={slideClass}
                                    >
                                        <Link href={`/details/movie/${movie.id}`}>
                                            <div className="relative cursor-pointer overflow-hidden rounded-3xl aspect-[16/9] bg-neutral-900">
                                                {/* Fondo blur */}
                                                <img
                                                    src={buildImg(heroBackdrop, 'w780')}
                                                    alt=""
                                                    aria-hidden="true"
                                                    className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-35 scale-110"
                                                    loading="lazy"
                                                    decoding="async"
                                                />

                                                {/* ✅ Mobile: contain. Tablet/desktop: cover */}
                                                <img
                                                    src={buildImg(heroBackdrop, 'w1280')}
                                                    srcSet={`${buildImg(heroBackdrop, 'w780')} 780w, ${buildImg(
                                                        heroBackdrop,
                                                        'w1280'
                                                    )} 1280w, ${buildImg(heroBackdrop, 'original')} 2400w`}
                                                    sizes="(min-width:1536px) 1100px, (min-width:1280px) 900px, (min-width:1024px) 800px, 95vw"
                                                    alt={movie.title || movie.name}
                                                    className={`absolute inset-0 w-full h-full rounded-3xl ${isMobile ? 'object-contain' : 'object-cover hover:scale-105'
                                                        } transition-transform duration-300`}
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            </div>
                                        </Link>
                                    </SwiperSlide>
                                )
                            })}
                        </Swiper>

                        {showPrev && !isTouchDevice && (
                            <button
                                type="button"
                                onClick={handlePrevClick}
                                className="absolute inset-y-0 left-0 w-32 z-20
                  hidden sm:flex items-center justify-start
                  bg-gradient-to-r from-black/75 via-black/45 to-transparent
                  hover:from-black/90 hover:via-black/65
                  transition-colors pointer-events-auto"
                            >
                                <span className="ml-6 text-4xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
                                    ‹
                                </span>
                            </button>
                        )}

                        {showNext && !isTouchDevice && (
                            <button
                                type="button"
                                onClick={handleNextClick}
                                className="absolute inset-y-0 right-0 w-32 z-20
                  hidden sm:flex items-center justify-end
                  bg-gradient-to-l from-black/75 via-black/45 to-transparent
                  hover:from-black/90 hover:via-black/65
                  transition-colors pointer-events-auto"
                            >
                                <span className="mr-6 text-4xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
                                    ›
                                </span>
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

/* =================== MainDashboard (CLIENTE) =================== */
export default function MainDashboardClient({ initialData }) {
    const isTouchDevice = useIsTouchDevice()
    const isMobile = useIsMobileViewport(639) // ✅ solo < 640px será "móvil"
    const posterCacheRef = useRef(new Map())
    const dashboardData = initialData || {}

    if (!dashboardData || Object.keys(dashboardData).length === 0) {
        return <div className="h-screen bg-black" />
    }

    return (
        <div className="px-6 py-6 text-white bg-black">
            <TopRatedHero items={dashboardData.topRated || []} isTouchDevice={isTouchDevice} isMobile={isMobile} />

            <div className="space-y-12">
                <Row title="Populares" items={dashboardData.popular} isTouchDevice={isTouchDevice} isMobile={isMobile} posterCacheRef={posterCacheRef} />
                <Row title="Tendencias semanales" items={dashboardData.trending} isTouchDevice={isTouchDevice} isMobile={isMobile} posterCacheRef={posterCacheRef} />
                <Row title="Guiones complejos" items={dashboardData.mind} isTouchDevice={isTouchDevice} isMobile={isMobile} posterCacheRef={posterCacheRef} />
                <Row title="Top acción" items={dashboardData.action} isTouchDevice={isTouchDevice} isMobile={isMobile} posterCacheRef={posterCacheRef} />
                <Row title="Populares en EE.UU." items={dashboardData.us} isTouchDevice={isTouchDevice} isMobile={isMobile} posterCacheRef={posterCacheRef} />
                <Row title="Películas de culto" items={dashboardData.cult} isTouchDevice={isTouchDevice} isMobile={isMobile} posterCacheRef={posterCacheRef} />
                <Row title="Infravaloradas" items={dashboardData.underrated} isTouchDevice={isTouchDevice} isMobile={isMobile} posterCacheRef={posterCacheRef} />
                <Row title="En ascenso" items={dashboardData.rising} isTouchDevice={isTouchDevice} isMobile={isMobile} posterCacheRef={posterCacheRef} />

                {dashboardData.recommended?.length > 0 && (
                    <Row title="Recomendadas para ti" items={dashboardData.recommended} isTouchDevice={isTouchDevice} isMobile={isMobile} posterCacheRef={posterCacheRef} />
                )}
            </div>
        </div>
    )
}
