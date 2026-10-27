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
// crece la portada se quedan quietas en pantalla y, con la ficha lista, vuelan
// a la caja de su pareja en la ficha (`PEEK_HANDOFF_PART_ATTR`). La ficha las
// pinta ya sin su animación de entrada, así que al desvanecerse la vista
// previa no se ven desaparecer ni volver a entrar. Si una pieza no tiene
// pareja (temporadas, episodios), se desvanece al tocar, como antes.
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
}

export function endPeekHandoff() {
  pending = null;
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

export const PEEK_MORPH_MS = 420;
export const PEEK_MORPH_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const PEEK_SETTLE_MS = 260;

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

/* ---------------------------- Piezas ---------------------------- */
// Caja de cada pieza SIN transformar (ni la tarjeta ni ella), en pantalla.
// Se toma al tocar y se reutiliza al final: entonces todo está transformado.
const partRects = new WeakMap();

// Lo que se mide de una pieza: el logo es una franja a todo el ancho con el
// logo centrado; cuenta la imagen (o el título), no la franja.
const partMeasureNode = (node, name) =>
  name === "logo" ? node.firstElementChild || node : node;

// Caja de `node` en la tarjeta sin transformar. La transformación de la
// tarjeta es siempre traslación + escala con origen en su centro (`box`).
function untransformedRect(node, card, box) {
  const rect = node.getBoundingClientRect();
  const raw = window.getComputedStyle(card).transform;
  const m = raw && raw !== "none" ? new DOMMatrixReadOnly(raw) : null;
  const a = m?.a || 1;
  const e = m?.e || 0;
  const f = m?.f || 0;
  const left = box.cx + (rect.left - box.cx - e) / a;
  const top = box.cy + (rect.top - box.cy - f) / a;
  return { left, top, width: rect.width / a, height: rect.height / a };
}

// Transformación de la pieza (origen en su centro) que, dentro de la tarjeta
// transformada con `cardT`, la deja en pantalla en `to`: centrada en ella y
// con su ancho. `align: "top"` alinea el borde de arriba en vez del centro
// (el marcador de la ficha es más bajo: compacto, sin la barra de stats).
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

function cancelTransformAnimations(node) {
  node.getAnimations().forEach((animation) => {
    if (animation.effect?.getKeyframes?.().some((frame) => frame.transform)) {
      animation.cancel();
    }
  });
}

// Primer tramo, en el fotograma del toque: la portada crece a la cabecera de
// la ficha (todo el ancho con su sobrebarrido, pegada arriba), las esquinas se
// enderezan, las piezas (`parts`) se quedan quietas en pantalla y lo demás de
// la tarjeta (`fadeNodes`) se desvanece.
export function morphPeekCard(card, cover, { parts = [], fadeNodes = [], overscan = 1, fullPoster = true, reduceMotion = false } = {}) {
  if (!card || !cover || typeof card.animate !== "function") return;
  const current = window.getComputedStyle(card);
  const from = current.transform === "none" ? "none" : current.transform;
  const fromOpacity = current.opacity;
  const box = peekImageBox(card, cover, { fullPoster });
  const liveParts = reduceMotion ? [] : parts.filter(Boolean);
  // Medidas antes de cancelar nada: la tarjeta puede estar aún entrando.
  for (const node of liveParts) {
    const measured = partMeasureNode(node, node.getAttribute("data-peek-part"));
    partRects.set(node, {
      layout: untransformedRect(measured, card, box),
      screen: measured.getBoundingClientRect(),
    });
  }
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
      { transform: from, opacity: fromOpacity, borderRadius: current.borderRadius },
      { transform: to.css, opacity: 1, borderRadius: "0px" },
    ],
    { duration: PEEK_MORPH_MS, easing: PEEK_MORPH_EASING, fill: "forwards" },
  );
  for (const node of liveParts) {
    const { layout, screen } = partRects.get(node);
    const animated = partMeasureNode(node, node.getAttribute("data-peek-part"));
    cancelTransformAnimations(animated);
    animated.animate(
      [{ transform: "none" }, { transform: partTransformTo(layout, screen, box, to) }],
      { duration: PEEK_MORPH_MS, easing: PEEK_MORPH_EASING, fill: "forwards" },
    );
  }
}

// Último tramo, con la ficha ya en pantalla: la tarjeta se ajusta a la caja
// real de su portada (en temporadas y episodios va bajo el navbar, y la
// estimación del primer tramo no lo sabe) y cada pieza vuela a la de su
// pareja en la ficha. Devuelve cuánto dura (ms) si alguna pieza vuela: la
// vista previa no debe desvanecerse hasta que lleguen, o se verían dobles.
export function settlePeekCard(card, cover, target, { fullPoster = true, reduceMotion = false } = {}) {
  if (!card || !cover || reduceMotion) return 0;
  if (typeof card.animate !== "function") return 0;
  const box = peekImageBox(card, cover, { fullPoster });
  const rect = target?.getBoundingClientRect();
  const fromCard = window.getComputedStyle(card).transform;
  const raw = fromCard && fromCard !== "none" ? new DOMMatrixReadOnly(fromCard) : null;
  const cardT = rect?.width
    ? cardTransformTo(box, { left: rect.left, top: rect.top, width: rect.width })
    : { scale: raw?.a || 1, tx: raw?.e || 0, ty: raw?.f || 0, css: fromCard };
  // Las piezas, desde donde estén (el primer tramo puede no haber acabado).
  const flights = [];
  for (const node of card.querySelectorAll("[data-peek-part]")) {
    const measured = partRects.get(node);
    const name = node.getAttribute("data-peek-part");
    const pair = measured && findPeekHandoffPart(name);
    const pairRect = pair && partMeasureNode(pair, name).getBoundingClientRect();
    if (!pairRect?.width) continue;
    const animated = partMeasureNode(node, name);
    flights.push({
      animated,
      from: window.getComputedStyle(animated).transform,
      to: partTransformTo(measured.layout, pairRect, box, cardT, {
        align: name === "scoreboard" ? "top" : "center",
      }),
    });
  }
  if (rect?.width) {
    cancelTransformAnimations(card);
    card.animate(
      [
        { transform: fromCard, borderRadius: "0px" },
        { transform: cardT.css, borderRadius: "0px" },
      ],
      { duration: PEEK_SETTLE_MS, easing: PEEK_MORPH_EASING, fill: "forwards" },
    );
  }
  for (const { animated, from, to } of flights) {
    cancelTransformAnimations(animated);
    animated.animate([{ transform: from }, { transform: to }], {
      duration: PEEK_SETTLE_MS,
      easing: PEEK_MORPH_EASING,
      fill: "forwards",
    });
  }
  return flights.length ? PEEK_SETTLE_MS : 0;
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
