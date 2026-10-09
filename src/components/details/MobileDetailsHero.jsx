'use client'

// CABECERA MÓVIL INMERSIVA (<640) compartida por las páginas de detalle que no
// son la ficha principal: listas y colecciones (UnifiedListDetailsLayout) y
// temporadas (SeasonDetailsClient). Reproduce la composición de DetailsClient:
//   - portada FIJA pegada arriba: el póster ENTERO, a todo el ancho y en 2:3
//     (150vw). NUNCA se recorta para que quepa otra cosa; con su borde
//     inferior prolongado y difuminado;
//   - fila de acciones justo debajo, con la cascada de entrada de la ficha;
//   - debajo, en el sitio que queda hasta el navbar inferior
//     (`scoreboardMode`): el marcador completo ('full') si cabe y, si no, solo
//     sus puntuaciones con la barra de stats revelada al hacer scroll
//     ('compact'). Siempre hay marcador: nunca quedan los botones solos;
//   - los botones van SIEMPRE justo debajo de la portada, sin hueco entre
//     ambos: el sitio que sobre queda bajo el marcador;
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
// lo que se revela con el scroll, que lleva `revealProps` + MOBILE_REVEAL_BASE
// (cada bloque aparece al pasar SU borde superior el navbar inferior).
// En modo 'compact' el envoltorio del marcador lleva MOBILE_STATS_REVEAL_BASE +
// `statsRevealProps`: su fila de estadísticas (la marca `data-scoreboard-stats`
// de DetailsStatsRow, que aquí se mide) queda oculta hasta hacer scroll. El
// hueco de la portada mide `var(--mobile-cover-h)`.
//
// Las clases de revelado son copia de las de DetailsClient (allí son
// constantes locales que sus tests leen del propio fichero); si cambian allí,
// hay que cambiarlas aquí.

