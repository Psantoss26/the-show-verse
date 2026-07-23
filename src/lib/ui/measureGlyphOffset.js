// src/lib/ui/measureGlyphOffset.js
// Centra VERTICALMENTE un texto (números de los botones de acción: veces
// vista, progreso de serie, puntuación decimal) usando las métricas REALES de
// la fuente en vez de un desplazamiento fijo "a ojo" (translate-y-[0.05em]).
//
// `line-height: 1` + flexbox (`items-center`) centra la CAJA DE LÍNEA de la
// fuente, no el glifo dibujado: la mayoría de fuentes reservan más espacio de
// ascendente que de descendente en su caja de línea (para tildes, mayúsculas,
// letras con descendente como "g"/"y"...), así que un número (sin
// descendentes) centrado por caja de línea queda visualmente por ENCIMA de su
// centro real. Cuánto hay que compensar depende del texto exacto (1 ó 2
// dígitos, con coma decimal o "%") y del tamaño de fuente real (cambia por
// breakpoint vía container queries), así que no existe una única constante
// válida para todos los casos -- de ahí medir con Canvas en vez de adivinar.
let sharedCtx = null;
function getContext() {
  if (typeof document === "undefined") return null;
  if (!sharedCtx) {
    const canvas = document.createElement("canvas");
    sharedCtx = canvas.getContext("2d");
  }
  return sharedCtx;
}

const cache = new Map();

/**
 * Desplazamiento vertical (px, positivo = hacia abajo) para que el centro
 * VISUAL de `text` coincida con el centro de una caja de línea de altura
 * `line-height: 1` con la fuente `font` (shorthand CSS: "<peso> <tamaño>
 * <familia>", tal cual devuelve `getComputedStyle`), cuando ambos se centran
 * con flexbox. Se basa en `TextMetrics.actualBoundingBox*` (glifo real) vs.
 * `fontBoundingBox*` (caja de línea de la fuente). Devuelve 0 si no se puede
 * medir (SSR, o navegador sin soporte de `fontBoundingBox*`) -- no hay salto
 * visual: simplemente se queda con el centrado de caja de línea por defecto.
 */
export function getGlyphCenterOffset(font, text) {
  if (!font || !text) return 0;
  const key = `${font}__${text}`;
  if (cache.has(key)) return cache.get(key);

  const ctx = getContext();
  if (!ctx) return 0;

  ctx.font = font;
  const metrics = ctx.measureText(text);

  const actualAscent = metrics.actualBoundingBoxAscent ?? 0;
  const actualDescent = metrics.actualBoundingBoxDescent ?? 0;
  const fontAscent = metrics.fontBoundingBoxAscent;
  const fontDescent = metrics.fontBoundingBoxDescent;
  // Sin soporte de fontBoundingBox* (Safari < 17 aprox.) no hay forma fiable
  // de saber la caja de línea real: no hay base para corregir, offset 0.
  if (fontAscent == null || fontDescent == null) {
    cache.set(key, 0);
    return 0;
  }

  // Centro del glifo real vs. centro de la caja de línea de la fuente,
  // medidos ambos desde la línea base (más abajo = positivo).
  const offset = (fontDescent - actualDescent - (fontAscent - actualAscent)) / 2;

  cache.set(key, offset);
  return offset;
}
