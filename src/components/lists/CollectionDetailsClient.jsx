'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Clock3, ExternalLink, Film } from 'lucide-react'
import ListPosterCard from '@/components/lists/ListPosterCard'
import FilterableListItems from '@/components/lists/ListDetailsTools'
import UnifiedListDetailsLayout from '@/components/lists/UnifiedListDetailsLayout'
import ListDetailsActionRow from '@/components/lists/ListDetailsActionRow'
import { formatPageTitle } from '@/lib/pageTitle'
import {
    resolveBackNavigationDetailsSnapshot,
    resolveCollectionDetailsInitialState,
} from '@/lib/lists/detailsInitialState'
import { ratingSummaryBadge, summarizeListRatings } from '@/lib/lists/ratingSummary'
import useListImdbRatings from '@/hooks/useListImdbRatings'
import { useIsHistoryNavigation } from '@/lib/hooks/useIsHistoryNavigation'

const COLLECTION_DETAILS_CACHE_TTL_MS = 30 * 60 * 1000

function getCollectionDetailsCacheKey(collectionId) {
    return collectionId ? `showverse:list-details:collection:${collectionId}:v1` : null
}

function readCollectionDetailsCache(collectionId) {
    const key = getCollectionDetailsCacheKey(collectionId)
    if (!key || typeof window === 'undefined') return null
    try {
        const raw = window.sessionStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (Date.now() - Number(parsed?.t || 0) > COLLECTION_DETAILS_CACHE_TTL_MS) return null
        return parsed?.data || null
    } catch {
        return null
    }
}

function writeCollectionDetailsCache(collectionId, data) {
    const key = getCollectionDetailsCacheKey(collectionId)
    if (!key || typeof window === 'undefined') return
    try {
        window.sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }))
    } catch {
        // ignore
    }
}

function MovieCard({ movie, idx, imdbRating, disableHover = false }) {
    const href = `/details/movie/${movie.id}`
    const poster = movie.poster_path || movie.backdrop_path || null
    const title = movie.title || 'Película sin título'
    const year = movie.release_date ? String(new Date(movie.release_date).getFullYear()) : null

    return (
        <div
            className="animate-fade-in-up"
            style={{
                animationDelay: `${Math.min(idx * 50, 800)}ms`,
                animationFillMode: 'both'
            }}
        >
            <ListPosterCard
                href={href}
                title={title}
                year={year}
                mediaType="movie"
                posterPath={poster}
                voteAverage={movie.vote_average}
                imdbRating={imdbRating}
                disableHover={disableHover}
            />
        </div>
    )
}

