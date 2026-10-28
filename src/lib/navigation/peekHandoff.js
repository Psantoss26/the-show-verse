// /src/lib/navigation/peekHandoff.js
// RELEVO DE LA VISTA PREVIA MÓVIL A LA FICHA (MobileTitlePeek →
// DetailsClient, temporadas, episodios).
//
// Al tocar la portada de la vista previa, la tarjeta flotante se convierte en
// el mismo fotograma en la cabecera de la ficha: crece hasta el ancho de la
// pantalla y su portada se coloca donde la pintará la ficha (pegada arriba,
// ver MobileHeroCover). La ficha carga debajo y, cuando su portada está en
// pantalla, la tarjeta se ajusta a ella al píxel (`settlePeekCard`) y se
// desvanece encima: como las dos portadas son la misma imagen en el mismo
// sitio, el cambio no se ve.
//
// Logo, fila de botones y marcador (las PIEZAS, `parts`) NO se desvanecen
// cuando la ficha de destino es DetailsClient, que pinta los mismos: mientras
// crece la portada viajan ya a donde los pintará la ficha (la última caja
// medida para este tamaño de pantalla, `rememberPartTargets`; la primera vez,
// se quedan quietas) y, con la ficha lista, se ajustan a la caja real de su
// pareja (`PEEK_HANDOFF_PART_ATTR`). Entonces aparecen debajo las de la
// ficha (`revealPeekHandoffParts`), que hasta ese momento estaban ocultas
// (`PEEK_HANDOFF_ACTIVE_ATTR`) y se pintan sin animación de entrada, y al
// llegar la vista previa entera se desvanece encima: portada y piezas son las mismas en
// el mismo sitio, así que el fundido no se ve. Las de la vista previa NO se
// ocultan antes: la capa de la vista previa va por encima de la ficha y se
// vería el hueco. Si una pieza no tiene pareja (temporadas, episodios), se
// desvanece al tocar.
//
// Las piezas viven dentro de la tarjeta, que también se transforma: su
// trayectoria en pantalla se muestrea en fotogramas clave (`flightKeyframes`)
// para que vaya en línea recta con la curva de la tarjeta y no haga un arco.
//
// Solo `transform` y `opacity` con la API de animaciones: la navegación y el
// montaje de la ficha cargan el hilo principal justo entonces, y el
// compositor no se frena.

// Ruta a la que va el relevo en curso. La lee MobileHeroCover al montar: la
// portada de la ficha entra SIN su animación de entrada (la vista previa ya
// está enseñando esa misma imagen encima).
const HANDOFF_MAX_AGE_MS = 15000;
let pending = null;

export function beginPeekHandoff(href) {
  try {
    pending = {
      pathname: new URL(href, window.location.origin).pathname,
      at: Date.now(),
    };
  } catch {
    pending = null;
  }
  if (pending && peekHrefKeepsParts(href)) {
    document.documentElement.setAttribute(PEEK_HANDOFF_ACTIVE_ATTR, "");
  }
}

export function endPeekHandoff() {
  pending = null;
  revealPeekHandoffParts();
}

// Las piezas de la ficha dejan de estar ocultas (ver globals.css).
export function revealPeekHandoffParts() {
  document.documentElement.removeAttribute(PEEK_HANDOFF_ACTIVE_ATTR);
}

export function isPeekHandoffTarget(pathname) {
  return (
    !!pending &&
    pending.pathname === pathname &&
    Date.now() - pending.at < HANDOFF_MAX_AGE_MS
  );
}

// Marca de la caja de la portada de la ficha (MobileHeroCover) con la que se
// alinea la tarjeta al final del relevo.
export const PEEK_HANDOFF_TARGET_ATTR = "data-peek-handoff-target";
// Marca de las piezas de la ficha (`logo`, `actions`, `scoreboard`) a las que
// vuelan las de la vista previa. Solo está puesta cuando la pieza ya se ve.
export const PEEK_HANDOFF_PART_ATTR = "data-peek-handoff-part";
// En la raíz de la ficha durante un relevo: "true" cuando sus piezas ya están
// pintadas (la vista previa espera a eso para desvanecerse).
export const PEEK_HANDOFF_READY_ATTR = "data-peek-handoff-ready";
// En una pieza de la ficha que aún no está lista (el logo, hasta decodificarse).
export const PEEK_HANDOFF_PENDING_ATTR = "data-peek-handoff-pending";
// En <html> mientras las piezas de la vista previa van a las de la ficha: las
// de la ficha están ocultas (`visibility`, no `opacity`, que mataría el
// cristal de los botones) para no verse dobles a través de la tarjeta.
export const PEEK_HANDOFF_ACTIVE_ATTR = "data-peek-handoff-active";

