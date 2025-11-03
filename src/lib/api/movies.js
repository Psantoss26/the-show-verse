import { fetchFromTMDb } from './tmdb';

export async function fetchPopularMovies() {
  return await fetchFromTMDb('/movie/popular');
}

export async function fetchGenres() {
  return await fetchFromTMDb('/genre/movie/list');
}

export async function fetchMoviesByGenre(genreId) {
  return await fetchFromTMDb(`/discover/movie&with_genres=${genreId}`);
}
