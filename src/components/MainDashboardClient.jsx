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
    Loader2
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

const anton = Anton({ weight: '400', subsets: ['latin'] })

/* --- Hook para detectar dispositivo táctil --- */
const useIsTouchDevice = () => {
    const [isTouch, setIsTouch] = useState(false)
    useEffect(() => {
        const onTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
        setIsTouch(onTouch)
    }, [])
    return isTouch
}

/* ---------- helpers ---------- */
const yearOf = (m) =>
    m?.release_date?.slice(0, 4) || m?.first_air_date?.slice(0, 4) || ''

const ratingOf = (m) =>
    typeof m?.vote_average === 'number' && m.vote_average > 0
        ? m.vote_average.toFixed(1)
        : '–'

const short = (t = '', n = 420) =>
    t.length > n ? t.slice(0, n - 1) + '…' : t

const formatRuntime = (mins) => {
    if (!mins || typeof mins !== 'number') return null
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h <= 0) return `${m} min`
    return m ? `${h} h ${m} min` : `${h} h`
}

const buildImg = (path, size = 'original') =>
    `https://image.tmdb.org/t/p/${size}${path}`

/* ========= elegir mejor poster: ES -> EN, y por calidad ========= */
/* AHORA solo se usa como fallback si no hay ninguna imagen en los datos del servidor */
async function fetchMoviePosterEsThenEn(movieId) {
    try {
        const url =
            `https://api.themoviedb.org/3/movie/${movieId}/images` +
            `?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}` +
            `&language=es-ES&include_image_language=es,es-ES,en,en-US`
        const r = await fetch(url, { cache: 'force-cache' })
        const j = await r.json()
        const posters = Array.isArray(j?.posters) ? j.posters : []

        const pickBest = (arr) => {
            if (!arr.length) return null
            const sorted = [...arr].sort((a, b) => {
                const vc = (b.vote_count || 0) - (a.vote_count || 0)
                if (vc !== 0) return vc
                const va = (b.vote_average || 0) - (a.vote_average || 0)
                if (va !== 0) return va
                return (b.width || 0) - (a.width || 0)
            })
            const topVote = sorted[0]?.vote_count || 0
            const topSet = sorted.filter((x) => (x.vote_count || 0) === topVote)
            topSet.sort((a, b) => (b.width || 0) - (a.width || 0))
            return topSet[0] || sorted[0]
        }

        const es = posters.filter(
            (p) => p.iso_639_1 === 'es' || p.iso_639_1 === 'es-ES'
        )
        const en = posters.filter(
            (p) => p.iso_639_1 === 'en' || p.iso_639_1 === 'en-US'
        )

        const bestES = pickBest(es)
        if (bestES?.file_path) return bestES.file_path

        const bestEN = pickBest(en)
        if (bestEN?.file_path) return bestEN.file_path

        return null
    } catch {
        return null
    }
}

/* ========= elegir mejor backdrop: ES -> EN, y por calidad ========= */
/* AHORA solo se usa como fallback si no hay backdrop/poster/profile en los datos del servidor */
async function fetchBackdropEsThenEn(movieId) {
    try {
        const url =
            `https://api.themoviedb.org/3/movie/${movieId}/images` +
            `?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}` +
            `&language=es-ES&include_image_language=es,es-ES,en,en-US`

        const r = await fetch(url, { cache: 'force-cache' })
        const j = await r.json()
        const backs = Array.isArray(j?.backdrops) ? j.backdrops : []

        const pickBest = (arr) => {
            if (!arr.length) return null
            const sorted = [...arr].sort((a, b) => {
                const vc = (b.vote_count || 0) - (a.vote_count || 0)
                if (vc !== 0) return vc
                const va = (b.vote_average || 0) - (a.vote_average || 0)
                if (va !== 0) return va
                return (b.width || 0) - (a.width || 0)
            })
            const topVote = sorted[0]?.vote_count || 0
            const topSet = sorted.filter((x) => (x.vote_count || 0) === topVote)
            topSet.sort((a, b) => (b.width || 0) - (a.width || 0))
            return topSet[0] || sorted[0]
        }

        const es = backs.filter(
            (b) => b.iso_639_1 === 'es' || b.iso_639_1 === 'es-ES'
        )
        const en = backs.filter(
            (b) => b.iso_639_1 === 'en' || b.iso_639_1 === 'en-US'
        )

        const bestES = pickBest(es)
        if (bestES?.file_path) return bestES.file_path

        const bestEN = pickBest(en)
        if (bestEN?.file_path) return bestEN.file_path

        return null
    } catch {
        return null
    }
}

