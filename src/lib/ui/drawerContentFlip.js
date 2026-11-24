// LA PÁGINA DE DETRÁS DEL DRAWER ACOPLADO SE RECOLOCA CON FLIP.
//
// Al abrir o cerrar el drawer acoplado, el margen derecho de la página cambia
// UNA vez y la rejilla se coloca directamente en su sitio definitivo. Lo que se
// anima es el VIAJE de cada pieza visible desde donde estaba hasta donde queda,
// con `transform` (compositor) y el reloj del panel.
//
// Antes se animaba el propio `margin-right` fotograma a fotograma. La rejilla
// se reorganizaba en cada fotograma: las tarjetas cambiaban de tamaño a saltos
// de píxel, el contenedor centrado saltaba de alineación a mitad del camino y
// las piezas "parpadeaban" de una posición a otra.
//
// Qué se anima (recorrido desde el contenedor de la página):
// - una pieza que solo se ha DESPLAZADO (mismo tamaño) viaja entera, con todo
//   lo que lleva dentro;
// - una pieza pequeña que ha cambiado de tamaño SIN deformarse (una tarjeta de
//   póster: misma proporción) viaja y escala como un bloque rígido;
// - una pieza que se ha deformado (la rejilla, la cabecera, la barra de
//   filtros: cambian de ancho pero no de alto) viaja anclada por su esquina
//   superior izquierda y se baja a sus hijos; si tiene fondo y crece, se
//   descubre con un recorte.
// Solo cuenta lo que se ve antes o después, con un margen de una pantalla.
//
// Las animaciones se crean PAUSADAS en el primer fotograma (la pieza sigue
// pintada donde estaba) y arrancan cuando lo hace el panel, copiando su
// `startTime`: framer crea la animación del panel uno o dos fotogramas después
// de este commit, y en desarrollo montar la ficha bloquea ~400 ms.

const PANEL_SELECTOR = ".sv-drawer-panel";
const ASPECT_TOLERANCE = 0.03;
const SIZE_EPSILON = 0.5;
const MOVE_EPSILON = 0.5;
const MAX_DEPTH = 14;

let running = [];

function viewportBand() {
  const h = window.innerHeight || 0;
  return { top: -h, bottom: h * 2 };
}

function inBand(rect, band) {
  return rect.bottom >= band.top && rect.top <= band.bottom && rect.width > 0 && rect.height > 0;
}

// FIRST: rectángulos de todo lo que pueda verse (antes o después), sin bajar a
// lo que queda lejos de la pantalla.
function collectRects(root) {
  const band = viewportBand();
  const rects = new Map();
  const walk = (el, depth) => {
    const rect = el.getBoundingClientRect();
    if (!inBand(rect, band)) return;
    rects.set(el, rect);
    if (depth >= MAX_DEPTH) return;
    for (const child of el.children) walk(child, depth + 1);
  };
  for (const child of root.children) walk(child, 0);
  return rects;
}

function sameAspect(a, b) {
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / rb <= ASPECT_TOLERANCE;
}

// Solo se escala como bloque una pieza PEQUEÑA (una tarjeta). Un contenedor
// grande puede crecer casi en proporción por casualidad (la página entera: más
// ancha y, con tarjetas mayores, más alta), y escalarlo encogería también la
// cabecera y el texto, que luego saltarían a su tamaño real al acabar.
function isRigidPiece(first, last) {
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  return (
    last.width > 0 &&
    last.height > 0 &&
    Math.max(first.width, last.width) <= vw * 0.4 &&
    Math.max(first.height, last.height) <= vh
  );
}