// ¿Lleva `href` a una ficha de película o serie (DetailsClient), que tiene
// pareja para cada pieza?
export function peekHrefKeepsParts(href) {
  try {
    return /^\/details\/(movie|tv)\/[^/]+\/?$/.test(
      new URL(href, window.location.origin).pathname,
    );
  } catch {
    return false;
  }
}

const PEEK_MORPH_MS = 420;
const PEEK_MORPH_CURVE = [0.22, 1, 0.36, 1];
const PEEK_MORPH_EASING = `cubic-bezier(${PEEK_MORPH_CURVE.join(", ")})`;
const PEEK_SETTLE_MS = 260;
// Fotogramas clave por trayectoria de pieza (ver `flightKeyframes`).
const FLIGHT_STEPS = 24;

// La curva de la tarjeta evaluada aquí, para muestrear las piezas con ella.
function cubicBezier([x1, y1, x2, y2]) {
  const coord = (p1, p2, t) =>
    3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  return (x) => {
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 30; i += 1) {
      const value = coord(x1, x2, t);
      if (Math.abs(value - x) < 1e-5) break;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return coord(y1, y2, t);
  };
}
const morphEase = cubicBezier(PEEK_MORPH_CURVE);

// Caja de la IMAGEN entera de la portada de la tarjeta, sin transformar. La
// portada simple es un póster 2:3 en `object-cover` centrado en una caja algo
// más baja: la imagen sobresale (recortada) lo mismo por arriba que por abajo.
// La compuesta (episodios) llena su caja.
function peekImageBox(card, cover, { fullPoster }) {
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height || window.innerHeight;
  const width = card.offsetWidth;
  const cardTop = (vh - card.offsetHeight) / 2;
  const coverTop = cardTop + cover.offsetTop - card.scrollTop;
  const coverHeight = cover.offsetHeight;
  const imageHeight = fullPoster
    ? Math.max(coverHeight, width * 1.5)
    : coverHeight;
  return {
    vw,
    cx: vw / 2,
    cy: cardTop + card.offsetHeight / 2,
    width,
    top: coverTop - (imageHeight - coverHeight) / 2,
  };
}

// Transformación (con origen en el centro de la tarjeta, como la suya) que
// lleva la imagen de la portada a `left/top/width`.
function cardTransformTo(box, { left, top, width }) {
  const scale = width / box.width;
  const tx = left + width / 2 - box.cx;
  const ty = top - (box.cy + scale * (box.top - box.cy));
  return { scale, tx, ty, css: `translate(${tx}px, ${ty}px) scale(${scale})` };
}

// La transformación actual de la tarjeta, siempre traslación + escala.
function currentCardTransform(card) {
  const raw = window.getComputedStyle(card).transform;
  const m = raw && raw !== "none" ? new DOMMatrixReadOnly(raw) : null;
  const scale = m?.a || 1;
  const tx = m?.e || 0;
  const ty = m?.f || 0;
  return { scale, tx, ty, css: `translate(${tx}px, ${ty}px) scale(${scale})` };
}

/* ---------------------------- Piezas ---------------------------- */
// Piezas que viajan en el relevo en curso.
const flyingParts = new WeakSet();

// Lo que se mide de una pieza: el logo es una franja a todo el ancho con el
// logo centrado; cuenta la imagen (o el título), no la franja.
const partMeasureNode = (node, name) =>
  name === "logo" ? node.firstElementChild || node : node;

// El marcador de la ficha es más bajo (compacto, sin la barra de stats): se
// alinea por arriba; lo demás, por el centro.
const partAlign = (name) => (name === "scoreboard" ? "top" : "center");

