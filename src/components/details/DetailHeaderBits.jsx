// src/components/details/DetailHeaderBits.jsx
'use client'

import { Star } from 'lucide-react'

export function CompactBadge({
    logo,
    label,
    value,
    sub,
    suffix,
    href,
    className = '',
    hideSubOnMobile = true,
    logoClassName = ''
}) {
    const Comp = href ? 'a' : 'div'

    return (
        <Comp
            href={href}
            target={href ? '_blank' : undefined}
            rel={href ? 'noopener noreferrer' : undefined}
            className={`
        flex items-center gap-2.5 group select-none min-w-0
        ${href ? 'cursor-pointer' : ''}
        ${className}
      `}
            title={sub ? `${label || ''} ${value ?? ''} · ${sub}`.trim() : undefined}
        >
            <img
                src={logo}
                alt={label || 'Provider'}
                className={`
          h-5 w-auto object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-110
          ${logoClassName}
        `}
            />

            <div className="flex flex-col justify-center leading-none min-w-0">
                <div className="flex items-baseline gap-1 min-w-0">
                    <span className="text-lg sm:text-xl font-black text-white tracking-tight drop-shadow-sm">
                        {value != null ? value : '-'}
                    </span>

                    {suffix && (
                        <span className="text-[10px] font-bold text-zinc-500 mb-0.5 shrink-0">
                            {suffix}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1 mt-0.5 min-w-0">
                    {label && (
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest bg-white/5 px-1 rounded-sm shrink-0">
                            {label}
                        </span>
                    )}

                    {sub && (
                        <span
                            className={`
                text-[9px] font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors tracking-wide
                truncate
                ${hideSubOnMobile ? 'hidden sm:inline' : ''}
              `}
                        >
                            {sub}
                        </span>
                    )}
                </div>
            </div>
        </Comp>
    )
}

export function ExternalLinkButton({
    icon,
    href,
    title,
    className = "",
    size = 24, // px
}) {
    if (!href) return null

    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            title={title}
            aria-label={title}
            className={[
                "inline-flex items-center justify-center",
                "opacity-90 hover:opacity-100 transition-opacity",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/40 rounded-lg",
                className,
            ].join(" ")}
        >
            <img
                src={icon}
                alt=""
                width={size}
                height={size}
                className="block object-contain"
                draggable="false"
            />
        </a>
    )
}

export function MiniStat({ icon: Icon, value, tooltip }) {
    return (
        <div className="flex items-center gap-2 group shrink-0" title={tooltip}>
            <div className="p-1.5 bg-white/5 rounded-full group-hover:bg-white/10 transition-colors">
                <Icon className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200" />
            </div>
            <span className="text-xs font-semibold text-zinc-400 font-mono tracking-tight group-hover:text-zinc-300">
                {value}
            </span>
        </div>
    )
}

export function UnifiedRateButton({ rating, loading, onRate, connected, onConnect }) {
    if (!connected) {
        return (
            <button
                onClick={onConnect}
                className="flex items-center gap-2 px-3 h-9 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                title="Conectar para puntuar"
            >
                <Star className="w-4 h-4 text-zinc-500" />
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Rate</span>
            </button>
        )
    }

    const hasRating = rating && rating > 0

    return (
        <div
            className={`
      relative group flex items-center justify-center gap-2 px-3 h-9 rounded-full transition-all border cursor-pointer
      ${hasRating
                    ? "bg-yellow-500/10 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]"
                    : "bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10"}
    `}
        >
            {loading ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
                <>
                    <Star
                        className={`w-4 h-4 transition-colors ${hasRating ? "fill-yellow-500 text-yellow-500" : "text-zinc-400 group-hover:text-white"}`}
                    />
                    <span className={`text-sm font-black tracking-tight ${hasRating ? "text-yellow-500" : "text-zinc-400 group-hover:text-white"}`}>
                        {hasRating ? rating : "RATE"}
                    </span>
                </>
            )}

            {!loading && (
                <select
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
                    value={rating || ""}
                    onChange={(e) => {
                        const val = e.target.value === "" ? null : Number(e.target.value)
                        onRate(val)
                    }}
                    title="Tu Puntuación (TMDb + Trakt)"
                >
                    <option value="">Borrar nota</option>
                    <option disabled>──────────</option>
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(val => (
                        <option key={val} value={val}>{val}</option>
                    ))}
                </select>
            )}
        </div>
    )
}
