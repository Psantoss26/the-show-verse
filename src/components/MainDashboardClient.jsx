// /src/components/MainDashboardClient.jsx
'use client'

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Autoplay } from 'swiper'
import { AnimatePresence, motion, useInView } from 'framer-motion'
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
    X,
    FilmIcon,
    TvIcon
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

/* =================== ANIMATION VARIANTS =================== */
const fadeInUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { 
        opacity: 1, 
        y: 0,
        transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
    }
}

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.1
        }
    }
}

const scaleIn = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { 
        opacity: 1, 
        scale: 1,
        transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
    }
}

const shimmer = {
    animate: {
        backgroundPosition: ['200% 0', '-200% 0'],
        transition: {
            duration: 8,
            ease: 'linear',
            repeat: Infinity
        }
    }
}

/* --- Hook SIMPLE: layout móvil SOLO por anchura (NO por touch) --- */
const useIsMobileLayout = (breakpointPx = 768) => {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const mq = window.matchMedia(`(max-width:${breakpointPx - 1}px)`)
        const update = () => setIsMobile(mq.matches)
        update()
        if (mq.addEventListener) mq.addEventListener('change', update)
        else mq.addListener(update)
        window.addEventListener('orientationchange', update)
        window.addEventListener('resize', update)
        return () => {
            if (mq.removeEventListener) mq.removeEventListener('change', update)
            else mq.removeListener(update)
            window.removeEventListener('orientationchange', update)
            window.removeEventListener('resize', update)
        }
    }, [breakpointPx])

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
const movieExtrasCache = new Map()
const movieBackdropCache = new Map()
const movieImagesCache = new Map()

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

function pickBestBackdropByLangResVotes(list, opts = {}) {
    const {
        preferLangs = ['en', 'en-US'],
        minWidth = 1200,
    } = opts

    if (!Array.isArray(list) || list.length === 0) return null

    // Normaliza 'en-US' -> 'en'
    const norm = (v) => (v ? String(v).toLowerCase().split('-')[0] : null)
    const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean))
    const isPreferredLang = (img) => preferSet.has(norm(img?.iso_639_1))

    // Mantener el orden, aplicando minWidth si procede
    const pool0 = minWidth > 0 ? list.filter((b) => (b?.width || 0) >= minWidth) : list
    const pool = pool0.length ? pool0 : list

    // ✅ 3 primeras imágenes EN disponibles (en orden)
    const top3en = []
    for (const b of pool) {
        if (isPreferredLang(b)) top3en.push(b)
        if (top3en.length === 3) break
    }

    // Si no hay EN, cae a las 3 primeras del pool
    const top3 = top3en.length ? top3en : pool.slice(0, 3)
    if (!top3.length) return null

    // 1) 1920x1080
    const b1080 = top3.find((b) => (b?.width || 0) === 1920 && (b?.height || 0) === 1080)
    if (b1080) return b1080

    // 2) 1712x964
    const b1712 = top3.find((b) => (b?.width || 0) === 1712 && (b?.height || 0) === 964)
    if (b1712) return b1712

    // 3) 4K 3840x2160
    const b4k = top3.find((b) => (b?.width || 0) === 3840 && (b?.height || 0) === 2160)
    if (b4k) return b4k

    // 4) primera de esas 3
    return top3[0]
}

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
const movieTrailerCache = new Map()
const movieTrailerInFlight = new Map()

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
 * Portada (2:3) — SOLO en móvil: “3 por fila” completas (sin recorte)
 * ==================================================================== */
function PosterImage({ movie, cache, heightClass, isMobile, posterOverride }) {
    const [posterPath, setPosterPath] = useState(null)
    const [ready, setReady] = useState(false)
    const { poster: userPoster } = getArtworkPreference(movie.id)

    useEffect(() => {
        let abort = false

        const load = async () => {
            if (!movie) return

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

            // Si todavía NO sabemos si hay override (porque aún no cargó el fetch batch),
            // NO elijas un póster alternativo, porque luego harás swap.
            if (posterOverride === undefined) {
                if (!abort) {
                    setPosterPath(null)
                    setReady(false)
                }
                return
            }

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
    }, [movie, cache, posterOverride])

    const boxClass = isMobile ? 'aspect-[2/3]' : heightClass

    if (!ready || !posterPath) {
        return (
            <div className={`relative w-full ${boxClass} rounded-lg overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900`}>
                <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                    variants={shimmer}
                    animate="animate"
                    style={{ backgroundSize: '200% 100%' }}
                />
            </div>
        )
    }

    if (!isMobile) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="relative group/poster w-full h-full"
            >
                <img
                    src={buildImg(posterPath, 'w342')}
                    alt={movie.title || movie.name}
                    className={`w-full ${boxClass} object-cover rounded-lg transition-all duration-300 group-hover/poster:shadow-2xl group-hover/poster:shadow-white/10`}
                    loading="lazy"
                    decoding="async"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/poster:opacity-100 transition-opacity duration-300" />
            </motion.div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className={`relative w-full ${boxClass} rounded-lg overflow-hidden bg-neutral-900 shadow-lg`}
        >
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
        </motion.div>
    )
}

/* ====================================================================
 * Vista previa inline tipo Amazon (backdrop horizontal) + TRAILER
 * ==================================================================== */