// Caja de `node` en pantalla con la tarjeta y él sin transformar, sacada del
// layout (desplazamientos hasta la tarjeta), no deshaciendo transformaciones:
// así sirve igual al tocar que al final, con todo a medio animar, y sigue a
// la tarjeta si su contenido cambia de alto entre medias.
function untransformedRect(node, card) {
  let x = 0;
  let y = 0;
  let current = node;
  while (current && current !== card) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent;
  }
  if (current !== card) return null;
  const vh = window.visualViewport?.height || window.innerHeight;
  return {
    left: (window.innerWidth - card.offsetWidth) / 2 + x,
    top: (vh - card.offsetHeight) / 2 + y - card.scrollTop,
    width: node.offsetWidth,
    height: node.offsetHeight,
  };
}

// Transformación de la pieza (origen en su centro) que, dentro de la tarjeta
// transformada con `cardT`, la deja en pantalla en `to`: centrada en ella y
// con su ancho. `align: "top"` alinea el borde de arriba en vez del centro.
function partTransformTo(rect, to, box, cardT, { align = "center" } = {}) {
  const k = to.width / (rect.width * cardT.scale);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const toCx = to.left + to.width / 2;
  const toCy =
    align === "top"
      ? to.top + (rect.height * k * cardT.scale) / 2
      : to.top + to.height / 2;
  const dx = (toCx - cardT.tx - box.cx) / cardT.scale + box.cx - cx;
  const dy = (toCy - cardT.ty - box.cy) / cardT.scale + box.cy - cy;
  return `translate(${dx}px, ${dy}px) scale(${k})`;
}

// Fotogramas clave de una pieza que va en pantalla de `from` a `to` mientras
// la tarjeta va de `cardFrom` a `cardTo`, las dos con la curva del relevo. Con
// solo dos fotogramas la pieza se interpola dentro de una tarjeta que también
// se interpola y la suma hace un arco (se desvía y vuelve); muestreada, va
// recta. Entre muestras, lineal (`easing: "linear"` en la animación).
function flightKeyframes(layout, from, to, box, cardFrom, cardTo, options) {
  const frames = [];
  for (let i = 0; i <= FLIGHT_STEPS; i += 1) {
    const p = morphEase(i / FLIGHT_STEPS);
    const lerp = (a, b) => a + (b - a) * p;
    const cardT = {
      scale: lerp(cardFrom.scale, cardTo.scale),
      tx: lerp(cardFrom.tx, cardTo.tx),
      ty: lerp(cardFrom.ty, cardTo.ty),
    };
    const screen = {
      left: lerp(from.left, to.left),
      top: lerp(from.top, to.top),
      width: lerp(from.width, to.width),
      height: lerp(from.height, to.height),
    };
    frames.push({
      offset: i / FLIGHT_STEPS,
      transform: partTransformTo(layout, screen, box, cardT, options),
    });
  }
  return frames;
}

function cancelTransformAnimations(node) {
  node.getAnimations().forEach((animation) => {
    if (animation.effect?.getKeyframes?.().some((frame) => frame.transform)) {
      animation.cancel();
    }
  });
}

// Dónde pinta la ficha cada pieza, por tamaño de pantalla: logo, botones y
// marcador van a la misma distancia del navbar inferior en cualquier ficha
// (ver useMobileDetailsHero con `fitCover`). Del logo se guarda el pie, el
// centro y sus límites, porque su tamaño depende de su proporción.
const PART_TARGETS_KEY = "sv:peek-handoff-parts:v1";
const viewportKey = () =>
  `${window.innerWidth}x${Math.round(window.visualViewport?.height || window.innerHeight)}`;

function readPartTargets() {
  try {
    const all = JSON.parse(window.sessionStorage.getItem(PART_TARGETS_KEY) || "{}");
    return all[viewportKey()] || null;
  } catch {
    return null;
  }
}

function rememberPartTargets(targets) {
  try {
    const all = JSON.parse(window.sessionStorage.getItem(PART_TARGETS_KEY) || "{}");
    all[viewportKey()] = targets;
    window.sessionStorage.setItem(PART_TARGETS_KEY, JSON.stringify(all));
  } catch {
    // Sin almacenamiento: la próxima vez las piezas esperan quietas.
  }
}

