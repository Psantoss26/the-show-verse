'use client'

// CABECERA MÓVIL INMERSIVA (<640) compartida por las páginas de detalle que no
// son la ficha principal: listas y colecciones (UnifiedListDetailsLayout) y
// temporadas (SeasonDetailsClient). Reproduce la composición de DetailsClient:
//   - portada FIJA pegada arriba, como mucho 2:3 a todo el ancho (sin recorte
//     lateral), con su borde inferior prolongado y difuminado;
//   - fila de acciones justo debajo, con la cascada de entrada de la ficha;
//   - marcador visible bajo los botones si cabe sobre el navbar inferior (la
//     portada le deja sitio); si no, se revela con el scroll;
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
//
// Las clases de revelado son copia de las de DetailsClient (allí son
// constantes locales que sus tests leen del propio fichero); si cambian allí,
// hay que cambiarlas aquí.

import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react'

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

/**
 * Estado y medidas de la cabecera inmersiva. `enabled`: la página la usa (en
 * teléfono; desde `sm` nada de esto aplica).
 */
export function useMobileDetailsHero(enabled) {
    const rootRef = useRef(null)
    const coverSpacerRef = useRef(null)
    const actionRowRef = useRef(null)
    const scoreboardRef = useRef(null)
    const secondaryTriggerRef = useRef(null)
    const heroScrollEndRef = useRef(0)
    const [isPhone, setIsPhone] = useState(false)
    const [actionRowHeight, setActionRowHeight] = useState(60)
    const [coverTop, setCoverTop] = useState(0)
    const [scoreboardHeight, setScoreboardHeight] = useState(120)
    // ¿Cabe el marcador sobre el navbar inferior sin hacer scroll? En pantallas
    // muy bajas la portada no cede más y el marcador se revela con el scroll,
    // como en DetailsClient.
    const [scoreboardFits, setScoreboardFits] = useState(true)
    const [secondaryVisible, setSecondaryVisible] = useState(false)

    useClientLayoutEffect(() => {
        const media = window.matchMedia(PHONE_QUERY)
        const update = () => setIsPhone(media.matches)
        update()
        media.addEventListener('change', update)
        return () => media.removeEventListener('change', update)
    }, [])

    // Alto de la portada = pantalla menos la fila de acciones (MEDIDA) y la
    // navegación inferior, como en la ficha: en la primera vista solo se ven
    // portada y botones, justo encima del navbar inferior. También se mide el
    // marcador, que va visible debajo de los botones: la portada le deja su
    // sitio para que no quede tapado por el navbar inferior.
    useClientLayoutEffect(() => {
        const row = actionRowRef.current
        const scoreboard = scoreboardRef.current
        if (!enabled || !row) return undefined
        const update = () => {
            const nextRow = Math.max(1, Math.ceil(row.getBoundingClientRect().height || 60))
            setActionRowHeight((current) => (current === nextRow ? current : nextRow))
            // Posición del hueco en el documento (no en pantalla), así no
            // depende del scroll.
            const spacer = coverSpacerRef.current
            const nextTop = spacer ? Math.max(0, Math.round(spacer.getBoundingClientRect().top + window.scrollY)) : 0
            setCoverTop((current) => (current === nextTop ? current : nextTop))
            if (!scoreboard) return
            const nextScoreboard = Math.ceil(scoreboard.getBoundingClientRect().height)
            setScoreboardHeight((current) => (current === nextScoreboard ? current : nextScoreboard))
            // Misma cuenta que `--mobile-cover-h`: cabe si, dejándole su sitio,
            // a la portada aún le quedan los 125vw mínimos.
            const available = window.innerHeight - 96 - nextRow - nextTop
            const fits = available - (nextScoreboard + MOBILE_SCOREBOARD_GAP_PX) >= window.innerWidth * 1.25
            setScoreboardFits((current) => (current === fits ? current : fits))
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

    // Alto que deja la pantalla a la portada con los botones justo encima del
    // navbar inferior (la fórmula de DetailsClient).
    const available = `(100svh - 6rem - ${actionRowHeight}px - ${coverTop}px - env(safe-area-inset-bottom))`
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
        scoreboardFits,
        revealProps: enabled
            ? {
                [MOBILE_REVEAL_ATTR]: secondaryVisible ? 'shown' : 'hidden',
                inert: secondaryHidden,
            }
            : {},
        // Alto de la portada:
        //  - Como mucho 2:3 a todo el ancho (150vw): entra entera de lado a
        //    lado, sin el recorte lateral de `cover` en una caja más alta que
        //    el póster.
        //  - Deja sitio a botones Y marcador (con su separación) sobre el
        //    navbar inferior; si no cabe, se recorta por arriba.
        //  - Pero nunca menos de 125vw: si así no cabe, el marcador se revela
        //    con el scroll, como en la ficha, y la portada recupera todo el
        //    alto que deja a los botones visibles (sin pasar de 2:3).
        //  - Y nunca más del alto que deja a los botones visibles.
        rootStyle: enabled
            ? {
                '--mobile-cover-top': `${coverTop}px`,
                '--mobile-cover-h': scoreboardFits
                    ? `min(150vw, ${available}, max(calc(${available} - ${scoreboardHeight + MOBILE_SCOREBOARD_GAP_PX}px), 125vw))`
                    : `min(150vw, ${available})`,
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
