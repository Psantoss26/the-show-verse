// backend/src/dashboard/assemble.js
import { rotateWindow } from './rotation.js';

/**
 * Assembles rows from rowSpecs, applying cross-row deduplication and a per-row
 * "already seen" policy.
 *
 * Política de "ya visto":
 *   - Filas genéricas (sin `seenRatioLimit`): permiten títulos ya vistos sin
 *     límite (tendencias, populares, mejor valoradas, Top 10, géneros, décadas…).
 *   - Filas personalizadas (`seenRatioLimit` ∈ [0,1]): limitan la proporción de
 *     títulos ya vistos para que no dominen ("Para ti", "Porque viste…").
 *
 * @param {object} options
 * @param {Array}   options.rowSpecs     - { key, title, reason, mediaType, items: card[], rotate, seenRatioLimit? }
 * @param {number}  options.rotationSeed - Seed used for seeded rotation
 * @param {number}  [options.perRow=20]  - Max items per row
 * @param {number}  [options.minItems=1] - Drop rows that end up with fewer than this many items
 * @param {Set}     [options.excludeIds] - "${mediaType}:${tmdbId}" a excluir por completo (hard-exclude)
 * @param {Set}     [options.seenIds]    - "${mediaType}:${tmdbId}" ya vistos (historial∪favoritos∪valorados)
 * @returns {Array} Non-empty rows: { key, title, reason, mediaType, items: card[] }
 */
export function assembleRows({
  rowSpecs,
  rotationSeed,
  perRow = 20,
  minItems = 1,
  excludeIds = new Set(),
  seenIds = new Set(),
}) {
  const used = new Set(excludeIds);
  const output = [];

  for (const rowSpec of rowSpecs) {
    const { key, title, reason, mediaType, items, rotate, seenRatioLimit } = rowSpec;

    const candidates = rotate
      ? rotateWindow(items, rotationSeed, items.length)
      : items;

    // Límite de títulos ya vistos para esta fila (Infinity = sin límite).
    const maxSeen = typeof seenRatioLimit === 'number'
      ? Math.floor(seenRatioLimit * perRow)
      : Infinity;

    const taken = [];
    const takenKeys = [];
    let seenCount = 0;
    for (const card of candidates) {
      if (taken.length >= perRow) break;
      const cardKey = `${card.mediaType}:${card.tmdbId}`;
      if (used.has(cardKey)) continue;
      const isSeen = seenIds.has(cardKey);
      if (isSeen && seenCount >= maxSeen) continue; // tope de vistos (personalizadas)
      takenKeys.push(cardKey);
      taken.push(card);
      if (isSeen) seenCount += 1;
    }

    // Si la fila no alcanza el mínimo, la descartamos y NO marcamos sus títulos
    // como usados (así quedan disponibles para filas posteriores).
    if (taken.length < minItems) continue;

    for (const cardKey of takenKeys) used.add(cardKey);
    output.push({ key, title, reason, mediaType, items: taken });
  }

  return output;
}
