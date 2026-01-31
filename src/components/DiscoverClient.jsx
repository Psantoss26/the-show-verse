'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import {
    SlidersHorizontal,
    Loader2,
    FilmIcon,
    TvIcon,
    RotateCcw,
    ChevronDown,
    X,
    Check,
    Search as SearchIcon,
    Calendar,
    Star,
    Clock
} from 'lucide-react'

/* =========================
   Helpers & Hooks
========================= */
const TMDB = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'
const REGION = 'ES'
const LANG = 'es-ES'

// Hook Debounce para evitar llamadas excesivas
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value)
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value) }, delay)
        return () => clearTimeout(handler)
    }, [value, delay])
    return debouncedValue
}

function formatDateDMY(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return ''
    const [y, m, d] = dateStr.split('-')
    if (!y || !m || !d) return ''
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

async function tmdbFetch(path, params = {}, signal) {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
    if (!apiKey) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY')

    const usp = new URLSearchParams({
        api_key: apiKey,
        language: LANG,
        ...Object.fromEntries(
            Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
        ),
    })

    const r = await fetch(`${TMDB}${path}?${usp.toString()}`, { signal })
    if (!r.ok) {
        const txt = await r.text().catch(() => '')
        throw new Error(`TMDb error ${r.status}: ${txt || 'request failed'}`)
    }
    return r.json()
}

function posterSrc(item) {
    const p = item?.poster_path || item?.backdrop_path
    return p ? `${IMG}/w500${p}` : '/placeholder-poster.png'
}

function isAbortError(e) {
    return (
        e?.name === 'AbortError' ||
        e?.code === 20 ||
        String(e?.message || '').toLowerCase().includes('aborted')
    )
}

/* =========================
   UI Components
========================= */

function Section({ title, right, children, defaultOpen = false, overflowVisible = false }) {
    const [open, setOpen] = useState(!!defaultOpen)
    useEffect(() => { setOpen(!!defaultOpen) }, [defaultOpen])

    return (
        <details
            open={open}
            onToggle={(e) => setOpen(e.currentTarget.open)}
            className={[
                'group border-b border-white/5 last:border-0',
                overflowVisible ? 'overflow-visible' : 'overflow-hidden',
            ].join(' ')}
        >
            <summary className="cursor-pointer select-none py-4 flex items-center justify-between hover:text-white transition-colors text-zinc-300">
                <div className="font-semibold text-sm tracking-wide">{title}</div>
                <div className="flex items-center gap-2">
                    {right}
                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${open ? 'rotate-180 text-white' : 'text-zinc-500'}`} />
                </div>
            </summary>
            <div className="pb-6 pt-1 animate-in slide-in-from-top-2 duration-200">
                {children}
            </div>
        </details>
    )
}

function Chip({ active, children, onClick, className = '' }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border
        ${active
                    ? 'bg-orange-500 text-black border-orange-500 font-bold shadow-[0_0_10px_rgba(249,115,22,0.3)]'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                } ${className}`}
        >
            {children}
        </button>
    )
}

function RadioRow({ name, value, checked, onChange, children, disabled = false }) {
    return (
        <label className={`flex items-center gap-3 py-2 cursor-pointer group ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors
                ${checked ? 'border-orange-500' : 'border-zinc-600 group-hover:border-zinc-400'}`}>
                {checked && <div className="w-2 h-2 rounded-full bg-orange-500" />}
            </div>
            <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                onChange={() => !disabled && onChange(value)}
                disabled={disabled}
                className="hidden"
            />
            <span className={`text-sm transition-colors ${checked ? 'text-white font-medium' : 'text-zinc-400 group-hover:text-zinc-300'}`}>
                {children}
            </span>
        </label>
    )
}

