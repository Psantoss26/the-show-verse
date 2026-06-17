'use client'


import OptimizedImage from "@/components/OptimizedImage";
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Film, Heart, ListVideo, Star } from 'lucide-react'

function Badge({ children }) {
    return (
        <span className="text-xs font-bold text-zinc-400 bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/30 px-3 py-1 rounded-full shadow-lg backdrop-blur-2xl">
            {children}
        </span>
    )
}

function DescriptionBlock({ description }) {
    if (!description) {
        return (
            <p className="text-base text-neutral-400 sm:text-lg">
                <span className="italic opacity-50">Sin descripción</span>
            </p>
        )
    }

    return (
        <div className="relative isolate overflow-hidden rounded-2xl bg-black/[0.08] bg-gradient-to-br from-white/10 via-transparent to-black/15 p-5 shadow-none backdrop-blur-[28px]">
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]" />
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                Descripción
            </div>
            <div className="sv-scroll relative max-h-36 overflow-y-auto pr-3 text-sm leading-6 text-zinc-200 sm:max-h-44 sm:text-base">
                <p className="whitespace-pre-wrap break-words text-left">
                    {description}
                </p>
            </div>
        </div>
    )
}

function TabButton({ active, disabled, onClick, icon: Icon, children }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={[
                'flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all',
                disabled ? 'opacity-40 cursor-not-allowed' : '',
                active
                    ? 'bg-white/15 text-white shadow-lg'
                    : 'text-zinc-400 hover:text-white hover:bg-white/10'
            ].join(' ')}
        >
            {Icon ? <Icon className="w-4 h-4" /> : null}
            {children}
        </button>
    )
}

/**
 * Layout único para detalles de listas (Trakt / TMDb / Colecciones / Mis listas)
 *
 * Props:
 * - title, description
 * - badges: array de strings (por ej. ["@user", "120 items", "❤️ 45"])
 * - backHref?: string (si lo pasas, usa Link; si no, router.back())
 * - rightActions?: ReactNode (botones arriba a la derecha)
 * - tabs?: [{ id, label, icon, disabled? }]
 * - activeTab?: string
 * - onTabChange?: (id) => void
 * - topControls?: ReactNode (bloque de controles bajo tabs, a la derecha)
 * - children: contenido principal (grid, empty state, etc)
 */
