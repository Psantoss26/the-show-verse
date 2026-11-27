"use client";

import { useCallback } from "react";
import { TILES_RELAYOUT_EVENT, playTilesFlip, snapshotTiles, stopTilesFlip } from "@/components/details/TilesLayoutFlip";

// Fila marcador + bloques de DetailModal (`.sv-score-row`). El panel de
// puntuaciones es contenedor de inline-size, así que su ancho intrínseco es 0
// y, con `flex-1`, se quedaba con todo el sitio libre: a la derecha de las
// puntuaciones quedaba un hueco vacío y los bloques (Plataformas, Actividad,
// Enlaces, Compartir) se quedaban en su ancho mínimo.
//
// Este ref mide el ancho NATURAL de la fila de puntuaciones (con su relleno;
// la de stats solo si no hay puntuaciones) y lo publica en `--sv-score-panel-w`;
// `globals.css` lo usa como base flex del panel y da el resto a los bloques.
// Se mide en el commit (callback ref + ResizeObserver, que entrega antes de
// pintar), así que la fila nace ya con su reparto final.
//
// MIENTRAS CARGAN LAS PUNTUACIONES (alguna con su hueco reservado,
// `data-score-pending`) el reparto NO se mueve: se queda el del título
// anterior (el de esta fila o, si es nueva, el último asentado). Antes se
// volvía a medir con cada nota que llegaba —y las cifras de relleno no miden
// lo mismo que las reales—, así que los bloques cambiaban de ancho tres o
// cuatro veces al abrir un título no visitado. Al asentarse todas (o a los
// `MAX_HOLD_MS`) se mide una vez y, si cambia, los bloques pasan a su ancho
// final con el FLIP de `<TilesLayoutFlip>`.
//
// También espera a saber si el título lleva Actividad (`data-tiles-resolving`
// en los bloques): si al saberlo cambian los bloques, `<TilesLayoutFlip>` avisa
// (`TILES_RELAYOUT_EVENT`) antes de su FLIP, la fila aplica ahí su reparto sin
// animar y el mismo FLIP lleva ancho y número de bloques en un movimiento.
const MAX_HOLD_MS = 4000;
let lastSettledWidth = null;

function px(value) {
  return parseFloat(value) || 0;
}

function paddingX(el) {
  const style = getComputedStyle(el);
  return px(style.paddingLeft) + px(style.paddingRight);
}

// Ancho que ocuparían los hijos en una sola línea, aunque la pista ocupe todo
// el panel (`sm:w-full`) o envuelva.
function trackNaturalWidth(track) {
  const children = [...track.children].filter(
    (child) => getComputedStyle(child).display !== "none",
  );
  if (!children.length) return 0;
  const gap = px(getComputedStyle(track).columnGap);
  return (
    children.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) +
    gap * (children.length - 1)
  );
}

function naturalWidth(panel) {
  let natural = 0;
  const ratings = panel.querySelector("[data-scoreboard-ratings]");
  const toolbar = ratings?.closest("[data-scoreboard-toolbar]");
  if (ratings && toolbar) {
    // `useFitScoresZoom` puede haberla escalado: se mide a escala 1.
    const zoom = px(ratings.style.zoom) || 1;
    natural = Math.max(natural, ratings.getBoundingClientRect().width / zoom + paddingX(toolbar));
  }
  // Manda la fila de puntuaciones. Las stats solo cuentan si no hay
  // puntuaciones: se adaptan solas (sin etiquetas por debajo de 31rem, o con
  // desplazamiento), y medirlas con etiquetas inflaba el panel según el ancho
  // del que se viniera.
  const stats = natural > 0 ? null : panel.querySelector("[data-scoreboard-stats]");
  const scroller = stats?.firstElementChild;
  const track = scroller?.firstElementChild;
  if (scroller && track) {
    natural = Math.max(natural, trackNaturalWidth(track) + paddingX(scroller) + paddingX(track));
  }
  return natural > 0 ? Math.ceil(natural) : 0;
}

function currentWidth(row) {
  return row.hasAttribute("data-score-fit")
    ? parseFloat(row.style.getPropertyValue("--sv-score-panel-w")) || 0
    : 0;
}

function apply(row, width, { animate }) {
  if (!width || width === currentWidth(row)) return;
  const tiles = animate ? row.querySelector(":scope > .sv-score-tiles") : null;
  const snapshot = tiles ? snapshotTiles(tiles) : null;
  row.style.setProperty("--sv-score-panel-w", `${width}px`);
  row.dataset.scoreFit = "";
  if (snapshot) {
    stopTilesFlip(tiles, { ghosts: false });
    playTilesFlip(tiles, snapshot);
  }
}

// `hold`: estado de la espera de esta fila ({ since, timer, expired }).
// `animate: false`: otro FLIP ya cubre el cambio.
function measure(row, hold, remeasure, { animate = true } = {}) {
  const panel = row.querySelector(".sv-score-panel");
  if (!panel) return;
  const pending = Boolean(
    panel.querySelector("[data-score-pending]") || row.querySelector(":scope > [data-tiles-resolving]"),
  );
  // Pasado el tope, la fila vuelve a medir con cada cambio hasta asentarse.
  if (pending && !hold.expired) {
    if (!hold.since) {
      hold.since = performance.now();
      clearTimeout(hold.timer);
      hold.timer = setTimeout(remeasure, MAX_HOLD_MS + 50);
    }
    if (performance.now() - hold.since < MAX_HOLD_MS) {
      // Fila nueva: arranca con el último reparto asentado. Solo si no hay
      // ninguno (primer título de la sesión) se mide la reserva.
      if (!currentWidth(row)) apply(row, lastSettledWidth || naturalWidth(panel), { animate: false });
      return;
    }
    hold.expired = true;
  }
  if (!pending) hold.expired = false;
  const wasHeld = Boolean(hold.since);
  hold.since = 0;
  clearTimeout(hold.timer);
  const width = naturalWidth(panel);
  if (!width) return;
  apply(row, width, { animate: animate && wasHeld });
  if (!pending) lastSettledWidth = width;
}

export function useScoreRowFit() {
  return useCallback((row) => {
    if (!row) return undefined;
    const hold = { since: 0, timer: 0, expired: false };
    const run = () => measure(row, hold, run);
    run();
    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          run();
        });
      }
    };
    // Las puntuaciones pasan de reservadas a reales, llegan las stats o cambia
    // el ancho de la ventana: se vuelve a medir.
    const resize = new ResizeObserver(run);
    const observeParts = () => {
      resize.disconnect();
      resize.observe(row);
      row.querySelectorAll(".sv-score-panel [data-scoreboard-ratings]").forEach((el) => resize.observe(el));
    };
    observeParts();
    const mutations = new MutationObserver(() => {
      observeParts();
      schedule();
    });
    mutations.observe(row, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-tiles-resolving"],
    });
    const relayout = () => measure(row, hold, run, { animate: false });
    row.addEventListener(TILES_RELAYOUT_EVENT, relayout);
    return () => {
      row.removeEventListener(TILES_RELAYOUT_EVENT, relayout);
      cancelAnimationFrame(frame);
      clearTimeout(hold.timer);
      resize.disconnect();
      mutations.disconnect();
    };
  }, []);
}
