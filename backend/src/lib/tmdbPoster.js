// backend/src/lib/tmdbPoster.js
//
// Póster de un título (película o serie) desde TMDb, cacheado en memoria. Se usa
// para rellenar pósters ausentes en "Visionados": los eventos de watch_history se
// guardan a menudo SIN poster_path (sync de dispositivos, marcar visto…), por lo
// que sus tarjetas salían vacías. Para series el póster correcto es el de la SERIE
// (no el fotograma del episodio): agrupamos episodios por serie, así que basta el
// tmdbId de la serie con mediaType 'tv'.

const TMDB_API = 'https://api.themoviedb.org/3';

// "type:tmdbId" -> posterPath ('/xxx.jpg') | null. Los pósters casi nunca cambian,
// así que no expira durante la vida del proceso.
const cache = new Map();

async function tmdbJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * poster_path de un título ('/xxx.jpg') o null si no se conoce. Para 'tv' devuelve
 * el póster de la SERIE; para 'movie', el de la película.
 * @param {{ tmdbId:number, mediaType:'movie'|'tv' }} p
 */
export async function getTitlePoster({ tmdbId, mediaType }) {
  const id = Number(tmdbId);
  if (!id || (mediaType !== 'movie' && mediaType !== 'tv')) return null;
  const key = `${mediaType}:${id}`;
  if (cache.has(key)) return cache.get(key);

  const apiKey = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) return null;

  const path = mediaType === 'movie' ? 'movie' : 'tv';
  const data = await tmdbJson(`${TMDB_API}/${path}/${id}?api_key=${apiKey}`);
  // Fallo transitorio (red/timeout): no cachear para poder reintentar luego.
  if (data == null) return null;
  const poster = typeof data.poster_path === 'string' ? data.poster_path : null;
  cache.set(key, poster); // cachea también null (el título no tiene póster en TMDb)
  return poster;
}
