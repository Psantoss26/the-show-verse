// Public anticipation, not ratings: Trakt counts the lists containing a title.
// Pool persistence owns the cache; no OAuth or personal account is required.
export async function fetchAnticipated(mediaType, {
  clientId = process.env.TRAKT_CLIENT_ID,
  fetchImpl = fetch,
} = {}) {
  if (!clientId) return [];
  try {
    const response = await fetchImpl(`https://api.trakt.tv/${mediaType === 'tv' ? 'shows' : 'movies'}/anticipated?limit=100&extended=full`, {
      headers: {
        'trakt-api-key': clientId,
        'trakt-api-version': '2',
        'User-Agent': 'TheShowVerse/1.0 (+https://theshowverse.app)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    return rows.flatMap((row) => {
      const title = row?.[mediaType === 'tv' ? 'show' : 'movie'];
      const tmdbId = Number(title?.ids?.tmdb);
      const listCount = Number(row?.list_count);
      if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0 || !Number.isFinite(listCount) || listCount <= 0 || seen.has(tmdbId)) return [];
      seen.add(tmdbId);
      return [{ tmdbId, mediaType, anticipatedListCount: listCount }];
    });
  } catch {
    return [];
  }
}

// Include public-demand candidates even when they fall outside TMDb's first
// discovery pages. Hydrate only missing candidates, with bounded concurrency.
export async function mergeAnticipatedCandidates(discovered, signals, hydrate) {
  const cards = new Map(discovered.map((card) => [card.tmdbId, card]));
  const hydrated = new Array(signals.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, signals.length) }, async () => {
    while (cursor < signals.length) {
      const index = cursor++;
      const signal = signals[index];
      const card = cards.get(signal.tmdbId) || await hydrate(signal.tmdbId).catch(() => null);
      if (card) hydrated[index] = { ...card, ...signal };
    }
  }));
  for (const card of hydrated.filter(Boolean)) cards.set(card.tmdbId, card);
  return [...cards.values()];
}
