'use client'


import OptimizedImage from "@/components/OptimizedImage";
import useModalGuard from "@/hooks/useModalGuard";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, MonitorPlay, X } from 'lucide-react'

function hostLabel(href) {
    try {
        return new URL(href).hostname.replace(/^www\./, '')
    } catch {
        return href
    }
}

export default function ExternalLinksModal({
    open,
    onClose,
    links,
    mode = 'links',
}) {
    const items = Array.isArray(links) ? links.filter((x) => x?.href) : []
    const isPlatformsMode = mode === 'platforms'
    const modalTitle = isPlatformsMode ? 'Plataformas disponibles' : 'Enlaces externos'
    const modalSubtitle = isPlatformsMode ? 'Dónde ver este título' : 'Fuentes y plataformas'
    const emptyMessage = isPlatformsMode
        ? 'No hay plataformas disponibles para este título.'
        : 'No hay enlaces disponibles para este título.'
    const itemNoun = isPlatformsMode ? 'plataforma' : 'enlace externo'
    const FallbackIcon = isPlatformsMode ? MonitorPlay : ExternalLink

    // Bloquea scroll de fondo + cierra con Escape mientras el modal está abierto.
    useModalGuard({ open, onClose })

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[1200] flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    aria-modal="true"
                    role="dialog"
                    aria-labelledby="external-links-title"
                >
                    {/* Mismo velo que los modales de las acciones principales. */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-lg"
                        onClick={onClose}
                        aria-hidden="true"
                    />

                    {/* Tarjeta centrada: comparte estructura, cristal y escala de
                        entrada con los modales de tráiler, lista y soundtrack. */}
                    <motion.div
                        initial={{ y: 28, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 28, opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className={`relative flex max-h-[85dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL}`}
                    >
                        <div className="flex w-full shrink-0 items-center justify-between bg-white/[0.025] p-6 sm:px-8 sm:pb-6 sm:pt-8">
                            <div className="min-w-0">
                                <h2
                                    id="external-links-title"
                                    className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-black text-transparent"
                                >
                                    {modalTitle}
                                </h2>
                                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                                    {modalSubtitle}
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

                        <div className="flex-1 overflow-y-auto p-6 pb-8 sm:px-8">
                            {items.length === 0 ? (
                                <div
                                    className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-10 text-center text-sm font-semibold text-zinc-400"
                                >
                                    {emptyMessage}
                                </div>
                            ) : (
                                <ul className="space-y-2">
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
                                            <a
                                                href={it.href}
                                                target={it.target || "_blank"}
                                                rel={it.rel || "noopener noreferrer"}
                                                onClick={() => {
                                                    onClose?.()
                                                }}
                                                aria-label={`Abrir ${it.label || it.title || itemNoun}`}
                                                className="group/link flex min-h-[4.5rem] w-full items-center gap-3.5 rounded-2xl bg-white/[0.03] p-4 text-left transition duration-300 hover:-translate-y-0.5 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
                                            >
                                                <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-visible">
                                                    {it.icon ? (
                                                        <>
                                                            <OptimizedImage
                                                                src={it.icon}
                                                                alt=""
                                                                className="h-8 w-8 rounded-lg object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.45)] transition duration-300 group-hover/link:scale-110"
                                                                draggable="false"
                                                            />
                                                            {isPlatformsMode && it.isPlexProvider && (
                                                                <span
                                                                    aria-label="Disponible en tu servidor Plex"
                                                                    className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-black"
                                                                />
                                                            )}
                                                        </>
                                                    ) : (
                                                        <FallbackIcon className="h-5 w-5 text-zinc-300" />
                                                    )}
                                                </span>

                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-sm font-black leading-tight text-white">
                                                        {it.label || it.title || (isPlatformsMode ? 'Plataforma' : 'Enlace')}
                                                    </span>
                                                    <span className="mt-1 block truncate text-xs font-semibold text-zinc-400 transition-colors group-hover/link:text-zinc-300">
                                                        {hostLabel(it.href)}
                                                    </span>
                                                </span>

                                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 text-zinc-400 transition duration-300 group-hover/link:bg-white/10 group-hover/link:text-white">
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
