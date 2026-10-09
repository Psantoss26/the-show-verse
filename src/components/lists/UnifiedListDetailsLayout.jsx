'use client'


import OptimizedImage from "@/components/OptimizedImage";
import Link from 'next/link'
import { useRouter } from "@/lib/offline/useOfflineRouter";
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ChevronLeft, ChevronRight, Film, ListVideo } from 'lucide-react'
import { useIsHistoryNavigation } from '@/lib/hooks/useIsHistoryNavigation'
import DetailsScoreboardPanel from '@/components/details/DetailsScoreboardPanel'
import DetailsInfoTabs from '@/components/details/DetailsInfoTabs'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
    MAX_BACKGROUND_TILE_COUNT,
    buildBackgroundCollageTargets,
    buildBackgroundCollageTiles,
    buildPosterCollageTargets,
    buildPosterCollageTiles,
    getPosterCollageGrid,
    getPosterCollageLayout,
} from '@/lib/lists/posterCollage'
import { fetchTmdbImages } from '@/lib/tmdb/imageRequests'
import { requestListArtwork } from '@/lib/tmdb/artworkBatch'
import { pickListArtwork } from '@/lib/tmdb/artworkPicks'
import useImageLoadReady from '@/lib/hooks/useImageLoadReady'
import usePosterViewMode from '@/lib/hooks/usePosterViewMode'
import { posterShelfLayout } from '@/lib/lists/coverBackdrop'
// Capa con fundido de cada modo: la misma que usa DetailsClient.
import { CoverLayer } from '@/components/details/CoverCrossfade'
import {
    MOBILE_ACTIONS_ENTRY_ANIMATION,
    MOBILE_POSTER_OVERSCAN,
    MOBILE_REVEAL_BASE,
    MOBILE_STATS_REVEAL_BASE,
    MOBILE_SCOREBOARD_ENTRY_ANIMATION,
    MobileHeroCover,
    useMobileDetailsHero,
} from '@/components/details/MobileDetailsHero'

// Arte de cada título para la portada de la lista (`coverPoster`): id → ruta,
// null (sin arte) o la promesa en vuelo.
const coverArtCache = new Map()

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

// PORTADA DE LA LISTA: arte SIN TEXTO de cada título (`coverPoster` de
// lib/tmdb/artworkPicks: póster sin idioma → backdrop sin idioma → póster
// inglés). El mosaico recorta cada imagen a su celda y con el póster inglés
// cortaba los títulos impresos. Se pide en LOTE (/api/tmdb/artwork: una
// petición para toda la lista, cacheada un día en el servidor) y, si el lote
// falla, a /images del título con el mismo criterio.
async function resolveCoverArt(target, priority) {
    if (coverArtCache.has(target.key)) {
        return coverArtCache.get(target.key)
    }

    const request = requestListArtwork(target.mediaType, target.tmdbId)
        .then(async (picks) => {
            if (picks) return picks.coverPoster || null
            const images = await fetchTmdbImages(target.mediaType, target.tmdbId, { priority })
            return pickListArtwork(images)?.coverPoster || null
        })
        .catch(() => null)

    coverArtCache.set(target.key, request)
    const posterPath = await request
    coverArtCache.set(target.key, posterPath)
    return posterPath
}

