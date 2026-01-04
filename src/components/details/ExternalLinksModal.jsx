'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, X } from 'lucide-react'

export default function ExternalLinksModal({ open, onClose, links }) {
    const items = Array.isArray(links) ? links.filter((x) => x?.href) : []

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
                >
                    {/* Overlay */}
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/60"
                        onClick={onClose}
                        aria-label="Cerrar"
                    />

                    {/* Sheet */}
                    <motion.div
                        initial={{ y: 24, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 24, opacity: 0 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="
              absolute bottom-0 left-0 right-0
              rounded-t-3xl border-t border-white/10
              bg-[#101010]/95 backdrop-blur
              px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]
            "
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-extrabold tracking-wide text-white">
                                Enlaces externos
                            </div>

                            <button
                                type="button"
                                onClick={onClose}
                                className="w-9 h-9 rounded-full border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 transition"
                                aria-label="Cerrar"
                            >
                                <X className="w-4 h-4 mx-auto" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            {items.length === 0 ? (
                                <div className="text-sm text-zinc-400 py-6 text-center">
                                    No hay enlaces disponibles para este título.
                                </div>
                            ) : (
                                items.map((it) => (
                                    <button
                                        key={it.id || it.href}
                                        type="button"
                                        onClick={() => {
                                            onClose?.()
                                            window.open(it.href, '_blank', 'noopener,noreferrer')
                                        }}
                                        className="
                      flex items-center gap-3 w-full
                      rounded-2xl border border-white/10 bg-white/5
                      px-3 py-3 text-left
                      hover:bg-white/10 hover:border-white/15 transition
                    "
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center overflow-hidden">
                                            {it.icon ? (
                                                <img src={it.icon} alt="" className="w-6 h-6 object-contain" />
                                            ) : (
                                                <div className="w-6 h-6" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-white">
                                                {it.label || 'Enlace'}
                                            </div>
                                            <div className="text-xs text-zinc-400 truncate">
                                                {it.href}
                                            </div>
                                        </div>

                                        <ExternalLink className="w-4 h-4 text-zinc-400" />
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}