export default function UnifiedListDetailsLayout({
    title,
    description,
    badges = [],
    posterImage,
    backdropImage,
    sourceLabel = 'Lista',
    stats = [],
    backHref,
    rightActions,
    tabs,
    activeTab,
    onTabChange,
    topControls,
    children
}) {
    const router = useRouter()
    const hasTabs = Array.isArray(tabs) && tabs.length > 0 && !!activeTab && typeof onTabChange === 'function'

    return (
        <div className="min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-purple-500/30">
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                {backdropImage ? (
                    <OptimizedImage
                        src={backdropImage}
                        alt=""
                        fetchPriority="low"
                        className="h-full w-full scale-105 object-cover opacity-25 blur-sm"
                    />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-[#101010]/90 to-[#101010]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(168,85,247,0.16),transparent_35%),radial-gradient(circle_at_80%_15%,rgba(234,179,8,0.11),transparent_32%)]" />
            </div>

            <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 lg:py-12">
                {/* --- TOP BAR --- */}
                <div className="mb-8 flex items-center gap-4">
                    {backHref ? (
                        <Link
                            href={backHref}
                            className="rounded-full bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 p-2.5 text-zinc-300 shadow-lg backdrop-blur-[28px] transition hover:bg-white/10 hover:text-white"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                    ) : (
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="rounded-full bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 p-2.5 text-zinc-300 shadow-lg backdrop-blur-[28px] transition hover:bg-white/10 hover:text-white"
                            aria-label="Volver"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}

                    <div className="h-8 w-[1px] bg-white/10" />

                    <div className="ml-auto flex gap-2 [&>a]:!rounded-full [&>a]:!border-0 [&>a]:!bg-black/20 [&>a]:!bg-gradient-to-br [&>a]:!from-white/10 [&>a]:!via-transparent [&>a]:!to-black/40 [&>a]:!text-zinc-300 [&>a]:!shadow-lg [&>a]:!backdrop-blur-[28px] hover:[&>a]:!bg-white/10 hover:[&>a]:!text-white [&>button]:!rounded-full [&>button]:!border-0 [&>button]:!bg-black/20 [&>button]:!bg-gradient-to-br [&>button]:!from-white/10 [&>button]:!via-transparent [&>button]:!to-black/40 [&>button]:!text-zinc-300 [&>button]:!shadow-lg [&>button]:!backdrop-blur-[28px] hover:[&>button]:!bg-white/10 hover:[&>button]:!text-white">{rightActions}</div>
                </div>

                {/* --- HERO, misma base visual que ActorDetails --- */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-12 flex flex-col items-start gap-8 lg:flex-row lg:gap-12"
                >
                    <div className="relative z-10 mx-auto flex w-full max-w-[280px] flex-shrink-0 flex-col gap-5 lg:mx-0 lg:max-w-[320px]">
                        <div className="relative overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/35 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-[28px] aspect-[2/3]">
                            <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]" />
                            <div className="relative z-10 h-full w-full bg-neutral-950">
                                {posterImage ? (
                                    <OptimizedImage
                                        src={posterImage}
                                        alt=""
                                        fetchPriority="high"
                                        decoding="async"
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-zinc-700">
                                        <ListVideo className="h-16 w-16" />
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    <div className="flex min-w-0 flex-1 flex-col w-full">
                        <div className="mb-5 px-1">
                            <div className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                                <Film className="h-4 w-4" />
                                {sourceLabel}
                            </div>
                            <h1 className="mb-3 text-center text-4xl font-black leading-[1] tracking-tight text-white drop-shadow-xl text-balance md:text-left md:text-5xl lg:text-6xl">
                                {title || 'Lista'}
                            </h1>

                            {badges?.length ? (
                                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm font-medium text-zinc-300 md:justify-start md:text-base">
                                    {badges.map((b, i) => (
                                        <span key={`${b}-${i}`} className="inline-flex items-center gap-2">
                                            {i > 0 ? <span className="h-1 w-1 rounded-full bg-zinc-700" /> : null}
                                            {b}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        {stats.length > 0 && (
                        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                            {stats.map((stat, index) => {
                                const Icon = stat.icon || (index % 2 ? Heart : ListVideo)
                                const tones = {
                                    emerald: 'from-emerald-500/18 text-emerald-300',
                                    sky: 'from-sky-500/18 text-sky-300',
                                    violet: 'from-violet-500/18 text-violet-300',
                                    yellow: 'from-yellow-500/18 text-yellow-300',
                                }
                                const tone = tones[stat.tone] || tones.yellow
                                return (
                                    <div
                                        key={`${stat.label}-${index}`}
                                        className="relative isolate min-w-0 overflow-hidden rounded-2xl bg-black/[0.08] bg-gradient-to-br from-white/10 via-transparent to-black/15 p-4 shadow-none backdrop-blur-[28px]"
                                    >
                                        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]" />
                                        <div className={`absolute -right-10 -top-10 h-24 w-24 rounded-full bg-gradient-to-br ${tone} to-transparent blur-2xl opacity-40`} />
                                        <div className="relative flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <span className="block truncate text-[10px] font-black uppercase tracking-wider text-zinc-500">
                                                    {stat.label}
                                                </span>
                                                <span className="mt-1 block truncate text-lg font-black text-white">
                                                    {stat.value}
                                                </span>
                                                {stat.sub ? (
                                                    <span className="mt-0.5 block truncate text-xs font-semibold text-zinc-500">
                                                        {stat.sub}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <Icon className={`h-5 w-5 shrink-0 ${tone.split(' ')[1]}`} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        )}

                        <div className="mb-5">
                            <DescriptionBlock description={description} />
                        </div>

                        {(hasTabs || topControls) && (
                            <div className="flex w-full flex-col gap-4">
                                {hasTabs && (
                                    <div className="w-full rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/30 p-1.5 shadow-lg backdrop-blur-[28px]">
                                        <div className="flex w-full gap-1">
                                            {tabs.map((t) => (
                                                <TabButton
                                                    key={t.id}
                                                    active={activeTab === t.id}
                                                    disabled={!!t.disabled}
                                                    onClick={() => onTabChange(t.id)}
                                                    icon={t.icon}
                                                >
                                                    {t.label}
                                                </TabButton>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <AnimatePresence initial={false}>
                                    {topControls ? (
                                        <motion.div
                                            key="topControls"
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 8 }}
                                            transition={{ duration: 0.15 }}
                                            className="space-y-3"
                                        >
                                            {topControls}
                                        </motion.div>
                                    ) : null}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* --- BODY --- */}
                <div className="relative z-0">{children}</div>
            </div>
        </div>
    )
}