function parseOrigin(value = "") {
  const [x, y] = value.split(" ").map((part) => parseFloat(part));
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

function pausedAnimation(el, keyframes, composite) {
  const animation = el.animate(keyframes, { duration: 1, fill: "backwards", composite });
  animation.pause();
  animation.currentTime = 0;
  return animation;
}

// `offset`: lo que ya desplazan los antepasados deformados (ver abajo); la
// pieza se pinta en su caja de layout MÁS ese desplazamiento. `own`: la
// transformación y el origen que la pieza ya tenía (hover, entradas), leídos
// antes de crear ninguna animación.
function playFrom(el, first, last, scale, offset, own) {
  // La caja de layout es `last`; con `scale` alrededor del origen del elemento,
  // la esquina superior izquierda acaba en last + origen·(1 − s) + d. Se busca
  // la d que la lleva a `first`.
  const origin = scale === 1 ? { x: 0, y: 0 } : parseOrigin(own?.origin);
  const dx = first.left - last.left - offset.x - origin.x * (1 - scale);
  const dy = first.top - last.top - offset.y - origin.y * (1 - scale);
  if (scale === 1 && Math.abs(dx) < MOVE_EPSILON && Math.abs(dy) < MOVE_EPSILON) {
    return { animation: null, dx: 0, dy: 0 };
  }
  const move = scale === 1
    ? `translate(${dx}px, ${dy}px)`
    : `translate(${dx}px, ${dy}px) scale(${scale})`;
  const rest = scale === 1 ? "translate(0px, 0px)" : "translate(0px, 0px) scale(1)";
  // La transformación propia de la pieza va DELANTE, igual que la sumaría
  // `composite: "add"`, pero escrita a mano y con `replace`: Chrome no lleva
  // al compositor las animaciones `add` (motivo 16), así que las ~60 tarjetas
  // se movían en el hilo principal, el mismo que monta la ficha a la vez, y
  // la página iba a tirones. Lo que cambie esa transformación mientras viaja
  // (un hover) se ve al acabar, 420 ms después.
  const base = own?.transform;
  const prefix = base && base !== "none" ? `${base} ` : "";
  const animation = pausedAnimation(
    el,
    [{ transform: prefix + move }, { transform: prefix + rest }],
    "replace",
  );
  return { animation, dx, dy };
}

function hasVisibleBox(el) {
  const style = window.getComputedStyle(el);
  if (style.backgroundImage !== "none" || style.boxShadow !== "none") return true;
  if (parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderLeftWidth) > 0) return true;
  if (style.backdropFilter && style.backdropFilter !== "none") return true;
  const bg = style.backgroundColor || "";
  return !(bg === "transparent" || /rgba\(.*,\s*0\)$/.test(bg));
}

// Una caja con fondo que CRECE (el buscador al cerrar) se recorta al ancho y
// alto que tenía y se descubre a la vez que viaja: si no, su fondo saltaría a
// la medida nueva en el primer fotograma y taparía a sus vecinas, que aún
// vienen de camino. Al encoger no hay nada que recortar: la caja queda
// anclada por la izquierda y sus vecinas llegan a su lado.
//
// NUNCA se recorta la RAÍZ de la página ni una caja de una pantalla de alto o
// más. Un `clip-path` recorta también a sus descendientes `position: fixed`, y
// la raíz lleva el fondo de la página (`fixed inset-0`, que pasa por detrás de
// la barra superior y la lateral). En una página corta o aún cargando la raíz
// mide justo una pantalla (`min-h-screen`), y al cerrar el drawer acoplado su
// fondo quedaba recortado a la caja de la página: las dos barras se veían
// sobre el negro del <body> hasta acabar el viaje.
export function growthClipInsets(first, last, viewportHeight, isPageRoot) {
  if (isPageRoot) return null;
  const right = Math.max(0, last.width - first.width);
  const bottom = Math.max(0, last.height - first.height);
  if (right < SIZE_EPSILON && bottom < SIZE_EPSILON) return null;
  if (Math.max(first.height, last.height) >= viewportHeight) return null;
  return { right, bottom };
}

function revealGrowth(el, first, last, isPageRoot) {
  const insets = growthClipInsets(first, last, window.innerHeight || 0, isPageRoot);
  if (!insets) return null;
  if (!hasVisibleBox(el)) return null;
  const { right, bottom } = insets;
  const radius = window.getComputedStyle(el).borderRadius || "0px";
  return pausedAnimation(
    el,
    [
      { clipPath: `inset(0px ${right}px ${bottom}px 0px round ${radius})` },
      { clipPath: `inset(0px 0px 0px 0px round ${radius})` },
    ],
    "replace",
  );
}