function DualRange({ min, max, valueMin, valueMax, onChange, step = 1, label }) {
    const [a, setA] = useState(valueMin)
    const [b, setB] = useState(valueMax)

    useEffect(() => {
        setA(valueMin)
        setB(valueMax)
    }, [valueMin, valueMax])

    const minVal = Math.min(a, b)
    const maxVal = Math.max(a, b)
    const minPercent = ((minVal - min) / (max - min)) * 100
    const maxPercent = ((maxVal - min) / (max - min)) * 100

    const commit = (valA, valB) => {
        const sorted = [valA, valB].sort((x, y) => x - y)
        onChange(sorted)
    }

    return (
        <div className="mt-1 group">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-3 font-medium group-hover:text-zinc-400 transition-colors">
                <span>{label}</span>
                <span className="font-mono text-orange-500 font-bold tracking-tight">
                    {minVal} - {maxVal}
                </span>
            </div>

            <div className="relative h-5 w-full">
                {/* Track Fondo */}
                <div className="absolute top-1/2 left-0 w-full h-1 bg-zinc-800 rounded-full -translate-y-1/2" />

                {/* Track Activo */}
                <div
                    className="absolute top-1/2 h-1 bg-orange-500 rounded-full -translate-y-1/2 transition-all duration-75"
                    style={{ left: `${minPercent}%`, width: `${maxPercent - minPercent}%` }}
                />

                {/* Input A */}
                <input
                    type="range"
                    min={min} max={max} step={step}
                    value={a}
                    onChange={(e) => {
                        const v = Number(e.target.value)
                        setA(v)
                        commit(v, b)
                    }}
                    className="absolute top-0 left-0 w-full h-full appearance-none bg-transparent pointer-events-none z-20 range-thumb-interactive"
                />

                {/* Input B */}
                <input
                    type="range"
                    min={min} max={max} step={step}
                    value={b}
                    onChange={(e) => {
                        const v = Number(e.target.value)
                        setB(v)
                        commit(a, v)
                    }}
                    className="absolute top-0 left-0 w-full h-full appearance-none bg-transparent pointer-events-none z-20 range-thumb-interactive"
                />
            </div>
        </div>
    )
}

function SingleRange({ min, max, value, onChange, step = 1, label }) {
    const percent = ((value - min) / (max - min)) * 100

    return (
        <div className="mt-1 group">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-3 font-medium group-hover:text-zinc-400 transition-colors">
                <span>{label}</span>
                <span className="font-mono text-orange-500 font-bold">{value}</span>
            </div>
            <div className="relative h-5 w-full flex items-center">
                <div className="absolute inset-x-0 h-1 bg-zinc-800 rounded-full"></div>
                <div
                    className="absolute h-1 bg-orange-500 rounded-full left-0"
                    style={{ width: `${percent}%` }}
                ></div>
                <input
                    type="range"
                    min={min} max={max} step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div
                    className="absolute h-3 w-3 bg-orange-500 rounded-full pointer-events-none shadow-lg transition-all duration-75 group-hover:scale-125"
                    style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
                />
            </div>
        </div>
    )
}

const SORT_OPTIONS = [
    { id: 'pop_desc', label: 'Popularidad descendente', hint: 'Tendencia primero' },
    { id: 'pop_asc', label: 'Popularidad ascendente', hint: 'Menos populares primero' },
    { id: 'rating_desc', label: 'Mejor valoradas', hint: 'Nota más alta' },
    { id: 'rating_asc', label: 'Peor valoradas', hint: 'Nota más baja' },
    { id: 'date_desc', label: 'Más recientes', hint: 'Estreno más nuevo' },
    { id: 'date_asc', label: 'Más antiguas', hint: 'Estreno más antiguo' },
]

