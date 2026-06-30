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
        title: 'Tendencias ahora mismo',
        mediaType: 'mixed',
        source: { kind: 'pool', poolKey: 'trending' },
      },
      {
        key: 'popular',
        title: 'Lo que más se está viendo',
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
        key: 'acclaimed',
        title: 'Aclamadas que merecen la pena',
        mediaType: 'mixed',
        source: { kind: 'pool', poolKey: 'acclaimed' },
      },
      {
        key: 'action_adventure',
        title: 'Acción y aventura con ritmo',
        mediaType: 'mixed',
        source: { kind: 'pool', poolKey: 'curated:action_adventure' },
      },
      {
        key: 'nostalgia_millennial',
        title: 'Favoritos de los 90 y 2000',
        mediaType: 'mixed',
        source: { kind: 'pool', poolKey: 'curated:nostalgia_millennial' },
      },
      {
        key: 'hidden_gems',
        title: 'Joyas para descubrir',
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
        title: 'Tendencias ahora mismo',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'trending' },
      },
      {
        key: 'region_top',
        title: 'Top de hoy en España',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'region_top' },
      },
      {
        key: 'popular',
        title: 'Películas que todo el mundo está viendo',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'popular' },
      },
      {
        key: 'acclaimed',
        title: 'Premiadas y aclamadas',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'acclaimed' },
      },
      {
        key: 'drama',
        title: 'Dramas que enganchan',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'curated:drama' },
      },
      {
        key: 'action_adventure',
        title: 'Acción y aventura sin pausa',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'curated:action_adventure' },
      },
      {
        key: 'top_rated',
        title: 'Las más valoradas',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'top_rated' },
      },
      {
        key: 'blockbusters',
        title: 'Grandes éxitos de siempre',
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
        title: 'Películas que quizá se te escaparon',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'hidden_gems' },
      },
      {
        key: 'nostalgia_millennial',
        title: 'Una dosis de nostalgia',
        mediaType: 'movie',
        source: { kind: 'pool', poolKey: 'curated:nostalgia_millennial' },
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
        title: 'Tendencias ahora mismo',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'trending' },
      },
      {
        key: 'region_top',
        title: 'Top de hoy en España',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'region_top' },
      },
      {
        key: 'popular',
        title: 'Series que se están viendo ahora',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'popular' },
      },
      {
        key: 'acclaimed',
        title: 'Series aclamadas para descubrir',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'acclaimed' },
      },
      {
        key: 'action_adventure',
        title: 'Series de acción y aventura',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'curated:action_adventure' },
      },
      {
        key: 'drama',
        title: 'Dramas seriados que enganchan',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'curated:drama' },
      },
      {
        key: 'top_rated',
        title: 'Las más valoradas',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'top_rated' },
      },
      {
        key: 'blockbusters',
        title: 'Fenómenos que todo el mundo comenta',
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
        title: 'Series que quizá se te escaparon',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'hidden_gems' },
      },
      {
        key: 'nostalgia_millennial',
        title: 'Series para una dosis de nostalgia',
        mediaType: 'tv',
        source: { kind: 'pool', poolKey: 'curated:nostalgia_millennial' },
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

// Proporción máxima de títulos ya vistos en filas personalizadas.
const FOR_YOU_SEEN_LIMIT = 0.3;   // Recomendaciones generales: algunos vistos, sin dominar
const BECAUSE_SEEN_LIMIT = 0.15;  // "Porque te gustó…": vistos solo como excepción

// Tamaño de pool de cada fila personalizada. Es mayor que `perRow` (28) para que
// la rotación con semilla por superficie produzca subconjuntos distintos entre
// Inicio/Películas/Series (variedad) sin salir de las mejores recomendaciones.
const FOR_YOU_POOL = 64;
const BECAUSE_POOL = 48;

// Intercala dos listas conservando el orden de cada una (para mezclar pelis y
// series en Inicio sin que un tipo domine por puntuación).
function interleaveByScore(a, b) {
  const out = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/**
 * Build personalized row defs from recommendation items.
 *
 * @param {{ movie: recItem[], tv: recItem[] }} recsByType
 * @param {{ mediaTypes: ('movie'|'tv')[], genericRows: any[] }} surface
 * @returns {Array<{ key, title, reason?, mediaType, items, rotate, seenRatioLimit }>}
 *
 * recItem = { ...card, score, reasons: Array<{ type:'because'|'based_on_genres', seedTmdbId?, seedTitle? }> }
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

  // 2. Recomendaciones diarias — en Inicio mezcla pelis y series; pool amplio
  //    + rotación por superficie para no repetir el mismo set entre dashboards.
  let forYouPool;
  if (isHome) {
    const mv = all.filter((i) => i.mediaType === 'movie');
    const tv = all.filter((i) => i.mediaType === 'tv');
    forYouPool = interleaveByScore(mv, tv);
  } else {
    forYouPool = all;
  }
  rows.push({
    key: 'for_you',
    title: 'Recomendaciones de hoy para ti',
    reason: undefined,
    mediaType: primaryMediaType,
    items: forYouPool.slice(0, FOR_YOU_POOL),
    rotate: true,
    seenRatioLimit: FOR_YOU_SEEN_LIMIT,
  });

  // 3. "Porque te gustó {seedTitle}" (máx 2). Las razones 'because' solo provienen
  //    de semillas que el usuario disfrutó (rating ≥ 8 o favorito; ver score.js),
  //    así que estas filas reflejan gustos reales, no visionados casuales.
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

  // Top 2 grupos con >= 15 candidatos (mínimo por fila)
  const topBecauseGroups = [...becauseGroups.entries()]
    .filter(([, g]) => g.items.length >= 15)
    .sort(([, a], [, b]) => b.items.length - a.items.length)
    .slice(0, 2);

  for (const [seedTmdbId, { seedTitle, items }] of topBecauseGroups) {
    rows.push({
      key: `because_${seedTmdbId}`,
      title: `Porque te gustó ${seedTitle}`,
      reason: 'Porque te gustó',
      mediaType: primaryMediaType,
      items: items.slice(0, BECAUSE_POOL),
      rotate: true,
      seenRatioLimit: BECAUSE_SEEN_LIMIT,
    });
  }

  // 4. Afinidad de género — relleno personalizado para ampliar variedad
  const genreFillItems = all.filter((item) =>
    item.reasons?.some((r) => r.type === 'based_on_genres'),
  );

  if (genreFillItems.length >= 15) {
    rows.push({
      key: 'genre_fill',
      title: 'Creemos que te van a encantar',
      reason: undefined,
      mediaType: primaryMediaType,
      items: genreFillItems.slice(0, FOR_YOU_POOL),
      rotate: true,
      seenRatioLimit: FOR_YOU_SEEN_LIMIT,
    });
  }

  return rows;
}
