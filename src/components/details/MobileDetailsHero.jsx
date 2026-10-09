'use client'

// CABECERA MÓVIL INMERSIVA (<640) compartida por las páginas de detalle que no
// son la ficha principal: listas y colecciones (UnifiedListDetailsLayout) y
// temporadas (SeasonDetailsClient). Reproduce la composición de DetailsClient:
//   - portada FIJA pegada arriba: el póster ENTERO, a todo el ancho y en 2:3
//     (150vw). NUNCA se recorta para que quepa otra cosa; con su borde
//     inferior prolongado y difuminado;
//   - fila de acciones justo debajo, con la cascada de entrada de la ficha;
//   - debajo, lo que quepa sobre el navbar inferior (`scoreboardMode`): el
//     marcador completo ('full'), solo sus puntuaciones con la barra de stats
//     revelada al hacer scroll ('compact') o nada ('reveal': el marcador
//     completo se revela con el scroll);
//   - el grupo botones + marcador va PEGADO al navbar inferior: el sitio que
//     sobre (`--mobile-hero-gap`) se deja entre la portada y los botones, donde
//     está la prolongación difuminada del póster, no vacío bajo los botones;
//   - relevo con el scroll: la portada se desvanece mientras aparece el fondo
//     de la página (`.sv-hero-scroll-out` / `.sv-hero-scroll-in` en
//     globals.css), con un recorrido que se acorta en páginas cortas.
//
// La página pone `rootStyle` y `rootRef` en su contenedor (de ahí salen
// `--mobile-cover-h`, el alto de la portada, y `--mobile-cover-top`, dónde
// empieza), `coverSpacerRef` en el hueco en flujo que reserva la portada (se
// mide dónde cae: la portada fija se coloca ahí; 0 cuando la página sube el
// hueco hasta detrás del navbar, como la ficha, y el alto del navbar cuando lo
// deja debajo, como las temporadas), `actionRowRef` en la fila de
// acciones, `scoreboardRef` en el envoltorio del marcador (SIN márgenes
// propios: se mide su alto) y `secondaryTriggerRef` en un centinela antes de
// lo que se revela con el scroll, que lleva `revealProps` + MOBILE_REVEAL_BASE.
// En modo 'compact' el envoltorio del marcador lleva MOBILE_STATS_REVEAL_BASE +
// `statsRevealProps`: su fila de estadísticas (la marca `data-scoreboard-stats`
// de DetailsStatsRow, que aquí se mide) queda oculta hasta hacer scroll. El
// hueco de la portada mide `calc(var(--mobile-cover-h) + var(--mobile-hero-gap))`.
//
// Las clases de revelado son copia de las de DetailsClient (allí son
// constantes locales que sus tests leen del propio fichero); si cambian allí,
// hay que cambiarlas aquí.

import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Modo 'compact': la barra de stats del marcador se oculta hasta el scroll
// (con el mismo disparador que lo secundario).
const MOBILE_STATS_REVEAL_ATTR = 'data-mobile-reveal-stats'
export const MOBILE_STATS_REVEAL_BASE =
    'max-sm:[&[data-mobile-reveal-stats=hidden]_[data-scoreboard-stats]]:hidden'
export const MOBILE_REVEAL_BASE =
    'max-sm:transform-gpu max-sm:data-[mobile-reveal=hidden]:invisible max-sm:data-[mobile-reveal=hidden]:pointer-events-none max-sm:data-[mobile-reveal=hidden]:**:!transition-none'
const MOBILE_REVEAL_ATTR = 'data-mobile-reveal'
const MOBILE_REVEAL_SHOW_AT_PX = 16
// Alto de la navegación inferior flotante que tapa el borde de la pantalla.
const MOBILE_BOTTOM_NAV_PX = 88
// Hueco entre los botones y el marcador (16px) más el que queda entre el
// marcador y el navbar inferior (20px: con las píldoras de la temporada bajo
// el marcador, 8px las dejaban pegadas al navbar).
const MOBILE_SCOREBOARD_GAP_PX = 36
// Aparición del marcador al revelarse con el scroll (pantallas muy bajas), la
// de DetailsClient.
export const MOBILE_SCOREBOARD_REVEAL_ANIMATION =
    'max-sm:motion-safe:data-[mobile-reveal=shown]:*:animate-sv-mobile-scoreboard-reveal'
