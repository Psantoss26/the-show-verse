// src/components/details/modals/VideoModal.jsx
'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, X, PlayCircle } from 'lucide-react'
import { videoEmbedUrl, videoExternalUrl } from '@/lib/details/videos'

export default function VideoModal({ open, onClose, video }) {
    // Estado local para controlar la animación de montaje si es necesario, 
    // pero aquí usaremos clases de Tailwind 'animate-in' para simplicidad.

    // Bloqueo de scroll
    useEffect(() => {
        if (!open) return
        const prev = document.body.style.overflow
        const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth

        document.body.style.overflow = 'hidden'
        // Evita el salto visual de la barra de scroll
        if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`

        return () => {
            document.body.style.overflow = prev
            document.body.style.paddingRight = ''
        }
    }, [open])

    // Cerrar con ESC
    useEffect(() => {
        if (!open) return
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!open || !video) return null

    const embed = videoEmbedUrl(video, true)
    const ext = videoExternalUrl(video)

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6">

            {/* BACKDROP: Oscuro intenso + desenfoque fuerte + Animación de fade */}
            <div
                className="absolute inset-0 bg-black/90 backdrop-blur-xl transition-opacity duration-300 animate-in fade-in"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* MODAL CONTAINER: Animación de zoom sutil + Bordes premium */}
            <div
                className="relative w-full max-w-5xl flex flex-col 
                           rounded-3xl border border-white/10 bg-[#0a0a0a] 
                           shadow-[0_0_50px_-12px_rgba(255,255,255,0.1)] 
                           overflow-hidden animate-in zoom-in-95 duration-300 ease-out"
                role="dialog"
                aria-modal="true"
            >
                {/* HEADER: Minimalista */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                        <h3 className="text-lg md:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 truncate">
                            {video.name || 'Tráiler Oficial'}
                        </h3>
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                            <span className="bg-white/10 px-1.5 py-0.5 rounded text-zinc-300">
                                {video.type || 'Video'}
                            </span>
                            <span>•</span>
                            <span>{video.site || 'YouTube'}</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="group relative flex h-10 w-10 items-center justify-center rounded-full 
                                   bg-white/5 border border-white/5 text-zinc-400 
                                   transition-all duration-200 hover:bg-white/10 hover:text-white hover:scale-105 active:scale-95"
                        title="Cerrar (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* VIDEO AREA: Aspect Ratio cinematográfico */}
                <div className="relative w-full aspect-video bg-black group">
                    {embed ? (
                        <iframe
                            key={video.key}
                            src={embed}
                            title={video.name || 'Video'}
                            allow="autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                            className="absolute inset-0 w-full h-full"
                        />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500">
                            <PlayCircle className="w-12 h-12 opacity-20" />
                            <p className="text-sm">No se puede reproducir el vídeo insertado.</p>
                        </div>
                    )}
                </div>

                {/* FOOTER: Información y acciones */}
                <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-zinc-900/50">
                    <div className="text-xs font-medium text-zinc-500">
                        {video.published_at && (
                            <span>
                                Publicado el <span className="text-zinc-300">{new Date(video.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                            </span>
                        )}
                    </div>

                    {ext && (
                        <a
                            href={ext}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 
                                       px-4 py-2 text-xs font-bold uppercase tracking-wide text-zinc-200 
                                       transition-all hover:bg-white/10 hover:border-white/20 hover:text-white active:scale-95"
                        >
                            <span>Ver en {video.site}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    )}
                </div>
            </div>
        </div>
    )
}