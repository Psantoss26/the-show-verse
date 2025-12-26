'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
    CalendarDays,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Film,
    Loader2,
    RotateCcw,
    Search,
    Tv2
} from 'lucide-react'

import { traktAuthStatus, traktGetHistory } from '@/lib/api/traktClient'

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

// ----------------------------
// utils
// ----------------------------
const pad2 = (n) => String(n).padStart(2, '0')

function ymdLocal(date) {
    const d = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(d.getTime())) return null
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatDateHeader(date, mode = 'day') {
    const d = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(d.getTime())) return ''
    if (mode === 'year') return String(d.getFullYear())
    if (mode === 'month') {
        return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(d)
    }
    return new Intl.DateTimeFormat('es-ES', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    }).format(d)
}

function formatWatchedLine(iso) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const dd = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
    const hh = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d)
    return `${dd}, ${hh}`
}

function getItemType(entry) {
    // soporta: entry.type o entry.movie/show
    const t = entry?.type
    if (t === 'movie' || t === 'show') return t
    if (entry?.movie) return 'movie'
    if (entry?.show) return 'show'
    // si tu API devuelve 'movies'/'shows'
    if (t === 'movies') return 'movie'
    if (t === 'shows') return 'show'
    return null
}

function getTitle(entry) {
    // ✅ prioriza español si existe
    return (
        entry?.title_es ||
        entry?.titleEs ||
        entry?.titleES ||
        entry?.title ||
        entry?.movie?.title ||
        entry?.show?.title ||
        entry?.show?.name ||
        entry?.name ||
        'Sin título'
    )
}

function getYear(entry) {
    return entry?.year || entry?.movie?.year || entry?.show?.year || null
}

function getTmdbId(entry) {
    return (
        entry?.tmdbId ||
        entry?.ids?.tmdb ||
        entry?.movie?.ids?.tmdb ||
        entry?.show?.ids?.tmdb ||
        null
    )
}

/**
 * ✅ Ruta de detalles (ajusta si tu app usa otras rutas)
 */
function getDetailsHref(entry) {
    const type = getItemType(entry) // 'movie' | 'show'
    const tmdbId = getTmdbId(entry)
    if (!type || !tmdbId) return null

    const mediaType = type === 'movie' ? 'movie' : 'tv'
    return `/details/${mediaType}/${tmdbId}`
}

function normalizeHistoryResponse(json) {
    // soporta varias formas: {items:[]}, {history:[]}, [] ...
    if (Array.isArray(json)) return { items: json }
    if (Array.isArray(json?.items)) return { items: json.items, meta: json.meta }
    if (Array.isArray(json?.history)) return { items: json.history, meta: json.meta }
    return { items: [], meta: null }
}

async function mapLimit(arr, limit, fn) {
    const out = new Array(arr.length)
    let i = 0
    const workers = Array.from({ length: Math.max(1, limit) }, async () => {
        while (i < arr.length) {
            const idx = i++
            out[idx] = await fn(arr[idx], idx)
        }
    })
    await Promise.all(workers)
    return out
}

// ----------------------------
// TMDb minimal cache (client)
// ----------------------------
const tmdbCache = new Map() // key => { poster_path, backdrop_path, title_es, year }
const tmdbInflight = new Map()

async function fetchTmdbPoster({ type, tmdbId }) {
    const t = type === 'show' ? 'tv' : 'movie'
    const key = `${t}:${tmdbId}`
    if (tmdbCache.has(key)) return tmdbCache.get(key)
    if (tmdbInflight.has(key)) return tmdbInflight.get(key)

    const p = (async () => {
        if (!TMDB_API_KEY || !tmdbId) return null
        try {
            const url = `https://api.themoviedb.org/3/${t}/${encodeURIComponent(
                tmdbId
            )}?api_key=${TMDB_API_KEY}&language=es-ES`
            const res = await fetch(url, { cache: 'no-store' })
            const json = await res.json()
            if (!res.ok) return null

            const title_es = t === 'movie' ? (json?.title || null) : (json?.name || null)
            const date = t === 'movie' ? json?.release_date : json?.first_air_date
            const year = date ? String(date).slice(0, 4) : null

            const out = {
                poster_path: json?.poster_path || null,
                backdrop_path: json?.backdrop_path || null,
                title_es,
                year
            }
            tmdbCache.set(key, out)
            return out
        } catch {
            return null
        } finally {
            tmdbInflight.delete(key)
        }
    })()

    tmdbInflight.set(key, p)
    return p
}

