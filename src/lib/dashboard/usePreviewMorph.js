"use client";

// /src/lib/dashboard/usePreviewMorph.js
// Apertura y cierre de las vistas previa (hover) de los dashboards al estilo
// Prime Video: la TARJETA crece hasta la vista previa y vuelve a encogerse
// hasta ella, sin fundidos cruzados.
//
// Antes la tarjeta se desvanecía mientras la vista previa, ya a tamaño final,
// aparecía encima con `opacity` 0 → 1: durante la transición se veían las dos
// imágenes superpuestas (doble imagen) y las tarjetas vecinas a través de la
// vista previa. Además el cristal no desenfocaba nada hasta acabar, porque
// `opacity` en un ancestro apaga el `backdrop-filter` de sus hijos.
//
// Ahora todo es un único movimiento continuo:
//   1. La vista previa arranca EXACTAMENTE encima de la tarjeta: un `transform`
//      (traslación + escala uniforme) lleva su zona de imagen al rectángulo de
//      la tarjeta.
//   2. La imagen se ve a través de una VENTANA que se ensancha (póster vertical
//      → imagen apaisada) y el cristal se despliega desde esa zona hasta la
//      tarjeta completa con la info.
//   3. Encima de la imagen se pinta una COPIA de la tarjeta (su DOM clonado),
//      que se funde mientras crece. El primer fotograma es idéntico a la
//      tarjeta aunque la vista previa use otro recorte o una máscara inferior.
//   4. La info aparece debajo cuando el cristal ya la cubre.
//   5. Al cerrar se recorre el camino inverso DESDE donde esté la animación, así
//      que un cierre a mitad de la apertura, o una reapertura a mitad del
//      cierre, no salta. Al terminar el cierre la vista previa coincide con la
//      tarjeta y se desmonta sin que se note.
//
// SOLO `transform` y `opacity` (medido en Chromium). Con el hilo principal
// ocupado —justo lo que pasa al montar la vista previa, que es un componente
// pesado— una animación de `transform` sigue avanzando en el compositor, pero
// una de `clip-path` se congela (~85 ms en la medición) y luego salta. La
// primera versión desplegaba con `clip-path`: en las tarjetas apaisadas el
// movimiento principal era el escalado y se veía fluido, pero en las de póster
// (escala 1, todo el despliegue era recorte) daba tirones. Por eso:
//   - la ventana de la imagen es un `scaleX` con su contenido a escala INVERSA
//     (el contenido no se deforma, solo se descubre),
//   - el cristal es una capa lisa (tinte + desenfoque) que simplemente escala,
//   - y como ninguna de las dos curvas (escala y su inversa) es lineal, los
//     fotogramas clave se MUESTREAN de la curva de easing y se interpolan en
//     lineal entre muestras. El radio de las esquinas se corrige en esos mismos
//     fotogramas para que no se deforme con la escala.
// Ni recortes ni opacidad en ancestros del cristal: sigue desenfocando en cada
// fotograma (un `clip-path` o una `opacity` en el padre lo apagan; un
// `transform` no).
//
// MARCADO que espera el hook:
//   - `[data-preview-tile]`: la caja de la tarjeta (ancestro de la vista previa).
//   - `[data-preview-tile-art]`: lo que se ve de la tarjeta (se clona), fuera
//     de la vista previa.
//   - Dentro de la vista previa (`cardRef`): `[data-preview-glass]` y
//     `[data-preview-shadow]` (los pinta `<DashboardPreviewGlass surface />`),
//     `[data-preview-media]` (la ventana de la imagen, con `overflow-hidden`),
//     `[data-preview-media-inner]` (su contenido, `absolute inset-0`) y
//     `[data-preview-info]` (la info).
//
// Tiene que montarse dentro de un <AnimatePresence>: retiene el desmontaje con
// `usePresence` hasta que termina el cierre.

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePresence } from "framer-motion";
import {
  DASHBOARD_PREVIEW_ENTER_TRANSITION,
  DASHBOARD_PREVIEW_EXIT_TRANSITION,
} from "@/lib/dashboard/previewTiming";

