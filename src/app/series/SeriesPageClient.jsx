// /src/app/series/SeriesPageClient.jsx
'use client'

import { useRef, useEffect, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation } from 'swiper'
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
    getDetails, // getDetails('tv', id, opts)
    getExternalIds
} from '@/lib/api/tmdb'

import { fetchOmdbByImdb } from '@/lib/api/omdb'

const anton = Anton({ weight: '400', subsets: ['latin'] })

/* --- Hook: detectar dispositivo táctil --- */
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

/* ---------- helpers ---------- */
const yearOf = (m) =>
    m?.first_air_date?.slice(0, 4) || m?.release_date?.slice(0, 4) || ''

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

const TV_GENRES = {
    10759: 'Acción y aventura',
    16: 'Animación',
    35: 'Comedia',
    80: 'Crimen',
    99: 'Documental',
    18: 'Drama',
    10751: 'Familia',
    10762: 'Infantil',
    9648: 'Misterio',
    10763: 'Noticias',
    10764: 'Reality',
    10765: 'Ciencia ficción y fantasía',
    10766: 'Telenovela',
    10767: 'Talk show',
    10768: 'Bélica y política',
    37: 'Western'
}

/* ========= Backdrop preferido (ES -> EN) TV ========= */
async function fetchTVBackdropEsThenEn(showId) {
    try {
        const url =
            `https://api.themoviedb.org/3/tv/${showId}/images` +
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

/* ========= Poster preferido TV (ES -> EN) ========= */
async function fetchTVPosterEsThenEn(showId) {
    try {
        const url =
            `https://api.themoviedb.org/3/tv/${showId}/images` +
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

/* --------- Precargar imagen --------- */
function preloadImage(src) {
    return new Promise((resolve) => {
        if (!src) return resolve(false)
        const img = new Image()
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = src
    })
}

/* =================== CACHÉS COMPARTIDOS (CLIENTE TV) =================== */
const tvExtrasCache = new Map() // show.id -> { runtime, awards, imdbRating }
const tvBackdropCache = new Map() // show.id -> backdrop file_path

/* ======== Preferencias de artwork guardadas en localStorage (TV) ======== */
function getTVArtworkPreference(showId) {
    if (typeof window === 'undefined') {
        return { poster: null, backdrop: null, background: null }
    }
    const base = `showverse:tv:${showId}`
    const poster = window.localStorage.getItem(`${base}:poster`)
    const backdrop = window.localStorage.getItem(`${base}:backdrop`)
    const background = window.localStorage.getItem(`${base}:background`)
    return {
        poster: poster || null,
        backdrop: backdrop || null,
        background: background || null
    }
}

/* ====================================================================
 * Portada TV 2:3 con caché + overrides
 * ==================================================================== */
function PosterImage({ show, cache, heightClass }) {
    const [posterPath, setPosterPath] = useState(
        show.poster_path || show.backdrop_path || null
    )
    const [ready, setReady] = useState(!!posterPath)

    useEffect(() => {
        let abort = false

        const load = async () => {
            if (!show) return

            // 1) Preferencia seleccionada en detalles (admin) para esta serie (localStorage)
            const { poster: userPoster } = getTVArtworkPreference(show.id)
            if (userPoster) {
                const url = buildImg(userPoster, 'w342')
                await preloadImage(url)
                if (!abort) {
                    cache.current.set(show.id, userPoster)
                    setPosterPath(userPoster)
                    setReady(true)
                }
                return
            }

            // 2) Cache en memoria
            const cached = cache.current.get(show.id)
            if (cached) {
                const url = buildImg(cached, 'w342')
                await preloadImage(url)
                if (!abort) {
                    setPosterPath(cached)
                    setReady(true)
                }
                return
            }

            // 3) Si el servidor ya ha marcado una portada (incluye overrides globales)
            if (show.poster_path) {
                const url = buildImg(show.poster_path, 'w342')
                await preloadImage(url)
                if (!abort) {
                    cache.current.set(show.id, show.poster_path)
                    setPosterPath(show.poster_path)
                    setReady(true)
                }
                return
            }

            // 4) Fallback: buscar mejor poster ES/EN desde TMDb o usar backdrop
            setReady(false)
            const preferred = await fetchTVPosterEsThenEn(show.id)
            const chosen = preferred || show.backdrop_path || null
            const url = chosen ? buildImg(chosen, 'w342') : null
            await preloadImage(url)
            if (!abort) {
                cache.current.set(show.id, chosen)
                setPosterPath(chosen)
                setReady(!!chosen)
            }
        }

        load()
        return () => {
            abort = true
        }
    }, [show, cache])

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
                    alt={show.name || show.title}
                    className={`w-full ${heightClass} object-cover rounded-3xl`}
                    loading="lazy"
                    decoding="async"
                />
            )}
        </>
    )
}

/* ====================================================================
 * Vista previa inline tipo Amazon (backdrop horizontal) para TV
 * ==================================================================== */
function InlinePreviewCard({ show, heightClass }) {
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
            if (!show || !session || !account?.id) {
                setFavorite(false)
                setWatchlist(false)
                return
            }
            try {
                setLoadingStates(true)
                const type = show.media_type || 'tv'
                const st = await getMediaAccountStates(type, show.id, session)
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
    }, [show, session, account])

    // Backdrop + extras con caché y overrides
    useEffect(() => {
        let abort = false
        if (!show) return

        const loadAll = async () => {
            // === BACKDROP ===

            // 1) Backdrop preferido por el usuario (admin) en este dispositivo
            const { backdrop: userBackdrop } = getTVArtworkPreference(show.id)
            if (userBackdrop) {
                tvBackdropCache.set(show.id, userBackdrop)
                const url = buildImg(userBackdrop, 'w1280')
                await preloadImage(url)
                if (!abort) {
                    setBackdropPath(userBackdrop)
                    setBackdropReady(true)
                }
            } else if (show.backdrop_path) {
                // 2) Backdrop que viene ya del servidor (incluye overrides globales)
                tvBackdropCache.set(show.id, show.backdrop_path)
                const url = buildImg(show.backdrop_path, 'w1280')
                await preloadImage(url)
                if (!abort) {
                    setBackdropPath(show.backdrop_path)
                    setBackdropReady(true)
                }
            } else {
                // 3) Caché o TMDb como fallback
                const cachedBackdrop = tvBackdropCache.get(show.id)
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
                        const preferred = await fetchTVBackdropEsThenEn(show.id)
                        const chosen = preferred || show.poster_path || null
                        tvBackdropCache.set(show.id, chosen)

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

            // === EXTRAS (runtime, awards, imdbRating) ===
            const cachedExtras = tvExtrasCache.get(show.id)
            if (cachedExtras) {
                if (!abort) setExtras(cachedExtras)
            } else {
                try {
                    let runtime = null
                    try {
                        const details = await getDetails('tv', show.id, {
                            language: 'es-ES'
                        })
                        runtime = details?.episode_run_time?.[0] ?? null
                    } catch { }

                    let awards = null
                    let imdbRating = null
                    try {
                        let imdb = show?.imdb_id
                        if (!imdb) {
                            const ext = await getExternalIds('tv', show.id)
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
                    tvExtrasCache.set(show.id, next)
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
    }, [show])

    const href = `/details/tv/${show.id}`

    const requireLogin = () => {
        if (!session || !account?.id) {
            window.location.href = '/login'
            return true
        }
        return false
    }

    const handleToggleFavorite = async (e) => {
        e.stopPropagation()
        if (requireLogin() || updating || !show) return
        try {
            setUpdating(true)
            setError('')
            const next = !favorite
            setFavorite(next)
            await markAsFavorite({
                accountId: account.id,
                sessionId: session,
                type: show.media_type || 'tv',
                mediaId: show.id,
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
        if (requireLogin() || updating || !show) return
        try {
            setUpdating(true)
            setError('')
            const next = !watchlist
            setWatchlist(next)
            await markInWatchlist({
                accountId: account.id,
                sessionId: session,
                type: show.media_type || 'tv',
                mediaId: show.id,
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
        backdropPath || show.backdrop_path || show.poster_path || null
    const bgSrc = resolvedBackdrop ? buildImg(resolvedBackdrop, 'w1280') : null

    const genres = (() => {
        const ids =
            show.genre_ids ||
            (Array.isArray(show.genres) ? show.genres.map((g) => g.id) : [])
        const names = ids.map((id) => TV_GENRES[id]).filter(Boolean)
        return names.slice(0, 3).join(' • ')
    })()

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
                        alt={show.name || show.title}
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
                                {yearOf(show) && <span>{yearOf(show)}</span>}
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
                                    <span className="font-medium">{ratingOf(show)}</span>
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
                                <div className="text-[11px] sm:text-xs text-neutral-100/90 line-clamp-1 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
                                    {genres}
                                </div>
                            )}

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

/* ---------- Fila reusable, igual que en películas ---------- */
function Row({ title, items, isTouchDevice, posterCacheRef }) {
    if (!items || items.length === 0) return null

    const swiperRef = useRef(null)
    const [isHoveredRow, setIsHoveredRow] = useState(false)
    const [canPrev, setCanPrev] = useState(false)
    const [canNext, setCanNext] = useState(false)
    const [hoveredId, setHoveredId] = useState(null)

    const hasActivePreview = !!hoveredId
    const isTop10 = title === 'Top 10 hoy en España'

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
                    spaceBetween={isTop10 ? 24 : 16}
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
                        0: { spaceBetween: isTop10 ? 16 : 12 },
                        640: { spaceBetween: isTop10 ? 20 : 14 },
                        1024: { spaceBetween: isTop10 ? 28 : 18 },
                        1280: { spaceBetween: isTop10 ? 32 : 20 }
                    }}
                >
                    {items.map((s, i) => {
                        const isActive = hoveredId === s.id
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

                        const cardElement = (
                            <div
                                className={`${base} ${sizeClasses} ${heightClass} ${transformClass}`}
                                onMouseEnter={() => setHoveredId(s.id)}
                                onMouseLeave={() =>
                                    setHoveredId((prev) => (prev === s.id ? null : prev))
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
                                                show={s}
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
                                            <Link href={`/details/tv/${s.id}`}>
                                                <PosterImage
                                                    show={s}
                                                    cache={posterCacheRef}
                                                    heightClass={heightClass}
                                                />
                                            </Link>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )

                        return (
                            <SwiperSlide key={s.id} className="!w-auto select-none">
                                {isTop10 ? (
                                    <div className="flex items-center">
                                        <div
                                            className="text-[150px] sm:text-[180px] md:text-[220px] xl:text-[260px] font-black z-0 select-none
                                    bg-gradient-to-b from-blue-900/40 via-blue-600/30 to-blue-400/20 bg-clip-text text-transparent
                                    drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]"
                                            style={{
                                                fontFamily:
                                                    'system-ui, -apple-system, sans-serif',
                                                lineHeight: 0.8,
                                                marginRight: '-0.15em',
                                                marginLeft: '0.1em'
                                            }}
                                        >
                                            {i + 1}
                                        </div>
                                        {cardElement}
                                    </div>
                                ) : (
                                    cardElement
                                )}
                            </SwiperSlide>
                        )
                    })}
                </Swiper>

                {/* LATERAL IZQUIERDO – franja difuminada */}
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

                {/* LATERAL DERECHO – franja difuminada */}
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

function GenreRows({ groups, isTouchDevice, posterCacheRef }) {
    if (!groups) return null
    return (
        <>
            {Object.entries(groups || {}).map(([gname, list]) =>
                list?.length ? (
                    <Row
                        key={`genre-${gname}`}
                        title={`Por género — ${gname}`}
                        items={list}
                        isTouchDevice={isTouchDevice}
                        posterCacheRef={posterCacheRef}
                    />
                ) : null
            )}
        </>
    )
}

/* * ====================================================================
 * Componente Principal (CLIENTE): recibe datos ya cargados en servidor
 * ==================================================================== */
export default function SeriesPageClient({ initialData }) {
    const isTouchDevice = useIsTouchDevice()
    const posterCacheRef = useRef(new Map())
    const dashboardData = initialData || {}

    if (!dashboardData || Object.keys(dashboardData).length === 0) {
        return <div className="h-screen bg-black" />
    }

    return (
        <div className="px-8 py-2 text-white bg-black">
            <div className="space-y-12 pt-10">
                {dashboardData['Top 10 hoy en España']?.length ? (
                    <Row
                        title="Top 10 hoy en España"
                        items={dashboardData['Top 10 hoy en España']}
                        isTouchDevice={isTouchDevice}
                        posterCacheRef={posterCacheRef}
                    />
                ) : null}

                {dashboardData.popular?.length > 0 && (
                    <Row
                        title="Tendencias en series ahora mismo"
                        items={dashboardData.popular}
                        isTouchDevice={isTouchDevice}
                        posterCacheRef={posterCacheRef}
                    />
                )}

                {dashboardData.top_imdb?.length > 0 && (
                    <Row
                        title="Series imprescindibles según IMDb"
                        items={dashboardData.top_imdb}
                        isTouchDevice={isTouchDevice}
                        posterCacheRef={posterCacheRef}
                    />
                )}

                {dashboardData['En Emisión']?.length ? (
                    <Row
                        title="En emisión ahora mismo"
                        items={dashboardData['En Emisión']}
                        isTouchDevice={isTouchDevice}
                        posterCacheRef={posterCacheRef}
                    />
                ) : null}

                {dashboardData['Aclamadas por la crítica']?.length ? (
                    <Row
                        title="Aclamadas por la crítica"
                        items={dashboardData['Aclamadas por la crítica']}
                        isTouchDevice={isTouchDevice}
                        posterCacheRef={posterCacheRef}
                    />
                ) : null}

                {dashboardData.drama?.length > 0 && (
                    <Row
                        title="Dramas que enganchan"
                        items={dashboardData.drama}
                        isTouchDevice={isTouchDevice}
                        posterCacheRef={posterCacheRef}
                    />
                )}

                {dashboardData.scifi_fantasy?.length > 0 && (
                    <Row
                        title="Ciencia ficción y fantasía"
                        items={dashboardData.scifi_fantasy}
                        isTouchDevice={isTouchDevice}
                        posterCacheRef={posterCacheRef}
                    />
                )}

                {dashboardData.crime?.length > 0 && (
                    <Row
                        title="Crimen y suspense"
                        items={dashboardData.crime}
                        isTouchDevice={isTouchDevice}
                        posterCacheRef={posterCacheRef}
                    />
                )}

                {dashboardData.animation?.length > 0 && (
                    <Row
                        title="Animación para maratonear"
                        items={dashboardData.animation}
                        isTouchDevice={isTouchDevice}
                        posterCacheRef={posterCacheRef}
                    />
                )}

                <GenreRows
                    groups={dashboardData['Por género']}
                    isTouchDevice={isTouchDevice}
                    posterCacheRef={posterCacheRef}
                />
            </div>
        </div>
    )
}
