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
 * Antigüedad máxima de los metadatos que alimentan Pendientes y Favoritos.
 * Su `vote_average` decide la agrupación por puntuación TMDb: una copia de
 * `tmdb_cache` de meses atrás dejaba títulos en un tramo falso (Rafa, guardada
 * al estrenarse con 9,1 y 18 votos, seguía en 9–9,5 con 8,4 reales).
 */
export const USER_LIST_METADATA_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Espera máxima del refresco dentro de la petición; lo que no llegue a tiempo
// termina en segundo plano y la siguiente carga ya lo trae al día.
export const USER_LIST_METADATA_REFRESH_BUDGET_MS = 4000;
const DEFAULT_REFRESH_CONCURRENCY = 12;

async function readCacheHits(keys) {
  return db
    .select({ cacheKey: tmdbCache.cacheKey, data: tmdbCache.data, fetchedAt: tmdbCache.fetchedAt })
    .from(tmdbCache)
    .where(inArray(tmdbCache.cacheKey, keys));
}

async function fetchTmdbMetadata(type, id) {
  if (!process.env.TMDB_API_KEY) return null;
  const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${process.env.TMDB_API_KEY}&language=es-ES`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) || null;
}

async function writeCacheEntry(type, id, data) {
  const cacheKey = `bare:${type}:${id}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 600 * 1000); // 10 minutes cache TTL
  await db
    .insert(tmdbCache)
    .values({ cacheKey, data, fetchedAt: now, expiresAt })
    .onConflictDoUpdate({
      target: tmdbCache.cacheKey,
      set: { data, fetchedAt: now, expiresAt },
    })
    .catch(() => {});
}

// Limitador de concurrencia: `limit(fn)` devuelve la promesa de `fn` cuando
// le toca turno.
function createLimiter(concurrency) {
  let active = 0;
  const queue = [];
  const pump = () => {
    while (active < concurrency && queue.length) {
      const { fn, resolve } = queue.shift();
      active++;
      Promise.resolve()
        .then(fn)
        .catch(() => {})
        .then((value) => {
          active--;
          resolve(value);
          pump();
        });
    }
  };
  return (fn) => new Promise((resolve) => {
    queue.push({ fn, resolve });
    pump();
  });
}

function waitAtMost(promise, budgetMs) {
  if (!(budgetMs > 0)) return promise;
  let timer;
  const budget = new Promise((resolve) => {
    timer = setTimeout(resolve, budgetMs);
  });
  return Promise.race([promise, budget]).finally(() => clearTimeout(timer));
}

/**
 * Núcleo de `getMediaMetadataMap` con el acceso a caché y TMDb inyectados
 * (para probarlo sin base de datos ni red).
 */
export async function resolveMediaMetadata(rows = [], options = {}, deps = {}) {
  const readCache = deps.readCache || readCacheHits;
  const fetchMetadata = deps.fetchMetadata || fetchTmdbMetadata;
  const writeCache = deps.writeCache || writeCacheEntry;
  const now = deps.now ? deps.now() : Date.now();

  const getMediaType = options.getMediaType || ((row) => row.mediaType);
  const getTmdbId = options.getTmdbId || ((row) => row.tmdbId);
  const fetchMissing = options.fetchMissing !== false;
  const maxAgeMs = Number(options.maxAgeMs) > 0 ? Number(options.maxAgeMs) : null;
  const budgetMs = Number(options.refreshBudgetMs) > 0 ? Number(options.refreshBudgetMs) : null;
  const concurrency = Number(options.refreshConcurrency) > 0
    ? Number(options.refreshConcurrency)
    : DEFAULT_REFRESH_CONCURRENCY;
  const keys = [
    ...new Set(rows.flatMap((row) => cacheKeys(getMediaType(row), getTmdbId(row)))),
  ];

  if (!keys.length) return new Map();

  const hits = await readCache(keys);

  // Una misma ficha puede estar bajo varias claves (`bare:`, `tmdb:`, sin
  // prefijo): gana la copia más reciente.
  const map = new Map();
  const fetchedAtByKey = new Map();
  for (const hit of hits || []) {
    const key = cacheKeyToCanonical(hit.cacheKey);
    const fetchedAt = new Date(hit.fetchedAt).getTime() || 0;
    if (map.has(key) && fetchedAtByKey.get(key) >= fetchedAt) continue;
    map.set(key, hit.data || {});
    fetchedAtByKey.set(key, fetchedAt);
  }

  // Find cache misses (and, with maxAgeMs, stale entries) and fetch them on the fly
  const staleBefore = maxAgeMs ? now - maxAgeMs : null;
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
      missing.push({ type, id, stale });
    }
  }

  if (fetchMissing && missing.length > 0) {
    // Cada respuesta se apunta en `map` al llegar; si TMDb falla, queda la
    // copia vieja. Lo que no estaba en caché se espera siempre; las copias
    // caducadas, como mucho `refreshBudgetMs` (luego siguen en segundo plano).
    const limit = createLimiter(concurrency);
    const refresh = ({ type, id }) => limit(async () => {
      try {
        const data = await fetchMetadata(type, id);
        if (!data) return;
        map.set(`${type}:${id}`, data);
        await writeCache(type, id, data);
      } catch (e) {
        console.warn(`Failed to prefetch metadata for ${type}:${id} in getMediaMetadataMap:`, e);
      }
    });
    const pending = missing.map((entry) => ({ entry, promise: refresh(entry) }));
    await Promise.all([
      Promise.all(pending.filter(({ entry }) => !entry.stale).map(({ promise }) => promise)),
      waitAtMost(
        Promise.all(pending.filter(({ entry }) => entry.stale).map(({ promise }) => promise)),
        budgetMs,
      ),
    ]);
  }

  // Copia: las tareas que sigan en segundo plano no cambian lo ya devuelto.
  return new Map(map);
}

/**
 * Metadatos de TMDb de cada fila, de la caché `tmdb_cache` y, si faltan, de
 * TMDb (se guardan como `bare:`).
 *
 * `maxAgeMs`: la caché no caduca sola al leerla; con esta opción, las entradas
 * más antiguas se vuelven a pedir a TMDb (si falla, se usa la copia vieja).
 * Hace falta cuando el dato cambia con el tiempo, como las temporadas de una
 * serie en emisión o la nota media. Sin ella, cualquier copia vale, por
 * antigua que sea.
 *
 * `refreshBudgetMs`: espera máxima a TMDb; lo que falte sigue en segundo
 * plano. `refreshConcurrency`: peticiones a la vez (12 por defecto).
 */
export async function getMediaMetadataMap(rows = [], options = {}) {
  return resolveMediaMetadata(rows, options);
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
