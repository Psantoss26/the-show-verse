// /src/lib/api/traktHelpers.js
/**
 * Helpers para obtener contenido variado desde Trakt API
 * Similar a Netflix y Amazon Prime Video
 */

import { fetchTrakt as fetchTraktWithCache } from "@/lib/trakt/fetchWithCache";
import { traktFetch } from "@/lib/trakt/server";

// Cache de deduplicación: evita pedir el mismo TMDb ID varias veces en un mismo render
const tmdbDetailsCache = new Map();

function getTmdbKey() {
  return process.env.NEXT_PUBLIC_TMDB_API_KEY;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Wrapper para usar el sistema centralizado de cache de Trakt
 * con timeout de 20s en prod / 10s en dev
 */
async function fetchTrakt(path) {
  try {
    const data = await fetchTraktWithCache(path, {
      useCache: true,
      cacheTTL: 60 * 60 * 1000, // 1 hora
    });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    // El error ya fue logueado por fetchWithCache
    console.warn("[traktHelpers] Error fetching:", path, err.message);
    return [];
  }
}

async function fetchTmdbDetails(type, id) {
  const TMDB_KEY = getTmdbKey();
  if (!TMDB_KEY || !type || !id) return null;

  const cacheKey = `${type}:${id}`;
  if (tmdbDetailsCache.has(cacheKey)) return tmdbDetailsCache.get(cacheKey);

  const promise = (async () => {
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}&language=es-ES`;
    const res = await fetch(url, { next: { revalidate: 60 * 60 } });
    const json = await safeJson(res);
    if (!res.ok) return null;
    return json;
  })();

  tmdbDetailsCache.set(cacheKey, promise);
  return promise;
}

function interleave(a, b, limit = 24) {
  const out = [];
  let i = 0;
  while (out.length < limit && (i < a.length || i < b.length)) {
    if (i < a.length) out.push(a[i]);
    if (out.length >= limit) break;
    if (i < b.length) out.push(b[i]);
    i++;
  }
  return out;
}

async function mapWithConcurrency(items, worker, concurrency = 12) {
  const out = new Array(items.length);
  let idx = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (idx < items.length) {
        const cur = idx++;
        out[cur] = await worker(items[cur]).catch(() => null);
      }
    },
  );

  await Promise.all(runners);
  return out.filter(Boolean);
}

/**
 * Hydrata resultados de Trakt con detalles de TMDb
 */
async function hydrateTraktResults(seeds, limit = 24) {
  const filtered = seeds.slice(0, limit);
  console.log(
    `💧 [traktHelpers] Hydrating ${filtered.length} items from Trakt`,
  );

  const results = await mapWithConcurrency(
    filtered,
    async (it) => {
      const details = await fetchTmdbDetails(
        it.media_type === "tv" ? "tv" : "movie",
        it.tmdb,
      );
      if (!details?.id || !details?.poster_path) return null;
      const genres = Array.isArray(details.genres) ? details.genres : [];
      const genreIds = genres.map((genre) => genre?.id).filter(Boolean);

      return {
        id: details.id,
        media_type: it.media_type,
        title:
          it.media_type === "movie"
            ? it.trakt_title || details.title || null
            : details.title || null,
        name:
          it.media_type === "tv"
            ? it.trakt_title || details.name || null
            : details.name || null,
        tmdb_title: details.title || details.name || null,
        trakt_title: it.trakt_title || null,
        trakt_year: it.trakt_year ?? null,
        trakt_id: it.trakt_id ?? null,
        trakt_slug: it.trakt_slug || null,
        imdb_id: it.imdb_id || null,
        trakt_recommended_rank: it.trakt_recommended_rank ?? null,
        trakt_recommendation_source: it.trakt_recommendation_source || null,
        poster_path: details.poster_path || null,
        backdrop_path: details.backdrop_path || null,
        release_date: details.release_date || null,
        first_air_date: details.first_air_date || null,
        genre_ids: genreIds,
        genres,
        vote_average: details.vote_average ?? null,
        runtime: details.runtime ?? null,
        number_of_episodes: details.number_of_episodes ?? null,
        overview: details.overview || null,
      };
    },
    15,
  );

  console.log(
    `✅ [traktHelpers] Hydrated ${results.length} items successfully`,
  );
  return results;
}

/**
 * TRENDING: Lo más popular de la semana (movies + shows alternados)
 */
export async function getTraktTrending(limit = 24) {
  console.log(
    `📊 [getTraktTrending] Fetching trending content (limit: ${limit})`,
  );

  const [movies, shows] = await Promise.all([
    fetchTrakt("/movies/trending?limit=50"),
    fetchTrakt("/shows/trending?limit=50"),
  ]);

  console.log(
    `📊 [getTraktTrending] Received ${movies.length} movies, ${shows.length} shows`,
  );

  const movieSeeds = movies
    .map((x) => ({ media_type: "movie", tmdb: x?.movie?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const showSeeds = shows
    .map((x) => ({ media_type: "tv", tmdb: x?.show?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const mixed = interleave(movieSeeds, showSeeds, limit);
  return await hydrateTraktResults(mixed, limit);
}

/**
 * POPULAR: Lo más popular de todo el tiempo
 */
export async function getTraktPopular(limit = 24) {
  const [movies, shows] = await Promise.all([
    fetchTrakt("/movies/popular?limit=50"),
    fetchTrakt("/shows/popular?limit=50"),
  ]);

  const movieSeeds = movies
    .map((m) => ({ media_type: "movie", tmdb: m?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const showSeeds = shows
    .map((s) => ({ media_type: "tv", tmdb: s?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const mixed = interleave(movieSeeds, showSeeds, limit);
  return await hydrateTraktResults(mixed, limit);
}

function traktRecommendationSeed(type, item, index = 0) {
  const media_type = type === "shows" ? "tv" : "movie";
  const entity = item?.[media_type === "tv" ? "show" : "movie"] || item;
  const tmdb = entity?.ids?.tmdb;
  if (!tmdb) return null;

  return {
    media_type,
    tmdb,
    trakt_id: entity?.ids?.trakt ?? null,
    trakt_slug: entity?.ids?.slug || null,
    imdb_id: entity?.ids?.imdb || null,
    trakt_title: entity?.title || null,
    trakt_year: entity?.year ?? null,
    trakt_recommended_rank: index + 1,
  };
}

async function fetchPersonalRecommendedTraktItems(
  type,
  token,
  { timeoutMs = 10000, retries = 1 } = {},
) {
  if (!token) return [];

  const res = await traktFetch(`/recommendations/${type}?limit=50`, {
    token,
    timeoutMs,
    retries,
  });

  if (!res.ok) {
    const err = new Error(
      res.json?.error ||
        res.json?.message ||
        `Trakt recommendations failed (${res.status})`,
    );
    err.status = res.status;
    throw err;
  }

  return Array.isArray(res.json) ? res.json : [];
}

async function fetchPublicRecommendedTraktItems(type, period = "weekly") {
  return fetchTrakt(`/${type}/recommended/${period}?limit=50`);
}

async function fetchRecommendedTraktItems(
  type,
  { period = "weekly", token, personalTimeoutMs, personalRetries } = {},
) {
  if (token) {
    try {
      const personalOptions = {};
      if (personalTimeoutMs != null) {
        personalOptions.timeoutMs = personalTimeoutMs;
      }
      if (personalRetries != null) {
        personalOptions.retries = personalRetries;
      }
      const personalItems = await fetchPersonalRecommendedTraktItems(
        type,
        token,
        personalOptions,
      );
      return { items: personalItems, source: "personal" };
    } catch (err) {
      console.warn(
        `[traktHelpers] Personal recommendations unavailable for ${type}:`,
        err.message,
      );
    }
  }

  const publicItems = await fetchPublicRecommendedTraktItems(type, period);
  return { items: publicItems, source: "public" };
}

/**
 * RECOMMENDED: recomendaciones exactas de Trakt.
 * Si hay token, usa las recomendaciones personales ordenadas por Trakt.
 * Sin token, conserva el fallback público semanal.
 */
export async function getTraktRecommended(
  limit = 24,
  period = "weekly",
  { token } = {},
) {
  const buckets = await getTraktRecommendedByType(limit, period, { token });
  return buckets.items;
}

export async function getTraktRecommendedByType(
  limit = 24,
  period = "weekly",
  { token, personalTimeoutMs, personalRetries } = {},
) {
  const [moviesResult, showsResult] = await Promise.all([
    fetchRecommendedTraktItems("movies", {
      period,
      token,
      personalTimeoutMs,
      personalRetries,
    }),
    fetchRecommendedTraktItems("shows", {
      period,
      token,
      personalTimeoutMs,
      personalRetries,
    }),
  ]);

  const movieSeeds = moviesResult.items
    .map((m, index) => traktRecommendationSeed("movies", m, index))
    .filter(Boolean);

  const showSeeds = showsResult.items
    .map((s, index) => traktRecommendationSeed("shows", s, index))
    .filter(Boolean);

  const isPersonal =
    moviesResult.source === "personal" || showsResult.source === "personal";
  const source = isPersonal ? "personal" : "public";
  const tagSource = (item) => ({
    ...item,
    trakt_recommendation_source: source,
  });

  const [movies, shows] = await Promise.all([
    hydrateTraktResults(movieSeeds.slice(0, limit).map(tagSource), limit),
    hydrateTraktResults(showSeeds.slice(0, limit).map(tagSource), limit),
  ]);

  return {
    movies,
    shows,
    items: interleave(movies, shows, limit),
    source,
  };
}

/**
 * ANTICIPATED: Próximos estrenos más esperados
 */
export async function getTraktAnticipated(limit = 24) {
  const [moviesRaw, showsRaw] = await Promise.all([
    fetchTrakt("/movies/anticipated?limit=50"),
    fetchTrakt("/shows/anticipated?limit=50"),
  ]);

  const movieSeeds = moviesRaw
    .map((x) => x?.movie)
    .filter(Boolean)
    .map((m) => ({ media_type: "movie", tmdb: m?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const showSeeds = showsRaw
    .map((x) => x?.show)
    .filter(Boolean)
    .map((s) => ({ media_type: "tv", tmdb: s?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const mixed = interleave(movieSeeds, showSeeds, limit);
  return await hydrateTraktResults(mixed, limit);
}

/**
 * PLAYED: Lo más visto recientemente por la comunidad
 */
export async function getTraktPlayed(period = "weekly", limit = 24) {
  const [movies, shows] = await Promise.all([
    fetchTrakt(`/movies/played/${period}?limit=50`),
    fetchTrakt(`/shows/played/${period}?limit=50`),
  ]);

  const movieSeeds = movies
    .map((x) => x?.movie)
    .filter(Boolean)
    .map((m) => ({ media_type: "movie", tmdb: m?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const showSeeds = shows
    .map((x) => x?.show)
    .filter(Boolean)
    .map((s) => ({ media_type: "tv", tmdb: s?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const mixed = interleave(movieSeeds, showSeeds, limit);
  return await hydrateTraktResults(mixed, limit);
}

/**
 * WATCHED: Lo más visto de todo el tiempo
 */
export async function getTraktWatched(period = "weekly", limit = 24) {
  const [movies, shows] = await Promise.all([
    fetchTrakt(`/movies/watched/${period}?limit=50`),
    fetchTrakt(`/shows/watched/${period}?limit=50`),
  ]);

  const movieSeeds = movies
    .map((x) => x?.movie)
    .filter(Boolean)
    .map((m) => ({ media_type: "movie", tmdb: m?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const showSeeds = shows
    .map((x) => x?.show)
    .filter(Boolean)
    .map((s) => ({ media_type: "tv", tmdb: s?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const mixed = interleave(movieSeeds, showSeeds, limit);
  return await hydrateTraktResults(mixed, limit);
}

/**
 * COLLECTED: Lo más coleccionado por usuarios
 */
export async function getTraktCollected(period = "weekly", limit = 24) {
  const [movies, shows] = await Promise.all([
    fetchTrakt(`/movies/collected/${period}?limit=50`),
    fetchTrakt(`/shows/collected/${period}?limit=50`),
  ]);

  const movieSeeds = movies
    .map((x) => x?.movie)
    .filter(Boolean)
    .map((m) => ({ media_type: "movie", tmdb: m?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const showSeeds = shows
    .map((x) => x?.show)
    .filter(Boolean)
    .map((s) => ({ media_type: "tv", tmdb: s?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const mixed = interleave(movieSeeds, showSeeds, limit);
  return await hydrateTraktResults(mixed, limit);
}

/**
 * SOLO PELÍCULAS - Trending
 */
export async function getTraktMoviesTrending(limit = 40) {
  const movies = await fetchTrakt("/movies/trending?limit=50");

  const seeds = movies
    .map((x) => ({ media_type: "movie", tmdb: x?.movie?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO PELÍCULAS - Popular
 */
export async function getTraktMoviesPopular(limit = 40) {
  const movies = await fetchTrakt("/movies/popular?limit=50");

  const seeds = movies
    .map((m) => ({ media_type: "movie", tmdb: m?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO PELÍCULAS - Recommended
 */
export async function getTraktMoviesRecommended(limit = 40, { token } = {}) {
  const { items: movies } = await fetchRecommendedTraktItems("movies", {
    token,
  });

  const seeds = movies
    .map((m, index) => traktRecommendationSeed("movies", m, index))
    .filter(Boolean);

  return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO PELÍCULAS - Anticipated
 */
export async function getTraktMoviesAnticipated(limit = 40) {
  const moviesRaw = await fetchTrakt("/movies/anticipated?limit=50");

  const seeds = moviesRaw
    .map((x) => x?.movie)
    .filter(Boolean)
    .map((m) => ({ media_type: "movie", tmdb: m?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO PELÍCULAS - Played (weekly/monthly/yearly/all)
 */
export async function getTraktMoviesPlayed(period = "weekly", limit = 40) {
  const movies = await fetchTrakt(`/movies/played/${period}?limit=50`);

  const seeds = movies
    .map((x) => x?.movie)
    .filter(Boolean)
    .map((m) => ({ media_type: "movie", tmdb: m?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO SERIES - Trending
 */
export async function getTraktShowsTrending(limit = 40) {
  const shows = await fetchTrakt("/shows/trending?limit=50");

  const seeds = shows
    .map((x) => ({ media_type: "tv", tmdb: x?.show?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO SERIES - Popular
 */
export async function getTraktShowsPopular(limit = 40) {
  const shows = await fetchTrakt("/shows/popular?limit=50");

  const seeds = shows
    .map((s) => ({ media_type: "tv", tmdb: s?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO SERIES - Recommended
 */
export async function getTraktShowsRecommended(limit = 40, { token } = {}) {
  const { items: shows } = await fetchRecommendedTraktItems("shows", {
    token,
  });

  const seeds = shows
    .map((s, index) => traktRecommendationSeed("shows", s, index))
    .filter(Boolean);

  return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO SERIES - Anticipated
 */
export async function getTraktShowsAnticipated(limit = 40) {
  const showsRaw = await fetchTrakt("/shows/anticipated?limit=50");

  const seeds = showsRaw
    .map((x) => x?.show)
    .filter(Boolean)
    .map((s) => ({ media_type: "tv", tmdb: s?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO SERIES - Played (weekly/monthly/yearly/all)
 */
export async function getTraktShowsPlayed(period = "weekly", limit = 40) {
  const shows = await fetchTrakt(`/shows/played/${period}?limit=50`);

  const seeds = shows
    .map((x) => x?.show)
    .filter(Boolean)
    .map((s) => ({ media_type: "tv", tmdb: s?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  return await hydrateTraktResults(seeds, limit);
}

/**
 * Elimina duplicados basándose en IDs de TMDb
 */
export function removeDuplicates(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id) return false;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Combina múltiples arrays eliminando duplicados
 */
export function mergeUnique(...arrays) {
  const all = arrays.flat();
  return removeDuplicates(all);
}
