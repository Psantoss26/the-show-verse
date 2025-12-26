'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Check, Eye, EyeOff, Loader2, X, Search } from 'lucide-react'

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

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

const seasonLabel = (sn, name) => {
    if (name) return name
    return sn === 0 ? 'Especiales' : `Temporada ${sn}`
}

const MAX_EPISODES_RENDER = 120 // para temporadas raras enormes (Especiales). Puedes subirlo.

export default function TraktEpisodesWatchedModal({
    open,
    onClose,
    tmdbId,
    title,
    connected,
    seasons = [],
    watchedBySeason = {}, // { [seasonNumber]: [episodeNumber...] }
    busyKey = '', // "S1E3"
    onToggleEpisodeWatched // (seasonNumber, episodeNumber) => void
}) {
    // ===== Hooks SIEMPRE arriba (evita error Rules of Hooks) =====
    const [activeSeason, setActiveSeason] = useState(null)
    const [onlyUnwatched, setOnlyUnwatched] = useState(false)
    const [viewMode, setViewMode] = useState('list') // 'list' | 'table'
    const [query, setQuery] = useState('')
    const [expandedSeason, setExpandedSeason] = useState({}) // { [sn]: true }

    // cache por temporada (TMDb season details) para vista LISTA
    const [seasonCache, setSeasonCache] = useState({}) // { [sn]: { loading, error, episodes } }

    const panelRef = useRef(null)

    const usableSeasons = useMemo(() => {
        const list = Array.isArray(seasons) ? seasons : []
        return [...list]
            .filter((s) => s && typeof s.season_number === 'number')
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

    // Default season al abrir
    useEffect(() => {
        if (!open) return
        const first =
            usableSeasons.find((s) => (s?.season_number ?? 0) >= 1) || usableSeasons[0] || null
        setActiveSeason(first?.season_number ?? null)
        setOnlyUnwatched(false)
        setViewMode('list')
        setQuery('')
    }, [open, usableSeasons])

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
        if (seasonCache?.[sn]?.episodes) return
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

    // Cargar season details SOLO en vista LISTA (para títulos/fechas/overview)
    useEffect(() => {
        if (!open) return
        if (viewMode !== 'list') return
        if (activeSeason == null) return
        loadSeason(activeSeason)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, viewMode, activeSeason, tmdbId])

    // ===== Derivados vista LISTA =====
    const active = useMemo(
        () => usableSeasons.find((s) => s?.season_number === activeSeason) || null,
        [usableSeasons, activeSeason]
    )

    const activeSn = active?.season_number ?? null
    const cache = activeSn != null ? seasonCache?.[activeSn] : null
    const loading = !!cache?.loading
    const error = cache?.error || ''
    const episodes = Array.isArray(cache?.episodes) ? cache.episodes : []

    const watchedSet = useMemo(() => {
        return new Set(watchedBySeason?.[activeSn] || [])
    }, [watchedBySeason, activeSn])

    const filteredEpisodes = useMemo(() => {
        const q = (query || '').trim().toLowerCase()
        const base = onlyUnwatched ? episodes.filter((ep) => !watchedSet.has(ep.episode_number)) : episodes
        if (!q) return base

        return base.filter((ep) => {
            const n = String(ep?.episode_number || '')
            const name = String(ep?.name || '').toLowerCase()
            const ov = String(ep?.overview || '').toLowerCase()
            return name.includes(q) || ov.includes(q) || n === q
        })
    }, [episodes, onlyUnwatched, watchedSet, query])

    // ===== Derivados vista TABLA =====
    const seasonsFilteredForTable = useMemo(() => {
        const q = (query || '').trim().toLowerCase()
        if (!q) return usableSeasons
        return usableSeasons.filter((s) => {
            const sn = s?.season_number
            const name = seasonLabel(sn, s?.name).toLowerCase()
            return name.includes(q) || String(sn) === q
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

    // ===== Render (ojo: return null AL FINAL, después de hooks) =====
    if (!open) return null

    return (
        <div className="fixed inset-0 z-[10050]">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            <div className="absolute inset-0 flex items-center justify-center p-4">
                <motion.div
                    ref={panelRef}
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 14, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="w-full max-w-6xl rounded-3xl border border-white/10 bg-[#0f0f0f]/95 shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h3 className="text-2xl font-extrabold text-white truncate">Episodios vistos</h3>
                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                                <p className="text-sm text-zinc-400 truncate">
                                    {title || 'Serie'} · marca episodios uno a uno en Trakt
                                </p>

                                {Number.isFinite(totals.totalEpisodes) && totals.totalEpisodes > 0 && (
                                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-200">
                                        {totals.watchedEpisodes} / {totals.totalEpisodes} vistos
                                    </span>
                                )}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 w-11 h-11 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center"
                            title="Cerrar"
                        >
                            <X className="w-5 h-5 text-zinc-200" />
                        </button>
                    </div>

                    {/* Toolbar */}
                    <div className="px-6 py-4 border-b border-white/10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('list')}
                                    className={`px-3 py-1.5 rounded-xl text-sm font-bold transition ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5'
                                        }`}
                                >
                                    Lista
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    className={`px-3 py-1.5 rounded-xl text-sm font-bold transition ${viewMode === 'table' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5'
                                        }`}
                                >
                                    Tabla
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setOnlyUnwatched((v) => !v)}
                                className={`px-3 py-1.5 rounded-2xl border text-sm font-bold transition ${onlyUnwatched
                                    ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-200'
                                    : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10'
                                    }`}
                                title="Filtrar"
                            >
                                {onlyUnwatched ? 'Solo no vistos' : 'Todos'}
                            </button>
                        </div>

                        <div className="relative w-full md:w-[340px]">
                            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={viewMode === 'list' ? 'Buscar episodio…' : 'Buscar temporada…'}
                                className="w-full rounded-2xl bg-black/40 border border-white/10 pl-9 pr-3 py-2 text-sm text-zinc-200 outline-none
                           focus:ring-2 focus:ring-emerald-500/25"
                            />
                        </div>
                    </div>

                    {/* Body */}
                    {!connected ? (
                        <div className="p-6">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                                <div className="text-white font-bold">Trakt no está conectado</div>
                                <div className="text-sm text-zinc-400 mt-1">
                                    Conecta Trakt para marcar episodios vistos.
                                </div>
                                <Link
                                    href="/trakt"
                                    className="inline-flex mt-4 items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20 transition text-sm font-semibold"
                                >
                                    Ir a Trakt
                                </Link>
                            </div>
                        </div>
                    ) : viewMode === 'list' ? (
                        // =========================
                        // VISTA LISTA (como la tuya)
                        // =========================
                        <div className="p-5 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
                            {/* Left: seasons */}
                            <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                                    <div className="text-xs font-bold tracking-wider uppercase text-zinc-400">
                                        Temporadas
                                    </div>
                                    <div className="text-xs font-bold px-2 py-1 rounded-full bg-black/30 border border-white/10 text-zinc-200">
                                        {usableSeasons.length}
                                    </div>
                                </div>

                                <div className="max-h-[60vh] overflow-auto sv-scroll">
                                    {usableSeasons.map((s) => {
                                        const sn = s?.season_number
                                        const name = seasonLabel(sn, s?.name)
                                        const epCount = typeof s?.episode_count === 'number' ? s.episode_count : null

                                        const watchedCount = (watchedBySeason?.[sn] || []).length
                                        const isActive = sn === activeSeason

                                        return (
                                            <button
                                                key={sn}
                                                type="button"
                                                onClick={() => setActiveSeason(sn)}
                                                className={`w-full text-left px-4 py-3 border-b border-white/5 transition flex items-center justify-between gap-3
                          ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
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

                            {/* Right: episodes list */}
                            <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                                    <div className="min-w-0">
                                        <div className="text-white font-extrabold truncate">
                                            {active?.name || (activeSn != null ? seasonLabel(activeSn) : '—')}
                                        </div>
                                        <div className="text-xs text-zinc-400 mt-0.5">
                                            Pulsa el ojo para marcar visto/no visto
                                        </div>
                                    </div>

                                    {loading && (
                                        <div className="inline-flex items-center gap-2 text-sm text-zinc-300">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Cargando…
                                        </div>
                                    )}
                                </div>

                                {error ? (
                                    <div className="p-4 text-sm text-red-400">{error}</div>
                                ) : (
                                    <div className="max-h-[60vh] overflow-auto sv-scroll p-3 space-y-2">
                                        {filteredEpisodes.map((ep) => {
                                            const en = ep?.episode_number
                                            const epTitle = ep?.name || `Episodio ${en}`
                                            const watched = watchedSet.has(en)
                                            const key = `S${activeSn}E${en}`
                                            const busy = busyKey === key

                                            return (
                                                <div
                                                    key={en}
                                                    className="rounded-2xl border border-white/10 bg-black/20 hover:bg-black/25 transition p-3 flex items-start gap-3"
                                                >
                                                    <div className="shrink-0 w-9 h-9 rounded-full border border-white/10 bg-white/5 flex items-center justify-center font-extrabold text-zinc-200">
                                                        {en}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-white font-bold truncate">{epTitle}</div>
                                                        {ep?.overview ? (
                                                            <div className="text-xs text-zinc-400 mt-1 line-clamp-2">
                                                                {ep.overview}
                                                            </div>
                                                        ) : null}
                                                        <div className="text-xs text-zinc-500 mt-2">
                                                            {formatDate(ep?.air_date)}
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        disabled={busy || activeSn == null || en == null}
                                                        onClick={() => onToggleEpisodeWatched?.(activeSn, en)}
                                                        className={`shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-2xl border transition
                              ${watched
                                                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20'
                                                                : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10 hover:border-white/15'
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

                                        {!loading && filteredEpisodes.length === 0 && (
                                            <div className="px-2 py-6 text-sm text-zinc-400">
                                                No hay episodios para mostrar con este filtro.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        // =========================
                        // VISTA TABLA (1 temporada = 1 fila con TODOS sus episodios)
                        // =========================
                        <div className="p-5">
                            <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
                                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-white font-extrabold">Tabla por temporadas</div>
                                        <div className="text-xs text-zinc-400 mt-0.5">
                                            Cada fila es una temporada. Pulsa un episodio para marcarlo.
                                        </div>
                                    </div>

                                    <div className="text-xs font-bold px-2.5 py-1 rounded-full bg-black/30 border border-white/10 text-zinc-200">
                                        {totals.watchedEpisodes} / {totals.totalEpisodes}
                                    </div>
                                </div>

                                <div className="max-h-[62vh] overflow-auto sv-scroll">
                                    {/* header “visual” */}
                                    <div className="grid grid-cols-[220px_1fr] gap-3 px-5 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500 border-b border-white/5">
                                        <div>Temporada</div>
                                        <div>Episodios</div>
                                    </div>

                                    <div className="divide-y divide-white/5">
                                        {seasonsFilteredForTable.map((s) => {
                                            const sn = s?.season_number
                                            const name = seasonLabel(sn, s?.name)
                                            const epCount = typeof s?.episode_count === 'number' ? s.episode_count : 0

                                            const watchedArr = watchedBySeason?.[sn] || []
                                            const watchedLocal = new Set(watchedArr)
                                            const watchedCount = watchedArr.length

                                            // aplica filtro "solo no vistos" en tabla:
                                            // si está activo, ocultamos temporadas completamente vistas
                                            if (onlyUnwatched && epCount > 0 && watchedCount >= epCount) {
                                                return null
                                            }

                                            const { nums, hasMore, remaining } = buildEpisodeNumbers(sn, epCount)
                                            const expanded = !!expandedSeason?.[sn]

                                            return (
                                                <div key={sn} className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 px-5 py-4">
                                                    {/* Left */}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <div className="font-extrabold text-white truncate">{name}</div>
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-black/30 border border-white/10 text-zinc-200">
                                                                {watchedCount}/{epCount}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-zinc-500 mt-1">
                                                            {sn === 0 ? 'Especiales' : `S${sn}`} · {epCount} episodios
                                                        </div>
                                                    </div>

                                                    {/* Episodes row (horizontal scroll) */}
                                                    <div className="min-w-0">
                                                        <div className="overflow-x-auto sv-scroll">
                                                            <div className="flex items-center gap-2 min-w-max pr-3 pb-1">
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
                                                                            className={`relative inline-flex items-center justify-center w-10 h-10 rounded-xl border font-extrabold text-sm transition
                                        ${watched
                                                                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20'
                                                                                    : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10 hover:border-white/15'
                                                                                }
                                        ${busy ? 'opacity-70 cursor-not-allowed' : ''}`}
                                                                            title={watched ? `S${sn}E${en} · visto` : `S${sn}E${en} · no visto`}
                                                                        >
                                                                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : en}
                                                                            {/* pequeño “tick” */}
                                                                            {watched && !busy && (
                                                                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow" />
                                                                            )}
                                                                        </button>
                                                                    )
                                                                })}

                                                                {hasMore && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setExpandedSeason((p) => ({ ...p, [sn]: true }))
                                                                        }
                                                                        className="inline-flex items-center justify-center h-10 px-3 rounded-xl border border-white/10 bg-black/30 text-zinc-200 hover:bg-white/10 transition font-bold"
                                                                        title="Mostrar todos los episodios"
                                                                    >
                                                                        +{remaining} más
                                                                    </button>
                                                                )}

                                                                {expanded && epCount > MAX_EPISODES_RENDER && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setExpandedSeason((p) => ({ ...p, [sn]: false }))
                                                                        }
                                                                        className="inline-flex items-center justify-center h-10 px-3 rounded-xl border border-white/10 bg-black/30 text-zinc-200 hover:bg-white/10 transition font-bold"
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
                                            <div className="px-5 py-10 text-sm text-zinc-400">
                                                No hay temporadas que coincidan con la búsqueda.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3 text-xs text-zinc-500 px-1">
                                Tip: si una temporada tiene muchos episodios (p. ej. Especiales), usa “+X más” para renderizar todos.
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    )
}