export default function CollectionDetailsClient({ collectionId }) {
    const router = useRouter()
    const isBackNav = useIsHistoryNavigation()
    // El primer frame de una vuelta atrás necesita las películas cacheadas para
    // que el restaurador de scroll tenga su altura real. En una entrada nueva
    // se conserva el árbol inicial del servidor y la caché se aplica en efecto.
    const [state, setState] = useState(() =>
        resolveCollectionDetailsInitialState(
            resolveBackNavigationDetailsSnapshot(
                isBackNav ? readCollectionDetailsCache(collectionId) : null,
                isBackNav,
            ),
        ),
    )

    useEffect(() => {
        document.title = formatPageTitle(state.collection?.name || 'Colección')
    }, [state.collection?.name])

    useEffect(() => {
        let cancelled = false
        if (!collectionId) return
        const cached = readCollectionDetailsCache(collectionId)
        setState(resolveCollectionDetailsInitialState(cached))

        ; (async () => {
            try {
                const res = await fetch(`/api/tmdb/collection?id=${collectionId}`, { cache: 'no-store' })
                const json = await res.json().catch(() => ({}))
                
                if (!res.ok) {
                    throw new Error(json?.error || 'No se pudo cargar la colección')
                }
                
                if (cancelled) return
                const nextState = {
                    loading: false,
                    error: null,
                    collection: json?.collection || null,
                    parts: Array.isArray(json?.items) ? json.items : [],
                }

                writeCollectionDetailsCache(collectionId, nextState)
                setState(nextState)
            } catch (e) {
                if (cancelled) return
                setState((p) => ({
                    loading: false,
                    error: e?.message || 'Error al cargar la colección',
                    collection: p.collection,
                    parts: p.parts,
                }))
            }
        })()

        return () => {
            cancelled = true
        }
    }, [collectionId])

    const { collection, parts } = state
    const tmdbUrl = useMemo(
        () => collectionId ? `https://www.themoviedb.org/collection/${collectionId}` : null,
        [collectionId]
    )

    const totalRuntime = useMemo(() => {
        if (!parts.length) return 0
        return parts.reduce((sum, movie) => sum + (movie.runtime || 0), 0)
    }, [parts])
    const averageRating = useMemo(() => summarizeListRatings(parts), [parts])
    const { ratingsByKey: imdbRatings, summary: imdbSummary } = useListImdbRatings(parts, {
        totalCount: parts.length,
    })

    const filterableParts = useMemo(
        () =>
            parts.map((movie) => ({
                ...movie,
                media_type: 'movie',
                imdbRating: imdbRatings[`movie:${movie.id}`]?.rating,
            })),
        [parts, imdbRatings]
    )

    if (state.loading && !collection && parts.length === 0) {
        return null
    }

    if (state.error && !collection && parts.length === 0) {
        return (
            <UnifiedListDetailsLayout title="Colección" sourceLabel="Colección TMDb" backHref="/lists">
                <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-6 text-zinc-300">
                    <p className="font-bold text-red-300 text-lg">Error al cargar la colección</p>
                    <p className="mt-1 text-sm text-zinc-400">{state.error}</p>
                </div>
            </UnifiedListDetailsLayout>
        )
    }

    const collectionPoster = collection?.poster_path || parts.find((movie) => movie?.poster_path)?.poster_path || null
    const collectionBackdrop = collection?.backdrop_path || parts.find((movie) => movie?.backdrop_path)?.backdrop_path || collectionPoster
    const posterImages = parts
        .map((movie) => movie?.poster_path || movie?.backdrop_path || null)
        .filter(Boolean)
        .map((path) => `https://image.tmdb.org/t/p/w342${path}`)

    return (
        <UnifiedListDetailsLayout
            title={collection?.name || 'Colección'}
            description={collection?.description || ''}
            sourceLabel="Colección TMDb"
            posterImage={collectionPoster ? `https://image.tmdb.org/t/p/w500${collectionPoster}` : null}
            posterImages={posterImages}
            backdropImage={collectionBackdrop ? `https://image.tmdb.org/t/p/original${collectionBackdrop}` : null}
            scoreboardStats={[
                { icon: Film, label: 'PELÍCULAS', value: parts.length, tooltip: 'Películas de la colección' },
                ...(totalRuntime > 0 ? [{ icon: Clock3, label: 'DURACIÓN', value: `${Math.round(totalRuntime / 60)} h`, tooltip: 'Duración total aproximada' }] : []),
                { icon: ExternalLink, label: 'FUENTE', value: 'TMDb', tooltip: 'Datos de TMDb' },
            ]}
            scoreboardRatings={{
                tmdb: ratingSummaryBadge(averageRating),
                imdb: ratingSummaryBadge(imdbSummary),
            }}
            showTopBar={false}
            heroActions={<ListDetailsActionRow onBack={() => router.back()} externalHref={tmdbUrl} externalLabel="Ver colección en TMDb" />}
        >
            {parts.length > 0 ? (
                <FilterableListItems
                    items={filterableParts}
                    renderCard={(movie, meta, viewMode) => (
                        <MovieCard
                            key={`collection-${movie.id}`}
                            movie={movie}
                            idx={0}
                            imdbRating={meta.imdbRating}
                            disableHover={viewMode === 'compact'}
                        />
                    )}
                    emptyTitle="Sin resultados"
                    emptyText="No hay películas que coincidan con los filtros."
                />
            ) : !state.loading ? (
                <div className="py-20 text-center text-zinc-500">
                    <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/30 shadow-lg backdrop-blur-[28px]">
                        <Film className="h-10 w-10 opacity-40" />
                    </div>
                    <p className="text-sm font-medium">No hay películas en esta colección</p>
                </div>
            ) : null}
        </UnifiedListDetailsLayout>
    )

}
