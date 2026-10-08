'use client'


import OptimizedImage from "@/components/OptimizedImage";
import Link from 'next/link'
import { useRouter } from "@/lib/offline/useOfflineRouter";
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ChevronLeft, ChevronRight, Film, ListVideo } from 'lucide-react'
import { useIsHistoryNavigation } from '@/lib/hooks/useIsHistoryNavigation'
import DetailsScoreboardPanel from '@/components/details/DetailsScoreboardPanel'
import DetailsInfoTabs from '@/components/details/DetailsInfoTabs'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
    buildPosterCollageTargets,
    buildPosterCollageTiles,
    getPosterCollageLayout,
} from '@/lib/lists/posterCollage'
import { pickBestFavoriteEnglishPoster } from '@/lib/details/tmdbImages'
import { fetchTmdbImages } from '@/lib/tmdb/imageRequests'
import useImageLoadReady from '@/lib/hooks/useImageLoadReady'
import usePosterViewMode from '@/lib/hooks/usePosterViewMode'
import { posterShelfLayout } from '@/lib/lists/coverBackdrop'
// Capa con fundido de cada modo: la misma que usa DetailsClient.
import { CoverLayer } from '@/components/details/CoverCrossfade'

const finalEnglishPosterCache = new Map()

function posterUrl(filePath) {
    return filePath ? `https://image.tmdb.org/t/p/w342${filePath}` : null
}

function preloadPoster(src) {
    if (!src || typeof window === 'undefined') return Promise.resolve(null)
    return new Promise((resolve) => {
        const image = new Image()
        image.onload = () => resolve(src)
        image.onerror = () => resolve(null)
        image.src = src
    })
}

async function resolveEnglishPoster(target, priority) {
    if (finalEnglishPosterCache.has(target.key)) {
        return finalEnglishPosterCache.get(target.key)
    }

    const request = fetchTmdbImages(target.mediaType, target.tmdbId, { priority })
        .then((images) => pickBestFavoriteEnglishPoster(images?.posters || [])?.file_path || null)
        .catch(() => null)

    finalEnglishPosterCache.set(target.key, request)
    const posterPath = await request
    finalEnglishPosterCache.set(target.key, posterPath)
    return posterPath
}