// Mismo contrato de movimiento que el resto de vistas previa del dashboard (y
// que el empuje de las tarjetas vecinas en las filas de pósters).
const ENTER_MS = DASHBOARD_PREVIEW_ENTER_TRANSITION.duration * 1000;
const EXIT_MS = DASHBOARD_PREVIEW_EXIT_TRANSITION.duration * 1000;
const ENTER_EASE = DASHBOARD_PREVIEW_ENTER_TRANSITION.ease;
const EXIT_EASE = DASHBOARD_PREVIEW_EXIT_TRANSITION.ease;
const MORPH_ID = "sv-preview-morph";
// Una muestra cada ~16 ms: entre muestras el error de la escala inversa es
// inferior a medio píxel.
const SAMPLE_MS = 16;

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// Curva cúbica de Bézier como la de CSS (x = tiempo, y = progreso).
function bezier([x1, y1, x2, y2]) {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) break;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Si Newton no converge, bisección.
    if (t < 0 || t > 1 || Math.abs(sampleX(t) - x) > 1e-4) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 30; i += 1) {
        const v = sampleX(t);
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return sampleY(t);
  };
}

const ENTER_CURVE = bezier(ENTER_EASE);
const EXIT_CURVE = bezier(EXIT_EASE);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, e) => a + (b - a) * e;
const smooth = (v) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

// Geometría del estado "tarjeta" en coordenadas LOCALES de la vista previa (las
// de su caja sin transformar).
function measure(card, media, tileArt, alignment, tileRadius, finalScale) {
  const W = card.offsetWidth;
  const H = card.offsetHeight;
  const imageH = media.offsetHeight;
  if (!W || !H || !imageH) return null;

  const cardRect = card.getBoundingClientRect();
  const tileRect = tileArt.getBoundingClientRect();
  if (!tileRect.width || !tileRect.height) return null;

  // La imagen de la vista previa se ajusta al ALTO de la tarjeta; el ancho que
  // le corresponde se descubre según hacia dónde se abre la vista previa.
  const scale = tileRect.height / imageH;
  const regionW = Math.min(W, tileRect.width / scale);
  const regionX =
    alignment === "left" ? 0 : alignment === "right" ? W - regionW : (W - regionW) / 2;

  // Escala FINAL distinta de 1: crece desde el centro de su imagen, en el lado
  // por el que se alinea (el mismo origen que tenía la escala de Framer).
  const anchorX = alignment === "left" ? 0 : alignment === "right" ? W : W / 2;
  const anchorY = imageH / 2;

  return {
    W,
    H,
    imageH,
    regionX,
    regionW,
    tileRect,
    tileRadius,
    finalRadius: parseFloat(getComputedStyle(card).borderTopLeftRadius) || 12,
    from: {
      x: tileRect.left - cardRect.left - scale * regionX,
      y: tileRect.top - cardRect.top,
      s: scale,
    },
    to: {
      x: anchorX * (1 - finalScale),
      y: anchorY * (1 - finalScale),
      s: finalScale,
    },
    settleTransform:
      finalScale === 1
        ? null
        : `translate(${anchorX * (1 - finalScale)}px, ${anchorY * (1 - finalScale)}px) scale(${finalScale})`,
  };
}

// Estilos de cada capa para un progreso `e` (0 = tarjeta, 1 = vista previa).
function frameAt(g, e) {
  const s = lerp(g.from.s, g.to.s, e);
  const x = lerp(g.from.x, g.to.x, e);
  const y = lerp(g.from.y, g.to.y, e);
  const left = g.regionX * (1 - e);
  const winW = lerp(g.regionW, g.W, e);
  const kx = winW / g.W;
  const glassH = lerp(g.imageH, g.H, e);
  const ky = glassH / g.H;
  // Radios en píxeles de PANTALLA: los de la tarjeta al principio, los de la
  // vista previa al final. Se pasan a locales deshaciendo cada escala para que
  // las esquinas sigan siendo circulares mientras la capa está deformada.
  const top = lerp(g.tileRadius, g.finalRadius * g.to.s, e);
  const bottom = lerp(g.tileRadius, 0, e);
  const rx = (r) => `${r / (s * kx)}px`;
  const ryMedia = (r) => `${r / s}px`;
  const ryGlass = (r) => `${r / (s * ky)}px`;
  const mediaRadius = `${rx(top)} ${rx(top)} ${rx(bottom)} ${rx(bottom)} / ${ryMedia(top)} ${ryMedia(top)} ${ryMedia(bottom)} ${ryMedia(bottom)}`;
  const glassRadius = `${rx(top)} ${rx(top)} ${rx(top)} ${rx(top)} / ${ryGlass(top)} ${ryGlass(top)} ${ryGlass(top)} ${ryGlass(top)}`;
  const info = smooth((e - 0.5) / 0.5);

  return {
    card: { transform: `translate(${x}px, ${y}px) scale(${s})` },
    glass: {
      transform: `translate(${left}px, 0px) scale(${kx}, ${ky})`,
      borderRadius: glassRadius,
    },
    media: {
      transform: `translate(${left}px, 0px) scaleX(${kx})`,
      borderRadius: mediaRadius,
    },
    // Escala inversa: el contenido queda quieto en pantalla mientras la
    // ventana se abre a su alrededor.
    inner: { transform: `scaleX(${1 / kx}) translateX(${-left}px)` },
    ghost: { opacity: 1 - smooth(e / 0.55) },
    info: { opacity: info, transform: `translateY(${(1 - info) * -6}px)` },
    shadow: { opacity: smooth((e - 0.3) / 0.7) },
  };
}