// ----------------------------
// UI atoms
// ----------------------------
function Pill({ children, className = '' }) {
    return (
        <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-zinc-200 ${className}`}
        >
            {children}
        </span>
    )
}

function FancyButton({ children, className = '', ...props }) {
    return (
        <button
            {...props}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5
      hover:bg-white/10 hover:border-white/15 transition text-sm font-semibold text-zinc-200 ${className}`}
        >
            {children}
        </button>
    )
}

function Dropdown({ label, valueLabel, children, className = '' }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return
        const onDown = (e) => {
            if (!ref.current) return
            if (!ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('pointerdown', onDown)
        return () => document.removeEventListener('pointerdown', onDown)
    }, [open])

    return (
        <div ref={ref} className={`relative ${className}`}>
            {label && (
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                    {label}
                </div>
            )}

            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full min-w-[190px] inline-flex items-center justify-between gap-3 px-3 py-2 rounded-xl
          bg-black/35 border border-white/10 hover:bg-black/45 hover:border-white/15 transition"
            >
                <span className="text-sm font-semibold text-zinc-100 truncate">{valueLabel}</span>
                <ChevronDown className={`w-4 h-4 text-zinc-300 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.14, ease: 'easeOut' }}
                        className="absolute left-0 top-full z-[9999] mt-2 w-full rounded-2xl border border-white/10
              bg-[#101010]/95 shadow-2xl overflow-hidden backdrop-blur"
                    >
                        <div className="p-2 space-y-1">{children({ close: () => setOpen(false) })}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function DropdownItem({ active, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full px-3 py-2 rounded-xl text-left text-sm transition flex items-center justify-between
        ${active ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5'}`}
        >
            <span className="font-semibold">{children}</span>
            {active && <span className="text-[10px] text-emerald-300 font-bold">✓</span>}
        </button>
    )
}

// ----------------------------
// Calendar view
// ----------------------------
function buildMonthGrid(year, month /* 0-11 */, weekStartsOn = 1 /* 1=lunes */) {
    const first = new Date(year, month, 1)
    const firstDow = first.getDay() // 0=domingo
    const offset = (firstDow - weekStartsOn + 7) % 7
    const start = new Date(year, month, 1 - offset)

    const weeks = []
    for (let w = 0; w < 6; w++) {
        const week = []
        for (let i = 0; i < 7; i++) {
            const d = new Date(start)
            d.setDate(start.getDate() + w * 7 + i)
            week.push(d)
        }
        weeks.push(week)
    }
    return weeks
}

