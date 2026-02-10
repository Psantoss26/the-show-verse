// /src/lib/api/traktHelpers.js
/**
 * Helpers para obtener contenido variado desde Trakt API
 * Similar a Netflix y Amazon Prime Video
 */

const TRAKT_KEY =
    process.env.TRAKT_CLIENT_ID ||
    process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID ||
    process.env.TRAKT_API_KEY;

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

function traktHeaders() {
    if (!TRAKT_KEY) return null;
    return {
        'content-type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_KEY,
    };
}

async function safeJson(res) {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

async function fetchTrakt(path, options = {}) {
    const headers = traktHeaders();
    if (!headers) return [];

    const res = await fetch(`https://api.trakt.tv${path}`, {
        headers,
        next: { revalidate: 60 * 60 }, // 1h cache
        ...options,
    });

    const json = await safeJson(res);
    if (!res.ok) return [];
    return Array.isArray(json) ? json : [];
}

// Cache de deduplicación: evita pedir el mismo TMDb ID varias veces en un mismo render
const tmdbDetailsCache = new Map();

async function fetchTmdbDetails(type, id) {
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

async function mapWithConcurrency(items, worker, concurrency = 8) {
    const out = new Array(items.length);
    let idx = 0;

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (idx < items.length) {
            const cur = idx++;
            out[cur] = await worker(items[cur]).catch(() => null);
        }
    });

    await Promise.all(runners);
    return out.filter(Boolean);
}

/**
 * Hydrata resultados de Trakt con detalles de TMDb
 */
async function hydrateTraktResults(seeds, limit = 24) {
    return await mapWithConcurrency(
        seeds.slice(0, limit),
        async (it) => {
            const details = await fetchTmdbDetails(it.media_type === 'tv' ? 'tv' : 'movie', it.tmdb);
            if (!details?.id || !details?.poster_path) return null;

            return {
                id: details.id,
                media_type: it.media_type,
                title: details.title || null,
                name: details.name || null,
                poster_path: details.poster_path || null,
                backdrop_path: details.backdrop_path || null,
                release_date: details.release_date || null,
                first_air_date: details.first_air_date || null,
                vote_average: details.vote_average ?? null,
                runtime: details.runtime ?? null,
                number_of_episodes: details.number_of_episodes ?? null,
                overview: details.overview || null,
            };
        },
        15
    );
}

/**
 * TRENDING: Lo más popular de la semana (movies + shows alternados)
 */
