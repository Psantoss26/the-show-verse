// backend/src/community/posterlessItems.js
//
// TÍTULOS SIN PÓSTER EN LAS LISTAS DE LA COMUNIDAD. Las importadas de Trakt
// traen títulos que TMDb ya no tiene (404: ids borrados o fusionados) o que no
// tienen ningún póster. En la app salían como huecos vacíos que no llevaban a
// ninguna parte. Antes de darlos por perdidos se comprueba su galería de TMDb
// SIN idioma (todas las imágenes): el relleno normal pide el detalle en
// español y algunos títulos solo tienen póster en otro idioma.
//
// Resultado por título (`type:id`):
//   - { status: 'poster', posterPath }  → tiene póster: se usa y se guarda.
//   - { status: 'missing' }             → 404 o sin ningún póster: se quita.
//   - { status: 'unknown' }             → error pasajero (429, red…): se oculta
//                                         esta vez, pero NO se borra.

// Pocas a la vez: TMDb responde 429 si se le piden decenas de golpe (era lo que
// dejaba sin póster a títulos que sí lo tienen).
export const POSTER_CHECK_CONCURRENCY = 4;
// Tope por respuesta para no alargar una página: lo que pase de aquí se
// comprueba en la siguiente lectura.
export const POSTER_CHECK_MAX = 60;
// Los 'missing' se recuerdan un tiempo (listas de usuario, donde no se borran,
// no deben preguntar a TMDb en cada visita).
const MISSING_TTL_MS = 6 * 60 * 60 * 1000;
const missingCache = new Map();

export function posterItemKey(mediaType, tmdbId) {
  const type = mediaType === 'tv' || mediaType === 'show' ? 'tv' : mediaType === 'movie' ? 'movie' : null;
  return type && tmdbId ? `${type}:${tmdbId}` : null;
}

// El mejor póster de la galería: inglés, luego sin idioma, luego cualquiera;
// dentro de cada grupo, el más votado.
export function pickGalleryPoster(posters) {
  const list = Array.isArray(posters) ? posters.filter((p) => p?.file_path) : [];
  if (!list.length) return null;
  const rank = (p) => (p.iso_639_1 === 'en' ? 0 : !p.iso_639_1 || p.iso_639_1 === 'xx' ? 1 : 2);
  return [...list].sort(
    (a, b) => rank(a) - rank(b) || (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0),
  )[0].file_path;
}

async function checkOne(key, { fetchImpl, apiKey }) {
  const [type, id] = key.split(':');
  try {
    const res = await fetchImpl(`https://api.themoviedb.org/3/${type}/${id}/images?api_key=${apiKey}`);
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'unknown' };
    const data = await res.json();
    const posterPath = pickGalleryPoster(data?.posters);
    return posterPath ? { status: 'poster', posterPath } : { status: 'missing' };
  } catch {
    return { status: 'unknown' };
  }
}

/**
 * Comprueba en TMDb los títulos (`{ mediaType, tmdbId }`) que siguen sin póster.
 * Devuelve un Map `type:id` → resultado (ver arriba).
 */
export async function checkTmdbPosters(items, {
  fetchImpl = globalThis.fetch,
  apiKey = process.env.TMDB_API_KEY,
  concurrency = POSTER_CHECK_CONCURRENCY,
  max = POSTER_CHECK_MAX,
  now = Date.now(),
} = {}) {
  const results = new Map();
  const keys = [...new Set(items.map((it) => posterItemKey(it.mediaType, it.tmdbId)).filter(Boolean))];
  const pending = [];
  for (const key of keys) {
    const cachedAt = missingCache.get(key);
    if (cachedAt && now - cachedAt < MISSING_TTL_MS) results.set(key, { status: 'missing' });
    else if (!apiKey || pending.length >= max) results.set(key, { status: 'unknown' });
    else pending.push(key);
  }
  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const key = pending[next++];
      const result = await checkOne(key, { fetchImpl, apiKey });
      if (result.status === 'missing') missingCache.set(key, now);
      results.set(key, result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  return results;
}

export function clearPosterCheckCache() {
  missingCache.clear();
}