function InlinePreviewCard({ movie, heightClass, backdropOverride }) {
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
            if (userBackdrop) {
                movieBackdropCache.set(movie.id, userBackdrop)
                const url = buildImg(userBackdrop, 'w1280')
                await preloadImage(url)
                if (!abort) {
                    setBackdropPath(userBackdrop)
                    setBackdropReady(true)
                }
            } else if (backdropOverride) {
                movieBackdropCache.set(movie.id, backdropOverride)
                const url = buildImg(backdropOverride, 'w1280')
                await preloadImage(url)
                if (!abort) {
                    setBackdropPath(backdropOverride)
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
    }, [movie, backdropOverride])

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
            `&enablejsapi=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''
            }`
            : null

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={`rounded-lg overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-950 to-black text-white shadow-2xl ${heightClass} grid grid-rows-[76%_24%] cursor-pointer ring-1 ring-white/5 hover:ring-white/10 transition-all duration-300`}
            onClick={() => {
                window.location.href = href
            }}
        >
            <div className="relative w-full h-full bg-black">
                {!showTrailer && !backdropReady && (
                    <div className="relative w-full h-full bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 overflow-hidden">
                        <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                            variants={shimmer}
                            animate="animate"
                            style={{ backgroundSize: '200% 100%' }}
                        />
                    </div>
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
                                    ref={trailerIframeRef}
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
                                            const win = trailerIframeRef.current?.contentWindow
                                            if (!win) return

                                            const target = 'https://www.youtube-nocookie.com'
                                            const cmd = (func, args = []) =>
                                                win.postMessage(JSON.stringify({ event: 'command', func, args }), target)

                                            setTimeout(() => {
                                                cmd('unMute')
                                                cmd('setVolume', [30])
                                            }, 120)
                                        } catch { }
                                    }}
                                />
                            </div>
                        )}
                    </>
                )}

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-24
                      bg-gradient-to-b from-transparent via-black/60 to-black/95"
                />
            </div>

            <div className="w-full h-full bg-gradient-to-br from-neutral-950/98 to-black/98 border-t border-white/5 backdrop-blur-sm">
                <div className="h-full px-4 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3 text-[11px] sm:text-xs text-neutral-200">
                            {yearOf(movie) && <span>{yearOf(movie)}</span>}
                            {extras?.runtime && <span>• {formatRuntime(extras.runtime)}</span>}

                            <span className="inline-flex items-center gap-1.5">
                                <img
                                    src="/logo-TMDb.png"
                                    alt="TMDb"
                                    className="h-3 w-auto"
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
                                    <span className="font-medium">{extras.imdbRating.toFixed(1)}</span>
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

                        {error && <p className="mt-1 text-[11px] text-red-400 line-clamp-1">{error}</p>}
                    </div>

                    <motion.div 
                        className="flex items-center gap-2 sm:gap-3 flex-shrink-0"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleToggleTrailer}
                            disabled={trailerLoading}
                            title={showTrailer ? 'Cerrar trailer' : 'Ver trailer'}
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-yellow-500/90 to-yellow-600/90 hover:from-yellow-400 hover:to-yellow-500 border border-yellow-400/40 flex items-center justify-center text-black transition-all duration-200 disabled:opacity-60 shadow-lg shadow-yellow-500/30 hover:shadow-yellow-500/50"
                        >
                            {trailerLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin text-black" />
                            ) : showTrailer ? (
                                <X className="w-5 h-5 text-black" />
                            ) : (
                                <Play className="w-5 h-5 ml-0.5 text-black" />
                            )}
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleToggleFavorite}
                            disabled={loadingStates || updating}
                            title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all duration-200 disabled:opacity-60 shadow-lg ${
                                favorite 
                                    ? 'bg-gradient-to-br from-red-600/90 to-red-700/90 hover:from-red-500 hover:to-red-600 border-red-400/40 shadow-red-500/30 hover:shadow-red-500/50 text-white' 
                                    : 'bg-gradient-to-br from-neutral-700/70 to-neutral-800/70 hover:from-neutral-600 hover:to-neutral-700 border-neutral-500/30 shadow-black/20 text-white'
                            }`}
                        >
                            {loadingStates || updating ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Heart className={`w-5 h-5 ${favorite ? 'fill-current' : ''}`} />
                            )}
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleToggleWatchlist}
                            disabled={loadingStates || updating}
                            title={watchlist ? 'Quitar de pendientes' : 'Añadir a pendientes'}
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all duration-200 disabled:opacity-60 shadow-lg ${
                                watchlist
                                    ? 'bg-gradient-to-br from-blue-600/90 to-blue-700/90 hover:from-blue-500 hover:to-blue-600 border-blue-400/40 shadow-blue-500/30 hover:shadow-blue-500/50 text-white'
                                    : 'bg-gradient-to-br from-neutral-700/70 to-neutral-800/70 hover:from-neutral-600 hover:to-neutral-700 border-neutral-500/30 shadow-black/20 text-white'
                            }`}
                        >
                            {loadingStates || updating ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <BookmarkPlus className={`w-5 h-5 ${watchlist ? 'fill-current' : ''}`} />
                            )}
                        </motion.button>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    )
}