export async function getTraktTrending(limit = 24) {
    const [movies, shows] = await Promise.all([
        fetchTrakt('/movies/trending?extended=full&limit=30'),
        fetchTrakt('/shows/trending?extended=full&limit=30'),
    ]);

    const movieSeeds = movies
        .map((x) => ({ media_type: 'movie', tmdb: x?.movie?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const showSeeds = shows
        .map((x) => ({ media_type: 'tv', tmdb: x?.show?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const mixed = interleave(movieSeeds, showSeeds, limit);
    return await hydrateTraktResults(mixed, limit);
}

/**
 * POPULAR: Lo más popular de todo el tiempo
 */
export async function getTraktPopular(limit = 24) {
    const [movies, shows] = await Promise.all([
        fetchTrakt('/movies/popular?extended=full&limit=30'),
        fetchTrakt('/shows/popular?extended=full&limit=30'),
    ]);

    const movieSeeds = movies
        .map((m) => ({ media_type: 'movie', tmdb: m?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const showSeeds = shows
        .map((s) => ({ media_type: 'tv', tmdb: s?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const mixed = interleave(movieSeeds, showSeeds, limit);
    return await hydrateTraktResults(mixed, limit);
}

/**
 * RECOMMENDED: Recomendaciones personalizadas (requiere clave de Trakt)
 */
export async function getTraktRecommended(limit = 24, period = 'weekly') {
    const [movies, shows] = await Promise.all([
        fetchTrakt(`/movies/recommended/${period}?extended=full&limit=30`),
        fetchTrakt(`/shows/recommended/${period}?extended=full&limit=30`),
    ]);

    const movieSeeds = movies
        .map((m) => ({ media_type: 'movie', tmdb: m?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const showSeeds = shows
        .map((s) => ({ media_type: 'tv', tmdb: s?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const mixed = interleave(movieSeeds, showSeeds, limit);
    return await hydrateTraktResults(mixed, limit);
}

/**
 * ANTICIPATED: Próximos estrenos más esperados
 */
export async function getTraktAnticipated(limit = 24) {
    const [moviesRaw, showsRaw] = await Promise.all([
        fetchTrakt('/movies/anticipated?extended=full&limit=30'),
        fetchTrakt('/shows/anticipated?extended=full&limit=30'),
    ]);

    const movieSeeds = moviesRaw
        .map((x) => x?.movie)
        .filter(Boolean)
        .map((m) => ({ media_type: 'movie', tmdb: m?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const showSeeds = showsRaw
        .map((x) => x?.show)
        .filter(Boolean)
        .map((s) => ({ media_type: 'tv', tmdb: s?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const mixed = interleave(movieSeeds, showSeeds, limit);
    return await hydrateTraktResults(mixed, limit);
}

/**
 * PLAYED: Lo más visto recientemente por la comunidad
 */
export async function getTraktPlayed(period = 'weekly', limit = 24) {
    const [movies, shows] = await Promise.all([
        fetchTrakt(`/movies/played/${period}?extended=full&limit=30`),
        fetchTrakt(`/shows/played/${period}?extended=full&limit=30`),
    ]);

    const movieSeeds = movies
        .map((x) => x?.movie)
        .filter(Boolean)
        .map((m) => ({ media_type: 'movie', tmdb: m?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const showSeeds = shows
        .map((x) => x?.show)
        .filter(Boolean)
        .map((s) => ({ media_type: 'tv', tmdb: s?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const mixed = interleave(movieSeeds, showSeeds, limit);
    return await hydrateTraktResults(mixed, limit);
}

/**
 * WATCHED: Lo más visto de todo el tiempo
 */
export async function getTraktWatched(period = 'weekly', limit = 24) {
    const [movies, shows] = await Promise.all([
        fetchTrakt(`/movies/watched/${period}?extended=full&limit=30`),
        fetchTrakt(`/shows/watched/${period}?extended=full&limit=30`),
    ]);

    const movieSeeds = movies
        .map((x) => x?.movie)
        .filter(Boolean)
        .map((m) => ({ media_type: 'movie', tmdb: m?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const showSeeds = shows
        .map((x) => x?.show)
        .filter(Boolean)
        .map((s) => ({ media_type: 'tv', tmdb: s?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const mixed = interleave(movieSeeds, showSeeds, limit);
    return await hydrateTraktResults(mixed, limit);
}

/**
 * COLLECTED: Lo más coleccionado por usuarios
 */
export async function getTraktCollected(period = 'weekly', limit = 24) {
    const [movies, shows] = await Promise.all([
        fetchTrakt(`/movies/collected/${period}?extended=full&limit=30`),
        fetchTrakt(`/shows/collected/${period}?extended=full&limit=30`),
    ]);

    const movieSeeds = movies
        .map((x) => x?.movie)
        .filter(Boolean)
        .map((m) => ({ media_type: 'movie', tmdb: m?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const showSeeds = shows
        .map((x) => x?.show)
        .filter(Boolean)
        .map((s) => ({ media_type: 'tv', tmdb: s?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    const mixed = interleave(movieSeeds, showSeeds, limit);
    return await hydrateTraktResults(mixed, limit);
}

/**
 * SOLO PELÍCULAS - Trending
 */
export async function getTraktMoviesTrending(limit = 40) {
    const movies = await fetchTrakt('/movies/trending?extended=full&limit=50');

    const seeds = movies
        .map((x) => ({ media_type: 'movie', tmdb: x?.movie?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO PELÍCULAS - Popular
 */
export async function getTraktMoviesPopular(limit = 40) {
    const movies = await fetchTrakt('/movies/popular?extended=full&limit=50');

    const seeds = movies
        .map((m) => ({ media_type: 'movie', tmdb: m?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO PELÍCULAS - Recommended
 */
export async function getTraktMoviesRecommended(limit = 40) {
    const movies = await fetchTrakt('/movies/recommended/weekly?extended=full&limit=50');

    const seeds = movies
        .map((m) => ({ media_type: 'movie', tmdb: m?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO PELÍCULAS - Anticipated
 */
export async function getTraktMoviesAnticipated(limit = 40) {
    const moviesRaw = await fetchTrakt('/movies/anticipated?extended=full&limit=50');

    const seeds = moviesRaw
        .map((x) => x?.movie)
        .filter(Boolean)
        .map((m) => ({ media_type: 'movie', tmdb: m?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO PELÍCULAS - Played (weekly/monthly/yearly/all)
 */
export async function getTraktMoviesPlayed(period = 'weekly', limit = 40) {
    const movies = await fetchTrakt(`/movies/played/${period}?extended=full&limit=50`);

    const seeds = movies
        .map((x) => x?.movie)
        .filter(Boolean)
        .map((m) => ({ media_type: 'movie', tmdb: m?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO SERIES - Trending
 */
export async function getTraktShowsTrending(limit = 40) {
    const shows = await fetchTrakt('/shows/trending?extended=full&limit=50');

    const seeds = shows
        .map((x) => ({ media_type: 'tv', tmdb: x?.show?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO SERIES - Popular
 */
export async function getTraktShowsPopular(limit = 40) {
    const shows = await fetchTrakt('/shows/popular?extended=full&limit=50');

    const seeds = shows
        .map((s) => ({ media_type: 'tv', tmdb: s?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO SERIES - Recommended
 */
export async function getTraktShowsRecommended(limit = 40) {
    const shows = await fetchTrakt('/shows/recommended/weekly?extended=full&limit=50');

    const seeds = shows
        .map((s) => ({ media_type: 'tv', tmdb: s?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO SERIES - Anticipated
 */
export async function getTraktShowsAnticipated(limit = 40) {
    const showsRaw = await fetchTrakt('/shows/anticipated?extended=full&limit=50');

    const seeds = showsRaw
        .map((x) => x?.show)
        .filter(Boolean)
        .map((s) => ({ media_type: 'tv', tmdb: s?.ids?.tmdb }))
        .filter((x) => x.tmdb);

    return await hydrateTraktResults(seeds, limit);
}

/**
 * SOLO SERIES - Played (weekly/monthly/yearly/all)
 */
export async function getTraktShowsPlayed(period = 'weekly', limit = 40) {
    const shows = await fetchTrakt(`/shows/played/${period}?extended=full&limit=50`);

    const seeds = shows
        .map((x) => x?.show)
        .filter(Boolean)
        .map((s) => ({ media_type: 'tv', tmdb: s?.ids?.tmdb }))
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
