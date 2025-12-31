// src/components/details/DetailAtoms.jsx
'use client'

export function VisualMetaCard({ icon: Icon, label, value, className = '' }) {
    if (!value) return null

    return (
        <div className={`flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5 h-full ${className}`}>
            <div className="p-2 rounded-lg shrink-0 bg-white/5 text-zinc-400 mt-0.5">
                <Icon className="w-4 h-4" />
            </div>

            <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-0.5">
                    {label}
                </span>
                <span className="text-sm font-bold text-zinc-100 leading-tight whitespace-normal break-words">
                    {value}
                </span>
            </div>
        </div>
    )
}

export const SectionTitle = ({ title, icon: Icon }) => (
    <div className="flex items-center gap-3 mb-6 border-l-4 border-yellow-500 pl-4 py-1">
        {Icon && <Icon className="text-yellow-500 w-6 h-6" />}
        <h2 className="text-2xl md:text-3xl font-bold text-white tracking-wide">
            {title}
        </h2>
    </div>
)

export const MetaItem = ({
    icon: Icon,
    label,
    value,
    colorClass = 'text-gray-400',
    className = ''
}) => {
    if (!value) return null
    return (
        <div
            className={`min-w-0 max-w-full flex items-center gap-3 bg-neutral-800/40 p-3 rounded-xl
      border border-neutral-700/50 hover:bg-neutral-800 transition-colors h-[68px] md:h-[72px] ${className}`}
        >
            <div className={`p-2 rounded-lg bg-neutral-900/80 shrink-0 ${colorClass}`}>
                <Icon size={18} />
            </div>
            <div className="flex flex-col min-w-0 overflow-hidden">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider truncate">
                    {label}
                </span>
                <span
                    className="text-sm text-gray-200 font-medium leading-tight truncate whitespace-nowrap"
                    title={typeof value === 'string' ? value : ''}
                >
                    {value}
                </span>
            </div>
        </div>
    )
}

export const toneStyles = {
    tmdb: 'border-emerald-500/25 bg-emerald-500/10',
    trakt: 'border-red-500/25 bg-red-500/10',
    imdb: 'border-yellow-500/25 bg-yellow-500/10',
    rt: 'border-rose-500/25 bg-rose-500/10',
    mc: 'border-lime-500/25 bg-lime-500/10',
    jw: 'border-emerald-500/25 bg-emerald-500/10',
    neutral: 'border-white/10 bg-white/5'
}

export function ScoreBadge({
    tone = 'neutral',
    logo,
    alt,
    label,
    value,
    suffix,
    sublabel,
    subvalue,
    href,
    title
}) {
    if (value == null || value === '') return null

    const Box = ({ children }) =>
        href ? (
            <a
                href={href}
                target="_blank"
                rel="noreferrer"
                title={title || label}
                className="group"
            >
                {children}
            </a>
        ) : (
            children
        )

    return (
        <Box>
            <div
                className={`shrink-0 rounded-2xl border ${toneStyles[tone] || toneStyles.neutral}
        px-3 py-2 flex items-center gap-2 transition hover:bg-white/10`}
            >
                {logo ? (
                    <img src={logo} alt={alt || label} className="h-4 w-auto opacity-90" />
                ) : null}

                <div className="leading-none">
                    <div className="flex items-baseline gap-1">
                        <span className="text-sm font-extrabold text-white">
                            {value}
                            {suffix ? <span className="text-[11px] text-zinc-300 ml-0.5">{suffix}</span> : null}
                        </span>
                        {subvalue != null && (
                            <span className="text-[11px] text-zinc-400 ml-1">
                                {subvalue}
                            </span>
                        )}
                    </div>

                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        {sublabel || label}
                    </div>
                </div>
            </div>
        </Box>
    )
}

export function StatChip({ icon: Icon, label, value }) {
    if (value == null) return null
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-zinc-200" />
            </div>
            <div className="min-w-0">
                <div className="text-sm font-extrabold text-white leading-none">
                    {value}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {label}
                </div>
            </div>
        </div>
    )
}
