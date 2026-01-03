'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ArrowLeft, ListVideo, ExternalLink, ChevronDown } from 'lucide-react'

const PAGE_SIZE = 48

function Poster({ posterPath, alt }) {
    const [failed, setFailed] = useState(false)
    if (!posterPath || failed) {
        return (
            <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-700">
                <ListVideo className="w-8 h-8 opacity-40" />
            </div>
        )
    }

    return (
        <img
            src={`https://image.tmdb.org/t/p/w500${posterPath}`}
            alt={alt}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
        />
    )
}

function keyForItem(it, fallbackIdx) {
    const t = it?.type || 'item'
    const m = it?.movie?.ids?.trakt
    const s = it?.show?.ids?.trakt
    const p = it?.person?.ids?.trakt
    const e = it?.episode?.ids?.trakt
    const se = it?.season?.ids?.trakt
    const id = m || s || p || e || se || fallbackIdx
    return `${t}-${id}`
}

export default function TraktListDetailsClient({ username, listId }) {
    const router = useRouter()

    const [state, setState] = useState({
        loading: true,
        loadingMore: false,
        error: null,
        list: null,
        items: [],
        page: 1,
        hasMore: false,
    })

    const baseApiUrl = useMemo(() => {
        if (!username || !listId) return null
        return `/api/trakt/lists/${encodeURIComponent(username)}/${encodeURIComponent(listId)}`
    }, [username, listId])

    const fetchPage = useCallback(
        async (pageToLoad) => {
            if (!baseApiUrl) return null
            const url = `${baseApiUrl}?page=${pageToLoad}&limit=${PAGE_SIZE}`
            const res = await fetch(url, { cache: 'no-store' })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json?.error || 'No se pudo cargar la lista')
            return json
        },
        [baseApiUrl]
    )

    // Load inicial (page 1)
    useEffect(() => {
        let cancelled = false
        if (!baseApiUrl) return

            ; (async () => {
                try {
                    setState((p) => ({ ...p, loading: true, error: null, items: [], page: 1 }))
                    const json = await fetchPage(1)
                    if (cancelled) return

                    setState((p) => ({
                        ...p,
                        loading: false,
                        error: null,
                        list: json?.list || null,
                        items: Array.isArray(json?.items) ? json.items : [],
                        page: json?.page || 1,
                        hasMore: !!json?.hasMore,
                    }))
                } catch (e) {
                    if (cancelled) return
                    setState((p) => ({
                        ...p,
                        loading: false,
                        error: e?.message || 'Error',
                        list: null,
                        items: [],
                        page: 1,
                        hasMore: false,
                    }))
                }
            })()

        return () => {
            cancelled = true
        }
    }, [baseApiUrl, fetchPage])

    const handleLoadMore = async () => {
        if (state.loadingMore || state.loading || !state.hasMore) return
        try {
            setState((p) => ({ ...p, loadingMore: true, error: null }))
            const nextPage = (state.page || 1) + 1
            const json = await fetchPage(nextPage)

            setState((p) => ({
                ...p,
                loadingMore: false,
                error: null,
                // list: lo dejamos como el que ya tenemos
                items: [...(p.items || []), ...(Array.isArray(json?.items) ? json.items : [])],
                page: json?.page || nextPage,
                hasMore: !!json?.hasMore,
            }))
        } catch (e) {
            setState((p) => ({ ...p, loadingMore: false, error: e?.message || 'Error' }))
        }
    }

    const list = state.list
    const items = Array.isArray(state.items) ? state.items : []

    const slugOrId = list?.ids?.slug || list?.ids?.trakt || listId
    const traktUrl =
        username && slugOrId
            ? (username === 'official'
                ? `https://trakt.tv/lists/${slugOrId}`
                : `https://trakt.tv/users/${username}/lists/${slugOrId}`)
            : null

    return (
        <div className="min-h-screen bg-[#101010] text-gray-100">
            <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
                {/* Top bar */}
                <div className="mb-8 flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition"
                        title="Volver"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>

                    <div className="h-8 w-[1px] bg-zinc-800" />

                    {traktUrl && (
                        <a
                            href={traktUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-blue-400 hover:border-blue-500/50 transition"
                            title="Ver en Trakt"
                        >
                            <ExternalLink className="w-5 h-5" />
                        </a>
                    )}
                </div>

                {state.loading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-zinc-500 gap-3">
                        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
                        <span className="text-sm font-medium animate-pulse">Cargando lista...</span>
                    </div>
                ) : state.error ? (
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-zinc-300">
                        <p className="font-bold text-red-300">Error</p>
                        <p className="mt-2 text-sm text-zinc-400">{state.error}</p>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="bg-neutral-900/60 border border-white/5 p-6 sm:p-8 rounded-3xl backdrop-blur-md mb-8">
                            <div className="flex items-start gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                                    <ListVideo className="h-6 w-6 text-indigo-300" />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight break-words">
                                        {list?.name || 'Lista'}
                                    </h1>

                                    <p className="mt-2 text-lg text-neutral-400 leading-relaxed max-w-3xl">
                                        {list?.description ? list.description : <span className="italic opacity-50">Sin descripción</span>}
                                    </p>

                                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-zinc-400">
                                        <span className="rounded bg-white/5 px-2 py-1 border border-white/10">@{username}</span>
                                        <span className="rounded bg-white/5 px-2 py-1 border border-white/10">
                                            {Number(list?.item_count || 0)} items
                                        </span>
                                        <span className="rounded bg-white/5 px-2 py-1 border border-white/10">
                                            ❤️ {Number(list?.likes || 0)}
                                        </span>
                                        <span className="rounded bg-white/5 px-2 py-1 border border-white/10">
                                            Mostrando {items.length} / {Number(list?.item_count || items.length)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Grid (solo lo ya cargado) */}
                        <div className="relative z-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                            {items.map((it, idx) => {
                                const tmdb = it?._tmdb || null
                                const mediaType = tmdb?.media_type || (it?.movie ? 'movie' : it?.show ? 'tv' : null)
                                const tmdbId = tmdb?.id || it?.movie?.ids?.tmdb || it?.show?.ids?.tmdb || null

                                const title =
                                    it?.movie?.title ||
                                    it?.show?.title ||
                                    it?.person?.name ||
                                    (it?.episode?.title ? `${it?.show?.title || ''} — ${it?.episode?.title}` : null) ||
                                    (it?.season ? `${it?.show?.title || ''} — Temporada ${it?.season?.number}` : null) ||
                                    'Elemento'

                                const href = mediaType && tmdbId ? `/details/${mediaType}/${tmdbId}` : null
                                const poster = tmdb?.poster_path || tmdb?.backdrop_path || null

                                return (
                                    <div key={keyForItem(it, idx)} className="group relative">
                                        {href ? (
                                            <Link
                                                href={href}
                                                className="block relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-900 shadow-lg ring-1 ring-white/5 transition-all duration-500 group-hover:shadow-[0_0_25px_rgba(255,255,255,0.08)] group-hover:scale-[1.03]"
                                            >
                                                <Poster posterPath={poster} alt={title} />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                                <div className="absolute bottom-0 left-0 right-0 p-3 transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                                                    <p className="text-white font-bold text-xs sm:text-sm line-clamp-2 leading-tight drop-shadow-md">
                                                        {title}
                                                    </p>
                                                </div>
                                            </Link>
                                        ) : (
                                            <div className="block relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/5">
                                                <Poster posterPath={poster} alt={title} />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Load more */}
                        {state.hasMore && (
                            <div className="mt-10 flex justify-center">
                                <button
                                    onClick={handleLoadMore}
                                    disabled={state.loadingMore}
                                    className="group relative inline-flex items-center justify-center overflow-hidden rounded-full p-0.5 font-bold focus:outline-none disabled:opacity-60"
                                >
                                    <span className="absolute h-full w-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                                    <span className="relative flex items-center gap-2 rounded-full bg-black px-6 py-2.5 transition-all duration-300 group-hover:bg-opacity-0">
                                        {state.loadingMore ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin text-indigo-300" />
                                                <span className="text-white">Cargando...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="bg-gradient-to-r from-indigo-200 to-white bg-clip-text text-transparent group-hover:text-white">
                                                    Cargar más
                                                </span>
                                                <ChevronDown className="h-4 w-4 text-indigo-300 group-hover:text-white" />
                                            </>
                                        )}
                                    </span>
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
