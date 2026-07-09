// backend/src/lib/tmdbRuntime.js
//
// Duración (runtime) de un título desde TMDb, cacheada en memoria. La usa el
// endpoint de progreso (/netflix/progress) cuando el cliente NO reporta duración
// en la MediaSession —común en Plex y en algunos episodios de Netflix—: sin
// duración no se puede calcular el porcentaje y el título nunca entraba en
// "Continuar viendo" ni se marcaba visto al 90%. Con esto la duración se rellena
// desde TMDb y el progreso funciona igual aunque la app no la exponga.

const TMDB_API = 'https://api.themoviedb.org/3';

// key "type:tmdbId:season:episode" -> runtimeSeconds (>0). Persiste durante la vida
// del proceso; las duraciones no cambian, así que no hace falta expirarlas.
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
 * Duración en SEGUNDOS de una película o episodio; 0 si no se conoce.
 * @param {{ tmdbId:number, mediaType:'movie'|'tv', season?:number, episode?:number }} p
 */
export async function getRuntimeSeconds({ tmdbId, mediaType, season = 0, episode = 0 }) {
  if (!tmdbId || (mediaType !== 'movie' && mediaType !== 'tv')) return 0;
  const key = `${mediaType}:${tmdbId}:${season || 0}:${episode || 0}`;
  if (cache.has(key)) return cache.get(key);

  const apiKey = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) return 0;

  let mins = 0;
  if (mediaType === 'movie') {
    const data = await tmdbJson(`${TMDB_API}/movie/${tmdbId}?api_key=${apiKey}`);
    mins = Number(data?.runtime) || 0;
  } else {
    // Episodio concreto → su duración; si no, la duración media de la serie.
    if (season && episode) {
      const ep = await tmdbJson(
        `${TMDB_API}/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${apiKey}`,
      );
      mins = Number(ep?.runtime) || 0;
    }
    if (mins <= 0) {
      const show = await tmdbJson(`${TMDB_API}/tv/${tmdbId}?api_key=${apiKey}`);
      const arr = Array.isArray(show?.episode_run_time) ? show.episode_run_time : [];
      mins = Number(arr[0]) || 0;
    }
  }

  const runtimeSec = mins > 0 ? mins * 60 : 0;
  if (runtimeSec > 0) cache.set(key, runtimeSec);
  return runtimeSec;
}
