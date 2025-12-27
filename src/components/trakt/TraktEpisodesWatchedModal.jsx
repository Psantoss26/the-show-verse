'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Check, Eye, EyeOff, Loader2, X, Search } from 'lucide-react'

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

const pad2 = (n) => String(n).padStart(2, '0')

const toLocalDatetimeInput = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
        d.getMinutes()
    )}`
}

const fromLocalDatetimeInput = (value) => {
    if (!value) return null
    const d = new Date(value) // local -> ISO
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString()
}

const formatDate = (iso) => {
    if (!iso) return '—'
    try {
        return new Date(iso).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: '2-digit'
        })
    } catch {
        return iso
    }
}

const seasonLabelText = (sn, name) => {
    if (name) return name
    return sn === 0 ? 'Especiales' : `Temporada ${sn}`
}

const MAX_EPISODES_RENDER = 120
const MOVIE_BUSY_KEY = 'MOVIE'

export default function TraktEpisodesWatchedModal({
    open,
    onClose,

    mediaType = 'tv', // 'tv' | 'movie'

    // tv
    tmdbId,
    title,
    connected,
    seasons = [],
    watchedBySeason = {},
    busyKey = '',
    onToggleEpisodeWatched,

    // movie
    movieWatchedAt = null,
    onToggleMovieWatched
}) {
    const [activeSeason, setActiveSeason] = useState(null)
    const [displaySeason, setDisplaySeason] = useState(null)

    const [onlyUnwatched, setOnlyUnwatched] = useState(false)
    const [viewMode, setViewMode] = useState('list') // 'list' | 'table'
    const [query, setQuery] = useState('')
    const [expandedSeason, setExpandedSeason] = useState({})

    const [seasonCache, setSeasonCache] = useState({})
    const [movieEditValue, setMovieEditValue] = useState('')

    const panelRef = useRef(null)

    const isMovie = mediaType === 'movie'
    const movieWatched = !!movieWatchedAt
    const busyMovie = busyKey === MOVIE_BUSY_KEY

    const usableSeasons = useMemo(() => {
        const list = Array.isArray(seasons) ? seasons : []
        return [...list]
            .filter((s) => s && typeof s.season_number === 'number' && s.season_number >= 1)
            .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0))
    }, [seasons])

    const totals = useMemo(() => {
        const totalEpisodes = usableSeasons.reduce((acc, s) => {
            const c = typeof s?.episode_count === 'number' ? s.episode_count : 0
            return acc + Math.max(0, c)
        }, 0)

        const watchedEpisodes = Object.values(watchedBySeason || {}).reduce((acc, arr) => {
            return acc + (Array.isArray(arr) ? arr.length : 0)
        }, 0)

        return { totalEpisodes, watchedEpisodes }
    }, [usableSeasons, watchedBySeason])

    const progressPct = useMemo(() => {
        const total = Number(totals?.totalEpisodes || 0)
        const watched = Number(totals?.watchedEpisodes || 0)
        if (!total) return 0
        return Math.min(100, Math.max(0, Math.round((watched / total) * 100)))
    }, [totals])

    const tmdbImg = (path, size = 'w300') => {
        if (!path) return null
        return `https://image.tmdb.org/t/p/${size}${path}`
    }

    // Default state al abrir
    useEffect(() => {
        if (!open) return

        if (isMovie) {
            const fallbackIso = movieWatchedAt || new Date().toISOString()
            setMovieEditValue(toLocalDatetimeInput(fallbackIso))
            setQuery('')
            return
        }

        const first = usableSeasons.find((s) => (s?.season_number ?? 0) >= 1) || usableSeasons[0] || null
        const sn = first?.season_number ?? null
        setActiveSeason(sn)
        setDisplaySeason(sn)

        setOnlyUnwatched(false)
        setViewMode('list')
        setQuery('')
    }, [open, usableSeasons, isMovie, movieWatchedAt])

    // Escape to close
    useEffect(() => {
        if (!open) return
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    // Lock body scroll
    useEffect(() => {
        if (!open) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = prev
        }
    }, [open])

    const loadSeason = async (sn) => {
        if (!TMDB_API_KEY || !tmdbId || sn == null) return
        if (Array.isArray(seasonCache?.[sn]?.episodes)) return
        if (seasonCache?.[sn]?.loading) return

        setSeasonCache((p) => ({
            ...p,
            [sn]: { ...(p?.[sn] || {}), loading: true, error: '' }
        }))

        try {
            const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${sn}?api_key=${TMDB_API_KEY}&language=es-ES`
            const res = await fetch(url)
            const json = await res.json()
            if (!res.ok) throw new Error(json?.status_message || 'Error cargando temporada')

            const episodes = Array.isArray(json?.episodes) ? json.episodes : []
            setSeasonCache((p) => ({
                ...p,
                [sn]: { loading: false, error: '', episodes }
            }))
        } catch (e) {
            setSeasonCache((p) => ({
                ...p,
                [sn]: { loading: false, error: e?.message || 'Error cargando temporada', episodes: [] }
            }))
        }
    }

    // Cargar season details SOLO en TV + vista LISTA
    useEffect(() => {
        if (!open) return
        if (isMovie) return
        if (viewMode !== 'list') return
        if (activeSeason == null) return
        loadSeason(activeSeason)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, isMovie, viewMode, activeSeason, tmdbId])

    // Promover a displaySeason cuando haya episodes
    useEffect(() => {
        if (!open) return
        if (isMovie) return
        if (viewMode !== 'list') return
        if (activeSeason == null) return
        const c = seasonCache?.[activeSeason]
        if (Array.isArray(c?.episodes)) setDisplaySeason(activeSeason)
    }, [open, isMovie, viewMode, activeSeason, seasonCache])

    // Derivados LISTA
    const selectedSeasonObj = useMemo(
        () => usableSeasons.find((s) => s?.season_number === activeSeason) || null,
        [usableSeasons, activeSeason]
    )

    const displaySeasonObj = useMemo(() => {
        const sn = displaySeason ?? activeSeason
        return usableSeasons.find((s) => s?.season_number === sn) || null
    }, [usableSeasons, displaySeason, activeSeason])

    const selectedSn = selectedSeasonObj?.season_number ?? null
    const displaySn = displaySeasonObj?.season_number ?? null

    const selectedCache = selectedSn != null ? seasonCache?.[selectedSn] : null
    const displayCache = displaySn != null ? seasonCache?.[displaySn] : null

    const selectedLoading = !!selectedCache?.loading && !Array.isArray(selectedCache?.episodes)
    const isSwitchingSeason =
        selectedSn != null && displaySn != null && selectedSn !== displaySn && selectedLoading

    const loading = !!selectedCache?.loading
    const error = selectedCache?.error || ''
    const episodes = Array.isArray(displayCache?.episodes) ? displayCache.episodes : []

    const watchedSet = useMemo(() => new Set(watchedBySeason?.[displaySn] || []), [watchedBySeason, displaySn])

    const filteredEpisodes = useMemo(() => {
        const q2 = (query || '').trim().toLowerCase()
        const base = onlyUnwatched ? episodes.filter((ep) => !watchedSet.has(ep.episode_number)) : episodes
        if (!q2) return base
        return base.filter((ep) => {
            const n = String(ep?.episode_number || '')
            const name = String(ep?.name || '').toLowerCase()
            const ov = String(ep?.overview || '').toLowerCase()
            return name.includes(q2) || ov.includes(q2) || n === q2
        })
    }, [episodes, onlyUnwatched, watchedSet, query])

    // Derivados TABLA
    const seasonsFilteredForTable = useMemo(() => {
        const q2 = (query || '').trim().toLowerCase()
        if (!q2) return usableSeasons
        return usableSeasons.filter((s) => {
            const sn = s?.season_number
            const name = seasonLabelText(sn, s?.name).toLowerCase()
            return name.includes(q2) || String(sn) === q2
        })
    }, [usableSeasons, query])

    const buildEpisodeNumbers = (sn, count) => {
        const c = Math.max(0, Number(count || 0))
        const expanded = !!expandedSeason?.[sn]
        const limit = expanded ? c : Math.min(c, MAX_EPISODES_RENDER)
        const nums = Array.from({ length: limit }, (_, i) => i + 1)
        const hasMore = c > limit
        return { nums, hasMore, remaining: c - limit }
    }

    if (!open) return null

    // ============================================================
    // Layout base: FULLSCREEN en móvil + overlay más suave y limpio
    // ============================================================
    const Overlay = (
        <div
            className="absolute inset-0 bg-black/35 sm:bg-black/55 sm:backdrop-blur-sm"
            onClick={onClose}
        />
    )

    const PanelShellClass =
        'w-full h-[100dvh] sm:h-auto ' +
        'rounded-none sm:rounded-3xl ' +
        'border-0 sm:border sm:border-white/10 ' +
        'bg-[#0b0b0b] ' +
        'shadow-none sm:shadow-2xl ' +
        'overflow-hidden flex flex-col ' +
        'pb-[env(safe-area-inset-bottom)]'

    const SectionClass = 'bg-white/[0.03] border border-white/10 rounded-3xl'
    const SubtleRowClass = 'bg-white/[0.02] border border-white/10'

    // =========================
    // MOVIE
    // =========================
    if (isMovie) {
        const onSaveMovie = () => {
            if (!connected) return
            if (busyMovie) return
            const iso = fromLocalDatetimeInput(movieEditValue) || new Date().toISOString()
            onToggleMovieWatched?.(iso)
        }

        const onRemoveMovie = () => {
            if (!connected) return
            if (busyMovie) return
            onToggleMovieWatched?.(null)
        }

        return (
            <div className="fixed inset-0 z-[10050]">
                {Overlay}

                <div className="absolute inset-0 flex items-stretch sm:items-center justify-center p-0 sm:p-4">
                    <motion.div
                        ref={panelRef}
                        initial={{ opacity: 0, y: 14, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 14, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                        className={`${PanelShellClass} sm:max-w-xl sm:max-h-[86vh]`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-4 sm:p-6 border-b border-white/10 flex items-start justify-between gap-4 shrink-0">
                            <div className="min-w-0 flex-1">
                                <h3 className="text-2xl font-extrabold text-white truncate">Marcar como visto</h3>
                                <p className="mt-1 text-sm text-zinc-400 truncate">{title || 'Película'}</p>
                            </div>

                            <button
                                type="button"
                                onClick={onClose}
                                className="shrink-0 w-11 h-11 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition flex items-center justify-center"
                                title="Cerrar"
                            >
                                <X className="w-5 h-5 text-zinc-200" />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 overflow-auto sv-scroll p-4 sm:p-6">
                            {!connected ? (
                                <div className={`${SectionClass} p-5`}>
                                    <div className="text-white font-bold">Trakt no está conectado</div>
                                    <div className="text-sm text-zinc-400 mt-1">Conecta Trakt para marcar películas vistas.</div>
                                    <Link
                                        href="/trakt"
                                        className="inline-flex mt-4 items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/16 transition text-sm font-semibold"
                                    >
                                        Ir a Trakt
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className={`${SectionClass} p-4`}>
                                        <div className="text-sm font-bold text-zinc-200">Fecha y hora de visto</div>
                                        <div className="text-xs text-zinc-500 mt-1">
                                            Igual que en Trakt: puedes ajustar el momento exacto.
                                        </div>

                                        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/[0.02] border border-white/10">
                                            <input
                                                type="datetime-local"
                                                value={movieEditValue}
                                                onChange={(e) => setMovieEditValue(e.target.value)}
                                                className="w-full bg-transparent outline-none text-sm text-zinc-200"
                                            />
                                        </div>

                                        {movieWatchedAt && (
                                            <div className="mt-3 text-xs text-zinc-400">
                                                Actualmente marcada como vista:{' '}
                                                <span className="text-zinc-200 font-semibold">
                                                    {new Date(movieWatchedAt).toLocaleString('es-ES')}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            disabled={busyMovie}
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06] transition text-sm font-bold disabled:opacity-70"
                                        >
                                            <X className="w-4 h-4" />
                                            Cancelar
                                        </button>

                                        {movieWatched ? (
                                            <button
                                                type="button"
                                                onClick={onRemoveMovie}
                                                disabled={busyMovie}
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06] transition text-sm font-bold disabled:opacity-70"
                                                title="Quitar de vistos"
                                            >
                                                {busyMovie ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />}
                                                Quitar
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={onSaveMovie}
                                                disabled={busyMovie}
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/16 transition text-sm font-bold disabled:opacity-70"
                                                title="Marcar como visto"
                                            >
                                                {busyMovie ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                                Marcar visto
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>
        )
    }

    // =========================
    // TV
    // =========================
    return (
        <div className="fixed inset-0 z-[10050]">
            {Overlay}

            <div className="absolute inset-0 flex items-stretch sm:items-center justify-center p-0 sm:p-4">
                <motion.div
                    ref={panelRef}
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 14, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className={`${PanelShellClass} sm:max-w-6xl sm:max-h-[86vh]`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-4 sm:p-6 border-b border-white/10 flex items-start justify-between gap-4 shrink-0">
                        <div className="min-w-0 flex-1">
                            <h3 className="text-2xl font-extrabold text-white truncate">Episodios vistos</h3>
                            <p className="mt-1 text-sm text-zinc-400 truncate">{title || 'Serie'}</p>

                            {Number.isFinite(totals.totalEpisodes) && totals.totalEpisodes > 0 && (
                                <div className="mt-3">
                                    <div className="flex items-center justify-between max-w-[260px]">
                                        <span className="text-xs text-zinc-400">Progreso</span>
                                        <span className="text-xs font-bold text-zinc-200">{progressPct}%</span>
                                    </div>
                                    <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden w-full max-w-[260px]">
                                        <div className="h-full bg-emerald-500/80" style={{ width: `${progressPct}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 w-11 h-11 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition flex items-center justify-center"
                            title="Cerrar"
                        >
                            <X className="w-5 h-5 text-zinc-200" />
                        </button>
                    </div>

                    {/* Toolbar */}
                    <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('list')}
                                    className={`px-3 py-1.5 rounded-xl text-sm font-bold transition ${viewMode === 'list' ? 'bg-white/[0.06] text-white' : 'text-zinc-300 hover:bg-white/[0.04]'
                                        }`}
                                >
                                    Lista
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    className={`px-3 py-1.5 rounded-xl text-sm font-bold transition ${viewMode === 'table' ? 'bg-white/[0.06] text-white' : 'text-zinc-300 hover:bg-white/[0.04]'
                                        }`}
                                >
                                    Tabla
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setOnlyUnwatched((v) => !v)}
                                className={`px-3 py-1.5 rounded-2xl border text-sm font-bold transition ${onlyUnwatched
                                        ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/16'
                                        : 'bg-white/[0.03] border-white/10 text-zinc-200 hover:bg-white/[0.06]'
                                    }`}
                                title="Filtrar"
                            >
                                {onlyUnwatched ? 'Solo no vistos' : 'Todos'}
                            </button>

                            {Number.isFinite(totals.totalEpisodes) && totals.totalEpisodes > 0 && (
                                <div
                                    className="ml-0 sm:ml-2 inline-flex items-center h-9 px-3 rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-200"
                                    title="Episodios vistos / episodios totales"
                                >
                                    <span className="text-[11px] font-semibold text-zinc-400 mr-2">Vistos</span>
                                    <span className="text-sm font-extrabold tabular-nums">
                                        {totals.watchedEpisodes}/{totals.totalEpisodes}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="relative w-full md:w-[340px]">
                            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={viewMode === 'list' ? 'Buscar episodio…' : 'Buscar temporada…'}
                                className="w-full rounded-2xl bg-white/[0.03] border border-white/10 pl-9 pr-3 py-2 text-sm text-zinc-200 outline-none
                  focus:ring-2 focus:ring-emerald-500/25"
                            />
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        {!connected ? (
                            <div className="h-full overflow-auto sv-scroll p-4 sm:p-6">
                                <div className={`${SectionClass} p-5`}>
                                    <div className="text-white font-bold">Trakt no está conectado</div>
                                    <div className="text-sm text-zinc-400 mt-1">Conecta Trakt para marcar episodios vistos.</div>
                                    <Link
                                        href="/trakt"
                                        className="inline-flex mt-4 items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/16 transition text-sm font-semibold"
                                    >
                                        Ir a Trakt
                                    </Link>
                                </div>
                            </div>
                        ) : viewMode === 'list' ? (
                            <div className="h-full min-h-0 p-4 sm:p-5 flex flex-col gap-4">
                                {/* Temporadas (móvil): chips horizontales */}
                                <div className="md:hidden">
                                    <div className={`${SectionClass} overflow-hidden`}>
                                        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                                            <div className="text-xs font-bold tracking-wider uppercase text-zinc-400">Temporadas</div>
                                            <div className="text-xs font-bold px-2 py-1 rounded-full bg-white/[0.03] border border-white/10 text-zinc-200">
                                                {usableSeasons.length}
                                            </div>
                                        </div>

                                        <div
                                            className="px-3 py-3 flex gap-2 overflow-x-auto whitespace-nowrap
                        [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                                        >
                                            {usableSeasons.map((s) => {
                                                const sn = s?.season_number
                                                const watchedCount = (watchedBySeason?.[sn] || []).length
                                                const epCount = typeof s?.episode_count === 'number' ? s.episode_count : 0
                                                const isActive = sn === activeSeason

                                                return (
                                                    <button
                                                        key={sn}
                                                        type="button"
                                                        onClick={() => {
                                                            setActiveSeason(sn)
                                                            if (Array.isArray(seasonCache?.[sn]?.episodes)) setDisplaySeason(sn)
                                                        }}
                                                        className={`shrink-0 px-3 py-2 rounded-2xl border text-left transition ${isActive
                                                                ? 'bg-white/[0.06] border-white/15 text-white'
                                                                : 'bg-white/[0.03] border-white/10 text-zinc-200 hover:bg-white/[0.05]'
                                                            }`}
                                                        title={seasonLabelText(sn, s?.name)}
                                                    >
                                                        <div className="text-sm font-extrabold truncate max-w-[160px]">{`T${sn}`}</div>
                                                        <div className="text-[11px] text-zinc-400 mt-0.5">
                                                            {watchedCount}/{epCount || '—'} vistos
                                                        </div>
                                                    </button>
                                                )
                                            })}

                                            {usableSeasons.length === 0 && (
                                                <div className="text-sm text-zinc-400 px-1">No hay temporadas disponibles.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Contenedor principal */}
                                <div className="flex-1 min-h-0 md:grid md:grid-cols-[280px_1fr] gap-4 flex flex-col">
                                    {/* Left seasons SOLO desktop */}
                                    <div className={`hidden md:flex ${SectionClass} overflow-hidden flex-col min-h-0`}>
                                        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                                            <div className="text-xs font-bold tracking-wider uppercase text-zinc-400">Temporadas</div>
                                            <div className="text-xs font-bold px-2 py-1 rounded-full bg-white/[0.03] border border-white/10 text-zinc-200">
                                                {usableSeasons.length}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-h-0 overflow-auto sv-scroll">
                                            {usableSeasons.map((s) => {
                                                const sn = s?.season_number
                                                const name = seasonLabelText(sn, s?.name)
                                                const epCount = typeof s?.episode_count === 'number' ? s.episode_count : null
                                                const watchedCount = (watchedBySeason?.[sn] || []).length
                                                const isActive = sn === activeSeason

                                                return (
                                                    <button
                                                        key={sn}
                                                        type="button"
                                                        onClick={() => {
                                                            setActiveSeason(sn)
                                                            if (Array.isArray(seasonCache?.[sn]?.episodes)) setDisplaySeason(sn)
                                                        }}
                                                        className={`w-full text-left px-4 py-3 border-b border-white/5 transition flex items-center justify-between gap-3 ${isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                                                            }`}
                                                    >
                                                        <div className="min-w-0">
                                                            <div className={`font-extrabold truncate ${isActive ? 'text-white' : 'text-zinc-200'}`}>
                                                                {name}
                                                            </div>
                                                            <div className="text-[11px] text-zinc-500 mt-1">
                                                                {epCount != null ? `${epCount} eps` : '—'} · {watchedCount} vistos
                                                            </div>
                                                        </div>

                                                        {watchedCount > 0 && (
                                                            <div className="shrink-0 w-8 h-8 rounded-full border border-emerald-500/25 bg-emerald-500/10 flex items-center justify-center">
                                                                <Check className="w-4 h-4 text-emerald-200" />
                                                            </div>
                                                        )}
                                                    </button>
                                                )
                                            })}

                                            {usableSeasons.length === 0 && (
                                                <div className="p-4 text-sm text-zinc-400">No hay temporadas disponibles.</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: episodes */}
                                    <div className={`${SectionClass} overflow-hidden flex flex-col min-h-0`}>
                                        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
                                            <div className="min-w-0">
                                                <div className="text-white font-extrabold truncate">
                                                    {selectedSeasonObj?.name || (selectedSn != null ? seasonLabelText(selectedSn) : '—')}
                                                </div>
                                                <div className="text-xs text-zinc-400 mt-0.5">Pulsa el ojo para marcar visto/no visto</div>
                                            </div>

                                            {loading && (
                                                <div className="inline-flex items-center gap-2 text-sm text-zinc-300 shrink-0">
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Cargando…
                                                </div>
                                            )}
                                        </div>

                                        {error && !selectedLoading && selectedSn === displaySn ? (
                                            <div className="p-4 text-sm text-red-400">{error}</div>
                                        ) : (
                                            <div className="relative flex-1 min-h-0 overflow-hidden">
                                                <div
                                                    className={`h-full overflow-auto sv-scroll p-3 space-y-2 ${isSwitchingSeason ? 'pointer-events-none opacity-60' : ''
                                                        }`}
                                                >
                                                    {filteredEpisodes.map((ep) => {
                                                        const en = ep?.episode_number
                                                        const epTitle = ep?.name || `Episodio ${en}`
                                                        const watched = watchedSet.has(en)

                                                        const key = `S${displaySn}E${en}`
                                                        const busy = busyKey === key

                                                        const stillUrl = tmdbImg(ep?.still_path, 'w300')

                                                        return (
                                                            <div
                                                                key={en}
                                                                className={`rounded-2xl p-3 flex items-start gap-3 transition ${SubtleRowClass} hover:bg-white/[0.03]`}
                                                            >
                                                                <div className="shrink-0 w-[88px] h-[50px] sm:w-[96px] sm:h-[54px] rounded-xl overflow-hidden border border-white/10 bg-white/[0.02]">
                                                                    {stillUrl ? (
                                                                        <img src={stillUrl} alt={epTitle} className="w-full h-full object-cover" loading="lazy" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-[11px] text-zinc-500">
                                                                            Sin imagen
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center font-extrabold text-zinc-200">
                                                                    {en}
                                                                </div>

                                                                <div className="min-w-0 flex-1">
                                                                    <div className="text-white font-bold truncate">{epTitle}</div>
                                                                    {ep?.overview ? (
                                                                        <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{ep.overview}</div>
                                                                    ) : null}
                                                                    <div className="text-xs text-zinc-500 mt-2">{formatDate(ep?.air_date)}</div>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    disabled={busy || displaySn == null || en == null || isSwitchingSeason}
                                                                    onClick={() => onToggleEpisodeWatched?.(displaySn, en)}
                                                                    className={`shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-2xl border transition
                                    ${watched
                                                                            ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/16'
                                                                            : 'bg-white/[0.03] border-white/10 text-zinc-200 hover:bg-white/[0.06]'
                                                                        }
                                    ${busy ? 'opacity-70 cursor-not-allowed' : ''}`}
                                                                    title={watched ? 'Marcar como no visto' : 'Marcar como visto'}
                                                                >
                                                                    {busy ? (
                                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                                    ) : watched ? (
                                                                        <Eye className="w-4 h-4" />
                                                                    ) : (
                                                                        <EyeOff className="w-4 h-4" />
                                                                    )}
                                                                </button>
                                                            </div>
                                                        )
                                                    })}

                                                    {!selectedLoading && !isSwitchingSeason && filteredEpisodes.length === 0 && (
                                                        <div className="px-2 py-6 text-sm text-zinc-400">
                                                            No hay episodios para mostrar con este filtro.
                                                        </div>
                                                    )}
                                                </div>

                                                {isSwitchingSeason && (
                                                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
                                                        <div className="inline-flex items-center gap-2 text-sm text-zinc-200">
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                            Cargando temporada…
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // TABLA
                            <div className="h-full min-h-0 p-4 sm:p-5 flex flex-col gap-3">
                                <div className={`${SectionClass} overflow-hidden flex flex-col min-h-0`}>
                                    <div className="px-4 sm:px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
                                        <div className="min-w-0">
                                            <div className="text-white font-extrabold">Tabla por temporadas</div>
                                            <div className="text-xs text-zinc-400 mt-0.5">
                                                Cada fila es una temporada. Pulsa un episodio para marcarlo.
                                            </div>
                                        </div>

                                        <div className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/10 text-zinc-200 shrink-0">
                                            {totals.watchedEpisodes} / {totals.totalEpisodes}
                                        </div>
                                    </div>

                                    <div className="flex-1 min-h-0 overflow-auto sv-scroll">
                                        <div className="grid grid-cols-[180px_1fr] sm:grid-cols-[220px_1fr] gap-3 px-4 sm:px-5 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500 border-b border-white/5">
                                            <div>Temporada</div>
                                            <div>Episodios</div>
                                        </div>

                                        <div className="divide-y divide-white/5">
                                            {seasonsFilteredForTable.map((s) => {
                                                const sn = s?.season_number
                                                const name = seasonLabelText(sn, s?.name)
                                                const epCount = typeof s?.episode_count === 'number' ? s.episode_count : 0

                                                const watchedArr = watchedBySeason?.[sn] || []
                                                const watchedLocal = new Set(watchedArr)
                                                const watchedCount = watchedArr.length

                                                if (onlyUnwatched && epCount > 0 && watchedCount >= epCount) return null

                                                const { nums, hasMore, remaining } = buildEpisodeNumbers(sn, epCount)
                                                const expanded = !!expandedSeason?.[sn]

                                                return (
                                                    <div key={sn} className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 px-4 sm:px-5 py-4">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <div className="font-extrabold text-white truncate">{name}</div>
                                                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/10 text-zinc-200">
                                                                    {watchedCount}/{epCount}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-zinc-500 mt-1">
                                                                {sn === 0 ? 'Especiales' : `S${sn}`} · {epCount} episodios
                                                            </div>
                                                        </div>

                                                        <div className="min-w-0">
                                                            <div className="overflow-x-auto overflow-y-visible sv-scroll pt-2">
                                                                <div className="flex items-center gap-2 min-w-max pr-3 pb-2">
                                                                    {nums.map((en) => {
                                                                        const watched = watchedLocal.has(en)
                                                                        const key = `S${sn}E${en}`
                                                                        const busy = busyKey === key

                                                                        return (
                                                                            <button
                                                                                key={en}
                                                                                type="button"
                                                                                disabled={busy}
                                                                                onClick={() => onToggleEpisodeWatched?.(sn, en)}
                                                                                className={`relative overflow-visible inline-flex items-center justify-center w-10 h-10 rounded-xl border font-extrabold text-sm transition
                                          ${watched
                                                                                        ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/16'
                                                                                        : 'bg-white/[0.03] border-white/10 text-zinc-200 hover:bg-white/[0.06]'
                                                                                    }
                                          ${busy ? 'opacity-70 cursor-not-allowed' : ''}`}
                                                                                title={watched ? `S${sn}E${en} · visto` : `S${sn}E${en} · no visto`}
                                                                            >
                                                                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : en}
                                                                                {watched && !busy && (
                                                                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow ring-2 ring-black/60" />
                                                                                )}
                                                                            </button>
                                                                        )
                                                                    })}

                                                                    {hasMore && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setExpandedSeason((p) => ({ ...p, [sn]: true }))}
                                                                            className="inline-flex items-center justify-center h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06] transition font-bold"
                                                                            title="Mostrar todos los episodios"
                                                                        >
                                                                            +{remaining} más
                                                                        </button>
                                                                    )}

                                                                    {expanded && epCount > MAX_EPISODES_RENDER && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setExpandedSeason((p) => ({ ...p, [sn]: false }))}
                                                                            className="inline-flex items-center justify-center h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06] transition font-bold"
                                                                            title="Contraer"
                                                                        >
                                                                            Contraer
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}

                                            {seasonsFilteredForTable.length === 0 && (
                                                <div className="px-5 py-10 text-sm text-zinc-400">No hay temporadas que coincidan con la búsqueda.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-xs text-zinc-500 px-1">
                                    Tip: si una temporada tiene muchos episodios, usa “+X más” para renderizar todos.
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    )
}
