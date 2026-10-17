// src/lib/tmdbPerson.js
// Persona/Actor de TMDb con caché propia en tmdb_cache.
// La usa la actividad del perfil (me gusta en actores, que solo guardan el personId de TMDb).

import { eq } from 'drizzle-orm';
import { tmdbCache } from '../db/schema.js';

const PERSON_CACHE_MS = 24 * 60 * 60 * 1000;

export async function getTmdbPerson(db, personId) {
  const cacheKey = `bare:person:${personId}`;
  const [hit] = await db
    .select({ data: tmdbCache.data, expiresAt: tmdbCache.expiresAt })
    .from(tmdbCache)
    .where(eq(tmdbCache.cacheKey, cacheKey))
    .limit(1);
  if (hit && (!hit.expiresAt || new Date(hit.expiresAt) > new Date())) return hit.data;
  if (!process.env.TMDB_API_KEY) return hit?.data || null;

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/person/${personId}?api_key=${process.env.TMDB_API_KEY}&language=es-ES`,
    );
    if (!res.ok) return hit?.data || null;
    const data = await res.json();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PERSON_CACHE_MS);
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