function InlinePreviewCardAnticipated({ movie, heightClass, backdropOverride }) {
    const { session, account } = useAuth()

    const [extras, setExtras] = useState({
        runtime: null,
        country: null,
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
                const st = await getMediaAccountStates('movie', movie.id, session)
                if (!cancel) {
                    setFavorite(!!st.favorite)
                    setWatchlist(!!st.watchlist)
                }
            } catch {
            } finally {
                if (!cancel) setLoadingStates(false)
            }
        }
        load()
        return () => { cancel = true }
    }, [movie, session, account])

    useEffect(() => {
        let abort = false
        if (!movie) return

        const loadAll = async () => {
            // Backdrop (igual que tu preview normal)
            const { backdrop: userBackdrop } = getArtworkPreference(movie.id)
            if (userBackdrop) {
                const url = buildImg(userBackdrop, 'w1280')
                await preloadImage(url)
                if (!abort) {
                    setBackdropPath(userBackdrop)
                    setBackdropReady(true)
                }
            } else if (backdropOverride) {
                const url = buildImg(backdropOverride, 'w1280')
                await preloadImage(url)
                if (!abort) {
                    setBackdropPath(backdropOverride)
                    setBackdropReady(true)
                }
            } else {
                const chosen = movie.backdrop_path || movie.poster_path || null
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
            }

            // Extras: runtime + país (1 característica extra)
            try {
                const details = await getMovieDetails(movie.id).catch(() => null)
                const runtime = details?.runtime ?? null
                const country = details?.production_countries?.[0]?.name || null
                if (!abort) setExtras({ runtime, country })
            } catch {
                if (!abort) setExtras({ runtime: null, country: null })
            }
        }

        loadAll()
        return () => { abort = true }
    }, [movie, backdropOverride])

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
                type: 'movie',
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
                type: 'movie',
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
        backdropPath || movie.backdrop_path || movie.poster_path || null
    const bgSrc = resolvedBackdrop ? buildImg(resolvedBackdrop, 'w1280') : null

    const genres = (() => {
        const ids = movie.genre_ids || (Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : [])
        const names = ids.map((id) => GENRES[id]).filter(Boolean)
        return names.slice(0, 2).join(' • ')
    })()

    const release = movie?.release_date || null
    const releaseText = release ? new Date(release).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : (yearOf(movie) || '—')

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={`rounded-lg overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-950 to-black text-white shadow-2xl ${heightClass} grid grid-rows-[76%_24%] cursor-pointer ring-1 ring-white/5 hover:ring-white/10 transition-all duration-300`}
            onClick={() => { window.location.href = href }}
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
                        {(trailerLoading) && (
                            <div className="absolute inset-0 bg-neutral-900 animate-pulse" />
                        )}
                        {trailer?.key && (
                            <div className="absolute inset-0 overflow-hidden">
                                <iframe
                                    key={trailer.key}
                                    ref={trailerIframeRef}
                                    className="absolute left-1/2 top-1/2 w-[140%] h-[180%] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                                    src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=0&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1`}
                                    title={`Trailer - ${movie.title || movie.name}`}
                                    allow="autoplay; encrypted-media; picture-in-picture"
                                    allowFullScreen={false}
                                />
                            </div>
                        )}
                    </>
                )}

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent via-black/60 to-black/95"
                />
            </div>

            <div className="w-full h-full bg-gradient-to-br from-neutral-950/98 to-black/98 border-t border-white/5 backdrop-blur-sm">
                <div className="h-full px-4 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        {/* ✅ META NUEVA SOLO PARA MÁS ESPERADAS */}
                        <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-neutral-200">
                            <span className="font-medium">{releaseText}</span>
                            {extras?.runtime ? <span>• {formatRuntime(extras.runtime)}</span> : null}
                            {extras?.country ? <span>• {extras.country}</span> : null}
                        </div>

                        {genres && (
                            <div className="mt-1 text-[11px] sm:text-xs text-neutral-100/90 line-clamp-1">
                                {genres}
                            </div>
                        )}

                        {error && <p className="mt-1 text-[11px] text-red-400 line-clamp-1">{error}</p>}
                    </div>

                    <motion.div 
                        className="flex items-center gap-2 sm:gap-3 flex-shrink-0"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleToggleTrailer}
                            disabled={trailerLoading}
                            title={showTrailer ? 'Cerrar trailer' : 'Ver trailer'}
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-yellow-500/90 to-yellow-600/90 hover:from-yellow-400 hover:to-yellow-500 border border-yellow-400/40 flex items-center justify-center text-black transition-all duration-200 disabled:opacity-60 shadow-lg shadow-yellow-500/30 hover:shadow-yellow-500/50"
                        >
                            {trailerLoading ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : showTrailer ? <X className="w-5 h-5 text-black" /> : <Play className="w-5 h-5 ml-0.5 text-black" />}
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleToggleFavorite}
                            disabled={loadingStates || updating}
                            title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all duration-200 disabled:opacity-60 shadow-lg ${
                                favorite 
                                    ? 'bg-gradient-to-br from-red-600/90 to-red-700/90 hover:from-red-500 hover:to-red-600 border-red-400/40 shadow-red-500/30 hover:shadow-red-500/50 text-white' 
                                    : 'bg-gradient-to-br from-neutral-700/70 to-neutral-800/70 hover:from-neutral-600 hover:to-neutral-700 border-neutral-500/30 shadow-black/20 text-white'
                            }`}
                        >
                            {loadingStates || updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={`w-5 h-5 ${favorite ? 'fill-current' : ''}`} />}
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleToggleWatchlist}
                            disabled={loadingStates || updating}
                            title={watchlist ? 'Quitar de pendientes' : 'Añadir a pendientes'}
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all duration-200 disabled:opacity-60 shadow-lg ${
                                watchlist
                                    ? 'bg-gradient-to-br from-blue-600/90 to-blue-700/90 hover:from-blue-500 hover:to-blue-600 border-blue-400/40 shadow-blue-500/30 hover:shadow-blue-500/50 text-white'
                                    : 'bg-gradient-to-br from-neutral-700/70 to-neutral-800/70 hover:from-neutral-600 hover:to-neutral-700 border-neutral-500/30 shadow-black/20 text-white'
                            }`}
                        >
                            {loadingStates || updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className={`w-5 h-5 ${watchlist ? 'fill-current' : ''}`} />}
                        </motion.button>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    )
}

