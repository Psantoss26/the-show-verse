// Pure ranking policy shared by anonymous and personalized dashboard rows.
export const cardKey = (card) => `${card.mediaType}:${card.tmdbId}`;

export function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function publicQuality(card) {
  const votes = Math.max(0, Number(card.voteCount) || 0);
  const prior = card.mediaType === 'tv' ? 150 : 500;
  // Shrink small samples toward 6.5 instead of trusting a handful of tens.
  return ((Number(card.voteAverage) || 0) * votes + 6.5 * prior) / (votes + prior);
}

export function rankRowItems(row, { seed = 0, recommendations = new Map(), surface, cohortSeed = seed } = {}) {
  const items = row.items || [];
  const ranked = items.map((card, index) => {
    const quality = publicQuality(card) / 10;
    const popularity = Math.min(1, Math.log1p(Math.max(0, card.popularity || 0)) / 7);
    const sourceRank = 1 / (1 + index / 20);
    const affinity = recommendations.get(cardKey(card)) || 0;
    const personal = row.seenRatioLimit != null;
    let score;
    if (personal) score = Math.log1p(Math.max(0, card.score || 0)) + quality * 0.25;
    else if (row.key === 'top_rated' || row.key === 'acclaimed') score = quality * 0.85 + popularity * 0.15;
    else score = sourceRank * 0.6 + quality * 0.25 + popularity * 0.15;
    // Editorial/date rankings are factual: never personalize or shuffle them.
    if (!row.rotate) return { card, index, score: -index };
    score += affinity * 0.18;
    // Give each dashboard a distinct discovery cohort among close matches.
    // Strong preference scores still win; this is not arbitrary shuffling.
    if (row.key === 'for_you' && surface) {
      const cohort = stableHash(`${cohortSeed}:${cardKey(card)}`) % 3;
      const preferred = surface === 'home' ? 0 : surface === 'movies' ? 1 : 2;
      if (cohort === preferred) score += 0.35;
    }
    // Small deterministic exploration, not a full shuffle of the candidate pool.
    score += (stableHash(`${seed}:${row.key}:${cardKey(card)}`) / 4294967296) * 0.08;
    return { card, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  if (row.mediaType !== 'mixed') return ranked.map(({ card }) => card);
  // Preserve quality ordering within each type, and real movie/TV balance.
  const movie = ranked.filter(({ card }) => card.mediaType === 'movie');
  const tv = ranked.filter(({ card }) => card.mediaType === 'tv');
  return Array.from({ length: Math.max(movie.length, tv.length) }, (_, i) => [movie[i]?.card, tv[i]?.card]).flat().filter(Boolean);
}

// TMDb's movie and TV genre taxonomies are different. Never send movie 28/878
// to TV discover: they correspond to TV 10759/10765 respectively.
export const MIXED_GENRES = [
  { id: 28, label: 'Acción y aventura', movie: [28, 12], tv: [10759] },
  { id: 878, label: 'Ciencia ficción y fantasía', movie: [878, 14], tv: [10765] },
  ...[[16, 'Animación'], [35, 'Comedia'], [80, 'Crimen'], [18, 'Drama'], [9648, 'Misterio']]
    .map(([id, label]) => ({ id, label, movie: [id], tv: [id] })),
];
