'use client'


import OptimizedImage from "@/components/OptimizedImage";
import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, Loader2, ExternalLink, ChevronDown, UserRound, ListVideo } from 'lucide-react'
import UnifiedListDetailsLayout from '@/components/lists/UnifiedListDetailsLayout'
import ListDetailsActionRow from '@/components/lists/ListDetailsActionRow'
import FilterableListItems from '@/components/lists/ListDetailsTools'
import ListLikeButton from '@/components/community/ListLikeButton'
import { useAuth } from '@/context/AuthContext'
import { formatPageTitle } from '@/lib/pageTitle'
import { ratingSummaryBadge } from '@/lib/lists/ratingSummary'
import useListImdbRatings from '@/hooks/useListImdbRatings'
import {
    getCommunityListDetailsCacheKey,
    resolveCommunityListDetailsInitialState,
} from '@/lib/lists/detailsInitialState'
import { useIsHistoryNavigation } from '@/lib/hooks/useIsHistoryNavigation'

const PAGE_SIZE = 48
const TRAKT_LIST_DETAILS_CACHE_TTL_MS = 20 * 60 * 1000
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function getDetailsCacheKey(listId) {
    return getCommunityListDetailsCacheKey(listId)
}

function readDetailsCache(listId) {
    const key = getDetailsCacheKey(listId)
    if (!key || typeof window === 'undefined') return null
    try {
        const raw = window.sessionStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (Date.now() - Number(parsed?.t || 0) > TRAKT_LIST_DETAILS_CACHE_TTL_MS) return null
        return parsed?.data || null
    } catch {
        return null
    }
}

function writeDetailsCache(listId, data) {
    const key = getDetailsCacheKey(listId)
    if (!key || typeof window === 'undefined') return
    try {
        window.sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }))
    } catch {
        // ignore
    }
}

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
        <OptimizedImage
            src={`https://image.tmdb.org/t/p/w500${posterPath}`}
            alt={alt}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
        />
    )
}

