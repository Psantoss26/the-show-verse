// Modo de portada BACKDROP (16:9) de las páginas de listas y colecciones, el
// mismo que alterna DetailsClient entre póster y backdrop.
//
//   - Colecciones: UNA imagen backdrop CON IDIOMA de su galería (inglés y, si
//     no hay, español). Sin ninguna, el modo no se ofrece: un backdrop sin
//     texto no identifica la colección como lo hace su póster.
//   - Listas: no tienen imagen propia, así que la caja horizontal se rellena
//     con una «estantería» de los pósters de sus títulos (posterShelfLayout).

import { pickBestBackdropForPreview } from "../details/tmdbImages.js";

/** Backdrop con idioma de una colección (inglés → español) o null. */
export function pickCollectionCoverBackdrop(backdrops) {
  const list = Array.isArray(backdrops) ? backdrops.filter((image) => image?.file_path) : [];
  return (
    pickBestBackdropForPreview(list, { preferLangs: ["en", "en-US"] }) ||
    pickBestBackdropForPreview(list, { preferLangs: ["es", "es-ES"] }) ||
    null
  );
}

// Caja 16:9 en unidades: 100 de ancho × 56.25 de alto.
const BOX_W = 100;
const BOX_H = 56.25;
const POSTER_RATIO = 2 / 3;
const MAX_ROWS = 4;

/**
 * Estantería de `count` pósters (2:3, sin recortar) dentro de una caja 16:9:
 * elige el número de filas con el que cada póster sale MÁS GRANDE, reparte los
 * títulos entre las filas lo más igualado posible (20 → 7 · 7 · 6), centra cada
 * fila y centra el bloque en vertical. Lo que sobra a los lados lo cubre el
 * fondo difuminado.
 *
 * Devuelve las piezas en PORCENTAJES de la caja: { left, top, width, height }.
 */
export function posterShelfLayout(count, { gap = 1.4, pad = 2.4 } = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return { rows: 0, cols: 0, tiles: [] };

  let best = null;
  for (let rows = 1; rows <= Math.min(MAX_ROWS, n); rows += 1) {
    const cols = Math.ceil(n / rows);
    const byWidth = (BOX_W - pad * 2 - (cols - 1) * gap) / cols;
    const byHeight = ((BOX_H - pad * 2 - (rows - 1) * gap) / rows) * POSTER_RATIO;
    const width = Math.min(byWidth, byHeight);
    // A igualdad (casi), menos filas: pósters en una línea se leen mejor.
    if (!best || width > best.width + 0.01) best = { rows, cols, width };
  }

  const { rows, cols, width } = best;
  const height = width / POSTER_RATIO;
  const blockH = rows * height + (rows - 1) * gap;
  const top0 = (BOX_H - blockH) / 2;

  const tiles = [];
  let placed = 0;
  for (let row = 0; row < rows; row += 1) {
    // Reparto igualado: las primeras filas se llevan el resto.
    const inRow = Math.floor(n / rows) + (row < n % rows ? 1 : 0);
    const rowW = inRow * width + (inRow - 1) * gap;
    const left0 = (BOX_W - rowW) / 2;
    for (let index = 0; index < inRow; index += 1) {
      tiles.push({
        left: ((left0 + index * (width + gap)) / BOX_W) * 100,
        top: ((top0 + row * (height + gap)) / BOX_H) * 100,
        width: (width / BOX_W) * 100,
        height: (height / BOX_H) * 100,
      });
      placed += 1;
    }
  }
  return { rows, cols, tiles: tiles.slice(0, placed) };
}
