'use client'


import OptimizedImage from "@/components/OptimizedImage";
import useModalGuard from "@/hooks/useModalGuard";
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
                    {/* Overlay */}
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
                        onClick={onClose}
                        aria-label="Cerrar"
                    />

                    {/* Sheet */}
                    <motion.div
                        initial={{ y: 28, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 28, opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className="
              absolute bottom-0 left-0 right-0 isolate overflow-hidden
              rounded-t-[1.75rem] ring-1 ring-inset ring-white/[0.08]
              bg-black/[0.28] bg-gradient-to-br from-white/[0.16] via-white/[0.06] to-black/[0.34]
              shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(255,255,255,0.03),0_28px_70px_-18px_rgba(0,0,0,0.9)]
              backdrop-blur-[34px]
              px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]
              sm:left-1/2 sm:right-auto sm:bottom-6 sm:w-[min(440px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:rounded-3xl
            "
                    >
                        <div
                            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]"
                            style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
                        />
                        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-yellow-400/10 blur-3xl" />
                        <div className="pointer-events-none absolute -left-20 bottom-0 h-44 w-44 rounded-full bg-white/5 blur-3xl" />

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
                                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-7 text-center text-sm font-semibold text-zinc-400">
                                    No hay enlaces disponibles para este título.
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
                                            <a
                                                href={it.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={() => {
                                            onClose?.()
                                        }}
                                                aria-label={`Abrir ${it.label || 'enlace externo'}`}
                                                className="
                        group/link relative isolate flex min-h-[4.5rem] w-full items-center gap-3.5
                        overflow-hidden rounded-2xl ring-1 ring-inset ring-white/[0.07]
                        bg-black/[0.04] bg-gradient-to-br from-white/10 via-transparent to-black/10
                        px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(255,255,255,0.025)] backdrop-blur-[6px]
                        transition duration-300
                        hover:-translate-y-0.5 hover:bg-white/[0.08] hover:ring-white/[0.11]
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400
                      "
                                            >
                                                <span
                                                    className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02] opacity-90"
                                                    style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
                                                />

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
