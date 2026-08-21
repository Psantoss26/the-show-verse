'use client'


import OptimizedImage from "@/components/OptimizedImage";
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Film, ListVideo } from 'lucide-react'
import { useIsHistoryNavigation } from '@/lib/hooks/useIsHistoryNavigation'
import DetailsScoreboardPanel from '@/components/details/DetailsScoreboardPanel'
import DetailsInfoTabs from '@/components/details/DetailsInfoTabs'
import { buildPosterCollageTiles } from '@/lib/lists/posterCollage'

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

function PosterCover({ src, priority = false }) {
    return (
        <OptimizedImage
            src={src}
            alt=""
            aria-hidden="true"
            priority={priority}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            className="h-full w-full object-cover"
        />
    )
}

function PosterCollage({ images, fallbackImage }) {
    const tiles = buildPosterCollageTiles(images)

    if (tiles.length > 1) {
        return (
            <div
                className="grid h-full w-full grid-cols-3 grid-rows-3 gap-px overflow-hidden bg-black/70"
                aria-hidden="true"
            >
                {tiles.map((src, index) => (
                    <div key={`${src}-${index}`} className="relative min-h-0 overflow-hidden bg-zinc-900">
                        <PosterCover src={src} priority={index === 0} />
                    </div>
                ))}
            </div>
        )
    }

    if (fallbackImage || tiles[0]) {
        return <PosterCover src={fallbackImage || tiles[0]} priority />
    }

    return (
        <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <ListVideo className="h-16 w-16" />
        </div>
    )
}

/**
 * Layout único para detalles de listas (Trakt / TMDb / Colecciones / Mis listas)
 *
 * Props:
 * - title, description
 * - posterImages?: URL[] (portadas ya disponibles para el mosaico de portada)
 * - backHref?: string (si lo pasas, usa Link; si no, router.back())
 * - rightActions?: ReactNode (botones arriba a la derecha)
 * - showTopBar?: boolean (oculta la barra superior cuando la navegación vive en las acciones)
 * - heroActions?: ReactNode (fila de acciones estilo DetailsClient bajo el título)
 * - tabs?: [{ id, label, icon, disabled? }]
 * - activeTab?: string
 * - onTabChange?: (id) => void
 * - topControls?: ReactNode (bloque de controles bajo tabs, a la derecha)
 * - children: contenido principal (grid, empty state, etc)
 */
export default function UnifiedListDetailsLayout({
    title,
    description,
    posterImage,
    posterImages = [],
    backdropImage,
    sourceLabel = 'Lista',
    stats = [],
    scoreboardStats = [],
    scoreboardRatings = {},
    backHref,
    rightActions,
    showTopBar = true,
    heroActions,
    tabs,
    activeTab,
    onTabChange,
    topControls,
    children
}) {
    const router = useRouter()
    // Al VOLVER (atrás/adelante) el header se pinta estático, sin animación de entrada.
    const isBackNav = useIsHistoryNavigation()
    const hasTabs = Array.isArray(tabs) && tabs.length > 0 && !!activeTab && typeof onTabChange === 'function'
    const hasInfoTabs = Boolean(description)

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
                {showTopBar ? <div className="mb-6 flex items-center gap-2">
                    {backHref ? (
                        <Link
                            href={backHref}
                            className="inline-flex items-center justify-center rounded-full bg-black/40 bg-gradient-to-br from-white/10 to-white/5 shadow-lg backdrop-blur-md p-2 text-zinc-200 hover:bg-white/10 transition"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </Link>
                    ) : (
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="inline-flex items-center justify-center rounded-full bg-black/40 bg-gradient-to-br from-white/10 to-white/5 shadow-lg backdrop-blur-md p-2 text-zinc-200 hover:bg-white/10 transition"
                            aria-label="Volver"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}

                    <div className="h-6 w-[1px] bg-white/35 shrink-0" />

                    <div className="ml-auto flex gap-2 [&>a]:!inline-flex [&>a]:!items-center [&>a]:!justify-center [&>a]:!rounded-full [&>a]:!border-0 [&>a]:!bg-black/40 [&>a]:!bg-gradient-to-br [&>a]:!from-white/10 [&>a]:!to-white/5 [&>a]:!shadow-lg [&>a]:!backdrop-blur-md [&>a]:!p-2 [&>a]:!text-zinc-200 hover:[&>a]:!bg-white/10 [&>a]:!transition [&>button]:!inline-flex [&>button]:!items-center [&>button]:!justify-center [&>button]:!rounded-full [&>button]:!border-0 [&>button]:!bg-black/40 [&>button]:!bg-gradient-to-br [&>button]:!from-white/10 [&>button]:!to-white/5 [&>button]:!shadow-lg [&>button]:!backdrop-blur-md [&>button]:!p-2 [&>button]:!text-zinc-200 hover:[&>button]:!bg-white/10 [&>button]:!transition [&_svg]:!w-4 [&_svg]:!h-4">{rightActions}</div>
                </div> : null}

                {/* --- HERO, misma base visual que ActorDetails --- */}
                <motion.div
                    initial={isBackNav ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-12 flex flex-col items-start gap-8 lg:flex-row lg:gap-12"
                >
                    <div className="relative z-10 mx-auto flex w-full max-w-[280px] flex-shrink-0 flex-col gap-5 lg:mx-0 lg:max-w-[320px]">
                        <div className="relative overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/35 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-[28px] aspect-[2/3]">
                            <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]" />
                            <div className="relative z-10 h-full w-full bg-neutral-950">
                                <PosterCollage images={posterImages} fallbackImage={posterImage} />
                            </div>
                        </div>

                    </div>

                    <div className="flex min-w-0 flex-1 flex-col w-full">
                        <div className="mb-5 px-1 flex flex-col items-center md:items-start text-center md:text-left w-full">
                            <div className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                                <Film className="h-4 w-4" />
                                {sourceLabel}
                            </div>
                            <h1 className="text-center text-4xl font-black leading-[1] tracking-tight text-white drop-shadow-xl text-balance md:text-left md:text-5xl lg:text-6xl">
                                {title || 'Lista'}
                            </h1>
                        </div>

                        {heroActions ? <div className="mb-6 px-1">{heroActions}</div> : null}

                        <DetailsScoreboardPanel
                            {...scoreboardRatings}
                            statItems={scoreboardStats.length ? scoreboardStats : stats.map((stat) => ({
                                icon: stat.icon,
                                label: stat.label,
                                value: stat.value,
                            }))}
                            share={{
                                title: title || 'Lista',
                                text: `Echa un vistazo a ${title || 'esta lista'} en The Show Verse`,
                            }}
                            className="mb-6"
                        />

                        {hasInfoTabs ? (
                            <DetailsInfoTabs
                                key={title}
                                layoutId={`listDetailsTabs-${title || 'list'}`}
                                mediaType="movie"
                                overview={description}
                                showAwardsTab={false}
                                showDetailsTab={false}
                                showProductionTab={false}
                                showTabsMenu={false}
                                scrollableSynopsis
                            />
                        ) : null}

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
