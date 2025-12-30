// src/components/DetailsSectionMenu.jsx
'use client'

import { useMemo } from 'react'

export default function DetailsSectionMenu({
    items = [],
    activeId,
    onChange,
    columns = 4, // compat (ya no lo usamos)
    className = '',
}) {
    const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items])

    return (
        <div className={`w-full ${className}`}>
            {/* Misma transparencia/estilo que ratings + líneas */}
            <div className="py-2 border-y border-white/10 bg-white/5 backdrop-blur-md rounded-3xl">
                {/* Una sola fila horizontal + ocupa todo el ancho */}
                <div
                    className="
            flex items-stretch flex-nowrap
            w-full
            overflow-x-auto
            px-2
            gap-2
            [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
          "
                >
                    {safeItems.map((it) => {
                        const isActive = it.id === activeId
                        const disabled = !!it.disabled
                        const Icon = it.icon

                        // “Fondos” -> “Vídeos” (solo texto aquí)
                        const isBackgrounds = it.id === 'backgrounds'
                        const label = isBackgrounds ? 'Vídeos' : it.label

                        return (
                            <button
                                key={it.id}
                                type="button"
                                onClick={() => !disabled && onChange?.(it.id)}
                                disabled={disabled}
                                title={label}
                                className={`
                  group relative
                  flex flex-col items-center justify-center
                  
                  /* ✅ CLAVE: crece para ocupar todo el ancho */
                  flex-1 basis-0
                  /* ✅ mínimo para que si hay muchos, haga scroll */
                  min-w-[56px] sm:min-w-[92px]

                  rounded-2xl border transition-all duration-300 ease-out
                  select-none outline-none
                  h-12 sm:h-14
                  px-1
                  active:scale-95

                  ${disabled
                                        ? 'opacity-30 cursor-not-allowed border-transparent grayscale'
                                        : isActive
                                            ? 'bg-yellow-500/10 border-yellow-500/30 shadow-[0_0_20px_rgba(234,179,8,0.15)]'
                                            : 'bg-transparent border-transparent hover:bg-white/10 hover:border-white/10'
                                    }
                `}
                            >
                                {/* ICONO */}
                                {Icon && (
                                    <span
                                        className={`
                      flex items-center justify-center rounded-xl transition-colors duration-300
                      h-8 w-8
                      ${isActive
                                                ? 'text-yellow-400 bg-yellow-400/10'
                                                : 'text-zinc-400 group-hover:text-zinc-100 bg-white/5 group-hover:bg-white/10'
                                            }
                    `}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </span>
                                )}

                                {/* TEXTO (solo en sm+) */}
                                <span
                                    className={`
                    hidden sm:block mt-1
                    text-[10px] font-bold uppercase tracking-widest
                    text-center leading-tight w-full px-1
                    transition-colors duration-300
                    ${isActive ? 'text-yellow-100' : 'text-zinc-500 group-hover:text-zinc-300'}
                  `}
                                >
                                    {label}
                                </span>

                                {/* BADGE */}
                                {typeof it.count === 'number' && (
                                    <span
                                        className={`
                      absolute top-1 right-1
                      flex min-w-[18px] h-[18px] items-center justify-center rounded-full
                      px-1 text-[9px] font-black border backdrop-blur-sm
                      transition-transform duration-300
                      ${isActive
                                                ? 'bg-yellow-500 text-black border-yellow-400 scale-110'
                                                : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/50 group-hover:border-zinc-600 group-hover:text-zinc-200'
                                            }
                    `}
                                    >
                                        {it.count}
                                    </span>
                                )}

                                {/* Indicador inferior (móvil) */}
                                {isActive && (
                                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)] sm:hidden" />
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
