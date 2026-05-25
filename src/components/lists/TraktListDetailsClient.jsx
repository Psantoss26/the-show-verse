'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Loader2, ExternalLink, ChevronDown, UserRound } from 'lucide-react'
import UnifiedListDetailsLayout from '@/components/lists/UnifiedListDetailsLayout'
import FilterableListItems from '@/components/lists/ListDetailsTools'

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
    const showRef = it?.show?.ids?.trakt || it?.show?.ids?.slug || null
    const seasonNumber = it?.season?.number ?? it?.episode?.season ?? null
    const episodeNumber = it?.episode?.number ?? null
    const listedAt = it?.listed_at || null
    const id = m || s || p || e || se || 'item'

    return [
        t,
        id,
        showRef,
        seasonNumber,
        episodeNumber,
        listedAt,
        fallbackIdx,
    ]
        .filter((value) => value !== null && value !== undefined && value !== '')
        .join('-')
}

function identityForItem(it) {
    const type = it?.type || 'item'
    const movieId = it?.movie?.ids?.trakt || it?.movie?.ids?.tmdb || it?.movie?.ids?.imdb
    const showId = it?.show?.ids?.trakt || it?.show?.ids?.tmdb || it?.show?.ids?.imdb || it?.show?.ids?.slug
    const personId = it?.person?.ids?.trakt || it?.person?.ids?.tmdb || it?.person?.ids?.imdb

    if ((type === 'episode' || type === 'season' || it?.episode || it?.season) && showId) {
        return `show:${showId}`
    }
    if (movieId) return `movie:${movieId}`
    if (type === 'show' && showId) return `show:${showId}`
    if (personId) return `person:${personId}`

    return keyForItem(it, 0)
}

function dedupeItems(items) {
    const seen = new Set()
    const out = []

    for (const item of Array.isArray(items) ? items : []) {
        const key = identityForItem(item)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(item)
    }

    return out
}

function buildItemTitle(it) {
    if (it?.episode || it?.season) return it?.show?.title || 'Serie'

    return it?.movie?.title || it?.show?.title || it?.person?.name || 'Elemento'
}

function buildItemHref(it, mediaType, tmdbId) {
    if (!tmdbId) return null

    if ((it?.episode || it?.season) && it?.show?.ids?.tmdb) return `/details/tv/${it.show.ids.tmdb}`

    return mediaType ? `/details/${mediaType}/${tmdbId}` : null
}

const tmdbImg = (path, size = 'w500') => path ? `https://image.tmdb.org/t/p/${size}${path}` : null