// Entrada del marcador visible al cargar: la misma animación, justo después
// de los botones.
export const MOBILE_SCOREBOARD_ENTRY_ANIMATION =
    'max-sm:motion-safe:*:animate-sv-mobile-scoreboard-reveal max-sm:*:[animation-delay:140ms]'
// Cascada de entrada de la fila de acciones (globals.css).
export const MOBILE_ACTIONS_ENTRY_ANIMATION = 'sv-mobile-actions-reveal sv-mobile-actions-rise'
const HERO_SCROLL_TIMELINE_QUERY = '(animation-timeline: scroll()) and (animation-range: 0% 100%)'
const PHONE_QUERY = '(width < 40rem)'
// Mismo sobrebarrido que la portada móvil de la ficha.
export const MOBILE_POSTER_OVERSCAN = 1.02

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// Lo que tapa la navegación inferior flotante, medido en pantalla (incluye su
// margen y la zona segura de la barra de gestos) más un poco de aire. Sin ella
// en el DOM, la reserva de la ficha (6rem).
const MOBILE_BOTTOM_NAV_SELECTOR = '.sv-navbar-bottom-shift'
const MOBILE_BOTTOM_NAV_AIR_PX = 12
function readBottomNavReserve() {
    const nav = document.querySelector(MOBILE_BOTTOM_NAV_SELECTOR)
    // `offsetTop` (fijo: respecto a la ventana) y no el rectángulo: el navbar
    // se esconde con un `transform` al hacer scroll y eso no debe contar.
    const top = nav?.offsetTop
    if (!Number.isFinite(top) || top <= 0) return 96
    return Math.max(0, window.innerHeight - top) + MOBILE_BOTTOM_NAV_AIR_PX
}

/**
 * Estado y medidas de la cabecera inmersiva. `enabled`: la página la usa (en
 * teléfono; desde `sm` nada de esto aplica). `lock`: la portada ya se ve; desde
 * entonces lo que hay bajo los botones queda FIJO y solo se recalcula si cambia
 * el ancho de la ventana (no por datos que llegan, ni por la barra de
 * direcciones, que cambia el alto al hacer scroll).
 */
