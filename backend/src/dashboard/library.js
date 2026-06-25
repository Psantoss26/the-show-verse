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
// Las valoraciones altas son la señal principal y pesan por encima de favoritos,
// historial y watchlist. Por debajo de 7 no genera semilla (no gustó lo bastante).
function ratingWeight(rating) {
  if (rating >= 9) return 10; // señal principal
  if (rating === 8) return 7; // señal positiva
  if (rating === 7) return 4; // señal secundaria
  return 0;
}

const FAVORITE_WEIGHT = 6;  // fuerte, pero por debajo de valoraciones muy altas
const HISTORY_WEIGHT = 2;   // visionado sin valoración: señal débil
const WATCHLIST_WEIGHT = 1; // pendiente: señal muy débil

// ─────────────────────────────────────────────
// buildSeeds — pure
// ─────────────────────────────────────────────
/**
 * Build a weighted seed list from the user's library.
 *
 * Weights (summed when a title appears in multiple sources):
 *   rating ≥ 9  → 10   (señal principal)
 *   rating = 8  → 7    (señal positiva)
 *   favorite    → 6    (fuerte, bajo valoraciones muy altas)
 *   rating = 7  → 4    (señal secundaria)
 *   history     → 2    (visionado sin valoración)
 *   watchlist   → 1    (pendiente)
 *
 * `strongPositive` = el usuario realmente disfrutó el título (rating ≥ 8 o
 * favorito). Solo estas semillas habilitan filas "Porque viste…".
 *
 * @param {{ favorites: {tmdbId, mediaType, title?}[], ratings: {tmdbId, mediaType, rating, title?}[], history: {tmdbId, mediaType, title?}[], watchlist: {tmdbId, mediaType, title?}[] }} param0
 * @returns {{ tmdbId: number, mediaType: string, weight: number, title: string|null, strongPositive: boolean }[]}
 */
export function buildSeeds({ favorites: favs = [], ratings = [], history = [], watchlist: wl = [] }) {
  /** @type {Map<string, { tmdbId: number, mediaType: string, weight: number, title: string|null, maxRating: number, favorite: boolean }>} */
  const map = new Map();

  function ensure(tmdbId, mediaType, title) {
    const key = `${mediaType}:${tmdbId}`;
    if (!map.has(key)) {
      map.set(key, { tmdbId, mediaType, weight: 0, title: title || null, maxRating: 0, favorite: false });
    } else if (title && !map.get(key).title) {
      map.get(key).title = title;
    }
    return map.get(key);
  }

  // ratings (≥9 → 10, =8 → 7, =7 → 4, <7 → 0)
  for (const r of ratings) {
    const entry = ensure(r.tmdbId, r.mediaType, r.title);
    if (typeof r.rating === 'number' && r.rating > entry.maxRating) entry.maxRating = r.rating;
    entry.weight += ratingWeight(r.rating);
  }

  // favorites → 6
  for (const f of favs) {
    const entry = ensure(f.tmdbId, f.mediaType, f.title);
    entry.favorite = true;
    entry.weight += FAVORITE_WEIGHT;
  }

  // history (each distinct tmdbId:mediaType) → 2
  for (const h of history) {
    ensure(h.tmdbId, h.mediaType, h.title).weight += HISTORY_WEIGHT;
  }

  // watchlist → 1
  for (const w of wl) {
    ensure(w.tmdbId, w.mediaType, w.title).weight += WATCHLIST_WEIGHT;
  }

  // Descartamos las entradas sin peso (p. ej. solo valoraciones < 7).
  // Marcamos strongPositive y ordenamos por peso (valoración alta primero).
  return Array.from(map.values())
    .filter((s) => s.weight > 0)
    .map(({ maxRating, favorite, ...s }) => ({
      ...s,
      strongPositive: maxRating >= 8 || favorite,
    }))
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