export default function TraktListDetailsClient({ username, listId }) {
    const loadMoreRef = useRef(null)
    const stateRef = useRef(null)
    const loadingMoreRef = useRef(false)

    const [state, setState] = useState({
        loading: true,
        loadingMore: false,
        error: null,
        list: null,
        items: [],
        page: 1,
        hasMore: false,
    })

    useEffect(() => {
        stateRef.current = state
    }, [state])

    const baseApiUrl = useMemo(() => {
        if (!username || !listId) return null
        return `/api/trakt/lists/${encodeURIComponent(username)}/${encodeURIComponent(listId)}`
    }, [username, listId])

    useEffect(() => {
        if (typeof window === 'undefined') return
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
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
                        items: dedupeItems(json?.items),
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

    const handleLoadMore = useCallback(async () => {
        const current = stateRef.current
        if (
            loadingMoreRef.current ||
            current?.loadingMore ||
            current?.loading ||
            !current?.hasMore
        ) {
            return
        }

        loadingMoreRef.current = true
        try {
            setState((p) => ({ ...p, loadingMore: true, error: null }))
            const nextPage = (current?.page || 1) + 1
            const json = await fetchPage(nextPage)

            setState((p) => ({
                ...p,
                loadingMore: false,
                error: null,
                // list: lo dejamos como el que ya tenemos
                items: dedupeItems([...(p.items || []), ...(Array.isArray(json?.items) ? json.items : [])]),
                page: json?.page || nextPage,
                hasMore: !!json?.hasMore,
            }))
        } catch (e) {
            setState((p) => ({ ...p, loadingMore: false, error: e?.message || 'Error' }))
        } finally {
            loadingMoreRef.current = false
        }
    }, [fetchPage])

    useEffect(() => {
        const node = loadMoreRef.current
        if (!node || state.loading || !state.hasMore) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    void handleLoadMore()
                }
            },
            {
                root: null,
                rootMargin: '900px 0px',
                threshold: 0.01,
            }
        )

        observer.observe(node)
        return () => observer.disconnect()
    }, [handleLoadMore, state.hasMore, state.loading, state.items.length])

    const list = state.list
    const items = Array.isArray(state.items) ? state.items : []
    const creatorUsername = list?.user?.username || username || 'Usuario'

    const slugOrId = list?.ids?.slug || list?.ids?.trakt || listId
    const traktUrl =
        username && slugOrId
            ? (username === 'official'
                ? `https://trakt.tv/lists/${slugOrId}`
                : `https://trakt.tv/users/${username}/lists/${slugOrId}`)
            : null

    if (state.loading) {
        return (
            <div className="min-h-screen bg-[#101010] text-gray-100 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
                <span className="text-sm font-medium text-zinc-500 animate-pulse">Cargando lista...</span>
            </div>
        )
    }

    if (state.error) {
        return (
            <UnifiedListDetailsLayout title="Lista" sourceLabel="Trakt" backHref="/lists">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-zinc-300">
                    <p className="font-bold text-red-300">Error</p>
                    <p className="mt-2 text-sm text-zinc-400">{state.error}</p>
                </div>
            </UnifiedListDetailsLayout>
        )
    }

    const firstPoster = items.find((item) => item?._tmdb?.poster_path)?._tmdb?.poster_path
    const firstBackdrop = items.find((item) => item?._tmdb?.backdrop_path)?._tmdb?.backdrop_path || firstPoster

    const getTraktMeta = (it, index) => {
        const tmdb = it?._tmdb || null
        const mediaType = tmdb?.media_type || (it?.movie ? 'movie' : it?.show ? 'tv' : null)
        const tmdbId = tmdb?.id || it?.movie?.ids?.tmdb || it?.show?.ids?.tmdb || null
        return {
            id: tmdbId || index,
            title: buildItemTitle(it),
            mediaType,
            year: String(it?.movie?.year || it?.show?.year || ''),
            posterPath: tmdb?.poster_path || tmdb?.backdrop_path || null,
            href: buildItemHref(it, mediaType, tmdbId),
            voteAverage: tmdb?.vote_average || null,
            addedAt: it?.listed_at || '',
        }
    }

    return (
        <UnifiedListDetailsLayout
            title={list?.name || 'Lista'}
            description={list?.description || ''}
            sourceLabel="Lista de Trakt"
            posterImage={tmdbImg(firstPoster)}
            backdropImage={tmdbImg(firstBackdrop, 'original')}
            badges={[]}
            stats={[
                { label: 'Elementos', value: Number(list?.item_count || items.length) },
                { label: 'Usuario', value: `@${creatorUsername}`, icon: UserRound, tone: 'emerald' },
                { label: 'Likes', value: Number(list?.likes || 0) },
                { label: 'Fuente', value: 'Trakt' },
            ]}
            backHref="/lists"
            rightActions={
                traktUrl ? (
                    <a
                        href={traktUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-blue-400 hover:border-blue-500/50 transition"
                        title="Ver en Trakt"
                    >
                        <ExternalLink className="w-5 h-5" />
                    </a>
                ) : null
            }
        >
            <FilterableListItems
                items={items}
                getMeta={getTraktMeta}
                emptyTitle="Lista vacía"
                emptyText="No hay títulos disponibles en esta lista."
            />

            {state.hasMore && (
                <div ref={loadMoreRef} className="mt-10 flex min-h-14 justify-center">
                    <button
                        onClick={handleLoadMore}
                        disabled={state.loadingMore}
                        className="group relative inline-flex items-center justify-center overflow-hidden rounded-full p-0.5 font-bold focus:outline-none disabled:opacity-70"
                    >
                        <span className="absolute h-full w-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                        <span className="relative flex items-center gap-2 rounded-full bg-black px-6 py-2.5 transition-all duration-300 group-hover:bg-opacity-0">
                            {state.loadingMore ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin text-indigo-300" />
                                    <span className="text-white">Cargando más...</span>
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
        </UnifiedListDetailsLayout>
    )
}
