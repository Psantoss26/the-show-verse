// Guardia de desplazamiento TÁCTIL para los modales.
//
// `overflow: hidden` + `overscroll-behavior: none` en <html> no bastan en
// pantallas táctiles. Cuando el dedo arrastra sobre algo que NO puede
// desplazarse en esa dirección —la cabecera del modal, su fondo, o una lista
// que ya está en su tope—, el navegador encadena el gesto hasta la página:
//   - en Chrome/Android (tablets) eso es el «tirar para actualizar», y la
//     página se recarga al intentar volver hacia arriba dentro del modal;
//   - en iPadOS la página de fondo rebota o se desplaza por debajo;
//   - y si el gesto no llega a desplazar nada, el navegador lo trata como un
//     toque y dispara un clic sintético, que sobre el fondo CIERRA el modal.
//
// Mientras haya un modal abierto, un `touchmove` solo sigue adelante si bajo el
// dedo hay un elemento que pueda desplazarse en la dirección del gesto. Si no,
// se cancela con `preventDefault()` y no pasa ninguna de las tres cosas.
//
// Funciones puras y exportadas para poder probar la decisión sin navegador.

const SCROLLABLE_OVERFLOW = /(auto|scroll|overlay)/;

// Controles que tienen su propio gesto táctil y no se deben tocar.
const NATIVE_GESTURE_SELECTOR =
  'input[type="range"], [data-allow-touch-gesture]';

/**
 * ¿Puede `el` desplazarse en la dirección del gesto?
 * `deltaX`/`deltaY` son el movimiento del DEDO: arrastrar hacia abajo
 * (deltaY > 0) desplaza el contenido hacia ARRIBA.
 */
export function canScrollInDirection(el, deltaX, deltaY, style) {
  const vertical = Math.abs(deltaY) >= Math.abs(deltaX);
  if (vertical) {
    if (!SCROLLABLE_OVERFLOW.test(style.overflowY)) return false;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 1) return false;
    return deltaY > 0 ? el.scrollTop > 0 : el.scrollTop < max - 1;
  }
  if (!SCROLLABLE_OVERFLOW.test(style.overflowX)) return false;
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 1) return false;
  // `scrollLeft` puede ser negativo en contenedores RTL: se usa su valor
  // absoluto para medir cuánto queda.
  const left = Math.abs(el.scrollLeft);
  return deltaX > 0 ? left > 0 : left < max - 1;
}

/**
 * Busca, desde el objetivo del toque hacia arriba, un elemento que pueda
 * absorber el gesto. Se detiene en <body>: la página de fondo es justo lo que
 * no se debe desplazar.
 */
export function findTouchScrollTarget(target, deltaX, deltaY, getStyle) {
  let el = target instanceof Element ? target : target?.parentElement || null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (canScrollInDirection(el, deltaX, deltaY, getStyle(el))) return el;
    el = el.parentElement;
  }
  return null;
}

let installed = false;
let lastTouch = null;

function onTouchStart(event) {
  const touch = event.touches[0];
  lastTouch = event.touches.length === 1 && touch
    ? { x: touch.clientX, y: touch.clientY }
    : null;
}

function onTouchMove(event) {
  // Dos dedos: zoom. No es un desplazamiento y no se toca.
  if (event.touches.length !== 1 || !lastTouch || !event.cancelable) return;
  const touch = event.touches[0];
  const deltaX = touch.clientX - lastTouch.x;
  const deltaY = touch.clientY - lastTouch.y;
  lastTouch = { x: touch.clientX, y: touch.clientY };
  if (deltaX === 0 && deltaY === 0) return;

  const target = event.target;
  if (target instanceof Element && target.closest(NATIVE_GESTURE_SELECTOR)) {
    return;
  }

  const scroller = findTouchScrollTarget(
    target,
    deltaX,
    deltaY,
    (el) => window.getComputedStyle(el),
  );
  if (!scroller) event.preventDefault();
}

/** Activa la guardia (idempotente). La llama el primer bloqueo de scroll. */
export function installTouchScrollGuard() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  lastTouch = null;
  document.addEventListener("touchstart", onTouchStart, {
    passive: true,
    capture: true,
  });
  // `passive: false`: sin eso `preventDefault()` se ignora.
  document.addEventListener("touchmove", onTouchMove, {
    passive: false,
    capture: true,
  });
}

/** La retira cuando se cierra el último modal. */
export function uninstallTouchScrollGuard() {
  if (!installed || typeof document === "undefined") return;
  installed = false;
  lastTouch = null;
  document.removeEventListener("touchstart", onTouchStart, { capture: true });
  document.removeEventListener("touchmove", onTouchMove, { capture: true });
}
