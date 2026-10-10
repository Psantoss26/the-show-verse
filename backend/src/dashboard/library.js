// backend/src/dashboard/library.js
import { db } from '../db/client.js';
import { favorites, watchlist, watchHistory, userRatings } from '../db/schema.js';
import { eq, desc, and, inArray } from 'drizzle-orm';

// ─────────────────────────────────────────────
// FNV-1a 32-bit hash (hex string output)
// ─────────────────────────────────────────────
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Multiply by FNV prime 0x01000193, keeping 32-bit unsigned
    hash = (Math.imul(hash, 0x01000193) >>> 0);
  }
  return hash.toString(16).padStart(8, '0');
}

// ─────────────────────────────────────────────
// Weight helper: rating → weight contribution
// ─────────────────────────────────────────────
// Explicit enjoyment is stronger than intent or a casual viewing. A poor
// rating overrides an old favorite/watchlist entry rather than becoming a seed.
function ratingWeight(rating) {
  if (rating >= 9) return 10;
  if (rating >= 8) return 7;
  if (rating >= 7) return 4;
  return 0;
}

export function buildSeeds({ favorites = [], ratings = [], history = [], watchlist = [] }) {
  const entries = new Map();
  const ensure = (item) => {
    if (!['movie', 'tv'].includes(item?.mediaType) || !(Number(item.tmdbId) > 0)) return null;
    const key = `${item.mediaType}:${item.tmdbId}`;
    if (!entries.has(key)) entries.set(key, {
      tmdbId: Number(item.tmdbId), mediaType: item.mediaType, title: item.title || null,
      rating: null, favorite: false, watched: false, pending: false,
    });
    const entry = entries.get(key);
    if (!entry.title && item.title) entry.title = item.title;
    return entry;
  };
  for (const item of ratings) {
    const entry = ensure(item);
    const rating = Number(item.rating);
    if (entry && Number.isFinite(rating) && rating >= 1 && rating <= 10) entry.rating = rating;
  }
  for (const [items, flag] of [[favorites, 'favorite'], [history, 'watched'], [watchlist, 'pending']]) {
    for (const item of items) {
      const entry = ensure(item);
      if (entry) entry[flag] = true;
    }
  }
  const counts = { movie: 0, tv: 0 };
  return [...entries.values()]
    .filter((entry) => entry.rating == null || entry.rating > 5)
    .map(({ rating, favorite, watched, pending, ...entry }) => ({
      ...entry,
      weight: ratingWeight(rating) + (favorite ? 6 : 0) + (watched ? 1 : 0) + (pending ? 3 : 0),
      strongPositive: rating >= 8 || favorite,
    }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.tmdbId - b.tmdbId)
    // Cap per type: a film-heavy library must not starve the Series dashboard.
    .filter((entry) => ++counts[entry.mediaType] <= 25);
}

export function dislikedIds(lib) {
  return new Set((lib?.ratings || [])
    .filter((item) => Number(item.rating) >= 1 && Number(item.rating) <= 5)
    .map((item) => `${item.mediaType}:${item.tmdbId}`));
}

// ─────────────────────────────────────────────
// libraryBasisHash — pure, stable
// ─────────────────────────────────────────────
/**
 * Compute a stable hash of the user's library state.
 * Tokens are sorted before hashing so order of input arrays doesn't matter.
 *
 * Token formats:
 *   favorites → `fav:${mediaType}:${tmdbId}`
 *   ratings   → `rating:${mediaType}:${tmdbId}:${rating}` (exact numeric value)
 *   history   → `hist:${mediaType}:${tmdbId}`
 *   watchlist → `wl:${mediaType}:${tmdbId}`
 *
 * @returns {string} hex hash
 */
// Versión del ALGORITMO de semillas/recomendación. Se incluye en el hash para
// que un cambio de pesos (que no altera el contenido de la biblioteca) invalide
// la caché de 24h de `user_recommendations` y se recalcule con el nuevo criterio.
// SUBIR esta versión cada vez que se cambie buildSeeds/scoring. (v2: watchlist
// pasó a señal principal; v3: disfrute explícito, señales negativas y ranking.)
const RECS_ALGO_VERSION = 'v3';

export function libraryBasisHash({ favorites: favs = [], ratings = [], history = [], watchlist: wl = [] }) {
  const tokens = [`algo:${RECS_ALGO_VERSION}`];

  for (const f of favs) {
    tokens.push(`fav:${f.mediaType}:${f.tmdbId}`);
  }

  for (const r of ratings) {
    const bucket = Number(r.rating);
    tokens.push(`rating:${r.mediaType}:${r.tmdbId}:${bucket}`);
  }

  for (const h of history) {
    tokens.push(`hist:${h.mediaType}:${h.tmdbId}`);
  }

  for (const w of wl) {
    tokens.push(`wl:${w.mediaType}:${w.tmdbId}`);
  }

  return fnv1a([...new Set(tokens)].sort().join('|'));
}

// ─────────────────────────────────────────────
// loadLibrary — async, Drizzle
// ─────────────────────────────────────────────
/**
 * Load the user's library from the database.
 *
 * @param {string} userId
 * @returns {Promise<{ favorites: {tmdbId, mediaType, title}[], ratings: {tmdbId, mediaType, rating, title}[], history: {tmdbId, mediaType, title}[], watchlist: {tmdbId, mediaType, title}[] }>}
 */
export async function loadLibrary(userId) {
  const [favRows, ratingRows, histRows, wlRows] = await Promise.all([
    // favorites — all rows for userId
    db
      .select({ tmdbId: favorites.tmdbId, mediaType: favorites.mediaType, title: favorites.title })
      .from(favorites)
      .where(eq(favorites.userId, userId)),

    // ratings — only movie/tv rows for userId (episode ratings are not valid TMDB discovery types)
    db
      .select({ tmdbId: userRatings.tmdbId, mediaType: userRatings.mediaType, rating: userRatings.rating, title: userRatings.title })
      .from(userRatings)
      .where(and(eq(userRatings.userId, userId), inArray(userRatings.mediaType, ['movie', 'tv']))),

    // history — most-recent 100 rows, then distinct by mediaType:tmdbId in JS
    db
      .select({ tmdbId: watchHistory.tmdbId, mediaType: watchHistory.mediaType, title: watchHistory.title })
      .from(watchHistory)
      .where(eq(watchHistory.userId, userId))
      .orderBy(desc(watchHistory.watchedAt))
      .limit(100),

    // watchlist — all rows for userId
    db
      .select({ tmdbId: watchlist.tmdbId, mediaType: watchlist.mediaType, title: watchlist.title })
      .from(watchlist)
      .where(eq(watchlist.userId, userId)),
  ]);

  // De-duplicate history by mediaType:tmdbId (keep first/most-recent occurrence)
  const seen = new Set();
  const distinctHistory = [];
  for (const row of histRows) {
    const key = `${row.mediaType}:${row.tmdbId}`;
    if (!seen.has(key)) {
      seen.add(key);
      distinctHistory.push(row);
    }
  }

  return {
    favorites: favRows,
    ratings: ratingRows,
    history: distinctHistory,
    watchlist: wlRows,
  };
}
