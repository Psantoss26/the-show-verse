'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Film,
    Loader2,
    RotateCcw,
    Search,
    Trash2,
    Tv,
    LayoutList,
    LayoutGrid,
    Filter,
    CheckCircle2,
    Eye,
    Layers
} from 'lucide-react'

import { traktAuthStatus, traktGetHistory } from '@/lib/api/traktClient'

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

// ----------------------------
// UTILS
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
    if (Number.isNaN(d.getTime())) return { date: '', time: '' }
    const dd = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
    const hh = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d)
    return { date: dd, time: hh }
}

function getItemType(entry) {
    const t = entry?.type
    if (t === 'movie' || t === 'show') return t
    if (t === 'episode' || t === 'episodes') return 'show'
    if (entry?.movie) return 'movie'
    if (entry?.show) return 'show'
    return null
}

function isEpisodeEntry(entry) {
    const t = entry?.type
    if (t === 'episode' || t === 'episodes') return true
    if (entry?.episode) return true

    // por si tu API lo aplana:
    const s = entry?.season ?? entry?.season_number ?? entry?.seasonNumber
    const e = entry?.number ?? entry?.episode_number ?? entry?.episodeNumber
    return s != null && e != null
}

function getEpisodeMeta(entry) {
    const seasonRaw =
        entry?.episode?.season ??
        entry?.season ??
        entry?.season_number ??
        entry?.seasonNumber

    const episodeRaw =
        entry?.episode?.number ??
        entry?.episode?.episode ?? // por si algún mapeo raro
        entry?.number ??
        entry?.episode_number ??
        entry?.episodeNumber

    if (seasonRaw == null || episodeRaw == null) return null

    const season = Number(seasonRaw)
    const episode = Number(episodeRaw)
    if (!Number.isFinite(season) || !Number.isFinite(episode)) return null

    const title =
        entry?.episode?.title ??
        entry?.episodeTitle ??
        entry?.episode?.name ??
        null

    return { season, episode, title }
}

// IMPORTANTE: si es episodio, prioriza el TMDb de la SERIE (show)
function getTmdbId(entry) {
    if (isEpisodeEntry(entry)) {
        return (
            entry?.tmdbId ||
            entry?.show?.ids?.tmdb ||
            entry?.show?.tmdbId ||
            entry?.show_tmdb_id ||
            entry?.tmdb_show_id ||
            // fallback (por si solo llega el del episodio)
            entry?.ids?.tmdb ||
            entry?.episode?.ids?.tmdb ||
            null
        )
    }

    return (
        entry?.tmdbId ||
        entry?.ids?.tmdb ||
        entry?.movie?.ids?.tmdb ||
        entry?.show?.ids?.tmdb ||
        null
    )
}

// Badge “bonito” (chip) con pad y punto
function formatEpisodeBadge(meta) {
    if (!meta) return null
    return `T${pad2(meta.season)} · E${pad2(meta.episode)}`
}

// ✅ NUEVO: formato para el TÍTULO (sin pad, sin punto)
// Querías: "Juego de tronos T1 E1"
function formatEpisodeInline(meta) {
    if (!meta) return null
    return `T${meta.season} E${meta.episode}`
}

function getMainTitle(entry) {
    return entry?.title_es || entry?.show?.title || entry?.movie?.title || entry?.title || 'Sin título'
}

function getYear(entry) {
    return entry?.year || entry?.movie?.year || entry?.show?.year || null
}

function getHistoryId(entry) {
    return entry?.id || entry?.history_id || null
}

function getDetailsHref(entry) {
    const type = getItemType(entry)
    const tmdbId = getTmdbId(entry)
    if (!type || !tmdbId) return null
    const mediaType = type === 'movie' ? 'movie' : 'tv'
    return `/details/${mediaType}/${tmdbId}`
}

