'use client'


import OptimizedImage from "@/components/OptimizedImage";
import useModalGuard from "@/hooks/useModalGuard";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { LIQUID_GLASS_CARD, LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, X } from 'lucide-react'

function hostLabel(href) {
    try {
        return new URL(href).hostname.replace(/^www\./, '')
    } catch {
        return href
    }
}

export default function ExternalLinksModal({ open, onClose, links }) {
    const items = Array.isArray(links) ? links.filter((x) => x?.href) : []

    // Bloquea scroll de fondo + cierra con Escape mientras el modal está abierto.
    useModalGuard({ open, onClose })

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[1200]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    aria-modal="true"
                    role="dialog"
                    aria-labelledby="external-links-title"
                >
                    {/* Velo. El mismo que el resto de modales de la ficha
                        (`bg-black/60 backdrop-blur-lg`). El anterior, `black/70` con
                        apenas 2px de desenfoque, tapaba el cartel casi del todo: el
                        cristal de la hoja quedaba sobre una lámina negra y por muy
                        buena que fuera la receta no tenía color que atravesar. */}
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/60 backdrop-blur-lg"
                        onClick={onClose}
                        aria-label="Cerrar"
                    />

                    {/* Hoja.
                        MISMO CRISTAL QUE LOS PANELES DE LA FICHA. Antes llevaba su
                        propia copia del acabado y se había desviado: 34px de
                        desenfoque y un velo negro fuerte no dejaban pasar el color
                        del cartel, así que se leía como una placa gris en vez de
                        cristal. `LIQUID_GLASS_PANEL` es la receta que usan
                        AddToListModal, SoundtrackModal, VideoModal… La FORMA (hoja
                        abajo en móvil, tarjeta centrada en escritorio) sigue siendo
                        de este componente. */}
                    <motion.div
                        initial={{ y: 28, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 28, opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className={`
              absolute bottom-0 left-0 right-0 isolate overflow-hidden
              rounded-t-[2rem] ${LIQUID_GLASS_PANEL}
              px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]
              sm:left-1/2 sm:right-auto sm:bottom-6 sm:w-[min(440px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:rounded-[2rem]
            `}
                    >
                        <LiquidGlassOpticalLayers />

                        <div className="relative z-10 mx-auto mb-3 h-1.5 w-11 rounded-full bg-white/25 shadow-[0_1px_0_rgba(255,255,255,0.18)_inset]" />

                        <div className="relative z-10 mb-4 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <h2
                                    id="external-links-title"
                                    className="text-sm font-black uppercase tracking-wider text-white drop-shadow-sm"
                                >
                                    Enlaces externos
                                </h2>
                                <p className="mt-0.5 text-xs font-semibold text-zinc-400">
                                    Abrir fuente del título
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={onClose}
                                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[6px] transition hover:-translate-y-0.5 hover:bg-white/[0.1] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
                                aria-label="Cerrar"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="relative z-10">
                            {items.length === 0 ? (
                                <div
                                    className={`relative isolate overflow-hidden rounded-xl ${LIQUID_GLASS_CARD} px-4 py-7 text-center text-sm font-semibold text-zinc-400`}
                                >
                                    <LiquidGlassOpticalLayers />
                                    <span className="relative z-10">
                                        No hay enlaces disponibles para este título.
                                    </span>
                                </div>
                            ) : (
                                <ul className="grid grid-cols-1 gap-2.5">
                                    {items.map((it, index) => (
                                        <motion.li
                                            key={it.id || it.href}
                                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            transition={{
                                                duration: 0.24,
                                                delay: index * 0.035,
                                                ease: [0.22, 1, 0.36, 1],
                                            }}
                                        >
                                            {/* Misma tarjeta de cristal que las de
                                                información de la ficha (VisualMetaCard
                                                con `liquidGlass`): LIQUID_GLASS_CARD
                                                —sin sombra, para que en grupo no formen
                                                una banda oscura detrás— y las capas
                                                ópticas, que son las que dan el canto y
                                                el relieve. */}
                                            <a
                                                href={it.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={() => {
                                                    onClose?.()
                                                }}
                                                aria-label={`Abrir ${it.label || 'enlace externo'}`}
                                                className={`
                        group/link relative isolate flex min-h-[4.5rem] w-full transform-gpu items-center gap-3.5
                        overflow-hidden rounded-xl ${LIQUID_GLASS_CARD}
                        p-3.5 pl-4 text-left
                        transition duration-300
                        hover:-translate-y-0.5 hover:brightness-110
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400
                      `}
                                            >
                                                <LiquidGlassOpticalLayers />

                                                <span className="relative z-10 grid h-11 w-11 shrink-0 place-items-center overflow-visible">
                                                    {it.icon ? (
                                                        <OptimizedImage
                                                            src={it.icon}
                                                            alt=""
                                                            className="h-8 w-8 rounded-lg object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.45)] transition duration-300 group-hover/link:scale-110"
                                                            draggable="false"
                                                        />
                                                    ) : (
                                                        <ExternalLink className="h-5 w-5 text-zinc-300" />
                                                    )}
                                                </span>

                                                <span className="relative z-10 min-w-0 flex-1">
                                                    <span className="block text-sm font-black leading-tight text-white">
                                                        {it.label || 'Enlace'}
                                                    </span>
                                                    <span className="mt-1 block truncate text-xs font-semibold text-zinc-400 transition-colors group-hover/link:text-zinc-300">
                                                        {hostLabel(it.href)}
                                                    </span>
                                                </span>

                                                <span className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.055] text-zinc-400 transition duration-300 group-hover/link:bg-white/[0.09] group-hover/link:text-white">
                                                    <ExternalLink className="h-4 w-4" />
                                                </span>
                                            </a>
                                        </motion.li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