export function useMobileDetailsHero(enabled, { lock = false } = {}) {
    const rootRef = useRef(null)
    const coverSpacerRef = useRef(null)
    const actionRowRef = useRef(null)
    const scoreboardRef = useRef(null)
    const secondaryTriggerRef = useRef(null)
    const heroScrollEndRef = useRef(0)
    const lockRef = useRef(lock)
    // Alto de la fila de estadísticas del marcador, recordado de cuando se
    // pintó completo (en modo 'compact' no está en el DOM).
    const statsRowHeightRef = useRef(0)
    const [isPhone, setIsPhone] = useState(false)
    const [coverTop, setCoverTop] = useState(0)
    // Qué cabe bajo los botones sin tocar la portada (ver arriba). Arranca en
    // 'full' para pintar y medir el marcador completo; todo esto ocurre antes
    // de que se vean portada y marcador (esperan a que cargue la imagen).
    const [scoreboardMode, setScoreboardMode] = useState('full')
    // Sitio sobrante bajo el grupo botones + marcador: se pasa ENCIMA de los
    // botones para que el grupo quede pegado al navbar inferior.
    const [heroGap, setHeroGap] = useState(0)
    const [secondaryVisible, setSecondaryVisible] = useState(false)

    useClientLayoutEffect(() => {
        lockRef.current = lock
    }, [lock])

    useClientLayoutEffect(() => {
        const media = window.matchMedia(PHONE_QUERY)
        const update = () => setIsPhone(media.matches)
        update()
        media.addEventListener('change', update)
        return () => media.removeEventListener('change', update)
    }, [])

    // Qué cabe bajo los botones. La portada mide siempre 150vw (el póster
    // entero): lo que queda entre el pie de los botones y el navbar inferior
    // decide si va el marcador completo, solo sus puntuaciones o nada.
    useClientLayoutEffect(() => {
        const row = actionRowRef.current
        const scoreboard = scoreboardRef.current
        if (!enabled || !row) return undefined
        let lastWidth = window.innerWidth
        const update = () => {
            const widthChanged = window.innerWidth !== lastWidth
            lastWidth = window.innerWidth
            if (lockRef.current && !widthChanged) return
            // Posición del hueco en el documento (no en pantalla), así no
            // depende del scroll.
            const spacer = coverSpacerRef.current
            const top = spacer ? Math.max(0, Math.round(spacer.getBoundingClientRect().top + window.scrollY)) : 0
            setCoverTop((current) => (current === top ? current : top))
            if (!scoreboard) return
            const rowHeight = Math.ceil(row.getBoundingClientRect().height || 60)
            const total = Math.ceil(scoreboard.getBoundingClientRect().height)
            const statsRow = scoreboard.querySelector('[data-scoreboard-stats]')
            const statsHeight = statsRow ? Math.ceil(statsRow.getBoundingClientRect().height) : 0
            if (statsHeight) statsRowHeightRef.current = statsHeight
            const compactHeight = total - statsHeight
            const fullHeight = compactHeight + statsRowHeightRef.current
            const space =
                window.innerHeight - readBottomNavReserve() - top
                - window.innerWidth * 1.5 - rowHeight - MOBILE_SCOREBOARD_GAP_PX
            const mode = space >= fullHeight ? 'full' : space >= compactHeight ? 'compact' : 'reveal'
            setScoreboardMode((current) => (current === mode ? current : mode))
            // Lo que ocupa bajo los botones lo visible al cargar: el marcador
            // completo o compacto (con su separación de 16px, ya en el hueco
            // de MOBILE_SCOREBOARD_GAP_PX) o nada (se descuenta esa separación).
            const used = mode === 'full' ? fullHeight : mode === 'compact' ? compactHeight : -16
            const gap = Math.max(0, Math.floor(space - used))
            setHeroGap((current) => (current === gap ? current : gap))
        }
        update()
        window.addEventListener('resize', update, { passive: true })
        if (typeof ResizeObserver === 'undefined') {
            return () => window.removeEventListener('resize', update)
        }
        const observer = new ResizeObserver(update)
        observer.observe(row)
        if (scoreboard) observer.observe(scoreboard)
        return () => {
            window.removeEventListener('resize', update)
            observer.disconnect()
        }
    }, [enabled])

    // Recorrido del relevo portada → fondo: 55vh, como en la ficha, salvo que
    // la página no dé para tanto (p. ej. colecciones de una sola fila de
    // títulos): entonces el 85% de lo que se puede desplazar, para que el
    // relevo termine ANTES de llegar al tope. Se publica en
    // `--sv-hero-scroll-end` (lo leen las animaciones ligadas al scroll de
    // globals.css, también el cristal del navbar) solo cuando cambia el alto
    // de la página o de la ventana.
    useEffect(() => {
        const root = document.documentElement
        if (!enabled || !isPhone) return undefined
        let applied = ''
        const update = () => {
            const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight)
            const end = Math.max(1, Math.round(Math.min(window.innerHeight * 0.55, maxScroll * 0.85)))
            heroScrollEndRef.current = end
            const value = `${end}px`
            if (value === applied) return
            applied = value
            root.style.setProperty('--sv-hero-scroll-end', value)
        }
        update()
        window.addEventListener('resize', update, { passive: true })
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
        if (rootRef.current) observer?.observe(rootRef.current)
        return () => {
            window.removeEventListener('resize', update)
            observer?.disconnect()
            heroScrollEndRef.current = 0
            root.style.removeProperty('--sv-hero-scroll-end')
        }
    }, [enabled, isPhone])

    // Respaldo de `--sv-hero-scroll` donde no hay animaciones ligadas al scroll
    // (mismo recorrido). Con soporte, `.sv-hero-scroll-in/-shade/-out` lo
    // resuelven en el compositor. El cristal del navbar en estas rutas también
    // lee la variable.
    useEffect(() => {
        const root = document.documentElement
        if (!enabled || !isPhone || CSS.supports?.(HERO_SCROLL_TIMELINE_QUERY)) return undefined
        let raf = 0
        const apply = () => {
            raf = 0
            const dist = heroScrollEndRef.current || Math.max(1, window.innerHeight * 0.55)
            const p = Math.min(1, Math.max(0, window.scrollY / dist))
            root.style.setProperty('--sv-hero-scroll', p.toFixed(4))
        }
        const onScroll = () => {
            if (!raf) raf = window.requestAnimationFrame(apply)
        }
        apply()
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll, { passive: true })
        return () => {
            if (raf) window.cancelAnimationFrame(raf)
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
            root.style.removeProperty('--sv-hero-scroll')
        }
    }, [enabled, isPhone])

    // Lo secundario (sinopsis; el marcador si no cabe) no compite con la
    // portada al entrar: se revela al cruzar el navbar inferior y se oculta al
    // volver arriba, como en la ficha. El atributo se escribe en el DOM en el
    // mismo evento de scroll y el estado de React se pone al día después
    // (mismos valores).
    useEffect(() => {
        const trigger = secondaryTriggerRef.current
        const container = rootRef.current
        if (!enabled || !isPhone || !trigger || !container) {
            setSecondaryVisible(false)
            return undefined
        }
        let applied = null
        const sync = () => {
            const revealLine = window.innerHeight - MOBILE_BOTTOM_NAV_PX
            const nextVisible =
                window.scrollY > MOBILE_REVEAL_SHOW_AT_PX &&
                trigger.getBoundingClientRect().top <= revealLine
            if (nextVisible === applied) return
            applied = nextVisible
            container.querySelectorAll(`[${MOBILE_REVEAL_ATTR}]`).forEach((el) => {
                el.setAttribute(MOBILE_REVEAL_ATTR, nextVisible ? 'shown' : 'hidden')
                el.inert = !nextVisible
            })
            // La barra de stats del modo compacto: solo se muestra/oculta, el
            // marcador sigue siendo interactivo.
            container.querySelectorAll(`[${MOBILE_STATS_REVEAL_ATTR}]`).forEach((el) => {
                el.setAttribute(MOBILE_STATS_REVEAL_ATTR, nextVisible ? 'shown' : 'hidden')
            })
            startTransition(() => {
                setSecondaryVisible((current) => (current === nextVisible ? current : nextVisible))
            })
        }
        const observer = new IntersectionObserver(sync, {
            rootMargin: `0px 0px -${MOBILE_BOTTOM_NAV_PX}px 0px`,
            threshold: 0,
        })
        observer.observe(trigger)
        sync()
        window.addEventListener('scroll', sync, { passive: true })
        window.addEventListener('resize', sync, { passive: true })
        return () => {
            observer.disconnect()
            window.removeEventListener('scroll', sync)
            window.removeEventListener('resize', sync)
        }
    }, [enabled, isPhone])

    // Solo se oculta en teléfono: en tablet/escritorio las variantes `max-sm:`
    // no aplican, pero `inert` sí bloquearía el foco.
    const secondaryHidden = enabled && isPhone && !secondaryVisible

    return {
        rootRef,
        coverSpacerRef,
        actionRowRef,
        scoreboardRef,
        secondaryTriggerRef,
        isPhone,
        scoreboardMode,
        revealProps: enabled
            ? {
                [MOBILE_REVEAL_ATTR]: secondaryVisible ? 'shown' : 'hidden',
                inert: secondaryHidden,
            }
            : {},
        statsRevealProps: enabled
            ? { [MOBILE_STATS_REVEAL_ATTR]: secondaryVisible ? 'shown' : 'hidden' }
            : {},
        // La portada: el póster entero (2:3 a todo el ancho), siempre.
        rootStyle: enabled
            ? {
                '--mobile-cover-top': `${coverTop}px`,
                '--mobile-cover-h': '150vw',
                '--mobile-hero-gap': `${heroGap}px`,
            }
            : undefined,
    }
}

