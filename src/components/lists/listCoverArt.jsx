"use client";

// Portada de las listas a partir de sus títulos: arte SIN TEXTO de cada uno
// (`coverPoster`), su caché y la «estantería» de pósters del modo backdrop.
// La comparten la página de detalles de una lista (UnifiedListDetailsLayout)
// y la vista «Lista con backdrop» de la Actividad (Perfil y Social), para que
// una lista se vea igual en los dos sitios.

import { useEffect, useMemo, useState } from 'react'
import OptimizedImage from '@/components/OptimizedImage'
import { buildPosterCollageTargets } from '@/lib/lists/posterCollage'
import { posterShelfLayout } from '@/lib/lists/coverBackdrop'
import { fetchTmdbImages } from '@/lib/tmdb/imageRequests'
import { requestListArtwork } from '@/lib/tmdb/artworkBatch'
import { pickListArtwork } from '@/lib/tmdb/artworkPicks'

// Arte de cada título para la portada de la lista (`coverPoster`): id → ruta,
// null (sin arte) o la promesa en vuelo.
const coverArtCache = new Map()

function posterUrl(filePath) {
    return filePath ? `https://image.tmdb.org/t/p/w342${filePath}` : null
}

function preloadPoster(src) {
    if (!src || typeof window === 'undefined') return Promise.resolve(null)
    return new Promise((resolve) => {
        const image = new Image()
        image.onload = () => resolve(src)
        image.onerror = () => resolve(null)
        image.src = src
    })
}

// PORTADA DE LA LISTA: arte SIN TEXTO de cada título (`coverPoster` de
// lib/tmdb/artworkPicks: póster sin idioma → backdrop sin idioma → póster de
// la escalera de idioma). El mosaico recorta cada imagen a su celda y con un
// póster con texto cortaba los títulos impresos. Se pide en LOTE (/api/tmdb/artwork: una
// petición para toda la lista, cacheada un día en el servidor) y, si el lote
// falla, a /images del título con el mismo criterio.
export async function resolveCoverArt(target, priority) {
    if (coverArtCache.has(target.key)) {
        return coverArtCache.get(target.key)
    }

    const request = requestListArtwork(target.mediaType, target.tmdbId)
        .then(async (picks) => {
            if (picks) return picks.coverPoster || null
            const images = await fetchTmdbImages(target.mediaType, target.tmdbId, { priority })
            return pickListArtwork(images)?.coverPoster || null
        })
        .catch(() => null)

    coverArtCache.set(target.key, request)
    const posterPath = await request
    coverArtCache.set(target.key, posterPath)
    return posterPath
}

export function useCoverArtImages(items) {
    const targets = useMemo(() => buildPosterCollageTargets(items), [items])
    const targetKey = targets.map((target) => target.key).join('|')
    const [state, setState] = useState({ key: '', pending: false, images: [] })

    useEffect(() => {
        let cancelled = false

        if (!targets.length) {
            setState({ key: targetKey, pending: false, images: [] })
            return undefined
        }

        // Ya resueltos: el render los pinta desde la caché; se fija ese mismo
        // estado sin pasar por `pending` (haría parpadear la portada).
        const resolved = targets.map((target) => coverArtCache.get(target.key))
        if (resolved.every((value) => value === null || typeof value === 'string')) {
            setState({ key: targetKey, pending: false, images: resolved.filter(Boolean).map(posterUrl) })
            return undefined
        }

        setState({ key: targetKey, pending: true, images: [] })
        void Promise.all(
            targets.map(async (target, index) => {
                const posterPath = await resolveCoverArt(
                    target,
                    index === 0 ? 'high' : 'normal',
                )
                return preloadPoster(posterUrl(posterPath))
            }),
        ).then((images) => {
            if (cancelled) return
            setState({
                key: targetKey,
                pending: false,
                images: images.filter(Boolean),
            })
        })

        return () => {
            cancelled = true
        }
    }, [targetKey])

    if (state.key === targetKey) return state
    // Pósters ya resueltos en esta sesión (volver atrás): salen en el primer
    // render, sin un fotograma de huecos mientras el efecto los recupera.
    const resolved = targets.map((target) => coverArtCache.get(target.key))
    if (targets.length && resolved.every((value) => value === null || typeof value === 'string')) {
        return { key: targetKey, pending: false, images: resolved.filter(Boolean).map(posterUrl) }
    }
    return { key: targetKey, pending: targets.length > 0, images: [] }
}

/** Lo ya resuelto del arte de un título (`key` de buildPosterCollageTargets). */
export function peekCoverArt(key) {
    return coverArtCache.get(key)
}

export function PosterCover({ src, alt = "", priority = false }) {
    return (
        <OptimizedImage
            src={src}
            alt={alt}
            aria-hidden={alt ? undefined : true}
            priority={priority}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            className="h-full w-full object-cover"
        />
    )
}

// Acabado del marco de la portada (cristal, esquinas y sombra). La FORMA la
// pone CoverShape, que persiste entre modos para poder animar el cambio.
export const POSTER_FRAME_VISUAL = 'overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/35 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-[28px]'

// Portada BACKDROP de una lista: no tiene imagen horizontal propia, así que la
// caja 16:9 se llena con una «estantería» de los pósters de sus títulos, enteros
// (2:3, sin recortar), en tantas filas como haga falta para que salgan lo más
// grandes posible (lib/lists/coverBackdrop). Detrás, el primero difuminado.
export function PosterShelf({ images, pending, count, frameClassName = POSTER_FRAME_VISUAL }) {
    const posters = images.slice(0, 20)
    // Mientras se resuelven los pósters ingleses, huecos en su sitio: la caja
    // ya está en 16:9 y no cambia de forma al llegar.
    const { tiles } = posterShelfLayout(pending ? Math.min(20, count) : posters.length)
    return (
        <div className={`absolute inset-0 ${frameClassName}`} aria-hidden="true">
            {posters[0] ? (
                // Fondo decorativo: <img> directo con filtro, sin next/image.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={posters[0]}
                    alt=""
                    decoding="async"
                    className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.45] saturate-[1.15]"
                />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-black/40" />
            {tiles.map((tile, index) => (
                <div
                    key={pending ? `pending-${index}` : posters[index]}
                    className={`absolute overflow-hidden rounded-md bg-zinc-900 shadow-[0_12px_28px_-10px_rgba(0,0,0,0.85)] ${pending ? 'animate-pulse' : ''}`}
                    style={{
                        left: `${tile.left}%`,
                        top: `${tile.top}%`,
                        width: `${tile.width}%`,
                        height: `${tile.height}%`,
                    }}
                >
                    {pending ? null : <PosterCover src={posters[index]} />}
                </div>
            ))}
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]" />
        </div>
    )
}