// Límite de tamaño (`max-width`/`max-height`) en px; los porcentajes, sobre
// `base`.
function cssLimit(value, base) {
  if (!value || value === "none") return Infinity;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return Infinity;
  return value.endsWith("%") ? (n / 100) * base : n;
}

function measurePartTarget(name, pair) {
  const measured = partMeasureNode(pair, name);
  const rect = measured.getBoundingClientRect();
  const box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  if (name !== "logo" || measured.tagName !== "IMG") return box;
  const style = window.getComputedStyle(measured);
  const strip = window.getComputedStyle(pair);
  const inner =
    pair.clientWidth - parseFloat(strip.paddingLeft) - parseFloat(strip.paddingRight);
  return {
    ...box,
    image: {
      bottom: rect.bottom,
      cx: rect.left + rect.width / 2,
      maxWidth: cssLimit(style.maxWidth, inner),
      maxHeight: cssLimit(style.maxHeight, 0),
    },
  };
}

// Caja prevista para la pieza `name`, que en la tarjeta mide `screen`.
function predictPartTarget(name, screen, measured, targets) {
  const target = targets?.[name];
  if (!target) return null;
  if (name !== "logo") return target;
  // El logo: imagen en las dos, con su proporción y los límites de la ficha.
  if (!target.image || measured.tagName !== "IMG" || !screen.height) return null;
  const ratio = screen.width / screen.height;
  const width = Math.min(target.image.maxWidth, target.image.maxHeight * ratio);
  if (!Number.isFinite(width) || width <= 0) return null;
  const height = width / ratio;
  return {
    left: target.image.cx - width / 2,
    top: target.image.bottom - height,
    width,
    height,
  };
}

// Primer tramo, en el fotograma del toque: la portada crece a la cabecera de
// la ficha (todo el ancho con su sobrebarrido, pegada arriba), las esquinas se
// enderezan, las piezas (`parts`) van a donde las pintará la ficha (o se
// quedan quietas si aún no se sabe) y lo demás de la tarjeta (`fadeNodes`) se
// desvanece.
export function morphPeekCard(card, cover, { parts = [], fadeNodes = [], overscan = 1, fullPoster = true, reduceMotion = false } = {}) {
  if (!card || !cover || typeof card.animate !== "function") return;
  const current = window.getComputedStyle(card);
  const fromCard = currentCardTransform(card);
  const fromOpacity = current.opacity;
  const box = peekImageBox(card, cover, { fullPoster });
  // Medidas antes de cancelar nada: la tarjeta puede estar aún entrando.
  const liveParts = (reduceMotion ? [] : parts.filter(Boolean)).flatMap((node) => {
    const name = node.getAttribute("data-peek-part");
    const animated = partMeasureNode(node, name);
    const layout = untransformedRect(animated, card);
    if (!layout) return [];
    flyingParts.add(node);
    return [{ name, animated, layout, screen: animated.getBoundingClientRect() }];
  });
  card.getAnimations().forEach((animation) => animation.cancel());
  card.style.pointerEvents = "none";
  const fading = reduceMotion ? [...fadeNodes, ...parts] : fadeNodes;
  for (const node of fading) {
    node?.animate?.([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduceMotion ? 120 : 160,
      easing: "ease-out",
      fill: "forwards",
    });
  }
  if (reduceMotion) return;
  // Las piezas salen de la caja de la tarjeta y de la portada al volar a la
  // ficha: sin recorte. Con la tarjeta desplazada (pantallas bajas) se
  // quedaría sin su scroll y saltaría: ahí se recortan.
  if (liveParts.length && card.scrollTop === 0) {
    card.style.overflow = "visible";
    cover.style.overflow = "visible";
  }
  const width = box.vw * overscan;
  const to = cardTransformTo(box, { left: (box.vw - width) / 2, top: 0, width });
  card.animate(
    [
      { transform: fromCard.css, opacity: fromOpacity, borderRadius: current.borderRadius },
      { transform: to.css, opacity: 1, borderRadius: "0px" },
    ],
    { duration: PEEK_MORPH_MS, easing: PEEK_MORPH_EASING, fill: "forwards" },
  );
  const targets = readPartTargets();
  for (const { name, animated, layout, screen } of liveParts) {
    const goal = predictPartTarget(name, screen, animated, targets) || screen;
    cancelTransformAnimations(animated);
    animated.animate(
      flightKeyframes(layout, screen, goal, box, fromCard, to, { align: partAlign(name) }),
      { duration: PEEK_MORPH_MS, easing: "linear", fill: "forwards" },
    );
  }
}