import { createContext, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

// Modo 'compact': la barra de stats del marcador se oculta hasta el scroll
// (con el mismo disparador que lo secundario). No con `display: none`: se
// pliega y despliega su alto (rejilla 1fr ↔ 0fr, como MobileFiltersPanel) para
// que el marcador crezca con suavidad. Sin `opacity`: anularía el cristal
// (backdrop root). La pista es `minmax(0, …fr)` para que plegada mida 0 aunque
// el scroller de dentro tenga relleno: lo que sobresale lo recorta la propia
// fila (`overflow-hidden`).
const MOBILE_STATS_REVEAL_ATTR = 'data-mobile-reveal-stats'
export const MOBILE_STATS_REVEAL_BASE = [
    'max-sm:[&_[data-scoreboard-stats]]:grid max-sm:[&_[data-scoreboard-stats]]:grid-rows-[minmax(0,1fr)]',
    'max-sm:[&_[data-scoreboard-stats]]:overflow-hidden max-sm:[&_[data-scoreboard-stats]>*]:min-h-0',
    // El scroller es `overflow-x-auto`, que hace `auto` también el eje
    // vertical: a medio plegar/desplegar es más bajo que su contenido y
    // pintaba una barra de scroll vertical. Solo se desplaza en horizontal.
    'max-sm:[&_[data-scoreboard-stats]>*]:overflow-y-hidden max-sm:[&_[data-scoreboard-stats]>*]:[scrollbar-width:none]',
    'max-sm:[&_[data-scoreboard-stats]]:transition-[grid-template-rows,border-color]',
    'max-sm:[&_[data-scoreboard-stats]]:duration-[420ms] max-sm:[&_[data-scoreboard-stats]]:ease-[cubic-bezier(0.22,1,0.36,1)]',
    'max-sm:motion-reduce:[&_[data-scoreboard-stats]]:transition-none',
    'max-sm:[&[data-mobile-reveal-stats=hidden]_[data-scoreboard-stats]]:grid-rows-[minmax(0,0fr)]',
    'max-sm:[&[data-mobile-reveal-stats=hidden]_[data-scoreboard-stats]]:border-transparent',
].join(' ')
// Lo que aún le falta por crecer a la barra de stats del modo compacto
// mientras se despliega (su contenido menos lo que ya enseña): lo que va
// debajo bajará eso.
const MOBILE_STATS_PENDING_SLACK_PX = 2
function readStatsPendingGrowth(target) {
    let pending = 0
    for (const row of target.querySelectorAll('[data-scoreboard-stats]')) {
        for (const child of row.children) {
            pending = Math.max(pending, child.scrollHeight - child.clientHeight)
        }
    }
    return pending
}
// Envoltorio del marcador ESTRECHO (listas y colecciones, `--mobile-actions-w`)
// en modo 'compact': al desplegarse la barra de stats crece también a los
// lados hasta todo el ancho, a la vez y con la misma curva. La transición solo
// existe desde la primera apertura (`data-mobile-stats-animated`, lo pone el
// revelado): antes animaba también el ancho inicial al publicarse
// `--mobile-actions-w` y el marcador entraba encogiendo. Duración y curva van
// en la misma variante: un `transition-duration` suelto anima TODO
// (`transition-property` vale `all` por defecto).
const MOBILE_STATS_ANIMATED_ATTR = 'data-mobile-stats-animated'
export const MOBILE_STATS_REVEAL_WIDEN =
    'max-sm:data-[mobile-reveal-stats=shown]:w-full max-sm:motion-safe:data-[mobile-stats-animated]:transition-[width] max-sm:motion-safe:data-[mobile-stats-animated]:duration-[420ms] max-sm:motion-safe:data-[mobile-stats-animated]:ease-[cubic-bezier(0.22,1,0.36,1)]'
export const MOBILE_REVEAL_BASE =
    'max-sm:transform-gpu max-sm:data-[mobile-reveal=hidden]:invisible max-sm:data-[mobile-reveal=hidden]:pointer-events-none max-sm:data-[mobile-reveal=hidden]:**:!transition-none'
const MOBILE_REVEAL_ATTR = 'data-mobile-reveal'
// Bloques revelados que ENTRAN y SALEN animados como el marcador (la barra de
// búsqueda de las listas), además de MOBILE_REVEAL_BASE. Llevan
// `data-mobile-reveal-animated` y la animación va en sus piezas de cristal
// (`data-mobile-reveal-piece`), NUNCA en el bloque: la `opacity` en un
// ancestro deja el cristal plano.
//   - Al revelarse ('shown'): la entrada del marcador, más corta (sube 20px y
//     se funde en 320ms, `sv-mobile-reveal-in`): con la del marcador (40px,
//     600ms) la barra tardaba en verse al deslizar.
//   - Al ocultarse tras haberse visto ('out', lo pone el revelado en vez de
//     'hidden'): la inversa en 420ms, lo que tarda en plegarse la barra de
//     stats, y el bloque pasa a `invisible` al acabar (visibilidad con
//     retardo). Mientras, sin `pointer-events` y sin transiciones dentro.
const MOBILE_REVEAL_ANIMATED_ATTR = 'data-mobile-reveal-animated'
export const MOBILE_REVEAL_ANIMATED_PROPS = { [MOBILE_REVEAL_ANIMATED_ATTR]: '' }
export const MOBILE_REVEAL_PIECE_PROPS = { 'data-mobile-reveal-piece': '' }
export const MOBILE_REVEAL_ANIMATED = [
    'max-sm:motion-safe:[&[data-mobile-reveal=shown]_[data-mobile-reveal-piece]]:animate-sv-mobile-reveal-in',
    'max-sm:motion-safe:[&[data-mobile-reveal=out]_[data-mobile-reveal-piece]]:animate-sv-mobile-reveal-out',
    'max-sm:data-[mobile-reveal=out]:invisible max-sm:data-[mobile-reveal=out]:pointer-events-none max-sm:data-[mobile-reveal=out]:**:!transition-none',
    'max-sm:motion-safe:data-[mobile-reveal=out]:![transition:visibility_0s_linear_420ms]',
    'max-sm:motion-reduce:data-[mobile-reveal=out]:!transition-none',
].join(' ')
// `revealProps` de la cabecera para bloques que pinta un hijo de la página
// (la barra de búsqueda de FilterableListItems); null fuera de ella.
export const MobileHeroRevealContext = createContext(null)
const MOBILE_REVEAL_SHOW_AT_PX = 16
// Alto de la navegación inferior flotante que tapa el borde de la pantalla.
const MOBILE_BOTTOM_NAV_PX = 88
// Hueco mínimo encima y debajo del marcador (botones → marcador → navbar
// inferior). Con más sitio, el sobrante se reparte A PARTES IGUALES entre los
// dos huecos (`--mobile-scoreboard-shift`).
const MOBILE_SCOREBOARD_MIN_GAP_PX = 16
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

// Borde superior de la navegación inferior flotante, en la ventana (incluye su
// margen y la zona segura de la barra de gestos). Sin ella en el DOM, la
// reserva de la ficha (6rem).
const MOBILE_BOTTOM_NAV_SELECTOR = '.sv-navbar-bottom-shift'
// Ancho de lo que se ve en la fila de acciones: de su primer botón al último
// (la fila ocupa todo el ancho, pero los botones tienen un tope y se centran).
function readActionsSpan(row) {
    let flex = row
    while (flex && flex.children.length === 1) flex = flex.firstElementChild
    const rects = [...(flex?.children || [])]
        .map((child) => child.getBoundingClientRect())
        .filter((rect) => rect.width > 0)
    if (!rects.length) return 0
    return Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left))
}

