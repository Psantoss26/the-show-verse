'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'

import {
    ArrowLeft,
    Layers,
    Calendar as CalendarIcon,
    Film as FilmIcon,
    MonitorPlay,
    ImageOff,
    Eye,
    Play as PlayIcon,
    List as ListIcon,
    Heart as HeartIcon,
    Clock as ClockIcon,
    LayoutGrid,
    AlignJustify
} from 'lucide-react'

import { SectionTitle, VisualMetaCard } from '@/components/details/DetailAtoms'
import { CompactBadge, MiniStat, UnifiedRateButton } from '@/components/details/DetailHeaderBits'
import { formatDateEs, formatVoteCount } from '@/lib/details/formatters'
import StarRating from '@/components/StarRating'

export default function SeasonDetailsClient({ showId, seasonNumber, show, season, imdb, imdbUrl }) {
    const router = useRouter()

    const [episodesView, setEpisodesView] = useState('list') // 'list' | 'grid'

    const showName = show?.name || show?.title || 'Serie'
    const seasonName =
        season?.name?.trim() || (Number(seasonNumber) === 0 ? 'Especiales' : `Temporada ${seasonNumber}`)

    const posterPath = season?.poster_path || show?.poster_path || null
    const heroBgPath = show?.backdrop_path || season?.poster_path || show?.poster_path || null

    const episodes = Array.isArray(season?.episodes) ? season.episodes : []
    const totalEp = episodes.length

    const airDate = season?.air_date ? formatDateEs(season.air_date) : null
    const seasonVote = typeof season?.vote_average === 'number' && season.vote_average > 0 ? season.vote_average : null

    const tmdbSeasonUrl = `https://www.themoviedb.org/tv/${showId}/season/${seasonNumber}`

    const heroBackgroundStyle = useMemo(() => {
        if (!heroBgPath) return null
        const url = `https://image.tmdb.org/t/p/original${heroBgPath}`
        return { backgroundImage: `url(${url})` }
    }, [heroBgPath])

    // ✅ evita "null votes" + si TMDb no trae vote_count para temporada, lo estimamos sumando votos de episodios
    const tmdbVotesSeason = useMemo(() => {
        const direct = typeof season?.vote_count === 'number' ? season.vote_count : null
        if (direct && direct > 0) return direct

        const sum = episodes.reduce((acc, ep) => {
            const v = typeof ep?.vote_count === 'number' ? ep.vote_count : 0
            return acc + v
        }, 0)

        return sum > 0 ? sum : null
    }, [season?.vote_count, episodes])

    // ✅ helper: tu formatVoteCount(0) probablemente devuelve null => mostramos "0"
    const fmtStat = useCallback((n) => {
        const v = typeof n === 'number' ? n : 0
        return formatVoteCount(v) ?? '0'
    }, [])

    // ✅ Tabs como DetailsClient
    const [activeTab, setActiveTab] = useState('details')

    // ✅ Trakt scoreboard
    const [tScoreboard, setTScoreboard] = useState({
        loading: true,
        rating: null,
        votes: null,
        stats: null,
        traktUrl: null,
    })

    useEffect(() => {
        let alive = true
            ; (async () => {
                try {
                    setTScoreboard((s) => ({ ...s, loading: true }))
                    const res = await fetch(
                        `/api/trakt/scoreboard?type=season&tmdbId=${showId}&season=${seasonNumber}`,
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
    }, [showId, seasonNumber])

    // ✅ Rate (Trakt)
    const [userRating, setUserRating] = useState(null)
    const [ratingLoading, setRatingLoading] = useState(false)
    const [traktConnected, setTraktConnected] = useState(true)

    // ✅ cargar rating actual del usuario al entrar
    useEffect(() => {
        let alive = true
            ; (async () => {
                try {
                    setRatingLoading(true)
                    const res = await fetch(
                        `/api/trakt/ratings?type=season&tmdbId=${Number(showId)}&season=${Number(seasonNumber)}`,
                        { cache: 'no-store' }
                    )

                    if (!alive) return

                    if (res.status === 401) {
                        setTraktConnected(false)
                        setUserRating(null)
                        return
                    }

                    setTraktConnected(true)
                    const json = await res.json().catch(() => ({}))
                    setUserRating(typeof json?.rating === 'number' ? json.rating : null)
                } catch (e) {
                    console.error(e)
                    if (alive) {
                        // si falla la carga, no rompemos UI
                        setUserRating(null)
                    }
                } finally {
                    if (alive) setRatingLoading(false)
                }
            })()

        return () => {
            alive = false
        }
    }, [showId, seasonNumber])

    const handleRate = useCallback(
        async (val) => {
            try {
                setRatingLoading(true)

                const res = await fetch('/api/trakt/ratings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'season',
                        tmdbId: Number(showId),
                        season: Number(seasonNumber),
                        rating: val ?? null,
                    }),
                })

                if (res.status === 401) {
                    window.location.href = '/api/trakt/auth/start'
                    return false
                }

                const json = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(json?.error || 'Trakt rating failed')

                setUserRating(val ?? null)
                setTraktConnected(true)
                return true
            } catch (e) {
                console.error(e)
                return false
            } finally {
                setRatingLoading(false)
            }
        },
        [showId, seasonNumber]
    )

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
                <div className="flex items-center gap-2 mb-6">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/10 transition"
                    >
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>

                    <a
                        href={`/details/tv/${showId}`}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/10 transition"
                    >
                        <MonitorPlay className="w-4 h-4" /> {showName}
                    </a>
                </div>

                {/* Hero */}
                <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-10 animate-in fade-in duration-700 slide-in-from-bottom-4 items-start">
                    {/* Left poster */}
                    <div className="w-full max-w-[280px] lg:max-w-[320px] mx-auto lg:mx-0 flex-shrink-0 flex flex-col gap-5 relative z-10">
                        <div className="relative rounded-xl overflow-hidden shadow-2xl shadow-black/80 border border-white/10 bg-black/40">
                            <div className="relative aspect-[2/3] bg-neutral-900">
                                {posterPath ? (
                                    <img
                                        src={`https://image.tmdb.org/t/p/w780${posterPath}`}
                                        alt={seasonName}
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
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
                                <Layers className="w-4 h-4" />
                                <span>Serie</span>
                            </div>

                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1] tracking-tight text-balance drop-shadow-xl mb-3">
                                {seasonName}
                            </h1>

                            {/* ✅ sin nota TMDb aquí (solo en scoreboard) */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base md:text-lg font-medium text-zinc-300">
                                <span className="text-white font-bold tracking-wide">{showName}</span>

                                {totalEp ? (
                                    <>
                                        <span className="text-zinc-600 text-[10px]">●</span>
                                        <span>{totalEp} episodios</span>
                                    </>
                                ) : null}

                                {airDate ? (
                                    <>
                                        <span className="text-zinc-600 text-[10px]">●</span>
                                        <span>{airDate}</span>
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
                                {/* A. Ratings */}
                                <div className="flex items-center gap-4 sm:gap-5 shrink-0">
                                    {tScoreboard.loading && (
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    )}

                                    <CompactBadge
                                        logo="/logo-TMDb.png"
                                        logoClassName="h-2 sm:h-4"
                                        value={seasonVote?.toFixed(1)}
                                        sub={tmdbVotesSeason ? `${formatVoteCount(tmdbVotesSeason)} votes` : undefined}
                                        href={tmdbSeasonUrl}
                                    />

                                    {tScoreboard.rating != null && (
                                        <>
                                            <div className="sm:hidden">
                                                <CompactBadge
                                                    logo="/logo-Trakt.png"
                                                    value={Math.round(tScoreboard.rating * 10)}
                                                    sub={tScoreboard.votes ? `${formatVoteCount(tScoreboard.votes)} votes` : undefined}
                                                    href={tScoreboard.traktUrl}
                                                />
                                            </div>
                                            <div className="hidden sm:block">
                                                <CompactBadge
                                                    logo="/logo-Trakt.png"
                                                    value={Math.round(tScoreboard.rating * 10)}
                                                    suffix="%"
                                                    sub={tScoreboard.votes ? `${formatVoteCount(tScoreboard.votes)} votes` : undefined}
                                                    href={tScoreboard.traktUrl}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {imdb?.rating != null && (
                                        <CompactBadge
                                            logo="/logo-IMDb.png"
                                            logoClassName="h-5 sm:h-5"
                                            value={Number(imdb.rating).toFixed(1)}
                                            sub={imdb?.votes ? `${formatVoteCount(imdb.votes)} votes` : undefined}
                                            href={imdbUrl || undefined}
                                        />
                                    )}
                                </div>

                                {/* separador */}
                                <div className="w-px h-6 bg-white/10 shrink-0" />

                                {/* spacer como DetailsClient */}
                                <div className="flex-1 min-w-0" />

                                {/* separador */}
                                <div className="w-px h-6 bg-white/10 shrink-0" />

                                {/* C. Puntuación usuario */}
                                <div className="flex items-center gap-3 shrink-0">
                                    <StarRating
                                        rating={userRating}
                                        loading={ratingLoading}
                                        connected={traktConnected}
                                        onConnect={() => (window.location.href = '/api/trakt/auth/start')}
                                        onRating={handleRate}
                                        onClearRating={() => handleRate(null)}
                                        min={1}
                                        step={1}
                                        max={10}
                                    />
                                </div>
                            </div>

                            {/* Footer stats */}
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
                                            {/* ✅ FAVORITOS visible aunque sea 0 */}
                                            <div className="shrink-0">
                                                <MiniStat icon={HeartIcon} value={fmtStat(tScoreboard?.stats?.favorited)} tooltip="Favorited" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Tabs */}
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
                                                    {season?.overview?.trim() || 'No hay descripción disponible.'}
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
                                                    label="Estreno"
                                                    value={airDate || '—'}
                                                    className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                                                />
                                                <VisualMetaCard
                                                    icon={Layers}
                                                    label="Temporada"
                                                    value={Number(seasonNumber) === 0 ? 'Especiales' : String(seasonNumber)}
                                                    className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                                                />
                                                <VisualMetaCard
                                                    icon={FilmIcon}
                                                    label="Episodios"
                                                    value={totalEp ? String(totalEp) : '—'}
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

                {/* Episodes */}
                <section className="mb-12">
                    {/* Header con toggle (mismo estilo SectionTitle) */}
                    <div className="flex items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-3 border-l-4 border-yellow-500 pl-4 py-1">
                            <Layers className="text-yellow-500 w-6 h-6" />
                            <h2 className="text-2xl md:text-3xl font-bold text-white tracking-wide">Episodios</h2>
                        </div>

                        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                            <button
                                type="button"
                                onClick={() => setEpisodesView('list')}
                                className={[
                                    "h-9 w-9 rounded-full grid place-items-center transition",
                                    episodesView === 'list'
                                        ? "bg-white/10 text-white"
                                        : "text-zinc-400 hover:text-white hover:bg-white/10",
                                ].join(" ")}
                                title="Vista lista"
                                aria-pressed={episodesView === 'list'}
                            >
                                <AlignJustify className="w-4 h-4" />
                            </button>

                            <button
                                type="button"
                                onClick={() => setEpisodesView('grid')}
                                className={[
                                    "h-9 w-9 rounded-full grid place-items-center transition",
                                    episodesView === 'grid'
                                        ? "bg-white/10 text-white"
                                        : "text-zinc-400 hover:text-white hover:bg-white/10",
                                ].join(" ")}
                                title="Vista grid"
                                aria-pressed={episodesView === 'grid'}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {episodes.length === 0 ? (
                        <div className="mt-2 text-sm text-zinc-400">No hay episodios disponibles para esta temporada.</div>
                    ) : (
                        <>
                            {/* ======================= */}
                            {/* ✅ VISTA LISTA (sin TMDb badge) */}
                            {/* ======================= */}
                            {episodesView === 'list' && (
                                <div className="mt-2 space-y-4">
                                    {episodes.map((ep) => {
                                        const epNum = Number(ep?.episode_number)
                                        const epTitle = ep?.name || `Episodio ${epNum}`
                                        const epAir = ep?.air_date ? formatDateEs(ep.air_date) : null
                                        const epRuntime = Number(ep?.runtime || 0) || null
                                        const still = ep?.still_path || null
                                        const href = `/details/tv/${showId}/season/${seasonNumber}/episode/${epNum}`

                                        return (
                                            <a
                                                key={`${seasonNumber}-${epNum}`}
                                                href={href}
                                                className="group block rounded-2xl border border-white/10 bg-black/25 hover:bg-black/35 hover:border-yellow-500/30 transition overflow-hidden"
                                            >
                                                <div className="flex flex-col sm:flex-row gap-4 p-4">
                                                    {/* Still */}
                                                    <div className="relative w-full sm:w-[280px] aspect-video sm:aspect-[16/9] rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                                        {still ? (
                                                            <img
                                                                src={`https://image.tmdb.org/t/p/w780${still}`}
                                                                alt={epTitle}
                                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                                                loading="lazy"
                                                                decoding="async"
                                                            />
                                                        ) : (
                                                            <div className="absolute inset-0 flex items-center justify-center opacity-60">
                                                                <ImageOff className="w-7 h-7 text-zinc-500" />
                                                            </div>
                                                        )}

                                                        {/* ❌ eliminado: badge "TMDb X.X" */}
                                                    </div>

                                                    {/* Info */}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                                                            Episodio {epNum}
                                                        </div>

                                                        <div className="mt-1 flex items-start justify-between gap-3">
                                                            <h3 className="text-lg font-extrabold text-white leading-tight line-clamp-1">
                                                                {epTitle}
                                                            </h3>
                                                        </div>

                                                        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                                                            {epAir ? (
                                                                <span className="inline-flex items-center gap-2">
                                                                    <CalendarIcon className="w-4 h-4" /> {epAir}
                                                                </span>
                                                            ) : null}

                                                            {epRuntime ? (
                                                                <span className="inline-flex items-center gap-2">
                                                                    <ClockIcon className="w-4 h-4" /> {epRuntime} min
                                                                </span>
                                                            ) : null}
                                                        </div>

                                                        <p className="mt-3 text-sm leading-relaxed text-zinc-300 line-clamp-2">
                                                            {ep?.overview?.trim() || 'Sin descripción.'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </a>
                                        )
                                    })}
                                </div>
                            )}

                            {/* ======================= */}
                            {/* ✅ VISTA GRID (hover overlay) */}
                            {/* ======================= */}
                            {episodesView === 'grid' && (
                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {episodes.map((ep) => {
                                        const epNum = Number(ep?.episode_number)
                                        const epTitle = ep?.name || `Episodio ${epNum}`
                                        const epAir = ep?.air_date ? formatDateEs(ep.air_date) : null
                                        const epRuntime = Number(ep?.runtime || 0) || null
                                        const still = ep?.still_path || null
                                        const href = `/details/tv/${showId}/season/${seasonNumber}/episode/${epNum}`

                                        return (
                                            <a
                                                key={`grid-${seasonNumber}-${epNum}`}
                                                href={href}
                                                className="
                  group block rounded-2xl overflow-hidden
                  border border-white/10 bg-black/25
                  hover:bg-black/35 hover:border-yellow-500/30
                  transition
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/40
                "
                                                title={epTitle}
                                            >
                                                <div className="relative aspect-video bg-white/5">
                                                    {still ? (
                                                        <img
                                                            src={`https://image.tmdb.org/t/p/w780${still}`}
                                                            alt={epTitle}
                                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                                            loading="lazy"
                                                            decoding="async"
                                                        />
                                                    ) : (
                                                        <div className="absolute inset-0 grid place-items-center opacity-70">
                                                            <ImageOff className="w-7 h-7 text-zinc-500" />
                                                        </div>
                                                    )}

                                                    {/* Overlay: visible en móvil, hover/focus en desktop */}
                                                    <div
                                                        className="
                      absolute inset-0
                      bg-gradient-to-t from-black/90 via-black/35 to-transparent
                      opacity-100
                      sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100
                      transition-opacity
                    "
                                                    />

                                                    <div
                                                        className="
                      absolute inset-0 p-3 flex flex-col justify-end
                      opacity-100
                      sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100
                      transition-opacity
                    "
                                                    >
                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                                                            Episodio {epNum}
                                                        </div>

                                                        <div className="mt-0.5 text-sm font-extrabold text-white leading-snug line-clamp-2">
                                                            {epTitle}
                                                        </div>

                                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-200/90">
                                                            {epAir ? (
                                                                <span className="inline-flex items-center gap-1">
                                                                    <CalendarIcon className="w-3.5 h-3.5" /> {epAir}
                                                                </span>
                                                            ) : null}

                                                            {epRuntime ? (
                                                                <span className="inline-flex items-center gap-1">
                                                                    <ClockIcon className="w-3.5 h-3.5" /> {epRuntime} min
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            </a>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </section>
            </div>
        </div>
    )
}
