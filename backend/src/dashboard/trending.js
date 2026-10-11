// Tendencias "ahora mismo" para la sección dedicada y su fila en Inicio: la
// misma receta que usaba la página (`/dashboard/tendencias`) — lo que es
// tendencia en Trakt, en su orden, y después las tendencias semanales de TMDb
// que falten —. Sin mínimo de votos: los estrenos recientes son justo lo que es
// tendencia. Solo la clave pública de Trakt (sin OAuth).
export async function fetchTraktTrending(mediaType, {
  clientId = process.env.TRAKT_CLIENT_ID,
  fetchImpl = fetch,
} = {}) {
  if (!clientId) return [];
  try {
    const response = await fetchImpl(`https://api.trakt.tv/${mediaType === 'tv' ? 'shows' : 'movies'}/trending?limit=50`, {
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
      const tmdbId = Number(row?.[mediaType === 'tv' ? 'show' : 'movie']?.ids?.tmdb);
      if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0 || seen.has(tmdbId)) return [];
      seen.add(tmdbId);
      return [tmdbId];
    });
  } catch {
    return [];
  }
}

// Orden final: el de Trakt y, detrás, las tendencias de TMDb que no estaban.
// Los ids de Trakt que TMDb no trae ya como tarjeta se completan con
// `hydrate`, con concurrencia acotada; un fallo solo pierde ese título.
export async function mergeTrendingCandidates(traktIds, tmdbCards, hydrate) {
  const known = new Map(tmdbCards.map((card) => [card.tmdbId, card]));
  const fromTrakt = new Array(traktIds.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, traktIds.length) }, async () => {
    while (cursor < traktIds.length) {
      const index = cursor++;
      const id = traktIds[index];
      fromTrakt[index] = known.get(id) || await hydrate(id).catch(() => null);
    }
  }));
  const ordered = fromTrakt.filter(Boolean);
  const taken = new Set(ordered.map((card) => card.tmdbId));
  return [...ordered, ...tmdbCards.filter((card) => !taken.has(card.tmdbId))];
}
