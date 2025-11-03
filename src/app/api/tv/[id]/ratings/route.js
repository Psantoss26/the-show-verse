// GET /api/tv/:id/ratings?excludeSpecials=true&debug=1
// Respuesta: { show: { id, name, imdb_id }, seasons: [ { season_number, episodes:[{episode_number,name, tmdb:{rating,votes}, imdb:{rating,votes}}] } ] }

const TMDB = 'https://api.themoviedb.org/3';
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY; // opcional

async function tmdb(path) {
  const url = new URL(`${TMDB}${path}`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('language', 'es-ES');
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json();
  if (!r.ok) throw new Error(j.status_message || `TMDb ${r.status}`);
  return j;
}

async function omdbSeasonBySeriesImdb(seriesImdb, season) {
  if (!OMDB_API_KEY || !seriesImdb) return null;
  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('apikey', OMDB_API_KEY);
  url.searchParams.set('i', seriesImdb);
  url.searchParams.set('Season', season);
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json();
  if (j.Response === 'False') return null;
  return j; // { Episodes: [{Episode, Title, imdbRating, imdbID, ...}], totalSeasons, ... }
}

export async function GET(req, ctx) {
  try {
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const excludeSpecials = searchParams.get('excludeSpecials') === 'true';
    const debug = searchParams.get('debug') === '1';

    // 1) Detalle de la serie con external_ids para obtener imdb_id de la serie
    const show = await tmdb(`/tv/${id}`);
    const externals = await tmdb(`/tv/${id}/external_ids`);
    const seriesImdb = externals?.imdb_id || null;

    // 2) Filtra temporadas
    const seasonsMeta = (show.seasons || [])
      .filter(s => !excludeSpecials || s.season_number !== 0)
      .map(s => ({ season_number: s.season_number, episode_count: s.episode_count }));

    // 3) Carga datos de cada temporada (TMDb) en paralelo
    const seasonsData = await Promise.all(
      seasonsMeta.map(async (s) => {
        const sea = await tmdb(`/tv/${id}/season/${s.season_number}`);
        // OMDb por temporada (si hay imdb de serie)
        const omdb = await omdbSeasonBySeriesImdb(seriesImdb, s.season_number);

        const omdbMap = new Map();
        if (omdb?.Episodes?.length) {
          for (const ep of omdb.Episodes) {
            const n = Number(ep.Episode);
            const rating = ep.imdbRating && ep.imdbRating !== 'N/A' ? Number(ep.imdbRating) : null;
            omdbMap.set(n, {
              rating,
              votes: null, // OMDb por temporada no devuelve votos; si quisieras, habría que llamar por imdbID del episodio (más lento)
            });
          }
        }

        const episodes = (sea.episodes || []).map(ep => ({
          episode_number: ep.episode_number,
          name: ep.name,
          tmdb: {
            rating: typeof ep.vote_average === 'number' ? Number(ep.vote_average) : null,
            votes: typeof ep.vote_count === 'number' ? ep.vote_count : null,
          },
          imdb: omdbMap.get(ep.episode_number) ?? { rating: null, votes: null },
        }));

        return { season_number: s.season_number, episodes };
      })
    );

    return Response.json({
      show: { id: show.id, name: show.name, imdb_id: seriesImdb },
      seasons: seasonsData.sort((a, b) => a.season_number - b.season_number),
      debug: debug ? { seasonsMeta } : undefined,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
