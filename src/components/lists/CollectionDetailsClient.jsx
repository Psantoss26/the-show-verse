'use client'

import { useEffect, useLayoutEffect, useState, useMemo } from 'react'
import { useRouter } from "@/lib/offline/useOfflineRouter";
import { Banknote, Clock3, ExternalLink, Film } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import CollectionEditModal from '@/components/lists/CollectionEditModal'
import CollectionCastModal from '@/components/lists/CollectionCastModal'
import { formatCollectionRevenue } from '@/lib/lists/collectionStats'
import { applyCollectionCustomization, collectionCustomizationKey, readCollectionArtworkOverride } from '@/lib/lists/collectionCustomization'
import ListPosterCard from '@/components/lists/ListPosterCard'
import FilterableListItems from '@/components/lists/ListDetailsTools'
import UnifiedListDetailsLayout from '@/components/lists/UnifiedListDetailsLayout'
import ListDetailsActionRow from '@/components/lists/ListDetailsActionRow'
import { formatPageTitle } from '@/lib/pageTitle'
import {
    resolveCollectionDetailsInitialState,
} from '@/lib/lists/detailsInitialState'
import { ratingSummaryBadge, summarizeListRatings } from '@/lib/lists/ratingSummary'
import useListImdbRatings from '@/hooks/useListImdbRatings'
import { useIsHistoryNavigation } from '@/lib/hooks/useIsHistoryNavigation'
import { fetchTmdbImages } from '@/lib/tmdb/imageRequests'
import { pickHeroBackdropPath, pickMobileHeroPosterPath } from '@/lib/details/tmdbImages'
import { buildListShareCard, buildListShareStory, listYearSpan, normalizeListShareItem } from '@/lib/lists/shareList'

const COLLECTION_DETAILS_CACHE_TTL_MS = 30 * 60 * 1000
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function getCollectionDetailsCacheKey(collectionId) {
    return collectionId ? `showverse:list-details:collection:${collectionId}:v2` : null
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

// Galería /images de cada colección ya resuelta en esta sesión: al volver a la
// página el fondo sale en el primer render, sin esperar a la red ni fundirse.
const collectionGalleryCache = new Map()

// Galería de la colección para elegir el fondo con el criterio de la ficha.
// `done` distingue "aún no se sabe" (no se pinta nada, para no enseñar la
// portada principal y sustituirla después) de "no hay galería" (se usa la
// principal).
function useCollectionGallery(collectionId) {
    const [state, setState] = useState(() => ({
        id: collectionId,
        done: collectionGalleryCache.has(collectionId),
        images: collectionGalleryCache.get(collectionId) || null,
    }))

    useEffect(() => {
        if (!collectionId || collectionGalleryCache.has(collectionId)) return undefined
        let cancelled = false
        fetchTmdbImages('collection', collectionId, { priority: 'high' }).then((images) => {
            if (images) collectionGalleryCache.set(collectionId, images)
            if (!cancelled) setState({ id: collectionId, done: true, images })
        })
        return () => {
            cancelled = true
        }
    }, [collectionId])

    if (state.id === collectionId) return state
    const cached = collectionGalleryCache.get(collectionId)
    return { id: collectionId, done: Boolean(cached), images: cached || null }
}

function MovieCard({ movie, idx, imdbRating, disableHover = false, posterLoading = false }) {
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
                posterLoading={posterLoading}
                disableHover={disableHover}
            />
        </div>
    )
}

