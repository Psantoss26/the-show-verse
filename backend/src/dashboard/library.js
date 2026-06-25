// backend/src/dashboard/library.js
import { db } from '../db/client.js';
import { favorites, watchlist, watchHistory, userRatings } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

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
function ratingWeight(rating) {
  if (rating >= 8) return 5;
  if (rating === 7) return 3;
  return 0;
}

// ─────────────────────────────────────────────
// buildSeeds — pure
// ─────────────────────────────────────────────
/**
 * Build a weighted seed list from the user's library.
 *
 * Weights (summed when a title appears in multiple sources):
 *   rating ≥ 8  → 5
 *   favorite    → 4
 *   rating === 7 → 3
 *   recent history (distinct tmdbId:mediaType) → 2
 *   watchlist   → 1
 *
 * @param {{ favorites: {tmdbId, mediaType}[], ratings: {tmdbId, mediaType, rating}[], history: {tmdbId, mediaType}[], watchlist: {tmdbId, mediaType}[] }} param0
 * @returns {{ tmdbId: number, mediaType: string, weight: number }[]}
 */
export function buildSeeds({ favorites: favs = [], ratings = [], history = [], watchlist: wl = [] }) {
  /** @type {Map<string, { tmdbId: number, mediaType: string, weight: number }>} */
  const map = new Map();

  function addWeight(tmdbId, mediaType, delta) {
    const key = `${mediaType}:${tmdbId}`;
    if (!map.has(key)) {
      map.set(key, { tmdbId, mediaType, weight: 0 });
    }
    map.get(key).weight += delta;
  }

  // ratings (≥8 → 5, ===7 → 3, <7 → 0)
  for (const r of ratings) {
    const w = ratingWeight(r.rating);
    if (w > 0) addWeight(r.tmdbId, r.mediaType, w);
  }

  // favorites → 4
  for (const f of favs) {
    addWeight(f.tmdbId, f.mediaType, 4);
  }

  // history (each distinct tmdbId:mediaType) → 2
  for (const h of history) {
    addWeight(h.tmdbId, h.mediaType, 2);
  }

  // watchlist → 1
  for (const w of wl) {
    addWeight(w.tmdbId, w.mediaType, 1);
  }

  // Sort by weight desc, cap to 25
  return Array.from(map.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 25);
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
 *   ratings   → `rating:${mediaType}:${tmdbId}:${ratingBucket}` where bucket = ≥8→'hi', 7→'mid', <7→'lo'
 *   history   → `hist:${mediaType}:${tmdbId}`
 *   watchlist → `wl:${mediaType}:${tmdbId}`
 *
 * @returns {string} hex hash
 */
export function libraryBasisHash({ favorites: favs = [], ratings = [], history = [], watchlist: wl = [] }) {
  const tokens = [];

  for (const f of favs) {
    tokens.push(`fav:${f.mediaType}:${f.tmdbId}`);
  }

  for (const r of ratings) {
    const bucket = r.rating >= 8 ? 'hi' : r.rating === 7 ? 'mid' : 'lo';
    tokens.push(`rating:${r.mediaType}:${r.tmdbId}:${bucket}`);
  }

  for (const h of history) {
    tokens.push(`hist:${h.mediaType}:${h.tmdbId}`);
  }

  for (const w of wl) {
    tokens.push(`wl:${w.mediaType}:${w.tmdbId}`);
  }

  tokens.sort();
  return fnv1a(tokens.join('|'));
}

// ─────────────────────────────────────────────
// loadLibrary — async, Drizzle
// ─────────────────────────────────────────────
/**
 * Load the user's library from the database.
 *
 * @param {string} userId
 * @returns {Promise<{ favorites: {tmdbId, mediaType}[], ratings: {tmdbId, mediaType, rating}[], history: {tmdbId, mediaType}[], watchlist: {tmdbId, mediaType}[] }>}
 */
export async function loadLibrary(userId) {
  const [favRows, ratingRows, histRows, wlRows] = await Promise.all([
    // favorites — all rows for userId
    db
      .select({ tmdbId: favorites.tmdbId, mediaType: favorites.mediaType })
      .from(favorites)
      .where(eq(favorites.userId, userId)),

    // ratings — all rows for userId
    db
      .select({ tmdbId: userRatings.tmdbId, mediaType: userRatings.mediaType, rating: userRatings.rating })
      .from(userRatings)
      .where(eq(userRatings.userId, userId)),

    // history — most-recent 100 rows, then distinct by mediaType:tmdbId in JS
    db
      .select({ tmdbId: watchHistory.tmdbId, mediaType: watchHistory.mediaType })
      .from(watchHistory)
      .where(eq(watchHistory.userId, userId))
      .orderBy(desc(watchHistory.watchedAt))
      .limit(100),

    // watchlist — all rows for userId
    db
      .select({ tmdbId: watchlist.tmdbId, mediaType: watchlist.mediaType })
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