function SortMenu({ value, onChange }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    const current = useMemo(() => SORT_OPTIONS.find((o) => o.id === value) || SORT_OPTIONS[0], [value])

    useEffect(() => {
        const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [])

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-600 transition flex items-center justify-between group"
            >
                <span className="text-sm font-medium truncate">{current.label}</span>
                <ChevronDown className={`w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute z-[80] mt-1 w-full rounded-lg border border-zinc-800 bg-[#121212] shadow-2xl overflow-hidden py-1">
                    {SORT_OPTIONS.map((opt) => {
                        const active = opt.id === value
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => { onChange(opt.id); setOpen(false) }}
                                className={`w-full text-left px-3 py-2 transition flex items-center justify-between gap-3
                                    ${active ? 'bg-zinc-800 text-orange-500' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
                            >
                                <span className="text-sm">{opt.label}</span>
                                {active && <Check className="w-3.5 h-3.5" />}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function RatingBadge({ percent }) {
    const p = Math.max(0, Math.min(100, Math.round(percent || 0)))
    let stroke = 'rgba(249, 115, 22, 1)' // Orange
    if (p >= 70) stroke = 'rgba(16, 185, 129, 1)' // Green
    if (p < 40) stroke = 'rgba(239, 68, 68, 1)' // Red

    const r = 14
    const c = 2 * Math.PI * r
    const dash = (p / 100) * c

    return (
        <div className="relative w-9 h-9 flex items-center justify-center bg-black/80 rounded-full backdrop-blur-sm border border-white/5 shadow-xl">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90 p-0.5">
                <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
                <circle cx="18" cy="18" r={r} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${dash} ${c}`} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                {p}<span className="text-[7px] align-top mt-[2px]">%</span>
            </div>
        </div>
    )
}

function DiscoverCard({ item }) {
    const isMovie = item.media_type === 'movie'
    const title = isMovie ? item.title : item.name
    const rawDate = isMovie ? item.release_date : item.first_air_date
    const year = rawDate ? rawDate.split('-')[0] : ''
    const percent = (item.vote_average || 0) * 10
    const href = `/details/${item.media_type}/${item.id}`

    return (
        <Link href={href} className="group relative flex flex-col w-full h-full" title={title}>
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-900 shadow-md ring-1 ring-white/5 transition-all duration-300 group-hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] group-hover:ring-white/20 group-hover:scale-[1.03] z-0 group-hover:z-10">
                <img
                    src={posterSrc(item)}
                    alt={title}
                    className="w-full h-full object-cover transition-transform duration-500"
                    loading="lazy"
                    decoding="async"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                    <div className="absolute top-2 right-2 translate-y-[-10px] group-hover:translate-y-0 transition-transform duration-300 delay-75">
                        <div className="rounded-md bg-black/60 backdrop-blur-md px-1.5 py-1 border border-white/10 text-white">
                            {isMovie ? <FilmIcon className="w-3.5 h-3.5" /> : <TvIcon className="w-3.5 h-3.5" />}
                        </div>
                    </div>

                    {percent > 0 && (
                        <div className="absolute top-2 left-2 translate-y-[-10px] group-hover:translate-y-0 transition-transform duration-300 delay-75">
                            <RatingBadge percent={percent} />
                        </div>
                    )}

                    <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                        <h3 className="text-white font-bold text-sm leading-tight line-clamp-2 mb-1">
                            {title}
                        </h3>
                        <p className="text-orange-500 font-medium text-xs">
                            {year || 'N/A'}
                        </p>
                    </div>
                </div>
            </div>
        </Link>
    )
}

function ProviderIcon({ provider, active, onToggle }) {
    const logo = provider?.logo_path ? `${IMG}/w92${provider.logo_path}` : null

    return (
        <button
            type="button"
            onClick={onToggle}
            title={provider.provider_name}
            className={`relative w-full aspect-square rounded-xl overflow-hidden transition-all duration-200 group
        ${active
                    ? 'ring-2 ring-emerald-500 scale-95 opacity-100' // Verde
                    : 'opacity-60 hover:opacity-100 hover:scale-105 ring-1 ring-white/10'
                }`}
        >
            {logo ? (
                <img src={logo} alt={provider.provider_name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500">
                    {provider.provider_name?.slice(0, 2)}
                </div>
            )}

            {active && (
                <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center backdrop-blur-[1px]">
                    <Check className="w-6 h-6 text-emerald-500 drop-shadow-md stroke-[3]" />
                </div>
            )}
        </button>
    )
}

/* =========================
   DiscoverClient Main
========================= */
export default function DiscoverClient() {
    const { session, account, hydrated } = useAuth()

    // --- State Filters ---
    const [content, setContent] = useState('movie')
    const [sortPreset, setSortPreset] = useState('pop_desc')
    const [providersAll, setProvidersAll] = useState([])
    const [selectedProviders, setSelectedProviders] = useState([])
    const [providerQuery, setProviderQuery] = useState('')
    const [seenMode, setSeenMode] = useState('all')
    const [ratedMovieIds, setRatedMovieIds] = useState(null)
    const [ratedTvIds, setRatedTvIds] = useState(null)
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [genresAll, setGenresAll] = useState([])
    const [selectedGenres, setSelectedGenres] = useState([])
    const [certsAll, setCertsAll] = useState([])
    const [selectedCerts, setSelectedCerts] = useState([])
    const [lang, setLang] = useState('')

    // ✅ Sliders States + Debounce
    const [scoreRange, setScoreRange] = useState([0, 10])
    const [minVotes, setMinVotes] = useState(0)
    const [runtimeRange, setRuntimeRange] = useState([0, 360])

    const debouncedScoreRange = useDebounce(scoreRange, 500)
    const debouncedMinVotes = useDebounce(minVotes, 500)
    const debouncedRuntimeRange = useDebounce(runtimeRange, 500)

    const [keywordQuery, setKeywordQuery] = useState('')
    const [keywordOptions, setKeywordOptions] = useState([])
    const [selectedKeywords, setSelectedKeywords] = useState([])
    const keywordTimer = useRef(null)
    const [items, setItems] = useState([])
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState(null)

    const hasSession = hydrated && !!session && !!account?.id

    function resetFilters() {
        setSortPreset('pop_desc')
        setSelectedProviders([])
        setProviderQuery('')
        setSeenMode('all')
        setDateFrom('')
        setDateTo('')
        setSelectedGenres([])
        setSelectedCerts([])
        setLang('')
        setScoreRange([0, 10])
        setMinVotes(0)
        setRuntimeRange([0, 360])
        setKeywordQuery('')
        setKeywordOptions([])
        setSelectedKeywords([])
        setPage(1)
    }

    function sortByFor(type) {
        const isMovie = type === 'movie'
        switch (sortPreset) {
            case 'pop_asc': return 'popularity.asc'
            case 'rating_desc': return 'vote_average.desc'
            case 'rating_asc': return 'vote_average.asc'
            case 'date_desc': return isMovie ? 'primary_release_date.desc' : 'first_air_date.desc'
            case 'date_asc': return isMovie ? 'primary_release_date.asc' : 'first_air_date.asc'
            case 'pop_desc':
            default: return 'popularity.desc'
        }
    }

    // --- Meta Loader ---
    useEffect(() => {
        let cancelled = false
        const ac = new AbortController()
        async function loadMeta() {
            try {
                const [gm, gt, pm, pt, cm, ct] = await Promise.all([
                    tmdbFetch('/genre/movie/list', {}, ac.signal),
                    tmdbFetch('/genre/tv/list', {}, ac.signal),
                    tmdbFetch('/watch/providers/movie', { watch_region: REGION }, ac.signal),
                    tmdbFetch('/watch/providers/tv', { watch_region: REGION }, ac.signal),
                    tmdbFetch('/certification/movie/list', {}, ac.signal),
                    tmdbFetch('/certification/tv/list', {}, ac.signal),
                ])
                if (cancelled) return

                const movieGenres = gm?.genres || []
                const tvGenres = gt?.genres || []
                const movieProviders = (pm?.results || []).sort((a, b) => (a?.provider_name || '').localeCompare(b?.provider_name || ''))
                const tvProviders = (pt?.results || []).sort((a, b) => (a?.provider_name || '').localeCompare(b?.provider_name || ''))
                const movieCerts = (cm?.certifications?.[REGION] || []).map((c) => c.certification).filter(Boolean)
                const tvCerts = (ct?.certifications?.[REGION] || []).map((c) => c.certification).filter(Boolean)

                if (content === 'movie') {
                    setGenresAll(movieGenres)
                    setProvidersAll(movieProviders)
                    setCertsAll(movieCerts)
                } else if (content === 'tv') {
                    setGenresAll(tvGenres)
                    setProvidersAll(tvProviders)
                    setCertsAll(tvCerts)
                } else {
                    const genreMap = new Map();[...movieGenres, ...tvGenres].forEach(g => genreMap.set(g.id, g))
                    const provMap = new Map();[...movieProviders, ...tvProviders].forEach(p => provMap.set(p.provider_id, p))
                    const certSet = new Set([...movieCerts, ...tvCerts])
                    setGenresAll([...genreMap.values()].sort((a, b) => a.name.localeCompare(b.name)))
                    setProvidersAll([...provMap.values()].sort((a, b) => a.provider_name.localeCompare(b.provider_name)))
                    setCertsAll([...certSet.values()].sort((a, b) => String(a).localeCompare(String(b))))
                }
            } catch (e) { if (!isAbortError(e) && !ac.signal.aborted) console.error(e) }
        }
        loadMeta()
        return () => { cancelled = true; ac.abort() }
    }, [content])

    // --- Keyword Search ---
    useEffect(() => {
        if (keywordTimer.current) clearTimeout(keywordTimer.current)
        const q = keywordQuery.trim()
        if (!q) { setKeywordOptions([]); return }
        const ac = new AbortController()
        keywordTimer.current = setTimeout(async () => {
            try {
                const data = await tmdbFetch('/search/keyword', { query: q }, ac.signal)
                setKeywordOptions((data?.results || []).slice(0, 10))
            } catch { }
        }, 280)
        return () => { clearTimeout(keywordTimer.current); ac.abort() }
    }, [keywordQuery])

    // --- Rated IDs ---
    useEffect(() => {
        let cancelled = false
        const ac = new AbortController()
        async function loadRatedIds(type) {
            if (!hasSession) return new Set()
            const base = `/account/${account.id}/rated/${type}`
            const ids = new Set()
            let p = 1
            const MAX_PAGES = 10
            while (!cancelled && p <= MAX_PAGES) {
                const data = await tmdbFetch(base, { session_id: session, page: p, sort_by: 'created_at.desc' }, ac.signal)
                if (!data?.results?.length) break
                for (const it of data.results) if (it?.id) ids.add(it.id)
                if (p >= (data.total_pages || 1)) break
                p++
            }
            return ids
        }
        async function runIfNeeded() {
            if (seenMode === 'all') return
            try {
                if ((content === 'movie' || content === 'all') && ratedMovieIds === null) {
                    const ids = await loadRatedIds('movies')
                    if (!cancelled) setRatedMovieIds(ids)
                }
                if ((content === 'tv' || content === 'all') && ratedTvIds === null) {
                    const ids = await loadRatedIds('tv')
                    if (!cancelled) setRatedTvIds(ids)
                }
            } catch (e) {
                if (!isAbortError(e) && !cancelled) {
                    if (ratedMovieIds === null) setRatedMovieIds(new Set())
                    if (ratedTvIds === null) setRatedTvIds(new Set())
                }
            }
        }
        runIfNeeded()
        return () => { cancelled = true; ac.abort() }
    }, [seenMode, content, hasSession, account, session, ratedMovieIds, ratedTvIds])

    // --- Params (Using Debounced values) ---
    const discoverParams = useMemo(() => {
        const base = {
            sort_by: sortByFor(content === 'tv' ? 'tv' : 'movie'),
            include_adult: 'false',
            page,
            watch_region: REGION,
        }
        if (selectedProviders.length) base.with_watch_providers = selectedProviders.join('|')
        if (selectedGenres.length) base.with_genres = selectedGenres.join(',')
        if (selectedCerts.length) { base.certification_country = REGION; base.certification = selectedCerts.join('|') }
        if (lang) base.with_original_language = lang

        base['vote_average.gte'] = String(debouncedScoreRange[0])
        base['vote_average.lte'] = String(debouncedScoreRange[1])
        if (debouncedMinVotes > 0) base['vote_count.gte'] = String(debouncedMinVotes)
        if (debouncedRuntimeRange[0] > 0) base['with_runtime.gte'] = String(debouncedRuntimeRange[0])
        if (debouncedRuntimeRange[1] < 360) base['with_runtime.lte'] = String(debouncedRuntimeRange[1])

        if (selectedKeywords.length) base.with_keywords = selectedKeywords.join('|')

        if (content === 'movie') {
            if (dateFrom) base['primary_release_date.gte'] = dateFrom
            if (dateTo) base['primary_release_date.lte'] = dateTo
        } else if (content === 'tv') {
            if (dateFrom) base['first_air_date.gte'] = dateFrom
            if (dateTo) base['first_air_date.lte'] = dateTo
        }
        return base
    }, [
        content, sortPreset, selectedProviders, selectedGenres, selectedCerts, lang,
        debouncedScoreRange, debouncedMinVotes, debouncedRuntimeRange,
        selectedKeywords, dateFrom, dateTo, page
    ])

    // --- Fetch Items ---
    useEffect(() => {
        let cancelled = false
        const ac = new AbortController()
        async function fetchDiscoverForType(type) {
            const params = { ...discoverParams, sort_by: sortByFor(type) }
            const data = await tmdbFetch(`/discover/${type}`, params, ac.signal)
            return (data?.results || []).map((it) => ({ ...it, media_type: type }))
        }
        function applySeenFilter(list) {
            if (seenMode === 'all' || !hasSession) return list
            const mSet = ratedMovieIds; const tSet = ratedTvIds
            return list.filter((it) => {
                const set = it.media_type === 'movie' ? mSet : tSet
                if (!(set instanceof Set)) return true
                const has = set.has(it.id)
                return seenMode === 'seen' ? has : !has
            })
        }
        async function run() {
            try {
                setError(null)
                if (page === 1) setLoading(true); else setLoadingMore(true)

                let list = []
                if (content === 'movie') list = await fetchDiscoverForType('movie')
                else if (content === 'tv') list = await fetchDiscoverForType('tv')
                else {
                    const [m, t] = await Promise.all([fetchDiscoverForType('movie'), fetchDiscoverForType('tv')])
                    list = [...m, ...t].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
                }
                list = applySeenFilter(list)

                if (cancelled) return
                setItems((prev) => (page === 1 ? list : [...prev, ...list]))
            } catch (e) {
                if (!isAbortError(e) && !ac.signal.aborted) {
                    console.error(e)
                    setError(e?.message || 'Error cargando.')
                    // NO limpiar items aquí si es un error temporal
                }
            } finally {
                if (!cancelled) { setLoading(false); setLoadingMore(false) }
            }
        }
        run()
        return () => { cancelled = true; ac.abort() }
    }, [content, discoverParams, page, seenMode, hasSession, ratedMovieIds, ratedTvIds, dateFrom, dateTo])

    // Reset page on filter change
    useEffect(() => { setPage(1) }, [
        content, sortPreset, selectedProviders, selectedGenres, selectedCerts, lang,
        debouncedScoreRange, debouncedMinVotes, debouncedRuntimeRange,
        selectedKeywords, dateFrom, dateTo, seenMode
    ])

    const providersFiltered = useMemo(() => {
        const q = providerQuery.trim().toLowerCase()
        if (!q) return providersAll
        return providersAll.filter((p) => (p?.provider_name || '').toLowerCase().includes(q))
    }, [providersAll, providerQuery])

    const selectedProvidersSet = useMemo(() => new Set(selectedProviders), [selectedProviders])

    // --- Render ---
    return (
        <div className="min-h-screen bg-black text-zinc-100 font-sans">
            <div className="max-w-[1800px] mx-auto p-4 lg:p-8">
                <header className="mb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-px w-12 bg-orange-500" />
                            <span className="text-orange-400 font-bold uppercase tracking-widest text-xs">EXPLORAR</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                            Descubrir
                            <span className="text-orange-500">.</span>
                        </h1>
                        <p className="mt-2 text-zinc-400 max-w-lg text-lg">
                            Filtra y busca películas o series con criterios avanzados.
                        </p>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
                    {/* --- Sidebar --- */}
                    <aside className="space-y-6">
                        {/* Contenido / Reset */}
                        <div className="bg-[#121212] border border-zinc-800 rounded-xl p-4 shadow-sm">
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Contenido</h3>
                            <div className="flex bg-zinc-900 rounded-lg p-1 mb-4 border border-zinc-800">
                                {['movie', 'tv', 'all'].map((type) => {
                                    const labels = { movie: 'Películas', tv: 'Series', all: 'Todo' }
                                    const active = content === type
                                    return (
                                        <button
                                            key={type} onClick={() => setContent(type)}
                                            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all duration-200
                                                ${active ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
                                        >
                                            {labels[type]}
                                        </button>
                                    )
                                })}
                            </div>
                            <button onClick={resetFilters} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-zinc-800 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">
                                <RotateCcw className="w-3 h-3" /> Reset filtros
                            </button>
                        </div>

                        {/* Filtros Accordions */}
                        <div className="bg-[#121212] border border-zinc-800 rounded-xl p-4 shadow-sm space-y-1">
                            <Section title="Ordenar" defaultOpen right={<span className="text-[10px] text-zinc-500">{SORT_OPTIONS.find(o => o.id === sortPreset)?.label.split(' ')[0]}</span>} overflowVisible>
                                <div className="text-xs text-zinc-500 mb-2">Ordenar resultados por</div>
                                <SortMenu value={sortPreset} onChange={setSortPreset} />
                            </Section>

                            <Section title="Dónde se puede ver" right={<span className="text-[10px] text-zinc-500">{selectedProviders.length > 0 ? selectedProviders.length : ''}</span>}>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                                        <input value={providerQuery} onChange={(e) => setProviderQuery(e.target.value)} placeholder="Buscar plataforma..." className="w-full h-9 pl-9 pr-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 placeholder:text-zinc-600" />
                                    </div>
                                    {selectedProviders.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pb-2 border-b border-zinc-800/50">
                                            {providersAll.filter(p => selectedProvidersSet.has(p.provider_id)).map(p => (
                                                <div key={p.provider_id} className="w-8 h-8">
                                                    <ProviderIcon provider={p} active onToggle={() => setSelectedProviders(prev => prev.filter(id => id !== p.provider_id))} />
                                                </div>
                                            ))}
                                            <button onClick={() => setSelectedProviders([])} className="text-[10px] text-red-400 hover:underline px-1">Borrar</button>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-5 gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                                        {providersFiltered.length === 0 ? <div className="col-span-5 text-center text-xs text-zinc-600 py-2">Sin resultados</div> :
                                            providersFiltered.map(p => {
                                                const active = selectedProvidersSet.has(p.provider_id)
                                                return <ProviderIcon key={p.provider_id} provider={p} active={active} onToggle={() => setSelectedProviders(prev => active ? prev.filter(id => id !== p.provider_id) : [...prev, p.provider_id])} />
                                            })}
                                    </div>
                                </div>
                            </Section>

                            <Section title="Filtros" defaultOpen>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-zinc-600 uppercase mb-2">Muéstrame</div>
                                    <RadioRow name="seenMode" value="all" checked={seenMode === 'all'} onChange={setSeenMode}>Todo</RadioRow>
                                    <RadioRow name="seenMode" value="unseen" checked={seenMode === 'unseen'} onChange={setSeenMode} disabled={!hasSession}>
                                        {content === 'tv' ? 'Series por ver' : 'Películas por ver'}
                                    </RadioRow>
                                    <RadioRow name="seenMode" value="seen" checked={seenMode === 'seen'} onChange={setSeenMode} disabled={!hasSession}>
                                        {content === 'tv' ? 'Series vistas' : 'Películas vistas'}
                                    </RadioRow>
                                </div>
                            </Section>

                            <Section title="Fechas de estreno">
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-zinc-500">Desde</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full h-9 pl-9 pr-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:border-zinc-600 outline-none" />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-zinc-500">Hasta</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full h-9 pl-9 pr-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:border-zinc-600 outline-none" />
                                        </div>
                                    </div>
                                </div>
                            </Section>

                            <Section title="Géneros" right={<span className="text-[10px] text-zinc-500">{selectedGenres.length > 0 ? selectedGenres.length : ''}</span>}>
                                <div className="flex flex-wrap gap-2">
                                    {genresAll.map(g => (
                                        <Chip key={g.id} active={selectedGenres.includes(g.id)} onClick={() => setSelectedGenres(prev => prev.includes(g.id) ? prev.filter(x => x !== g.id) : [...prev, g.id])}>{g.name}</Chip>
                                    ))}
                                </div>
                            </Section>

                            <Section title="Certificación">
                                <div className="flex flex-wrap gap-2">
                                    {certsAll.map(c => (
                                        <Chip key={c} active={selectedCerts.includes(c)} onClick={() => setSelectedCerts(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}>{c}</Chip>
                                    ))}
                                </div>
                            </Section>

                            <Section title="Puntuación" right={<Star className="w-3 h-3 text-orange-500" />}>
                                <DualRange label="Puntuación (0-10)" min={0} max={10} step={0.5} valueMin={scoreRange[0]} valueMax={scoreRange[1]} onChange={setScoreRange} />
                                <div className="mt-4"><SingleRange label="Mínimo de votos" min={0} max={500} step={10} value={minVotes} onChange={setMinVotes} /></div>
                            </Section>

                            <Section title="Duración" right={<Clock className="w-3 h-3 text-zinc-500" />}>
                                <DualRange label="Minutos" min={0} max={360} step={15} valueMin={runtimeRange[0]} valueMax={runtimeRange[1]} onChange={setRuntimeRange} />
                            </Section>

                            <Section title="Keywords">
                                <input value={keywordQuery} onChange={e => setKeywordQuery(e.target.value)} placeholder="Buscar keyword..." className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:border-zinc-600 outline-none mb-2" />
                                {keywordOptions.length > 0 && (
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mb-2">
                                        {keywordOptions.map(k => (
                                            <button key={k.id} onClick={() => { setSelectedKeywords(p => p.includes(k.id) ? p : [...p, k.id]); setKeywordQuery(''); setKeywordOptions([]) }} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-300">{k.name}</button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {selectedKeywords.map(id => (
                                        <div key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 text-[10px] text-zinc-300 border border-zinc-700">
                                            #{id} <button onClick={() => setSelectedKeywords(p => p.filter(x => x !== id))}><X className="w-3 h-3 hover:text-white" /></button>
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        </div>
                    </aside>

                    {/* --- Main Grid --- */}
                    <main className="relative min-h-[60vh]">
                        {/* 1. Loader inicial (solo si NO hay items previos) */}
                        {loading && items.length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-yellow-500 mb-4" />
                                <p className="text-zinc-500 text-sm">Buscando títulos...</p>
                            </div>
                        )}

                        {/* 2. Error (solo si NO hay items) */}
                        {error && items.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="p-4 rounded-xl bg-red-900/20 border border-red-900/50 text-red-200 text-sm">{error}</div>
                            </div>
                        )}

                        {/* 3. Empty State (sin resultados) */}
                        {!loading && !error && items.length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 h-fit my-auto">
                                <FilmIcon className="w-12 h-12 text-zinc-700 mb-4" />
                                <h3 className="text-lg font-bold text-zinc-300">No se encontraron resultados</h3>
                                <p className="text-zinc-500 text-sm mt-2 max-w-xs mx-auto">Intenta ajustar tus filtros o limpiar la búsqueda.</p>
                                <button onClick={resetFilters} className="mt-6 text-yellow-500 hover:underline text-sm">Limpiar todos los filtros</button>
                            </div>
                        )}

                        {/* 4. Grid de resultados (persiste con opacidad al recargar) */}
                        {items.length > 0 && (
                            <div className={`transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-x-4 gap-y-8">
                                    {items.map(item => (
                                        <DiscoverCard key={`${item.media_type}-${item.id}`} item={item} />
                                    ))}
                                </div>

                                <div className="mt-12 flex justify-center pb-8">
                                    <button
                                        onClick={() => setPage(p => p + 1)}
                                        disabled={loadingMore}
                                        className="px-8 py-3 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                        {loadingMore ? 'Cargando...' : 'Cargar más resultados'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 5. Loader superpuesto discreto (cuando recarga filtros sobre datos existentes) */}
                        {loading && items.length > 0 && (
                            <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50">
                                <div className="bg-black/80 backdrop-blur-md text-white px-4 py-2 rounded-full flex items-center gap-3 shadow-2xl border border-white/10">
                                    <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
                                    <span className="text-xs font-medium">Actualizando...</span>
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            </div>
            {/* Custom Styles */}
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 2px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }
                
                .range-thumb-interactive::-webkit-slider-thumb {
                    pointer-events: auto;
                    width: 14px; height: 14px;
                    background: #eab308;
                    border-radius: 50%;
                    cursor: pointer;
                    -webkit-appearance: none;
                    box-shadow: 0 0 5px rgba(0,0,0,0.5);
                }
                .range-thumb-interactive::-moz-range-thumb {
                    pointer-events: auto;
                    width: 14px; height: 14px;
                    background: #eab308;
                    border: none;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 0 5px rgba(0,0,0,0.5);
                }
            `}</style>
        </div>
    )
}