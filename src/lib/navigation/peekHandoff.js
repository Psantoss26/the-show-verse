// /src/lib/navigation/peekHandoff.js
// RELEVO DE LA VISTA PREVIA MÓVIL A LA FICHA (MobileTitlePeek →
// DetailsClient, temporadas, episodios).
//
// Al tocar la portada de la vista previa, la tarjeta flotante se convierte en
// el mismo fotograma en la cabecera de la ficha: crece hasta el ancho de la
// pantalla y su portada se coloca donde la pintará la ficha (pegada arriba,
// ver MobileHeroCover), mientras lo demás de la tarjeta se desvanece. La
// ficha carga debajo y, cuando su portada está en pantalla, la tarjeta se
// ajusta a ella al píxel (`settlePeekCard`) y se desvanece encima: como las
// dos portadas son la misma imagen en el mismo sitio, el cambio no se ve.
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
  return `translate(${tx}px, ${ty}px) scale(${scale})`;
}

// Primer tramo, en el fotograma del toque: la portada crece a la cabecera de
// la ficha (todo el ancho con su sobrebarrido, pegada arriba), las esquinas se
// enderezan y lo demás de la tarjeta (`fadeNodes`) se desvanece.
export function morphPeekCard(card, cover, { fadeNodes = [], overscan = 1, fullPoster = true, reduceMotion = false } = {}) {
  if (!card || !cover || typeof card.animate !== "function") return;
  const current = window.getComputedStyle(card);
  const from = current.transform === "none" ? "none" : current.transform;
  const fromOpacity = current.opacity;
  card.getAnimations().forEach((animation) => animation.cancel());
  card.style.pointerEvents = "none";
  for (const node of fadeNodes) {
    node?.animate?.([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduceMotion ? 120 : 160,
      easing: "ease-out",
      fill: "forwards",
    });
  }
  if (reduceMotion) return;
  const box = peekImageBox(card, cover, { fullPoster });
  const width = box.vw * overscan;
  const to = cardTransformTo(box, { left: (box.vw - width) / 2, top: 0, width });
  card.animate(
    [
      { transform: from, opacity: fromOpacity, borderRadius: current.borderRadius },
      { transform: to, opacity: 1, borderRadius: "0px" },
    ],
    { duration: PEEK_MORPH_MS, easing: PEEK_MORPH_EASING, fill: "forwards" },
  );
}

// Último tramo, con la ficha ya en pantalla: la tarjeta se ajusta a la caja
// real de su portada (en temporadas y episodios va bajo el navbar, y la
// estimación del primer tramo no lo sabe).
export function settlePeekCard(card, cover, target, { fullPoster = true, reduceMotion = false } = {}) {
  if (!card || !cover || !target || reduceMotion) return;
  if (typeof card.animate !== "function") return;
  const rect = target.getBoundingClientRect();
  if (!rect.width) return;
  const box = peekImageBox(card, cover, { fullPoster });
  const from = window.getComputedStyle(card).transform;
  const to = cardTransformTo(box, { left: rect.left, top: rect.top, width: rect.width });
  card.getAnimations().forEach((animation) => {
    if (animation.effect?.getKeyframes?.().some((frame) => frame.transform)) {
      animation.cancel();
    }
  });
  card.animate(
    [
      { transform: from, borderRadius: "0px" },
      { transform: to, borderRadius: "0px" },
    ],
    { duration: PEEK_SETTLE_MS, easing: PEEK_MORPH_EASING, fill: "forwards" },
  );
}

// Caja de la portada de la ficha a la vista, fuera de la vista previa (que
// también pinta portadas) y de las pantallas ocultas de la pila.
export function findPeekHandoffTarget() {
  for (const node of document.querySelectorAll(`[${PEEK_HANDOFF_TARGET_ATTR}]`)) {
    if (node.closest("[data-sv-no-peek]")) continue;
    if (node.getClientRects().length === 0) continue;
    return node;
  }
  return null;
}
