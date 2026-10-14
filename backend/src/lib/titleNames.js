// Nombres de un título en inglés, en español y el original, para que el
// buscador de las páginas de usuario lo encuentre por cualquiera de ellos.
// Cada fila de la biblioteca guarda UN nombre, el que tuviera al añadirse: el
// de la ficha es-ES, o el inglés si llegó de una importación de IMDb o
// Letterboxd. Una sola petición a TMDb (en-US + translations) da los tres y se
// guarda en tmdb_cache con un TTL largo: un título casi nunca cambia de nombre.

import { inArray } from 'drizzle-orm';
import { tmdbCache } from '../db/schema.js';

export const TITLE_NAMES_MAX_KEYS = 100;
const TITLE_NAMES_TTL_MS = 1000 * 60 * 60 * 24 * 180;
const TITLE_NAMES_FETCH_CONCURRENCY = 8;
const CACHE_PREFIX = 'title:names:v1:';
const titleNamesMemory = new Map();

/** "movie:603" / "tv:1396" válidas y sin repetir, hasta el máximo por petición. */
export function parseTitleNameKeys(value) {
  const parts = Array.isArray(value) ? value : String(value || '').split(',');
  const keys = [];
  const seen = new Set();
  for (const part of parts) {
    const match = String(part).trim().match(/^(movie|tv):([1-9]\d{0,9})$/);
    if (!match) continue;
    const key = `${match[1]}:${Number(match[2])}`;
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
    if (keys.length >= TITLE_NAMES_MAX_KEYS) break;
  }
  return keys;
}

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// Traducción de un idioma: primero la del país preferido, si no cualquiera.
function translatedName(type, translations, language, country) {
  const list = Array.isArray(translations) ? translations : [];
  const field = type === 'movie' ? 'title' : 'name';
  const ofLanguage = list.filter((entry) => entry?.iso_639_1 === language);
  const preferred = ofLanguage.find((entry) => entry?.iso_3166_1 === country);
  for (const entry of [preferred, ...ofLanguage]) {
    const name = clean(entry?.data?.[field]);
    if (name) return name;
  }
  return null;
}

/**
 * { en, es, original } de la ficha en-US con translations. Una traducción
 * vacía significa que se usa el original (TMDb hace lo mismo al mostrarla).
 */
export function titleNamesFromTmdb(type, payload) {
  const original = clean(type === 'movie' ? payload?.original_title : payload?.original_name);
  const en = clean(type === 'movie' ? payload?.title : payload?.name) || original;
  const es = translatedName(type, payload?.translations?.translations, 'es', 'ES') || original;
  return { en, es, original };
}

async function mapWithConcurrency(values, worker, concurrency) {
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
}

/** Map "movie:603" → { en, es, original } (null si TMDb no tiene el título). */
export async function resolveTitleNames(db, keys) {
  const now = new Date();
  const resolved = new Map();
  for (const key of keys) {
    const memory = titleNamesMemory.get(key);
    if (memory?.expiresAt > now) resolved.set(key, memory.names);
  }

  const pending = keys.filter((key) => !resolved.has(key));
  if (pending.length) {
    try {
      const rows = await db
        .select({ cacheKey: tmdbCache.cacheKey, data: tmdbCache.data, expiresAt: tmdbCache.expiresAt })
        .from(tmdbCache)
        .where(inArray(tmdbCache.cacheKey, pending.map((key) => CACHE_PREFIX + key)));
      for (const row of rows) {
        const expiresAt = new Date(row.expiresAt);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) continue;
        if (!Object.hasOwn(row.data || {}, 'names')) continue;
        const key = row.cacheKey.slice(CACHE_PREFIX.length);
        resolved.set(key, row.data.names);
        titleNamesMemory.set(key, { names: row.data.names, expiresAt });
      }
    } catch {
      // La caché es una optimización: sin ella se pregunta a TMDb.
    }
  }

  const apiKey = process.env.TMDB_API_KEY;
  const missing = keys.filter((key) => !resolved.has(key));
  if (!apiKey || !missing.length) return resolved;

  const expiresAt = new Date(now.getTime() + TITLE_NAMES_TTL_MS);
  await mapWithConcurrency(missing, async (key) => {
    const [type, id] = key.split(':');
    let names = null;
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/${type}/${id}?api_key=${apiKey}&language=en-US&append_to_response=translations`,
        { signal: AbortSignal.timeout(8000) },
      );
      // 404: el título ya no existe en TMDb; se recuerda para no repetir.
      if (!response.ok && response.status !== 404) return;
      if (response.ok) names = titleNamesFromTmdb(type, await response.json());
    } catch {
      return;
    }

    resolved.set(key, names);
    titleNamesMemory.set(key, { names, expiresAt });
    await db
      .insert(tmdbCache)
      .values({ cacheKey: CACHE_PREFIX + key, data: { names }, fetchedAt: now, expiresAt })
      .onConflictDoUpdate({
        target: tmdbCache.cacheKey,
        set: { data: { names }, fetchedAt: now, expiresAt },
      })
      .catch(() => {});
  }, TITLE_NAMES_FETCH_CONCURRENCY);

  return resolved;
}