function normalizeHistoryResponse(json) {
    if (Array.isArray(json)) return { items: json }
    if (Array.isArray(json?.items)) return { items: json.items }
    return { items: [] }
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
// TMDb cache
// ----------------------------
const tmdbCache = new Map()
const tmdbInflight = new Map()

async function fetchTmdbPoster({ type, tmdbId }) {
    const t = type === 'show' ? 'tv' : 'movie'
    const key = `${t}:${tmdbId}`
    if (tmdbCache.has(key)) return tmdbCache.get(key)
    if (tmdbInflight.has(key)) return tmdbInflight.get(key)

    const p = (async () => {
        if (!TMDB_API_KEY || !tmdbId) return null
        try {
            const url = `https://api.themoviedb.org/3/${t}/${encodeURIComponent(tmdbId)}?api_key=${TMDB_API_KEY}&language=es-ES`
            const res = await fetch(url)
            const json = await res.json()
            if (!res.ok) return null

            const title_es = t === 'movie' ? json?.title : json?.name
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

async function apiPost(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.message || 'Error')
    return json
}

// ----------------------------
// UI COMPONENTS
// ----------------------------
function StatCard({ label, value, icon: Icon, colorClass = "text-white", loading = false }) {
    return (
        <div className="flex-1 min-w-[120px] bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center gap-1 backdrop-blur-sm transition hover:bg-zinc-900/70">
            <div className={`p-2 rounded-full bg-white/5 mb-1 ${colorClass}`}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
                {loading ? (
                    <span className="inline-block h-7 w-12 rounded-lg bg-white/10 animate-pulse" />
                ) : (
                    value
                )}
            </div>
            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">{label}</div>
        </div>
    )
}

function InlineDropdown({ label, valueLabel, icon: Icon, children }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return
        const onDown = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('pointerdown', onDown)
        return () => document.removeEventListener('pointerdown', onDown)
    }, [open])

    return (
        <div ref={ref} className="relative shrink-0">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="h-11 inline-flex items-center justify-between gap-3 px-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-sm text-zinc-300 min-w-[140px]"
            >
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="w-4 h-4 text-emerald-500" />}
                    <span className="text-zinc-500 font-bold text-xs uppercase tracking-wider">{label}:</span>
                    <span className="font-semibold text-white truncate">{valueLabel}</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                        className="absolute left-0 top-full z-[100] mt-2 w-48 rounded-xl border border-zinc-800 bg-[#121212] shadow-2xl overflow-hidden p-1"
                    >
                        {children({ close: () => setOpen(false) })}
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
            className={`w-full px-3 py-2 rounded-lg text-left text-sm transition flex items-center justify-between
        ${active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
        >
            <span className="font-medium">{children}</span>
            {active && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        </button>
    )
}

// ----------------------------
// Calendar Panel
// ----------------------------
function buildMonthGrid(year, month, weekStartsOn = 1) {
    const first = new Date(year, month, 1)
    const firstDow = first.getDay()
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

function CalendarPanel({ monthDate, onPrev, onNext, countsByDay, selectedYmd, onSelectYmd }) {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const weeks = useMemo(() => buildMonthGrid(year, month, 1), [year, month])
    const monthLabel = useMemo(() => new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(monthDate), [monthDate])
    const dow = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

    return (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-8 backdrop-blur-sm sticky top-6 shadow-xl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h3 className="text-white font-bold capitalize text-2xl tracking-tight">{monthLabel}</h3>
                    <p className="text-sm text-emerald-500/70 mt-1 font-medium">Filtrar por día</p>
                </div>
                <div className="flex gap-2 bg-zinc-800/80 rounded-xl p-1.5 border border-white/5">
                    <button onClick={onPrev} className="p-2 hover:bg-white/10 rounded-lg transition text-zinc-300"><ChevronLeft className="w-5 h-5" /></button>
                    <button onClick={onNext} className="p-2 hover:bg-white/10 rounded-lg transition text-zinc-300"><ChevronRight className="w-5 h-5" /></button>
                </div>
            </div>

            <div className="grid grid-cols-7 gap-3 mb-4">
                {dow.map(d => <div key={d} className="text-center text-xs font-bold text-zinc-500 uppercase tracking-wider">{d}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-3">
                {weeks.flat().map((d) => {
                    const inMonth = d.getMonth() === month
                    const key = ymdLocal(d)
                    const count = key ? (countsByDay[key] || 0) : 0
                    const selected = key && selectedYmd === key
                    const isToday = ymdLocal(new Date()) === key

                    return (
                        <button
                            key={d.toISOString()}
                            onClick={() => key && onSelectYmd(selected ? null : key)}
                            disabled={!inMonth}
                            className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200 text-sm font-bold
                ${!inMonth ? 'opacity-0 pointer-events-none' : 'text-zinc-300'}
                ${selected ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 z-10 scale-110'
                                    : isToday ? 'bg-zinc-800 text-white border border-emerald-500/50'
                                        : 'bg-zinc-900/50 hover:bg-zinc-800 hover:text-white hover:scale-105'}`}
                        >
                            <span>{d.getDate()}</span>
                            {count > 0 && !selected && (
                                <div className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            )}
                        </button>
                    )
                })}
            </div>

            {selectedYmd && (
                <button
                    onClick={() => onSelectYmd(null)}
                    className="mt-8 w-full py-3 text-sm font-bold text-emerald-400 hover:text-emerald-300 flex items-center justify-center gap-2 border-t border-white/5 uppercase tracking-wide transition-colors"
                >
                    <RotateCcw className="w-4 h-4" /> Ver todo el mes
                </button>
            )}
        </div>
    )
}