/* ---------- Fila reusable ---------- */
/* ---------- Fila reusable ---------- */
function Row({
    title,
    items,
    isMobile,
    hydrated,
    posterCacheRef,
    posterOverrides,
    backdropOverrides,
    overridesReady,
    previewKind = 'default', // ✅ 4C: selector de preview
}) {
    if (!items || items.length === 0) return null

    // ✅ Detectar si es una fila de género específico
    const isGenreRow = ![
        'Recomendado',
        'Tendencias (Trakt)',
        'Más esperadas',
        'Populares',
        'Tendencias semanales',
        'Taquillazos imprescindibles',
        'Premiadas y nominadas',
        'Historias de venganza',
        'Populares en EE.UU.',
        'Películas de culto',
        'Infravaloradas',
        'En ascenso',
        'Recomendadas para ti'
    ].includes(title) && !title.includes('década') && !title.includes('Clásicos') && !title.includes('Favoritas') && !title.includes('Hits')

    // ✅ Determinar etiqueta específica según el título
    let labelText = null
    if (title === 'Más esperadas') {
        labelText = 'ANTICIPADAS'
    } else if (title === 'Populares') {
        labelText = 'POPULARES'
    } else if (title === 'Tendencias semanales') {
        labelText = 'TENDENCIAS'
    } else if (isGenreRow) {
        labelText = 'GÉNERO'
    }

    const swiperRef = useRef(null)
    const rowRef = useRef(null)
    const [isHoveredRow, setIsHoveredRow] = useState(false)
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)
    const [hoveredId, setHoveredId] = useState(null)
    const [hoveredIndex, setHoveredIndex] = useState(null)
    const isInView = useInView(rowRef, { once: true, margin: '-100px' })
    const [preloadedBackdrops, setPreloadedBackdrops] = useState(new Set())

    // Precargar backdrops cuando el usuario está sobre la fila
    useEffect(() => {
        if (!isHoveredRow || !items || isMobile) return

        const preloadBackdrops = async () => {
            const toPreload = items.slice(0, 5).filter(m => !preloadedBackdrops.has(m.id))
            
            for (const movie of toPreload) {
                const backdropOverride = backdropOverrides?.[movie.id]
                const backdropPath = backdropOverride || movie.backdrop_path
                
                if (backdropPath) {
                    const img = new Image()
                    img.src = buildImg(backdropPath, 'w1280')
                    setPreloadedBackdrops(prev => new Set([...prev, movie.id]))
                }
            }
        }

        const timer = setTimeout(preloadBackdrops, 300)
        return () => clearTimeout(timer)
    }, [isHoveredRow, items, isMobile, backdropOverrides, preloadedBackdrops])

    const hasActivePreview = !!hoveredId
    const heightClassDesktop = 'h-[220px] sm:h-[260px] md:h-[300px] xl:h-[340px]'
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
        // Avanzar 3 slides en lugar de 1 para desktop
        const slidesToMove = isMobile ? 1 : 3
        for (let i = 0; i < slidesToMove; i++) {
            swiper.slidePrev()
        }
    }

    const handleNextClick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const swiper = swiperRef.current
        if (!swiper) return
        // Avanzar 3 slides en lugar de 1 para desktop
        const slidesToMove = isMobile ? 1 : 3
        for (let i = 0; i < slidesToMove; i++) {
            swiper.slideNext()
        }
    }

    const showPrev = (isHoveredRow || hasActivePreview) && canPrev
    const showNext = (isHoveredRow || hasActivePreview) && canNext

    const breakpointsRow = {
        0: { slidesPerView: 3, spaceBetween: 12 },
        640: { slidesPerView: 4, spaceBetween: 14 },
        768: { slidesPerView: 'auto', spaceBetween: 14 },
        1024: { slidesPerView: 'auto', spaceBetween: 18 },
        1280: { slidesPerView: 'auto', spaceBetween: 20 },
    }

    const swiperKey = `${title}-${hydrated ? 'h' : 's'}-${isMobile ? 'm' : 'd'}`

    return (
        <motion.div 
            ref={rowRef}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={fadeInUp}
            className="relative group"
        >
            <motion.div
                variants={scaleIn}
                className="mb-5 px-1 sm:px-0"
            >
                {labelText && (
                    <div className="flex items-center gap-2 mb-1.5">
                        <div className="h-px w-8 bg-emerald-500" />
                        <span className="text-emerald-400 font-bold uppercase tracking-widest text-[10px]">
                            {labelText}
                        </span>
                    </div>
                )}
                <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent">
                    {title}<span className="text-emerald-500">.</span>
                </h3>
            </motion.div>

            <div
                className="relative"
                onMouseEnter={() => setIsHoveredRow(true)}
                onMouseLeave={() => {
                    setIsHoveredRow(false)
                    setHoveredId(null)
                }}
            >
                <div className={!hydrated ? 'pointer-events-none touch-none' : ''}>
                    <Swiper
                        key={swiperKey}
                        slidesPerView={3}
                        spaceBetween={12}
                        onSwiper={handleSwiper}
                        onSlideChange={updateNav}
                        onResize={updateNav}
                        onReachBeginning={updateNav}
                        onReachEnd={updateNav}
                        loop={false}
                        watchOverflow={true}
                        grabCursor={!isMobile}
                        allowTouchMove={true}
                        preventClicks={true}
                        preventClicksPropagation={true}
                        threshold={5}
                        modules={[Navigation]}
                        className="group relative"
                        breakpoints={breakpointsRow}
                    >
                        {items.map((m, i) => {
                            const isActive = hydrated && !isMobile && hoveredId === m.id
                            const isLast = i === items.length - 1
                            const isSecondToLast = i === items.length - 2
                            const isThirdToLast = i === items.length - 3
                            const isNearEnd = isLast || isSecondToLast || isThirdToLast

                            const base = 'relative flex-shrink-0 transition-all duration-300 ease-in-out'

                            const sizeClasses = isMobile
                                ? 'w-full'
                                : isActive
                                    ? 'w-[320px] sm:w-[320px] md:w-[430px] xl:w-[480px] z-20'
                                    : 'w-[140px] sm:w-[140px] md:w-[190px] xl:w-[210px] z-10'

                            // Determinar si el item activo está cerca del borde y calcular transformación
                            let transformClass = ''
                            if (!isMobile && hoveredIndex !== null && hoveredIndex >= 0) {
                                const activeIndex = hoveredIndex
                                const totalItems = items.length
                                
                                // Si el item activo está en los últimos 3 items, desplazar todo hacia la izquierda
                                if (activeIndex >= totalItems - 3) {
                                    if (i <= activeIndex) {
                                        // Items antes o igual al activo se desplazan a la izquierda
                                        if (activeIndex === totalItems - 1) {
                                            transformClass = 'sm:-translate-x-[190px] md:-translate-x-[260px] xl:-translate-x-[290px]'
                                        } else if (activeIndex === totalItems - 2) {
                                            transformClass = 'sm:-translate-x-[130px] md:-translate-x-[180px] xl:-translate-x-[200px]'
                                        } else if (activeIndex === totalItems - 3) {
                                            transformClass = 'sm:-translate-x-[65px] md:-translate-x-[90px] xl:-translate-x-[100px]'
                                        }
                                    }
                                }
                            }

                            const hasPosterOverride = Object.prototype.hasOwnProperty.call(posterOverrides || {}, m.id)
                            const hasBackdropOverride = Object.prototype.hasOwnProperty.call(backdropOverrides || {}, m.id)

                            // ✅ 4B: NO bloquees PosterImage si ya sabemos que NO hay override.
                            // - undefined => aún no listo (loader)
                            // - null => listo pero sin override
                            // - string => override real
                            const posterOverride = !overridesReady
                                ? undefined
                                : hasPosterOverride
                                    ? posterOverrides[m.id]
                                    : null

                            const backdropOverride = !overridesReady
                                ? undefined
                                : hasBackdropOverride
                                    ? backdropOverrides[m.id]
                                    : null

                            return (
                                <SwiperSlide key={m.id} className={isMobile ? 'select-none' : '!w-auto select-none'}>
                                    <div
                                        className={`${base} ${sizeClasses} ${posterBoxClass} ${transformClass} ${isActive ? 'overflow-visible' : 'overflow-hidden'}`}
                                        onMouseEnter={() => {
                                            if (!isMobile) {
                                                setHoveredId(m.id)
                                                setHoveredIndex(i)
                                            }
                                        }}
                                        onMouseLeave={() => {
                                            setHoveredId((prev) => (prev === m.id ? null : prev))
                                            setHoveredIndex(null)
                                        }}
                                    >
                                        <AnimatePresence initial={false} mode="popLayout">
                                            {isActive ? (
                                                <motion.div
                                                    key="preview"
                                                    initial={{ opacity: 0, scale: 0.98 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
                                                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                                                    className="w-full h-full hidden sm:block"
                                                    style={{ willChange: 'transform, opacity' }}
                                                >
                                                    {/* ✅ 4C: preview por tipo */}
                                                    {previewKind === 'anticipated' ? (
                                                        <InlinePreviewCardAnticipated
                                                            movie={m}
                                                            heightClass={heightClassDesktop}
                                                            backdropOverride={backdropOverride}
                                                        />
                                                    ) : (
                                                        <InlinePreviewCard
                                                            movie={m}
                                                            heightClass={heightClassDesktop}
                                                            backdropOverride={backdropOverride}
                                                        />
                                                    )}
                                                </motion.div>
                                            ) : (
                                                <motion.div
                                                    key="poster"
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
                                                    transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                                                    className="w-full h-full"
                                                    style={{ willChange: 'transform, opacity' }}
                                                >
                                                    <Link href={`/details/movie/${m.id}`}>
                                                        <PosterImage
                                                            movie={m}
                                                            cache={posterCacheRef}
                                                            heightClass={posterBoxClass}
                                                            isMobile={isMobile}
                                                            posterOverride={posterOverride}
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
                </div>

                <AnimatePresence>
                    {showPrev && !isMobile && (
                        <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            type="button"
                            onClick={handlePrevClick}
                            className="absolute inset-y-0 left-0 w-32 z-30
                  hidden sm:flex items-center justify-start
                  bg-gradient-to-r from-black/90 via-black/70 to-transparent
                  hover:from-black/95 hover:via-black/80
                  transition-all duration-300 pointer-events-auto group/nav"
                        >
                            <motion.span 
                                className="ml-6 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] group-hover/nav:scale-110 transition-transform"
                                whileHover={{ x: -4 }}
                            >
                                ‹
                            </motion.span>
                        </motion.button>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {showNext && !isMobile && (
                        <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            type="button"
                            onClick={handleNextClick}
                            className="absolute inset-y-0 right-0 w-32 z-30
                  hidden sm:flex items-center justify-end
                  bg-gradient-to-l from-black/90 via-black/70 to-transparent
                  hover:from-black/95 hover:via-black/80
                  transition-all duration-300 pointer-events-auto group/nav"
                        >
                            <motion.span 
                                className="mr-6 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] group-hover/nav:scale-110 transition-transform"
                                whileHover={{ x: 4 }}
                            >
                                ›
                            </motion.span>
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    )
}

function TraktMixedRow({ title, items, isMobile, hydrated }) {
    if (!items || items.length === 0) return null

    // ✅ Detectar si es una fila de género específico
    const isGenreRow = ![
        'Recomendado',
        'Tendencias (Trakt)',
        'Más esperadas',
        'Populares',
        'Tendencias semanales',
        'Taquillazos imprescindibles',
        'Premiadas y nominadas',
        'Historias de venganza',
        'Populares en EE.UU.',
        'Películas de culto',
        'Infravaloradas',
        'En ascenso',
        'Recomendadas para ti'
    ].includes(title) && !title.includes('década') && !title.includes('Clásicos') && !title.includes('Favoritas') && !title.includes('Hits')

    // ✅ Determinar etiqueta específica según el título
    let labelText = null
    if (title === 'Más esperadas') {
        labelText = 'ANTICIPADAS'
    } else if (title === 'Populares') {
        labelText = 'POPULARES'
    } else if (title === 'Tendencias semanales') {
        labelText = 'TENDENCIAS'
    } else if (isGenreRow) {
        labelText = 'GÉNERO'
    }

    const rowRef = useRef(null)
    const isInView = useInView(rowRef, { once: true, margin: '-100px' })

    const breakpointsRow = {
        0: { slidesPerView: 3, spaceBetween: 12 },
        640: { slidesPerView: 4, spaceBetween: 14 },
        768: { slidesPerView: 'auto', spaceBetween: 14 },
        1024: { slidesPerView: 'auto', spaceBetween: 18 },
        1280: { slidesPerView: 'auto', spaceBetween: 20 }
    }

    const heightClassDesktop = 'h-[220px] sm:h-[260px] md:h-[300px] xl:h-[340px]'
    const posterBoxClass = isMobile ? 'aspect-[2/3]' : heightClassDesktop
    const swiperKey = `trakt-${title}-${hydrated ? 'h' : 's'}-${isMobile ? 'm' : 'd'}`

    const formatMeta = (m) => {
        const year = (m?.release_date || m?.first_air_date || '').slice(0, 4)
        if (m?.media_type === 'tv') {
            const eps = m?.number_of_episodes
            return `${year || '—'}${eps ? ` • ${eps} eps.` : ''}`
        }
        const rt = m?.runtime
        return `${year || '—'}${rt ? ` • ${formatRuntime(rt)}` : ''}`
    }

    return (
        <motion.div
            ref={rowRef}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={fadeInUp}
            className="relative group"
        >
            <motion.div
                variants={scaleIn}
                className="mb-5 px-1 sm:px-0"
            >
                {labelText && (
                    <div className="flex items-center gap-2 mb-1.5">
                        <div className="h-px w-8 bg-emerald-500" />
                        <span className="text-emerald-400 font-bold uppercase tracking-widest text-[10px]">
                            {labelText}
                        </span>
                    </div>
                )}
                <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent">
                    {title}<span className="text-emerald-500">.</span>
                </h3>
            </motion.div>

            <div className={!hydrated ? 'pointer-events-none touch-none' : ''}>
                <Swiper
                    key={swiperKey}
                    slidesPerView={3}
                    spaceBetween={12}
                    loop={false}
                    watchOverflow={true}
                    grabCursor={!isMobile}
                    allowTouchMove={true}
                    preventClicks={true}
                    preventClicksPropagation={true}
                    threshold={5}
                    modules={[Navigation]}
                    breakpoints={breakpointsRow}
                    className="group relative"
                >
                    {items.map((m) => {
                        const type = m?.media_type || 'movie'
                        const href = `/details/${type}/${m.id}`
                        const poster = m?.poster_path ? buildImg(m.poster_path, 'w342') : '/default-poster.png'

                        return (
                            <SwiperSlide key={`${type}-${m.id}`} className={isMobile ? 'select-none' : '!w-auto select-none'}>
                                <div className={`relative flex-shrink-0 transition-all duration-300 ease-in-out ${isMobile ? 'w-full' : 'w-[140px] sm:w-[140px] md:w-[190px] xl:w-[210px]'} ${posterBoxClass}`}>
                                    <Link href={href}>
                                        <div className="w-full h-full">
                                            <img
                                                src={poster}
                                                alt={m.title || m.name || ''}
                                                className={`w-full ${posterBoxClass} object-cover rounded-lg`}
                                                loading="lazy"
                                                decoding="async"
                                            />
                                            <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-300">
                                                {type === 'tv' ? <TvIcon className="w-3.5 h-3.5" /> : <FilmIcon className="w-3.5 h-3.5" />}
                                                <span className="line-clamp-1">{formatMeta(m)}</span>
                                            </div>
                                        </div>
                                    </Link>
                                </div>
                            </SwiperSlide>
                        )
                    })}
                </Swiper>
            </div>
        </motion.div>
    )
}

/* ---------- Carrusel hero (backdrops) ---------- */
function TopRatedHero({ items, isMobile, hydrated, backdropOverrides }) {
    if (!items || items.length === 0) return null

    const swiperRef = useRef(null)
    const heroRef = useRef(null)
    const [isHoveredHero, setIsHoveredHero] = useState(false)
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)
    const isInView = useInView(heroRef, { once: true, margin: '0px' })

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
                const entries = await Promise.all(
                    items.map(async (movie) => {
                        const id = movie?.id
                        if (!id) return [null, null]

                        const override = backdropOverrides?.[id] || null
                        if (override) {
                            await preloadImage(buildImg(override, 'w780'))
                            return [id, override]
                        }

                        const { backdrop: userBackdrop } = getArtworkPreference(id)
                        if (userBackdrop) {
                            await preloadImage(buildImg(userBackdrop, 'w780'))
                            return [id, userBackdrop]
                        }

                        let chosen = movie?.backdrop_path || movie?.poster_path || null
                        if (chosen) {
                            await preloadImage(buildImg(chosen, 'w780'))
                            return [id, chosen]
                        }

                        chosen = await fetchBestBackdrop(id)
                        if (!chosen) chosen = movie?.backdrop_path || movie?.poster_path || null
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
    }, [items, backdropOverrides])

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
        // Para el hero, avanzar 1 slide (ya que son imágenes grandes)
        swiper.slidePrev()
    }

    const handleNextClick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const swiper = swiperRef.current
        if (!swiper) return
        // Para el hero, avanzar 1 slide (ya que son imágenes grandes)
        swiper.slideNext()
    }

    const showPrev = isHoveredHero && canPrev
    const showNext = isHoveredHero && canNext

    const heroKey = `hero-${hydrated ? 'h' : 's'}-${isMobile ? 'm' : 'd'}`

    return (
        <motion.div
            ref={heroRef}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative group mb-10 sm:mb-14"
        >
            {/* Título de la sección */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="mb-5 px-1 sm:px-0"
            >
                <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-px w-8 bg-emerald-500" />
                    <span className="text-emerald-400 font-bold uppercase tracking-widest text-[10px]">
                        DESTACADAS
                    </span>
                </div>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent">
                    Mejores valoradas<span className="text-emerald-500">.</span>
                </h3>
            </motion.div>

            <div
                className="relative px-2"
                onMouseEnter={() => setIsHoveredHero(true)}
                onMouseLeave={() => setIsHoveredHero(false)}
            >
                {!heroLoaded ? (
                    <div className="flex gap-4 overflow-hidden">
                        {items.slice(0, 1).map((movie) => (
                            <div
                                key={movie.id}
                                className="relative w-full rounded-xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 aspect-[16/9] overflow-hidden"
                            >
                                <motion.div
                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                                    variants={shimmer}
                                    animate="animate"
                                    style={{ backgroundSize: '200% 100%' }}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        <div className={!hydrated ? 'pointer-events-none touch-none' : ''}>
                            <Swiper
                                key={heroKey}
                                slidesPerView={isMobile ? 1 : 3}
                                spaceBetween={isMobile ? 12 : 16}
                                autoplay={hydrated ? { delay: 5000 } : false}
                                onSwiper={handleSwiper}
                                onSlideChange={updateNav}
                                onResize={updateNav}
                                onReachBeginning={updateNav}
                                onReachEnd={updateNav}
                                loop={false}
                                watchOverflow={true}
                                grabCursor={!isMobile}
                                allowTouchMove={true}
                                preventClicks={true}
                                preventClicksPropagation={true}
                                threshold={5}
                                modules={[Navigation, Autoplay]}
                                className="group relative -mx-2"
                                breakpoints={{
                                    0: { slidesPerView: 1, spaceBetween: 12 },
                                    1024: { slidesPerView: isMobile ? 1 : 3, spaceBetween: 16 }
                                }}
                            >
                                {items.map((movie) => {
                                    const heroBackdrop = heroBackdrops[movie.id] || null
                                    const slideClass = isMobile ? '!w-full select-none' : 'select-none'

                                    if (!heroBackdrop) {
                                        return (
                                            <SwiperSlide key={movie.id} className={slideClass}>
                                                <Link href={`/details/movie/${movie.id}`}>
                                                    {// CAMBIO: rounded-3xl -> rounded-xl
                                                    }
                                                    <div className="relative rounded-xl bg-neutral-900 aspect-[16/9]" />
                                                </Link>
                                            </SwiperSlide>
                                        )
                                    }

                                    return (
                                        <SwiperSlide key={movie.id} className={slideClass}>
                                            <Link href={`/details/movie/${movie.id}`}>
                                                <div className="p-1">
                                                    <motion.div 
                                                        className="relative cursor-pointer overflow-hidden rounded-xl aspect-[16/9] bg-neutral-900 group/hero ring-1 ring-white/5 hover:ring-white/20 transition-all duration-300"
                                                        whileHover={{ scale: 1.015 }}
                                                        transition={{ duration: 0.3 }}
                                                    >
                                                        <img
                                                            src={buildImg(heroBackdrop, 'w780')}
                                                            alt=""
                                                            aria-hidden="true"
                                                            className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-35 scale-110"
                                                            loading="lazy"
                                                            decoding="async"
                                                        />
                                                        <img
                                                            src={buildImg(heroBackdrop, 'w1280')}
                                                            srcSet={`${buildImg(heroBackdrop, 'w780')} 780w, ${buildImg(
                                                                heroBackdrop,
                                                                'w1280'
                                                            )} 1280w, ${buildImg(heroBackdrop, 'original')} 2400w`}
                                                            sizes="(min-width:1536px) 1100px, (min-width:1280px) 900px, (min-width:1024px) 800px, 95vw"
                                                            alt={movie.title || movie.name}
                                                            className={`absolute inset-0 w-full h-full rounded-xl ${
                                                                isMobile ? 'object-contain' : 'object-cover'
                                                                } transition-transform duration-700 ease-out`}
                                                            loading="lazy"
                                                            decoding="async"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover/hero:opacity-100 transition-opacity duration-300" />
                                                    </motion.div>
                                                </div>
                                            </Link>
                                        </SwiperSlide>
                                    )
                                })}
                            </Swiper>
                        </div>

                        <AnimatePresence>
                            {showPrev && !isMobile && (
                                <motion.button
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    type="button"
                                    onClick={handlePrevClick}
                                    className="absolute inset-y-0 left-0 w-24 z-20
                                hidden sm:flex items-center justify-start
                                bg-gradient-to-r from-black/80 via-black/50 to-transparent
                                hover:from-black/90 hover:via-black/70
                                transition-all duration-300 pointer-events-auto group/nav"
                                >
                                    <motion.span 
                                        className="ml-4 text-5xl font-bold text-white drop-shadow-[0_0_14px_rgba(0,0,0,0.95)] group-hover/nav:scale-110 transition-transform"
                                        whileHover={{ x: -5 }}
                                    >
                                        ‹
                                    </motion.span>
                                </motion.button>
                            )}
                        </AnimatePresence>

                        <AnimatePresence>
                            {showNext && !isMobile && (
                                <motion.button
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    type="button"
                                    onClick={handleNextClick}
                                    className="absolute inset-y-0 right-0 w-24 z-20
                                hidden sm:flex items-center justify-end
                                bg-gradient-to-l from-black/80 via-black/50 to-transparent
                                hover:from-black/90 hover:via-black/70
                                transition-all duration-300 pointer-events-auto group/nav"
                                >
                                    <motion.span 
                                        className="mr-4 text-5xl font-bold text-white drop-shadow-[0_0_14px_rgba(0,0,0,0.95)] group-hover/nav:scale-110 transition-transform"
                                        whileHover={{ x: 5 }}
                                    >
                                        ›
                                    </motion.span>
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </div>
        </motion.div>
    )
}

/* =================== MainDashboard (CLIENTE) =================== */
export default function MainDashboardClient({ initialData }) {
    const isMobile = useIsMobileLayout(768)
    const [hydrated, setHydrated] = useState(false)
    useEffect(() => setHydrated(true), [])

    const posterCacheRef = useRef(new Map())
    const dashboardData = initialData || {}

    const allMovieIds = useMemo(() => {
        const keys = [
            'topRated',
            'popular',
            'trending',
            'mind',
            'action',
            'us',
            'cult',
            'underrated',
            'rising',
            'recommended',
            'traktRecommended',
            'traktAnticipated',
            'traktTrending',
        ]
        const set = new Set()
        for (const k of keys) {
            const arr = dashboardData?.[k] || []
            for (const m of arr) if (m?.id) set.add(m.id)
        }
        return Array.from(set).sort((a, b) => a - b)
    }, [dashboardData])

    const [posterOverrides, setPosterOverrides] = useState({})
    const [backdropOverrides, setBackdropOverrides] = useState({})
    const [overridesReady, setOverridesReady] = useState(false)

    useEffect(() => {
        let cancelled = false

        const loadOverrides = async () => {
            if (!allMovieIds.length) {
                if (!cancelled) {
                    setPosterOverrides({})
                    setBackdropOverrides({})
                    setOverridesReady(true)
                }
                return
            }

            if (!cancelled) setOverridesReady(false)

            try {
                const [posters, backdrops] = await Promise.all([
                    fetchArtworkOverrides({ type: 'movie', kind: 'poster', ids: allMovieIds }).catch(() => ({})),
                    fetchArtworkOverrides({ type: 'movie', kind: 'backdrop', ids: allMovieIds }).catch(() => ({})),
                ])

                if (cancelled) return
                setPosterOverrides(posters || {})
                setBackdropOverrides(backdrops || {})
            } catch (err) {
                if (cancelled) return
                console.error('Error cargando overrides (dashboard)', err)
                setPosterOverrides({})
                setBackdropOverrides({})
            } finally {
                if (!cancelled) setOverridesReady(true)
            }
        }

        loadOverrides()
        return () => { cancelled = true }
    }, [allMovieIds])

    if (!dashboardData || Object.keys(dashboardData).length === 0) {
        return <div className="h-screen bg-black" />
    }

    return (
        <div className="min-h-screen px-4 sm:px-6 py-6 sm:py-8 text-white bg-gradient-to-b from-black via-neutral-950 to-black">
            <TopRatedHero
                items={dashboardData.topRated || []}
                isMobile={isMobile}
                hydrated={hydrated}
                backdropOverrides={backdropOverrides}
            />

            <motion.div 
                className="space-y-14 sm:space-y-16"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
            >
                {/* ✅ Trakt: Recomendado (preview normal) */}
                <Row
                    title="Recomendado"
                    items={dashboardData.traktRecommended || []}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                />

                {/* ✅ Trakt: Tendencias (preview normal) */}
                <Row
                    title="Tendencias (Trakt)"
                    items={dashboardData.traktTrending || []}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                />

                {/* ✅ Trakt: Más esperadas (preview nueva) */}
                <Row
                    title="Más esperadas"
                    items={dashboardData.traktAnticipated || []}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                    previewKind="anticipated"
                />

                {/* ...el resto igual... */}
                <Row
                    title="Populares"
                    items={dashboardData.popular}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                />

                <Row
                    title="Tendencias semanales"
                    items={dashboardData.trending}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                />

                <Row
                    title="Guiones complejos"
                    items={dashboardData.mind}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                />

                <Row
                    title="Top acción"
                    items={dashboardData.action}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                />

                <Row
                    title="Populares en EE.UU."
                    items={dashboardData.us}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                />

                <Row
                    title="Películas de culto"
                    items={dashboardData.cult}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                />

                <Row
                    title="Infravaloradas"
                    items={dashboardData.underrated}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                />

                <Row
                    title="En ascenso"
                    items={dashboardData.rising}
                    isMobile={isMobile}
                    hydrated={hydrated}
                    posterCacheRef={posterCacheRef}
                    posterOverrides={posterOverrides}
                    backdropOverrides={backdropOverrides}
                    overridesReady={overridesReady}
                />

                {dashboardData.recommended?.length > 0 && (
                    <Row
                        title="Recomendadas para ti"
                        items={dashboardData.recommended}
                        isMobile={isMobile}
                        hydrated={hydrated}
                        posterCacheRef={posterCacheRef}
                        posterOverrides={posterOverrides}
                        backdropOverrides={backdropOverrides}
                        overridesReady={overridesReady}
                    />
                )}
            </motion.div>
        </div>
    )
}