// Último tramo, con la ficha ya en pantalla: la tarjeta se ajusta a la caja
// real de su portada (en temporadas y episodios va bajo el navbar, y la
// estimación del primer tramo no lo sabe) y cada pieza, a la de su pareja en
// la ficha. Devuelve cuánto tardan en llegar (ms; 0 si nada se mueve): la
// vista previa programa su desvanecido con ese retardo en el compositor, sin
// esperar al hilo principal, que la ficha recién montada tiene ocupado.
export function settlePeekCard(card, cover, target, { fullPoster = true, reduceMotion = false } = {}) {
  if (!card || !cover || reduceMotion) return 0;
  if (typeof card.animate !== "function") return 0;
  const box = peekImageBox(card, cover, { fullPoster });
  const rect = target?.getBoundingClientRect();
  const fromCard = currentCardTransform(card);
  const cardT = rect?.width
    ? cardTransformTo(box, { left: rect.left, top: rect.top, width: rect.width })
    : fromCard;
  // Las piezas, desde donde estén (el primer tramo puede no haber acabado).
  const flights = [];
  const targets = {};
  for (const node of card.querySelectorAll("[data-peek-part]")) {
    const name = node.getAttribute("data-peek-part");
    const pair = flyingParts.has(node) && findPeekHandoffPart(name);
    const pairRect = pair && partMeasureNode(pair, name).getBoundingClientRect();
    if (!pairRect?.width) continue;
    const animated = partMeasureNode(node, name);
    const layout = untransformedRect(animated, card);
    if (!layout) continue;
    targets[name] = measurePartTarget(name, pair);
    const from = animated.getBoundingClientRect();
    flights.push({
      animated,
      frames: flightKeyframes(layout, from, pairRect, box, fromCard, cardT, {
        align: partAlign(name),
      }),
    });
  }
  if (flights.length) rememberPartTargets({ ...readPartTargets(), ...targets });
  if (rect?.width) {
    cancelTransformAnimations(card);
    card.animate(
      [
        { transform: fromCard.css, borderRadius: "0px" },
        { transform: cardT.css, borderRadius: "0px" },
      ],
      { duration: PEEK_SETTLE_MS, easing: PEEK_MORPH_EASING, fill: "forwards" },
    );
  }
  for (const { animated, frames } of flights) {
    cancelTransformAnimations(animated);
    animated.animate(frames, { duration: PEEK_SETTLE_MS, easing: "linear", fill: "forwards" });
  }
  return rect?.width || flights.length ? PEEK_SETTLE_MS : 0;
}

// Primer nodo a la vista que cumple `selector`, fuera de la vista previa (que
// también pinta portadas) y de las pantallas ocultas de la pila.
function findVisible(selector) {
  for (const node of document.querySelectorAll(selector)) {
    if (node.closest("[data-sv-no-peek]")) continue;
    if (node.getClientRects().length === 0) continue;
    return node;
  }
  return null;
}

// Caja de la portada de la ficha a la vista.
export function findPeekHandoffTarget() {
  return findVisible(`[${PEEK_HANDOFF_TARGET_ATTR}]`);
}

// Pareja en la ficha de la pieza `name` de la vista previa.
export function findPeekHandoffPart(name) {
  return findVisible(
    `[${PEEK_HANDOFF_PART_ATTR}="${name}"]:not([${PEEK_HANDOFF_PENDING_ATTR}])`,
  );
}

// ¿Tiene ya la ficha a la vista sus piezas pintadas? Una ficha que no lo
// marca (temporadas, episodios) cuenta como lista.
export function peekHandoffPartsReady() {
  const root = findVisible(`[${PEEK_HANDOFF_READY_ATTR}]`);
  if (!root) return true;
  return (
    root.getAttribute(PEEK_HANDOFF_READY_ATTR) === "true" &&
    !findVisible(`[${PEEK_HANDOFF_PENDING_ATTR}]`)
  );
}