function CalendarPanel({
    monthDate,
    onPrev,
    onNext,
    countsByDay,
    selectedYmd,
    onSelectYmd
}) {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const weeks = useMemo(() => buildMonthGrid(year, month, 1), [year, month])

    const monthLabel = useMemo(() => {
        return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(monthDate)
    }, [monthDate])

    const dow = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

    return (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center">
                        <CalendarDays className="w-5 h-5 text-yellow-300" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-white font-extrabold truncate capitalize">{monthLabel}</div>
                        <div className="text-xs text-zinc-400">Pulsa un día para filtrar</div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onPrev}
                        className="w-10 h-10 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center"
                        title="Mes anterior"
                    >
                        <ChevronLeft className="w-5 h-5 text-zinc-200" />
                    </button>
                    <button
                        type="button"
                        onClick={onNext}
                        className="w-10 h-10 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center"
                        title="Mes siguiente"
                    >
                        <ChevronRight className="w-5 h-5 text-zinc-200" />
                    </button>
                </div>
            </div>

            <div className="p-3 sm:p-5">
                <div className="grid grid-cols-7 gap-2 text-[11px] font-bold text-zinc-500 mb-2">
                    {dow.map((d) => (
                        <div key={d} className="text-center">{d}</div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                    {weeks.flat().map((d) => {
                        const inMonth = d.getMonth() === month
                        const key = ymdLocal(d)
                        const count = key ? (countsByDay[key] || 0) : 0
                        const selected = key && selectedYmd === key

                        return (
                            <button
                                key={d.toISOString()}
                                type="button"
                                onClick={() => key && onSelectYmd(selected ? null : key)}
                                className={`relative aspect-square rounded-2xl border transition flex flex-col items-center justify-center
                  ${inMonth ? 'bg-black/20' : 'bg-black/10'}
                  ${selected
                                        ? 'border-yellow-500/50 bg-yellow-500/10 shadow-[0_0_18px_rgba(234,179,8,0.15)]'
                                        : 'border-white/10 hover:bg-white/5 hover:border-white/15'
                                    }`}
                                title={key || ''}
                            >
                                <div className={`text-sm font-extrabold ${inMonth ? 'text-zinc-100' : 'text-zinc-500'}`}>
                                    {d.getDate()}
                                </div>

                                {count > 0 && (
                                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full
                    bg-emerald-500/12 border border-emerald-500/25 text-emerald-200">
                                        {count} {count === 1 ? 'visto' : 'vistos'}
                                    </div>
                                )}
                            </button>
                        )
                    })}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs text-zinc-400">
                        {selectedYmd ? (
                            <span>
                                Filtrando por: <span className="text-zinc-200 font-semibold">{selectedYmd}</span>
                            </span>
                        ) : (
                            <span>Sin filtro por día</span>
                        )}
                    </div>

                    {selectedYmd && (
                        <button
                            type="button"
                            onClick={() => onSelectYmd(null)}
                            className="text-xs font-bold uppercase tracking-wider text-yellow-300 hover:text-yellow-200"
                        >
                            Limpiar día
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

// ----------------------------
// History row with poster
// ----------------------------
function Poster({ entry }) {
    const [posterPath, setPosterPath] = useState(entry?.poster_path || entry?.posterPath || null)

    useEffect(() => {
        setPosterPath(entry?.poster_path || entry?.posterPath || null)
    }, [entry?.poster_path, entry?.posterPath])

    useEffect(() => {
        let ignore = false
        const run = async () => {
            if (posterPath) return
            const t = getItemType(entry)
            const id = getTmdbId(entry)
            if (!t || !id) return

            const r = await fetchTmdbPoster({ type: t, tmdbId: id })
            if (ignore) return
            if (r?.poster_path) setPosterPath(r.poster_path)
        }
        run()
        return () => { ignore = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [posterPath, entry])

    const src = posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : '/placeholder-poster.png'

    return (
        <div className="w-14 h-20 sm:w-16 sm:h-24 rounded-2xl overflow-hidden border border-white/10 bg-black/40 shrink-0">
            <img
                src={src}
                alt="poster"
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
            />
        </div>
    )
}

function HistoryItemCard({ entry }) {
    const type = getItemType(entry)
    const title = getTitle(entry)
    const year = getYear(entry)
    const watchedAt = entry?.watched_at || entry?.watchedAt || entry?.watchedAtIso || null

    const href = useMemo(() => getDetailsHref(entry), [entry])

    // contenido visual (lo reutilizamos para Link / fallback)
    const Inner = (
        <div className="w-full text-left flex items-center justify-between gap-4 p-4 sm:p-5 border-t border-white/10
                        hover:bg-white/[0.03] transition focus:outline-none focus:ring-2 focus:ring-yellow-500/30">
            <div className="flex items-center gap-4 min-w-0">
                <Poster entry={entry} />

                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span
                            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-bold border
                            ${type === 'movie'
                                    ? 'bg-sky-500/10 border-sky-500/25 text-sky-200'
                                    : 'bg-violet-500/10 border-violet-500/25 text-violet-200'
                                }`}
                        >
                            {type === 'movie' ? <Film className="w-3.5 h-3.5" /> : <Tv2 className="w-3.5 h-3.5" />}
                            {type === 'movie' ? 'Película' : 'Serie'}
                        </span>

                        <div className="text-white font-extrabold truncate">
                            {title}
                            {year ? <span className="text-zinc-400 font-semibold"> ({year})</span> : null}
                        </div>
                    </div>

                    {watchedAt && (
                        <div className="mt-1 text-xs text-zinc-400">
                            Visto:{' '}
                            <span className="text-zinc-200 font-semibold">
                                {formatWatchedLine(watchedAt)}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className="shrink-0 w-11 h-11 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
                <ChevronRight className="w-5 h-5 text-zinc-300" />
            </div>
        </div>
    )

    // si por algún motivo falta href, no hacemos Link
    if (!href) {
        return <div className="opacity-80">{Inner}</div>
    }

    return (
        <Link href={href} className="block" title={title} prefetch={false}>
            {Inner}
        </Link>
    )
}

// ----------------------------
// Main
// ----------------------------
export default function HistoryClient() {
    const [auth, setAuth] = useState({ loading: true, connected: false })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [raw, setRaw] = useState([])

    // UI
    const [viewMode, setViewMode] = useState('list') // list | calendar
    const [groupBy, setGroupBy] = useState('day') // day | month | year
    const [typeFilter, setTypeFilter] = useState('all') // all | movies | shows
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [q, setQ] = useState('')

    // calendar
    const [monthDate, setMonthDate] = useState(() => {
        const d = new Date()
        d.setDate(1)
        return d
    })
    const [selectedDay, setSelectedDay] = useState(null) // YYYY-MM-DD

    const loadAuth = useCallback(async () => {
        try {
            const st = await traktAuthStatus()
            setAuth({ loading: false, connected: !!st?.connected })
        } catch {
            setAuth({ loading: false, connected: false })
        }
    }, [])

    const loadHistory = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const json = await traktGetHistory({ type: 'all', from: from || undefined, to: to || undefined, page: 1, limit: 200 })
            const { items } = normalizeHistoryResponse(json)

            // sort desc
            const sorted = [...items].sort((a, b) => {
                const ta = new Date(a?.watched_at || a?.watchedAt || 0).getTime()
                const tb = new Date(b?.watched_at || b?.watchedAt || 0).getTime()
                return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
            })

            // ✅ Enriquecer con TMDB (título ES + poster + year) para mostrar y buscar en español
            const enriched = await mapLimit(sorted, 10, async (e) => {
                const t = getItemType(e)
                const id = getTmdbId(e)
                if (!t || !id) return e

                const r = await fetchTmdbPoster({ type: t, tmdbId: id })
                if (!r) return e

                const title_es = e?.title_es || e?.titleEs || r?.title_es || null
                const year = e?.year || r?.year || getYear(e) || null

                return {
                    ...e,
                    title_es,
                    year,
                    poster_path: e?.poster_path || e?.posterPath || r?.poster_path || null,
                    backdrop_path: e?.backdrop_path || e?.backdropPath || r?.backdrop_path || null
                }
            })

            setRaw(enriched)
        } catch (e) {
            setError(e?.message || 'Error cargando historial')
            setRaw([])
        } finally {
            setLoading(false)
        }
    }, [from, to])

    useEffect(() => {
        loadAuth()
    }, [loadAuth])

    useEffect(() => {
        if (!auth.loading && auth.connected) loadHistory()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.loading, auth.connected])

    // derived
    const filtered = useMemo(() => {
        const needle = (q || '').trim().toLowerCase()
        return (raw || []).filter((e) => {
            const t = getItemType(e)
            if (typeFilter === 'movies' && t !== 'movie') return false
            if (typeFilter === 'shows' && t !== 'show') return false

            const watchedAt = e?.watched_at || e?.watchedAt
            const d = watchedAt ? new Date(watchedAt) : null
            if (!d || Number.isNaN(d.getTime())) return false

            // calendar day filter
            if (selectedDay) {
                const key = ymdLocal(d)
                if (key !== selectedDay) return false
            }

            if (needle) {
                const title = getTitle(e).toLowerCase()
                if (!title.includes(needle)) return false
            }
            return true
        })
    }, [raw, q, typeFilter, selectedDay])

    const stats = useMemo(() => {
        const plays = filtered.length
        const uniqSet = new Set()
        let movies = 0
        let shows = 0
        for (const e of filtered) {
            const t = getItemType(e)
            if (t === 'movie') movies++
            if (t === 'show') shows++
            const id = getTmdbId(e) || `${t}:${getTitle(e)}:${getYear(e) || ''}`
            uniqSet.add(String(id))
        }
        return { plays, unique: uniqSet.size, movies, shows }
    }, [filtered])

    const countsByDay = useMemo(() => {
        const m = {}
        for (const e of raw || []) {
            const watchedAt = e?.watched_at || e?.watchedAt
            if (!watchedAt) continue
            const key = ymdLocal(new Date(watchedAt))
            if (!key) continue
            m[key] = (m[key] || 0) + 1
        }
        return m
    }, [raw])

    const grouped = useMemo(() => {
        const map = new Map()
        for (const e of filtered) {
            const watchedAt = e?.watched_at || e?.watchedAt
            const d = new Date(watchedAt)
            if (Number.isNaN(d.getTime())) continue

            let key
            if (groupBy === 'year') key = `${d.getFullYear()}-01-01`
            else if (groupBy === 'month') key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`
            else key = ymdLocal(d)

            if (!key) continue
            if (!map.has(key)) map.set(key, [])
            map.get(key).push(e)
        }

        // sort groups desc
        const keys = Array.from(map.keys()).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        return keys.map((k) => ({ key: k, date: new Date(k), items: map.get(k) || [] }))
    }, [filtered, groupBy])

    // ----------------------------
    // RENDER
    // ----------------------------
    return (
        <div className="min-h-screen bg-[#0b0b0b] text-zinc-100">
            {/* background glow */}
            <div className="pointer-events-none fixed inset-0">
                <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[920px] h-[920px] rounded-full blur-3xl opacity-25 bg-yellow-500/20" />
                <div className="absolute top-40 -left-40 w-[760px] h-[760px] rounded-full blur-3xl opacity-20 bg-emerald-500/15" />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-4 py-8 lg:py-12">
                {/* Header */}
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden">
                    <div className="p-5 sm:p-7">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="min-w-0">
                                <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
                                    Historial · Vistos
                                </h1>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Pill>Plays: <span className="font-extrabold text-white">{stats.plays}</span></Pill>
                                    <Pill>Únicos: <span className="font-extrabold text-white">{stats.unique}</span></Pill>
                                    <Pill>Películas: <span className="font-extrabold text-white">{stats.movies}</span></Pill>
                                    <Pill>Series: <span className="font-extrabold text-white">{stats.shows}</span></Pill>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex rounded-2xl border border-white/10 bg-black/25 p-1">
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('list')}
                                        className={`px-3 py-2 rounded-xl text-sm font-extrabold transition
                      ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                                    >
                                        Lista
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('calendar')}
                                        className={`px-3 py-2 rounded-xl text-sm font-extrabold transition
                      ${viewMode === 'calendar' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                                    >
                                        Calendario
                                    </button>
                                </div>

                                <FancyButton
                                    onClick={() => loadHistory()}
                                    disabled={loading || auth.loading || !auth.connected}
                                    className={`${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                                    title="Actualizar"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                    Actualizar
                                </FancyButton>
                            </div>
                        </div>

                        {/* Not connected */}
                        {!auth.loading && !auth.connected && (
                            <div className="mt-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                                <div className="text-sm text-zinc-200 font-semibold">
                                    No estás conectado a Trakt. Conéctate para ver tu registro por días, meses y años.
                                </div>
                                <a
                                    href="/api/trakt/auth/start"
                                    className="mt-3 inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-yellow-500 text-black hover:brightness-110 transition"
                                    title="Conectar Trakt"
                                >
                                    <img src="/logo-Trakt.png" alt="Trakt" className="h-6 w-auto" />
                                </a>
                            </div>
                        )}

                        {/* Filters */}
                        {auth.connected && (
                            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                    <Dropdown
                                        label="Agrupar por"
                                        valueLabel={groupBy === 'day' ? 'Día' : groupBy === 'month' ? 'Mes' : 'Año'}
                                        className="w-full"
                                    >
                                        {({ close }) => (
                                            <>
                                                <DropdownItem active={groupBy === 'day'} onClick={() => { setGroupBy('day'); close() }}>Día</DropdownItem>
                                                <DropdownItem active={groupBy === 'month'} onClick={() => { setGroupBy('month'); close() }}>Mes</DropdownItem>
                                                <DropdownItem active={groupBy === 'year'} onClick={() => { setGroupBy('year'); close() }}>Año</DropdownItem>
                                            </>
                                        )}
                                    </Dropdown>

                                    <Dropdown
                                        label="Tipo"
                                        valueLabel={typeFilter === 'all' ? 'Todo' : typeFilter === 'movies' ? 'Películas' : 'Series'}
                                        className="w-full"
                                    >
                                        {({ close }) => (
                                            <>
                                                <DropdownItem active={typeFilter === 'all'} onClick={() => { setTypeFilter('all'); close() }}>Todo</DropdownItem>
                                                <DropdownItem active={typeFilter === 'movies'} onClick={() => { setTypeFilter('movies'); close() }}>Películas</DropdownItem>
                                                <DropdownItem active={typeFilter === 'shows'} onClick={() => { setTypeFilter('shows'); close() }}>Series</DropdownItem>
                                            </>
                                        )}
                                    </Dropdown>

                                    <div>
                                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                                            Desde
                                        </div>
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/35 border border-white/10 hover:border-white/15 transition">
                                            <CalendarDays className="w-4 h-4 text-zinc-400" />
                                            <input
                                                type="date"
                                                value={from}
                                                onChange={(e) => setFrom(e.target.value)}
                                                className="w-full bg-transparent outline-none text-sm text-zinc-200"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                                            Hasta
                                        </div>
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/35 border border-white/10 hover:border-white/15 transition">
                                            <CalendarDays className="w-4 h-4 text-zinc-400" />
                                            <input
                                                type="date"
                                                value={to}
                                                onChange={(e) => setTo(e.target.value)}
                                                className="w-full bg-transparent outline-none text-sm text-zinc-200"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/35 border border-white/10 hover:border-white/15 transition">
                                    <Search className="w-4 h-4 text-zinc-400" />
                                    <input
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        placeholder="Buscar por título…"
                                        className="w-full bg-transparent outline-none text-sm text-zinc-200 placeholder:text-zinc-500"
                                    />
                                </div>

                                {/* calendar quick day filter hint */}
                                {viewMode === 'calendar' && (
                                    <div className="mt-3 text-xs text-zinc-500">
                                        Tip: en la vista calendario puedes seleccionar un día para filtrar la lista.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Loading / error */}
                {auth.connected && (
                    <div className="mt-6">
                        {loading && (
                            <div className="text-sm text-zinc-400 inline-flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Cargando historial…
                            </div>
                        )}
                        {!!error && <div className="text-sm text-red-400 mt-2">{error}</div>}
                    </div>
                )}

                {/* Main content */}
                {auth.connected && (
                    <div className="mt-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
                        {/* Calendar */}
                        <AnimatePresence initial={false}>
                            {viewMode === 'calendar' && (
                                <motion.div
                                    key="calendar"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    transition={{ duration: 0.18, ease: 'easeOut' }}
                                    className="xl:col-span-5"
                                >
                                    <CalendarPanel
                                        monthDate={monthDate}
                                        onPrev={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                                        onNext={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                                        countsByDay={countsByDay}
                                        selectedYmd={selectedDay}
                                        onSelectYmd={setSelectedDay}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* List */}
                        <div className={viewMode === 'calendar' ? 'xl:col-span-7' : 'xl:col-span-12'}>
                            {filtered.length === 0 && !loading && (
                                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-zinc-400">
                                    No hay entradas con los filtros actuales.
                                </div>
                            )}

                            <div className="space-y-5">
                                {grouped.map((g) => (
                                    <div
                                        key={g.key}
                                        className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden"
                                    >
                                        <div className="p-4 sm:p-5 flex items-center justify-between gap-3 border-b border-white/10">
                                            <div className="min-w-0">
                                                <div className="text-white font-extrabold capitalize truncate">
                                                    {formatDateHeader(g.date, groupBy)}
                                                </div>
                                                <div className="text-xs text-zinc-500 mt-1">
                                                    {g.items.length} {g.items.length === 1 ? 'entrada' : 'entradas'}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Pill className="hidden sm:inline-flex">
                                                    <Film className="w-3.5 h-3.5" />
                                                    {(g.items || []).filter((x) => getItemType(x) === 'movie').length}
                                                </Pill>
                                                <Pill className="hidden sm:inline-flex">
                                                    <Tv2 className="w-3.5 h-3.5" />
                                                    {(g.items || []).filter((x) => getItemType(x) === 'show').length}
                                                </Pill>
                                            </div>
                                        </div>

                                        <div>
                                            {g.items.map((entry) => (
                                                <HistoryItemCard
                                                    key={entry?.id || `${getItemType(entry)}:${getTmdbId(entry)}:${entry?.watched_at || entry?.watchedAt || Math.random()}`}
                                                    entry={entry}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* little footer */}
                            {filtered.length > 0 && (
                                <div className="mt-6 text-xs text-zinc-500">
                                    Mostrando <span className="text-zinc-200 font-semibold">{filtered.length}</span> entradas (máx. 200 por carga).
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
