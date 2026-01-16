'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
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
    Trash2,
    ChevronDown,
} from 'lucide-react'

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

const pad2 = (n) => String(n).padStart(2, '0')

const toLocalDatetimeInput = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
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

    // (opcional) compatibilidad extra
    mediaType = 'tv',
    tmdbId,
    title,

    // puede venir como boolean u objeto: lo normalizamos
    connected,

    seasons = [],
    watchedBySeason = {},

    busyKey = '',
    episodeBusyKey = '',

    // global (nombre “viejo” y alias)
    onToggleEpisodeWatched,
    onToggleEpisodeGlobal,

    // movie
    movieWatchedAt = null,
    onToggleMovieWatched,

    // show
    onToggleShowWatched,

    showPlays = [],
    showReleaseDate = null,
    onAddShowPlay,

    // rewatch (nombres “viejos” y alias)
    rewatchRuns = [],
    runs, // alias
    activeEpisodesView = 'global',
    activeView, // alias
    onChangeEpisodesView,
    onChangeView, // alias
    onCreateRewatchRun,
    onCreateRun, // alias
    onDeleteRewatchRun,
    onDeleteRun, // alias

    rewatchStartAt = null,
    rewatchWatchedBySeason = null,
    watchedBySeasonRewatch, // alias

    onToggleEpisodeRewatch,

    // legacy (por si alguien lo usa aún)
    onAddEpisodePlay,
    onStartShowRewatch,
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

    const [playsOpen, setPlaysOpen] = useState(false)
    const [playsPreset, setPlaysPreset] = useState('just_finished')
    const [playsOtherValue, setPlaysOtherValue] = useState(toLocalDatetimeInput(new Date().toISOString()))
    const [playsBusy, setPlaysBusy] = useState(false)
    const [playsError, setPlaysError] = useState('')

    const [playsHistoryOpen, setPlaysHistoryOpen] = useState(false)
    const [playsHistoryQuery, setPlaysHistoryQuery] = useState('')
    const [playsHistoryLimit, setPlaysHistoryLimit] = useState(60)

    // fallback local si no viene el handler desde el padre
    const [localRewatchStartAt, setLocalRewatchStartAt] = useState(null)

    const panelRef = useRef(null)

    const isConnected = !!connected
    const isMovie = mediaType === 'movie'
    const movieWatched = !!movieWatchedAt

    const effectiveBusyKey = busyKey || episodeBusyKey || ''
    const busyMovie = effectiveBusyKey === MOVIE_BUSY_KEY
    const busyShow = effectiveBusyKey === SHOW_BUSY_KEY

    // normalizamos handlers / aliases
    const toggleEpisodeGlobalHandler = typeof onToggleEpisodeGlobal === 'function' ? onToggleEpisodeGlobal : onToggleEpisodeWatched
    const changeViewHandler = typeof onChangeView === 'function' ? onChangeView : onChangeEpisodesView
    const createRunHandler = typeof onCreateRun === 'function' ? onCreateRun : onCreateRewatchRun
    const deleteRunHandler = typeof onDeleteRun === 'function' ? onDeleteRun : onDeleteRewatchRun
    const effectiveRunsInput = Array.isArray(runs) ? runs : rewatchRuns
    const effectiveActiveView = (typeof activeView === 'string' && activeView) ? activeView : activeEpisodesView

    const hasShowHandler = typeof onToggleShowWatched === 'function'
    const hasAddShowPlayHandler = typeof onAddShowPlay === 'function'
    const hasCreateRunHandler = typeof createRunHandler === 'function'
    const hasDeleteRunHandler = typeof deleteRunHandler === 'function'
    const hasChangeViewHandler = typeof changeViewHandler === 'function'
    const hasToggleRewatchHandler = typeof onToggleEpisodeRewatch === 'function'
    const hasLegacyAddEpisodePlayHandler = typeof onAddEpisodePlay === 'function'
    const hasLegacyStartRewatchHandler = typeof onStartShowRewatch === 'function'

    const usableSeasons = useMemo(() => {
        const list = Array.isArray(seasons) ? seasons : []

        // Acepta temporadas tanto de TMDb (season_number/episode_count) como de Trakt (number/episodes)
        const normalized = list
            .map((s) => {
                if (!s) return null
                const snRaw = s.season_number ?? s.number ?? s.season ?? null
                const sn = typeof snRaw === 'number' ? snRaw : Number(snRaw)
                if (!Number.isFinite(sn)) return null

                const epCountRaw =
                    s.episode_count ?? s.episodeCount ?? s.episodes_count ?? (Array.isArray(s.episodes) ? s.episodes.length : null)
                const episode_count = typeof epCountRaw === 'number' && Number.isFinite(epCountRaw) ? epCountRaw : 0

                const name = s.name ?? s.title ?? null

                return { ...s, season_number: sn, episode_count, name }
            })
            .filter((s) => s && typeof s.season_number === 'number' && s.season_number > 0)
            .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0))

        return normalized
    }, [seasons])

    const normalizedRuns = useMemo(() => {
        const base = Array.isArray(effectiveRunsInput) ? effectiveRunsInput : []
        return base
            .filter((r) => r?.id)
            .map((r) => ({
                id: r.id,
                startedAt: r.startedAt || r.id,
                label: r.label || `Rewatch · ${formatDate(r.startedAt || r.id)}`,
            }))
    }, [effectiveRunsInput])

    const effectiveViewId = useMemo(() => {
        const v = typeof effectiveActiveView === 'string' && effectiveActiveView ? effectiveActiveView : 'global'
        if (hasChangeViewHandler) return v
        return localRewatchStartAt ? localRewatchStartAt : 'global'
    }, [effectiveActiveView, hasChangeViewHandler, localRewatchStartAt])

    const isRewatchView = effectiveViewId !== 'global'

    const effectiveRewatchStartAt = useMemo(() => {
        if (!isRewatchView) return null
        return (
            rewatchStartAt ||
            (effectiveViewId !== 'global' ? effectiveViewId : null) ||
            localRewatchStartAt
        )
    }, [isRewatchView, rewatchStartAt, effectiveViewId, localRewatchStartAt])

    const currentRun = useMemo(() => {
        if (!isRewatchView) return null
        return normalizedRuns.find((r) => r.id === effectiveViewId) || null
    }, [isRewatchView, normalizedRuns, effectiveViewId])

    const viewLabel = isRewatchView
        ? (currentRun?.label || `Rewatch · ${formatDate(effectiveRewatchStartAt)}`)
        : 'Global'

    const effectiveRewatchWatched = watchedBySeasonRewatch ?? rewatchWatchedBySeason

    const effectiveWatchedBySeason = useMemo(() => {
        if (!isRewatchView) return watchedBySeason || {}
        if (effectiveRewatchWatched && typeof effectiveRewatchWatched === 'object') return effectiveRewatchWatched
        return {}
    }, [isRewatchView, watchedBySeason, effectiveRewatchWatched])

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

    const canToggleShow = isConnected && usableSeasons.length > 0 && !busyShow

    const tmdbImg = (path, size = 'w300') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null)

    const normalizedPlays = useMemo(() => {
        const arr = Array.isArray(showPlays) ? showPlays : []
        return arr
            .map((p) => {
                if (!p) return null
                if (typeof p === 'string') return { watched_at: p }
                if (typeof p === 'object') return { watched_at: p.watched_at || p.watchedAt || p.date || null }
                return null
            })
            .filter((x) => x?.watched_at)
            .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime())
    }, [showPlays])

    const filteredPlaysHistory = useMemo(() => {
        const q = (playsHistoryQuery || '').trim().toLowerCase()
        if (!q) return normalizedPlays
        return normalizedPlays.filter((p) => formatDateTime(p.watched_at).toLowerCase().includes(q))
    }, [normalizedPlays, playsHistoryQuery])

    const visiblePlaysHistory = useMemo(
        () => filteredPlaysHistory.slice(0, playsHistoryLimit),
        [filteredPlaysHistory, playsHistoryLimit]
    )

    // ✅ resetear caché de temporadas al abrir / cambiar de serie
    useEffect(() => {
        if (!open || isMovie) return
        setSeasonCache({})
        setExpandedSeason({})
    }, [open, isMovie, tmdbId])

    // Init
    useEffect(() => {
        if (!open) return
        setShowError('')
        setPlaysError('')
        setPlaysBusy(false)
        setPlaysOpen(false)

        setPlaysHistoryOpen(false)
        setPlaysHistoryQuery('')
        setPlaysHistoryLimit(60)

        setPlaysPreset('just_finished')
        setPlaysOtherValue(toLocalDatetimeInput(new Date().toISOString()))

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

    // ✅ Al cerrar, limpiamos estado interno para evitar “stale state” al reabrir (especialmente en rewatch)
    useEffect(() => {
        if (open) return
        setShowError('')
        setPlaysError('')
        setPlaysOpen(false)
        setPlaysBusy(false)
        setPlaysHistoryOpen(false)

        setQuery('')
        setOnlyUnwatched(false)
        setViewMode('list')
        setActiveSeason(null)
        setDisplaySeason(null)

        setSeasonCache({})
        setExpandedSeason({})
    }, [open])


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

    // --------- TMDB Season Loading (con retry + estado) ---------
    const seasonCacheRef = useRef({})
    useEffect(() => {
        seasonCacheRef.current = seasonCache
    }, [seasonCache])

    const loadSeason = useCallback(
        async (sn, { force = false } = {}) => {
            if (sn == null) return

            if (!TMDB_API_KEY || !tmdbId) {
                setSeasonCache((p) => ({
                    ...p,
                    [sn]: {
                        loading: false,
                        loaded: true,
                        error: !tmdbId ? 'Falta tmdbId (no puedo cargar episodios).' : 'Falta NEXT_PUBLIC_TMDB_API_KEY.',
                        episodes: [],
                    },
                }))
                return
            }

            const cached = seasonCacheRef.current?.[sn]
            if (!force && (cached?.loading || cached?.loaded)) return

            setSeasonCache((p) => ({
                ...p,
                [sn]: { ...(p?.[sn] || {}), loading: true, loaded: false, error: '' },
            }))

            try {
                const res = await fetch(
                    `https://api.themoviedb.org/3/tv/${tmdbId}/season/${sn}?api_key=${TMDB_API_KEY}&language=es-ES`
                )
                const json = await res.json()
                if (!res.ok) throw new Error(json?.status_message || 'Error cargando temporada')

                setSeasonCache((p) => ({
                    ...p,
                    [sn]: { loading: false, loaded: true, error: '', episodes: json.episodes || [] },
                }))
            } catch (e) {
                setSeasonCache((p) => ({
                    ...p,
                    [sn]: { loading: false, loaded: true, error: e?.message || 'Error', episodes: [] },
                }))
            }
        },
        [tmdbId]
    )

    const selectedSeasonObj = useMemo(
        () => usableSeasons.find((s) => s?.season_number === activeSeason) || null,
        [usableSeasons, activeSeason]
    )

    const displaySn = displaySeason ?? activeSeason ?? (selectedSeasonObj?.season_number ?? null)
    const displayCache = displaySn != null ? seasonCache?.[displaySn] : null
    const episodes = Array.isArray(displayCache?.episodes) ? displayCache.episodes : []

    // ✅ Cargar SIEMPRE la temporada que se está mostrando
    useEffect(() => {
        if (!open || isMovie || viewMode !== 'list' || displaySn == null) return
        loadSeason(displaySn)
    }, [open, isMovie, viewMode, displaySn, loadSeason])

    const watchedSet = useMemo(() => new Set(effectiveWatchedBySeason?.[displaySn] || []), [effectiveWatchedBySeason, displaySn])

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
        try {
            await onToggleShowWatched(showCompleted ? null : new Date().toISOString())
        } catch (e) {
            setShowError(e?.message || 'Error al actualizar la serie')
        }
    }

    const resolvePlayDate = () => {
        if (playsPreset === 'just_finished') return new Date().toISOString()
        if (playsPreset === 'unknown') return null
        if (playsPreset === 'release_date') {
            if (!showReleaseDate) return null
            const d = new Date(showReleaseDate)
            if (Number.isNaN(d.getTime())) return null
            return d.toISOString()
        }
        if (playsPreset === 'other_date') return fromLocalDatetimeInput(playsOtherValue)
        return new Date().toISOString()
    }

    const onConfirmAddPlay = async () => {
        setPlaysError('')
        if (!isConnected) {
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
            await onAddShowPlay(watchedAt, { preset: playsPreset, intent: 'add_additional_play' })
            setPlaysOpen(false)
        } catch (e) {
            setPlaysError(e?.message || 'Error al añadir visionado')
        } finally {
            setPlaysBusy(false)
        }
    }

    const changeView = (nextViewId) => {
        setShowError('')
        const v = nextViewId || 'global'
        if (hasChangeViewHandler) {
            changeViewHandler?.(v)
            return
        }
        setLocalRewatchStartAt(v === 'global' ? null : v)
    }

    const createRunNow = async (startedAtIsoOrNull = null) => {
        setShowError('')
        if (!isConnected) {
            setShowError('Conecta Trakt para gestionar rewatch.')
            return
        }
        const startedAt = startedAtIsoOrNull || new Date().toISOString()

        setPlaysBusy(true)
        try {
            if (hasCreateRunHandler) {
                await createRunHandler(startedAt)
            } else if (hasLegacyStartRewatchHandler) {
                await onStartShowRewatch(startedAt)
            } else {
                setLocalRewatchStartAt(startedAt)
            }
            setPlaysOpen(false)
        } catch (e) {
            setShowError(e?.message || 'Error al crear rewatch')
        } finally {
            setPlaysBusy(false)
        }
    }

    const deleteCurrentRun = async () => {
        if (!isRewatchView) return
        const runId = effectiveViewId
        const ok = window.confirm('¿Borrar este rewatch de la lista? (No borra tu historial en Trakt)')
        if (!ok) return

        setShowError('')
        try {
            if (hasDeleteRunHandler) {
                await deleteRunHandler(runId)
                // el padre normalmente ya vuelve a global; si no, esto lo fuerza
                changeViewHandler?.('global')
            } else {
                setLocalRewatchStartAt(null)
            }
        } catch (e) {
            setShowError(e?.message || 'Error al borrar rewatch')
        }
    }

    const handleEpisodeClick = async (sn, en, isWatchedInThisView) => {
        setShowError('')
        if (!isConnected) return

        if (isRewatchView) {
            if (hasToggleRewatchHandler) {
                try {
                    await onToggleEpisodeRewatch?.(sn, en)
                } catch (e) {
                    setShowError(e?.message || 'Error al actualizar el episodio (rewatch)')
                }
                return
            }

            if (isWatchedInThisView) {
                setShowError('Para desmarcar en rewatch necesitas implementar/pasar onToggleEpisodeRewatch.')
                return
            }
            if (!hasLegacyAddEpisodePlayHandler) {
                setShowError('Falta onToggleEpisodeRewatch (o legacy onAddEpisodePlay) para rewatch.')
                return
            }
            try {
                await onAddEpisodePlay?.(sn, en, new Date().toISOString(), { intent: 'rewatch_add_episode_play' })
            } catch (e) {
                setShowError(e?.message || 'Error al añadir play del episodio')
            }
            return
        }

        if (typeof toggleEpisodeGlobalHandler !== 'function') {
            setShowError('Falta implementar/pasar onToggleEpisodeWatched/onToggleEpisodeGlobal desde DetailsClient.jsx')
            return
        }

        try {
            await toggleEpisodeGlobalHandler(sn, en)
        } catch (e) {
            setShowError(e?.message || 'Error al actualizar el episodio')
        }
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
                        {!isConnected ? (
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
                                    {movieWatchedAt && (
                                        <p className="mt-2 text-xs text-emerald-400">Visto el: {new Date(movieWatchedAt).toLocaleString()}</p>
                                    )}
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
    const seasonLoading = !!displayCache?.loading
    const seasonError = displayCache?.error || ''
    const canLoadTmdb = !!TMDB_API_KEY && !!tmdbId

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
                <div className="px-5 pt-4 pb-3 border-b border-white/5 bg-[#0b0b0b] shrink-0 z-30">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h2 className="text-lg sm:text-xl font-black text-white truncate leading-tight">Episodios vistos</h2>
                            <p className="text-xs sm:text-sm text-zinc-400 truncate">{title}</p>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {totals.totalEpisodes > 0 && (
                        <div className="mt-3 flex flex-col gap-2">
                            <div className="flex items-center gap-3">
                                <div className="h-2 flex-1 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${isRewatchView ? 'bg-purple-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${progressPct}%` }}
                                    />
                                </div>

                                <div className="shrink-0 flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-zinc-300">{progressPct}%</span>
                                    <span
                                        className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border
                      ${isRewatchView ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' : 'bg-white/5 text-zinc-300 border-white/10'}`}
                                        title={isRewatchView ? 'Vista rewatch' : 'Vista global'}
                                    >
                                        {isRewatchView ? <RotateCcw className="w-3 h-3" /> : <History className="w-3 h-3 text-emerald-400" />}
                                        {viewLabel}
                                    </span>

                                    {isConnected && normalizedPlays.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setPlaysHistoryOpen(true)}
                                            className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[10px] font-black text-zinc-200 hover:bg-white/10 transition"
                                            title="Abrir historial completo"
                                        >
                                            <History className="w-3 h-3 text-emerald-400" />
                                            {normalizedPlays.length}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {isRewatchView && effectiveRewatchStartAt && (
                                <div className="text-[11px] text-zinc-400">
                                    Rewatch desde <span className="text-zinc-200 font-semibold">{formatDateTime(effectiveRewatchStartAt)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Toolbar */}
                <div className="px-5 py-3 border-b border-white/5 bg-[#0b0b0b] shrink-0 z-20">
                    {/* fila 1 */}
                    <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-12 lg:col-span-5 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={viewMode === 'list' ? 'Buscar episodio...' : 'Buscar temporada...'}
                                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition"
                            />
                        </div>

                        <div className="col-span-12 sm:col-span-6 lg:col-span-4 flex flex-wrap gap-2 items-center">
                            <div className="relative">
                                <select
                                    value={effectiveViewId || 'global'}
                                    onChange={(e) => changeView(e.target.value)}
                                    className="h-[36px] pl-3 pr-9 rounded-xl border text-xs font-black bg-zinc-900 border-white/10 text-zinc-200 hover:bg-zinc-800 transition outline-none"
                                    title="Cambiar vista (Global o Rewatch)"
                                >
                                    <option value="global">Global (Trakt)</option>
                                    {normalizedRuns.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.label}
                                        </option>
                                    ))}
                                    {!hasChangeViewHandler && localRewatchStartAt && (
                                        <option value={localRewatchStartAt}>Rewatch (local) · {formatDate(localRewatchStartAt)}</option>
                                    )}
                                    {/* si el padre pasa un id que no está en la lista, lo mostramos para evitar “value missing” */}
                                    {effectiveViewId !== 'global' && !normalizedRuns.some((r) => r.id === effectiveViewId) && hasChangeViewHandler && (
                                        <option value={effectiveViewId}>Rewatch · {formatDate(effectiveViewId)}</option>
                                    )}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            </div>

                            <button
                                type="button"
                                onClick={() => createRunNow(null)}
                                className="h-[36px] px-3 rounded-xl border text-xs font-black flex items-center gap-2 transition bg-purple-500/10 border-purple-500/20 text-purple-200 hover:bg-purple-500/15"
                                disabled={playsBusy}
                            >
                                <RotateCcw className="w-4 h-4" />
                                Nuevo rewatch
                            </button>

                            {isRewatchView && (
                                <button
                                    type="button"
                                    onClick={deleteCurrentRun}
                                    className="h-[36px] px-3 rounded-xl border text-xs font-black flex items-center gap-2 transition bg-red-500/10 border-red-500/20 text-red-200 hover:bg-red-500/15"
                                    disabled={playsBusy}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Borrar
                                </button>
                            )}
                        </div>

                        <div className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-center gap-2 justify-start sm:justify-end">
                            <div className="flex bg-zinc-900 rounded-xl p-1 border border-white/10">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('list')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition ${viewMode === 'list' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'
                                        }`}
                                >
                                    <List className="w-3.5 h-3.5" /> Lista
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition ${viewMode === 'table' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'
                                        }`}
                                >
                                    <Table2 className="w-3.5 h-3.5" /> Tabla
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* fila 2 */}
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                        <button
                            type="button"
                            onClick={() => setOnlyUnwatched(!onlyUnwatched)}
                            className={`h-[36px] px-3 rounded-xl border text-xs font-black flex items-center gap-2 transition ${onlyUnwatched
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                                }`}
                        >
                            <Filter className="w-4 h-4" /> {onlyUnwatched ? 'No vistos' : 'Todos'}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setPlaysError('')
                                setPlaysPreset('just_finished')
                                setPlaysOtherValue(toLocalDatetimeInput(new Date().toISOString()))
                                setPlaysOpen(true)
                            }}
                            className="h-[36px] px-3 rounded-xl border text-xs font-black flex items-center gap-2 transition bg-zinc-900 border-white/10 text-zinc-200 hover:bg-zinc-800"
                            title={!isConnected ? 'Conecta Trakt' : 'Añadir play o crear rewatch'}
                        >
                            <Plus className="w-4 h-4" />
                            Añadir visionado
                        </button>

                        <button
                            type="button"
                            onClick={() => setPlaysHistoryOpen(true)}
                            disabled={!isConnected || normalizedPlays.length === 0}
                            className="h-[36px] px-3 rounded-xl border text-xs font-black flex items-center gap-2 transition bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                            title="Ver historial completo"
                        >
                            <History className="w-4 h-4 text-emerald-400" />
                            Historial
                            {isConnected && normalizedPlays.length > 0 && (
                                <span className="ml-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-200">
                                    {normalizedPlays.length}
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            disabled={!canToggleShow || isRewatchView}
                            onClick={onClickToggleShow}
                            className={`h-[36px] px-3 rounded-xl border text-xs font-black flex items-center gap-2 transition
                ${showCompleted
                                    ? 'bg-red-500/10 border-red-500/30 text-red-200 hover:bg-red-500/20'
                                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                                }
                ${(!canToggleShow || isRewatchView) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={
                                isRewatchView
                                    ? 'En rewatch no se usa “marcar serie completa”'
                                    : !isConnected
                                        ? 'Conecta Trakt'
                                        : usableSeasons.length === 0
                                            ? 'Sin temporadas disponibles'
                                            : undefined
                            }
                        >
                            {busyShow ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : showCompleted ? (
                                <EyeOff className="w-4 h-4" />
                            ) : (
                                <Eye className="w-4 h-4" />
                            )}
                            {showCompleted ? 'Quitar serie' : 'Marcar serie'}
                        </button>
                    </div>

                    {!!showError && <div className="mt-2 text-xs text-red-300 font-medium">{showError}</div>}
                </div>

                {/* Content Area */}
                <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
                    {!isConnected ? (
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
                                                    setDisplaySeason(sn)
                                                    loadSeason(sn)
                                                }}
                                                className={`w-full text-left px-4 py-3 rounded-xl transition-all flex justify-between items-center group ${active
                                                    ? (isRewatchView ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-emerald-500/10 border border-emerald-500/20')
                                                    : 'hover:bg-white/5 border border-transparent'
                                                    }`}
                                            >
                                                <div>
                                                    <div
                                                        className={`text-sm font-bold ${active
                                                            ? (isRewatchView ? 'text-purple-300' : 'text-emerald-400')
                                                            : 'text-zinc-300 group-hover:text-white'
                                                            }`}
                                                    >
                                                        {seasonLabelText(sn, s.name)}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 mt-0.5">
                                                        {watched} / {total} vistos
                                                    </div>
                                                </div>
                                                <ChevronRight className={`w-4 h-4 ${active ? (isRewatchView ? 'text-purple-400' : 'text-emerald-500') : 'text-zinc-600'}`} />
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
                                                    setDisplaySeason(sn)
                                                    loadSeason(sn)
                                                }}
                                                className={`px-4 py-2 rounded-lg text-xs font-black whitespace-nowrap border transition-all ${active
                                                    ? (isRewatchView
                                                        ? 'bg-purple-400 text-black border-purple-400 shadow-lg shadow-purple-500/20'
                                                        : 'bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/20')
                                                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                                                    }`}
                                            >
                                                {sn === 0 ? 'Esp' : `T${sn}`}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Episodes List */}
                            <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar p-3 sm:p-4 pb-20 sm:pb-4 relative scroll-smooth">
                                {!canLoadTmdb && (
                                    <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">
                                        <div className="font-black">No se pueden cargar episodios.</div>
                                        <div className="text-xs text-zinc-400 mt-1">
                                            {tmdbId ? 'Falta NEXT_PUBLIC_TMDB_API_KEY en el build.' : 'Falta tmdbId en las props del modal.'}
                                        </div>
                                    </div>
                                )}

                                {seasonError && (
                                    <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                                        <div className="font-black">Error cargando episodios</div>
                                        <div className="text-xs mt-1 opacity-90">{seasonError}</div>
                                        <button
                                            type="button"
                                            onClick={() => displaySn != null && loadSeason(displaySn, { force: true })}
                                            className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-red-500/20 bg-black/30 hover:bg-black/40 text-xs font-black"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            Reintentar
                                        </button>
                                    </div>
                                )}

                                {seasonLoading && (
                                    <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center backdrop-blur-[1px]">
                                        <Loader2 className={`w-8 h-8 animate-spin ${isRewatchView ? 'text-purple-400' : 'text-emerald-500'}`} />
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {!seasonLoading && !seasonError && episodes.length === 0 ? (
                                        <div className="text-center py-12 text-zinc-500 text-sm">
                                            No hay datos de episodios para esta temporada.
                                            <div className="mt-3">
                                                <button
                                                    type="button"
                                                    onClick={() => displaySn != null && loadSeason(displaySn, { force: true })}
                                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-black text-zinc-200"
                                                >
                                                    <RotateCcw className="w-4 h-4" />
                                                    Reintentar
                                                </button>
                                            </div>
                                        </div>
                                    ) : !seasonLoading && !seasonError && filteredEpisodes.length === 0 ? (
                                        <div className="text-center py-12 text-zinc-500 text-sm">No hay episodios que coincidan.</div>
                                    ) : (
                                        filteredEpisodes.map((ep) => {
                                            const sn = displaySn
                                            const en = ep.episode_number
                                            const key = `S${sn}E${en}`
                                            const busy = effectiveBusyKey === key
                                            const watched = watchedSet.has(en)
                                            const img = tmdbImg(ep.still_path)

                                            const overlayClass = watched ? (isRewatchView ? 'bg-purple-500/20' : 'bg-emerald-500/20') : ''
                                            const checkClass = isRewatchView ? 'text-purple-300' : 'text-emerald-400'

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
                                                            <div className={`absolute inset-0 ${overlayClass} flex items-center justify-center backdrop-blur-[1px]`}>
                                                                <Check className={`w-8 h-8 ${checkClass} drop-shadow-md`} />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div className="min-w-0">
                                                                <h4 className="text-sm font-black text-white truncate pr-2">
                                                                    {en}. {ep.name || `Episodio ${en}`}
                                                                </h4>
                                                                <p className="text-xs text-zinc-500 mt-0.5">{formatDate(ep.air_date)}</p>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                disabled={busy}
                                                                onClick={() => handleEpisodeClick(sn, en, watched)}
                                                                className={`p-2 rounded-lg transition shrink-0 ${watched
                                                                    ? (isRewatchView
                                                                        ? 'text-purple-200 bg-purple-500/10 hover:bg-purple-500/20'
                                                                        : 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20')
                                                                    : 'text-zinc-500 hover:text-white hover:bg-white/10'
                                                                    }`}
                                                                title={
                                                                    isRewatchView
                                                                        ? (watched ? 'Desmarcar en este rewatch' : 'Marcar en este rewatch')
                                                                        : (watched ? 'Quitar de vistos' : 'Marcar como visto')
                                                                }
                                                            >
                                                                {busy ? (
                                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                                ) : isRewatchView ? (
                                                                    watched ? <EyeOff className="w-5 h-5" /> : <Plus className="w-5 h-5" />
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
                                            <h4 className="text-sm font-black text-white">{seasonLabelText(sn, s.name)}</h4>
                                            <span className="text-xs font-medium text-zinc-500 bg-zinc-900 px-2 py-1 rounded-md border border-white/5">
                                                {watchedCount}/{total}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-1.5">
                                            {nums.map((en) => {
                                                const w = watchedSetLocal.has(en)
                                                const key = `S${sn}E${en}`
                                                const busy = effectiveBusyKey === key

                                                return (
                                                    <button
                                                        key={en}
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => handleEpisodeClick(sn, en, w)}
                                                        className={`w-9 h-9 rounded-lg text-xs font-black flex items-center justify-center transition border ${w
                                                            ? (isRewatchView ? 'bg-purple-600 border-purple-500 text-white' : 'bg-emerald-600 border-emerald-500 text-white')
                                                            : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                                                            } ${busy ? 'opacity-50' : ''}`}
                                                        title={
                                                            isRewatchView
                                                                ? (w ? 'Desmarcar en este rewatch' : 'Marcar en este rewatch')
                                                                : (w ? 'Quitar de vistos' : 'Marcar como visto')
                                                        }
                                                    >
                                                        {busy ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : isRewatchView ? (
                                                            w ? <EyeOff className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />
                                                        ) : (
                                                            en
                                                        )}
                                                    </button>
                                                )
                                            })}

                                            {hasMore && (
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedSeason((p) => ({ ...p, [sn]: true }))}
                                                    className="px-3 h-9 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-black text-zinc-300 hover:text-white"
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

                {/* ===== Modal: Historial completo ===== */}
                <AnimatePresence>
                    {playsHistoryOpen && (
                        <motion.div
                            className="absolute inset-0 z-[210] flex items-center justify-center p-4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setPlaysHistoryOpen(false)}
                        >
                            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                                transition={{ duration: 0.18 }}
                                onClick={(e) => e.stopPropagation()}
                                className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0b0b0b] shadow-2xl overflow-hidden"
                            >
                                <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-black text-white">Historial de visionados</h3>
                                        <p className="text-xs text-zinc-400 mt-1">
                                            Todos los plays registrados para esta serie ({normalizedPlays.length}).
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setPlaysHistoryOpen(false)}
                                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="p-5 space-y-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                        <input
                                            value={playsHistoryQuery}
                                            onChange={(e) => {
                                                setPlaysHistoryQuery(e.target.value)
                                                setPlaysHistoryLimit(60)
                                            }}
                                            placeholder="Buscar por fecha/hora..."
                                            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition"
                                        />
                                    </div>

                                    <div className="max-h-[55vh] overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                        {visiblePlaysHistory.length === 0 ? (
                                            <div className="text-center py-10 text-zinc-500 text-sm">No hay resultados.</div>
                                        ) : (
                                            visiblePlaysHistory.map((p, idx) => (
                                                <div
                                                    key={`${p.watched_at}-${idx}`}
                                                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-extrabold text-white truncate">{formatDate(p.watched_at)}</div>
                                                        <div className="text-xs text-zinc-400 mt-0.5">{formatDateTime(p.watched_at)}</div>
                                                    </div>

                                                    {hasCreateRunHandler && (
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                await createRunNow(p.watched_at)
                                                                setPlaysHistoryOpen(false)
                                                            }}
                                                            className="shrink-0 px-3 py-2 rounded-xl border text-xs font-black bg-purple-500/10 border-purple-500/20 text-purple-200 hover:bg-purple-500/15 transition"
                                                            title="Crear rewatch desde este play"
                                                        >
                                                            <span className="inline-flex items-center gap-2">
                                                                <RotateCcw className="w-4 h-4" />
                                                                Rewatch aquí
                                                            </span>
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        )}

                                        {visiblePlaysHistory.length < filteredPlaysHistory.length && (
                                            <button
                                                type="button"
                                                onClick={() => setPlaysHistoryLimit((n) => n + 60)}
                                                className="w-full mt-2 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-sm transition"
                                            >
                                                Mostrar más ({filteredPlaysHistory.length - visiblePlaysHistory.length})
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ===== Modal: Añadir visionado ===== */}
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
                                        <p className="text-xs text-zinc-400 mt-1">Añade otro visionado completo (play) o crea un rewatch.</p>
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
                                            Fecha del visionado completo (play)
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
                                                    className={`px-3 py-2 rounded-xl border text-xs font-black transition
                            ${playsPreset === opt.id
                                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                                            : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                                                        }
                            ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                    title={opt.id === 'release_date' && !showReleaseDate ? 'Falta showReleaseDate' : undefined}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>

                                        {playsPreset === 'other_date' && (
                                            <div className="mt-3">
                                                <label className="block text-[11px] font-bold text-zinc-500 mb-2">Elige fecha y hora</label>
                                                <input
                                                    type="datetime-local"
                                                    value={playsOtherValue}
                                                    onChange={(e) => setPlaysOtherValue(e.target.value)}
                                                    disabled={playsBusy}
                                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500/50 outline-none transition"
                                                />
                                                <p className="mt-2 text-[11px] text-zinc-500">
                                                    Si eliges una fecha anterior, tu backend debe crear el play correctamente.
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
                                            Añadir play
                                        </button>

                                        <button
                                            type="button"
                                            disabled={playsBusy}
                                            onClick={() => createRunNow(null)}
                                            className="py-3 rounded-2xl bg-purple-500/10 hover:bg-purple-500/15 border border-purple-500/20 text-white font-black text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                                            title="Crea un nuevo rewatch run y actívalo"
                                        >
                                            {playsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                            Empezar rewatch
                                        </button>
                                    </div>

                                    <div className="text-[11px] text-zinc-500 leading-relaxed">
                                        <span className="text-zinc-300 font-semibold">Nota:</span> Para rewatch con “marcar/desmarcar”, pasa{' '}
                                        <span className="text-zinc-300 font-semibold">onToggleEpisodeRewatch</span> desde el padre.
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