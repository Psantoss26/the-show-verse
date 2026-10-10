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

import { createContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

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
    // Animate only the content, preserving the panel's glass backdrop.
    'max-sm:[&_[data-scoreboard-stats]>*>*]:transition-[opacity,translate] max-sm:[&_[data-scoreboard-stats]>*>*]:duration-[420ms] max-sm:[&_[data-scoreboard-stats]>*>*]:ease-[cubic-bezier(0.22,1,0.36,1)]',
    'max-sm:[&[data-mobile-reveal-stats=hidden]_[data-scoreboard-stats]>*>*]:opacity-0 max-sm:[&[data-mobile-reveal-stats=hidden]_[data-scoreboard-stats]>*>*]:-translate-y-1.5',
    'max-sm:motion-reduce:[&_[data-scoreboard-stats]>*>*]:transition-none max-sm:motion-reduce:[&_[data-scoreboard-stats]>*>*]:translate-none',
    'max-sm:[&[data-mobile-reveal-stats=hidden]_[data-scoreboard-stats]]:grid-rows-[minmax(0,0fr)]',
    'max-sm:[&[data-mobile-reveal-stats=hidden]_[data-scoreboard-stats]]:border-transparent',
].join(' ')
// La MISMA barra plegable, sin `max-sm:`, para la ficha de teléfono del drawer
// (DetailModal en vista "mobile"): allí el viewport es el de un escritorio o
// una tablet y las variantes de teléfono no aplican. Lo que va DETRÁS del
// marcador en esa ficha (`data-panel-reveal`, la fila de píldoras) tampoco se
// ve mientras la barra está plegada: en la ficha móvil lo tapa el navbar
// inferior, y el drawer no tiene ninguno (ver `usePanelHeroFit`).
export const PANEL_STATS_REVEAL_ATTR = 'data-mobile-reveal-stats'
export const PANEL_STATS_REVEAL_BASE = [
    '[&_[data-scoreboard-stats]]:grid [&_[data-scoreboard-stats]]:grid-rows-[minmax(0,1fr)]',
    '[&_[data-scoreboard-stats]]:overflow-hidden [&_[data-scoreboard-stats]>*]:min-h-0',
    '[&_[data-scoreboard-stats]>*]:overflow-y-hidden [&_[data-scoreboard-stats]>*]:[scrollbar-width:none]',
    '[&_[data-scoreboard-stats]]:transition-[grid-template-rows,border-color]',
    '[&_[data-scoreboard-stats]]:duration-[420ms] [&_[data-scoreboard-stats]]:ease-[cubic-bezier(0.22,1,0.36,1)]',
    'motion-reduce:[&_[data-scoreboard-stats]]:transition-none',
    '[&[data-mobile-reveal-stats=hidden]_[data-scoreboard-stats]]:grid-rows-[minmax(0,0fr)]',
    '[&[data-mobile-reveal-stats=hidden]_[data-scoreboard-stats]]:border-transparent',
    '[&[data-mobile-reveal-stats=hidden]_[data-panel-reveal]]:invisible',
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
    // Cajas de maquetación (`offset*`), no rectángulos: estos incluyen los
    // `transform` de los botones (`active:scale-95`, hover, su entrada) y un
    // dedo que pasaba por la fila al deslizar cambiaba el ancho 2px, con un
    // render de la página entera a mitad de la apertura de la barra de stats.
    const boxes = [...(flex?.children || [])]
        .filter((child) => child.offsetWidth > 0)
        .map((child) => ({ left: child.offsetLeft, right: child.offsetLeft + child.offsetWidth }))
    if (!boxes.length) return 0
    return Math.max(...boxes.map((box) => box.right)) - Math.min(...boxes.map((box) => box.left))
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

// Alto interior (sin bordes) con decimales: `clientHeight` va redondeado.
function readInnerHeight(el) {
    if (!el) return 0
    const style = getComputedStyle(el)
    const borders = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0)
    return Math.max(0, el.getBoundingClientRect().height - borders)
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
 *
 * `fitCover` (la ficha): en vez de fijar la portada en 150vw y ver qué cabe
 * debajo, se fija lo de debajo y la portada ocupa el resto. Desde el navbar
 * inferior hacia arriba, con el MISMO margen (`fitGap`) entre cada pieza: el
 * marcador SIEMPRE compacto, la fila de botones y el pie de la portada (donde
 * la página pone el logo). Así esas piezas quedan en la misma posición en
 * cualquier móvil: en los altos la portada crece y se recorta por los lados;
 * en los bajos, se recorta por arriba (`object-bottom`).
 */
export function useMobileDetailsHero(enabled, { lock = false, fitCover = false, fitGap = 20 } = {}) {
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
    const [scoreboardMode, setScoreboardMode] = useState(fitCover ? 'compact' : 'full')
    // Alto de la portada con `fitCover` (px); null hasta la primera medida.
    const [fittedCoverHeight, setFittedCoverHeight] = useState(null)
    // Margen extra encima del marcador para que quede centrado entre los
    // botones y el navbar inferior (puede ser negativo: ver abajo).
    const [scoreboardShift, setScoreboardShift] = useState(0)
    // Ancho de referencia para un marcador estrecho (`--mobile-actions-w`): el
    // mayor entre lo que ocupan los botones y el navbar inferior.
    const [actionsWidth, setActionsWidth] = useState(0)

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
    //
    // SOLO TELÉFONO: lo que se mide aquí solo lo leen variantes `max-sm:` y
    // capas `sm:hidden`. En escritorio el morph póster ↔ backdrop de la ficha
    // cambia el ancho de la columna en cada fotograma; con el observador
    // activo, cada uno movía `coverTop` y volvía a renderizar la ficha entera,
    // y la transición avanzaba a tirones.
    useClientLayoutEffect(() => {
        const row = actionRowRef.current
        const scoreboard = scoreboardRef.current
        if (!enabled || !isPhone || !row) return undefined
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
            const appliedShift = Number.parseFloat(getComputedStyle(scoreboard).marginTop) || 0
            const baseGap = scoreboardRect.top - rowRect.bottom - appliedShift
            if (fitCover && spacer) {
                // Lo que hay del pie de la portada al pie de los botones (el
                // hueco de la columna, su `-top-2` y la barra «Viendo» si la
                // hay) no depende del alto de la portada: con él se despeja
                // el alto que deja `fitGap` entre botones, marcador y navbar.
                const spacerRect = readUntransformedRect(spacer)
                const belowCover = rowRect.bottom - spacerRect.bottom
                // Alto visible del marcador compacto: sin el interior de la
                // barra de stats (sin bordes: su borde superior sigue ahí
                // plegada y antes faltaba ese píxel abajo). Con decimales,
                // como `total`: `clientHeight` va redondeado y, mientras la
                // barra se despliega, la resta bailaba unas décimas y el alto
                // de la portada saltaba 613 → 612 → 613 px, cada salto un
                // render de la página entera a mitad de la animación.
                const visibleCompact = total - readInnerHeight(statsRow)
                const coverDocTop = spacerRect.top + window.scrollY
                // Hacia abajo: con `round` el último hueco salía 1px corto.
                const height = Math.floor(
                    Math.max(
                        window.innerWidth * 0.75,
                        navTopRef.current - fitGap * 2 - visibleCompact - belowCover - coverDocTop,
                    ),
                )
                setFittedCoverHeight((current) => (current === height ? current : height))
                setScoreboardMode((current) => (current === 'compact' ? current : 'compact'))
                const fitShift = Math.round((fitGap - baseGap) * 2) / 2
                setScoreboardShift((current) => (current === fitShift ? current : fitShift))
                return
            }
            const space = navTopRef.current - rowBottom
            const mode = space - fullHeight >= MOBILE_SCOREBOARD_MIN_GAP_PX * 2 ? 'full' : 'compact'
            setScoreboardMode((current) => (current === mode ? current : mode))
            // Hueco igual arriba y abajo; si ni así cabe (pantallas muy
            // bajas), el mínimo arriba y el marcador queda a un scroll.
            const visibleHeight = mode === 'full' ? fullHeight : compactHeight
            const gap = Math.max(MOBILE_SCOREBOARD_MIN_GAP_PX, (space - visibleHeight) / 2)
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
        // In fitCover mode only the ratings determine the cover height.
        // Watching the expanding stats remeasures the whole hero every frame.
        let observedScores = null
        const observeScores = () => {
            const scores = scoreboard?.querySelector('[data-scoreboard-toolbar]')
            if (scores === observedScores) return
            if (observedScores) observer.unobserve(observedScores)
            observedScores = scores
            if (scores) observer.observe(scores)
        }
        if (fitCover) observeScores()
        else if (scoreboard) observer.observe(scoreboard)
        // Botones que aparecen o desaparecen no cambian el tamaño de la fila.
        const mutations = new MutationObserver(update)
        mutations.observe(row, { childList: true, subtree: true })
        // Con `fitCover`, lo que se monta entre la portada y los botones (la
        // barra «Viendo», que llega con /api/progress) los mueve sin cambiar
        // su tamaño: se vigila el contenedor común (un fotograma como mucho).
        let raf = 0
        let fitMutations = null
        const spacer = coverSpacerRef.current
        if (fitCover && spacer) {
            let common = spacer.parentElement
            while (common && !common.contains(row)) common = common.parentElement
            if (common) {
                fitMutations = new MutationObserver(() => {
                    observeScores()
                    if (!raf) {
                        raf = window.requestAnimationFrame(() => {
                            raf = 0
                            update()
                        })
                    }
                })
                fitMutations.observe(common, { childList: true, subtree: true })
            }
        }
        return () => {
            window.removeEventListener('resize', update)
            observer.disconnect()
            mutations.disconnect()
            fitMutations?.disconnect()
            if (raf) window.cancelAnimationFrame(raf)
        }
    }, [enabled, isPhone, fitCover, fitGap])

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
        let viewportWidth = window.innerWidth
        let viewportHeight = window.innerHeight
        const update = () => {
            // Browser chrome changes height during a gesture. Keep the fade
            // distance stable once the cover is visible; rotation still refits.
            if (!lockRef.current || window.innerWidth !== viewportWidth) {
                viewportWidth = window.innerWidth
                viewportHeight = window.innerHeight
            }
            // Short pages must still finish the fade before the actual scroll limit.
            const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight)
            const end = Math.max(1, Math.round(Math.min(viewportHeight * 0.55, maxScroll * 0.85)))
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

    // Baseline 2024 fallback: update only the opacity of the four visual
    // layers. An inherited custom property on <html> invalidates styles for
    // the entire details tree on every frame (notably Firefox/older Safari).
    useEffect(() => {
        if (!enabled || !isPhone || CSS.supports?.(HERO_SCROLL_TIMELINE_QUERY)) return undefined
        let raf = 0
        let targetsDirty = true
        let targets = []
        const originalOpacity = new Map()
        const apply = () => {
            raf = 0
            if (targetsDirty) {
                targetsDirty = false
                targets = [...document.querySelectorAll(
                    '.sv-hero-scroll-in, .sv-hero-scroll-out, .sv-hero-scroll-shade, .sv-details-nav-glass',
                )]
                targets.forEach((el) => {
                    if (!originalOpacity.has(el)) originalOpacity.set(el, el.style.opacity)
                })
            }
            const dist = heroScrollEndRef.current || Math.max(1, window.innerHeight * 0.55)
            const p = Math.min(1, Math.max(0, window.scrollY / dist))
            targets.forEach((el) => {
                const opacity = (el.classList.contains('sv-hero-scroll-out') ? 1 - p
                    : el.classList.contains('sv-hero-scroll-shade') ? p * 0.6 : p).toFixed(4)
                if (Number(el.style.opacity) !== Number(opacity) || el.style.opacity === '') {
                    el.style.opacity = opacity
                }
            })
        }
        const onScroll = () => {
            if (!raf) raf = window.requestAnimationFrame(apply)
        }
        // Artwork and navbar layers can arrive after hydration. Child changes
        // refresh the small target list; scrolling never searches the DOM.
        const mutations = new MutationObserver(() => {
            targetsDirty = true
            onScroll()
        })
        mutations.observe(document.body, { childList: true, subtree: true })
        const resize = new ResizeObserver(onScroll)
        if (rootRef.current) resize.observe(rootRef.current)
        apply()
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll, { passive: true })
        return () => {
            mutations.disconnect()
            resize.disconnect()
            if (raf) window.cancelAnimationFrame(raf)
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
            originalOpacity.forEach((opacity, el) => { el.style.opacity = opacity })
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
    // Los eventos se agrupan por fotograma; primero se mide y luego se escribe.
    // El DOM gestiona tanto los bloques como las stats. React solo proporciona
    // el atributo inicial: abrir el marcador no vuelve a renderizar la ficha.
    useEffect(() => {
        const trigger = secondaryTriggerRef.current
        const container = rootRef.current
        if (!enabled || !isPhone || !trigger || !container) {
            return undefined
        }
        let statsApplied = null
        let raf = 0
        let targetsDirty = true
        let statsTargets = []
        let revealTargets = []
        let settled = false
        let wasAtTop = null
        const sync = () => {
            const atTop = window.scrollY <= MOBILE_REVEAL_SHOW_AT_PX
            if (!targetsDirty && settled && atTop === wasAtTop) return
            if (targetsDirty) {
                statsTargets = [...container.querySelectorAll(`[${MOBILE_STATS_REVEAL_ATTR}]`)]
                revealTargets = [...container.querySelectorAll(`[${MOBILE_REVEAL_ATTR}]`)]
                targetsDirty = false
            }
            wasAtTop = atTop
            const statsVisible =
                !atTop &&
                (statsApplied === true ||
                    trigger.getBoundingClientRect().top <= window.innerHeight - MOBILE_BOTTOM_NAV_PX)
            // Read every position before changing attributes; otherwise each
            // reveal can force layout again for the next block.
            const updates = []
            let revealLine = null
            let statsPending = null
            revealTargets.forEach((el) => {
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
                updates.push({ el, current, value, visible })
            })
            // Also initialize rows mounted after the first sync (async data).
            statsTargets.forEach((el) => {
                const value = statsVisible ? 'shown' : 'hidden'
                if (statsVisible && !el.hasAttribute(MOBILE_STATS_ANIMATED_ATTR)) el.setAttribute(MOBILE_STATS_ANIMATED_ATTR, '')
                if (el.getAttribute(MOBILE_STATS_REVEAL_ATTR) !== value) el.setAttribute(MOBILE_STATS_REVEAL_ATTR, value)
                const row = el.querySelector('[data-scoreboard-stats]')
                if (row && row.inert === statsVisible) row.inert = !statsVisible
            })
            statsApplied = statsVisible
            settled = atTop || (statsVisible && updates.every(({ visible }) => visible))
            updates.forEach(({ el, current, value, visible }) => {
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
        const observer = new IntersectionObserver(scheduleSync, {
            rootMargin: `0px 0px -${MOBILE_BOTTOM_NAV_PX}px 0px`,
            threshold: 0,
        })
        observer.observe(trigger)
        // Bloques que se montan después (la barra de búsqueda llega con los
        // títulos): nacen ocultos y se miran en el siguiente fotograma.
        const mutations = new MutationObserver(() => {
            targetsDirty = true
            scheduleSync()
        })
        mutations.observe(container, { childList: true, subtree: true })
        sync()
        window.addEventListener('scroll', scheduleSync, { passive: true })
        window.addEventListener('resize', scheduleSync, { passive: true })
        return () => {
            observer.disconnect()
            mutations.disconnect()
            if (raf) window.cancelAnimationFrame(raf)
            window.removeEventListener('scroll', scheduleSync)
            window.removeEventListener('resize', scheduleSync)
            container.querySelectorAll('[data-scoreboard-stats]').forEach((row) => { row.inert = false })
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
            ? { [MOBILE_STATS_REVEAL_ATTR]: 'hidden' }
            : {},
        // La portada: el póster entero (2:3 a todo el ancho), siempre.
        rootStyle: enabled
            ? {
                '--mobile-cover-top': `${coverTop}px`,
                '--mobile-cover-h': fitCover && fittedCoverHeight ? `${fittedCoverHeight}px` : '150vw',
                '--mobile-scoreboard-shift': `${scoreboardShift}px`,
                ...(actionsWidth ? { '--mobile-actions-w': `${actionsWidth}px` } : {}),
            }
            : undefined,
    }
}

// FICHA DE TELÉFONO DEL DRAWER (DetailModal en vista "mobile", escritorio y
// tablet): la cabecera de la ficha móvil con `fitCover`, dentro de un panel
// con scroll PROPIO. Allí no aplica nada de lo de arriba: el viewport no es el
// de un teléfono y lo que se desplaza es el panel, no la ventana.
//
// - Ajuste: desde el borde inferior del panel (no hay navbar inferior) hacia
//   arriba, `gap`, el marcador SIEMPRE compacto, `gap`, la fila de botones y
//   `actionsLead` hasta el pie de la portada; la portada ocupa el resto (como
//   mínimo 3:4 del ancho). Se escribe en `--mobile-cover-h` del panel
//   directamente: el drawer se redimensiona arrastrando y un estado de React
//   volvería a renderizar la ficha en cada movimiento.
// - Revelado: al empezar a desplazar se despliega la barra de stats del
//   marcador y aparece lo que va detrás de él (`PANEL_STATS_REVEAL_BASE`), y
//   se recoge al volver arriba del todo, como en la ficha móvil.
//
// `scoreboardRef` va en el envoltorio del marcador: su primer hijo es el
// marcador (se mide sin la barra de stats) y en él se escribe el atributo de
// revelado. `resetKey` vuelve a enganchar las medidas si cambia el contenido.
export function usePanelHeroFit(enabled, { panelRef, scrollerRef, actionsRef, scoreboardRef, gap = 20, actionsLead = 12, resetKey }) {
    useClientLayoutEffect(() => {
        const panel = panelRef.current
        const scroller = scrollerRef.current
        if (!enabled || !panel || !scroller) return undefined
        let applied = ''
        const update = () => {
            const height = scroller.clientHeight
            const width = scroller.clientWidth
            if (!height || !width) return
            const actions = actionsRef.current
            const board = scoreboardRef.current?.firstElementChild
            const actionsHeight = actions ? actions.getBoundingClientRect().height : 0
            const boardHeight = board
                ? board.getBoundingClientRect().height - readInnerHeight(board.querySelector('[data-scoreboard-stats]'))
                : 0
            // Hacia abajo, como en la ficha: con `round` el último hueco salía 1px corto.
            const cover = Math.floor(
                Math.max(width * 0.75, height - gap - boardHeight - gap - actionsHeight - actionsLead),
            )
            const value = `${cover}px`
            if (value === applied) return
            applied = value
            panel.style.setProperty('--mobile-cover-h', value)
        }
        update()
        if (typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(update)
        observer.observe(scroller)
        if (actionsRef.current) observer.observe(actionsRef.current)
        if (scoreboardRef.current) observer.observe(scoreboardRef.current)
        return () => {
            observer.disconnect()
            panel.style.removeProperty('--mobile-cover-h')
        }
    }, [enabled, gap, actionsLead, resetKey])

    useEffect(() => {
        const scroller = scrollerRef.current
        if (!enabled || !scroller) return undefined
        let applied = null
        let raf = 0
        const sync = () => {
            raf = 0
            const atTop = scroller.scrollTop <= MOBILE_REVEAL_SHOW_AT_PX
            if (atTop === applied) return
            applied = atTop
            const target = scoreboardRef.current
            if (!target) return
            target.setAttribute(PANEL_STATS_REVEAL_ATTR, atTop ? 'hidden' : 'shown')
            const stats = target.querySelector('[data-scoreboard-stats]')
            if (stats) stats.inert = atTop
            target.querySelectorAll('[data-panel-reveal]').forEach((el) => {
                el.inert = atTop
            })
        }
        const onScroll = () => {
            if (!raf) raf = window.requestAnimationFrame(sync)
        }
        sync()
        scroller.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            if (raf) window.cancelAnimationFrame(raf)
            scroller.removeEventListener('scroll', onScroll)
        }
    }, [enabled, resetKey])
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

// CONTRASTE ADAPTATIVO (`adaptiveContrast`, la ficha): el logo y los botones
// son blancos sobre cristal, y con pósters claros (cielo, nieve, fondos
// blancos) se perdían. Oscurecer siempre apagaba los pósters oscuros, que no
// lo necesitan. Así que se MIDE cada portada: se lee una copia diminuta (w92,
// ~5 KB; TMDb sirve CORS) y se calcula la luminancia relativa (WCAG) de la
// franja del logo (el 30% inferior del póster) y de lo que queda bajo los
// botones (la última franja, que se prolonga, y el centro, que va de fondo
// difuminado al 70% de brillo). De la peor de las dos sale cuánto hay que
// oscurecer para que el blanco tenga contraste ≥ ~5:1
// (`MOBILE_COVER_TARGET_LUMINANCE`): 0 en pósters oscuros, más cuanto más
// claro. Se usa el percentil 80 y no la media: lo que estorba son las zonas
// claras que quedan detrás del texto.
const MOBILE_COVER_TARGET_LUMINANCE = 0.16
const MOBILE_COVER_MAX_SCRIM = 0.82
// Si la medida falla (sin CORS, error de red): un oscurecido intermedio.
const MOBILE_COVER_FALLBACK_SCRIM = 0.4
// Brillo del fondo difuminado (`blurredUnderlay`) en luminancia lineal
// (0.7 en sRGB ≈ 0.46 lineal).
const MOBILE_COVER_UNDERLAY_LINEAR = 0.46
const coverLuminanceCache = new Map()

function srgbToLinear(value) {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function regionLuminance(data, width, height, fromY, toY, fromX = 0, toX = 1) {
    const values = []
    const y0 = Math.floor(height * fromY)
    const y1 = Math.max(y0 + 1, Math.ceil(height * toY))
    const x0 = Math.floor(width * fromX)
    const x1 = Math.max(x0 + 1, Math.ceil(width * toX))
    for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
            const i = (y * width + x) * 4
            values.push(
                0.2126 * srgbToLinear(data[i]) + 0.7152 * srgbToLinear(data[i + 1]) + 0.0722 * srgbToLinear(data[i + 2]),
            )
        }
    }
    values.sort((a, b) => a - b)
    return values[Math.min(values.length - 1, Math.floor(values.length * 0.8))] || 0
}

function readCoverLuminance(src) {
    const key = src.replace(/\/t\/p\/[^/]+\//, '/t/p/w92/')
    if (coverLuminanceCache.has(key)) return coverLuminanceCache.get(key)
    const request = new Promise((resolve) => {
        const image = new Image()
        image.crossOrigin = 'anonymous'
        image.decoding = 'async'
        image.onload = () => {
            try {
                const width = image.naturalWidth
                const height = image.naturalHeight
                const canvas = document.createElement('canvas')
                canvas.width = width
                canvas.height = height
                const context = canvas.getContext('2d', { willReadFrequently: true })
                context.drawImage(image, 0, 0)
                const { data } = context.getImageData(0, 0, width, height)
                resolve({
                    logo: regionLuminance(data, width, height, 0.7, 1),
                    edge: regionLuminance(data, width, height, 0.92, 1),
                    center: regionLuminance(data, width, height, 0.3, 0.7, 0.2, 0.8),
                })
            } catch {
                resolve(null)
            }
        }
        image.onerror = () => resolve(null)
        image.src = key
    })
    coverLuminanceCache.set(key, request)
    return request
}

function scrimForLuminance(luminance) {
    if (luminance <= MOBILE_COVER_TARGET_LUMINANCE) return 0
    return Math.min(MOBILE_COVER_MAX_SCRIM, 1 - MOBILE_COVER_TARGET_LUMINANCE / luminance)
}

// Cuánto oscurecer bajo el logo y los botones (0…MOBILE_COVER_MAX_SCRIM), o
// null mientras se mide.
function useCoverContrastScrim(src, enabled) {
    const [state, setState] = useState({ src: null, scrim: null })
    useEffect(() => {
        if (!enabled || !src) return undefined
        let cancelled = false
        readCoverLuminance(src).then((luminance) => {
            if (cancelled) return
            const scrim = luminance
                ? Math.max(
                    scrimForLuminance(luminance.logo),
                    scrimForLuminance(Math.max(luminance.edge, luminance.center * MOBILE_COVER_UNDERLAY_LINEAR)),
                )
                : MOBILE_COVER_FALLBACK_SCRIM
            setState({ src, scrim: Math.round(scrim * 100) / 100 })
        })
        return () => {
            cancelled = true
        }
    }, [src, enabled])
    return enabled && state.src === src ? state.scrim : null
}

// La capa: transparente en la mitad superior del póster, crece hacia la franja
// del logo y sigue plena bajo los botones hasta el pie de la pantalla. Su
// opacidad es la medida (con fundido por si la medida llega con la portada ya
// visible).
const MOBILE_COVER_CONTRAST_SCRIM = `linear-gradient(to bottom,
    rgba(10, 10, 10, 0) calc(var(--mobile-cover-h) * 0.5),
    rgba(10, 10, 10, 0.22) calc(var(--mobile-cover-h) * 0.62),
    rgba(10, 10, 10, 0.62) calc(var(--mobile-cover-h) * 0.74),
    rgba(10, 10, 10, 0.9) calc(var(--mobile-cover-h) * 0.86),
    rgb(10, 10, 10) calc(var(--mobile-cover-h) * 0.95))`

// `inPanel`: la portada de la ficha de teléfono del drawer (`usePanelHeroFit`).
// Llena su contenedor (una capa fija del panel, detrás del contenido con
// scroll) en vez de colgar de la ventana, y no lleva nada atado al viewport ni
// al scroll del documento: el relevo con el fondo lo anima el panel.
export function MobileHeroCover({ src, lowSrc, imgRef, onLoad, onError, failed, collage, collageUnderlay, blurredUnderlay = false, adaptiveContrast = false, ready, animate, inPanel = false }) {
    const highRef = useRef(null)
    const [highSrc, setHighSrc] = useState(null)
    const firstSrc = lowSrc || src
    const hasImage = Boolean(firstSrc) && !failed
    const hasHigh = hasImage && Boolean(src && src !== firstSrc)
    const contrastScrim = useCoverContrastScrim(hasImage ? firstSrc : null, adaptiveContrast)
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
        // no hay animaciones ligadas al scroll, el hook actualiza solo
        // la opacidad de esta capa, sin invalidar estilos del documento.
        <div
            aria-hidden="true"
            className={
                inPanel
                    ? 'absolute inset-0'
                    : 'sv-hero-scroll-out absolute inset-x-0 sm:hidden max-sm:[opacity:calc(1_-_var(--sv-hero-scroll,0))]'
            }
            style={inPanel ? undefined : { top: 'var(--mobile-cover-top, 0px)' }}
        >
        <div
            className={`absolute inset-x-0 top-0 ${
                inPanel
                    // La entrada de la ficha móvil (`sv-mobile-poster-reveal`)
                    // solo existe en la media query de teléfono: aquí, un
                    // fundido (o nada si ya estaba en caché, `animate`).
                    ? `${animate ? 'transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none' : ''} ${ready ? 'opacity-100' : 'opacity-0'}`
                    : `sv-mobile-poster-entry ${ready ? (animate ? 'sv-mobile-poster-reveal' : '') : 'opacity-0'}`
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
                            // El ancho con el que se pinta el póster: todo el
                            // ancho o, si la portada es más alta que 2:3
                            // (`fitCover`), el que da su alto.
                            backgroundSize: 'max(100%, calc(var(--mobile-cover-h) * 2 / 3)) auto',
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
            {hasImage && adaptiveContrast ? (
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 transition-opacity duration-500 motion-reduce:transition-none"
                    style={{
                        height: 'calc(var(--mobile-cover-h) + 100lvh)',
                        backgroundImage: MOBILE_COVER_CONTRAST_SCRIM,
                        opacity: contrastScrim ?? 0,
                    }}
                />
            ) : null}
        </div>
        </div>
    )
}