// Items ahora vienen tal cual de community_list_items (fila de la tabla, ya
// deduplicada en BD por (listId, tmdbId, mediaType)): { tmdbId, mediaType,
// title, posterPath, position, addedAt }. Ya no son objetos Trakt con
// .movie/.show/.episode/.season/._tmdb.
function dedupeItems(items) {
    const seen = new Set()
    const out = []

    for (const item of Array.isArray(items) ? items : []) {
        const key = `${item?.mediaType || 'item'}:${item?.tmdbId ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(item)
    }

    return out
}

function computeHasMore(list, loadedCount) {
    const total = Number(list?.item_count || 0)
    return total > 0 && Number(loadedCount || 0) < total
}

const tmdbImg = (path, size = 'w500') => path ? `https://image.tmdb.org/t/p/${size}${path}` : null

export default function TraktListDetailsClient({ username, listId }) {
    const router = useRouter()
    const { authenticated = false } = useAuth()
    const isBackNav = useIsHistoryNavigation()
    const loadMoreRef = useRef(null)
    const stateRef = useRef(null)
    const loadingMoreRef = useRef(false)

    // El primer render debe ser idéntico al HTML del servidor. La instantánea
    // se recupera en layout effect: antes del primer repintado y antes de que
    // ScrollRestoration recupere la posición, sin romper la hidratación.
    const [state, setState] = useState(() => resolveCommunityListDetailsInitialState(null))

    useClientLayoutEffect(() => {
        if (!isBackNav) return
        const cached = readDetailsCache(listId)
        if (cached) setState(resolveCommunityListDetailsInitialState(cached))
    }, [isBackNav, listId])

    useEffect(() => {
        stateRef.current = state
    }, [state])

    // `listId` ahora es el uuid interno de community_lists (lo llevan las
    // tarjetas de discover vía list.id — ver useTraktLists.js). `username` ya
    // no participa en la ruta del backend; se conserva como prop solo para
    // fallback de visualización (creatorUsername) y para el enlace "Ver en Trakt".
    const baseApiUrl = useMemo(() => {
        if (!listId) return null
        return `/api/community/lists/${encodeURIComponent(listId)}`
    }, [listId])

    useEffect(() => {
        document.title = formatPageTitle(state.list?.name || 'Lista')
    }, [state.list?.name])

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
        const cached = readDetailsCache(listId)
        setState(resolveCommunityListDetailsInitialState(cached))

            ; (async () => {
                try {
                    const json = await fetchPage(1)
                    if (cancelled) return
                    const items = dedupeItems(json?.items)
                    const nextState = {
                        loading: false,
                        loadingMore: false,
                        error: null,
                        list: json?.list || null,
                        ratingSummary: json?.ratingSummary || null,
                        imdbRatingItems: Array.isArray(json?.imdbRatingItems) ? json.imdbRatingItems : [],
                        items,
                        page: 1,
                        // El endpoint {list, items} no trae paginación: la
                        // derivamos de list.item_count vs. lo ya cargado.
                        hasMore: computeHasMore(json?.list, items.length),
                    }

                    writeDetailsCache(listId, nextState)

                    setState(nextState)
                } catch (e) {
                    if (cancelled) return
                    setState((p) => ({
                        ...p,
                        loading: false,
                        error: e?.message || 'Error',
                    list: p.list,
                    ratingSummary: p.ratingSummary,
                    imdbRatingItems: p.imdbRatingItems,
                        items: p.items,
                        page: p.page || 1,
                        hasMore: p.hasMore,
                    }))
                }
            })()

        return () => {
            cancelled = true
        }
    }, [baseApiUrl, fetchPage, username, listId])

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

            setState((p) => {
                const items = dedupeItems([...(p.items || []), ...(Array.isArray(json?.items) ? json.items : [])])
                const nextState = {
                    ...p,
                    loadingMore: false,
                    error: null,
                        list: json?.list || p.list,
                        ratingSummary: json?.ratingSummary || p.ratingSummary,
                        imdbRatingItems: Array.isArray(json?.imdbRatingItems)
                            ? json.imdbRatingItems
                            : p.imdbRatingItems,
                    items,
                    page: nextPage,
                    hasMore: computeHasMore(json?.list || p.list, items.length),
                }
                writeDetailsCache(listId, nextState)
                return nextState
            })
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
    const listItemCount = Number(list?.item_count || items.length)
    const imdbRatingItems = state.imdbRatingItems.length > 0
        ? state.imdbRatingItems
        : items
    const { ratingsByKey: imdbRatings, summary: imdbSummary } = useListImdbRatings(imdbRatingItems, { totalCount: listItemCount })

    const firstPoster = items.find((item) => item?.posterPath)?.posterPath
    const firstBackdrop = firstPoster

    // Item shape nuevo (community_list_items): { tmdbId, mediaType, title, posterPath, addedAt }.
    const getTraktMeta = useCallback((it, index) => {
        const tmdbId = it?.tmdbId ?? null
        const mediaType = it?.mediaType || null
        return {
            id: tmdbId || index,
            title: it?.title || 'Elemento',
            mediaType,
            year: '',
            posterPath: it?.posterPath || null,
            href: tmdbId && mediaType ? `/details/${mediaType}/${tmdbId}` : null,
            voteAverage: it?.voteAverage ?? null,
            imdbRating: imdbRatings[`${mediaType === 'tv' ? 'tv' : 'movie'}:${tmdbId}`]?.rating,
            addedAt: it?.addedAt || '',
        }
    }, [imdbRatings])

    if (state.loading && !list && items.length === 0) {
        return null
    }

    if (state.error && !list && items.length === 0) {
        return (
            <UnifiedListDetailsLayout title="Lista" sourceLabel="Comunidad" backHref="/lists">
                <div className="rounded-2xl bg-black/[0.08] bg-gradient-to-br from-white/10 via-transparent to-black/15 p-6 text-zinc-300 shadow-none backdrop-blur-[28px]">
                    <p className="font-bold text-red-300">Error</p>
                    <p className="mt-2 text-sm text-zinc-400">{state.error}</p>
                </div>
            </UnifiedListDetailsLayout>
        )
    }

    return (
        <UnifiedListDetailsLayout
            title={list?.name || 'Lista'}
            description={list?.description || ''}
            sourceLabel="Lista de la comunidad"
            posterItems={items}
            backdropImage={tmdbImg(firstBackdrop, 'original')}
            scoreboardStats={[
                { icon: ListVideo, label: 'ELEMENTOS', value: listItemCount, tooltip: 'Títulos de la lista' },
                { icon: UserRound, label: 'USUARIO', value: `@${creatorUsername}`, tooltip: 'Creador de la lista' },
                { icon: Heart, label: 'LIKES', value: Number(list?.likes || 0), tooltip: 'Me gusta de la comunidad' },
                { icon: ExternalLink, label: 'FUENTE', value: 'Comunidad', tooltip: 'Lista de la comunidad' },
            ]}
            scoreboardRatings={{
                tmdb: ratingSummaryBadge(state.ratingSummary),
                imdb: ratingSummaryBadge(imdbSummary),
            }}
            showTopBar={false}
            heroActions={
                <ListDetailsActionRow
                    onBack={() => router.back()}
                    favoriteAction={list?.id ? (
                    <ListLikeButton
                        listId={list.id}
                        likes={Number(list?.likes || 0)}
                        liked={Boolean(list?.liked)}
                        canLike={authenticated}
                        liquidGlass
                    />
                    ) : null}
                />
            }
        >
            {items.length > 0 || !state.loading ? (
                <FilterableListItems
                    items={items}
                    getMeta={getTraktMeta}
                    emptyTitle="Lista vacía"
                    emptyText="No hay títulos disponibles en esta lista."
                />
            ) : null}

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