function useCoverArtImages(items) {
    const targets = useMemo(() => buildPosterCollageTargets(items), [items])
    const targetKey = targets.map((target) => target.key).join('|')
    const [state, setState] = useState({ key: '', pending: false, images: [] })

    useEffect(() => {
        let cancelled = false

        if (!targets.length) {
            setState({ key: targetKey, pending: false, images: [] })
            return undefined
        }

        // Ya resueltos: el render los pinta desde la caché; se fija ese mismo
        // estado sin pasar por `pending` (haría parpadear la portada).
        const resolved = targets.map((target) => coverArtCache.get(target.key))
        if (resolved.every((value) => value === null || typeof value === 'string')) {
            setState({ key: targetKey, pending: false, images: resolved.filter(Boolean).map(posterUrl) })
            return undefined
        }

        setState({ key: targetKey, pending: true, images: [] })
        void Promise.all(
            targets.map(async (target, index) => {
                const posterPath = await resolveCoverArt(
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

    if (state.key === targetKey) return state
    // Pósters ya resueltos en esta sesión (volver atrás): salen en el primer
    // render, sin un fotograma de huecos mientras el efecto los recupera.
    const resolved = targets.map((target) => coverArtCache.get(target.key))
    if (targets.length && resolved.every((value) => value === null || typeof value === 'string')) {
        return { key: targetKey, pending: false, images: resolved.filter(Boolean).map(posterUrl) }
    }
    return { key: targetKey, pending: targets.length > 0, images: [] }
}

// Arte sin texto de los primeros títulos de la lista para el FONDO móvil (ver
// MobileCollageBackground). Mismo lote y misma caché que la portada; sin
// precarga: es un fondo difuminado que aparece con el scroll.
function useBackgroundCoverArt(items, enabled) {
    const targets = useMemo(
        () => (enabled ? buildBackgroundCollageTargets(items, MAX_BACKGROUND_TILE_COUNT) : []),
        [items, enabled],
    )
    const targetKey = targets.map((target) => target.key).join('|')
    const [state, setState] = useState({ key: '', paths: [] })

    useEffect(() => {
        if (!targets.length) return undefined
        let cancelled = false
        void Promise.all(targets.map((target) => resolveCoverArt(target, 'normal'))).then((paths) => {
            if (!cancelled) setState({ key: targetKey, paths: paths.filter(Boolean) })
        })
        return () => {
            cancelled = true
        }
        // `targetKey` identifica la lista de títulos.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetKey])

    if (state.key === targetKey) return state.paths
    const cached = targets.map((target) => coverArtCache.get(target.key))
    return cached.every((value) => value === null || typeof value === 'string') ? cached.filter(Boolean) : []
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
// vacío mientras se descargaba. Entra con un fundido sin otro zoom sobre la entrada del hero; si
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
                instant ? '' : 'transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'
            } ${visible ? 'opacity-100' : 'opacity-0'}`}
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

// UNIONES DEL MOSAICO: en vez de una línea entre celdas, cada imagen se
// prolonga COLLAGE_FEATHER_PX por fuera de su celda y en esa prolongación se
// desvanece. Las celdas posteriores se pintan encima de las anteriores, así
// que en cada unión la imagen de un lado empieza opaca justo en el borde y se
// funde sobre la del otro: un fundido sin línea y sin banda oscura (si las dos
// se desvanecieran a la vez, asomaría el fondo en medio). En el borde exterior
// del mosaico la prolongación cae fuera y se recorta: ahí no hay fundido.
const COLLAGE_FEATHER_PX = 12
// Rampa suave (smoothstep) de opaco a transparente sobre la prolongación.
const featherRamp = (direction) => `linear-gradient(${direction},
    transparent 0px,
    rgba(0, 0, 0, 0.104) ${COLLAGE_FEATHER_PX * 0.2}px,
    rgba(0, 0, 0, 0.352) ${COLLAGE_FEATHER_PX * 0.4}px,
    rgba(0, 0, 0, 0.648) ${COLLAGE_FEATHER_PX * 0.6}px,
    rgba(0, 0, 0, 0.896) ${COLLAGE_FEATHER_PX * 0.8}px,
    #000 ${COLLAGE_FEATHER_PX}px,
    #000 calc(100% - ${COLLAGE_FEATHER_PX}px),
    rgba(0, 0, 0, 0.896) calc(100% - ${COLLAGE_FEATHER_PX * 0.8}px),
    rgba(0, 0, 0, 0.648) calc(100% - ${COLLAGE_FEATHER_PX * 0.6}px),
    rgba(0, 0, 0, 0.352) calc(100% - ${COLLAGE_FEATHER_PX * 0.4}px),
    rgba(0, 0, 0, 0.104) calc(100% - ${COLLAGE_FEATHER_PX * 0.2}px),
    transparent 100%)`
const COLLAGE_TILE_STYLE = {
    inset: -COLLAGE_FEATHER_PX,
    WebkitMaskImage: `${featherRamp('to right')}, ${featherRamp('to bottom')}`,
    maskImage: `${featherRamp('to right')}, ${featherRamp('to bottom')}`,
    WebkitMaskComposite: 'source-in',
    maskComposite: 'intersect',
}

// FONDO MÓVIL DE UNA LISTA: el mosaico de la portada, AMPLIADO. Misma rejilla
// (columnas y alto de fila, con el alto de la portada), mismo sobrebarrido y
// mismas imágenes arriba, así que coincide celda a celda con la portada; debajo
// sigue con más títulos hasta llenar la pantalla. Al hacer scroll la portada se
// desvanece sobre él (relevo `.sv-hero-scroll-out` / `-in`), y se lee como si el
// mosaico creciera y se quedara de fondo. Va difuminado con los valores de
// `.hero-bg-base` en móvil (sin su escala, que lo descuadraría de la portada).
function MobileCollageBackground({ tiles, cols, rows }) {
    return (
        <div
            className="absolute inset-x-0 sm:hidden"
            style={{
                top: 'var(--mobile-cover-top, 0px)',
                height: 'var(--mobile-cover-h)',
                // Mismo sobrebarrido y desde el mismo punto que la portada.
                transform: `scale(${MOBILE_POSTER_OVERSCAN})`,
                transformOrigin: 'top center',
                filter: 'brightness(0.9) saturate(1.03) blur(4px)',
            }}
        >
            <div
                className="grid bg-neutral-950"
                style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gridAutoRows: `calc(var(--mobile-cover-h) / ${rows})`,
                }}
            >
                {tiles.map((src, index) => (
                    <div key={`${index}-${src}`} className="relative min-h-0">
                        <div className="absolute" style={COLLAGE_TILE_STYLE}>
                            {/* Fondo decorativo difuminado: <img> directo. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={src}
                                alt=""
                                decoding="async"
                                fetchPriority="low"
                                className="h-full w-full object-cover"
                            />
                        </div>
                    </div>
                ))}
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
                className={`grid h-full w-full overflow-hidden bg-neutral-950 ${layout.gridClassName}`}
                aria-hidden="true"
            >
                {tiles.map((src, index) => (
                    <div
                        key={src}
                        className={`relative min-h-0 ${layout.tileClassNames[index]}`}
                    >
                        <div className="absolute" style={COLLAGE_TILE_STYLE}>
                            <PosterCover src={src} priority={index === 0} />
                        </div>
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
 * - posterItems?: Array (títulos TMDb para el mosaico de portada, con su arte SIN
 *   texto: ver `resolveCoverArt`)
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
    posterPending = false,
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
    const finalPosterArtwork = useCoverArtImages(posterItems)

    // MODO DE PORTADA póster ↔ backdrop, como en DetailsClient (misma
    // preferencia global, solo escritorio). Disponible con un backdrop con
    // idioma (colecciones) o, en listas, con pósters para la estantería.
    const coverMode = usePosterViewMode()
    const reduceMotion = useReducedMotion()
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

    // ---- MÓVIL: cabecera inmersiva de DetailsClient ----
    // Solo en las páginas de verdad (con su fila de acciones); los estados de
    // error conservan la cabecera simple.
    const mobileHero = Boolean(heroActions)
    // Con portada oficial el título ya va impreso en la imagen (colecciones);
    // con el mosaico (listas) se pinta encima, donde la ficha pone el logo.
    // `posterPending`: la página aún elige la portada (colecciones: la inglesa
    // de su galería); no se enseña otra para cambiarla después.
    const showMobileTitle = !posterImage && !posterPending
    const mobileCoverFirstSrc = posterLowImage || posterImage || null
    const mobileCoverLoad = useImageLoadReady(mobileCoverFirstSrc)
    const [mobileCoverFailedSrc, setMobileCoverFailedSrc] = useState(null)
    const mobileCoverFailed = Boolean(mobileCoverFirstSrc) && mobileCoverFailedSrc === mobileCoverFirstSrc
    const mobileCoverReady = mobileCoverFirstSrc
        ? mobileCoverLoad.ready || mobileCoverFailed
        : !posterPending && !finalPosterArtwork.pending
    // Al volver atrás todo se pinta tal cual, sin entrada.
    const animateMobileEntry = !isBackNav

    // Medidas, relevo con el scroll y revelados de la cabecera inmersiva
    // (compartidos con las temporadas, ver details/MobileDetailsHero).
    const {
        rootRef: heroRootRef,
        coverSpacerRef: heroCoverSpacerRef,
        actionRowRef: heroActionRowRef,
        scoreboardRef: heroScoreboardRef,
        secondaryTriggerRef: heroSecondaryTriggerRef,
        isPhone,
        scoreboardMode: heroScoreboardMode,
        revealProps: heroRevealProps,
        statsRevealProps: heroStatsRevealProps,
        rootStyle: heroRootStyle,
    } = useMobileDetailsHero(mobileHero, { lock: mobileCoverReady })
    // Qué cabe bajo los botones sin recortar la portada (solo teléfono).
    const mobileScoreboardMode = mobileHero && isPhone ? heroScoreboardMode : 'full'

    // FONDO MÓVIL DE LAS LISTAS (sin portada oficial): el mosaico ampliado de
    // la portada (MobileCollageBackground). Solo en teléfono y cuando hay
    // mosaico de verdad; sus imágenes se piden cuando la portada ya está lista.
    const coverTiles = useMemo(() => buildPosterCollageTiles(finalPosterArtwork.images), [finalPosterArtwork.images])
    const collageBackground = mobileHero && isPhone && !posterImage && coverTiles.length > 1
    const backgroundArt = useBackgroundCoverArt(posterItems, collageBackground && mobileCoverReady)
    const collageGrid = getPosterCollageGrid(coverTiles.length)
    // Dos portadas de alto llenan siempre la pantalla (la portada mide al
    // menos 125vw y la pantalla, menos de dos veces eso).
    const backgroundTiles = collageBackground
        ? buildBackgroundCollageTiles(
            coverTiles,
            backgroundArt.map((path) => `https://image.tmdb.org/t/p/w185${path}`),
            collageGrid.cols * collageGrid.rows * 2,
        )
        : []

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
        <div
            ref={heroRootRef}
            className="min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-purple-500/30"
            style={heroRootStyle}
        >
            <div className={`fixed inset-0 pointer-events-none overflow-hidden ${heroBackground ? 'bg-[#0a0a0a]' : mobileHero ? 'max-sm:bg-[#0a0a0a]' : ''}`}>
                {/* Fondo de la página. MÓVIL con cabecera inmersiva: aparece con
                    el scroll (`--sv-hero-scroll`), detrás de la portada fija,
                    como la capa base de la ficha. */}
                <div
                    className={`absolute inset-0 ${
                        mobileHero ? 'sv-hero-scroll-in max-sm:[opacity:var(--sv-hero-scroll,0)] sm:opacity-100' : ''
                    }`}
                >
                    {heroBackground ? (
                        heroBackground.desktop || heroBackground.mobile ? <HeroBackground
                            key={`${heroBackground.desktop || ''}|${heroBackground.mobile || ''}`}
                            desktop={heroBackground.desktop}
                            mobile={heroBackground.mobile}
                            animate={!isBackNav}
                        /> : null
                    ) : (
                        <>
                            {/* Con el mosaico ampliado de fondo (teléfono), el
                                fondo tenue de escritorio sobra: se queda solo
                                desde `sm`. */}
                            <div className={`absolute inset-0 ${backgroundTiles.length ? 'max-sm:hidden' : ''}`}>
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
                            {backgroundTiles.length ? (
                                <MobileCollageBackground
                                    tiles={backgroundTiles}
                                    cols={collageGrid.cols}
                                    rows={collageGrid.rows}
                                />
                            ) : null}
                        </>
                    )}
                </div>

                {mobileHero ? (
                    <MobileHeroCover
                        src={posterImage}
                        lowSrc={posterLowImage}
                        imgRef={mobileCoverLoad.imgRef}
                        onLoad={mobileCoverLoad.onLoad}
                        onError={() => setMobileCoverFailedSrc(mobileCoverFirstSrc)}
                        failed={mobileCoverFailed}
                        ready={mobileCoverReady}
                        animate={animateMobileEntry}
                        collage={(
                            <PosterCollage
                                images={finalPosterArtwork.images}
                                pending={finalPosterArtwork.pending}
                            />
                        )}
                    />
                ) : null}

                {/* Sombreados de legibilidad de la ficha (DetailsClient). En
                    MÓVIL con cabecera inmersiva siguen al scroll hasta el 60%,
                    como en la ficha: la portada entra limpia. Sin `heroBackground`
                    (listas) solo existen en móvil, sobre su portada. */}
                {heroBackground || mobileHero ? (
                    <div
                        className={`absolute inset-0 ${
                            mobileHero
                                ? 'sv-hero-scroll-shade max-sm:[opacity:calc(var(--sv-hero-scroll,0)*0.6)] sm:opacity-100'
                                : 'max-sm:opacity-60'
                        } ${heroBackground ? '' : 'sm:hidden'}`}
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#101010]/60 via-transparent to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-l from-[#101010]/60 via-transparent to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/60 to-black/20" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#101010] via-transparent to-transparent opacity-30" />
                    </div>
                ) : null}
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
                    initial={isBackNav || reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                    // Backdrop con sinopsis debajo: 24 px hasta ella, la misma
                    // separación que entre los botones y el marcador.
                    // MÓVIL inmersivo: sube hasta el borde superior (los 2rem
                    // del `py-8` + los 3rem del navbar) para que el espaciador
                    // de la portada coincida con la portada fija; y sin la
                    // entrada de Framer (su `opacity` apagaría el cristal de los
                    // botones): allí entran portada y botones con las clases de
                    // la ficha.
                    className={`${isBackdropCover && hasInfoTabs ? 'mb-6' : 'mb-12'} flex flex-col items-start lg:flex-row lg:gap-12 ${
                        mobileHero
                            ? '-mt-[5rem] gap-5 sm:mt-0 sm:gap-8 max-sm:![transform:none] max-sm:!opacity-100'
                            : 'gap-8'
                    }`}
                >
                    {/* MÓVIL: hueco del alto de la portada fija (que va en el
                        fondo de la página) y, en listas, el título encima, donde
                        la ficha pone el logo y con su misma entrada. */}
                    {mobileHero ? (
                        <div
                            ref={heroCoverSpacerRef}
                            className="relative -mx-4 w-[calc(100%+2rem)] max-w-none flex-shrink-0 sm:hidden"
                            // Solo la portada: los botones van justo debajo.
                            style={{ height: 'var(--mobile-cover-h)' }}
                        >
                            {showMobileTitle && mobileCoverReady ? (
                                <motion.div
                                    initial={animateMobileEntry ? { opacity: 0, y: 18, scale: 0.94 } : false}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 0.48, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
                                    className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center p-4 text-center motion-reduce:!transform-none motion-reduce:!opacity-100"
                                >
                                    <div className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-yellow-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                                        <Film className="h-4 w-4" />
                                        {sourceLabel}
                                    </div>
                                    <h1 className="max-w-[90%] text-4xl font-black leading-[1] tracking-tight text-white text-balance drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
                                        {title || 'Lista'}
                                    </h1>
                                </motion.div>
                            ) : null}
                        </div>
                    ) : null}

                    {/* Columna de la portada: 320 px en póster, 600 px en
                        backdrop (los anchos de la ficha), con su transición.
                        En móvil inmersivo la portada es la fija del fondo. */}
                    <div
                        className={`relative z-10 mx-auto w-full max-w-[280px] flex-shrink-0 flex-col gap-5 lg:mx-0 ${
                            mobileHero ? 'hidden sm:flex' : 'flex'
                        } ${
                            isBackdropCover ? 'sm:max-w-full lg:max-w-[600px]' : 'lg:max-w-[320px]'
                        }`}
                        style={animateCover ? { transition: 'max-width 500ms cubic-bezier(0.25, 1, 0.5, 1)' } : undefined}
                    >
                        <CoverShape
                            backdrop={isBackdropCover}
                            animate={animateCover}
                            onPointerEnter={canToggleCover ? () => setBackdropWanted(true) : undefined}
                        >
                            {posterPending && !posterImage ? null : posterImage ? (
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
                                                pending={finalPosterArtwork.pending}
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
                        {/* MÓVIL inmersivo: el título va sobre la portada (o
                            impreso en ella, en colecciones). */}
                        <div className={`mb-5 px-1 flex-col items-center md:items-start text-center md:text-left w-full ${mobileHero ? 'hidden sm:flex' : 'flex'}`}>
                            <div className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                                <Film className="h-4 w-4" />
                                {sourceLabel}
                            </div>
                            <h1 className="text-center text-4xl font-black leading-[1] tracking-tight text-white drop-shadow-xl text-balance md:text-left md:text-5xl lg:text-6xl">
                                {title || 'Lista'}
                            </h1>
                        </div>

                        {/* MÓVIL: fila de acciones como la de la ficha, pegada
                            a la portada (`-top-2`) y con su entrada (la fila
                            sube y los botones caen en cascada) cuando la
                            portada está lista; hasta entonces, invisible pero
                            ocupando su sitio. */}
                        {heroActions ? (
                            <div className={`relative mb-6 px-1 ${mobileHero ? 'max-sm:-top-2 max-sm:mb-4' : ''}`}>
                                <div
                                    ref={heroActionRowRef}
                                    className={
                                        !mobileHero || !animateMobileEntry
                                            ? ''
                                            : mobileCoverReady
                                                ? MOBILE_ACTIONS_ENTRY_ANIMATION
                                                : 'max-sm:invisible'
                                    }
                                >
                                    {heroActions}
                                </div>
                            </div>
                        ) : null}

                        {/* Móvil: el marcador de teléfono de la ficha
                            (`mobileScoresOnly`, el mismo de DetailsClient):
                            puntuaciones y stats repartidas a todo el ancho. Con
                            la cabecera inmersiva va bajo los botones según el
                            sitio que deja la portada, que NUNCA se recorta:
                            completo o solo puntuaciones ('compact', la barra de
                            stats se revela con el scroll). Entra con la
                            animación del marcador de la ficha justo después de
                            los botones. */}
                        <div
                            ref={heroScoreboardRef}
                            // El margen va en este envoltorio y no en el panel:
                            // la cabecera móvil mide su alto (sin márgenes).
                            // Es para la sinopsis que va debajo en la columna;
                            // en backdrop baja bajo la cabecera y se sumaba al de
                            // la cabecera (56 px en total).
                            className={`${isBackdropCover && hasInfoTabs ? '' : 'mb-6'} ${
                                !mobileHero
                                    ? ''
                                    // Centrado entre los botones y el navbar
                                    // inferior (`--mobile-scoreboard-shift`).
                                    // Solo lleva dos puntuaciones (TMDb e
                                    // IMDb): tan ancho como la fila de botones
                                    // o el navbar (`--mobile-actions-w`), no
                                    // de borde a borde con hueco a los lados.
                                    : `max-sm:mt-[var(--mobile-scoreboard-shift,0px)] max-sm:mx-auto max-sm:w-[var(--mobile-actions-w,100%)] max-sm:max-w-full ${mobileScoreboardMode === 'compact' ? MOBILE_STATS_REVEAL_BASE : ''} ${
                                        !animateMobileEntry
                                            ? ''
                                            : mobileCoverReady
                                                ? MOBILE_SCOREBOARD_ENTRY_ANIMATION
                                                : 'max-sm:invisible'
                                    }`
                            }`}
                            {...(mobileScoreboardMode === 'compact' ? heroStatsRevealProps : {})}
                        >
                            <DetailsScoreboardPanel
                                mobileScoresOnly
                                {...scoreboardRatings}
                                statItems={scoreboardStats.length ? scoreboardStats : stats.map((stat) => ({
                                    icon: stat.icon,
                                    label: stat.label,
                                    value: stat.value,
                                }))}
                            />
                        </div>

                        {mobileHero ? (
                            <span
                                ref={heroSecondaryTriggerRef}
                                aria-hidden="true"
                                className="block h-px sm:hidden"
                            />
                        ) : null}

                        {/* En backdrop la descripción baja bajo la cabecera, a
                            todo el ancho, como las pestañas de la ficha. En
                            móvil aparece al hacer scroll. */}
                        {isBackdropCover || !infoTabs ? null : mobileHero ? (
                            <div className={MOBILE_REVEAL_BASE} {...heroRevealProps}>
                                {infoTabs}
                            </div>
                        ) : infoTabs}

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
