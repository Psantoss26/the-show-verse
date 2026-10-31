import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tmdbCache } from '../db/schema.js';

function normalizedType(mediaType) {
  if (mediaType === 'movie') return 'movie';
  if (mediaType === 'tv' || mediaType === 'show') return 'tv';
  return null;
}

function canonicalKey(mediaType, tmdbId) {
  const type = normalizedType(mediaType);
  if (!type || !tmdbId) return null;
  return `${type}:${tmdbId}`;
}

function cacheKeys(mediaType, tmdbId) {
  const key = canonicalKey(mediaType, tmdbId);
  if (!key) return [];
  return [`bare:${key}`, `tmdb:${key}`, key];
}

function cacheKeyToCanonical(cacheKey) {
  return String(cacheKey || '').replace(/^(tmdb|bare):/, '');
}

/**
 * Metadatos de TMDb de cada fila, de la caché `tmdb_cache` y, si faltan, de
 * TMDb (se guardan como `bare:`).
 *
 * `maxAgeMs`: la caché no caduca sola al leerla; con esta opción, las entradas
 * más antiguas se vuelven a pedir a TMDb (si falla, se usa la copia vieja).
 * Hace falta cuando el dato cambia con el tiempo, como las temporadas de una
 * serie en emisión. Sin ella, cualquier copia vale, por antigua que sea.
 */
export async function getMediaMetadataMap(rows = [], options = {}) {
  const getMediaType = options.getMediaType || ((row) => row.mediaType);
  const getTmdbId = options.getTmdbId || ((row) => row.tmdbId);
  const fetchMissing = options.fetchMissing !== false;
  const maxAgeMs = Number(options.maxAgeMs) > 0 ? Number(options.maxAgeMs) : null;
  const keys = [
    ...new Set(rows.flatMap((row) => cacheKeys(getMediaType(row), getTmdbId(row)))),
  ];

  if (!keys.length) return new Map();

  const hits = await db
    .select({ cacheKey: tmdbCache.cacheKey, data: tmdbCache.data, fetchedAt: tmdbCache.fetchedAt })
    .from(tmdbCache)
    .where(inArray(tmdbCache.cacheKey, keys));

  // Una misma ficha puede estar bajo varias claves (`bare:`, `tmdb:`, sin
  // prefijo): gana la copia más reciente.
  const map = new Map();
  const fetchedAtByKey = new Map();
  for (const hit of hits) {
    const key = cacheKeyToCanonical(hit.cacheKey);
    const fetchedAt = new Date(hit.fetchedAt).getTime() || 0;
    if (map.has(key) && fetchedAtByKey.get(key) >= fetchedAt) continue;
    map.set(key, hit.data || {});
    fetchedAtByKey.set(key, fetchedAt);
  }

  // Find cache misses (and, with maxAgeMs, stale entries) and fetch them on the fly
  const staleBefore = maxAgeMs ? Date.now() - maxAgeMs : null;
  const missing = [];
  const queued = new Set();
  for (const row of rows) {
    const type = normalizedType(getMediaType(row));
    const id = getTmdbId(row);
    const key = `${type}:${id}`;
    if (!type || !id || queued.has(key)) continue;
    const stale = staleBefore != null && map.has(key) && fetchedAtByKey.get(key) < staleBefore;
    if (!map.has(key) || stale) {
      queued.add(key);
      missing.push({ type, id });
    }
  }

  if (fetchMissing && missing.length > 0 && process.env.TMDB_API_KEY) {
    await Promise.all(
      missing.map(async ({ type, id }) => {
        try {
          const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${process.env.TMDB_API_KEY}&language=es-ES`;
          const res = await fetch(url);
          if (!res.ok) return;
          const data = await res.json();
          if (data) {
            const cacheKey = `bare:${type}:${id}`;
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 600 * 1000); // 10 minutes cache TTL
            await db
              .insert(tmdbCache)
              .values({
                cacheKey,
                data,
                fetchedAt: now,
                expiresAt,
              })
              .onConflictDoUpdate({
                target: tmdbCache.cacheKey,
                set: { data, fetchedAt: now, expiresAt },
              })
              .catch(() => {});
            
            map.set(`${type}:${id}`, data);
          }
        } catch (e) {
          console.warn(`Failed to prefetch metadata for ${type}:${id} in getMediaMetadataMap:`, e);
        }
      })
    );
  }

  return map;
}

export function metadataFor(metadataByKey, mediaType, tmdbId) {
  const key = canonicalKey(mediaType, tmdbId);
  return key ? metadataByKey.get(key) || null : null;
}

export function mediaYearFromMetadata(metadata, mediaType) {
  const date =
    mediaType === 'movie'
      ? metadata?.release_date
      : metadata?.first_air_date;
  return date ? String(date).slice(0, 4) : null;
}

export function genreIdsFromMetadata(metadata) {
  return Array.isArray(metadata?.genres)
    ? metadata.genres.map((genre) => genre?.id).filter(Boolean)
    : [];
}

export function genreNamesFromMetadata(metadata) {
  return Array.isArray(metadata?.genres)
    ? metadata.genres
        .map((genre) => (typeof genre === 'string' ? genre : genre?.name))
        .filter(Boolean)
    : [];
}

export function hydrateMediaRow(row, metadataByKey) {
  const metadata = metadataFor(metadataByKey, row.mediaType, row.tmdbId);
  const isMovie = row.mediaType === 'movie';
  const title =
    row.title ||
    (isMovie
      ? metadata?.title || metadata?.original_title
      : metadata?.name || metadata?.original_name) ||
    null;

  return {
    ...row,
    title,
    posterPath: row.posterPath || metadata?.poster_path || null,
    backdropPath: metadata?.backdrop_path || null,
    releaseDate: metadata?.release_date || null,
    firstAirDate: metadata?.first_air_date || null,
    year: mediaYearFromMetadata(metadata, row.mediaType),
    genreIds: genreIdsFromMetadata(metadata),
    genres: Array.isArray(metadata?.genres) ? metadata.genres : [],
    genreNames: genreNamesFromMetadata(metadata),
    overview: metadata?.overview || null,
    voteAverage: metadata?.vote_average ?? null,
    runtimeMins: row.runtimeMins || metadata?.runtime || null,
    numberOfSeasons: metadata?.number_of_seasons || null,
    numberOfEpisodes: metadata?.number_of_episodes || null,
    seasons: Array.isArray(metadata?.seasons) ? metadata.seasons : [],
    status: metadata?.status || null,
    networks: Array.isArray(metadata?.networks) ? metadata.networks : [],
  };
}