// LAST + INVERT: compara y crea las animaciones.
function buildAnimations(root, firstRects) {
  const band = viewportBand();
  // Todas las medidas nuevas ANTES de crear ninguna animación: una animación en
  // pausa ya pinta su primer fotograma, y medir un hijo después de animar a su
  // padre contaba dos veces el viaje del padre.
  // La transformación y el origen de cada pieza también se leen aquí: leerlos
  // después de animar otra obligaría a recalcular estilos una vez por pieza.
  const lastRects = new Map();
  const ownTransforms = new Map();
  for (const el of firstRects.keys()) {
    if (!el.isConnected) continue;
    lastRects.set(el, el.getBoundingClientRect());
    const style = window.getComputedStyle(el);
    ownTransforms.set(el, { transform: style.transform, origin: style.transformOrigin });
  }
  const animations = [];
  const walk = (el, depth, offset) => {
    const first = firstRects.get(el);
    const last = lastRects.get(el);
    if (!first || !last) return;
    if (!inBand(last, band) && !inBand(first, band)) return;
    const sameSize =
      Math.abs(first.width - last.width) < SIZE_EPSILON &&
      Math.abs(first.height - last.height) < SIZE_EPSILON;
    if (sameSize) {
      const { animation } = playFrom(el, first, last, 1, offset, ownTransforms.get(el));
      if (animation) animations.push(animation);
      return;
    }
    if (isRigidPiece(first, last) && sameAspect(first, last)) {
      const { animation } = playFrom(el, first, last, first.width / last.width, offset, ownTransforms.get(el));
      if (animation) animations.push(animation);
      return;
    }
    // DEFORMADA (la rejilla, la cabecera, el buscador): viaja anclada por su
    // esquina superior izquierda, y sus hijos se miden contando con ese viaje.
    // Sin anclarla, la caja se quedaba en su sitio nuevo mientras su icono y
    // su texto venían del viejo, y se veían fuera de ella.
    const { animation, dx, dy } = playFrom(el, first, last, 1, offset, ownTransforms.get(el));
    if (animation) animations.push(animation);
    const clip = revealGrowth(el, first, last, depth === 0);
    if (clip) animations.push(clip);
    if (depth >= MAX_DEPTH) return;
    const childOffset = { x: offset.x + dx, y: offset.y + dy };
    for (const child of el.children) walk(child, depth + 1, childOffset);
  };
  for (const child of root.children) walk(child, 0, { x: 0, y: 0 });
  return animations;
}

function findPanelTransformAnimation() {
  for (const panel of document.querySelectorAll(PANEL_SELECTOR)) {
    for (const animation of panel.getAnimations()) {
      const frames = animation.effect?.getKeyframes?.() ?? [];
      if (frames.some((frame) => frame.transform != null)) return animation;
    }
  }
  return null;
}

function startWithPanel(group, motion, triesLeft = 3) {
  window.requestAnimationFrame(() => {
    if (running !== group) return;
    const panel = findPanelTransformAnimation();
    if (panel?.startTime == null && triesLeft > 0) {
      startWithPanel(group, motion, triesLeft - 1);
      return;
    }
    // Sin panel animado (movimiento reducido): la página ya está en su sitio.
    if (panel?.startTime == null) {
      stopDrawerContentFlip();
      return;
    }
    for (const animation of group) {
      animation.effect.updateTiming({ duration: motion.duration, easing: motion.easing });
      animation.startTime = panel.startTime;
    }
    Promise.all(group.map((animation) => animation.finished))
      .catch(() => {})
      .then(() => {
        if (running === group) running = [];
      });
  });
}

export function stopDrawerContentFlip() {
  const group = running;
  running = [];
  for (const animation of group) animation.cancel();
}

// Aplica `mutate` (el cambio de margen) y anima la página de su colocación
// anterior a la nueva con `motion` ({ duration, easing }) y el reloj del panel.
export function flipDrawerContent(root, mutate, motion) {
  if (!root || typeof window === "undefined" || typeof root.animate !== "function") {
    mutate();
    return;
  }
  // Un FLIP a medias (abrir y cerrar seguidos): se mide con él aplicado, así
  // la pieza sale de donde se ve, no de donde estaba su caja.
  const firstRects = collectRects(root);
  stopDrawerContentFlip();
  mutate();
  const group = buildAnimations(root, firstRects);
  if (!group.length) return;
  running = group;
  startWithPanel(group, motion);
}
