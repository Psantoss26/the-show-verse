/**
 * Pure scoring utilities for dashboard recommendation candidates.
 * No DB/network access — all data comes in as arguments.
 */

/**
 * For each seed, fetch its similar/recommended candidates and accumulate
 * a weighted score. Returns rec items sorted by score descending.
 *
 * @param {{ seeds: Array, fetchSimilar: Function }} params
 * @returns {Promise<Array>} recItem[] sorted by score desc
 */
export async function aggregateCandidates({ seeds, fetchSimilar }) {
  // Map keyed `${mediaType}:${tmdbId}` -> { card, score, reasons }
  const candidateMap = new Map();

  // Build a set of seed keys to skip self-recommendation
  const seedKeys = new Set(
    seeds.map((s) => `${s.mediaType}:${s.tmdbId}`)
  );

  for (const seed of seeds) {
    const { recommendations = [], similar = [] } = await fetchSimilar(seed);

    const sources = [
      { list: recommendations, sourceWeight: 1.0 },
      { list: similar, sourceWeight: 0.6 },
    ];

    for (const { list, sourceWeight } of sources) {
      list.forEach((card, index) => {
        const key = `${card.mediaType}:${card.tmdbId}`;

        // Skip the seed itself
        if (seedKeys.has(key)) return;

        const positionDecay = 1 / (1 + index * 0.15);
        const contribution = seed.weight * sourceWeight * positionDecay;

        if (!candidateMap.has(key)) {
          candidateMap.set(key, { ...card, score: 0, reasons: [] });
        }

        const item = candidateMap.get(key);
        item.score += contribution;

        // Solo las semillas que el usuario realmente disfrutó (strongPositive:
        // rating ≥ 8 o favorito) generan razón "porque viste…". El visionado
        // casual o los pendientes puntúan, pero no crean esas filas.
        if (seed.strongPositive) {
          const alreadyHasReason = item.reasons.some(
            (r) => r.seedTmdbId === seed.tmdbId
          );
          if (!alreadyHasReason) {
            item.reasons.push({
              type: 'because',
              seedTmdbId: seed.tmdbId,
              seedTitle: seed.title ?? null,
            });
          }
        }
      });
    }
  }

  return Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);
}

/**
 * Filter out items already in the user's library / seen set.
 *
 * @param {Array} recItems
 * @param {Set<string>} seenSet  Set of "mediaType:tmdbId" strings
 * @returns {Array}
 */
export function excludeSeen(recItems, seenSet) {
  return recItems.filter(
    (item) => !seenSet.has(`${item.mediaType}:${item.tmdbId}`)
  );
}

/**
 * Append genre-fill cards that aren't already in recItems.
 *
 * @param {Array} recItems  existing scored candidates
 * @param {Array} fillCards  raw cards from genre discover
 * @param {number} [weight=0.5]  score to assign fill items
 * @returns {Array}
 */
export function mergeGenreFill(recItems, fillCards, weight = 0.5) {
  const existingKeys = new Set(
    recItems.map((item) => `${item.mediaType}:${item.tmdbId}`)
  );

  const fills = fillCards
    .filter((card) => !existingKeys.has(`${card.mediaType}:${card.tmdbId}`))
    .map((card) => ({
      ...card,
      score: weight,
      reasons: [{ type: 'based_on_genres', seedTmdbId: null, seedTitle: null }],
    }));

  return [...recItems, ...fills];
}