const PART_KEYS = ["card", "glass", "media", "inner", "ghost", "info", "shadow"];

// Animación principal (el `transform` de la carcasa) de la vista previa que
// cuelga de `tile`, si se está abriendo o cerrando. `useNeighborPush` arranca el
// empuje de las vecinas con su misma `startTime`.
export function getPreviewMorphLead(tile) {
  const card = tile?.querySelector("[data-preview-glass]")?.parentElement;
  if (!card) return null;
  return (
    card
      .getAnimations()
      .find(
        (a) =>
          a.id === MORPH_ID &&
          a.playState !== "finished" &&
          "transform" in (a.effect?.getKeyframes?.()[0] || {}),
      ) || null
  );
}
const STYLE_PROPS = ["transform", "opacity", "border-radius", "transform-origin"];

function cancelMorph(el) {
  if (!el) return;
  for (const running of el.getAnimations()) {
    if (running.id === MORPH_ID) running.cancel();
  }
}

// Progreso actual de la animación en curso (o del estado en reposo).
function currentProgress(state) {
  const run = state.run;
  if (!run) return state.open ? 1 : 0;
  const t = run.duration ? clamp01((run.lead.currentTime ?? 0) / run.duration) : 1;
  return lerp(run.e0, run.e1, run.curve(t));
}

// Anima todas las capas de `e0` a `e1` con fotogramas muestreados de `curve`.
function runMorph(state, e0, e1, duration, curve) {
  const { parts, geometry } = state;
  const steps = Math.max(1, Math.round(duration / SAMPLE_MS));
  const frames = Object.fromEntries(PART_KEYS.map((k) => [k, []]));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const f = frameAt(geometry, lerp(e0, e1, curve(t)));
    for (const k of PART_KEYS) frames[k].push({ ...f[k], offset: t });
  }

  // El radio va en una animación APARTE. Chrome solo compone una animación si
  // TODAS sus propiedades son componibles: con `border-radius` en los mismos
  // fotogramas, el `transform` del cristal y de la ventana volvía al hilo
  // principal (medido: arrancaban fotograma y medio por detrás de las vecinas,
  // y quedaban expuestos a los tirones del montaje). Así el movimiento va
  // entero en el compositor y solo la forma de las esquinas depende del hilo
  // principal.
  const timing = { duration: Math.max(duration, 1), easing: "linear", fill: "both" };
  let lead = null;
  for (const k of PART_KEYS) {
    const el = parts[k];
    if (!el) continue;
    cancelMorph(el);
    const motion = frames[k].map(({ borderRadius, ...rest }) => rest);
    const animation = el.animate(motion, timing);
    animation.id = MORPH_ID;
    if (k === "card") lead = animation;
    if (frames[k][0].borderRadius !== undefined) {
      const shape = el.animate(
        frames[k].map(({ borderRadius, offset }) => ({ borderRadius, offset })),
        timing,
      );
      shape.id = MORPH_ID;
    }
  }
  state.run = { lead, e0, e1, duration, curve };
  return lead;
}

