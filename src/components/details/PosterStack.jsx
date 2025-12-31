// src/components/details/PosterStack.jsx
'use client'

import { useState } from 'react'

export default function PosterStack({ posters = [] }) {
    const [hovered, setHovered] = useState(null)

    const imgs = posters.slice(0, 5)

    const POSTER_W = 96
    const STEP = 35
    const HOVER_GAP = 60

    const totalWidth = imgs.length > 0
        ? POSTER_W + (imgs.length - 1) * STEP + (hovered !== null ? HOVER_GAP : 0)
        : POSTER_W

    return (
        <div
            className="relative flex h-full w-full items-end justify-center transition-all duration-300 pb-3"
            style={{ width: totalWidth }}
            onMouseLeave={() => setHovered(null)}
        >
            {imgs.map((src, idx) => {
                const isAfterHover = hovered !== null && idx > hovered
                const leftPosition = idx * STEP + (isAfterHover ? HOVER_GAP : 0)

                const isHover = hovered === idx
                const isAnyoneHovered = hovered !== null

                const rotation = isHover ? 0 : (idx - (imgs.length - 1) / 2) * 5

                return (
                    <div
                        key={`${src}-${idx}`}
                        className="absolute transition-all duration-500 cubic-bezier(0.25, 0.2, 0.25, 0.2)"
                        style={{
                            left: 0,
                            transform: `translateX(${leftPosition}px) rotate(${rotation}deg)`,
                            zIndex: isHover ? 50 : idx,
                            transformOrigin: 'bottom center',
                            bottom: isHover ? 4 : 0,
                        }}
                        onMouseEnter={() => setHovered(idx)}
                        onClick={(e) => {
                            e.preventDefault()
                            setHovered(h => (h === idx ? null : idx))
                        }}
                    >
                        <div
                            className={`
                relative h-40 w-28 overflow-hidden rounded-xl border bg-zinc-900 shadow-2xl transition-all duration-300
                ${isHover
                                    ? 'scale-110 border-white/40 ring-1 ring-white/50 shadow-[0_0_30px_rgba(99,102,241,0.5)]'
                                    : 'scale-100 border-white/10 shadow-black/60'
                                }
                ${isAnyoneHovered && !isHover ? 'brightness-[0.4] blur-[0.5px]' : 'brightness-100'}
              `}
                        >
                            <img
                                src={src}
                                alt="Poster"
                                loading="lazy"
                                className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-white/10 opacity-60" />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
