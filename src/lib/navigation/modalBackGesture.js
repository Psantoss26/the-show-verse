// /src/lib/navigation/modalBackGesture.js
// GESTO DE ATRÁS DE LA APP DE ANDROID CON UN MODAL ABIERTO.
//
// Con un modal abierto, la app no anima la página (AtrasPredictivo.kt): atrás
// solo cierra el modal (modalBackEntry). Mientras el dedo avanza, la app pasa
// aquí el gesto (`window.__svModalBackGesture(fase, progreso, desdeIzquierda)`,
// ver GestoModal.kt) y lo que se mueve es SOLO el panel del modal de encima: se
// encoge, se aparta del borde por el que entra el gesto y, si es de esquinas
// rectas (vista lateral a pantalla completa en el teléfono), las redondea. El
// velo difuminado y la página de detrás se quedan quietos. Al soltar, el
// `popstate` cierra el modal con su salida de siempre, que arranca desde donde
// lo dejó el dedo; al cancelar, el panel vuelve a su sitio.
//
// El panel se marca con `data-sv-back-panel` (useActionModalMotion, SectionSheet).
// Se mueve con `scale` y `translate` sueltos, que se suman al `transform` de
// las animaciones de entrada y salida sin pisarlo; una salida que calcula su
// recorrido desde la caja del panel (useActionModalMotion) recoge antes el
// gesto con `takeBackGesture` y lo convierte en su primer fotograma.

export const BACK_PANEL_ATTR = "data-sv-back-panel";
const MIN_SCALE = 0.92;
const MAX_SHIFT_PX = 24;
const MAX_RADIUS_PX = 28;
const CANCEL_MS = 220;
/** Tras soltar, lo que tarda como mucho la salida en recoger el gesto. */
const END_CLEAR_MS = 700;

const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));

/** Cómo se ve el panel con el gesto en `progress` (0..1). */
export function backGestureStyle(progress, fromLeft, { rounded }) {
  const p = clamp01(progress);
  // Desacelera como la animación de Android: responde enseguida al dedo.
  const e = 1 - (1 - p) * (1 - p);
  const shift = MAX_SHIFT_PX * e;
  return {
    scale: 1 - (1 - MIN_SCALE) * e,
    translateX: shift === 0 ? 0 : fromLeft ? shift : -shift,
    radius: rounded ? null : MAX_RADIUS_PX * e,
  };
}

/** El `transform` que equivale a `translate` + `scale` sueltos. */
export function backGestureTransform(style) {
  return `translateX(${style.translateX}px) scale(${style.scale})`;
}

let active = null; // { el, rounded, style, timer }

function topPanel() {
  const panels = [...document.querySelectorAll(`[${BACK_PANEL_ATTR}]`)].filter(
    (el) => !el.closest("[inert]"),
  );
  return panels[panels.length - 1] ?? null;
}

function apply(el, style) {
  el.style.translate = style.translateX ? `${style.translateX}px 0` : "";
  el.style.scale = style.scale === 1 ? "" : String(style.scale);
  if (style.radius != null) el.style.borderRadius = style.radius ? `${style.radius}px` : "";
}

function clear(gesture) {
  clearTimeout(gesture.timer);
  const s = gesture.el.style;
  s.removeProperty("translate");
  s.removeProperty("scale");
  s.removeProperty("transition");
  if (!gesture.rounded) s.removeProperty("border-radius");
}

/**
 * La salida del modal recoge el gesto en curso de `el`: lo quita del estilo y
 * devuelve el `transform` equivalente (o null si no había gesto).
 */
export function takeBackGesture(el) {
  if (!el || active?.el !== el || !active.style) return null;
  const transform = backGestureTransform(active.style);
  clear(active);
  // El redondeo se queda: la salida parte del panel tal como se ve.
  active = null;
  return transform;
}

function handle(phase, progress, fromLeft) {
  if (phase === "start") {
    if (active) clear(active);
    active = null;
    const el = topPanel();
    if (!el) return;
    const rounded = getComputedStyle(el).borderTopLeftRadius !== "0px";
    active = { el, rounded, fromLeft: Boolean(fromLeft), style: null, timer: 0 };
    el.style.transition = "none";
  }
  if (!active) return;
  const gesture = active;
  if (phase === "start" || phase === "progress") {
    gesture.style = backGestureStyle(progress, gesture.fromLeft, gesture);
    apply(gesture.el, gesture.style);
  } else if (phase === "cancel") {
    active = null;
    const ms = `${CANCEL_MS}ms cubic-bezier(0.2, 0, 0, 1)`;
    gesture.el.style.transition = `translate ${ms}, scale ${ms}, border-radius ${ms}`;
    apply(gesture.el, backGestureStyle(0, gesture.fromLeft, gesture));
    gesture.timer = setTimeout(() => clear(gesture), CANCEL_MS + 40);
  } else if (phase === "end") {
    // Atrás ya va camino del `popstate`, que cierra el modal. Si su salida no
    // recoge el gesto (la vista lateral se desliza con él puesto), se limpia
    // cuando ya ha salido.
    gesture.timer = setTimeout(() => {
      if (active === gesture) active = null;
      clear(gesture);
    }, END_CLEAR_MS);
  }
}

export function installModalBackGesture() {
  if (typeof window !== "undefined") window.__svModalBackGesture = handle;
}