function useFinalEnglishPosterImages(items) {
    const targets = useMemo(() => buildPosterCollageTargets(items), [items])
    const targetKey = targets.map((target) => target.key).join('|')
    const [state, setState] = useState({ key: '', pending: false, images: [] })

    useEffect(() => {
        let cancelled = false

        if (!targets.length) {
            setState({ key: targetKey, pending: false, images: [] })
            return undefined
        }

        setState({ key: targetKey, pending: true, images: [] })
        void Promise.all(
            targets.map(async (target, index) => {
                const posterPath = await resolveEnglishPoster(
                    target,
                    index === 0 ? 'high' : 'normal',
                )
                return preloadPoster(posterUrl(posterPath))
            }),
        ).then((images) => {
            if (cancelled) return
            setState({
                key: targetKey,
                pending: false,
                images: images.filter(Boolean),
            })
        })

        return () => {
            cancelled = true
        }
    }, [targetKey])

    return state.key === targetKey
        ? state
        : { key: targetKey, pending: targets.length > 0, images: [] }
}

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// Fondo a pantalla completa con el mismo reparto que DetailsClient: backdrop
// horizontal en escritorio y póster vertical en móvil. Con <picture> el
// navegador descarga solo la imagen que corresponde al viewport (dos capas con
// `background-image` y `hidden` dejarían a Safari bajar las dos).
//
// En móvil se desenfoca y escala el póster con los valores de `.hero-bg-base`
// (la capa de fondo de la ficha) para que no compita con la portada nítida de
// la cabecera; en escritorio el backdrop va nítido, como la capa de detalle de
// DetailsClient. No se usa la clase: su brillo 0.75 también se aplica en
// escritorio, donde la ficha lo tapa con otra capa.
function HeroBackground({ desktop, mobile, animate }) {
    const imgRef = useRef(null)
    const [loaded, setLoaded] = useState(false)

    // Si la imagen ya estaba en caché (vuelta atrás), `load` puede haberse
    // disparado antes de montar: se da por cargada sin fundido.
    useClientLayoutEffect(() => {
        const img = imgRef.current
        if (img?.complete && img.naturalWidth > 0) setLoaded(true)
    }, [])

    return (
        <picture>
            {desktop ? <source media="(min-width: 640px)" srcSet={desktop} /> : null}
            {/* Fondo decorativo a pantalla completa: next/image no aporta nada y
                su contenedor rompería el <picture>. */}
            <img
                ref={imgRef}
                src={mobile || desktop}
                alt=""
                aria-hidden="true"
                decoding="async"
                fetchPriority="low"
                onLoad={() => setLoaded(true)}
                className={`absolute inset-0 max-sm:scale-[1.12] max-sm:blur-[4px] max-sm:brightness-90 max-sm:saturate-[1.03] h-full w-full object-cover object-center sm:object-top ${
                    animate ? 'transition-opacity duration-500 motion-reduce:transition-none' : ''
                } ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
        </picture>
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

function PosterCover({ src, alt = "", priority = false }) {
    return (
        <OptimizedImage
            src={src}
            alt={alt}
            aria-hidden={alt ? undefined : true}
            priority={priority}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            className="h-full w-full object-cover"
        />
    )
}

// Acabado del marco de la portada (cristal, esquinas y sombra). La FORMA la
// pone CoverShape, que persiste entre modos para poder animar el cambio.
const POSTER_FRAME_VISUAL = 'overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/35 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-[28px]'

// Caja de la portada: póster 2:3 o backdrop 16:9, con el mismo morph de 500 ms
// que la ficha (`.poster-aspect-box`: `padding-bottom` desde `--poster-pb`,
// solo a partir de `sm`; en móvil el modo es siempre póster y manda
// `aspect-[2/3]`). Los hijos van en `absolute inset-0`.
function CoverShape({ backdrop, animate, children, ...props }) {
    return (
        <div
            {...props}
            className="group/cover relative w-full aspect-[2/3] sm:aspect-auto sm:h-0 poster-aspect-box"
            style={{
                '--poster-pb': backdrop ? '56.25%' : '150%',
                // La preferencia guardada se aplica sin animar al abrir.
                ...(animate ? {} : { transition: 'none' }),
            }}
        >
            {children}
        </div>
    )
}

// Zona lateral para alternar póster ↔ backdrop, como en la ficha: un tercio
// del marco con degradado y chevron, visible al pasar el ratón (o con el foco
// del teclado). Póster: a la derecha, «Ver imagen de fondo»; backdrop: a la
// izquierda, «Ver póster».
function CoverModeToggle({ backdrop, onToggle }) {
    const label = backdrop ? 'Ver póster' : 'Ver imagen de fondo'
    const Icon = backdrop ? ChevronLeft : ChevronRight
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={label}
            title={label}
            className={`absolute inset-y-0 z-30 flex w-1/3 cursor-pointer items-center from-black/70 to-transparent opacity-0 transition-opacity duration-200 group-hover/cover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-yellow-400 motion-reduce:transition-none ${
                backdrop
                    ? 'left-0 justify-start rounded-l-2xl bg-gradient-to-r pl-4'
                    : 'right-0 justify-end rounded-r-2xl bg-gradient-to-l pr-4'
            }`}
        >
            <Icon className="h-8 w-8 text-white drop-shadow-lg" aria-hidden="true" />
        </button>
    )
}

// Portada oficial (colecciones) con la carga de la portada de DetailsClient:
// una versión ligera (`lowSrc`, w342) que llega antes y la grande (`src`)
// encima con fundido cuando está decodificada.
//
// El marco NO se pinta hasta que hay imagen: antes se veía un recuadro negro
// vacío mientras se descargaba. Entra con un fundido y un leve escalado; si
// la imagen ya estaba en caché (volver atrás, segunda visita) aparece tal cual,
// sin animación (useImageLoadReady). Si no se puede cargar, se muestra el
// marco con el icono de respaldo en vez de quedarse invisible.
function RevealPoster({ src, lowSrc, alt }) {
    const firstSrc = lowSrc || src
    const { imgRef: lowRef, onLoad: onLowLoad, ready: lowReady, instant } = useImageLoadReady(firstSrc)
    const highRef = useRef(null)
    const [highSrc, setHighSrc] = useState(null)
    const [failedSrc, setFailedSrc] = useState(null)
    const hasHigh = Boolean(src && src !== firstSrc)
    const highReady = hasHigh && highSrc === src
    const failed = failedSrc === firstSrc
    const visible = lowReady || highReady || failed

    useLayoutEffect(() => {
        const img = highRef.current
        if (img?.complete && img.naturalWidth > 0) setHighSrc(src)
    }, [src])

    const markHigh = (event) => {
        const img = event.currentTarget
        const done = () => setHighSrc(img.getAttribute('src'))
        if (typeof img.decode === 'function') img.decode().then(done, done)
        else done()
    }

    return (
        <div
            className={`absolute inset-0 ${POSTER_FRAME_VISUAL} ${
                instant ? '' : 'transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'
            } ${visible ? 'scale-100 opacity-100' : 'scale-[0.97] opacity-0'}`}
        >
            <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]" />
            <div className="absolute inset-0 z-10">
                {failed ? (
                    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-zinc-700">
                        <ListVideo className="h-16 w-16" />
                    </div>
                ) : (
                    <>
                        {/* Portada decorativa de cabecera: <img> directo para
                            controlar `load`/`decode` de cada capa. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            ref={lowRef}
                            src={firstSrc}
                            alt={alt}
                            onLoad={onLowLoad}
                            onError={() => setFailedSrc(firstSrc)}
                            fetchPriority="high"
                            decoding="async"
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                        {hasHigh ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                ref={highRef}
                                src={src}
                                alt=""
                                aria-hidden="true"
                                onLoad={markHigh}
                                decoding="async"
                                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none ${
                                    highReady ? 'opacity-100' : 'opacity-0'
                                }`}
                            />
                        ) : null}
                    </>
                )}
            </div>
        </div>
    )
}

