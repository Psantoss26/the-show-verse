// backend/src/dashboard/surfaces.js

/**
 * Surface row definitions for the dashboard.
 *
 * rowDef = {
 *   key: string,
 *   title: string,
 *   mediaType: 'movie' | 'tv' | 'mixed',
 *   source:
 *     | { kind: 'pool', poolKey: string }
 *     | { kind: 'genreRotating', count: number }
 *     | { kind: 'decadeRotating', count: number }
 * }
 */

export const SURFACES = {
  home: {
    mediaTypes: ['movie', 'tv'],
    genericRows: [
      {
        key: 'trending',
        title: 'Tendencias',
        mediaType: 'mixed',
        source: { kind: 'pool', poolKey: 'trending' },
      },
      {
        key: 'popular',
        title: 'Populares',
        mediaType: 'mixed',
        source: { kind: 'pool', poolKey: 'popular' },
      },
      {
        key: 'top_rated',
        title: 'Mejor valoradas',
        mediaType: 'mixed',
        source: { kind: 'pool', poolKey: 'top_rated' },
      },
      {
        key: 'new_releases',
        title: 'Estrenos y novedades',
        mediaType: 'mixed',
        source: { kind: 'pool', poolKey: 'new_releases' },
      },
      {
        key: 'hidden_gems',
        title: 'Joyas ocultas',
        mediaType: 'mixed',
        source: { kind: 'pool', poolKey: 'hidden_gems' },
      },
      {
        key: 'genre_rotating',
        title: 'Imprescindibles por género',
        mediaType: 'mixed',
        source: { kind: 'genreRotating', count: 3 },
      },
      {
        key: 'decade_rotating',
        title: 'Imprescindibles de cada década',
        mediaType: 'mixed',
        source: { kind: 'decadeRotating', count: 5 },
      },
    ],
  },

  movies: {
    mediaTypes: ['movie'],
    genericRows: [
      {
        key: 'trending',
        title: 'Tendencias',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'trending' },
      },
      {
        key: 'region_top',
        title: 'Top 10 hoy en España',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'region_top' },
      },
      {
        key: 'popular',
        title: 'Populares',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'popular' },
      },
      {
        key: 'acclaimed',
        title: 'Aclamadas por la crítica',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'acclaimed' },
      },
      {
        key: 'top_rated',
        title: 'Las más valoradas',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'top_rated' },
      },
      {
        key: 'blockbusters',
        title: 'Taquillazos',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'blockbusters' },
      },
      {
        key: 'new_releases',
        title: 'Estrenos',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'new_releases' },
      },
      {
        key: 'hidden_gems',
        title: 'Joyas ocultas',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'hidden_gems' },
      },
      {
        key: 'genre_rotating',
        title: 'Por género',
        mediaType: 'movie',
        source: { kind: 'genreRotating', count: 4 },
      },
      {
        key: 'decade_rotating',
        title: 'Por décadas',
        mediaType: 'movie',
        source: { kind: 'decadeRotating', count: 5 },
      },
    ],
  },

  series: {
    mediaTypes: ['tv'],
    genericRows: [
      {
        key: 'trending',
        title: 'Tendencias',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'trending' },
      },
      {
        key: 'region_top',
        title: 'Top 10 hoy en España',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'region_top' },
      },
      {
        key: 'popular',
        title: 'Populares',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'popular' },
      },
      {
        key: 'acclaimed',
        title: 'Aclamadas por la crítica',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'acclaimed' },
      },
      {
        key: 'top_rated',
        title: 'Las más valoradas',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'top_rated' },
      },
      {
        key: 'blockbusters',
        title: 'Fenómenos de audiencia',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'blockbusters' },
      },
      {
        key: 'new_releases',
        title: 'Estrenos',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'new_releases' },
      },
      {
        key: 'hidden_gems',
        title: 'Joyas ocultas',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'hidden_gems' },
      },
      {
        key: 'genre_rotating',
        title: 'Por género',
        mediaType: 'tv',
        source: { kind: 'genreRotating', count: 4 },
      },
      {
        key: 'decade_rotating',
        title: 'Por décadas',
        mediaType: 'tv',
        source: { kind: 'decadeRotating', count: 5 },
      },
    ],
  },
};

/**
 * Build personalized row defs from recommendation items.
 *
 * @param {{ movie: recItem[], tv: recItem[] }} recsByType
 * @param {{ mediaTypes: ('movie'|'tv')[], genericRows: any[] }} surface
 * @returns {Array<{ key: string, title: string, reason?: string, mediaType: string, items: object[], rotate: boolean }>}
 *
 * recItem = { ...card, score: number, reasons: Array<{ type: 'because'|'based_on_genres', seedTmdbId?: number, seedTitle?: string }> }
 */
export function personalizedRowDefs(recsByType, surface) {
  // 1. Merge all recItems across the surface's mediaTypes, sorted by score desc
  const all = surface.mediaTypes
    .flatMap((mt) => recsByType[mt] ?? [])
    .sort((a, b) => b.score - a.score);

  if (all.length === 0) return [];

  const isHome = surface.mediaTypes.length > 1;
  const primaryMediaType = isHome ? 'mixed' : surface.mediaTypes[0];

  const rows = [];

  // 2. "Para ti" row — top 20
  rows.push({
    key: 'for_you',
    title: 'Para ti',
    reason: undefined,
    mediaType: primaryMediaType,
    items: all.slice(0, 20),
    rotate: false,
  });

  // 3. "Porque viste {seedTitle}" rows (max 2)
  // Group by first 'because' reason's seedTmdbId
  const becauseGroups = new Map(); // seedTmdbId -> { seedTitle, items: recItem[] }
  for (const item of all) {
    const becauseReason = item.reasons?.find((r) => r.type === 'because');
    if (!becauseReason) continue;
    const { seedTmdbId, seedTitle } = becauseReason;
    if (!seedTitle) continue;
    if (!becauseGroups.has(seedTmdbId)) {
      becauseGroups.set(seedTmdbId, { seedTitle, items: [] });
    }
    becauseGroups.get(seedTmdbId).items.push(item);
  }

  // Sort by group size desc, take top 2 with >= 15 items (mínimo por fila)
  const topBecauseGroups = [...becauseGroups.entries()]
    .filter(([, g]) => g.items.length >= 15)
    .sort(([, a], [, b]) => b.items.length - a.items.length)
    .slice(0, 2);

  for (const [seedTmdbId, { seedTitle, items }] of topBecauseGroups) {
    rows.push({
      key: `because_${seedTmdbId}`,
      title: `Porque viste ${seedTitle}`,
      reason: 'Recomendado por tu historial',
      mediaType: primaryMediaType,
      items: items.slice(0, 20),
      rotate: false,
    });
  }

  // 4. "Más para ti según tus gustos" row — items with based_on_genres reason
  const genreFillItems = all.filter((item) =>
    item.reasons?.some((r) => r.type === 'based_on_genres'),
  );

  if (genreFillItems.length >= 15) {
    rows.push({
      key: 'genre_fill',
      title: 'Más para ti',
      reason: undefined,
      mediaType: primaryMediaType,
      items: genreFillItems.slice(0, 20),
      rotate: false,
    });
  }

  return rows;
}
