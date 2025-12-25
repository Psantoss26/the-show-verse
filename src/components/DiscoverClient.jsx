// src/components/DiscoverClient.jsx
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
} from 'lucide-react'

/* =========================
   Helpers
========================= */
const TMDB = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'
const REGION = 'ES'
const LANG = 'es-ES'

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

/* =========================
   UI Bits
========================= */
function Section({ title, right, children, defaultOpen = false, overflowVisible = false }) {
    const [open, setOpen] = useState(!!defaultOpen)

    useEffect(() => {
        setOpen(!!defaultOpen)
    }, [defaultOpen])

    return (
        <details
            open={open}
            onToggle={(e) => setOpen(e.currentTarget.open)}
            className={[
                'rounded-2xl bg-neutral-900/60 border border-white/5 shadow-[0_14px_40px_rgba(0,0,0,0.35)]',
                overflowVisible ? 'overflow-visible' : 'overflow-hidden',
            ].join(' ')}
        >
            <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between">
                <div className="text-white font-bold">{title}</div>
                <div className="flex items-center gap-2 text-white/70">
                    {right}
                    <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                </div>
            </summary>

            <div className="px-4 pb-4">{children}</div>
        </details>
    )
}

function Chip({ active, children, onClick, className = '' }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition
        ${active
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-black/10 border-white/10 text-white/70 hover:text-white hover:border-white/20'
                } ${className}`}
        >
            {children}
        </button>
    )
}

function RadioRow({ name, value, checked, onChange, children, disabled = false }) {
    return (
        <label className={`flex items-center gap-3 py-1.5 ${disabled ? 'opacity-50' : ''}`}>
            <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                onChange={() => !disabled && onChange(value)}
                disabled={disabled}
                className="accent-yellow-500"
            />
            <span className="text-sm text-white/80">{children}</span>
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

    const clamp = (x) => Math.max(min, Math.min(max, x))
    const commit = (na, nb) => {
        const lo = Math.min(na, nb)
        const hi = Math.max(na, nb)
        onChange([clamp(lo), clamp(hi)])
    }

    return (
        <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-white/70">
                <span>{label}</span>
                <span className="font-mono text-white/80">
                    {a} – {b}
                </span>
            </div>

            <div className="relative mt-2 h-10">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={a}
                    onChange={(e) => {
                        const na = Number(e.target.value)
                        setA(na)
                        commit(na, b)
                    }}
                    className="absolute inset-0 w-full opacity-70"
                />
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={b}
                    onChange={(e) => {
                        const nb = Number(e.target.value)
                        setB(nb)
                        commit(a, nb)
                    }}
                    className="absolute inset-0 w-full opacity-70"
                />
            </div>
        </div>
    )
}

function SingleRange({ min, max, value, onChange, step = 1, label }) {
    return (
        <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-white/70">
                <span>{label}</span>
                <span className="font-mono text-white/80">{value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full mt-2 opacity-80"
            />
        </div>
    )
}

/* =========================
   Custom Sort Menu
========================= */
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

    const current = useMemo(
        () => SORT_OPTIONS.find((o) => o.id === value) || SORT_OPTIONS[0],
        [value]
    )

    useEffect(() => {
        const onDown = (e) => {
            if (!ref.current) return
            if (!ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [])

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full h-11 px-3 rounded-xl bg-black/20 border border-white/10 text-white focus:outline-none focus:border-white/25 hover:border-white/20 hover:bg-white/5 transition flex items-center justify-between"
                aria-expanded={open}
                aria-haspopup="menu"
            >
                <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{current.label}</div>
                    <div className="text-[11px] text-white/45 -mt-0.5 truncate">{current.hint}</div>
                </div>
                <ChevronDown
                    className={`w-4 h-4 text-white/70 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute z-[80] mt-2 w-full rounded-2xl border border-white/10 bg-[#0f0f0f]/95 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.65)] overflow-hidden"
                >
                    <div className="p-2">
                        {SORT_OPTIONS.map((opt) => {
                            const active = opt.id === value
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        onChange(opt.id)
                                        setOpen(false)
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-xl transition flex items-start justify-between gap-3
                    ${active ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5'}`}
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold truncate">{opt.label}</div>
                                        <div className="text-[11px] text-white/45 truncate">{opt.hint}</div>
                                    </div>
                                    <div className="shrink-0 pt-0.5">
                                        {active ? (
                                            <Check className="w-4 h-4 text-emerald-400" />
                                        ) : (
                                            <div className="w-4 h-4" />
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

/* =========================
   Rating badge + Card (overlay on hover)
========================= */
function RatingBadge({ percent }) {
    const p = Math.max(0, Math.min(100, Math.round(percent || 0)))
    const r = 12
    const c = 2 * Math.PI * r
    const dash = (p / 100) * c

    return (
        <div className="inline-flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-md px-2.5 py-1.5 border border-white/12 shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
            <div className="relative w-7 h-7">
                <svg viewBox="0 0 32 32" className="w-7 h-7 -rotate-90">
                    <circle cx="16" cy="16" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="4" />
                    <circle
                        cx="16"
                        cy="16"
                        r={r}
                        fill="none"
                        stroke="rgba(16,185,129,0.95)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={`${dash} ${c}`}
                    />
                </svg>
            </div>

            <div className="leading-none">
                <div className="text-[12px] font-extrabold text-white tracking-wide">{p}%</div>
                <div className="text-[10px] text-white/65 -mt-0.5">score</div>
            </div>
        </div>
    )
}

function DiscoverCard({ item }) {
    const isMovie = item.media_type === 'movie'
    const title = isMovie ? item.title : item.name
    const rawDate = isMovie ? item.release_date : item.first_air_date
    const date = formatDateDMY(rawDate)
    const percent = (item.vote_average || 0) * 10
    const href = `/details/${item.media_type}/${item.id}`

    return (
        <Link href={href} className="group block relative" title={title}>
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-neutral-900 border border-white/5 shadow-xl transition-all duration-500 ease-out group-hover:shadow-2xl group-hover:-translate-y-2">
                <img
                    src={posterSrc(item)}
                    alt={title}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                    loading="lazy"
                    decoding="async"
                />

                {/* Overlay: only on hover/focus */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
                    <div className="absolute inset-0 [box-shadow:inset_0_-110px_140px_rgba(0,0,0,0.75)]" />

                    {/* Type */}
                    <div className="absolute top-3 right-3 z-10">
                        <div className="inline-flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-md border border-white/12 px-2.5 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                            {isMovie ? (
                                <FilmIcon className="w-4 h-4 text-white/85" />
                            ) : (
                                <TvIcon className="w-4 h-4 text-white/85" />
                            )}
                        </div>
                    </div>

                    {/* Score */}
                    {percent > 0 && (
                        <div className="absolute top-3 left-3 z-10">
                            <RatingBadge percent={percent} />
                        </div>
                    )}

                    {/* Bottom info */}
                    <div className="absolute inset-x-0 bottom-0 z-10 p-3">
                        <div className="rounded-xl bg-black/60 backdrop-blur-md border border-white/12 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.60)]">
                            <div className="text-white font-extrabold text-sm sm:text-[15px] leading-snug line-clamp-2">
                                {title}
                            </div>

                            {!!date && (
                                <div className="mt-1 text-[11px] text-white/75 font-medium tracking-wide">
                                    {date}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="absolute inset-0 pointer-events-none ring-0 group-focus-within:ring-2 ring-yellow-500/50 rounded-2xl" />
            </div>
        </Link>
    )
}

/* =========================
   Providers: icon-only + search
   ✅ FIX: badge no se recorta (sin overflow-hidden en el wrapper)
========================= */
function ProviderIcon({ provider, active, onToggle }) {
    const logo = provider?.logo_path ? `${IMG}/w92${provider.logo_path}` : null

    return (
        <button
            type="button"
            onClick={onToggle}
            title={provider.provider_name}
            aria-pressed={active}
            className={`relative w-full aspect-square rounded-2xl overflow-hidden border transition shadow-sm
        ${active
                    ? 'bg-white/10 border-emerald-500/45 ring-2 ring-emerald-500/20'
                    : 'bg-black/20 border-white/10 hover:border-white/20 hover:bg-white/5'
                }`}
        >
            {logo ? (
                <img
                    src={logo}
                    alt={provider.provider_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-white/50 text-xs font-bold">
                    {provider.provider_name?.slice(0, 2)?.toUpperCase() || 'TV'}
                </div>
            )}

            {/* Check dentro (sin recortes) */}
            {active && (
                <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500/90 border border-black/40 flex items-center justify-center shadow-lg">
                    <Check className="w-4 h-4 text-black" />
                </div>
            )}
        </button>
    )
}

/* =========================
   DiscoverClient
========================= */
export default function DiscoverClient() {
    const { session, account, hydrated } = useAuth()

    const [content, setContent] = useState('movie') // movie | tv | all
    const [sortPreset, setSortPreset] = useState('pop_desc')

    const [providersAll, setProvidersAll] = useState([])
    const [selectedProviders, setSelectedProviders] = useState([])
    const [providerQuery, setProviderQuery] = useState('')

    const [seenMode, setSeenMode] = useState('all') // all | unseen | seen
    const [ratedMovieIds, setRatedMovieIds] = useState(null)
    const [ratedTvIds, setRatedTvIds] = useState(null)

    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    const [genresAll, setGenresAll] = useState([])
    const [selectedGenres, setSelectedGenres] = useState([])

    const [certsAll, setCertsAll] = useState([])
    const [selectedCerts, setSelectedCerts] = useState([])

    const [lang, setLang] = useState('')

    const [scoreRange, setScoreRange] = useState([0, 10])
    const [minVotes, setMinVotes] = useState(0)
    const [runtimeRange, setRuntimeRange] = useState([0, 360])

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
            case 'pop_asc':
                return 'popularity.asc'
            case 'rating_desc':
                return 'vote_average.desc'
            case 'rating_asc':
                return 'vote_average.asc'
            case 'date_desc':
                return isMovie ? 'primary_release_date.desc' : 'first_air_date.desc'
            case 'date_asc':
                return isMovie ? 'primary_release_date.asc' : 'first_air_date.asc'
            case 'pop_desc':
            default:
                return 'popularity.desc'
        }
    }

    // Meta loaders
    useEffect(() => {
        let cancelled = false
        const ac = new AbortController()

        async function loadMeta() {
            try {
                const [gm, gt] = await Promise.all([
                    tmdbFetch('/genre/movie/list', {}, ac.signal),
                    tmdbFetch('/genre/tv/list', {}, ac.signal),
                ])

                const [pm, pt] = await Promise.all([
                    tmdbFetch('/watch/providers/movie', { watch_region: REGION }, ac.signal),
                    tmdbFetch('/watch/providers/tv', { watch_region: REGION }, ac.signal),
                ])

                const [cm, ct] = await Promise.all([
                    tmdbFetch('/certification/movie/list', {}, ac.signal),
                    tmdbFetch('/certification/tv/list', {}, ac.signal),
                ])

                if (cancelled) return

                const movieGenres = gm?.genres || []
                const tvGenres = gt?.genres || []

                const movieProviders = (pm?.results || []).sort((a, b) =>
                    (a?.provider_name || '').localeCompare(b?.provider_name || '')
                )
                const tvProviders = (pt?.results || []).sort((a, b) =>
                    (a?.provider_name || '').localeCompare(b?.provider_name || '')
                )

                const movieCerts = (cm?.certifications?.[REGION] || [])
                    .map((c) => c.certification)
                    .filter(Boolean)
                const tvCerts = (ct?.certifications?.[REGION] || [])
                    .map((c) => c.certification)
                    .filter(Boolean)

                if (content === 'movie') {
                    setGenresAll(movieGenres)
                    setProvidersAll(movieProviders)
                    setCertsAll(movieCerts)
                } else if (content === 'tv') {
                    setGenresAll(tvGenres)
                    setProvidersAll(tvProviders)
                    setCertsAll(tvCerts)
                } else {
                    const genreMap = new Map()
                    for (const g of [...movieGenres, ...tvGenres]) genreMap.set(g.id, g)

                    const provMap = new Map()
                    for (const p of [...movieProviders, ...tvProviders]) provMap.set(p.provider_id, p)

                    const certSet = new Set([...movieCerts, ...tvCerts])

                    setGenresAll([...genreMap.values()].sort((a, b) => a.name.localeCompare(b.name)))
                    setProvidersAll(
                        [...provMap.values()].sort((a, b) => a.provider_name.localeCompare(b.provider_name))
                    )
                    setCertsAll([...certSet.values()].sort((a, b) => String(a).localeCompare(String(b))))
                }
            } catch (e) {
                console.error(e)
            }
        }

        loadMeta()
        return () => {
            cancelled = true
            ac.abort()
        }
    }, [content])

    // Keyword search (debounced)
    useEffect(() => {
        if (keywordTimer.current) clearTimeout(keywordTimer.current)

        const q = keywordQuery.trim()
        if (!q) {
            setKeywordOptions([])
            return
        }

        const ac = new AbortController()
        keywordTimer.current = setTimeout(async () => {
            try {
                const data = await tmdbFetch('/search/keyword', { query: q }, ac.signal)
                setKeywordOptions((data?.results || []).slice(0, 10))
            } catch {
                // ignore
            }
        }, 280)

        return () => {
            clearTimeout(keywordTimer.current)
            ac.abort()
        }
    }, [keywordQuery])

    // Rated IDs loader (lazy when seen/unseen)
    useEffect(() => {
        let cancelled = false
        const ac = new AbortController()

        async function loadRatedIds(type) {
            if (!hasSession) return new Set()

            const base = `/account/${account.id}/rated/${type}`
            const ids = new Set()
            let p = 1
            let totalPages = 1
            const MAX_PAGES = 10

            while (!cancelled && p <= totalPages && p <= MAX_PAGES) {
                const data = await tmdbFetch(
                    base,
                    { session_id: session, page: p, sort_by: 'created_at.desc' },
                    ac.signal
                )
                totalPages = data?.total_pages || 1
                for (const it of data?.results || []) if (it?.id) ids.add(it.id)
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
                console.error(e)
                if (!cancelled) {
                    if (ratedMovieIds === null) setRatedMovieIds(new Set())
                    if (ratedTvIds === null) setRatedTvIds(new Set())
                }
            }
        }

        runIfNeeded()
        return () => {
            cancelled = true
            ac.abort()
        }
    }, [seenMode, content, hasSession, account, session, ratedMovieIds, ratedTvIds])

    /* ✅ params con claves string */
    const discoverParams = useMemo(() => {
        const base = {
            sort_by: sortByFor(content === 'tv' ? 'tv' : 'movie'),
            include_adult: 'false',
            page,
            watch_region: REGION,
        }

        if (selectedProviders.length) base.with_watch_providers = selectedProviders.join('|')
        if (selectedGenres.length) base.with_genres = selectedGenres.join(',')

        if (selectedCerts.length) {
            base.certification_country = REGION
            base.certification = selectedCerts.join('|')
        }

        if (lang) base.with_original_language = lang

        base['vote_average.gte'] = String(scoreRange[0])
        base['vote_average.lte'] = String(scoreRange[1])

        if (minVotes > 0) base['vote_count.gte'] = String(minVotes)

        if (runtimeRange[0] > 0) base['with_runtime.gte'] = String(runtimeRange[0])
        if (runtimeRange[1] < 360) base['with_runtime.lte'] = String(runtimeRange[1])

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
        content,
        sortPreset,
        selectedProviders,
        selectedGenres,
        selectedCerts,
        lang,
        scoreRange,
        minVotes,
        runtimeRange,
        selectedKeywords,
        dateFrom,
        dateTo,
        page,
    ])

    // Fetch discover
    useEffect(() => {
        let cancelled = false
        const ac = new AbortController()

        async function fetchDiscoverForType(type) {
            const params = { ...discoverParams, sort_by: sortByFor(type) }

            if (content === 'all') {
                if (type === 'movie') {
                    if (dateFrom) params['primary_release_date.gte'] = dateFrom
                    if (dateTo) params['primary_release_date.lte'] = dateTo
                } else {
                    if (dateFrom) params['first_air_date.gte'] = dateFrom
                    if (dateTo) params['first_air_date.lte'] = dateTo
                }
            }

            const data = await tmdbFetch(`/discover/${type}`, params, ac.signal)
            return (data?.results || []).map((it) => ({ ...it, media_type: type }))
        }

        function applySeenFilter(list) {
            if (seenMode === 'all') return list
            if (!hasSession) return list

            const mSet = ratedMovieIds
            const tSet = ratedTvIds

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
                if (page === 1) setLoading(true)
                else setLoadingMore(true)

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
                if (cancelled) return
                console.error(e)
                setError(e?.message || 'No se han podido cargar resultados.')
                if (page === 1) setItems([])
            } finally {
                if (!cancelled) {
                    setLoading(false)
                    setLoadingMore(false)
                }
            }
        }

        run()
        return () => {
            cancelled = true
            ac.abort()
        }
    }, [content, discoverParams, page, seenMode, hasSession, ratedMovieIds, ratedTvIds, dateFrom, dateTo])

    // Cambios en filtros => reset page
    useEffect(() => {
        setPage(1)
    }, [
        content,
        sortPreset,
        selectedProviders,
        selectedGenres,
        selectedCerts,
        lang,
        scoreRange,
        minVotes,
        runtimeRange,
        selectedKeywords,
        dateFrom,
        dateTo,
        seenMode,
    ])

    const sortLabel = useMemo(() => {
        return (SORT_OPTIONS.find((o) => o.id === sortPreset) || SORT_OPTIONS[0]).label
    }, [sortPreset])

    const watchedDisabled = !hasSession

    const providersFiltered = useMemo(() => {
        const q = providerQuery.trim().toLowerCase()
        if (!q) return providersAll
        return providersAll.filter((p) => (p?.provider_name || '').toLowerCase().includes(q))
    }, [providersAll, providerQuery])

    const selectedProvidersSet = useMemo(() => new Set(selectedProviders), [selectedProviders])

    return (
        <div className="min-h-screen bg-[#0b0b0b] text-white">
            <div className="max-w-[1600px] mx-auto px-4 pt-10 pb-24">
                <div className="flex items-start gap-4 mb-8">
                    <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                        <SlidersHorizontal className="w-6 h-6 text-yellow-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight">Descubrir</h1>
                        <p className="text-white/60 text-sm mt-1">
                            Filtra y busca grupos de películas y/o series con criterios avanzados.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-7">
                    <aside className="space-y-4">
                        <div className="rounded-2xl bg-neutral-900/60 border border-white/5 shadow-[0_14px_40px_rgba(0,0,0,0.35)] p-4">
                            <div className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mb-3">
                                Contenido
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setContent('movie')}
                                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition
                    ${content === 'movie'
                                            ? 'bg-white/10 border-white/20 text-white'
                                            : 'bg-black/10 border-white/10 text-white/70 hover:text-white hover:border-white/20'
                                        }`}
                                >
                                    Películas
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setContent('tv')}
                                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition
                    ${content === 'tv'
                                            ? 'bg-white/10 border-white/20 text-white'
                                            : 'bg-black/10 border-white/10 text-white/70 hover:text-white hover:border-white/20'
                                        }`}
                                >
                                    Series
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setContent('all')}
                                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition
                    ${content === 'all'
                                            ? 'bg-white/10 border-white/20 text-white'
                                            : 'bg-black/10 border-white/10 text-white/70 hover:text-white hover:border-white/20'
                                        }`}
                                >
                                    Todo
                                </button>
                            </div>

                            <div className="mt-4 flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/10 hover:border-white/20 hover:bg-white/5 transition text-sm font-semibold"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Reset filtros
                                </button>

                                <div className="text-xs text-white/50">{hasSession ? 'Sesión activa' : 'Sin sesión'}</div>
                            </div>
                        </div>

                        <Section
                            title="Ordenar"
                            defaultOpen
                            overflowVisible
                            right={<span className="text-xs text-white/50">{sortLabel}</span>}
                        >
                            <div className="text-xs text-white/50 mb-2">Ordenar resultados por</div>
                            <SortMenu value={sortPreset} onChange={setSortPreset} />
                        </Section>

                        {/* ✅ overflowVisible aquí también para evitar cualquier recorte raro */}
                        <Section
                            title="Dónde se puede ver"
                            overflowVisible
                            right={
                                <span className="text-xs text-white/50">
                                    {selectedProviders.length ? `${selectedProviders.length} sel.` : `${providersAll.length || 0}`}
                                </span>
                            }
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <div className="relative w-full">
                                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
                                    <input
                                        value={providerQuery}
                                        onChange={(e) => setProviderQuery(e.target.value)}
                                        placeholder="Buscar plataforma…"
                                        className="w-full h-11 pl-9 pr-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder:text-white/35 focus:outline-none focus:border-white/25"
                                    />
                                </div>

                                {selectedProviders.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedProviders([])}
                                        className="h-11 px-3 rounded-xl bg-black/20 border border-white/10 hover:border-white/20 hover:bg-white/5 transition text-xs font-semibold text-white/80"
                                        title="Limpiar plataformas"
                                    >
                                        Limpiar
                                    </button>
                                )}
                            </div>

                            {providersAll.length === 0 ? (
                                <div className="text-sm text-white/50">Cargando plataformas…</div>
                            ) : (
                                <>
                                    {selectedProviders.length > 0 && (
                                        <div className="mb-3">
                                            <div className="text-[11px] text-white/55 mb-2">Seleccionadas (región {REGION})</div>

                                            {/* ✅ sin recortes */}
                                            <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-6 gap-2">
                                                {providersAll
                                                    .filter((p) => selectedProvidersSet.has(p.provider_id))
                                                    .slice(0, 24)
                                                    .map((p) => (
                                                        <ProviderIcon
                                                            key={`sel-${p.provider_id}`}
                                                            provider={p}
                                                            active
                                                            onToggle={() => {
                                                                setSelectedProviders((prev) => prev.filter((id) => id !== p.provider_id))
                                                            }}
                                                        />
                                                    ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="text-[11px] text-white/55 mb-2">
                                        Plataformas (solo iconos) — región {REGION}
                                    </div>

                                    <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-6 gap-2 max-h-[270px] overflow-auto pr-1 no-scrollbar">
                                        {providersFiltered.map((p) => {
                                            const active = selectedProvidersSet.has(p.provider_id)
                                            return (
                                                <ProviderIcon
                                                    key={p.provider_id}
                                                    provider={p}
                                                    active={active}
                                                    onToggle={() => {
                                                        setSelectedProviders((prev) =>
                                                            active ? prev.filter((id) => id !== p.provider_id) : [...prev, p.provider_id]
                                                        )
                                                    }}
                                                />
                                            )
                                        })}
                                    </div>

                                    {providersFiltered.length === 0 && (
                                        <div className="mt-3 text-sm text-white/50">
                                            No hay plataformas que coincidan con la búsqueda.
                                        </div>
                                    )}
                                </>
                            )}
                        </Section>

                        <Section title="Filtros" defaultOpen>
                            <div className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mb-2">
                                Muéstrame ({content === 'tv' ? 'series' : content === 'movie' ? 'películas' : 'todo'})
                            </div>

                            <RadioRow name="seenMode" value="all" checked={seenMode === 'all'} onChange={setSeenMode}>
                                Todo
                            </RadioRow>

                            <RadioRow
                                name="seenMode"
                                value="unseen"
                                checked={seenMode === 'unseen'}
                                onChange={setSeenMode}
                                disabled={watchedDisabled}
                            >
                                {content === 'tv' ? 'Series que no he visto' : 'Películas que no he visto'}
                            </RadioRow>

                            <RadioRow
                                name="seenMode"
                                value="seen"
                                checked={seenMode === 'seen'}
                                onChange={setSeenMode}
                                disabled={watchedDisabled}
                            >
                                {content === 'tv' ? 'Series que he visto' : 'Películas que he visto'}
                            </RadioRow>

                            {!hasSession && (
                                <div className="mt-2 text-xs text-white/45">
                                    Inicia sesión para filtrar por visto/no visto (se basa en tus valoraciones).
                                </div>
                            )}
                        </Section>

                        <Section title="Fechas de estreno">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <div className="text-[11px] text-white/60 mb-1">desde</div>
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        className="w-full h-11 px-3 rounded-xl bg-black/20 border border-white/10 text-white focus:outline-none focus:border-white/25"
                                    />
                                </div>
                                <div>
                                    <div className="text-[11px] text-white/60 mb-1">hasta</div>
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        className="w-full h-11 px-3 rounded-xl bg-black/20 border border-white/10 text-white focus:outline-none focus:border-white/25"
                                    />
                                </div>
                            </div>
                        </Section>

                        <Section title="Géneros">
                            {genresAll.length === 0 ? (
                                <div className="text-sm text-white/50">Cargando géneros…</div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {genresAll.map((g) => {
                                        const active = selectedGenres.includes(g.id)
                                        return (
                                            <Chip
                                                key={g.id}
                                                active={active}
                                                onClick={() =>
                                                    setSelectedGenres((prev) =>
                                                        active ? prev.filter((x) => x !== g.id) : [...prev, g.id]
                                                    )
                                                }
                                            >
                                                {g.name}
                                            </Chip>
                                        )
                                    })}
                                </div>
                            )}
                        </Section>

                        <Section title="Certificación">
                            {certsAll.length === 0 ? (
                                <div className="text-sm text-white/50">Cargando certificaciones…</div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {certsAll.map((c) => {
                                        const active = selectedCerts.includes(c)
                                        return (
                                            <Chip
                                                key={c}
                                                active={active}
                                                onClick={() =>
                                                    setSelectedCerts((prev) => (active ? prev.filter((x) => x !== c) : [...prev, c]))
                                                }
                                            >
                                                {c}
                                            </Chip>
                                        )
                                    })}
                                </div>
                            )}
                        </Section>

                        <Section title="Idioma">
                            <select
                                value={lang}
                                onChange={(e) => setLang(e.target.value)}
                                className="w-full h-11 px-3 rounded-xl bg-black/20 border border-white/10 text-white focus:outline-none focus:border-white/25"
                            >
                                <option value="">Ninguno seleccionado</option>
                                <option value="en">Inglés</option>
                                <option value="es">Español</option>
                                <option value="fr">Francés</option>
                                <option value="de">Alemán</option>
                                <option value="it">Italiano</option>
                                <option value="ja">Japonés</option>
                                <option value="ko">Coreano</option>
                            </select>
                        </Section>

                        <Section title="Puntuación de los usuarios">
                            <DualRange
                                min={0}
                                max={10}
                                step={0.5}
                                valueMin={scoreRange[0]}
                                valueMax={scoreRange[1]}
                                onChange={setScoreRange}
                                label="Puntuación (0 – 10)"
                            />
                        </Section>

                        <Section title="Votos mínimos de los usuarios">
                            <SingleRange
                                min={0}
                                max={500}
                                step={10}
                                value={minVotes}
                                onChange={setMinVotes}
                                label="Mínimo de votos"
                            />
                        </Section>

                        <Section title="Duración">
                            <DualRange
                                min={0}
                                max={360}
                                step={10}
                                valueMin={runtimeRange[0]}
                                valueMax={runtimeRange[1]}
                                onChange={setRuntimeRange}
                                label="Minutos"
                            />
                        </Section>

                        <Section title="Palabras clave">
                            <input
                                type="text"
                                value={keywordQuery}
                                onChange={(e) => setKeywordQuery(e.target.value)}
                                placeholder="Escribe para buscar..."
                                className="w-full h-11 px-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder:text-white/35 focus:outline-none focus:border-white/25"
                            />

                            {keywordOptions.length > 0 && (
                                <div className="mt-2 rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                                    {keywordOptions.map((k) => {
                                        const active = selectedKeywords.includes(k.id)
                                        return (
                                            <button
                                                key={k.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedKeywords((prev) =>
                                                        active ? prev.filter((x) => x !== k.id) : [...prev, k.id]
                                                    )
                                                    setKeywordQuery('')
                                                    setKeywordOptions([])
                                                }}
                                                className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/5 flex items-center justify-between"
                                            >
                                                <span className="truncate">{k.name}</span>
                                                {active ? <Check className="w-4 h-4 text-emerald-400" /> : null}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            {selectedKeywords.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {selectedKeywords.map((id) => (
                                        <span
                                            key={id}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white/85"
                                        >
                                            #{id}
                                            <button
                                                type="button"
                                                onClick={() => setSelectedKeywords((prev) => prev.filter((x) => x !== id))}
                                                className="text-white/70 hover:text-white"
                                                aria-label="Quitar keyword"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Section>
                    </aside>

                    <main>
                        {error && (
                            <div className="mb-5 rounded-2xl border border-red-500/25 bg-red-950/20 px-4 py-3 text-red-300">
                                {error}
                            </div>
                        )}

                        {loading ? (
                            <div className="min-h-[55vh] flex items-center justify-center gap-3 text-white/70">
                                <Loader2 className="w-6 h-6 animate-spin text-yellow-500" />
                                Cargando resultados…
                            </div>
                        ) : items.length === 0 ? (
                            <div className="min-h-[55vh] flex flex-col items-center justify-center text-center rounded-2xl border border-white/10 bg-white/5 p-10">
                                <div className="text-white font-bold text-lg">Sin resultados</div>
                                <div className="text-white/55 text-sm mt-2">
                                    Prueba a cambiar filtros o ampliar los rangos.
                                </div>
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/20 border border-white/10 hover:border-white/20 hover:bg-white/5 transition text-sm font-semibold"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Reset filtros
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-6">
                                    {items.map((it) => (
                                        <DiscoverCard key={`${it.media_type}-${it.id}`} item={it} />
                                    ))}
                                </div>

                                <div className="mt-10 flex items-center justify-center">
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => p + 1)}
                                        disabled={loadingMore}
                                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full border text-sm font-bold transition
                      ${loadingMore
                                                ? 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed'
                                                : 'bg-black/20 border-white/15 text-white/80 hover:text-white hover:border-white/25 hover:bg-white/5'
                                            }`}
                                    >
                                        {loadingMore ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Cargando…
                                            </>
                                        ) : (
                                            <>Cargar más</>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </main>
                </div>
            </div>
        </div>
    )
}