// MÓVIL: portada FIJA pegada arriba, como la de DetailsClient (mismo `cover`
// con sobrebarrido), pero como mucho 2:3 a todo el ancho para no recortar los
// lados (ver `--mobile-cover-h`). Va en el fondo fijo de la página; el contenido en flujo pasa por
// encima al hacer scroll y su opacidad sigue a `--sv-hero-scroll` (el mismo
// relevo nítido → difuminado de la ficha). Con portada oficial (colecciones)
// se pinta la ligera y la grande encima al decodificarse; sin ella (listas),
// el mosaico de pósters de sus títulos.
//
// Borde inferior. Con mosaico (listas), el fundido largo de la ficha (60% →
// 100%), porque encima va el título como el logo de la ficha. Con portada
// oficial (colecciones) el título viene IMPRESO y un fundido sobre la imagen
// lo apagaba; uno corto dejaba un escalón contra el fondo. Así que la imagen
// se PROLONGA hacia abajo: una capa DIFUMINADA con el póster y, debajo, su
// última fila de píxeles estirada, que se desvanece hasta el fondo.
//
// Esa capa no empieza en el borde: aparece poco a poco en los últimos
// MOBILE_COVER_BLUR_BAND_PX del póster. Si empezara en seco, el paso de imagen
// con detalle (tramas, texturas) a imagen lisa se leía como una línea aunque
// el color fuera el mismo; así el póster se va desenfocando antes de llegar
// al borde y no hay ningún punto donde cambie de golpe.
const MOBILE_COVER_EXTEND_PX = 200
const MOBILE_COVER_BLUR_BAND_PX = 64
// Curva suave (smoothstep) para la entrada de la capa difuminada.
const MOBILE_COVER_EXTEND_MASK = `linear-gradient(to bottom,
    transparent calc(var(--mobile-cover-h) - ${MOBILE_COVER_BLUR_BAND_PX}px),
    rgba(0, 0, 0, 0.104) calc(var(--mobile-cover-h) - ${MOBILE_COVER_BLUR_BAND_PX * 0.8}px),
    rgba(0, 0, 0, 0.352) calc(var(--mobile-cover-h) - ${MOBILE_COVER_BLUR_BAND_PX * 0.6}px),
    rgba(0, 0, 0, 0.648) calc(var(--mobile-cover-h) - ${MOBILE_COVER_BLUR_BAND_PX * 0.4}px),
    rgba(0, 0, 0, 0.896) calc(var(--mobile-cover-h) - ${MOBILE_COVER_BLUR_BAND_PX * 0.2}px),
    #000 var(--mobile-cover-h),
    #000 calc(var(--mobile-cover-h) + 16px),
    rgba(0, 0, 0, 0.784) calc(var(--mobile-cover-h) + ${MOBILE_COVER_EXTEND_PX * 0.35}px),
    rgba(0, 0, 0, 0.5) calc(var(--mobile-cover-h) + ${MOBILE_COVER_EXTEND_PX * 0.55}px),
    rgba(0, 0, 0, 0.216) calc(var(--mobile-cover-h) + ${MOBILE_COVER_EXTEND_PX * 0.75}px),
    rgba(0, 0, 0, 0.058) calc(var(--mobile-cover-h) + ${MOBILE_COVER_EXTEND_PX * 0.9}px),
    transparent calc(var(--mobile-cover-h) + ${MOBILE_COVER_EXTEND_PX}px))`
