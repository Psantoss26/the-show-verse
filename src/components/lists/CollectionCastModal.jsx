'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Users, X } from 'lucide-react'
import OptimizedImage from '@/components/OptimizedImage'
import useModalGuard from '@/hooks/useModalGuard'
import { LIQUID_GLASS_MODAL_HEADER, LIQUID_GLASS_PANEL } from '@/lib/ui/liquidGlass'

// Tarjeta de la sección "Reparto Principal" de DetailsClient. El `title` lista
// personajes y películas de la saga para quien quiera el detalle.
function CastCard({ actor, onNavigate }) {
    const detail = actor.appearances
        .map((item) => `${item.title}${item.year ? ` (${item.year})` : ''}${item.character ? ` — ${item.character}` : ''}`)
        .join('\n')

    return (
        <li>
            <Link
                href={`/details/person/${actor.id}`}
                onClick={onNavigate}
                title={detail}
                className="block group relative bg-zinc-900 rounded-xl overflow-hidden shadow-md lg:hover:shadow-yellow-900/20 transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
            >
                <div className="aspect-[2/3] overflow-hidden relative">
                    {actor.profile_path ? (
                        <OptimizedImage
                            src={`https://image.tmdb.org/t/p/w342${actor.profile_path}`}
                            alt={actor.name}
                            loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 grayscale-[15%] group-hover:grayscale-0"
                        />
                    ) : (
                        <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-neutral-500 transition-colors duration-500 group-hover:bg-neutral-700">
                            <Users size={40} />
                        </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100" />

                    <div className="absolute bottom-0 left-0 right-0 px-2 pb-3 pt-3 sm:p-3 sm:pb-4 transition-transform duration-500 ease-out translate-y-2 group-hover:translate-y-0">
                        <p className="text-white font-extrabold text-[11px] sm:text-sm leading-tight line-clamp-2 sm:line-clamp-1 drop-shadow-sm">
                            {actor.name}
                        </p>
                        {actor.character ? (
                            <p className="mt-0.5 text-zinc-300 group-hover:text-yellow-400 text-[9px] sm:text-xs font-semibold leading-tight line-clamp-2 sm:line-clamp-1 transition-colors duration-300 drop-shadow-sm">
                                {actor.character}
                            </p>
                        ) : null}
                    </div>
                </div>
            </Link>
        </li>
    )
}

/**
 * Reparto destacado de una colección en un modal con la misma estructura que
 * los de la ficha (ExternalLinksModal): portal, velo difuminado y tarjeta de
 * cristal con cabecera fija.
 */
export default function CollectionCastModal({ open, onClose, cast, collectionName }) {
    const [portalReady, setPortalReady] = useState(false)
    const items = Array.isArray(cast) ? cast : []

    useModalGuard({ open, onClose })
    useEffect(() => setPortalReady(true), [])

    if (!open || !portalReady) return null

    return createPortal(
        <div
            data-detail-modal-layer=""
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            aria-modal="true"
            role="dialog"
            aria-labelledby="collection-cast-title"
        >
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in duration-300"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                className={`relative flex max-h-[85dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL} animate-in zoom-in-95 duration-300 ease-out`}
            >
                <div className={`flex w-full shrink-0 items-center justify-between gap-4 ${LIQUID_GLASS_MODAL_HEADER} p-6 sm:px-8 sm:pb-6 sm:pt-8`}>
                    <div className="min-w-0">
                        <h2
                            id="collection-cast-title"
                            className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-black text-transparent"
                        >
                            Reparto destacado
                        </h2>
                        <p className="mt-1 truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
                            {collectionName || 'Colección'}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
                        aria-label="Cerrar"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Barra fina y translúcida sin raíl, la de EpisodeRatingsModal. */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-8 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] sm:px-8 sm:py-6">
                    {items.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-10 text-center text-sm font-semibold text-zinc-400">
                            No hay reparto disponible para esta colección.
                        </div>
                    ) : (
                        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-4 lg:grid-cols-5">
                            {items.map((actor) => (
                                <CastCard key={actor.id} actor={actor} onNavigate={onClose} />
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    )
}
