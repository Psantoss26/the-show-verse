'use client'

import { Eye, EyeOff } from 'lucide-react'

export default function TraktWatchedControl({
    connected,
    watched,
    plays,
    busy,
    onOpen
}) {
    const disabled = !connected || !!busy

    return (
        <button
            type="button"
            onClick={() => onOpen?.()}
            disabled={disabled}
            className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all border transform-gpu
        ${!connected
                    ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                    : watched
                        ? 'bg-emerald-500/18 border-emerald-500/55 text-emerald-300 hover:bg-emerald-500/25 hover:shadow-[0_0_25px_rgba(16,185,129,0.25)]'
                        : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:shadow-lg'
                }`}
            title={
                !connected
                    ? 'Conecta Trakt para usar Vistos'
                    : watched
                        ? 'Ver historial de vistos (Trakt)'
                        : 'Marcar / gestionar vistos (Trakt)'
            }
        >
            {watched ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}

            {Number(plays || 0) > 0 && (
                <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold
          bg-black/70 border border-white/15 text-white flex items-center justify-center">
                    {plays}
                </span>
            )}
        </button>
    )
}