// Estirado horizontal de la capa difuminada: lleva fuera de la pantalla los
// laterales, donde el desenfoque mezcla con transparente y oscurecía los
// bordes. Solo en horizontal, así las filas siguen alineadas con el póster.
const MOBILE_COVER_EXTEND_SCALE_X = 1.12
// VELO bajo la portada: la prolongación conserva el color del borde, y en
// pósters claros (arena, cielo) los botones de cristal y su texto blanco se
// quedaban sin contraste. Este velo oscurece de forma progresiva la zona de
// los botones, como el fundido a oscuro de la portada de la ficha. Empieza
// transparente por encima del borde, así que no marca ninguna línea.
const MOBILE_COVER_SHADE_LEAD_PX = 48
const MOBILE_COVER_SHADE = `linear-gradient(to bottom,
    rgba(10, 10, 10, 0) 0px,
    rgba(10, 10, 10, 0.08) ${MOBILE_COVER_SHADE_LEAD_PX * 0.5}px,
    rgba(10, 10, 10, 0.24) ${MOBILE_COVER_SHADE_LEAD_PX}px,
    rgba(10, 10, 10, 0.5) ${MOBILE_COVER_SHADE_LEAD_PX + 60}px,
    rgba(10, 10, 10, 0.72) ${MOBILE_COVER_SHADE_LEAD_PX + 130}px,
    rgba(10, 10, 10, 0.86) 100%)`

