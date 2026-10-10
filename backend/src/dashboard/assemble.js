import { rotateWindow } from './rotation.js';
import { cardKey, stableHash } from './ranking.js';

/** Allocate enough distinct candidates to each row before filling long rows.
 * Repeats are opt-in, capped per row and separated by at least three rows.
 * Never borrow from unrelated pools merely to reach a display target.
 */
export function assembleRows({
  rowSpecs, rotationSeed, perRow = 20, minItems = 1,
  excludeIds = new Set(), seenIds = new Set(), fairAllocation = false,
  maxAppearances = 1, repeatRatio = 0,
}) {
  const usage = new Map();
  const rows = rowSpecs.map((spec, index) => {
    const unique = new Set();
    const candidates = (spec.rotate
      ? rotateWindow(spec.items, rotationSeed + stableHash(spec.key), spec.items.length)
      : spec.items).filter((card) => {
      if (!card || !['movie', 'tv'].includes(card.mediaType) || !(Number(card.tmdbId) > 0)) return false;
      if (spec.mediaType !== 'mixed' && card.mediaType !== spec.mediaType) return false;
      const key = cardKey(card);
      if (unique.has(key) || excludeIds.has(key)) return false;
      unique.add(key);
      return true;
    });
    return { ...spec, candidates, index, taken: [], keys: new Set(), seen: 0, repeats: 0 };
  });
  const release = (row, card) => {
    const key = cardKey(card);
    usage.set(key, (usage.get(key) || []).filter((index) => index !== row.index));
    row.keys.delete(key);
  };
  const fill = (row, target, allowRepeats = false) => {
    const ratio = typeof row.seenRatioLimit === 'number'
      ? Math.max(0, Math.min(1, row.seenRatioLimit)) : 1;
    // Fill distinct candidates first. A repeat can only use capacity earned by
    // distinct items already present, so sparse rows obey the same ratio.
    const eligible = row.candidates.filter((card) => {
      const key = cardKey(card);
      const prior = usage.get(key) || [];
      return !row.keys.has(key) && (!prior.length || (allowRepeats &&
        prior.length < maxAppearances && !prior.some((i) => row.index - i < 3)));
    });
    const unseenAvailable = row.taken.length - row.seen + eligible.filter((card) =>
      !seenIds.has(cardKey(card)) && !(usage.get(cardKey(card)) || []).length).length;
    const possibleSize = ratio < 1 ? Math.min(target, Math.floor(unseenAvailable / (1 - ratio) + 1e-9)) : target;
    const seenLimit = Math.floor(possibleSize * ratio + 1e-9);
    for (const card of eligible) {
      if (row.taken.length >= target) break;
      const key = cardKey(card);
      const prior = usage.get(key) || [];
      const seen = seenIds.has(key);
      if (seen && row.seen >= seenLimit) continue;
      if (prior.length && row.repeats + 1 > Math.floor((row.taken.length + 1) * repeatRatio + 1e-9)) continue;
      row.taken.push(card);
      row.keys.add(key);
      usage.set(key, [...prior, row.index]);
      if (seen) row.seen++;
      if (prior.length) row.repeats++;
    }
  };
  const active = [];
  for (const row of rows) {
    row.index = active.length;
    fill(row, fairAllocation ? minItems : perRow);
    if (row.taken.length < minItems && maxAppearances > 1) fill(row, minItems, true);
    if (row.taken.length < minItems) {
      row.taken.forEach((card) => release(row, card));
    } else active.push(row);
  }
  if (fairAllocation) {
    // Round-robin expansion prevents broad early pools monopolizing the page.
    for (let target = minItems + 1; target <= perRow; target++) {
      for (const row of active) fill(row, target);
    }
    if (maxAppearances > 1) for (const row of active) fill(row, perRow, true);
  }
  return active.flatMap((row) => {
    const positions = new Map(row.candidates.map((card, index) => [cardKey(card), index]));
    row.taken.sort((a, b) => positions.get(cardKey(a)) - positions.get(cardKey(b)));
    return [{ key: row.key, title: row.title, reason: row.reason, mediaType: row.mediaType, items: row.taken }];
  });
}
