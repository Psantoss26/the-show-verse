// src/lib/tmdbCollection.js
// Colección de TMDb (sagas) con caché propia en tmdb_cache: cambia muy poco.
// La usan las alertas de "siguiente de la saga" y la actividad del perfil (me
// gusta en colecciones, que solo guardan el id de TMDb).

import { eq } from 'drizzle-orm';
import { tmdbCache } from '../db/schema.js';

const COLLECTION_CACHE_MS = 24 * 60 * 60 * 1000;

export async function getTmdbCollection(db, collectionId) {
  const cacheKey = `bare:collection:${collectionId}`;
  const [hit] = await db
    .select({ data: tmdbCache.data, expiresAt: tmdbCache.expiresAt })
    .from(tmdbCache)
    .where(eq(tmdbCache.cacheKey, cacheKey))
    .limit(1);
  if (hit && (!hit.expiresAt || new Date(hit.expiresAt) > new Date())) return hit.data;
  if (!process.env.TMDB_API_KEY) return hit?.data || null;

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${process.env.TMDB_API_KEY}&language=es-ES`,
    );
    if (!res.ok) return hit?.data || null;
    const data = await res.json();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + COLLECTION_CACHE_MS);
    await db
      .insert(tmdbCache)
      .values({ cacheKey, data, fetchedAt: now, expiresAt })
      .onConflictDoUpdate({ target: tmdbCache.cacheKey, set: { data, fetchedAt: now, expiresAt } })
      .catch(() => {});
    return data;
  } catch {
    return hit?.data || null;
  }
}