/* --------- precargar una imagen y resolver tras onload --------- */
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
const movieBackdropCache = new Map() // movie.id -> backdrop file_path

/* ======== Preferencias de artwork guardadas en localStorage ======== */
/* Siguen existiendo como override personal, pero por debajo quedan
   los overrides globales que llegan ya en movie.poster_path/backdrop_path */
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
 * Portada normal (2:3), mismo alto que la vista previa
 * ==================================================================== */
function PosterImage({ movie, cache, heightClass }) {
    const [posterPath, setPosterPath] = useState(movie.poster_path || null)
    const [ready, setReady] = useState(!!movie.poster_path)

    useEffect(() => {
        let abort = false

        const load = async () => {
            if (!movie) return

            // 1) Preferencia del usuario (poster) – override personal
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

            // 2) Cache en memoria (puede venir de ejecuciones previas en esta sesión)
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

            // 3) Datos que YA vienen del servidor (incluyendo overrides globales)
            //    Si hay poster/backdrop/profile, NO pisamos nada con heurística
            const serverPoster =
                movie.poster_path || movie.backdrop_path || movie.profile_path || null

            let chosen = serverPoster
            let preferred = null

            // 4) Solo si NO hay ninguna imagen en los datos del servidor,
            //    usamos la lógica ES/EN + votos como fallback
            if (!chosen) {
                preferred = await fetchMoviePosterEsThenEn(movie.id)
                chosen = preferred || null
            }

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

    return (
        <>
            {!ready && (
                <div
                    className={`w-full ${heightClass} rounded-3xl bg-neutral-800 animate-pulse`}
                />
            )}
            {ready && posterPath && (
                <img
                    src={buildImg(posterPath, 'w342')}
                    alt={movie.title || movie.name}
                    className={`w-full ${heightClass} object-cover rounded-3xl`}
                    loading="lazy"
                    decoding="async"
                />
            )}
        </>
    )
}

/* ====================================================================
 * Vista previa inline tipo Amazon (backdrop horizontal) para películas
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

    // Estados de cuenta
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

    // Backdrop + extras con caché, overrides globales y preferencia de usuario
    useEffect(() => {
        let abort = false
        if (!movie) return

        const loadAll = async () => {
            // 1) Backdrop preferido por el usuario (override personal)
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
                // 2) Valor que llega del servidor (incluye overrides globales en BD)
                const serverBackdrop =
                    movie.backdrop_path ||
                    movie.poster_path ||
                    movie.profile_path ||
                    null

                const cachedBackdrop = movieBackdropCache.get(movie.id)

                if (serverBackdrop) {
                    // El servidor manda: sincronizamos la caché con lo que venga de ahí
                    if (cachedBackdrop !== serverBackdrop) {
                        movieBackdropCache.set(movie.id, serverBackdrop)
                    }
                    const url = buildImg(serverBackdrop, 'w1280')
                    await preloadImage(url)
                    if (!abort) {
                        setBackdropPath(serverBackdrop)
                        setBackdropReady(true)
                    }
                } else if (cachedBackdrop !== undefined) {
                    // No hay dato de servidor, pero sí algo cacheado en esta sesión
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
                    // 3) Sin servidor ni caché: usamos la lógica ES/EN + votos como fallback
                    try {
                        const preferred = await fetchBackdropEsThenEn(movie.id)
                        const chosen = preferred || null

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

            // 4) Extras (runtime, awards, imdbRating) con caché
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
                            if (
                                rawAwards &&
                                typeof rawAwards === 'string' &&
                                rawAwards.trim()
                            ) {
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
                    if (!abort) {
                        setExtras({ runtime: null, awards: null, imdbRating: null })
                    }
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

    const resolvedBackdrop =
        backdropPath || movie.backdrop_path || movie.poster_path || null
    const bgSrc = resolvedBackdrop ? buildImg(resolvedBackdrop, 'w1280') : null

    return (
        <div
            className={`relative rounded-3xl overflow-hidden bg-neutral-900 text-white shadow-xl ${heightClass} flex cursor-pointer`}
            onClick={() => {
                window.location.href = href
            }}
        >
            {/* Fondo backdrop */}
            <div className="absolute inset-0">
                {!backdropReady && (
                    <div className="w-full h-full bg-neutral-900 animate-pulse" />
                )}

                {backdropReady && bgSrc && (
                    <img
                        src={bgSrc}
                        alt={movie.title || movie.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                    />
                )}

                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]
                 bg-gradient-to-t from-black/95 via-black/65 to-transparent"
                />
            </div>

            {/* Contenido en franja inferior */}
            <div className="relative z-10 flex-1 flex flex-col justify-end">
                <div className="px-4 sm:px-6 lg:px-8 pb-4 sm:pb-5 lg:pb-6">
                    <div className="flex items-end justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-3 text-[11px] sm:text-xs text-neutral-200">
                                {yearOf(movie) && <span>{yearOf(movie)}</span>}
                                {extras?.runtime && (
                                    <span>• {formatRuntime(extras.runtime)}</span>
                                )}

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

                            {extras?.awards && (
                                <div className="text-[11px] sm:text-xs text-emerald-300 line-clamp-2 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                                    {extras.awards}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            <button
                                onClick={handleToggleFavorite}
                                disabled={loadingStates || updating}
                                title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-neutral-700/70 hover:bg-neutral-600/90 backdrop-blur-sm border border-neutral-600/60 flex items-center justify-center text-white transition-colors disabled:opacity-60"
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
                                title={
                                    watchlist ? 'Quitar de pendientes' : 'Añadir a pendientes'
                                }
                                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-neutral-700/70 hover:bg-neutral-600/90 backdrop-blur-sm border border-neutral-600/60 flex items-center justify-center text-white transition-colors disabled:opacity-60"
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

                    {error && (
                        <p className="mt-2 text-[11px] text-red-400 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                            {error}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

/* ---------- Fila reusable (mismo diseño que películas/series) ---------- */
function Row({ title, items, isTouchDevice, posterCacheRef }) {
    if (!items || items.length === 0) return null

    const swiperRef = useRef(null)
    const [isHoveredRow, setIsHoveredRow] = useState(false)
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)
    const [hoveredId, setHoveredId] = useState(null)

    const hasActivePreview = !!hoveredId
    const heightClass = 'h-[220px] sm:h-[260px] md:h-[300px] xl:h-[340px]'

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
        const target = Math.max((swiper.activeIndex || 0) - 6, 0)
        swiper.slideTo(target)
    }

    const handleNextClick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const swiper = swiperRef.current
        if (!swiper) return
        const maxIndex = swiper.slides.length - 1
        const target = Math.min((swiper.activeIndex || 0) + 6, maxIndex)
        swiper.slideTo(target)
    }

    const showPrev = (isHoveredRow || hasActivePreview) && canPrev
    const showNext = (isHoveredRow || hasActivePreview) && canNext

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
                    spaceBetween={16}
                    slidesPerView="auto"
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
                    breakpoints={{
                        0: { spaceBetween: 12 },
                        640: { spaceBetween: 14 },
                        1024: { spaceBetween: 18 },
                        1280: { spaceBetween: 20 }
                    }}
                >
                    {items.map((m, i) => {
                        const isActive = hoveredId === m.id
                        const isLast = i === items.length - 1

                        const base =
                            'relative flex-shrink-0 transition-all duration-300 ease-out'

                        const sizeClasses = isActive
                            ? 'w-[390px] sm:w-[460px] md:w-[530px] xl:w-[600px] z-20'
                            : 'w-[140px] sm:w-[170px] md:w-[190px] xl:w-[210px] z-10'

                        const transformClass =
                            isActive && isLast
                                ? '-translate-x-[250px] sm:-translate-x-[290px] md:-translate-x-[340px] xl:-translate-x-[390px]'
                                : ''

                        return (
                            <SwiperSlide key={m.id} className="!w-auto select-none">
                                <div
                                    className={`${base} ${sizeClasses} ${heightClass} ${transformClass}`}
                                    onMouseEnter={() => setHoveredId(m.id)}
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
                                                className="w-full h-full"
                                            >
                                                <InlinePreviewCard
                                                    movie={m}
                                                    heightClass={heightClass}
                                                />
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
                                                        heightClass={heightClass}
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

                {/* Lateral izquierdo – franja difuminada */}
                {showPrev && (
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

                {/* Lateral derecho – franja difuminada */}
                {showNext && (
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
function TopRatedHero({ items, isTouchDevice }) {
    if (!items || items.length === 0) return null

    const swiperRef = useRef(null)
    const [isHoveredHero, setIsHoveredHero] = useState(false)
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)

    const computeSlidesPerView = (swiper) => {
        if (!swiper) return 1
        const param = swiper.params.slidesPerView
        if (typeof param === 'number') return param
        if (typeof swiper.slidesPerViewDynamic === 'function') {
            const dyn = swiper.slidesPerViewDynamic()
            if (typeof dyn === 'number' && dyn > 0) return dyn
        }
        return 1
    }

    const updateNav = (swiper) => {
        if (!swiper) return
        const total = swiper.slides.length
        const spv = computeSlidesPerView(swiper)
        const hasOverflow = total > spv
        setCanPrev(hasOverflow && !swiper.isBeginning)
        setCanNext(hasOverflow && !swiper.isEnd)
    }

    const handleSwiper = (swiper) => {
        swiperRef.current = swiper
        updateNav(swiper)
    }

    const slideBy = (delta) => {
        const swiper = swiperRef.current
        if (!swiper) return
        const total = swiper.slides.length
        if (!total) return

        const active = swiper.activeIndex || 0
        const spv = computeSlidesPerView(swiper)
        const maxIndex = Math.max(0, total - spv)
        const target = Math.min(Math.max(active + delta, 0), maxIndex)

        swiper.slideTo(target)
    }

    const handlePrevClick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        slideBy(-1)
    }

    const handleNextClick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        slideBy(1)
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
                <Swiper
                    spaceBetween={20}
                    slidesPerView={3}
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
                        640: { slidesPerView: 2, spaceBetween: 16 },
                        1024: { slidesPerView: 3, spaceBetween: 20 }
                    }}
                >
                    {items.map((movie) => {
                        // Usar el mismo criterio que la vista previa pero
                        // confiando primero en lo que viene del servidor (overrides globales)
                        const { backdrop: userBackdrop } = getArtworkPreference(movie.id)
                        const cached = movieBackdropCache.get(movie.id) || null
                        const fromServer =
                            movie.backdrop_path ||
                            movie.poster_path ||
                            movie.profile_path ||
                            null

                        const heroBackdrop =
                            userBackdrop || fromServer || cached || null

                        if (!heroBackdrop) {
                            return (
                                <SwiperSlide key={movie.id}>
                                    <Link href={`/details/movie/${movie.id}`}>
                                        <div className="relative rounded-3xl bg-neutral-900 aspect-[16/9]" />
                                    </Link>
                                </SwiperSlide>
                            )
                        }

                        return (
                            <SwiperSlide key={movie.id}>
                                <Link href={`/details/movie/${movie.id}`}>
                                    <div className="relative cursor-pointer overflow-hidden rounded-3xl aspect-[16/9]">
                                        <img
                                            src={buildImg(heroBackdrop, 'w1280')}
                                            srcSet={`${buildImg(
                                                heroBackdrop,
                                                'w780'
                                            )} 780w, ${buildImg(
                                                heroBackdrop,
                                                'w1280'
                                            )} 1280w, ${buildImg(
                                                heroBackdrop,
                                                'original'
                                            )} 2400w`}
                                            sizes="(min-width:1536px) 1200px, (min-width:1280px) 1100px, (min-width:1024px) 900px, 95vw"
                                            alt={movie.title || movie.name}
                                            className="absolute inset-0 w-full h-full object-cover rounded-3xl hover:scale-105 transition-transform duration-300"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </div>
                                </Link>
                            </SwiperSlide>
                        )
                    })}
                </Swiper>

                {/* Flecha izquierda hero */}
                {showPrev && (
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

                {/* Flecha derecha hero */}
                {showNext && (
                    <button
                        type="button"
                        onClick={handleNextClick}
                        className="absolute inset-y-0 right-0 w-32 z-20
                       hidden sm:flex items-center justify-end
                       bg-gradient-to-l from-black/75 via-black/45 to-transparent
                       hover:from-black/90 hover:via-black/65
                       transition-colors pointer-events-auto"
                    >
                        <span className="mr-4 text-4xl font-semibold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
                            ›
                        </span>
                    </button>
                )}
            </div>
        </div>
    )
}

/* =================== MainDashboard (CLIENTE) =================== */
export default function MainDashboardClient({ initialData }) {
    const isTouchDevice = useIsTouchDevice()
    const posterCacheRef = useRef(new Map())
    const dashboardData = initialData || {}

    if (!dashboardData || Object.keys(dashboardData).length === 0) {
        return <div className="h-screen bg-black" />
    }

    return (
        <div className="px-6 py-6 text-white bg-black">
            <TopRatedHero
                items={dashboardData.topRated || []}
                isTouchDevice={isTouchDevice}
            />

            <div className="space-y-12">
                <Row
                    title="Populares"
                    items={dashboardData.popular}
                    isTouchDevice={isTouchDevice}
                    posterCacheRef={posterCacheRef}
                />
                <Row
                    title="Tendencias semanales"
                    items={dashboardData.trending}
                    isTouchDevice={isTouchDevice}
                    posterCacheRef={posterCacheRef}
                />
                <Row
                    title="Guiones complejos"
                    items={dashboardData.mind}
                    isTouchDevice={isTouchDevice}
                    posterCacheRef={posterCacheRef}
                />
                <Row
                    title="Top acción"
                    items={dashboardData.action}
                    isTouchDevice={isTouchDevice}
                    posterCacheRef={posterCacheRef}
                />
                <Row
                    title="Populares en EE.UU."
                    items={dashboardData.us}
                    isTouchDevice={isTouchDevice}
                    posterCacheRef={posterCacheRef}
                />
                <Row
                    title="Películas de culto"
                    items={dashboardData.cult}
                    isTouchDevice={isTouchDevice}
                    posterCacheRef={posterCacheRef}
                />
                <Row
                    title="Infravaloradas"
                    items={dashboardData.underrated}
                    isTouchDevice={isTouchDevice}
                    posterCacheRef={posterCacheRef}
                />
                <Row
                    title="En ascenso"
                    items={dashboardData.rising}
                    isTouchDevice={isTouchDevice}
                    posterCacheRef={posterCacheRef}
                />

                {dashboardData.recommended?.length > 0 && (
                    <Row
                        title="Recomendadas para ti"
                        items={dashboardData.recommended}
                        isTouchDevice={isTouchDevice}
                        posterCacheRef={posterCacheRef}
                    />
                )}
            </div>
        </div>
    )
}
