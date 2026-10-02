// Fuentes del FeaturedHero (SERVIDOR). Inicio, Películas y Series piden aquí
// las MISMAS listas, así que Películas y Series pueden reconstruir exactamente
// los candidatos del hero de Inicio para excluirlos (ver buildFeatured). Las
// peticiones de TMDb se cachean en servidor (tmdb()), de modo que repetirlas
// en las tres páginas no multiplica las llamadas reales.

import { discoverMovies, discoverTV, fetchPopularMovies, fetchPopularTV, fetchTrendingMovies, fetchTrendingTV } from "@/lib/api/tmdb";

const RECENT_YEARS = 2;
const MAX_AGE_YEARS = 20;
// Programas que no tienen sentido como recomendación destacada: noticias,
// reality, telenovela diaria y tertulias.
const TV_EXCLUDED_GENRES = "10763|10764|10766|10767";

// Fechas a granularidad de DÍA: la URL (y por tanto su caché) cambia una vez
// al día, no en cada render.
function isoDaysAgo(days, now = new Date()) {
  const date = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

const pages = async (fetchPage, count) =>
  (await Promise.all(Array.from({ length: count }, (_, i) => fetchPage(i + 1).catch(() => [])))).flat();

export async function fetchFeaturedSources({ movies = true, tv = true } = {}) {
  const today = isoDaysAgo(0);
  const recentFrom = isoDaysAgo(Math.round(RECENT_YEARS * 365.25));
  const windowFrom = isoDaysAgo(Math.round(MAX_AGE_YEARS * 365.25));
  const none = async () => [];

  const [
    trendingMovies,
    trendingTV,
    popularMovies,
    popularTV,
    recentMovies,
    recentTV,
    recognizedMovies,
    recognizedTV,
    awarded,
  ] = await Promise.all([
    movies ? fetchTrendingMovies().catch(() => []) : none(),
    tv ? fetchTrendingTV().catch(() => []) : none(),
    movies ? fetchPopularMovies().catch(() => []) : none(),
    tv ? fetchPopularTV().catch(() => []) : none(),
    // Estrenos importantes: lo más popular de los dos últimos años que ya
    // tiene un mínimo de votos (descarta lo que aún nadie ha visto).
    movies
      ? pages((page) => discoverMovies({
        "primary_release_date.gte": recentFrom,
        "primary_release_date.lte": today,
        "vote_count.gte": 150,
        sort_by: "popularity.desc",
        page,
      }), 2)
      : none(),
    tv
      ? pages((page) => discoverTV({
        "first_air_date.gte": recentFrom,
        "first_air_date.lte": today,
        "vote_count.gte": 80,
        without_genres: TV_EXCLUDED_GENRES,
        sort_by: "popularity.desc",
        page,
      }), 2)
      : none(),
    // Reconocidos: los más votados (y bien valorados) de los últimos 20 años.
    movies
      ? pages((page) => discoverMovies({
        "primary_release_date.gte": windowFrom,
        "vote_average.gte": 7,
        "vote_count.gte": 4000,
        sort_by: "vote_count.desc",
        page,
      }), 3)
      : none(),
    tv
      ? pages((page) => discoverTV({
        "first_air_date.gte": windowFrom,
        "vote_average.gte": 7.3,
        "vote_count.gte": 2500,
        without_genres: TV_EXCLUDED_GENRES,
        sort_by: "vote_count.desc",
        page,
      }), 3)
      : none(),
    // Las mejor valoradas con respaldo amplio (premiadas / de culto).
    movies
      ? discoverMovies({
        "primary_release_date.gte": windowFrom,
        "vote_average.gte": 7.5,
        "vote_count.gte": 4000,
        sort_by: "vote_average.desc",
        page: 1,
      }).catch(() => [])
      : none(),
  ]);

  return {
    trendingMovies,
    trendingTV,
    popularMovies,
    popularTV,
    recentMovies,
    recentTV,
    recognizedMovies,
    recognizedTV,
    awarded,
  };
}
