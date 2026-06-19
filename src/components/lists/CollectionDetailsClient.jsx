'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { Film, ExternalLink } from 'lucide-react'
import { getExternalIds } from '@/lib/api/tmdb'
import { fetchOmdbByImdb } from '@/lib/api/omdb'
import ListPosterCard from '@/components/lists/ListPosterCard'
import FilterableListItems from '@/components/lists/ListDetailsTools'
import UnifiedListDetailsLayout from '@/components/lists/UnifiedListDetailsLayout'
import { formatPageTitle } from '@/lib/pageTitle'

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
    const [state, setState] = useState({
        loading: true,
        error: null,
        collection: null,
        parts: [],
    })

    const [imdbRatings, setImdbRatings] = useState({})
    const imdbIdCacheRef = useRef({})

    useEffect(() => {
        document.title = formatPageTitle(state.collection?.name || 'Colección')
    }, [state.collection?.name])

    // Fetch IMDb ratings for movies
    useEffect(() => {
        if (!state.parts.length) return

        const fetchImdbRatings = async () => {
            const ratings = {}
            
            // Process movies in batches to avoid overwhelming the API
            for (const movie of state.parts) {
                try {
                    const key = `movie:${movie.id}`
                    
                    // Get IMDb ID from TMDb external IDs
                    let imdbId = imdbIdCacheRef.current[key]
                    if (!imdbId) {
                        const ext = await getExternalIds('movie', movie.id)
                        imdbId = ext?.imdb_id || null
                        if (imdbId) {
                            imdbIdCacheRef.current[key] = imdbId
                        }
                    }

                    if (!imdbId) continue

                    // Fetch OMDB data
                    const omdb = await fetchOmdbByImdb(imdbId)
                    const rating = omdb?.imdbRating && omdb.imdbRating !== 'N/A'
                        ? Number(omdb.imdbRating)
                        : null

                    if (rating) {
                        ratings[key] = rating
                    }
                } catch (e) {
                    // Silently fail for individual movies
                    console.error(`Error fetching IMDb for movie ${movie.id}:`, e)
                }
            }

            setImdbRatings(ratings)
        }

        fetchImdbRatings()
    }, [state.parts])

    useEffect(() => {
        let cancelled = false
        if (!collectionId) return
        const cached = readCollectionDetailsCache(collectionId)
        setState({
            loading: !cached,
            error: null,
            collection: cached?.collection || null,
            parts: Array.isArray(cached?.parts) ? cached.parts : [],
        })

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

    const filterableParts = useMemo(
        () =>
            parts.map((movie) => ({
                ...movie,
                media_type: 'movie',
                imdbRating: imdbRatings[`movie:${movie.id}`],
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

    return (
        <UnifiedListDetailsLayout
            title={collection?.name || 'Colección'}
            description={collection?.description || ''}
            sourceLabel="Colección TMDb"
            posterImage={collectionPoster ? `https://image.tmdb.org/t/p/w500${collectionPoster}` : null}
            backdropImage={collectionBackdrop ? `https://image.tmdb.org/t/p/original${collectionBackdrop}` : null}
            badges={[`${parts.length} películas`, totalRuntime > 0 ? `${Math.round(totalRuntime / 60)}h total` : 'TMDb']}
            stats={[]}
            backHref="/lists"
            rightActions={
                tmdbUrl ? (
                    <a
                        href={tmdbUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-blue-400 hover:border-blue-500/50 transition"
                        title="Ver en TMDb"
                    >
                        <ExternalLink className="w-5 h-5" />
                    </a>
                ) : null
            }
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
