'use client'

import React, { useMemo, useRef, useLayoutEffect, useEffect, useState } from 'react'

export default function DetailsSectionMenu({
    items = [],
    activeId,
    onChange,
    className = '',
    maxWidthClass = 'max-w-[1400px]',
}) {
    const safeItems = useMemo(() => (Array.isArray(items) ? items.filter(Boolean) : []), [items])

    const containerRef = useRef(null)
    const innerRef = useRef(null)

    const [scale, setScale] = useState(1)
    const [fits, setFits] = useState(true)

    // ✅ Detectar cuando el sticky ya está pegado arriba
    const sentinelRef = useRef(null)
    const [isStuck, setIsStuck] = useState(false)

    useEffect(() => {
        const s = sentinelRef.current
        if (!s) return

        const obs = new IntersectionObserver(
            ([entry]) => {
                // cuando el sentinel deja de verse, el sticky está "stuck"
                setIsStuck(!entry.isIntersecting)
            },
            // threshold 1 => si deja de verse aunque sea un poco, consideramos stuck
            { threshold: [1] }
        )

        obs.observe(s)
        return () => obs.disconnect()
    }, [])

    useLayoutEffect(() => {
        const el = containerRef.current
        const inner = innerRef.current
        if (!el || !inner) return

        let raf = 0

        const measure = () => {
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                const available = el.clientWidth || 0

                inner.style.transform = 'scale(1)'
                inner.style.transformOrigin = 'center'

                const needed = inner.scrollWidth || 0

                if (!available || !needed) {
                    setFits(true)
                    setScale(1)
                    inner.style.transform = 'scale(1)'
                    return
                }

                if (needed <= available) {
                    setFits(true)
                    setScale(1)
                    inner.style.transform = 'scale(1)'
                } else {
                    const nextScale = Math.min(1, available / needed)
                    setFits(false)
                    setScale(nextScale)
                    inner.style.transform = `scale(${nextScale})`
                    inner.style.transformOrigin = 'center'
                }
            })
        }

        measure()

        const ro = new ResizeObserver(measure)
        ro.observe(el)
        ro.observe(inner)

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
        }
    }, [safeItems.length])

    if (safeItems.length === 0) return null

    return (
        <>
            {/* ✅ Sentinel invisible para detectar cuando se "pega" */}
            <div ref={sentinelRef} className="h-px w-full" />

            <div className={['sticky top-0 z-30 w-full', className].join(' ')}>
                <nav className={['mx-auto w-full', maxWidthClass].join(' ')}>
                    {/* ✅ Clip + capas controladas */}
                    <div
                        className={[
                            'relative isolate overflow-hidden rounded-2xl sm:rounded-3xl',
                            // 👇 clave: cuando está stuck, quitamos la sombra (evita “doble borde”)
                            isStuck ? 'shadow-none' : 'shadow-[0_10px_35px_rgba(0,0,0,0.35)]',
                            // ayuda en móviles a evitar artefactos de composición
                            'transform-gpu',
                        ].join(' ')}
                    >
                        {/* Fondo + blur dentro del help de overflow-hidden */}
                        <div
                            className={[
                                'absolute inset-0 rounded-[inherit] backdrop-blur-xl',
                                // 👇 cuando está stuck, subimos opacidad para que no se vea “halo”
                                isStuck ? 'bg-black/95' : 'bg-black/80',
                            ].join(' ')}
                        />

                        <div className="relative">
                            <div className="border-b border-white/5">
                                <div className="py-2">
                                    <div ref={containerRef} className="w-full overflow-hidden">
                                        <div className="flex w-full justify-center">
                                            <div
                                                ref={innerRef}
                                                className={[
                                                    'flex flex-nowrap items-center whitespace-nowrap',
                                                    fits ? 'w-full justify-between' : 'w-max justify-center',
                                                    'gap-1 sm:gap-2',
                                                    'px-5 sm:px-7',
                                                ].join(' ')}
                                                style={{
                                                    transform: `scale(${scale})`,
                                                    transformOrigin: 'center',
                                                    willChange: 'transform',
                                                }}
                                            >
                                                {safeItems.map((item) => {
                                                    const Icon = item.icon
                                                    const active = item.id === activeId

                                                    return (
                                                        <button
                                                            key={item.id}
                                                            onClick={() => onChange?.(item.id)}
                                                            type="button"
                                                            aria-current={active ? 'page' : undefined}
                                                            className={[
                                                                'group relative flex items-center justify-center rounded-lg',
                                                                'px-2.5 py-2 sm:px-3 sm:py-2.5',
                                                                'transition-all duration-200',
                                                                'outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50',
                                                                'hover:bg-white/5',
                                                                'whitespace-nowrap',
                                                            ].join(' ')}
                                                            title={item.label}
                                                            aria-label={item.label}
                                                        >
                                                            {active && (
                                                                <div className="absolute inset-0 rounded-lg bg-white/10 shadow-inner" />
                                                            )}

                                                            <div className="relative z-10 flex items-center gap-2">
                                                                {Icon && (
                                                                    <Icon
                                                                        className={[
                                                                            'h-5 w-5 transition-colors duration-300',
                                                                            active
                                                                                ? 'text-yellow-400'
                                                                                : 'text-zinc-400 group-hover:text-zinc-200',
                                                                        ].join(' ')}
                                                                    />
                                                                )}

                                                                <span
                                                                    className={[
                                                                        'hidden sm:inline',
                                                                        'text-sm font-semibold tracking-wide uppercase transition-colors duration-300',
                                                                        active ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200',
                                                                    ].join(' ')}
                                                                >
                                                                    {item.label}
                                                                </span>
                                                            </div>

                                                            {active && (
                                                                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-80" />
                                                            )}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </nav>
            </div>
        </>
    )
}
