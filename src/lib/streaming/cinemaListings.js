// Cartelera de España para la fila «En cines» de Inicio (solo servidor).
//
// JustWatch lista las películas con ofertas `CINEMA` (sesiones en Cinesa,
// Yelmo, Kinépolis…) ordenadas por popularidad. Esa lista mezcla tres cosas:
// estrenos en cartelera, reposiciones (El padrino en un ciclo, clásicos de
// Halloween…) y preventas de estrenos futuros. Las dos primeras se pueden ver
// hoy en un cine; las preventas no, así que se descartan con la fecha de
// estreno en cines en España de TMDb, igual que en la ficha (ver cinema.js).

import { pickSpainTheatricalDate, todayInMadrid } from "./cinema.js";

const JUSTWATCH_API_URL = "https://apis.justwatch.com/graphql";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// La cartelera cambia los viernes; 3 h basta para que una preventa pase a
// estreno el mismo día y no se pidan las fichas en cada visita.
const LISTINGS_REVALIDATE_SECONDS = 3 * 60 * 60;
const CANDIDATES = 60;
const DETAILS_CONCURRENCY = 10;

const CINEMA_TITLES_QUERY = `
query GetCinemaTitles($filter: TitleFilter!, $country: Country!, $language: Language!, $first: Int!) {
  popularTitles(country: $country, first: $first, filter: $filter, sortBy: POPULAR) {
    edges {
      node {
        content(country: $country, language: $language) {
          externalIds { tmdbId }
        }
      }
    }
  }
}
`;

async function fetchCinemaTmdbIds(first) {
  const response = await fetch(JUSTWATCH_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: CINEMA_TITLES_QUERY,
      variables: {
        filter: { objectTypes: ["MOVIE"], monetizationTypes: ["CINEMA"] },
        country: "ES",
        language: "es",
        first,
      },
    }),
    signal: AbortSignal.timeout(8000),
    next: { revalidate: LISTINGS_REVALIDATE_SECONDS },
  });
  if (!response.ok) throw new Error(`JustWatch API error: ${response.status}`);
  const payload = await response.json();
  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message || "JustWatch GraphQL error");
  }

  const ids = [];
  for (const edge of payload?.data?.popularTitles?.edges || []) {
    const id = Number(edge?.node?.content?.externalIds?.tmdbId);
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function fetchMovieWithReleaseDates(id) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${id}?api_key=${apiKey}&language=es-ES&append_to_response=release_dates`,
      {
        signal: AbortSignal.timeout(6000),
        next: { revalidate: LISTINGS_REVALIDATE_SECONDS },
      },
    );
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function mapWithConcurrency(values, limit, fn) {
  const results = new Array(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await fn(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Fichas de TMDb (con `release_dates`) → tarjetas con la forma TMDb de las
// filas de los dashboards, en el mismo orden, sin preventas ni títulos sin
// póster. `release_date` es el estreno en España cuando se conoce.
export function selectNowInCinemas(movies, today = todayInMadrid()) {
  const items = [];
  for (const movie of Array.isArray(movies) ? movies : []) {
    if (!movie?.id || !movie.poster_path) continue;
    const spainDate = pickSpainTheatricalDate(movie.release_dates?.results);
    const releaseDate = spainDate || movie.release_date || null;
    // Sin ninguna fecha no se puede descartar una preventa: fuera.
    if (!releaseDate || releaseDate > today) continue;

    items.push({
      id: movie.id,
      media_type: "movie",
      title: movie.title,
      original_title: movie.original_title || movie.title,
      poster_path: movie.poster_path,
      backdrop_path: movie.backdrop_path || null,
      vote_average: typeof movie.vote_average === "number" ? movie.vote_average : 0,
      vote_count: Number(movie.vote_count) || 0,
      original_language: movie.original_language || null,
      genre_ids: Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : [],
      popularity: movie.popularity || 0,
      release_date: releaseDate,
    });
  }
  return items;
}

// Películas que se pueden ver hoy en un cine en España, por popularidad en
// JustWatch. Nunca lanza: si algo falla, la fila no se pinta.
export async function fetchNowInCinemas({ limit = 40 } = {}) {
  try {
    const ids = await fetchCinemaTmdbIds(CANDIDATES);
    const movies = await mapWithConcurrency(
      ids,
      DETAILS_CONCURRENCY,
      fetchMovieWithReleaseDates,
    );
    return selectNowInCinemas(movies).slice(0, limit);
  } catch (error) {
    console.error("Error loading Spanish cinema listings:", error);
    return [];
  }
}