// Rectángulo vertical del elemento en su sitio, sin su propio `transform`: la
// fila de botones entra subiendo (`sv-mobile-actions-rise`, 20px → 0) y una
// medida tomada a medio camino (llegan las puntuaciones o el botón de «me
// gusta» durante la entrada) descentraba el marcador hasta el siguiente cambio.
function readUntransformedRect(el) {
    const rect = el.getBoundingClientRect()
    const transform = getComputedStyle(el).transform
    if (!transform || transform === 'none' || typeof DOMMatrixReadOnly === 'undefined') return rect
    const dy = new DOMMatrixReadOnly(transform).m42
    return { top: rect.top - dy, bottom: rect.bottom - dy, height: rect.height }
}

function readBottomNavTop() {
    const nav = document.querySelector(MOBILE_BOTTOM_NAV_SELECTOR)
    // `offsetTop` (fijo: respecto a la ventana) y no el rectángulo: el navbar
    // se esconde con un `transform` al hacer scroll y eso no debe contar.
    const top = nav?.offsetTop
    if (!Number.isFinite(top) || top <= 0) return window.innerHeight - 96
    return top
}

/**
 * Estado y medidas de la cabecera inmersiva. `enabled`: la página la usa (en
 * teléfono; desde `sm` nada de esto aplica). `lock`: la portada ya se ve; desde
 * entonces el alto de la ventana deja de contar (la barra de direcciones lo
 * cambia al hacer scroll) salvo que cambie también el ancho. Los cambios de
 * alto del marcador o de la fila de botones (datos que llegan) se recolocan
 * siempre.
 */
