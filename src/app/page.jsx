// /src/app/page.jsx
import MainDashboardClient from "@/components/MainDashboardClient";
import { cookies } from "next/headers";

import {
  fetchTopRatedMovies,
  fetchTopRatedTV,
  fetchTrendingMovies,
  fetchPopularMovies,
  fetchRecommendedMovies,
  discoverMovies,
  fetchMediaByGenre,
} from "@/lib/api/tmdb";
import {
  getTraktMoviesAnticipated,
  getTraktShowsAnticipated,
} from "@/lib/api/traktHelpers";

export const revalidate = 3600; // 1 hora — reduce cold starts en Vercel
export const maxDuration = 60; // Vercel Pro = 60s; Hobby = 10s (máximo posible)

/* ======== Curado de listas (mismo criterio que Películas/Series) ======== */
const sortByVotes = (list = []) =>
  [...list].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));

function curateList(
  list,
  { minVotes = 0, minRating = 0, minSize = 20, maxSize = 60 } = {},
) {
  if (!Array.isArray(list)) return [];

  const sorted = sortByVotes(list);

  const applyFilter = (minV, minR) =>
    sorted.filter((m) => {
      const votes = m?.vote_count || 0;
      const rating = typeof m?.vote_average === "number" ? m.vote_average : 0;
      return votes >= minV && rating >= minR;
    });

  let current = applyFilter(minVotes, minRating);
  if (current.length >= minSize) return current.slice(0, maxSize);

  const steps = [
    { factorV: 0.7, deltaR: -0.3 },
    { factorV: 0.5, deltaR: -0.6 },
    { factorV: 0.3, deltaR: -1.0 },
    { factorV: 0.1, deltaR: -1.5 },
  ];

  let mv = minVotes;
  let mr = minRating;

  for (const step of steps) {
    mv = Math.max(0, Math.round(mv * step.factorV));
    mr = Math.max(0, mr + step.deltaR);
    current = applyFilter(mv, mr);
    if (current.length >= minSize) return current.slice(0, maxSize);
  }

  if (sorted.length === 0) return [];
  const size = Math.min(sorted.length, Math.max(minSize, maxSize));
  return sorted.slice(0, size);
}

/* ======== Carga de datos en el SERVIDOR ======== */
async function getDashboardData(sessionId = null) {
  try {
    const [
      topRatedMovies,
      topRatedTV,
      awarded,
      dramaTV,
      trending,
      popular,
      traktMoviesAnticipated,
      traktShowsAnticipated,
    ] = await Promise.all([
      fetchTopRatedMovies(5000),
      fetchTopRatedTV(5000),
      discoverMovies({
        "vote_average.gte": 7.5,
        "vote_count.gte": 2000,
        sort_by: "vote_average.desc",
        page: 1,
      }),
      fetchMediaByGenre({
        type: "tv",
        genreId: 18,
        minVotes: 800,
        language: "es-ES",
      }),
      fetchTrendingMovies(),
      fetchPopularMovies(),
      getTraktMoviesAnticipated(30).catch(() => null),
      getTraktShowsAnticipated(30).catch(() => null),
    ]);

    const recommended = sessionId
      ? await fetchRecommendedMovies(sessionId)
      : [];

    // Top 20 películas y Top 20 series — se usan los backdrop_path del endpoint de lista.
    // La mejora a backdrop EN se hace client-side en TopRatedHero (ya implementado).
    const topRatedMoviesSSR = topRatedMovies
      .map((m) => ({ ...m, media_type: "movie" }))
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .slice(0, 20);

    const topRatedTVSSR = topRatedTV
      .map((s) => ({ ...s, media_type: "tv" }))
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .slice(0, 20);

    return {
      topRatedMovies: topRatedMoviesSSR,
      topRatedTV: topRatedTVSSR,
      awarded: curateList(awarded, {
        minVotes: 1200,
        minRating: 6.8,
        minSize: 20,
        maxSize: 60,
      }),
      dramaTV: curateList(dramaTV, {
        minVotes: 1000,
        minRating: 6.5,
        minSize: 25,
        maxSize: 70,
      }),
      trending,
      popular,
      recommended,

      // SSR para fijar la posición de "Más esperadas" desde el primer render.
      traktMoviesAnticipated: Array.isArray(traktMoviesAnticipated)
        ? traktMoviesAnticipated
        : null,
      traktShowsAnticipated: Array.isArray(traktShowsAnticipated)
        ? traktShowsAnticipated
        : null,

      // El resto de secciones Trakt se cargan en el cliente (lazy)
      traktTrending: [],
      traktPopular: [],
      traktAnticipated: [],
      traktRecommended: [],
      traktPlayedWeekly: [],
      traktPlayedMonthly: [],
      traktWatchedWeekly: [],
      traktWatchedMonthly: [],
      traktCollectedWeekly: [],
      traktCollectedMonthly: [],
    };
  } catch (err) {
    console.error("Error cargando MainDashboard (SSR):", err);
    return {
      traktMoviesAnticipated: null,
      traktShowsAnticipated: null,
    };
  }
}

/* =================== Página de Inicio =================== */
export default async function HomePage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("tmdb_session_id")?.value || null;

  const dashboardData = await getDashboardData(sessionId);
  return <MainDashboardClient initialData={dashboardData} />;
}
