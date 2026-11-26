"use client";

import { useCallback } from "react";

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

function measure(row) {
  const panel = row.querySelector(".sv-score-panel");
  if (!panel) return;
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
  if (natural > 0) {
    row.style.setProperty("--sv-score-panel-w", `${Math.ceil(natural)}px`);
    row.dataset.scoreFit = "";
  }
}

export function useScoreRowFit() {
  return useCallback((row) => {
    if (!row) return undefined;
    measure(row);
    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure(row);
        });
      }
    };
    // Las puntuaciones pasan de reservadas a reales, llegan las stats o cambia
    // el ancho de la ventana: se vuelve a medir.
    const resize = new ResizeObserver(() => measure(row));
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
    mutations.observe(row, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, []);
}
