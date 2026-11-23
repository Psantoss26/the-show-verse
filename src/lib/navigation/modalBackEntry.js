// /src/lib/navigation/modalBackEntry.js
// ATRÁS CIERRA EL MODAL, NO LA PÁGINA.
//
// En teléfonos y tabletas táctiles (gesto de atrás de Android, botón atrás de
// la APK) un modal abierto empuja su propia entrada de historial con la MISMA
// URL. Atrás la quita: el modal se cierra y la página sigue donde estaba.
//
// Reglas:
// - La entrada lleva `svModalDepth` (1 para el primer modal, 2 para uno
//   abierto encima…). Al llegar un `popstate` con una profundidad menor que la
//   pila, se cierran los modales que sobran, del de arriba al de abajo.
// - Cerrar el modal desde la interfaz (X, fondo, Escape) deshace su entrada con
//   `history.back()`, pero cuando ya ha salido (`CLOSE_BACK_DELAY_MS`): el
//   `popstate` vuelve a renderizar la página con el router y, lanzado en el
//   mismo instante, retenía el primer fotograma de la salida (la X tardaba en
//   responder). Antes la marca como entrada de captura limpia
//   (`svCleanBack`, ver backGestureCapture): si el cierre viene de pulsar un
//   enlace del modal o de un `router.push`, no se vuelve atrás (anularía la
//   navegación en curso) y la navegación SUSTITUYE la entrada
//   (ScrollRestoration convierte su `pushState` en `replaceState`).
// - Desmontar el modal sin cerrarlo (cambio de página, pantalla oculta en
//   <Activity>) no toca el historial. Al volver a esa pantalla con el modal aún
//   abierto, la entrada en la que se aterriza es la suya y la adopta.
// - Los demás oyentes de `popstate` (vista previa en cajón, vista previa móvil)
//   ignoran los que atiende este módulo: `wasModalHistoryPop()`.

import { setAppModalOpen } from "../android/appBridge.js";
import {
  CLEAN_BACK_KEY,
  isCleanBackEntry,
  isCleanBackEntryHeld,
} from "./backGestureCapture.js";
import { installModalBackGesture } from "./modalBackGesture.js";

export const MODAL_DEPTH_KEY = "svModalDepth";
const STALE_KEY = "svModalStale";
const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";
/** Un clic en un enlace o un `router.push` así de reciente cuenta como «el
 * modal se cierra para navegar». */
export const NAVIGATION_INTENT_MS = 1500;
/** Lo que tarda en salir el modal más lento (SectionSheet, DetailModal: 260 ms)
 * y un margen: hasta entonces la entrada del modal cerrado sigue en el
 * historial, ya marcada como de captura limpia. */
export const CLOSE_BACK_DELAY_MS = 320;

const stack = [];
let ignorePops = 0;
let notifiedOpen = false;

/** La app de Android solo anima la página al volver si no hay modal abierto. */
function syncAppModalState() {
  const open = stack.length > 0;
  if (open === notifiedOpen) return;
  notifiedOpen = open;
  setAppModalOpen(open);
}
let handledPop = false;
let navigationIntentAt = -Infinity;
let staleSeq = 0;

export function usesModalBackEntry() {
  return typeof window !== "undefined" && window.matchMedia?.(TOUCH_QUERY).matches === true;
}

/** Profundidad de modal de un estado de historial (0 = sin modal). */
export function modalDepthOf(state) {
  const depth = Number(state?.[MODAL_DEPTH_KEY]);
  return Number.isInteger(depth) && depth > 0 ? depth : 0;
}

/** Estado para la entrada de un modal de profundidad `depth` (0 = ninguno). */
export function withModalDepth(state, depth, extra = {}) {
  const next = { ...(state || {}) };
  delete next[CLEAN_BACK_KEY];
  delete next[STALE_KEY];
  if (depth > 0) next[MODAL_DEPTH_KEY] = depth;
  else delete next[MODAL_DEPTH_KEY];
  return { ...next, ...extra };
}

/** ¿Es la entrada actual la de un modal abierto? */
export function isModalHistoryEntry() {
  return typeof window !== "undefined" && modalDepthOf(window.history.state) > 0;
}

/** ¿Atendió este módulo el `popstate` que se está despachando? */
export function wasModalHistoryPop() {
  return handledPop;
}

function flagHandled() {
  handledPop = true;
  // Todos los oyentes del mismo evento corren en esta tarea.
  setTimeout(() => {
    handledPop = false;
  }, 0);
}

/** Se va a navegar (enlace pulsado, `router.push`): un modal que se cierra
 * ahora no debe volver atrás. */
export function noteModalNavigation() {
  navigationIntentAt = typeof performance !== "undefined" ? performance.now() : Date.now();
}

function recentNavigationIntent() {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  return now - navigationIntentAt <= NAVIGATION_INTENT_MS;
}

function isNavigatingLinkClick(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  const anchor = event.target?.closest?.("a[href]");
  if (!anchor || anchor.hasAttribute("download")) return false;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return false;
  try {
    return new URL(anchor.href, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function onPopState() {
  if (ignorePops > 0) {
    ignorePops -= 1;
    flagHandled();
    return;
  }
  const depth = modalDepthOf(window.history.state);
  if (stack.length <= depth) return;
  flagHandled();
  const closing = stack.splice(depth);
  syncAppModalState();
  for (let i = closing.length - 1; i >= 0; i -= 1) {
    closing[i].popped = true;
    closing[i].close();
  }
}

if (typeof window !== "undefined") {
  installModalBackGesture();
  window.addEventListener("popstate", onPopState);
  document.addEventListener(
    "click",
    (event) => {
      if (isNavigatingLinkClick(event)) noteModalNavigation();
    },
    true,
  );
}

/** Un modal se abre: empuja (o adopta) su entrada. Devuelve su registro. */
export function openModalEntry(close) {
  const record = { close, popped: false, depth: stack.length + 1 };
  stack.push(record);
  syncAppModalState();
  const state = window.history.state;
  if (modalDepthOf(state) === record.depth && !state?.[STALE_KEY]) return record;
  const next = withModalDepth(state, record.depth);
  // Una entrada de captura limpia que nadie usa (p. ej. la que dejó un modal
  // cerrado para navegar, si la navegación no llegó) se reaprovecha.
  if (isCleanBackEntry() && !isCleanBackEntryHeld()) window.history.replaceState(next, "");
  else window.history.pushState(next, "");
  return record;
}

/**
 * El modal deja de estar abierto (cerrado, o desmontado). Si seguimos en su
 * entrada, la deshace; si ya no (atrás la quitó, o se navegó), nada.
 */
export function closeModalEntry(record) {
  const index = stack.indexOf(record);
  if (index !== -1) stack.splice(index, 1);
  syncAppModalState();
  if (record.popped) return;
  const state = window.history.state;
  if (modalDepthOf(state) !== record.depth || state?.[STALE_KEY]) return;
  staleSeq += 1;
  const token = staleSeq;
  window.history.replaceState(
    withModalDepth(state, record.depth - 1, { [CLEAN_BACK_KEY]: true, [STALE_KEY]: token }),
    "",
  );
  setTimeout(() => {
    if (recentNavigationIntent()) return;
    if (window.history.state?.[STALE_KEY] !== token) return;
    ignorePops += 1;
    window.history.back();
  }, CLOSE_BACK_DELAY_MS);
}