export function useMobileDetailsHero(enabled, { lock = false } = {}) {
    const rootRef = useRef(null)
    const coverSpacerRef = useRef(null)
    const actionRowRef = useRef(null)
    const scoreboardRef = useRef(null)
    const secondaryTriggerRef = useRef(null)
    const heroScrollEndRef = useRef(0)
    const lockRef = useRef(lock)
    // Borde superior del navbar inferior con el que se hizo la última medida
    // (ver `lock`).
    const navTopRef = useRef(null)
    // Alto de la fila de estadísticas del marcador, recordado de cuando se
    // pintó completo (en modo 'compact' no está en el DOM).
    const statsRowHeightRef = useRef(0)
    const [isPhone, setIsPhone] = useState(false)
    const [coverTop, setCoverTop] = useState(0)
    // Qué cabe bajo los botones sin tocar la portada (ver arriba). Arranca en
    // 'full' para pintar y medir el marcador completo; todo esto ocurre antes
    // de que se vean portada y marcador (esperan a que cargue la imagen).
    const [scoreboardMode, setScoreboardMode] = useState('full')
    // Margen extra encima del marcador para que quede centrado entre los
    // botones y el navbar inferior (puede ser negativo: ver abajo).
    const [scoreboardShift, setScoreboardShift] = useState(0)
    // Ancho de referencia para un marcador estrecho (`--mobile-actions-w`): el
    // mayor entre lo que ocupan los botones y el navbar inferior.
    const [actionsWidth, setActionsWidth] = useState(0)
    const [statsVisible, setStatsVisible] = useState(false)

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
    // decide si va el marcador completo o solo sus puntuaciones (en pantallas
    // muy bajas, aunque no quepa entero: queda a un scroll). El marcador se
    // CENTRA en ese hueco: el mismo margen de los botones a él que de él al
    // navbar. La página pone `margin-top: var(--mobile-scoreboard-shift)` en
    // su envoltorio; lo que ya hay entre botones y marcador sin ese margen
    // (su `mb-4` y el `-top-2` de la fila) se mide y se descuenta.
    useClientLayoutEffect(() => {
        const row = actionRowRef.current
        const scoreboard = scoreboardRef.current
        if (!enabled || !row) return undefined
        let lastWidth = window.innerWidth
        const update = () => {
            // El ancho no mueve nada en vertical: se mide siempre, también
            // con la portada ya visible (p. ej. si cambia el número de botones).
            const nav = document.querySelector(MOBILE_BOTTOM_NAV_SELECTOR)
            const span = Math.round(Math.max(readActionsSpan(row), nav?.offsetWidth || 0))
            setActionsWidth((current) => (current === span ? current : span))
            const widthChanged = window.innerWidth !== lastWidth
            lastWidth = window.innerWidth
            // Posición del hueco en el documento (no en pantalla), así no
            // depende del scroll.
            const spacer = coverSpacerRef.current
            const top = spacer ? Math.max(0, Math.round(spacer.getBoundingClientRect().top + window.scrollY)) : 0
            setCoverTop((current) => (current === top ? current : top))
            if (!scoreboard) return
            const rowRect = readUntransformedRect(row)
            const scoreboardRect = readUntransformedRect(scoreboard)
            // Sin redondear: con `ceil`/`floor` el hueco de arriba salía ~2px
            // más corto que el de abajo.
            const total = scoreboardRect.height
            const statsRow = scoreboard.querySelector('[data-scoreboard-stats]')
            const statsHeight = statsRow ? statsRow.getBoundingClientRect().height : 0
            // Su alto completo solo se recuerda en modo 'full' (sin el
            // atributo de revelado): en 'compact' la fila está plegada o a
            // medio desplegar.
            if (statsHeight && !scoreboard.hasAttribute(MOBILE_STATS_REVEAL_ATTR)) {
                statsRowHeightRef.current = statsHeight
            }
            const compactHeight = total - statsHeight
            const fullHeight = compactHeight + statsRowHeightRef.current
            // Sitio entre el pie de los botones (con el desplazamiento
            // `-top-2` de su fila) y el navbar, tal como se ve sin scroll.
            const rowBottom = rowRect.bottom + window.scrollY
            // Con la portada ya visible (`lock`), el navbar se toma de la
            // medida anterior: la barra de direcciones cambia el alto de la
            // ventana al hacer scroll y el marcador no debe moverse por eso.
            // Lo demás (alto del marcador, botones) se mide SIEMPRE: con la
            // portada en caché `lock` llega desde el primer render, antes que
            // las puntuaciones, y congelar esa primera medida dejaba el
            // marcador descentrado o en 'full' bajo el navbar inferior.
            if (navTopRef.current == null || !lockRef.current || widthChanged) {
                navTopRef.current = readBottomNavTop()
            }
            const space = navTopRef.current - rowBottom
            const mode = space - fullHeight >= MOBILE_SCOREBOARD_MIN_GAP_PX * 2 ? 'full' : 'compact'
            setScoreboardMode((current) => (current === mode ? current : mode))
            // Hueco igual arriba y abajo; si ni así cabe (pantallas muy
            // bajas), el mínimo arriba y el marcador queda a un scroll.
            const visibleHeight = mode === 'full' ? fullHeight : compactHeight
            const gap = Math.max(MOBILE_SCOREBOARD_MIN_GAP_PX, (space - visibleHeight) / 2)
            const appliedShift = Number.parseFloat(getComputedStyle(scoreboard).marginTop) || 0
            const baseGap = scoreboardRect.top - rowRect.bottom - appliedShift
            const shift = Math.round((gap - baseGap) * 2) / 2
            setScoreboardShift((current) => (current === shift ? current : shift))
        }
        update()
        window.addEventListener('resize', update, { passive: true })
        if (typeof ResizeObserver === 'undefined') {
            return () => window.removeEventListener('resize', update)
        }
        const observer = new ResizeObserver(update)
        observer.observe(row)
        if (scoreboard) observer.observe(scoreboard)
        // Botones que aparecen o desaparecen no cambian el tamaño de la fila.
        const mutations = new MutationObserver(update)
        mutations.observe(row, { childList: true, subtree: true })
        return () => {
            window.removeEventListener('resize', update)
            observer.disconnect()
            mutations.disconnect()
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

    // Revelado con el scroll, en DOS PASOS, y todo FIJO una vez revelado hasta
    // volver a la posición inicial (arriba del todo):
    //   1. La barra de stats del modo compacto, cuando el centinela (bajo el
    //      marcador) cruza el navbar inferior. Volver a mirar el centinela para
    //      ocultarla hacía parpadear el marcador: al desplegarse, el centinela
    //      baja ese alto, vuelve a quedar bajo el navbar, se oculta, sube…
    //   2. Cada bloque secundario (sinopsis, píldoras, barra de búsqueda de la
    //      lista…) por SEPARADO, cuando SU borde superior pasa el navbar
    //      inferior: nunca se ve uno asomando detrás del navbar. Mientras el
    //      marcador se despliega, cuenta dónde QUEDARÁ el bloque: al abrirse
    //      empuja hacia abajo lo que va debajo, y un bloque revelado a la vez
    //      que él acababa otra vez detrás del navbar. Antes se esperaba a que
    //      terminara (~460ms) y la barra de búsqueda tardaba en salir.
    // Los atributos se escriben en el DOM en el mismo evento de scroll. Los de
    // los bloques los lleva solo el DOM (React los pinta ocultos y no vuelve a
    // tocarlos: `revealProps` no cambia); el de la barra de stats también va en
    // el estado de React, que se pone al día después (mismos valores).
    useEffect(() => {
        const trigger = secondaryTriggerRef.current
        const container = rootRef.current
        if (!enabled || !isPhone || !trigger || !container) {
            setStatsVisible(false)
            return undefined
        }
        let statsApplied = null
        let raf = 0
        const sync = () => {
            const atTop = window.scrollY <= MOBILE_REVEAL_SHOW_AT_PX
            const statsVisible =
                !atTop &&
                (statsApplied === true ||
                    trigger.getBoundingClientRect().top <= window.innerHeight - MOBILE_BOTTOM_NAV_PX)
            const statsTargets = container.querySelectorAll(`[${MOBILE_STATS_REVEAL_ATTR}]`)
            if (statsVisible !== statsApplied) {
                statsApplied = statsVisible
                // Solo se muestra/oculta: el marcador sigue siendo interactivo.
                statsTargets.forEach((el) => {
                    if (statsVisible) el.setAttribute(MOBILE_STATS_ANIMATED_ATTR, '')
                    el.setAttribute(MOBILE_STATS_REVEAL_ATTR, statsVisible ? 'shown' : 'hidden')
                })
                startTransition(() => {
                    setStatsVisible((current) => (current === statsVisible ? current : statsVisible))
                })
            }
            let revealLine = null
            let statsPending = null
            container.querySelectorAll(`[${MOBILE_REVEAL_ATTR}]`).forEach((el) => {
                let visible = false
                if (!atTop) {
                    if (el.getAttribute(MOBILE_REVEAL_ATTR) === 'shown') visible = true
                    else {
                        revealLine ??= readBottomNavTop()
                        // Lo que el marcador aún va a empujar hacia abajo (y
                        // 2px de margen: los altos de la fila no son enteros).
                        if (statsPending == null) {
                            const growth = statsVisible
                                ? Math.max(0, ...[...statsTargets].map(readStatsPendingGrowth))
                                : 0
                            statsPending = growth > 0 ? growth + MOBILE_STATS_PENDING_SLACK_PX : 0
                        }
                        visible = el.getBoundingClientRect().top + statsPending <= revealLine
                    }
                }
                const current = el.getAttribute(MOBILE_REVEAL_ATTR)
                // Los animados que ya se vieron salen con su animación ('out').
                const value = visible
                    ? 'shown'
                    : (current === 'shown' || current === 'out') && el.hasAttribute(MOBILE_REVEAL_ANIMATED_ATTR)
                        ? 'out'
                        : 'hidden'
                if (current !== value) el.setAttribute(MOBILE_REVEAL_ATTR, value)
                if (el.inert === visible) el.inert = !visible
            })
        }
        const scheduleSync = () => {
            if (!raf) {
                raf = window.requestAnimationFrame(() => {
                    raf = 0
                    sync()
                })
            }
        }
        const observer = new IntersectionObserver(sync, {
            rootMargin: `0px 0px -${MOBILE_BOTTOM_NAV_PX}px 0px`,
            threshold: 0,
        })
        observer.observe(trigger)
        // Bloques que se montan después (la barra de búsqueda llega con los
        // títulos): nacen ocultos y se miran en el siguiente fotograma.
        const mutations = new MutationObserver(scheduleSync)
        mutations.observe(container, { childList: true, subtree: true })
        sync()
        window.addEventListener('scroll', sync, { passive: true })
        window.addEventListener('resize', sync, { passive: true })
        return () => {
            observer.disconnect()
            mutations.disconnect()
            if (raf) window.cancelAnimationFrame(raf)
            window.removeEventListener('scroll', sync)
            window.removeEventListener('resize', sync)
        }
    }, [enabled, isPhone])

    // Los bloques nacen ocultos y desde ahí manda el DOM (ver arriba); el
    // objeto no cambia para que React no reescriba lo que puso el scroll. Solo
    // `inert` en teléfono: en tablet/escritorio las variantes `max-sm:` no
    // aplican, pero `inert` sí bloquearía el foco.
    const revealProps = useMemo(
        () => (enabled ? { [MOBILE_REVEAL_ATTR]: 'hidden', inert: isPhone } : {}),
        [enabled, isPhone],
    )

    return {
        rootRef,
        coverSpacerRef,
        actionRowRef,
        scoreboardRef,
        secondaryTriggerRef,
        isPhone,
        scoreboardMode,
        revealProps,
        statsRevealProps: enabled
            ? { [MOBILE_STATS_REVEAL_ATTR]: statsVisible ? 'shown' : 'hidden' }
            : {},
        // La portada: el póster entero (2:3 a todo el ancho), siempre.
        rootStyle: enabled
            ? {
                '--mobile-cover-top': `${coverTop}px`,
                '--mobile-cover-h': '150vw',
                '--mobile-scoreboard-shift': `${scoreboardShift}px`,
                ...(actionsWidth ? { '--mobile-actions-w': `${actionsWidth}px` } : {}),
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
const buildCoverExtendMask = (extendPx) => `linear-gradient(to bottom,
    transparent calc(var(--mobile-cover-h) - ${MOBILE_COVER_BLUR_BAND_PX}px),
    rgba(0, 0, 0, 0.104) calc(var(--mobile-cover-h) - ${MOBILE_COVER_BLUR_BAND_PX * 0.8}px),
    rgba(0, 0, 0, 0.352) calc(var(--mobile-cover-h) - ${MOBILE_COVER_BLUR_BAND_PX * 0.6}px),
    rgba(0, 0, 0, 0.648) calc(var(--mobile-cover-h) - ${MOBILE_COVER_BLUR_BAND_PX * 0.4}px),
    rgba(0, 0, 0, 0.896) calc(var(--mobile-cover-h) - ${MOBILE_COVER_BLUR_BAND_PX * 0.2}px),
    #000 var(--mobile-cover-h),
    #000 calc(var(--mobile-cover-h) + 16px),
    rgba(0, 0, 0, 0.784) calc(var(--mobile-cover-h) + ${extendPx * 0.35}px),
    rgba(0, 0, 0, 0.5) calc(var(--mobile-cover-h) + ${extendPx * 0.55}px),
    rgba(0, 0, 0, 0.216) calc(var(--mobile-cover-h) + ${extendPx * 0.75}px),
    rgba(0, 0, 0, 0.058) calc(var(--mobile-cover-h) + ${extendPx * 0.9}px),
    transparent calc(var(--mobile-cover-h) + ${extendPx}px))`
const MOBILE_COVER_EXTEND_MASK = buildCoverExtendMask(MOBILE_COVER_EXTEND_PX)
// Con el fondo difuminado debajo (`blurredUnderlay`) la prolongación es más
// corta: es la última fila del póster, casi siempre oscura, y en 200px tapaba
// el color del fondo justo donde van los botones.
const MOBILE_COVER_EXTEND_SHORT_PX = 100
const MOBILE_COVER_EXTEND_SHORT_MASK = buildCoverExtendMask(MOBILE_COVER_EXTEND_SHORT_PX)
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

// REFLEJO DIFUMINADO bajo la portada (`blurredUnderlay`, la ficha): sin él, lo
// que queda bajo el póster (botones y marcador) es el fondo casi negro de la
// página. Debajo de todo va el MISMO póster, su parte central (caras, cielo:
// donde está el color; un reflejo del borde inferior repetía su franja
// oscura), muy difuminado y algo oscurecido, hasta el pie de la pantalla. La
// prolongación del borde, más corta, hace de transición entre los dos. El velo de los botones pasa a ser más suave y llega también hasta
// abajo (`MOBILE_COVER_SHADE_SOFT`): con el de siempre, que acaba al 86% a
// 200px del borde, el reflejo apenas se veía y quedaba un escalón donde acaba.
const MOBILE_COVER_UNDERLAY_MASK = `linear-gradient(to bottom,
    transparent calc(var(--mobile-cover-h) - 48px),
    #000 calc(var(--mobile-cover-h) + 8px))`
const MOBILE_COVER_SHADE_SOFT = `linear-gradient(to bottom,
    rgba(10, 10, 10, 0) 0px,
    rgba(10, 10, 10, 0.08) ${MOBILE_COVER_SHADE_LEAD_PX * 0.5}px,
    rgba(10, 10, 10, 0.2) ${MOBILE_COVER_SHADE_LEAD_PX}px,
    rgba(10, 10, 10, 0.36) ${MOBILE_COVER_SHADE_LEAD_PX + 90}px,
    rgba(10, 10, 10, 0.46) ${MOBILE_COVER_SHADE_LEAD_PX + 220}px,
    rgba(10, 10, 10, 0.52) 100%)`

export function MobileHeroCover({ src, lowSrc, imgRef, onLoad, onError, failed, collage, collageUnderlay, blurredUnderlay = false, ready, animate }) {
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
            {/* Con mosaico (listas): lo que va DETRÁS de la portada y asoma
                por su fundido inferior (la prolongación difuminada del
                mosaico, ver UnifiedListDetailsLayout). */}
            {hasImage ? null : collageUnderlay}
            {hasImage && blurredUnderlay ? (
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
                    style={{
                        height: 'calc(var(--mobile-cover-h) + 100lvh)',
                        WebkitMaskImage: MOBILE_COVER_UNDERLAY_MASK,
                        maskImage: MOBILE_COVER_UNDERLAY_MASK,
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={firstSrc}
                        alt=""
                        decoding="async"
                        className="absolute inset-x-0 w-full object-cover object-center"
                        style={{
                            top: 'calc(var(--mobile-cover-h) - 48px)',
                            height: 'calc(100lvh - var(--mobile-cover-h) + 96px)',
                            // Estirado a lo ancho para que el desenfoque no
                            // oscurezca los laterales.
                            transform: `scaleX(${MOBILE_COVER_EXTEND_SCALE_X})`,
                            filter: 'blur(32px) brightness(0.7) saturate(1.15)',
                        }}
                    />
                </div>
            ) : null}
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
                        WebkitMaskImage: blurredUnderlay ? MOBILE_COVER_EXTEND_SHORT_MASK : MOBILE_COVER_EXTEND_MASK,
                        maskImage: blurredUnderlay ? MOBILE_COVER_EXTEND_SHORT_MASK : MOBILE_COVER_EXTEND_MASK,
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
                        // Con el reflejo, hasta el pie de la pantalla.
                        height: blurredUnderlay
                            ? `calc(100lvh + ${MOBILE_COVER_SHADE_LEAD_PX}px)`
                            : MOBILE_COVER_EXTEND_PX + MOBILE_COVER_SHADE_LEAD_PX,
                        backgroundImage: blurredUnderlay ? MOBILE_COVER_SHADE_SOFT : MOBILE_COVER_SHADE,
                    }}
                />
            ) : null}
        </div>
        </div>
    )
}