// ----------------------------
// History Item Component
// ----------------------------
function Poster({ entry, className = "" }) {
    const [posterPath, setPosterPath] = useState(entry?.poster_path || null)
    useEffect(() => { setPosterPath(entry?.poster_path || null) }, [entry?.poster_path])

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
    }, [posterPath, entry])

    const src = posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : null

    return (
        <div className={`overflow-hidden bg-zinc-800 border border-white/5 shrink-0 relative shadow-lg ${className}`}>
            {src ? (
                <img src={src} alt="poster" className="w-full h-full object-cover" loading="lazy" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600"><Film className="w-6 h-6" /></div>
            )}
        </div>
    )
}

// Tarjeta modo LISTA
function HistoryItemCard({ entry, busy, onRemoveFromHistory }) {
    const type = getItemType(entry)

    const epMeta = isEpisodeEntry(entry) ? getEpisodeMeta(entry) : null
    const baseTitle = getMainTitle(entry)
    const inlineEp = (type === 'show' && epMeta) ? formatEpisodeInline(epMeta) : null

    // ✅ AQUÍ está la clave: el título incluye T1 E1
    const title = inlineEp ? `${baseTitle} ${inlineEp}` : baseTitle

    const year = getYear(entry)
    const { time: watchedTime } = formatWatchedLine(entry?.watched_at)
    const href = useMemo(() => getDetailsHref(entry), [entry])
    const historyId = getHistoryId(entry)
    const [confirmDel, setConfirmDel] = useState(false)

    const handleDeleteClick = (e) => { e.preventDefault(); e.stopPropagation(); setConfirmDel(true) }
    const handleConfirm = async (e) => { e.preventDefault(); e.stopPropagation(); await onRemoveFromHistory?.(entry, { historyId }) }
    const handleCancel = (e) => { e.preventDefault(); e.stopPropagation(); setConfirmDel(false) }

    const Content = (
        <div className={`relative flex items-center gap-4 p-3 pr-12 transition-all ${busy ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
            <Poster entry={entry} className="w-[60px] aspect-[2/3] rounded-md" />
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                <div className="flex items-center gap-2">
                    <h4 className="text-white font-bold text-sm leading-tight truncate">{title}</h4>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span className={`font-bold uppercase tracking-wider text-[9px] px-1 rounded-sm ${type === 'movie' ? 'bg-sky-500/10 text-sky-500' : 'bg-purple-500/10 text-purple-500'}`}>
                        {type === 'movie' ? 'PELÍCULA' : 'SERIE'}
                    </span>
                    <span>•</span>

                    {/* Para series: si hay título de episodio, lo mostramos; si no, el año */}
                    <span className="truncate max-w-[260px]">
                        {type === 'show' && epMeta?.title ? epMeta.title : year}
                    </span>
                </div>

                <div className="text-[11px] text-zinc-600 flex items-center gap-1.5 mt-0.5 font-mono">
                    <RotateCcw className="w-3 h-3" /> {watchedTime}
                </div>
            </div>

            {!confirmDel && (
                <button
                    onClick={handleDeleteClick}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors z-10 opacity-0 group-hover:opacity-100"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            )}

            <AnimatePresence>
                {confirmDel && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/95 z-20 flex items-center justify-end px-4 gap-3 rounded-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <span className="text-red-200 text-xs font-medium mr-auto">¿Eliminar?</span>
                        <button onClick={handleCancel} className="text-zinc-400 hover:text-white text-xs font-bold">Cancelar</button>
                        <button onClick={handleConfirm} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-2">
                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Borrar
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )

    if (!href) return <div className="bg-zinc-900/30 border border-white/5 rounded-xl">{Content}</div>
    return (
        <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Link href={href} className="block bg-zinc-900/30 border border-white/5 rounded-xl hover:border-emerald-500/30 hover:bg-zinc-900/60 transition-colors group overflow-hidden">
                {Content}
            </Link>
        </motion.div>
    )
}

// Tarjeta modo GRID
function HistoryGridCard({ entry, busy, onRemoveFromHistory }) {
    const type = getItemType(entry)

    const epMeta = isEpisodeEntry(entry) ? getEpisodeMeta(entry) : null
    const baseTitle = getMainTitle(entry)
    const inlineEp = (type === 'show' && epMeta) ? formatEpisodeInline(epMeta) : null

    // ✅ título incluye T1 E1
    const title = inlineEp ? `${baseTitle} ${inlineEp}` : baseTitle

    const { time: watchedTime } = formatWatchedLine(entry?.watched_at)
    const href = useMemo(() => getDetailsHref(entry), [entry])
    const historyId = getHistoryId(entry)
    const [confirmDel, setConfirmDel] = useState(false)

    const handleDeleteClick = (e) => { e.preventDefault(); e.stopPropagation(); setConfirmDel(true) }
    const handleConfirm = async (e) => { e.preventDefault(); e.stopPropagation(); await onRemoveFromHistory?.(entry, { historyId }) }
    const handleCancel = (e) => { e.preventDefault(); e.stopPropagation(); setConfirmDel(false) }

    // (opcional) chip con formato bonito si lo quieres en grid también
    const epBadge = (type === 'show' && epMeta) ? formatEpisodeBadge(epMeta) : null

    const CardInner = (
        <div className="relative aspect-[2/3] group rounded-xl overflow-hidden bg-zinc-900 border border-white/5 shadow-md hover:shadow-emerald-900/20 transition-all">
            <Poster entry={entry} className="w-full h-full" />

            <div className={`absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 ${confirmDel ? 'opacity-0 pointer-events-none' : ''}`}>
                <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${type === 'movie' ? 'bg-sky-500/20 text-sky-300' : 'bg-purple-500/20 text-purple-300'}`}>
                            {type === 'movie' ? 'Cine' : 'TV'}
                        </span>
                        <span className="text-[10px] text-zinc-400">{watchedTime}</span>
                    </div>

                    {/* ✅ aquí ya sale "Juego de tronos T1 E1" */}
                    <h5 className="text-white font-bold text-xs leading-tight line-clamp-2">{title}</h5>

                    {/* opcional: si quieres dejar el chip extra */}
                    {epBadge && <span className="text-[10px] text-zinc-400">{epBadge}</span>}
                </div>

                <button onClick={handleDeleteClick} className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-red-600 text-white rounded-full transition-colors backdrop-blur-sm">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            <AnimatePresence>
                {confirmDel && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/95 z-20 flex flex-col items-center justify-center p-4 text-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-red-200 text-xs font-bold mb-3">¿Borrar?</p>
                        <div className="flex gap-2 w-full">
                            <button onClick={handleCancel} className="flex-1 py-1.5 rounded bg-zinc-800 text-zinc-300 text-xs font-bold">No</button>
                            <button onClick={handleConfirm} className="flex-1 py-1.5 rounded bg-red-600 text-white text-xs font-bold flex items-center justify-center">
                                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sí'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )

    if (!href) return <div>{CardInner}</div>
    return <Link href={href} className="block">{CardInner}</Link>
}

// ----------------------------
// MAIN PAGE
// ----------------------------
export default function HistoryClient() {
    const [auth, setAuth] = useState({ loading: true, connected: false })
    const [loading, setLoading] = useState(false)
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const [raw, setRaw] = useState([])
    const [mutatingId, setMutatingId] = useState('')

    // UI States
    const [viewMode, setViewMode] = useState('list') // 'list' | 'grid'
    const [groupBy, setGroupBy] = useState('day')
    const [typeFilter, setTypeFilter] = useState('all')
    const [q, setQ] = useState('')
    const [monthDate, setMonthDate] = useState(() => { const d = new Date(); d.setDate(1); return d })
    const [selectedDay, setSelectedDay] = useState(null)
    const [isMobile, setIsMobile] = useState(false)
    const [filtersOpen, setFiltersOpen] = useState(true)

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1024px)')
        const apply = () => { setIsMobile(!!mq.matches); setFiltersOpen(!mq.matches) }
        apply()
        mq.addEventListener?.('change', apply)
        return () => mq.removeEventListener?.('change', apply)
    }, [])

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
        try {
            const json = await traktGetHistory({ type: 'all', page: 1, limit: 200 })
            const { items } = normalizeHistoryResponse(json)
            const sorted = [...items].sort((a, b) => new Date(b?.watched_at) - new Date(a?.watched_at))

            const enriched = await mapLimit(sorted, 10, async (e) => {
                const t = getItemType(e)
                const id = getTmdbId(e)
                if (!t || !id) return e
                const r = await fetchTmdbPoster({ type: t, tmdbId: id })
                if (!r) return e
                return { ...e, title_es: r?.title_es || null, year: r?.year || getYear(e), poster_path: r?.poster_path || null }
            })

            setRaw(enriched)
        } catch {
            setRaw([])
        } finally {
            setLoading(false)
            setHistoryLoaded(true)
        }
    }, [])

    useEffect(() => { loadAuth() }, [loadAuth])
    useLayoutEffect(() => {
        if (!auth.loading && auth.connected) loadHistory()
    }, [auth.loading, auth.connected, loadHistory])

    const removeFromHistory = useCallback(async (_entry, { historyId }) => {
        if (!historyId) return
        setMutatingId(`del:${historyId}`)
        try {
            await apiPost('/api/trakt/history/remove', { ids: [historyId] })
            setRaw((prev) => (prev || []).filter((x) => String(getHistoryId(x)) !== String(historyId)))
        } catch {
            // noop
        } finally {
            setMutatingId('')
        }
    }, [])

    const filtered = useMemo(() => {
        const needle = (q || '').trim().toLowerCase()
        return (raw || []).filter((e) => {
            const t = getItemType(e)
            if (typeFilter === 'movies' && t !== 'movie') return false
            if (typeFilter === 'shows' && t !== 'show') return false
            const d = new Date(e?.watched_at)
            if (Number.isNaN(d.getTime())) return false
            if (selectedDay && ymdLocal(d) !== selectedDay) return false
            if (needle) {
                const title = (getMainTitle(e) || '').toLowerCase()
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
            const id = getTmdbId(e) || `${t}:${getMainTitle(e)}`
            uniqSet.add(String(id))
        }
        return { plays, unique: uniqSet.size, movies, shows }
    }, [filtered])

    const countsByDay = useMemo(() => {
        const m = {}
        for (const e of raw || []) {
            const w = e?.watched_at
            if (!w) continue
            const k = ymdLocal(new Date(w))
            if (!k) continue
            m[k] = (m[k] || 0) + 1
        }
        return m
    }, [raw])

    const grouped = useMemo(() => {
        const map = new Map()
        for (const e of filtered) {
            const d = new Date(e?.watched_at)
            if (Number.isNaN(d.getTime())) continue
            let key
            if (groupBy === 'year') key = `${d.getFullYear()}-01-01`
            else if (groupBy === 'month') key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`
            else key = ymdLocal(d)
            if (!key) continue
            if (!map.has(key)) map.set(key, [])
            map.get(key).push(e)
        }
        const keys = Array.from(map.keys()).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        return keys.map((k) => ({ key: k, date: new Date(k), items: map.get(k) || [] }))
    }, [filtered, groupBy])

    if (auth.loading) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-emerald-500/30">
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-sky-500/5 rounded-full blur-[150px]" />
            </div>

            <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">

                {/* Header */}
                <header className="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                    <Eye className="w-6 h-6 text-emerald-500" />
                                </div>
                                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                                    Historial
                                </h1>
                            </div>
                            <p className="text-zinc-400 text-sm ml-12">Tu registro completo de visualizaciones en Trakt.</p>
                        </div>

                        {auth.connected && (
                            <button
                                onClick={() => loadHistory()}
                                disabled={loading}
                                className="flex items-center gap-2 px-5 py-2.5 bg-white text-black hover:bg-zinc-200 rounded-full text-sm font-bold transition disabled:opacity-50 shadow-lg shadow-white/5"
                            >
                                <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                {loading ? 'Sincronizando...' : 'Sincronizar'}
                            </button>
                        )}
                    </div>

                    {auth.connected && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard label="Total Vistos" value={stats.plays} loading={!historyLoaded} icon={CheckCircle2} colorClass="text-emerald-400 bg-emerald-500/10" />
                            <StatCard label="Títulos Únicos" value={stats.unique} loading={!historyLoaded} icon={LayoutList} colorClass="text-purple-400 bg-purple-500/10" />
                            <StatCard label="Películas" value={stats.movies} loading={!historyLoaded} icon={Film} colorClass="text-sky-400 bg-sky-500/10" />
                            <StatCard label="Episodios" value={stats.shows} loading={!historyLoaded} icon={Tv} colorClass="text-pink-400 bg-pink-500/10" />
                        </div>
                    )}
                </header>

                {/* Layout Principal */}
                <div className={`grid grid-cols-1 ${auth.connected ? 'xl:grid-cols-[1fr_380px]' : 'lg:grid-cols-1'} gap-8 items-start`}>

                    {/* Izquierda */}
                    <div className="space-y-6 min-w-0">
                        {auth.connected && (
                            <div className="flex flex-col xl:flex-row gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        placeholder="Buscar..."
                                        className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-zinc-600"
                                    />
                                </div>

                                <div className="flex flex-wrap gap-4 items-center">
                                    <InlineDropdown label="Agrupar" valueLabel={groupBy === 'day' ? 'Día' : groupBy === 'month' ? 'Mes' : 'Año'} icon={Layers}>
                                        {({ close }) => (
                                            <>
                                                <DropdownItem active={groupBy === 'day'} onClick={() => { setGroupBy('day'); close() }}>Día</DropdownItem>
                                                <DropdownItem active={groupBy === 'month'} onClick={() => { setGroupBy('month'); close() }}>Mes</DropdownItem>
                                                <DropdownItem active={groupBy === 'year'} onClick={() => { setGroupBy('year'); close() }}>Año</DropdownItem>
                                            </>
                                        )}
                                    </InlineDropdown>

                                    <InlineDropdown label="Tipo" valueLabel={typeFilter === 'all' ? 'Todo' : typeFilter === 'movies' ? 'Películas' : 'Series'} icon={Filter}>
                                        {({ close }) => (
                                            <>
                                                <DropdownItem active={typeFilter === 'all'} onClick={() => { setTypeFilter('all'); close() }}>Todo</DropdownItem>
                                                <DropdownItem active={typeFilter === 'movies'} onClick={() => { setTypeFilter('movies'); close() }}>Películas</DropdownItem>
                                                <DropdownItem active={typeFilter === 'shows'} onClick={() => { setTypeFilter('shows'); close() }}>Series</DropdownItem>
                                            </>
                                        )}
                                    </InlineDropdown>

                                    <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center">
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`px-4 h-full rounded-lg text-sm font-bold transition flex items-center gap-2 ${viewMode === 'list' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                                        >
                                            <LayoutList className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setViewMode('grid')}
                                            className={`px-4 h-full rounded-lg text-sm font-bold transition flex items-center gap-2 ${viewMode === 'grid' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                                        >
                                            <LayoutGrid className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!auth.connected ? (
                            <div className="flex flex-col items-center justify-center py-24 bg-zinc-900/20 border border-white/5 rounded-3xl text-center px-4 border-dashed">
                                <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-900/30 mb-6">
                                    <img src="/logo-Trakt.png" alt="" className="w-10 h-10 brightness-0 invert" />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">Conecta tu cuenta de Trakt</h2>
                                <p className="text-zinc-400 max-w-sm mb-8 text-sm">Para ver tu historial de visualizaciones sincronizado, necesitas iniciar sesión.</p>
                                <button
                                    onClick={() => window.location.assign('/api/trakt/auth/start?next=/history')}
                                    className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition shadow-lg shadow-white/10"
                                >
                                    Conectar ahora
                                </button>
                            </div>
                        ) : (historyLoaded && filtered.length === 0 && !loading) ? (
                            <div className="py-24 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20">
                                <LayoutList className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
                                <p className="text-zinc-500 font-medium">No se encontraron resultados.</p>
                                {q && <button onClick={() => setQ('')} className="mt-4 text-emerald-500 text-sm font-bold hover:underline">Limpiar búsqueda</button>}
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {grouped.map((g) => (
                                    <div key={g.key} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="flex items-center gap-4 mb-4">
                                            <h3 className="text-lg font-bold text-white capitalize">{formatDateHeader(g.date, groupBy)}</h3>
                                            <div className="h-px bg-zinc-800 flex-1" />
                                            <span className="text-[10px] font-bold text-zinc-500 bg-zinc-900 px-2 py-1 rounded-md border border-zinc-800">{g.items.length} vistos</span>
                                        </div>

                                        {viewMode === 'grid' ? (
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                                {g.items.map((entry) => (
                                                    <HistoryGridCard
                                                        key={getHistoryId(entry) || `${getTmdbId(entry)}:${entry?.watched_at}:${Math.random()}`}
                                                        entry={entry}
                                                        busy={mutatingId === `del:${getHistoryId(entry)}`}
                                                        onRemoveFromHistory={removeFromHistory}
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {g.items.map((entry) => (
                                                    <HistoryItemCard
                                                        key={getHistoryId(entry) || `${getTmdbId(entry)}:${entry?.watched_at}:${Math.random()}`}
                                                        entry={entry}
                                                        busy={mutatingId === `del:${getHistoryId(entry)}`}
                                                        onRemoveFromHistory={removeFromHistory}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Derecha: Calendario (Solo visible en desktop) */}
                    {auth.connected && (
                        <div className="hidden xl:block space-y-6 sticky top-6">
                            <CalendarPanel
                                monthDate={monthDate}
                                onPrev={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                                onNext={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                                countsByDay={countsByDay}
                                selectedYmd={selectedDay}
                                onSelectYmd={setSelectedDay}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