// Copia inerte de la tarjeta, colocada sobre la zona de imagen del estado
// inicial (en el espacio del contenido de la ventana, que no se deforma). Con
// la escala inversa de la tarjeta mide en pantalla lo mismo que ella.
function createGhost(tileArt, geometry) {
  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.dataset.previewGhost = "";
  Object.assign(ghost.style, {
    position: "absolute",
    left: `${geometry.regionX}px`,
    top: "0px",
    width: `${geometry.tileRect.width}px`,
    height: `${geometry.tileRect.height}px`,
    transform: `scale(${1 / geometry.from.s})`,
    transformOrigin: "0 0",
    pointerEvents: "none",
    zIndex: "6",
  });
  const clone = tileArt.cloneNode(true);
  clone.removeAttribute("data-preview-tile-art");
  clone.style.removeProperty("visibility");
  for (const el of [clone, ...clone.querySelectorAll("[id]")]) el.removeAttribute("id");
  // Las imágenes clonadas son elementos NUEVOS: con `decoding="async"` (el de
  // next/image) Chrome puede pintar el primer fotograma sin ellas aunque estén
  // en caché, y durante un fotograma se veía el cristal vacío en lugar de la
  // tarjeta: el parpadeo de "dos intentos" al abrir. Síncronas, el fotograma no
  // se presenta sin la imagen.
  for (const img of clone.querySelectorAll("img")) {
    img.decoding = "sync";
    img.loading = "eager";
  }
  Object.assign(clone.style, { width: "100%", height: "100%" });
  ghost.appendChild(clone);
  return ghost;
}