function PosterCollage({ images, pending }) {
    const tiles = buildPosterCollageTiles(images)
    const layout = getPosterCollageLayout(tiles.length)

    if (pending) {
        return <div className="h-full w-full animate-pulse bg-zinc-900" aria-hidden="true" />
    }

    if (tiles.length > 1) {
        return (
            <div
                className={`grid h-full w-full gap-px overflow-hidden bg-black/70 ${layout.gridClassName}`}
                aria-hidden="true"
            >
                {tiles.map((src, index) => (
                    <div
                        key={src}
                        className={`relative min-h-0 overflow-hidden bg-zinc-900 ${layout.tileClassNames[index]}`}
                    >
                        <PosterCover src={src} priority={index === 0} />
                    </div>
                ))}
            </div>
        )
    }

    if (tiles[0]) {
        return <PosterCover src={tiles[0]} priority />
    }

    return (
        <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <ListVideo className="h-16 w-16" />
        </div>
    )
}

// Portada BACKDROP de una lista: no tiene imagen horizontal propia, así que la
// caja 16:9 se llena con una «estantería» de los pósters de sus títulos, enteros
// (2:3, sin recortar), en tantas filas como haga falta para que salgan lo más
// grandes posible (lib/lists/coverBackdrop). Detrás, el primero difuminado.
function PosterShelf({ images, pending, count }) {
    const posters = images.slice(0, 20)
    // Mientras se resuelven los pósters ingleses, huecos en su sitio: la caja
    // ya está en 16:9 y no cambia de forma al llegar.
    const { tiles } = posterShelfLayout(pending ? Math.min(20, count) : posters.length)
    return (
        <div className={`absolute inset-0 ${POSTER_FRAME_VISUAL}`} aria-hidden="true">
            {posters[0] ? (
                // Fondo decorativo: <img> directo con filtro, sin next/image.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={posters[0]}
                    alt=""
                    decoding="async"
                    className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.45] saturate-[1.15]"
                />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-black/40" />
            {tiles.map((tile, index) => (
                <div
                    key={pending ? `pending-${index}` : posters[index]}
                    className={`absolute overflow-hidden rounded-md bg-zinc-900 shadow-[0_12px_28px_-10px_rgba(0,0,0,0.85)] ${pending ? 'animate-pulse' : ''}`}
                    style={{
                        left: `${tile.left}%`,
                        top: `${tile.top}%`,
                        width: `${tile.width}%`,
                        height: `${tile.height}%`,
                    }}
                >
                    {pending ? null : <PosterCover src={posters[index]} />}
                </div>
            ))}
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]" />
        </div>
    )
}

