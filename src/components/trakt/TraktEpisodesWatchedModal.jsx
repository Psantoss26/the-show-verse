'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Check,
    Eye,
    EyeOff,
    Loader2,
    X,
    Search,
    List,
    Table2,
    Filter,
    ChevronRight,
    Tv,
    Plus,
    History,
    RotateCcw,
} from 'lucide-react'

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
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString()
}

const formatDate = (iso) => {
    if (!iso) return '—'
    try {
        return new Date(iso).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
        return iso
    }
}

const formatDateTime = (iso) => {
    if (!iso) return '—'
    try {
        return new Date(iso).toLocaleString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
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
const SHOW_BUSY_KEY = 'SHOW'

export default function TraktEpisodesWatchedModal({
    open,
    onClose,
    mediaType = 'tv',
    tmdbId,
    title,
    connected,

    seasons = [],
    watchedBySeason = {},
    busyKey = '',

    onToggleEpisodeWatched,
    movieWatchedAt = null,
    onToggleMovieWatched,

    onToggleShowWatched, // (legacy) marcar/quitar serie completa
    // ===== NUEVO =====
    showPlays = [], // array de ISO (visionados completos)
    showReleaseDate = null, // ISO o YYYY-MM-DD
    onAddShowPlay, // (watchedAtIsoOrNull, meta) => Promise|void
    onStartShowRewatch, // (startedAtIsoOrNull) => Promise|void
    rewatchStartAt = null, // ISO
    rewatchWatchedBySeason = null, // { [season]: number[] } (solo progreso del rewatch)
    onAddEpisodePlay, // (season, episode, watchedAtIso, meta) => Promise|void
}) {
    const [activeSeason, setActiveSeason] = useState(null)
    const [displaySeason, setDisplaySeason] = useState(null)
    const [onlyUnwatched, setOnlyUnwatched] = useState(false)
    const [viewMode, setViewMode] = useState('list')
    const [query, setQuery] = useState('')
    const [expandedSeason, setExpandedSeason] = useState({})
    const [seasonCache, setSeasonCache] = useState({})
    const [movieEditValue, setMovieEditValue] = useState('')
    const [showError, setShowError] = useState('')

    // ===== NUEVO: modal "Añadir visionado" =====
    const [playsOpen, setPlaysOpen] = useState(false)
    const [playsPreset, setPlaysPreset] = useState('just_finished') // just_finished | release_date | unknown | other_date
    const [playsOtherValue, setPlaysOtherValue] = useState(toLocalDatetimeInput(new Date().toISOString()))
    const [playsBusy, setPlaysBusy] = useState(false)
    const [playsError, setPlaysError] = useState('')

    // ===== NUEVO: rewatch en UI =====
    const [localRewatchStartAt, setLocalRewatchStartAt] = useState(null)
    const rewatchActive = !!(rewatchStartAt || localRewatchStartAt)
    const effectiveRewatchStartAt = rewatchStartAt || localRewatchStartAt

    const panelRef = useRef(null)

    const isMovie = mediaType === 'movie'
    const movieWatched = !!movieWatchedAt
    const busyMovie = busyKey === MOVIE_BUSY_KEY
    const busyShow = busyKey === SHOW_BUSY_KEY

    const hasShowHandler = typeof onToggleShowWatched === 'function'
    const hasAddShowPlayHandler = typeof onAddShowPlay === 'function'
    const hasStartRewatchHandler = typeof onStartShowRewatch === 'function'
    const hasAddEpisodePlayHandler = typeof onAddEpisodePlay === 'function'

    // Filtramos para que season_number sea > 0 (excluye especiales = 0)
    const usableSeasons = useMemo(() => {
        const list = Array.isArray(seasons) ? seasons : []
        return [...list]
            .filter((s) => s && typeof s.season_number === 'number' && s.season_number > 0)
            .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0))
    }, [seasons])

    // ===== NUEVO: watchedBySeason efectivo (modo rewatch) =====
    const effectiveWatchedBySeason = useMemo(() => {
        if (!rewatchActive) return watchedBySeason || {}
        if (rewatchWatchedBySeason && typeof rewatchWatchedBySeason === 'object') return rewatchWatchedBySeason
        return {} // si estás en rewatch pero no pasas progreso del rewatch, partimos de 0
    }, [rewatchActive, watchedBySeason, rewatchWatchedBySeason])

    const totals = useMemo(() => {
        const totalEpisodes = usableSeasons.reduce((acc, s) => acc + Math.max(0, s.episode_count || 0), 0)
        const watchedEpisodes = usableSeasons.reduce((acc, s) => {
            const sn = s.season_number
            const arr = effectiveWatchedBySeason[sn]
            return acc + (Array.isArray(arr) ? arr.length : 0)
        }, 0)
        return { totalEpisodes, watchedEpisodes }
    }, [usableSeasons, effectiveWatchedBySeason])

    const progressPct = useMemo(() => {
        if (!totals.totalEpisodes) return 0
        return Math.min(100, Math.max(0, Math.round((totals.watchedEpisodes / totals.totalEpisodes) * 100)))
    }, [totals])

    const showCompleted = useMemo(() => {
        return totals.totalEpisodes > 0 && totals.watchedEpisodes >= totals.totalEpisodes
    }, [totals])

    // Botón marcar/quitar serie (legacy)
    const canToggleShow = connected && usableSeasons.length > 0 && !busyShow

    const tmdbImg = (path, size = 'w300') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null)

    // ===== NUEVO: normalizar plays =====
    const normalizedPlays = useMemo(() => {
        const arr = Array.isArray(showPlays) ? showPlays : []
        const out = arr
            .map((p) => {
                if (!p) return null
                if (typeof p === 'string') return { watched_at: p }
                if (typeof p === 'object') return { watched_at: p.watched_at || p.watchedAt || p.date || null }
                return null
            })
            .filter((x) => x?.watched_at)
            .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime())
        return out
    }, [showPlays])

    // Init
    useEffect(() => {
        if (!open) return
        setShowError('')
        setPlaysError('')
        setPlaysBusy(false)

        // al abrir, resetea modal plays
        setPlaysOpen(false)
        setPlaysPreset('just_finished')
        setPlaysOtherValue(toLocalDatetimeInput(new Date().toISOString()))

        // rewatch local no lo forzamos a off al cerrar: lo decide el padre (si lo usa)
        // pero en ausencia de prop, lo reseteamos al abrir para evitar estados raros:
        if (!rewatchStartAt) setLocalRewatchStartAt(null)

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
    }, [open, usableSeasons, isMovie, movieWatchedAt, rewatchStartAt])

    // Shortcuts & Lock Scroll
    useEffect(() => {
        if (!open) return
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.()
        }
        window.addEventListener('keydown', onKey)
        document.body.style.overflow = 'hidden'
        return () => {
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = ''
        }
    }, [open, onClose])

    const loadSeason = async (sn) => {
        if (!TMDB_API_KEY || !tmdbId || sn == null) return
        if (Array.isArray(seasonCache?.[sn]?.episodes) || seasonCache?.[sn]?.loading) return

        setSeasonCache((p) => ({ ...p, [sn]: { ...(p?.[sn] || {}), loading: true, error: '' } }))

        try {
            const res = await fetch(
                `https://api.themoviedb.org/3/tv/${tmdbId}/season/${sn}?api_key=${TMDB_API_KEY}&language=es-ES`
            )
            const json = await res.json()
            if (!res.ok) throw new Error(json?.status_message || 'Error cargando temporada')
            setSeasonCache((p) => ({ ...p, [sn]: { loading: false, error: '', episodes: json.episodes || [] } }))
        } catch (e) {
            setSeasonCache((p) => ({ ...p, [sn]: { loading: false, error: e?.message || 'Error', episodes: [] } }))
        }
    }

    // Auto-load season
    useEffect(() => {
        if (!open || isMovie || viewMode !== 'list' || activeSeason == null) return
        loadSeason(activeSeason)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, isMovie, viewMode, activeSeason, tmdbId])

    useEffect(() => {
        if (!open || isMovie || viewMode !== 'list' || activeSeason == null) return
        if (Array.isArray(seasonCache?.[activeSeason]?.episodes)) setDisplaySeason(activeSeason)
    }, [open, isMovie, viewMode, activeSeason, seasonCache])

    const selectedSeasonObj = useMemo(
        () => usableSeasons.find((s) => s?.season_number === activeSeason) || null,
        [usableSeasons, activeSeason]
    )

    const selectedSn = selectedSeasonObj?.season_number ?? null
    const displaySn = displaySeason ?? activeSeason ?? null
    const displayCache = displaySn != null ? seasonCache?.[displaySn] : null
    const episodes = Array.isArray(displayCache?.episodes) ? displayCache.episodes : []

    const watchedSet = useMemo(() => new Set(effectiveWatchedBySeason?.[displaySn] || []), [effectiveWatchedBySeason, displaySn])

    const loadingSeason = seasonCache?.[selectedSn]?.loading
    const isSwitching = selectedSn !== displaySn && loadingSeason

    const filteredEpisodes = useMemo(() => {
        const q2 = (query || '').trim().toLowerCase()
        let base = episodes
        if (onlyUnwatched) base = base.filter((ep) => !watchedSet.has(ep.episode_number))
        if (!q2) return base
        return base.filter((ep) => (ep.name || '').toLowerCase().includes(q2) || String(ep.episode_number) === q2)
    }, [episodes, onlyUnwatched, watchedSet, query])

    const seasonsFilteredForTable = useMemo(() => {
        const q2 = (query || '').trim().toLowerCase()
        if (!q2) return usableSeasons
        return usableSeasons.filter((s) => seasonLabelText(s.season_number, s.name).toLowerCase().includes(q2))
    }, [usableSeasons, query])

    const onClickToggleShow = async () => {
        setShowError('')
        if (!canToggleShow) return

        if (!hasShowHandler) {
            setShowError('Falta implementar/pasar onToggleShowWatched desde DetailsClient.jsx')
            return
        }

        // legacy: marcar/quitar serie (esto NO añade plays múltiples)
        try {
            await onToggleShowWatched(showCompleted ? null : new Date().toISOString())
        } catch (e) {
            setShowError(e?.message || 'Error al actualizar la serie')
        }
    }

    // ===== NUEVO: resolver fecha del preset "Añadir visionado" =====
    const resolvePlayDate = () => {
        if (playsPreset === 'just_finished') return new Date().toISOString()
        if (playsPreset === 'unknown') return null
        if (playsPreset === 'release_date') {
            if (!showReleaseDate) return null
            // permite ISO o YYYY-MM-DD
            const d = new Date(showReleaseDate)
            if (Number.isNaN(d.getTime())) return null
            return d.toISOString()
        }
        if (playsPreset === 'other_date') return fromLocalDatetimeInput(playsOtherValue)
        return new Date().toISOString()
    }

    // ===== NUEVO: añadir play completo =====
    const onConfirmAddPlay = async () => {
        setPlaysError('')
        if (!connected) {
            setPlaysError('Conecta Trakt para añadir visionados.')
            return
        }
        if (!hasAddShowPlayHandler) {
            setPlaysError('Falta implementar/pasar onAddShowPlay desde DetailsClient.jsx')
            return
        }

        const watchedAt = resolvePlayDate()
        if (playsPreset === 'other_date' && !watchedAt) {
            setPlaysError('Elige una fecha válida.')
            return
        }
        if (playsPreset === 'release_date' && !showReleaseDate) {
            setPlaysError('No tengo la fecha de estreno de la serie.')
            return
        }

        setPlaysBusy(true)
        try {
            await onAddShowPlay(watchedAt, {
                preset: playsPreset,
                intent: 'add_additional_play',
                // Si watchedAt es anterior, tu backend debería marcar todos los episodios a esa fecha
            })
            setPlaysOpen(false)
        } catch (e) {
            setPlaysError(e?.message || 'Error al añadir visionado')
        } finally {
            setPlaysBusy(false)
        }
    }

    // ===== NUEVO: iniciar rewatch =====
    const onConfirmStartRewatch = async () => {
        setPlaysError('')
        if (!connected) {
            setPlaysError('Conecta Trakt para gestionar rewatch.')
            return
        }

        const startedAt = new Date().toISOString()

        // si hay handler externo, lo usa; si no, al menos activa modo UI local
        setPlaysBusy(true)
        try {
            if (hasStartRewatchHandler) {
                await onStartShowRewatch(startedAt)
            } else {
                setLocalRewatchStartAt(startedAt)
            }
            setPlaysOpen(false)
        } catch (e) {
            setPlaysError(e?.message || 'Error al iniciar rewatch')
        } finally {
            setPlaysBusy(false)
        }
    }

    // ===== NUEVO: marcar episodio (toggle normal vs add play en rewatch) =====
    const handleEpisodeClick = async (sn, en, isWatchedInThisView) => {
        setShowError('')

        // En rewatch queremos AÑADIR play, no “toggle” (porque toggle podría borrar)
        if (rewatchActive) {
            if (isWatchedInThisView) return // evita añadir plays duplicados por error
            if (!hasAddEpisodePlayHandler) {
                setShowError('Falta implementar/pasar onAddEpisodePlay para rewatch (añadir play sin borrar).')
                // fallback (puede borrar en vez de añadir, por eso avisamos)
                onToggleEpisodeWatched?.(sn, en)
                return
            }
            try {
                await onAddEpisodePlay(sn, en, new Date().toISOString(), { intent: 'rewatch_add_episode_play' })
            } catch (e) {
                setShowError(e?.message || 'Error al añadir play del episodio')
            }
            return
        }

        // modo normal (toggle)
        onToggleEpisodeWatched?.(sn, en)
    }

    if (!open) return null

    const PanelClass =
        'fixed inset-0 sm:static w-full h-[100dvh] sm:h-[85vh] sm:max-w-5xl bg-[#0b0b0b] sm:rounded-3xl sm:border sm:border-white/10 sm:shadow-2xl overflow-hidden flex flex-col z-[10060] sm:z-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:py-0'
    const ButtonBase =
        'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed'

    // --- MOVIE RENDER ---
    if (isMovie) {
        return (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center sm:p-4">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`${PanelClass} sm:max-w-lg sm:h-auto`}
                >
                    <div className="p-5 border-b border-white/10 flex justify-between items-start gap-4 bg-[#0b0b0b]">
                        <div>
                            <h3 className="text-xl font-black text-white">Marcar película</h3>
                            <p className="text-sm text-zinc-400 mt-0.5 line-clamp-1">{title}</p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6">
                        {!connected ? (
                            <div className="text-center py-8">
                                <p className="text-zinc-300 font-medium mb-4">Conecta Trakt para gestionar tu historial.</p>
                                <Link href="/trakt" className={`${ButtonBase} px-6 py-2.5 bg-emerald-600 text-white hover:bg-emerald-500`}>
                                    Ir a Conectar
                                </Link>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                                        Fecha y hora (opcional)
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={movieEditValue}
                                        onChange={(e) => setMovieEditValue(e.target.value)}
                                        className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                                    />
                                    {movieWatchedAt && <p className="mt-2 text-xs text-emerald-400">Visto el: {new Date(movieWatchedAt).toLocaleString()}</p>}
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={onClose} className={`${ButtonBase} flex-1 py-3 bg-zinc-800 text-zinc-300 hover:bg-zinc-700`}>
                                        Cancelar
                                    </button>

                                    {movieWatched ? (
                                        <button
                                            type="button"
                                            onClick={() => !busyMovie && onToggleMovieWatched?.(null)}
                                            disabled={busyMovie}
                                            className={`${ButtonBase} flex-1 py-3 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20`}
                                        >
                                            {busyMovie ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />}
                                            Quitar de vistos
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => !busyMovie && onToggleMovieWatched?.(fromLocalDatetimeInput(movieEditValue) || new Date().toISOString())}
                                            disabled={busyMovie}
                                            className={`${ButtonBase} flex-1 py-3 bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20`}
                                        >
                                            {busyMovie ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                            Marcar como visto
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </motion.div>
            </div>
        )
    }

    // --- TV RENDER ---
    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center sm:p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <motion.div
                ref={panelRef}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className={PanelClass}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#0b0b0b] shrink-0 z-30">
                    <div className="min-w-0 pr-4">
                        <h2 className="text-lg sm:text-xl font-black text-white truncate leading-tight">Episodios vistos</h2>
                        <p className="text-xs sm:text-sm text-zinc-400 truncate">{title}</p>

                        {totals.totalEpisodes > 0 && (
                            <div className="flex items-center gap-3 mt-2">
                                <div className="h-1.5 w-24 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progressPct}%` }} />
                                </div>
                                <span className="text-[10px] font-bold text-zinc-300">{progressPct}% completado</span>

                                {rewatchActive && (
                                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                                        <RotateCcw className="w-3 h-3" />
                                        Rewatch
                                    </span>
                                )}
                            </div>
                        )}

                        {rewatchActive && effectiveRewatchStartAt && (
                            <div className="mt-2 text-[11px] text-zinc-400">
                                Rewatch desde <span className="text-zinc-200 font-semibold">{formatDateTime(effectiveRewatchStartAt)}</span>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Plays history (fechas de visionado completo) */}
                {connected && normalizedPlays.length > 0 && (
                    <div className="px-5 py-3 border-b border-white/5 bg-[#0b0b0b]">
                        <div className="flex items-center gap-2 text-xs text-zinc-300 font-bold">
                            <History className="w-4 h-4 text-emerald-400" />
                            Visionados completos
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-300">
                                {normalizedPlays.length}
                            </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {normalizedPlays.slice(0, 12).map((p) => (
                                <span
                                    key={p.watched_at}
                                    className="text-[10px] px-2 py-1 rounded-full bg-zinc-900 border border-white/10 text-zinc-300"
                                    title={formatDateTime(p.watched_at)}
                                >
                                    {formatDate(p.watched_at)}
                                </span>
                            ))}
                            {normalizedPlays.length > 12 && (
                                <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                                    +{normalizedPlays.length - 12}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Toolbar */}
                <div className="px-5 py-3 border-b border-white/5 flex flex-col sm:flex-row gap-3 bg-[#0b0b0b] shrink-0 z-20">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={viewMode === 'list' ? 'Buscar episodio...' : 'Buscar temporada...'}
                            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition"
                        />
                    </div>

                    <div className="flex gap-2 shrink-0 overflow-x-auto no-scrollbar">
                        <div className="flex bg-zinc-900 rounded-xl p-1 border border-white/5">
                            <button
                                type="button"
                                onClick={() => setViewMode('list')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${viewMode === 'list' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'
                                    }`}
                            >
                                <List className="w-3.5 h-3.5" /> Lista
                            </button>

                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${viewMode === 'table' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'
                                    }`}
                            >
                                <Table2 className="w-3.5 h-3.5" /> Tabla
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setOnlyUnwatched(!onlyUnwatched)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${onlyUnwatched
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-zinc-900 border-white/5 text-zinc-400 hover:bg-zinc-800'
                                }`}
                        >
                            <Filter className="w-3.5 h-3.5" /> {onlyUnwatched ? 'No vistos' : 'Todos'}
                        </button>

                        {/* ✅ NUEVO: Añadir visionado */}
                        <button
                            type="button"
                            onClick={() => {
                                setPlaysError('')
                                setPlaysPreset('just_finished')
                                setPlaysOtherValue(toLocalDatetimeInput(new Date().toISOString()))
                                setPlaysOpen(true)
                            }}
                            className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap bg-zinc-900 border-white/5 text-zinc-200 hover:bg-zinc-800"
                            title={!connected ? 'Conecta Trakt' : 'Añadir otro visionado completo o iniciar rewatch'}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Añadir visionado
                        </button>

                        {/* Botón serie completa (legacy) */}
                        <button
                            type="button"
                            disabled={!canToggleShow}
                            onClick={onClickToggleShow}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap
                ${showCompleted
                                    ? 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20'
                                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                }
                ${!canToggleShow ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={!connected ? 'Conecta Trakt' : usableSeasons.length === 0 ? 'Sin temporadas disponibles' : undefined}
                        >
                            {busyShow ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : showCompleted ? (
                                <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                                <Eye className="w-3.5 h-3.5" />
                            )}
                            {showCompleted ? 'Quitar serie' : 'Marcar serie'}
                        </button>
                    </div>

                    {!!showError && <div className="text-xs text-red-300 font-medium">{showError}</div>}
                </div>

                {/* Content Area */}
                <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden relative">
                    {!connected ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                            <p className="text-zinc-400 mb-4">Debes conectar Trakt para gestionar el progreso.</p>
                            <Link href="/trakt" className={`${ButtonBase} px-6 py-2.5 bg-emerald-600 text-white hover:bg-emerald-500`}>
                                Conectar Trakt
                            </Link>
                        </div>
                    ) : viewMode === 'list' ? (
                        <>
                            {/* Sidebar Temporadas (Desktop) */}
                            <div className="hidden md:flex w-64 flex-col border-r border-white/5 bg-zinc-900/20 overflow-y-auto custom-scrollbar">
                                <div className="p-3 space-y-1">
                                    {usableSeasons.map((s) => {
                                        const sn = s.season_number
                                        const watched = (effectiveWatchedBySeason[sn] || []).length
                                        const total = s.episode_count || 0
                                        const active = sn === activeSeason

                                        return (
                                            <button
                                                key={sn}
                                                type="button"
                                                onClick={() => {
                                                    setActiveSeason(sn)
                                                    if (Array.isArray(seasonCache?.[sn]?.episodes)) setDisplaySeason(sn)
                                                }}
                                                className={`w-full text-left px-4 py-3 rounded-xl transition-all flex justify-between items-center group ${active ? 'bg-emerald-500/10 border border-emerald-500/20' : 'hover:bg-white/5 border border-transparent'
                                                    }`}
                                            >
                                                <div>
                                                    <div className={`text-sm font-bold ${active ? 'text-emerald-400' : 'text-zinc-300 group-hover:text-white'}`}>
                                                        {seasonLabelText(sn, s.name)}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 mt-0.5">
                                                        {watched} / {total} vistos
                                                    </div>
                                                </div>
                                                <ChevronRight className={`w-4 h-4 ${active ? 'text-emerald-500' : 'text-zinc-600'}`} />
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Mobile Season Selector */}
                            <div className="md:hidden w-full overflow-x-auto no-scrollbar border-b border-white/5 bg-zinc-900/20 shrink-0">
                                <div className="flex gap-2 p-3 min-w-max">
                                    {usableSeasons.map((s) => {
                                        const sn = s.season_number
                                        const active = sn === activeSeason
                                        return (
                                            <button
                                                key={sn}
                                                type="button"
                                                onClick={() => {
                                                    setActiveSeason(sn)
                                                    if (Array.isArray(seasonCache?.[sn]?.episodes)) setDisplaySeason(sn)
                                                }}
                                                className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap border transition-all ${active
                                                    ? 'bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/20'
                                                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                                    }`}
                                            >
                                                {sn === 0 ? 'Esp' : `T${sn}`}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Episodes List */}
                            <div className="flex-1 overflow-y-auto no-scrollbar p-3 sm:p-4 pb-20 sm:pb-4 relative scroll-smooth">
                                {isSwitching && (
                                    <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center backdrop-blur-[1px]">
                                        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {filteredEpisodes.length === 0 && !loadingSeason ? (
                                        <div className="text-center py-12 text-zinc-500 text-sm">No hay episodios que coincidan.</div>
                                    ) : (
                                        filteredEpisodes.map((ep) => {
                                            const sn = displaySn
                                            const en = ep.episode_number
                                            const key = `S${sn}E${en}`
                                            const busy = busyKey === key
                                            const watched = watchedSet.has(en)
                                            const img = tmdbImg(ep.still_path)

                                            return (
                                                <div
                                                    key={en}
                                                    className="group flex gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl bg-zinc-900/30 border border-white/5 hover:bg-zinc-800/50 hover:border-white/10 transition"
                                                >
                                                    <div className="w-24 sm:w-32 aspect-video bg-zinc-800 rounded-lg overflow-hidden shrink-0 relative">
                                                        {img ? (
                                                            <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Tv className="w-6 h-6 text-zinc-700" />
                                                            </div>
                                                        )}
                                                        {watched && (
                                                            <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center backdrop-blur-[1px]">
                                                                <Check className="w-8 h-8 text-emerald-400 drop-shadow-md" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div className="min-w-0">
                                                                <h4 className="text-sm font-bold text-white truncate pr-2">
                                                                    {en}. {ep.name || `Episodio ${en}`}
                                                                </h4>
                                                                <p className="text-xs text-zinc-500 mt-0.5">{formatDate(ep.air_date)}</p>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                disabled={busy}
                                                                onClick={() => handleEpisodeClick(sn, en, watched)}
                                                                className={`p-2 rounded-lg transition shrink-0 ${watched ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' : 'text-zinc-500 hover:text-white hover:bg-white/10'
                                                                    }`}
                                                                title={rewatchActive ? 'Añadir play (rewatch)' : watched ? 'Quitar de vistos' : 'Marcar como visto'}
                                                            >
                                                                {busy ? (
                                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                                ) : rewatchActive ? (
                                                                    <Plus className="w-5 h-5" />
                                                                ) : watched ? (
                                                                    <EyeOff className="w-5 h-5" />
                                                                ) : (
                                                                    <Eye className="w-5 h-5" />
                                                                )}
                                                            </button>
                                                        </div>

                                                        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed hidden sm:block">
                                                            {ep.overview}
                                                        </p>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        // TABLE MODE
                        <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4 pb-20 sm:pb-4">
                            {seasonsFilteredForTable.map((s) => {
                                const sn = s.season_number
                                const total = s.episode_count || 0
                                const watchedArr = effectiveWatchedBySeason[sn] || []
                                const watchedSetLocal = new Set(watchedArr)
                                const watchedCount = watchedArr.length

                                if (onlyUnwatched && watchedCount >= total) return null

                                const nums = Array.from(
                                    { length: Math.min(total, expandedSeason[sn] ? total : MAX_EPISODES_RENDER) },
                                    (_, i) => i + 1
                                )
                                const hasMore = total > MAX_EPISODES_RENDER && !expandedSeason[sn]
                                const remaining = total - MAX_EPISODES_RENDER

                                return (
                                    <div key={sn} className="bg-zinc-900/30 border border-white/5 rounded-2xl p-4">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-sm font-bold text-white">{seasonLabelText(sn, s.name)}</h4>
                                            <span className="text-xs font-medium text-zinc-500 bg-zinc-900 px-2 py-1 rounded-md border border-white/5">
                                                {watchedCount}/{total}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-1.5">
                                            {nums.map((en) => {
                                                const w = watchedSetLocal.has(en)
                                                const key = `S${sn}E${en}`
                                                const busy = busyKey === key

                                                return (
                                                    <button
                                                        key={en}
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => handleEpisodeClick(sn, en, w)}
                                                        className={`w-9 h-9 rounded-lg text-xs font-bold flex items-center justify-center transition border ${w ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                                            } ${busy ? 'opacity-50' : ''}`}
                                                        title={rewatchActive ? 'Añadir play (rewatch)' : w ? 'Toggle (puede borrar)' : 'Marcar como visto'}
                                                    >
                                                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : rewatchActive ? <Plus className="w-3.5 h-3.5" /> : en}
                                                    </button>
                                                )
                                            })}

                                            {hasMore && (
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedSeason((p) => ({ ...p, [sn]: true }))}
                                                    className="px-3 h-9 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-400 hover:text-white"
                                                >
                                                    +{remaining}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* ===== NUEVO: Modal "Añadir visionado" ===== */}
                <AnimatePresence>
                    {playsOpen && (
                        <motion.div
                            className="absolute inset-0 z-[200] flex items-center justify-center p-4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !playsBusy && setPlaysOpen(false)}
                        >
                            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                                transition={{ duration: 0.18 }}
                                onClick={(e) => e.stopPropagation()}
                                className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0b0b] shadow-2xl overflow-hidden"
                            >
                                <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-black text-white">Añadir visionado</h3>
                                        <p className="text-xs text-zinc-400 mt-1">
                                            Añade otro visionado completo (play) o empieza un rewatch.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={playsBusy}
                                        onClick={() => setPlaysOpen(false)}
                                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition disabled:opacity-50"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="p-5 space-y-5">
                                    <div className="space-y-2">
                                        <div className="text-[11px] font-black text-zinc-400 uppercase tracking-wider">
                                            Fecha del visionado completo
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                { id: 'just_finished', label: 'Just finished' },
                                                { id: 'release_date', label: 'Release date', disabled: !showReleaseDate },
                                                { id: 'unknown', label: 'Unknown date' },
                                                { id: 'other_date', label: 'Other date' },
                                            ].map((opt) => (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    disabled={playsBusy || opt.disabled}
                                                    onClick={() => setPlaysPreset(opt.id)}
                                                    className={`px-3 py-2 rounded-xl border text-xs font-bold transition
                            ${playsPreset === opt.id
                                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                                            : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                                                        }
                            ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                          `}
                                                    title={opt.id === 'release_date' && !showReleaseDate ? 'Falta showReleaseDate' : undefined}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>

                                        {playsPreset === 'other_date' && (
                                            <div className="mt-3">
                                                <label className="block text-[11px] font-bold text-zinc-500 mb-2">
                                                    Elige fecha y hora
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={playsOtherValue}
                                                    onChange={(e) => setPlaysOtherValue(e.target.value)}
                                                    disabled={playsBusy}
                                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500/50 outline-none transition"
                                                />
                                                <p className="mt-2 text-[11px] text-zinc-500">
                                                    Si eliges una fecha anterior, tu backend debe marcar todos los episodios como vistos en esa fecha.
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {!!playsError && <div className="text-xs text-red-300 font-medium">{playsError}</div>}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                        <button
                                            type="button"
                                            disabled={playsBusy}
                                            onClick={onConfirmAddPlay}
                                            className="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {playsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
                                            Añadir visionado completo
                                        </button>

                                        <button
                                            type="button"
                                            disabled={playsBusy}
                                            onClick={onConfirmStartRewatch}
                                            className="py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                                            title={hasStartRewatchHandler ? 'Activa rewatch (depende del padre)' : 'Activa rewatch local (UI)'}
                                        >
                                            {playsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                            Empezar rewatch
                                        </button>
                                    </div>

                                    <div className="text-[11px] text-zinc-500 leading-relaxed">
                                        <span className="text-zinc-300 font-semibold">Nota:</span> Para que el rewatch se sincronice bien,
                                        lo ideal es que tu app lleve el progreso por “run” (filtrando plays por fecha de inicio) y use
                                        <span className="text-zinc-300 font-semibold"> onAddEpisodePlay </span>
                                        para añadir plays por episodio sin borrar los anteriores.
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    )
}