// /src/components/EpisodeDetailsClient.jsx
'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/swiper-bundle.css'

import {
    ArrowLeft,
    Calendar as CalendarIcon,
    Clock as ClockIcon,
    Star as StarIcon,
    Users as UsersIcon,
    MonitorPlay,
    ImageOff,
    Eye,
    Play as PlayIcon,
    List as ListIcon,
    Heart as HeartIcon,
} from 'lucide-react'

import { SectionTitle, VisualMetaCard } from '@/components/details/DetailAtoms'
import { CompactBadge, ExternalLinkButton, MiniStat, UnifiedRateButton } from '@/components/details/DetailHeaderBits'
import { formatDateEs, stripHtml, formatVoteCount, formatCountShort } from '@/lib/details/formatters'
import StarRating from '@/components/StarRating'

export default function EpisodeDetailsClient({ showId, seasonNumber, episodeNumber, show, episode, imdb, imdbUrl }) {
    const router = useRouter()

    const showName = show?.name || 'Serie'
    const epName = episode?.name || `Episodio ${episodeNumber}`

    const stillPath = episode?.still_path || null
    const heroBgPath = stillPath || show?.backdrop_path || show?.poster_path || null

    const airDate = episode?.air_date ? formatDateEs(episode.air_date) : null
    const runtime = Number(episode?.runtime || 0) || null
    const vote = typeof episode?.vote_average === 'number' && episode.vote_average > 0 ? episode.vote_average : null
    const voteCount = typeof episode?.vote_count === 'number' ? episode.vote_count : null

    const cast = Array.isArray(episode?.credits?.cast) ? episode.credits.cast : []
    const guestStars = Array.isArray(episode?.credits?.guest_stars) ? episode.credits.guest_stars : []

    const tmdbEpisodeUrl = `https://www.themoviedb.org/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`

    const heroBackgroundStyle = useMemo(() => {
        if (!heroBgPath) return null
        const url = `https://image.tmdb.org/t/p/original${heroBgPath}`
        return { backgroundImage: `url(${url})` }
    }, [heroBgPath])

    const fmtStat = useCallback((n) => {
        const v = typeof n === 'number' ? n : 0
        return formatVoteCount(v) ?? '0'
    }, [])

    // ✅ Tabs
    const [activeTab, setActiveTab] = useState('details')

    // ✅ Trakt scoreboard
    const [tScoreboard, setTScoreboard] = useState({
        loading: true,
        rating: null,
        votes: null,
        stats: null,
        traktUrl: null,
    })

    const traktDecimal = useMemo(() => {
        if (tScoreboard.rating == null) return null
        const v = Number(tScoreboard.rating) // Trakt ya viene 0..10
        if (!Number.isFinite(v) || v <= 0) return null
        return v.toFixed(1) // punto
    }, [tScoreboard.rating])

    useEffect(() => {
        let alive = true
            ; (async () => {
                try {
                    setTScoreboard((s) => ({ ...s, loading: true }))
                    const res = await fetch(
                        `/api/trakt/scoreboard?type=episode&tmdbId=${showId}&season=${seasonNumber}&episode=${episodeNumber}`,
                        { cache: 'no-store' }
                    )
                    const json = await res.json().catch(() => null)
                    if (!alive) return

                    if (res.ok && json?.found) {
                        setTScoreboard({
                            loading: false,
                            rating: typeof json?.community?.rating === 'number' ? json.community.rating : null,
                            votes: typeof json?.community?.votes === 'number' ? json.community.votes : null,
                            stats: json?.stats || null,
                            traktUrl: json?.traktUrl || null,
                        })
                    } else {
                        setTScoreboard({ loading: false, rating: null, votes: null, stats: null, traktUrl: null })
                    }
                } catch {
                    if (alive) setTScoreboard({ loading: false, rating: null, votes: null, stats: null, traktUrl: null })
                }
            })()
        return () => {
            alive = false
        }
    }, [showId, seasonNumber, episodeNumber])

    // =========================
    // ✅ Rating SOLO Trakt + StarRating
    // =========================
    const [isRatingOpen, setIsRatingOpen] = useState(false)
    const [userRating, setUserRating] = useState(null)
    const [userRatingLoading, setUserRatingLoading] = useState(true)
    const [ratingLoading, setRatingLoading] = useState(false)
    const [traktConnected, setTraktConnected] = useState(true)

    // Cargar rating del usuario (Trakt)
    useEffect(() => {
        let alive = true
            ; (async () => {
                try {
                    setUserRatingLoading(true)
                    const res = await fetch(
                        `/api/trakt/ratings?type=episode&tmdbId=${Number(showId)}&season=${Number(seasonNumber)}&episode=${Number(
                            episodeNumber
                        )}`,
                        { cache: 'no-store' }
                    )

                    if (!alive) return

                    if (res.status === 401) {
                        setTraktConnected(false)
                        setUserRating(null)
                        return
                    }

                    setTraktConnected(true)

                    const j = await res.json().catch(() => ({}))
                    setUserRating(typeof j?.rating === 'number' ? j.rating : null)
                } catch (e) {
                    console.error(e)
                    if (alive) {
                        setUserRating(null)
                        setTraktConnected(false)
                    }
                } finally {
                    if (alive) setUserRatingLoading(false)
                }
            })()

        return () => {
            alive = false
        }
    }, [showId, seasonNumber, episodeNumber])

    const handleRate = useCallback(
        async (val) => {
            try {
                const next = val == null || Number(val) <= 0 ? null : Number(val)

                setRatingLoading(true)
                const res = await fetch('/api/trakt/ratings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'episode',
                        tmdbId: Number(showId), // ✅ TMDb ID de la SERIE (show)
                        season: Number(seasonNumber),
                        episode: Number(episodeNumber),
                        rating: next, // null => remove
                    }),
                })

                if (res.status === 401) {
                    window.location.href = '/api/trakt/auth/start'
                    return
                }

                const j = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(j?.error || 'Trakt rating failed')

                setTraktConnected(true)
                setUserRating(next)
            } catch (e) {
                console.error(e)
            } finally {
                setRatingLoading(false)
                setIsRatingOpen(false)
            }
        },
        [showId, seasonNumber, episodeNumber]
    )

    // Trigger (mismo hueco visual que antes)
    const openRating = useCallback(() => {
        if (!traktConnected) {
            window.location.href = '/api/trakt/auth/start'
            return
        }
        setIsRatingOpen(true)
    }, [traktConnected])

    return (
        <div className="relative min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-yellow-500/30">
            {/* Background */}
            <div className="fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a]">
                {heroBackgroundStyle ? (
                    <>
                        <div
                            className="absolute inset-0 bg-cover bg-center"
                            style={{
                                ...heroBackgroundStyle,
                                transform: 'scale(1)',
                                filter: 'blur(14px) brightness(0.65) saturate(1.05)',
                            }}
                        />
                        <div
                            className="absolute inset-0 bg-cover transition-opacity duration-1000"
                            style={{
                                ...heroBackgroundStyle,
                                backgroundPosition: 'center top',
                                transform: 'scale(1)',
                                transformOrigin: 'center top',
                            }}
                        />
                    </>
                ) : (
                    <div className="absolute inset-0 bg-[#0a0a0a]" />
                )}

                <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/60 via-transparent to-transparent" />
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#101010]/60 via-transparent to-transparent" />
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-l from-[#101010]/60 via-transparent to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/60 to-black/20 backdrop-blur-[2px]" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#101010] via-transparent to-transparent opacity-30" />
            </div>

            {/* Content */}
            <div className="relative z-10 px-4 py-8 lg:py-12 max-w-7xl mx-auto">
                {/* Back buttons */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/10 transition"
                    >
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>

                    <a
                        href={`/details/tv/${showId}/season/${seasonNumber}`}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/10 transition"
                    >
                        Temporada {seasonNumber}
                    </a>

                    <a
                        href={`/details/tv/${showId}`}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/10 transition"
                    >
                        <MonitorPlay className="w-4 h-4" /> {showName}
                    </a>
                </div>

                {/* Hero */}
                <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-10 animate-in fade-in duration-700 slide-in-from-bottom-4 items-start">
                    {/* Left still */}
                    <div className="w-full max-w-[520px] lg:max-w-[560px] mx-auto lg:mx-0 flex-shrink-0">
                        <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-white/10 bg-black/40">
                            <div className="relative aspect-video bg-neutral-900">
                                {stillPath ? (
                                    <img
                                        src={`https://image.tmdb.org/t/p/original${stillPath}`}
                                        alt={epName}
                                        className="w-full h-full object-cover"
                                        loading="eager"
                                        decoding="async"
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <ImageOff className="w-10 h-10 text-neutral-700" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right info + SCOREBOARD + TABS */}
                    <div className="flex-1 flex flex-col min-w-0 w-full">
                        <div className="mb-5 px-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                                Episodio {episodeNumber} · Temporada {seasonNumber}
                            </div>

                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1] tracking-tight text-balance drop-shadow-xl mb-3">
                                {epName}
                            </h1>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base md:text-lg font-medium text-zinc-300">
                                <span className="text-white font-bold tracking-wide">{showName}</span>

                                {airDate ? (
                                    <>
                                        <span className="text-zinc-600 text-[10px]">●</span>
                                        <span className="inline-flex items-center gap-2">
                                            <CalendarIcon className="w-4 h-4" /> {airDate}
                                        </span>
                                    </>
                                ) : null}

                                {runtime ? (
                                    <>
                                        <span className="text-zinc-600 text-[10px]">●</span>
                                        <span className="inline-flex items-center gap-2">
                                            <ClockIcon className="w-4 h-4" /> {runtime} min
                                        </span>
                                    </>
                                ) : null}
                            </div>
                        </div>

                        {/* ✅ SCOREBOARD */}
                        <div className="w-full border border-white/10 bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden mb-6">
                            <div
                                className="
      py-3
      pl-[calc(1rem+env(safe-area-inset-left))]
      pr-[calc(1.25rem+env(safe-area-inset-right))]
      sm:px-4
      flex items-center gap-3 sm:gap-4
      overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
    "
                            >
                                <div className="flex items-center gap-4 sm:gap-5 shrink-0">
                                    {tScoreboard.loading && (
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    )}

                                    <CompactBadge
                                        logo="/logo-TMDb.png"
                                        logoClassName="h-2 sm:h-4"
                                        value={vote?.toFixed(1)}
                                        sub={voteCount ? formatCountShort(voteCount) : undefined}
                                        href={tmdbEpisodeUrl}
                                    />

                                    {/* Trakt (móvil sin sufijo / desktop con %) */}
                                    {traktDecimal && (
                                        <CompactBadge
                                            logo="/logo-Trakt.png"
                                            value={traktDecimal}
                                            sub={tScoreboard.votes ? formatCountShort(tScoreboard.votes) : undefined}
                                            href={tScoreboard.traktUrl}
                                        />
                                    )}

                                    {imdb?.rating != null && (
                                        <CompactBadge
                                            logo="/logo-IMDb.png"
                                            logoClassName="h-5 sm:h-5"
                                            value={Number(imdb.rating).toFixed(1)}
                                            sub={imdb?.votes ? formatCountShort(imdb.votes) : undefined}
                                            href={imdbUrl || undefined}
                                        />
                                    )}
                                </div>

                                <div className="w-px h-6 bg-white/10 shrink-0" />
                                <div className="flex-1 min-w-0" />
                                <div className="w-px h-6 bg-white/10 shrink-0" />

                                <div className="flex items-center gap-3 shrink-0">
                                    <StarRating
                                        open={isRatingOpen}
                                        rating={userRating}
                                        loading={ratingLoading}
                                        onClose={() => setIsRatingOpen(false)}
                                        onRate={handleRate}
                                    />
                                </div>
                            </div>

                            {!tScoreboard.loading && tScoreboard?.stats && (
                                <div className="border-t border-white/5 bg-black/10">
                                    <div
                                        className="
          overflow-x-auto
          [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
          py-2
          pl-[calc(1rem+env(safe-area-inset-left))]
          pr-[calc(1rem+env(safe-area-inset-right))]
        "
                                    >
                                        <div className="flex items-center gap-3 min-w-max">
                                            <div className="shrink-0">
                                                <MiniStat icon={Eye} value={fmtStat(tScoreboard?.stats?.watchers)} tooltip="Watchers" />
                                            </div>
                                            <div className="shrink-0">
                                                <MiniStat icon={PlayIcon} value={fmtStat(tScoreboard?.stats?.plays)} tooltip="Plays" />
                                            </div>
                                            <div className="shrink-0">
                                                <MiniStat icon={ListIcon} value={fmtStat(tScoreboard?.stats?.lists)} tooltip="Lists" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ✅ Tabs (DETALLES / SINOPSIS) */}
                        <div>
                            <div className="flex flex-wrap items-center gap-6 mb-4 border-b border-white/10 pb-1">
                                {[
                                    { id: 'details', label: 'Detalles' },
                                    { id: 'synopsis', label: 'Sinopsis' },
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

                            <div className="relative min-h-[100px]">
                                <AnimatePresence mode="wait" initial={false}>
                                    {activeTab === 'synopsis' && (
                                        <motion.div
                                            key="synopsis"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                                                <p className="text-zinc-200 text-base md:text-lg leading-relaxed text-justify whitespace-pre-line">
                                                    {episode?.overview?.trim() || 'No hay descripción disponible.'}
                                                </p>
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === 'details' && (
                                        <motion.div
                                            key="details"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                                                <VisualMetaCard
                                                    icon={MonitorPlay}
                                                    label="Serie"
                                                    value={showName}
                                                    className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                                                />
                                                <VisualMetaCard
                                                    icon={CalendarIcon}
                                                    label="Emisión"
                                                    value={airDate || '—'}
                                                    className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                                                />
                                                <VisualMetaCard
                                                    icon={ClockIcon}
                                                    label="Duración"
                                                    value={runtime ? `${runtime} min` : '—'}
                                                    className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                                                />
                                                <VisualMetaCard
                                                    icon={StarIcon}
                                                    label="Episodio"
                                                    value={`T${seasonNumber} · E${episodeNumber}`}
                                                    className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cast */}
                {cast.length > 0 && (
                    <section className="mb-10">
                        <SectionTitle title="Reparto del episodio" icon={UsersIcon} />

                        <Swiper
                            spaceBetween={12}
                            slidesPerView={3}
                            watchOverflow
                            observer
                            observeParents
                            resizeObserver
                            updateOnWindowResize
                            roundLengths
                            breakpoints={{
                                500: { slidesPerView: 3, spaceBetween: 14 },
                                768: { slidesPerView: 4, spaceBetween: 16 },
                                1024: { slidesPerView: 5, spaceBetween: 18 },
                                1280: { slidesPerView: 6, spaceBetween: 20 },
                            }}
                            className="pb-8 w-full"
                        >
                            {cast.slice(0, 20).map((actor) => (
                                <SwiperSlide key={actor.id}>
                                    <a
                                        href={`/details/person/${actor.id}`}
                                        className="block group relative bg-neutral-800/80 rounded-xl overflow-hidden shadow-lg border border-transparent hover:border-yellow-500/60 hover:shadow-2xl hover:shadow-yellow-500/25 transition-all duration-300 transform-gpu hover:-translate-y-1"
                                        title={actor.name}
                                    >
                                        <div className="aspect-[2/3] overflow-hidden relative">
                                            {actor.profile_path ? (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w342${actor.profile_path}`}
                                                    alt={actor.name}
                                                    className="w-full h-full object-cover transition-transform duration-500 transform-gpu group-hover:scale-[1.10] group-hover:-translate-y-1 group-hover:rotate-[0.4deg] group-hover:grayscale-0 grayscale-[18%]"
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500">
                                                    <UsersIcon className="w-10 h-10 opacity-60" />
                                                </div>
                                            )}

                                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-75 group-hover:opacity-90 transition-opacity duration-300" />

                                            <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3">
                                                <p className="text-white font-extrabold text-[11px] sm:text-sm leading-tight line-clamp-1">
                                                    {actor.name}
                                                </p>
                                                <p className="text-gray-300 text-[10px] sm:text-xs leading-tight line-clamp-1">
                                                    {stripHtml(actor?.character || '')}
                                                </p>
                                            </div>
                                        </div>
                                    </a>
                                </SwiperSlide>
                            ))}
                        </Swiper>
                    </section>
                )}

                {/* Guest Stars */}
                {guestStars?.length > 0 && (
                    <section className="mb-10">
                        <SectionTitle title="Invitados" icon={UsersIcon} />

                        <Swiper
                            spaceBetween={12}
                            slidesPerView={3}
                            watchOverflow
                            observer
                            observeParents
                            resizeObserver
                            updateOnWindowResize
                            roundLengths
                            breakpoints={{
                                500: { slidesPerView: 3, spaceBetween: 14 },
                                768: { slidesPerView: 4, spaceBetween: 16 },
                                1024: { slidesPerView: 5, spaceBetween: 18 },
                                1280: { slidesPerView: 6, spaceBetween: 20 },
                            }}
                            className="pb-8 w-full"
                        >
                            {guestStars.slice(0, 20).map((actor) => (
                                <SwiperSlide key={actor.id}>
                                    <a
                                        href={`/details/person/${actor.id}`}
                                        className="block group relative bg-neutral-800/80 rounded-xl overflow-hidden shadow-lg border border-transparent hover:border-yellow-500/60 hover:shadow-2xl hover:shadow-yellow-500/25 transition-all duration-300 transform-gpu hover:-translate-y-1"
                                        title={actor.name}
                                    >
                                        <div className="aspect-[2/3] overflow-hidden relative">
                                            {actor.profile_path ? (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w342${actor.profile_path}`}
                                                    alt={actor.name}
                                                    className="w-full h-full object-cover transition-transform duration-500 transform-gpu group-hover:scale-[1.10] group-hover:-translate-y-1 group-hover:rotate-[0.4deg] group-hover:grayscale-0 grayscale-[18%]"
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500">
                                                    <UsersIcon className="w-10 h-10 opacity-60" />
                                                </div>
                                            )}

                                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-75 group-hover:opacity-90 transition-opacity duration-300" />

                                            <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3">
                                                <p className="text-white font-extrabold text-[11px] sm:text-sm leading-tight line-clamp-1">
                                                    {actor.name}
                                                </p>
                                                <p className="text-gray-300 text-[10px] sm:text-xs leading-tight line-clamp-1">
                                                    {stripHtml(actor?.character || '')}
                                                </p>
                                            </div>
                                        </div>
                                    </a>
                                </SwiperSlide>
                            ))}
                        </Swiper>
                    </section>
                )}
            </div>
        </div>
    )
}
