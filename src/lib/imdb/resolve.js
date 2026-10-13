// src/lib/imdb/resolve.js
// Títulos de IMDb (ids tt…) → títulos de TMDb con /find, que resuelve por el
// id exacto: sin búsquedas por nombre ni dudas de año. Solo servidor.

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const CONCURRENCY = 8;

async function tmdb(path, params = {}) {
  if (!TMDB_KEY) throw new Error("TMDB_API_KEY is not configured");
  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("language", "es-ES");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/**
 * Resultado de /find → { tmdbId, mediaType, season, episode, title,
 * posterPath, voteAverage } o null. Un episodio se guarda con el id de su
 * serie (como las puntuaciones de episodio del resto de la app); su título y
 * póster son los de la serie, que se piden aparte con `getShow`.
 */
export async function pickImdbMatch(found, getShow) {
  const movie = found?.movie_results?.[0];
  if (movie?.id) {
    return {
      tmdbId: Number(movie.id),
      mediaType: "movie",
      season: null,
      episode: null,
      title: movie.title || movie.original_title || null,
      posterPath: movie.poster_path || null,
      voteAverage: Number(movie.vote_average) || null,
    };
  }
  const show = found?.tv_results?.[0];
  if (show?.id) {
    return {
      tmdbId: Number(show.id),
      mediaType: "tv",
      season: null,
      episode: null,
      title: show.name || show.original_name || null,
      posterPath: show.poster_path || null,
      voteAverage: Number(show.vote_average) || null,
    };
  }
  const episode = found?.tv_episode_results?.[0];
  const showId = Number(episode?.show_id);
  const season = Number(episode?.season_number);
  const number = Number(episode?.episode_number);
  if (Number.isInteger(showId) && showId > 0 && Number.isInteger(season) && Number.isInteger(number) && number > 0) {
    const parent = await getShow(showId);
    return {
      tmdbId: showId,
      mediaType: "episode",
      season,
      episode: number,
      title: parent?.name || episode.name || null,
      posterPath: parent?.poster_path || null,
      voteAverage: null,
    };
  }
  return null;
}

/** Map imdbId → título de TMDb, y los que no se encontraron ({ title, year }). */
export async function resolveImdbTitles(titles = []) {
  const list = (Array.isArray(titles) ? titles : []).filter((item) => /^tt\d{5,10}$/.test(String(item?.imdbId || "")));
  const shows = new Map();
  const getShow = (id) => {
    if (!shows.has(id)) shows.set(id, tmdb(`/tv/${id}`).catch(() => null));
    return shows.get(id);
  };

  const resolved = new Map();
  const missing = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      const item = list[cursor];
      cursor += 1;
      const found = await tmdb(`/find/${item.imdbId}`, { external_source: "imdb_id" }).catch(() => null);
      const match = found ? await pickImdbMatch(found, getShow).catch(() => null) : null;
      if (match) resolved.set(item.imdbId, match);
      else missing.push({ title: item.title || item.imdbId, year: item.year ?? null });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  return { resolved, missing };
}

/**
 * Une la tanda con lo resuelto: lo que se manda al backend. Las películas y
 * episodios puntuados se marcan como vistos (con la fecha de la valoración) si
 * `markWatched`, y los de una lista con destino "Vistos" (check-ins) siempre;
 * las series no, porque no dicen qué episodios. La watchlist y las listas
 * solo admiten películas y series.
 */
export function mapImdbChunk({ ratings = [], watchlist = [], watched = [], lists = [], markWatched = false }, resolved) {
  const title = (match) => ({
    tmdbId: match.tmdbId,
    title: match.title,
    posterPath: match.posterPath,
  });
  const ratingValues = [];
  const history = [];
  const addWatched = (match, watchedAt) => {
    if (!watchedAt || match.mediaType === "tv") return;
    history.push({
      ...title(match),
      mediaType: match.mediaType === "episode" ? "tv" : "movie",
      season: match.season,
      episode: match.episode,
      watchedAt,
    });
  };
  for (const item of Array.isArray(watched) ? watched : []) {
    const match = resolved.get(item?.imdbId);
    if (match) addWatched(match, item.watchedAt);
  }
  for (const item of Array.isArray(ratings) ? ratings : []) {
    const match = resolved.get(item?.imdbId);
    const rating = Number(item?.rating);
    if (!match || !Number.isInteger(rating) || rating < 1 || rating > 10) continue;
    ratingValues.push({
      ...title(match),
      mediaType: match.mediaType,
      season: match.season,
      episode: match.episode,
      rating,
      ratedAt: item.ratedAt || null,
    });
    if (markWatched) addWatched(match, item.ratedAt);
  }

  const collectionTitle = (imdbId) => {
    const match = resolved.get(imdbId);
    return match && (match.mediaType === "movie" || match.mediaType === "tv") ? match : null;
  };

  return {
    ratings: ratingValues,
    history,
    watchlist: (Array.isArray(watchlist) ? watchlist : [])
      .map((item) => {
        const match = collectionTitle(item?.imdbId);
        return match ? { ...title(match), mediaType: match.mediaType, addedAt: item.addedAt || null } : null;
      })
      .filter(Boolean),
    lists: (Array.isArray(lists) ? lists : [])
      .map((list) => ({
        name: String(list?.name || "").trim(),
        items: (Array.isArray(list?.items) ? list.items : [])
          .map((item) => {
            const match = collectionTitle(item?.imdbId);
            if (!match) return null;
            return {
              ...title(match),
              mediaType: match.mediaType,
              voteAverage: match.voteAverage,
              position: Number(item.position) || null,
              addedAt: item.addedAt || null,
            };
          })
          .filter(Boolean),
      }))
      .filter((list) => list.name && list.items.length),
  };
}
