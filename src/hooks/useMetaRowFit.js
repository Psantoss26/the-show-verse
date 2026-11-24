"use client";

import { useLayoutEffect } from "react";

// Filas de metadatos que NUNCA deben recortarse ni saltar de línea (vista
// Lista de Continuar viendo en el móvil). Cada fila lleva `data-meta-row` y
// su miniatura, en la misma tarjeta, `data-meta-thumb`. Pasos acumulativos
// por fila, marcados con atributos; el marcado decide qué cambia con
// `group-data-[…]/meta:`:
//   fit-quedan → se omite la palabra «Quedan»
//   fit-gap    → separadores más juntos
//   fit-short  → tiempo corto («1h 3m» en vez de «1 h 3 min»)
//   fit-dots   → sin «•»: las piezas quedan separadas solo por el hueco
// Si con todo aplicado alguna fila sigue sin caber, se estrechan las
// miniaturas de TODA la lista a la vez (variable --meta-thumb en el
// contenedor), lo justo para la fila más larga: así todas las tarjetas siguen
// iguales.
const STEPS = ["fit-quedan", "fit-gap", "fit-short", "fit-dots"];
const MIN_THUMB = 88;
const MOBILE_QUERY = "(max-width: 639.98px)";

function overflow(row) {
  return row.scrollWidth - row.clientWidth;
}

export function fitMetaRows(container) {
  if (!container) return;
  const rows = [...container.querySelectorAll("[data-meta-row]")];
  // Pantalla oculta (keep-alive en <Activity>) o sin maquetar: no tocar nada;
  // el ResizeObserver vuelve a llamar al revelarse.
  if (rows.length === 0 || rows[0].clientWidth === 0) return;

  container.style.removeProperty("--meta-thumb");
  for (const row of rows) for (const step of STEPS) row.removeAttribute(`data-${step}`);
  if (!window.matchMedia(MOBILE_QUERY).matches) return;

  const compact = (row) => {
    for (const step of STEPS) row.removeAttribute(`data-${step}`);
    for (const step of STEPS) {
      if (overflow(row) <= 0) return;
      row.setAttribute(`data-${step}`, "");
    }
  };

  let maxOver = 0;
  for (const row of rows) {
    compact(row);
    maxOver = Math.max(maxOver, overflow(row));
  }
  if (maxOver <= 0) return;
  const thumb = container.querySelector("[data-meta-thumb]");
  if (!thumb) return;
  const width = Math.max(MIN_THUMB, Math.floor(thumb.offsetWidth - maxOver - 1));
  container.style.setProperty("--meta-thumb", `${width}px`);
  // Con las miniaturas más estrechas las demás filas ganan sitio: se vuelven
  // a compactar desde cero para que no pierdan más de lo necesario.
  for (const row of rows) compact(row);
}

/**
 * Ajusta las filas `[data-meta-row]` dentro de `containerRef` para que cada
 * una quepa entera en una línea. Se repite al cambiar el ancho del contenedor,
 * al cargar las fuentes y cuando cambian `deps` (lo que cambia el contenido).
 */
export function useMetaRowFit(containerRef, deps = []) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const run = () => fitMetaRows(container);
    run();
    let alive = true;
    document.fonts?.ready?.then(() => alive && run());
    if (typeof ResizeObserver === "undefined") {
      return () => {
        alive = false;
      };
    }
    let lastWidth = container.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      if (w === lastWidth) return;
      lastWidth = w;
      run();
    });
    ro.observe(container);
    return () => {
      alive = false;
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** «Quedan 1 h 3 min» → { long: "1 h 3 min", short: "1h 3m", hasPrefix } */
export function splitRemainingLabel(label) {
  if (!label) return null;
  const hasPrefix = label.startsWith("Quedan ");
  const long = hasPrefix ? label.slice("Quedan ".length) : label;
  const short = long.replace(/ h\b/g, "h").replace(/ min\b/g, "m");
  return { long, short, hasPrefix };
}