export default function usePreviewMorph(
  cardRef,
  {
    alignment = "center",
    tileRadius = 8,
    finalScale = 1,
    reduceMotion = false,
    enabled = true,
  } = {},
) {
  const [isPresent, safeToRemove] = usePresence();
  const stateRef = useRef(null);
  const safeToRemoveRef = useRef(safeToRemove);
  useIsomorphicLayoutEffect(() => {
    safeToRemoveRef.current = safeToRemove;
  });

  // APERTURA. Una sola vez, al montar, antes del primer pintado: el primer
  // fotograma ya es la tarjeta, nunca la vista previa a tamaño final.
  useIsomorphicLayoutEffect(() => {
    // StrictMode (desarrollo) desmonta y vuelve a montar los efectos de un
    // componente recién montado, y en las filas de pósters lo hace DESPUÉS de
    // pintar (medido: ~12 ms más tarde). Si la limpieza deshacía la animación,
    // el segundo montaje la arrancaba otra vez desde cero: la vista previa
    // empezaba a abrirse, volvía a la tarjeta y se abría de nuevo, el "doble
    // intento". La limpieza solo marca el estado como moribundo y lo deshace en
    // una microtarea (antes del siguiente pintado); si el efecto vuelve a
    // ejecutarse antes, recupera la animación en curso tal cual.
    const previous = stateRef.current;
    if (previous?.dying) {
      previous.dying = false;
      return () => scheduleTeardown(stateRef, previous);
    }

    const card = cardRef.current;
    if (!card || !enabled) return undefined;
    const tile = card.closest("[data-preview-tile]");
    const tileArt = tile?.querySelector("[data-preview-tile-art]");
    const media = card.querySelector("[data-preview-media]");
    const inner = card.querySelector("[data-preview-media-inner]");
    const glass = card.querySelector("[data-preview-glass]");
    if (!tileArt || !media || !inner || !glass || card.contains(tileArt)) {
      return undefined;
    }

    const geometry = measure(card, media, tileArt, alignment, tileRadius, finalScale);
    if (!geometry) return undefined;

    const ghost = createGhost(tileArt, geometry);
    inner.appendChild(ghost);

    const parts = {
      card,
      glass,
      media,
      inner,
      ghost,
      info: card.querySelector("[data-preview-info]"),
      shadow: card.querySelector("[data-preview-shadow]"),
    };
    for (const k of ["card", "glass", "media", "inner"]) {
      parts[k].style.transformOrigin = "0 0";
    }

    // Con movimiento reducido se recorre el mismo camino con duración 0: la
    // vista previa aparece y desaparece en seco, pero con su escala final.
    const speed = reduceMotion ? 0 : 1;
    const state = {
      parts,
      geometry,
      tileArt,
      speed,
      open: false,
      run: null,
      closing: false,
      dying: false,
      rafs: [],
    };
    stateRef.current = state;

    const lead = runMorph(state, 0, 1, ENTER_MS * speed, ENTER_CURVE);
    lead.finished.then(() => settleOpen(state, lead)).catch(() => {});

    // La tarjeta original se oculta mientras exista la vista previa (donde la
    // vista previa es más baja o estrecha que ella no debe asomar), pero solo
    // cuando la copia ya se ha pintado encima: dos fotogramas después.
    state.rafs[0] = requestAnimationFrame(() => {
      state.rafs[1] = requestAnimationFrame(() => {
        if (stateRef.current === state && !state.dying) {
          tileArt.style.visibility = "hidden";
        }
      });
    });

    return () => scheduleTeardown(stateRef, state);
    // Solo al montar: la geometría de partida es la de ese instante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CIERRE (y reapertura si el cursor vuelve antes de que acabe). Efecto de
  // LAYOUT: así arranca en el mismo commit que el regreso de las vecinas
  // (`useNeighborPush`) y los dos bordes se mueven juntos.
  useIsomorphicLayoutEffect(() => {
    const state = stateRef.current;
    if (isPresent) {
      if (state?.closing) {
        state.closing = false;
        state.parts.card.style.removeProperty("pointer-events");
        const e = currentProgress(state);
        const lead = runMorph(state, e, 1, ENTER_MS * (1 - e) * state.speed, ENTER_CURVE);
        lead.finished.then(() => settleOpen(state, lead)).catch(() => {});
      }
      return;
    }
    if (!state) {
      safeToRemoveRef.current?.();
      return;
    }
    state.closing = true;
    // Una vista previa que se está cerrando NO recibe el ratón. Medido en un
    // recorrido real por la fila (Chrome con GPU): al pasar de una tarjeta a la
    // siguiente, la vista previa saliente se encoge por debajo del cursor, su
    // `onMouseEnter` la volvía a abrir y eso cerraba en seco la que acababa de
    // empezar a abrirse (montada y desmontada en ~25 ms). Ese era el parpadeo
    // de "dos intentos" al hacer hover. Así el cursor pasa a través de ella
    // hasta la tarjeta que hay debajo.
    state.parts.card.style.pointerEvents = "none";
    const e = currentProgress(state);
    state.open = false;
    // Duración proporcional a lo que queda por recorrer: cerrar a mitad de la
    // apertura no tarda lo mismo que cerrar del todo.
    const lead = runMorph(state, e, 0, EXIT_MS * e * state.speed, EXIT_CURVE);
    lead.finished
      .then(() => {
        if (stateRef.current === state && state.closing) safeToRemoveRef.current?.();
      })
      .catch(() => {});
  }, [isPresent]);
}

// Desmontaje real: todo vuelve a reposo (la tarjeta original visible, sin
// copia ni estilos en línea). Se aplaza a una microtarea para poder cancelarlo
// si StrictMode vuelve a montar el efecto en la misma tarea; una microtarea
// corre antes del siguiente pintado, así que nunca se ve un fotograma con la
// tarjeta oculta y sin vista previa.
function scheduleTeardown(stateRef, state) {
  state.dying = true;
  queueMicrotask(() => {
    if (!state.dying) return;
    for (const id of state.rafs) cancelAnimationFrame(id);
    const { parts } = state;
    for (const k of PART_KEYS) {
      const el = parts[k];
      if (!el || k === "ghost") continue;
      cancelMorph(el);
      for (const prop of STYLE_PROPS) el.style.removeProperty(prop);
    }
    parts.card.style.removeProperty("pointer-events");
    state.tileArt.style.removeProperty("visibility");
    parts.ghost.remove();
    if (stateRef.current === state) stateRef.current = null;
  });
}

// Apertura terminada: cada capa vuelve a su estilo de reposo (el de la hoja de
// estilos), que es el estado final. La copia se queda invisible: el cierre la
// vuelve a necesitar.
function settleOpen(state, lead) {
  if (!state || state.run?.lead !== lead || state.closing) return;
  const { parts, geometry } = state;
  for (const k of PART_KEYS) {
    const el = parts[k];
    if (!el) continue;
    cancelMorph(el);
    if (k === "ghost") {
      el.style.opacity = "0";
      continue;
    }
    for (const prop of ["transform", "opacity", "border-radius"]) el.style.removeProperty(prop);
  }
  if (geometry.settleTransform) parts.card.style.transform = geometry.settleTransform;
  state.open = true;
  state.run = null;
}
