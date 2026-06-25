// backend/src/dashboard/assemble.js
import { rotateWindow } from './rotation.js';

/**
 * Assembles rows from rowSpecs, applying cross-row deduplication.
 *
 * @param {object} options
 * @param {Array}   options.rowSpecs     - Array of { key, title, reason, mediaType, items: card[], rotate: boolean }
 * @param {number}  options.rotationSeed - Seed used for seeded rotation
 * @param {number}  [options.perRow=20]  - Max items per row
 * @param {number}  [options.minItems=1] - Drop rows that end up with fewer than this many items
 * @param {Set}     [options.excludeIds] - Set of "${mediaType}:${tmdbId}" keys to pre-exclude
 * @returns {Array} Non-empty rows: { key, title, reason, mediaType, items: card[] }
 */
export function assembleRows({
  rowSpecs,
  rotationSeed,
  perRow = 20,
  minItems = 1,
  excludeIds = new Set(),
}) {
  const used = new Set(excludeIds);
  const output = [];

  for (const rowSpec of rowSpecs) {
    const { key, title, reason, mediaType, items, rotate } = rowSpec;

    const candidates = rotate
      ? rotateWindow(items, rotationSeed, items.length)
      : items;

    const taken = [];
    const takenKeys = [];
    for (const card of candidates) {
      if (taken.length >= perRow) break;
      const cardKey = `${card.mediaType}:${card.tmdbId}`;
      if (used.has(cardKey)) continue;
      takenKeys.push(cardKey);
      taken.push(card);
    }

    // Si la fila no alcanza el mínimo, la descartamos y NO marcamos sus títulos
    // como usados (así quedan disponibles para filas posteriores).
    if (taken.length < minItems) continue;

    for (const cardKey of takenKeys) used.add(cardKey);
    output.push({ key, title, reason, mediaType, items: taken });
  }

  return output;
}