export default function CollectionDetailsClient({ collectionId }) {
    const router = useRouter()
    const { preferences } = useAuth()
    const [editing, setEditing] = useState(false)
    const [castOpen, setCastOpen] = useState(false)
    const isBackNav = useIsHistoryNavigation()
    const gallery = useCollectionGallery(collectionId)
    // Conserva el mismo primer árbol que el servidor. Al regresar, la caché se
    // incorpora antes del primer repintado para que el scroll siga teniendo la
    // altura completa de la colección.
    const [state, setState] = useState(() => resolveCollectionDetailsInitialState(null))

    useClientLayoutEffect(() => {
        if (!isBackNav) return
        const cached = readCollectionDetailsCache(collectionId)
        if (cached) setState(resolveCollectionDetailsInitialState(cached))
    }, [isBackNav, collectionId])

    const artworkOverride = readCollectionArtworkOverride(preferences, collectionId)
    const collection = applyCollectionCustomization(
        state.collection,
        preferences?.uiSettings?.[collectionCustomizationKey(collectionId)],
        artworkOverride,
    )
    useEffect(() => {
        document.title = formatPageTitle(collection?.name || 'Colección')
    }, [collection?.name])

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

    const { parts } = state
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

    const collectionPoster = collection?.poster_path || null
    const revenueLabel = formatCollectionRevenue(collection?.revenue)
    const castMembers = Array.isArray(collection?.cast) ? collection.cast : []
    // Fondo como en DetailsClient: backdrop en escritorio y póster textless en
    // móvil, sacados de la galería de la colección. Lo que el usuario eligió al
    // editar la colección (fondo de escritorio y fondo móvil, por separado)
    // manda sobre la elección automática.
    const original = state.collection
    const customBackdrop = artworkOverride.backdrop ? collection?.backdrop_path : null
    const autoBackdrop = gallery.done
        ? pickHeroBackdropPath({ backdropPath: original?.backdrop_path, backdrops: gallery.images?.backdrops }) ||
            parts.find((movie) => movie?.backdrop_path)?.backdrop_path ||
            null
        : null
    const autoMobileBackground = gallery.done
        ? pickMobileHeroPosterPath({ posterPath: original?.poster_path, posters: gallery.images?.posters })
        : null
    const backgroundBackdrop = customBackdrop || autoBackdrop
    const backgroundPoster = collection?.mobile_background_path || autoMobileBackground

    // IMAGEN Y VÍDEO COMPARTIBLES: la portada es el póster oficial CON idioma
    // (el del marco de la página, incluida la elección de «Editar colección»),
    // entero y sin texto encima: ya lleva el título impreso. El fondo del vídeo
    // es el fondo móvil sin texto. El reparto destacado tiene su propia sección.
    const shareItems = parts.map((movie) => normalizeListShareItem(movie, imdbRatings))
    const yearSpan = listYearSpan(shareItems)
    const share = {
        title: collection?.name || 'Colección',
        card: buildListShareCard({
            kind: 'collection',
            title: collection?.name || 'Colección',
            label: 'Colección TMDb',
            layout: 'poster',
            coverPath: collectionPoster || backgroundPoster,
            backdropPath: backgroundPoster || collectionPoster,
            items: shareItems,
            count: parts.length,
            noun: 'movie',
            meta: [yearSpan],
            tmdb: averageRating,
            imdb: imdbSummary,
        }),
        story: buildListShareStory({
            items: shareItems,
            count: parts.length,
            noun: 'movie',
            description: collection?.description || '',
            cast: castMembers,
            facts: [
                { icon: 'film', label: 'Películas', value: String(parts.length) },
                ...(yearSpan ? [{ icon: 'calendar', label: 'Años', value: yearSpan }] : []),
                ...(totalRuntime > 0 ? [{ icon: 'clock', label: 'Duración', value: `${Math.round(totalRuntime / 60)} h` }] : []),
                ...(revenueLabel ? [{ icon: 'trending', label: 'Ingresos', value: revenueLabel }] : []),
            ],
        }),
    }

    return (
        <>
        <UnifiedListDetailsLayout
            title={collection?.name || 'Colección'}
            description={collection?.description || ''}
            sourceLabel="Colección TMDb"
            posterImage={collectionPoster ? `https://image.tmdb.org/t/p/w780${collectionPoster}` : null}
            posterLowImage={collectionPoster ? `https://image.tmdb.org/t/p/w342${collectionPoster}` : null}
            heroBackground={{
                desktop: backgroundBackdrop ? `https://image.tmdb.org/t/p/original${backgroundBackdrop}` : null,
                mobile: backgroundPoster ? `https://image.tmdb.org/t/p/w780${backgroundPoster}` : null,
            }}
            scoreboardStats={[
                { icon: Film, label: 'PELÍCULAS', value: parts.length, tooltip: 'Películas de la colección' },
                ...(totalRuntime > 0 ? [{ icon: Clock3, label: 'DURACIÓN', value: `${Math.round(totalRuntime / 60)} h`, tooltip: 'Duración total aproximada' }] : []),
                ...(revenueLabel ? [{ icon: Banknote, label: 'INGRESOS', value: revenueLabel, tooltip: 'Recaudación total en taquilla de las películas con dato en TMDb' }] : []),
                { icon: ExternalLink, label: 'FUENTE', value: 'TMDb', tooltip: 'Datos de TMDb' },
            ]}
            scoreboardRatings={{
                tmdb: ratingSummaryBadge(averageRating),
                imdb: ratingSummaryBadge(imdbSummary),
            }}
            showTopBar={false}
            heroActions={<ListDetailsActionRow onBack={() => router.back()} onEdit={() => setEditing(true)} editLabel="Editar colección" externalHref={tmdbUrl} externalLabel="Ver colección en TMDb" onCast={castMembers.length ? () => setCastOpen(true) : null} share={share} />}
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
                            posterLoading={meta.posterLoading}
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
        <CollectionCastModal open={castOpen} onClose={() => setCastOpen(false)} cast={castMembers} collectionName={collection?.name} />
        {editing && collection && (
            <CollectionEditModal
                key={collectionId}
                // "Original" = lo que se ve sin selección propia: los fondos
                // automáticos de la galería, no la portada principal de TMDb.
                original={{
                    ...original,
                    backdrop_path: autoBackdrop || original?.backdrop_path || null,
                    mobile_background_path: autoMobileBackground,
                }}
                collection={{
                    ...collection,
                    backdrop_path: backgroundBackdrop || null,
                    mobile_background_path: backgroundPoster || null,
                }}
                onClose={() => setEditing(false)}
            />
        )}
        </>
    )

}
