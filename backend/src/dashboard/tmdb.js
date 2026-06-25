// backend/src/dashboard/tmdb.js
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

export const MOVIE_GENRES = [
  { id: 28, label: 'Acción' }, { id: 12, label: 'Aventura' }, { id: 16, label: 'Animación' },
  { id: 35, label: 'Comedia' }, { id: 80, label: 'Crimen' }, { id: 18, label: 'Drama' },
  { id: 10751, label: 'Familia' }, { id: 14, label: 'Fantasía' }, { id: 27, label: 'Terror' },
  { id: 9648, label: 'Misterio' }, { id: 10749, label: 'Romance' }, { id: 878, label: 'Ciencia ficción' },
  { id: 53, label: 'Thriller' }, { id: 10752, label: 'Bélica' },
];
export const TV_GENRES = [
  { id: 10759, label: 'Acción y aventura' }, { id: 16, label: 'Animación' }, { id: 35, label: 'Comedia' },
  { id: 80, label: 'Crimen' }, { id: 18, label: 'Drama' }, { id: 10751, label: 'Familia' },
  { id: 9648, label: 'Misterio' }, { id: 10765, label: 'Ciencia ficción y fantasía' }, { id: 37, label: 'Western' },
];

export function toCard(raw, mediaType) {
  if (!raw || !raw.id) return null;
  const posterPath = raw.poster_path || null;
  const backdropPath = raw.backdrop_path || null;
  if (!posterPath && !backdropPath) return null;
  const dateStr = raw.release_date || raw.first_air_date || '';
  const year = dateStr ? Number(dateStr.slice(0, 4)) || null : null;
  return {
    tmdbId: Number(raw.id),
    mediaType,
    title: raw.title || raw.name || raw.original_title || raw.original_name || '',
    posterPath,
    backdropPath,
    voteAverage: typeof raw.vote_average === 'number' ? raw.vote_average : 0,
    voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : 0,
    year,
    genreIds: Array.isArray(raw.genre_ids) ? raw.genre_ids : [],
    popularity: typeof raw.popularity === 'number' ? raw.popularity : 0,
  };
}

async function tmdbGet(path, params = {}) {
  if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured');
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('language', params.language || 'es-ES');
  for (const [k, v] of Object.entries(params)) {
    if (k === 'language' || v == null) continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}`);
  return res.json();
}

export async function tmdbDiscover({ mediaType, params = {} }) {
  const json = await tmdbGet(`/discover/${mediaType}`, { include_adult: false, ...params });
  return (json?.results || []).map((r) => toCard(r, mediaType)).filter(Boolean);
}

export async function tmdbList({ path, mediaType, pages = 1 }) {
  const all = [];
  for (let page = 1; page <= pages; page += 1) {
    const json = await tmdbGet(path, { page });
    for (const r of json?.results || []) {
      const c = toCard(r, mediaType);
      if (c) all.push(c);
    }
  }
  return all;
}
