// src/lib/letterboxd/resolve.js
// Películas de Letterboxd (nombre + año) → películas de TMDb. Solo servidor.

import { normalizeText } from "./export.js";

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const CONCURRENCY = 8;

async function searchMovies(query, params = {}) {
  if (!TMDB_KEY) throw new Error("TMDB_API_KEY is not configured");
  const url = new URL(`${TMDB_API}/search/movie`);
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("language", "es-ES");
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("query", query);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json?.results) ? json.results : [];
}

function releaseYear(movie) {
  const year = Number(String(movie?.release_date || "").slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

/**
 * El mejor candidato para una película de Letterboxd: el título (traducido u
 * original) que coincide y el año de estreno más cercano; a igualdad, el orden
 * de TMDb (relevancia). Sin coincidencia de título, solo vale si el año cuadra
 * (±1: Letterboxd usa a veces el estreno en festival).
 */
export function pickLetterboxdMatch(results, film) {
  const name = normalizeText(film?.name);
  const year = Number(film?.year) || null;
  let best = null;
  let bestScore = -Infinity;
  (Array.isArray(results) ? results : []).forEach((movie, index) => {
    if (!movie?.id) return;
    const titleMatch =
      normalizeText(movie.title) === name || normalizeText(movie.original_title) === name;
    const movieYear = releaseYear(movie);
    const diff = year && movieYear ? Math.abs(movieYear - year) : null;
    if (!titleMatch && year && (diff === null || diff > 1)) return;
    const score =
      (titleMatch ? 4 : 0) + (diff === 0 ? 3 : diff === 1 ? 1 : 0) - index * 0.01;
    if (score > bestScore) {
      best = movie;
      bestScore = score;
    }
  });
  if (!best) return null;
  // Título distinto y sin año que comprobar: demasiado arriesgado.
  if (!year && normalizeText(best.title) !== name && normalizeText(best.original_title) !== name) {
    return null;
  }
  return best;
}

async function resolveFilm(film) {
  const query = String(film?.name || "").trim();
  if (!query) return null;
  const year = Number(film?.year) || null;
  const attempts = year
    ? [{ primary_release_year: year }, { year }, {}]
    : [{}];
  for (const params of attempts) {
    const match = pickLetterboxdMatch(await searchMovies(query, params), film);
    if (match) {
      return {
        tmdbId: Number(match.id),
        title: match.title || query,
        posterPath: match.poster_path || null,
      };
    }
  }
  return null;
}

/** Map film.key → { tmdbId, title, posterPath }, y las que no se encontraron. */
export async function resolveLetterboxdFilms(films = []) {
  const list = (Array.isArray(films) ? films : []).filter((film) => film?.key && film?.name);
  const resolved = new Map();
  const missing = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      const film = list[cursor];
      cursor += 1;
      const match = await resolveFilm(film).catch(() => null);
      if (match) resolved.set(film.key, match);
      else missing.push(film);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  return { resolved, missing };
}

/** Une la tanda con lo resuelto: lo que se manda al backend. */
export function mapLetterboxdChunk({ history = [], ratings = [], favorites = [], watchlist = [] }, resolved) {
  const withMovie = (item) => {
    const movie = resolved.get(item?.film);
    return movie ? { ...movie, mediaType: "movie" } : null;
  };
  // Favoritas (likes) y pendientes (watchlist).
  const collection = (items) =>
    (Array.isArray(items) ? items : [])
      .map((item) => {
        const movie = withMovie(item);
        return movie ? { ...movie, addedAt: item.addedAt || null } : null;
      })
      .filter(Boolean);
  return {
    history: history
      .map((item) => {
        const movie = withMovie(item);
        if (!movie || !item.watchedAt) return null;
        return { ...movie, watchedAt: item.watchedAt, undated: Boolean(item.undated) };
      })
      .filter(Boolean),
    ratings: ratings
      .map((item) => {
        const movie = withMovie(item);
        if (!movie || !item.rating) return null;
        return { ...movie, rating: item.rating, ratedAt: item.ratedAt || null };
      })
      .filter(Boolean),
    favorites: collection(favorites),
    watchlist: collection(watchlist),
  };
}
