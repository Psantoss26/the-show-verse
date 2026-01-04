'use client'

import React, { useMemo } from 'react'

const fmtCount = (n) => {
    const v = Number(n || 0)
    if (!Number.isFinite(v) || v <= 0) return null
    return v > 999 ? '999+' : String(v)
}

function CountBadge({ value }) {
    if (!value) return null
    return (
        <div
            className="
        hidden sm:flex
        absolute -top-1.5 -right-3 z-10
        min-w-[22px] h-[18px] px-1.5
        rounded-full
        text-[10px] font-extrabold leading-[18px] text-center
        bg-yellow-400 text-black
        shadow-md shadow-black/40
        ring-2 ring-black/35
        pointer-events-none
        items-center justify-center
      "
        >
            {value}
        </div>
    )
}

export default function DetailsSectionMenu({ items = [], activeId, onChange, compact = false }) {
    const safeItems = useMemo(() => (Array.isArray(items) ? items.filter(Boolean) : []), [items])
    const cols = Math.max(1, safeItems.length)

    const wrapClass = compact
        ? 'rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md p-1.5 sm:p-1.5'
        : 'rounded-3xl border border-white/10 bg-black/30 backdrop-blur-md p-2 sm:p-2.5'

    const btnClassDesktop = (isActive) =>
        [
            'group relative flex-1 min-w-0 border transition',
            compact ? 'rounded-xl px-2 py-2' : 'rounded-2xl px-3 py-2.5',
            isActive
                ? 'bg-yellow-500/10 border-yellow-500/35'
                : 'bg-white/5 border-white/10 hover:bg-white/7 hover:border-white/15',
        ].join(' ')

    const iconBoxClass = (isActive) =>
        [
            'relative flex items-center justify-center overflow-visible border transition',
            compact ? 'w-10 h-10 rounded-xl' : 'w-11 h-11 rounded-2xl',
            isActive
                ? 'bg-yellow-500/15 border-yellow-500/35'
                : 'bg-black/20 border-white/10 group-hover:bg-black/25',
        ].join(' ')

    return (
        <div className="w-full">
            <div className={wrapClass}>
                {/* ===================== */}
                {/* DESKTOP */}
                {/* ===================== */}
                <div className="hidden sm:flex items-stretch gap-2">
                    {safeItems.map((it) => {
                        const Icon = it.icon
                        const isActive = it.id === activeId
                        const badge = fmtCount(it.count ?? it.badge ?? it.total ?? it.itemsCount)

                        return (
                            <button
                                key={it.id}
                                type="button"
                                onClick={() => onChange?.(it.id)}
                                className={btnClassDesktop(isActive)}
                                title={it.label}
                                aria-current={isActive ? 'true' : undefined}
                            >
                                <div className="flex flex-col items-center justify-center gap-1.5">
                                    <div className="relative overflow-visible">
                                        <div className={iconBoxClass(isActive)}>
                                            <CountBadge value={badge} />
                                            {Icon ? (
                                                <Icon
                                                    className={[
                                                        'w-5 h-5 transition',
                                                        isActive ? 'text-yellow-300' : 'text-zinc-300 group-hover:text-white',
                                                    ].join(' ')}
                                                />
                                            ) : null}
                                        </div>

                                        {/* indicador sutil */}
                                        {isActive && (
                                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-1 rounded-full bg-yellow-400/80 shadow" />
                                        )}
                                    </div>

                                    {/* ✅ ocultar títulos en compacto */}
                                    {!compact && (
                                        <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-300 group-hover:text-white transition truncate max-w-full">
                                            {it.label}
                                        </div>
                                    )}
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* ===================== */}
                {/* MOBILE */}
                {/* ===================== */}
                <div
                    className="sm:hidden grid gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                    {safeItems.map((it) => {
                        const Icon = it.icon
                        const isActive = it.id === activeId
                        const badge = fmtCount(it.count ?? it.badge ?? it.total ?? it.itemsCount)

                        return (
                            <button
                                key={it.id}
                                type="button"
                                onClick={() => onChange?.(it.id)}
                                className={[
                                    'relative overflow-visible border transition flex items-center justify-center',
                                    compact ? 'h-10 rounded-xl' : 'h-11 rounded-2xl',
                                    isActive
                                        ? 'bg-yellow-500/10 border-yellow-500/35'
                                        : 'bg-white/5 border-white/10 hover:bg-white/7 hover:border-white/15',
                                ].join(' ')}
                                title={it.label}
                                aria-label={it.label}
                                aria-current={isActive ? 'true' : undefined}
                            >
                                <div className="relative w-9 h-9 flex items-center justify-center overflow-visible">
                                    <CountBadge value={badge} />
                                    {Icon ? (
                                        <Icon
                                            className={['w-5 h-5 transition', isActive ? 'text-yellow-300' : 'text-zinc-300'].join(' ')}
                                        />
                                    ) : null}
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
