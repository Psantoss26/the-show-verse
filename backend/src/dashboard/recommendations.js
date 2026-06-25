// backend/src/dashboard/recommendations.js
// Hybrid recommendation builder with TTL cache.

import { db } from '../db/client.js';
import { userRecommendations } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

import { loadLibrary, buildSeeds, libraryBasisHash } from './library.js';
import { aggregateCandidates, excludeSeen, mergeGenreFill } from './score.js';
import { tmdbList, tmdbDiscover } from './tmdb.js';

// Piso de votos para las recomendaciones: descartamos candidatos con muy pocos
// votos (poco representativos). TV acumula menos votos que cine.
const REC_MIN_VOTES = { movie: 150, tv: 60 };
// Umbral de votos para el relleno por afinidad de género (títulos conocidos).
const GENRE_FILL_VOTES = { movie: 1000, tv: 300 };

/**
 * Get personalised recommendations for a user, backed by a 24h DB cache.
 *
 * Cache invalidation: a row is considered fresh only when
 *   - expiresAt is in the future, AND
 *   - basisHash matches the current library state.
 * On any rebuild error the stale cached row (or []) is returned.
 *
 * @param {string} userId
 * @param {'movie'|'tv'} mediaType
 * @param {{ lib: object, basisHash: string } | null} [preloaded=null] - Optional preloaded library to avoid re-loading.
 * @returns {Promise<Array>} recItem[]
 */
export async function getUserRecommendations(userId, mediaType, preloaded = null) {
  // ── 1. Load library + compute hash ──────────────────────────────────────
  const lib = preloaded?.lib || await loadLibrary(userId);
  const basisHash = preloaded?.basisHash || libraryBasisHash(lib);

  // ── 2. Read cached row ───────────────────────────────────────────────────
  const [row] = await db
    .select()
    .from(userRecommendations)
    .where(
      and(
        eq(userRecommendations.userId, userId),
        eq(userRecommendations.mediaType, mediaType)
      )
    )
    .limit(1);

  if (row && row.expiresAt > new Date() && row.basisHash === basisHash) {
    return row.items;
  }

  // ── 3. Rebuild ───────────────────────────────────────────────────────────
  try {
    const seeds = buildSeeds(lib)
      .filter((s) => s.mediaType === mediaType)
      .slice(0, 20)
      .map((s) => ({ ...s, title: s.title ?? null }));

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (seeds.length === 0) {
      await db
        .insert(userRecommendations)
        .values({ userId, mediaType, items: [], basisHash, builtAt: new Date(), expiresAt })
        .onConflictDoUpdate({
          target: [userRecommendations.userId, userRecommendations.mediaType],
          set: { items: [], basisHash, builtAt: new Date(), expiresAt },
        });
      return [];
    }

    // ── fetchSimilar: recommendations + similar from TMDB ─────────────────
    const fetchSimilar = async (seed) => {
      const type = seed.mediaType;
      const [recs, sim] = await Promise.all([
        tmdbList({ path: `/${type}/${seed.tmdbId}/recommendations`, mediaType: type, pages: 1 }).catch(() => []),
        tmdbList({ path: `/${type}/${seed.tmdbId}/similar`, mediaType: type, pages: 1 }).catch(() => []),
      ]);
      return { recommendations: recs, similar: sim };
    };

    // ── Aggregate candidates ───────────────────────────────────────────────
    let items = await aggregateCandidates({ seeds, fetchSimilar });

    // ── Build seen set (history + favorites + watchlist + seeds) ───────────
    const seen = new Set();
    for (const r of [...lib.history, ...lib.favorites, ...lib.watchlist, ...seeds]) {
      seen.add(`${r.mediaType}:${r.tmdbId}`);
    }
    items = excludeSeen(items, seen);

    // Descartar candidatos con muy pocos votos (poco representativos).
    const minVotes = REC_MIN_VOTES[mediaType] ?? 0;
    items = items.filter((c) => (c.voteCount || 0) >= minVotes);

    // ── Genre-affinity fill ────────────────────────────────────────────────
    // Tally genreIds across the top 30 items (already scored candidates)
    const genreCounts = new Map();
    for (const item of items.slice(0, 30)) {
      for (const gid of item.genreIds || []) {
        genreCounts.set(gid, (genreCounts.get(gid) || 0) + 1);
      }
    }

    if (genreCounts.size > 0) {
      // Pick top 2 genre ids by frequency
      const topGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([gid]) => gid);

      const fillArrays = await Promise.all(
        topGenres.map((genreId) =>
          tmdbDiscover({
            mediaType,
            params: {
              with_genres: genreId,
              sort_by: 'popularity.desc',
              'vote_count.gte': GENRE_FILL_VOTES[mediaType] ?? 800,
            },
          }).catch(() => [])
        )
      );

      const allFill = fillArrays.flat();
      const filteredFill = excludeSeen(allFill, seen);
      items = mergeGenreFill(items, filteredFill, 0.5);
    }

    // ── Cap ────────────────────────────────────────────────────────────────
    items = items.slice(0, 80);

    // ── Upsert ────────────────────────────────────────────────────────────
    await db
      .insert(userRecommendations)
      .values({ userId, mediaType, items, basisHash, builtAt: new Date(), expiresAt })
      .onConflictDoUpdate({
        target: [userRecommendations.userId, userRecommendations.mediaType],
        set: { items, basisHash, builtAt: new Date(), expiresAt },
      });

    return items;
  } catch (err) {
    // On any rebuild error return stale cache or empty array
    console.error('[recommendations] rebuild error:', err);
    return row?.items || [];
  }
}
