// backend/src/community/ratingStats.js
// Puntuaciones de los usuarios de The Show Verse para un título: media, número
// de votos y reparto en 10 barras (1–10). La escala admite medias notas
// (step 0.5); cada media nota cuenta en la barra de su entero inferior
// (9,5 → «9»), así el 10 solo recoge los dieces. La media sí usa la nota exacta.

import { and, eq, isNull, sql } from 'drizzle-orm';
import { userRatings } from '../db/schema.js';

export const RATING_SCORES = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

// rows: [{ rating, count }] — una fila por nota exacta (agrupado en SQL).
export function summarizeRatingBuckets(rows) {
  const buckets = new Map(RATING_SCORES.map((score) => [score, 0]));
  let count = 0;
  let sum = 0;

  for (const row of rows || []) {
    const rating = Number(row?.rating);
    const n = Number(row?.count);
    if (!Number.isFinite(rating) || rating < 1 || rating > 10) continue;
    if (!Number.isFinite(n) || n <= 0) continue;
    const score = Math.min(10, Math.max(1, Math.floor(rating)));
    buckets.set(score, buckets.get(score) + n);
    count += n;
    sum += rating * n;
  }

  return {
    count,
    average: count > 0 ? Math.round((sum / count) * 100) / 100 : null,
    histogram: RATING_SCORES.map((score) => ({ score, count: buckets.get(score) })),
  };
}

// Título completo (película o serie). Las notas de temporadas y episodios
// tienen su propia identidad y no entran en la del título.
export async function getTitleRatingStats(db, { mediaType, tmdbId }) {
  const rows = await db
    .select({
      rating: userRatings.rating,
      count: sql`count(*)::int`,
    })
    .from(userRatings)
    .where(and(
      eq(userRatings.tmdbId, Number(tmdbId)),
      eq(userRatings.mediaType, mediaType),
      isNull(userRatings.season),
      isNull(userRatings.episode),
    ))
    .groupBy(userRatings.rating);

  return summarizeRatingBuckets(rows);
}
