'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'

function Badge({ children }) {
    return (
        <span className="text-xs font-bold text-zinc-400 bg-black/30 px-3 py-1 rounded-full border border-white/5">
            {children}
        </span>
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
                    ? 'bg-zinc-800 text-white shadow-lg'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
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
            {/* Ambient */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-1/4 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-1/4 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
                {/* --- TOP BAR --- */}
                <div className="mb-8 flex items-center gap-4">
                    {backHref ? (
                        <Link
                            href={backHref}
                            className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                    ) : (
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition"
                            aria-label="Volver"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}

                    <div className="h-8 w-[1px] bg-zinc-800" />

                    <div className="flex gap-2 ml-auto">{rightActions}</div>
                </div>

                {/* --- HERO --- */}
                <div className="bg-neutral-900/60 border border-white/5 p-6 sm:p-8 rounded-3xl backdrop-blur-md mb-8 relative z-40">
                    <div className="flex flex-col lg:flex-row gap-8 lg:items-start">
                        <div className="flex-1 min-w-0 space-y-4">
                            <div className="space-y-2">
                                <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight break-words">
                                    {title || 'Lista'}
                                </h1>

                                <p className="text-lg text-neutral-400 leading-relaxed max-w-2xl">
                                    {description ? description : <span className="italic opacity-50">Sin descripción</span>}
                                </p>

                                {badges?.length ? (
                                    <div className="flex flex-wrap items-center gap-3 pt-2">
                                        {badges.map((b, i) => (
                                            <Badge key={`${b}-${i}`}>{b}</Badge>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {/* --- Right side: tabs + controls --- */}
                        {(hasTabs || topControls) && (
                            <div className="flex flex-col gap-4 w-full lg:w-auto lg:min-w-[340px]">
                                {hasTabs && (
                                    <div className="p-1.5 bg-zinc-900/80 border border-zinc-800 rounded-2xl w-full">
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
                                            initial={{ opacity: 0, x: 10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
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
                </div>

                {/* --- BODY --- */}
                <div className="relative z-0">{children}</div>
            </div>
        </div>
    )
}
