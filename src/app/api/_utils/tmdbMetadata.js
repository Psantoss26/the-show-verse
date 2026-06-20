const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const BACKEND_BASE = (
  process.env.BACKEND_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  ""
).replace(/\/+$/, "");

function safeMediaType(mediaType) {
  if (mediaType === "movie") return "movie";
  if (mediaType === "tv" || mediaType === "show") return "tv";
  return null;
}

function yearFromDate(date) {
  return date ? String(date).slice(0, 4) : null;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchFromBackendCache(tmdbId, type) {
  if (!BACKEND_BASE) return null;

  const res = await fetch(
    `${BACKEND_BASE}/v1/tmdb/${type}/${encodeURIComponent(tmdbId)}`,
    { next: { revalidate: 60 * 60 * 24 } },
  );
  if (!res.ok) return null;
  return safeJson(res);
}

async function fetchFromTmdbDirect(tmdbId, type) {
  if (!TMDB_KEY) return null;

  const url = `${TMDB_BASE}/${type}/${encodeURIComponent(tmdbId)}?api_key=${encodeURIComponent(
    TMDB_KEY,
  )}&language=es-ES`;

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!res.ok) return null;
  return safeJson(res);
}

export async function fetchTmdbMetadata(tmdbId, mediaType) {
  const type = safeMediaType(mediaType);
  if (!tmdbId || !type) return null;

  const data =
    (await fetchFromBackendCache(tmdbId, type).catch(() => null)) ||
    (await fetchFromTmdbDirect(tmdbId, type).catch(() => null));
  if (!data) return null;

  const isMovie = type === "movie";
  const releaseDate = isMovie ? data.release_date || null : null;
  const firstAirDate = isMovie ? null : data.first_air_date || null;
  const genres = Array.isArray(data.genres) ? data.genres : [];
  const genreIds = genres.map((genre) => genre?.id).filter(Boolean);

  return {
    title: isMovie
      ? data.title || data.original_title || null
      : data.name || data.original_name || null,
    name: isMovie
      ? data.title || data.original_title || null
      : data.name || data.original_name || null,
    poster_path: data.poster_path || null,
    backdrop_path: data.backdrop_path || null,
    release_date: releaseDate,
    first_air_date: firstAirDate,
    year: yearFromDate(releaseDate || firstAirDate),
    genre_ids: genreIds,
    genres,
    overview: data.overview || null,
    vote_average: data.vote_average ?? null,
  };
}

function mergeMetadata(item, metadata) {
  if (!metadata) return item;

  const itemGenres = Array.isArray(item.genres) ? item.genres : [];
  const itemGenreIds = Array.isArray(item.genre_ids) ? item.genre_ids : [];

  return {
    ...item,
    title: item.title || metadata.title || null,
    name: item.name || metadata.name || item.title || metadata.title || null,
    poster_path: item.poster_path || metadata.poster_path || null,
    backdrop_path: item.backdrop_path || metadata.backdrop_path || null,
    release_date: item.release_date || metadata.release_date || null,
    first_air_date: item.first_air_date || metadata.first_air_date || null,
    year: item.year || metadata.year || null,
    genre_ids: itemGenreIds.length > 0 ? itemGenreIds : metadata.genre_ids || [],
    genres: itemGenres.length > 0 ? itemGenres : metadata.genres || [],
    overview: item.overview || metadata.overview || null,
    vote_average: item.vote_average ?? metadata.vote_average ?? null,
  };
}

export async function enrichMediaItemsWithTmdb(
  items,
  {
    getId = (item) => item.id || item.tmdbId,
    getType = (item) => item.media_type || item.mediaType,
    concurrency = 8,
  } = {},
) {
  if (!Array.isArray(items) || items.length === 0 || (!BACKEND_BASE && !TMDB_KEY)) return items;

  const enriched = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;

      const item = items[index];
      const metadata = await fetchTmdbMetadata(getId(item), getType(item)).catch(
        () => null,
      );
      enriched[index] = mergeMetadata(item, metadata);
    }
  });

  await Promise.all(workers);
  return enriched;
}