/**
 * Layout único para detalles de listas (Trakt / TMDb / Colecciones / Mis listas)
 *
 * Props:
 * - title, description
 * - posterImage?: string (portada oficial; tiene prioridad sobre el mosaico)
 * - posterLowImage?: string (versión ligera de la portada oficial, se pinta antes)
 * - coverBackdrop?: { src, lowSrc } (backdrop con idioma para el modo de portada
 *   backdrop de una colección; sin él, con portada oficial, el modo no se ofrece.
 *   Sin portada oficial —listas— el modo usa la estantería de pósters)
 * - coverBackdropPending?: boolean (aún se está buscando ese backdrop)
 * - titlePending?: boolean (aún no se sabe el nombre: hueco en su lugar, para
 *   pintar la página al instante en vez de dejarla vacía)
 * - posterItems?: Array (títulos TMDb para resolver el mosaico inglés final)
 * - heroBackground?: { desktop?: string, mobile?: string } (fondo estilo
 *   DetailsClient: backdrop en escritorio, póster en móvil; sustituye al
 *   `backdropImage` tenue)
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
    posterItems = [],
    posterImage,
    posterLowImage,
    coverBackdrop = null,
    coverBackdropPending = false,
    titlePending = false,
    backdropImage,
    heroBackground,
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
    const finalPosterArtwork = useFinalEnglishPosterImages(posterItems)

    // MODO DE PORTADA póster ↔ backdrop, como en DetailsClient (misma
    // preferencia global, solo escritorio). Disponible con un backdrop con
    // idioma (colecciones) o, en listas, con pósters para la estantería.
    const coverMode = usePosterViewMode()
    const posterTargetCount = useMemo(() => buildPosterCollageTargets(posterItems).length, [posterItems])
    // Listas: disponible en cuanto hay títulos (la estantería enseña huecos
    // mientras llegan sus pósters). Colecciones: con su backdrop con idioma.
    const backdropAvailable = posterImage ? Boolean(coverBackdrop?.src) : posterTargetCount > 0
    // Mientras se busca el backdrop de la colección, si la preferencia es
    // backdrop la caja ya sale en 16:9 (vacía) en vez de enseñar el póster y
    // transformarse al llegar; si al final no hay, vuelve al póster.
    const backdropPending = Boolean(posterImage) && coverBackdropPending
    const canToggleCover = coverMode.enabled && backdropAvailable
    const isBackdropCover =
        coverMode.enabled && coverMode.mode === 'preview' && (backdropAvailable || backdropPending)
    // El cambio de forma solo se anima cuando lo pide el usuario; los que
    // llegan con la carga (preferencia guardada, backdrop encontrado) son
    // instantáneos.
    const [animateCover, setAnimateCover] = useState(false)
    // La capa backdrop se monta al acercar el ratón (así ya está cargada al
    // pulsar) o cuando el modo es backdrop.
    const [backdropWanted, setBackdropWanted] = useState(false)
    const mountBackdrop = backdropAvailable && (isBackdropCover || (canToggleCover && backdropWanted))
    const toggleCover = () => {
        setAnimateCover(true)
        coverMode.setMode(isBackdropCover ? 'poster' : 'preview')
    }
    const infoTabs = hasInfoTabs ? (
        <DetailsInfoTabs
            key={title}
            layoutId={`listDetailsTabs-${title || 'list'}`}
            mediaType="movie"
            overview={description}
            showAwardsTab={false}
            showDetailsTab={false}
            showProductionTab={false}
            showTabsMenu={false}
            expandableSynopsis
        />
    ) : null

    return (
        <div className="min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-purple-500/30">
            {heroBackground ? (
                <div className="fixed inset-0 pointer-events-none overflow-hidden bg-[#0a0a0a]">
                    {heroBackground.desktop || heroBackground.mobile ? <HeroBackground
                        key={`${heroBackground.desktop || ''}|${heroBackground.mobile || ''}`}
                        desktop={heroBackground.desktop}
                        mobile={heroBackground.mobile}
                        animate={!isBackNav}
                    /> : null}
                    {/* Sombreados de legibilidad de la ficha (DetailsClient), en
                        móvil al 60% como en su estado con scroll. */}
                    <div className="absolute inset-0 max-sm:opacity-60">
                        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#101010]/60 via-transparent to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-l from-[#101010]/60 via-transparent to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/60 to-black/20" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#101010] via-transparent to-transparent opacity-30" />
                    </div>
                </div>
            ) : (
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
            )}

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
                    // Backdrop con sinopsis debajo: 24 px hasta ella, la misma
                    // separación que entre los botones y el marcador.
                    className={`${isBackdropCover && hasInfoTabs ? 'mb-6' : 'mb-12'} flex flex-col items-start gap-8 lg:flex-row lg:gap-12`}
                >
                    {/* Columna de la portada: 320 px en póster, 600 px en
                        backdrop (los anchos de la ficha), con su transición. */}
                    <div
                        className={`relative z-10 mx-auto flex w-full max-w-[280px] flex-shrink-0 flex-col gap-5 lg:mx-0 ${
                            isBackdropCover ? 'sm:max-w-full lg:max-w-[600px]' : 'lg:max-w-[320px]'
                        }`}
                        style={animateCover ? { transition: 'max-width 500ms cubic-bezier(0.25, 1, 0.5, 1)' } : undefined}
                    >
                        <CoverShape
                            backdrop={isBackdropCover}
                            animate={animateCover}
                            onPointerEnter={canToggleCover ? () => setBackdropWanted(true) : undefined}
                        >
                            {posterImage ? (
                                <CoverLayer active={!isBackdropCover}>
                                    <RevealPoster
                                        key={posterLowImage || posterImage}
                                        src={posterImage}
                                        lowSrc={posterLowImage}
                                        alt={title || 'Colección'}
                                    />
                                </CoverLayer>
                            ) : (
                                <CoverLayer active={!isBackdropCover}>
                                    <div className={`absolute inset-0 ${POSTER_FRAME_VISUAL}`}>
                                        <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]" />
                                        <div className="absolute inset-0 z-10 bg-neutral-950">
                                            <PosterCollage
                                                images={finalPosterArtwork.images}
                                                pending={finalPosterArtwork.pending || titlePending}
                                            />
                                        </div>
                                    </div>
                                </CoverLayer>
                            )}
                            {mountBackdrop ? (
                                <CoverLayer active={isBackdropCover}>
                                    {posterImage ? (
                                        <RevealPoster
                                            key={coverBackdrop.src}
                                            src={coverBackdrop.src}
                                            lowSrc={coverBackdrop.lowSrc}
                                            alt={title || 'Colección'}
                                        />
                                    ) : (
                                        <PosterShelf
                                            images={finalPosterArtwork.images}
                                            pending={finalPosterArtwork.pending}
                                            count={posterTargetCount}
                                        />
                                    )}
                                </CoverLayer>
                            ) : null}
                            {canToggleCover ? (
                                <CoverModeToggle backdrop={isBackdropCover} onToggle={toggleCover} />
                            ) : null}
                        </CoverShape>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col w-full">
                        <div className="mb-5 px-1 flex flex-col items-center md:items-start text-center md:text-left w-full">
                            <div className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                                <Film className="h-4 w-4" />
                                {sourceLabel}
                            </div>
                            {titlePending ? (
                                <div
                                    className="h-10 w-3/4 max-w-md animate-pulse rounded-xl bg-white/[0.08] md:h-12 lg:h-14"
                                    aria-hidden="true"
                                />
                            ) : (
                                <h1 className="text-center text-4xl font-black leading-[1] tracking-tight text-white drop-shadow-xl text-balance md:text-left md:text-5xl lg:text-6xl">
                                    {title || 'Lista'}
                                </h1>
                            )}
                        </div>

                        {heroActions ? <div className="mb-6 px-1">{heroActions}</div> : null}

                        {/* Móvil: el marcador de teléfono de la ficha
                            (`mobileScoresOnly`): puntuaciones y stats
                            repartidas a todo el ancho y a tamaño grande. */}
                        <DetailsScoreboardPanel
                            mobileScoresOnly
                            {...scoreboardRatings}
                            statItems={scoreboardStats.length ? scoreboardStats : stats.map((stat) => ({
                                icon: stat.icon,
                                label: stat.label,
                                value: stat.value,
                            }))}
                            // El margen es para la sinopsis que va debajo en la
                            // columna; en backdrop baja bajo la cabecera y se
                            // sumaba al de la cabecera (56 px en total).
                            className={isBackdropCover && hasInfoTabs ? '' : 'mb-6'}
                        />

                        {/* En backdrop la descripción baja bajo la cabecera, a
                            todo el ancho, como las pestañas de la ficha. */}
                        {isBackdropCover ? null : infoTabs}

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

                {isBackdropCover && infoTabs ? <div className="mb-12">{infoTabs}</div> : null}

                {/* --- BODY --- */}
                <div className="relative z-0">{children}</div>
            </div>
        </div>
    )
}