export function MobileHeroCover({ src, lowSrc, imgRef, onLoad, onError, failed, collage, ready, animate }) {
    const highRef = useRef(null)
    const [highSrc, setHighSrc] = useState(null)
    const firstSrc = lowSrc || src
    const hasImage = Boolean(firstSrc) && !failed
    const hasHigh = hasImage && Boolean(src && src !== firstSrc)
    const highReady = hasHigh && highSrc === src

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

    const mask = hasImage ? undefined : 'var(--sv-poster-fade)'

    return (
        // Relevo con el scroll: la portada se desvanece mientras aparece el
        // fondo de la página (`.sv-hero-scroll-in`), con el mismo recorrido.
        // En un envoltorio propio porque la entrada de dentro
        // (`sv-mobile-poster-reveal`, relleno `both`) fija su opacidad a 1 al
        // terminar y anulaba cualquier fundido puesto en la misma capa. Donde
        // no hay animaciones ligadas al scroll, la opacidad sale de
        // `--sv-hero-scroll` (respaldo del layout).
        <div
            aria-hidden="true"
            className="sv-hero-scroll-out absolute inset-x-0 sm:hidden max-sm:[opacity:calc(1_-_var(--sv-hero-scroll,0))]"
            style={{ top: 'var(--mobile-cover-top, 0px)' }}
        >
        <div
            className={`sv-mobile-poster-entry absolute inset-x-0 top-0 ${
                ready ? (animate ? 'sv-mobile-poster-reveal' : '') : 'opacity-0'
            }`}
            // Sobrebarrido escalando DESDE ARRIBA: el borde superior se queda
            // en su sitio y no se pierde la franja de arriba del póster (en la
            // temporada, bajo el navbar, se cortaba el título).
            style={{ transform: `scale(${MOBILE_POSTER_OVERSCAN})`, transformOrigin: 'top center' }}
        >
            <div
                className="relative overflow-hidden"
                style={{ height: 'var(--mobile-cover-h)', WebkitMaskImage: mask, maskImage: mask }}
            >
                {hasImage ? (
                    <>
                        {/* Portada decorativa: <img> directo para controlar
                            `load`/`decode` de cada capa, como RevealPoster. En
                            pantallas bajas el recorte es vertical y se saca de
                            arriba (`object-bottom`), no del título. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            ref={imgRef}
                            src={firstSrc}
                            alt=""
                            onLoad={onLoad}
                            onError={onError}
                            fetchPriority="high"
                            decoding="async"
                            className="absolute inset-0 h-full w-full object-cover object-bottom"
                        />
                        {hasHigh ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                ref={highRef}
                                src={src}
                                alt=""
                                onLoad={markHigh}
                                decoding="async"
                                className={`absolute inset-0 h-full w-full object-cover object-bottom transition-opacity duration-500 motion-reduce:transition-none ${
                                    highReady ? 'opacity-100' : 'opacity-0'
                                }`}
                            />
                        ) : null}
                    </>
                ) : (
                    <div className="absolute inset-0 bg-neutral-950">{collage}</div>
                )}
            </div>

            {/* Prolongación del borde inferior (ver arriba): el póster y su
                última fila estirada, en una sola capa difuminada para que el
                desenfoque no deje costura entre los dos. La franja de 2 px
                muestra la última fila con el mismo encaje que el `<img>`
                (ancho completo, alineada abajo) y se estira en vertical. */}
            {hasImage ? (
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 blur-[12px]"
                    style={{
                        height: `calc(var(--mobile-cover-h) + ${MOBILE_COVER_EXTEND_PX}px)`,
                        WebkitMaskImage: MOBILE_COVER_EXTEND_MASK,
                        maskImage: MOBILE_COVER_EXTEND_MASK,
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={firstSrc}
                        alt=""
                        decoding="async"
                        className="absolute inset-x-0 top-0 w-full object-cover object-bottom"
                        style={{
                            height: 'var(--mobile-cover-h)',
                            transform: `scaleX(${MOBILE_COVER_EXTEND_SCALE_X})`,
                        }}
                    />
                    <div
                        className="absolute inset-x-0 h-[2px] origin-top bg-no-repeat"
                        style={{
                            // 1px por encima del borde: sin hueco entre ambas.
                            top: 'calc(var(--mobile-cover-h) - 1px)',
                            backgroundImage: `url(${firstSrc})`,
                            backgroundSize: '100% auto',
                            backgroundPosition: 'center bottom',
                            transform: `scale(${MOBILE_COVER_EXTEND_SCALE_X}, ${(MOBILE_COVER_EXTEND_PX + 1) / 2})`,
                        }}
                    />
                </div>
            ) : null}
            {hasImage ? (
                <div
                    className="pointer-events-none absolute inset-x-0"
                    style={{
                        top: `calc(var(--mobile-cover-h) - ${MOBILE_COVER_SHADE_LEAD_PX}px)`,
                        height: MOBILE_COVER_EXTEND_PX + MOBILE_COVER_SHADE_LEAD_PX,
                        backgroundImage: MOBILE_COVER_SHADE,
                    }}
                />
            ) : null}
        </div>
        </div>
    )
}
