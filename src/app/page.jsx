// /src/app/page.jsx
import MainDashboardClient from "@/components/MainDashboardClient";

import {
  fetchTopRatedMovies,
  fetchTopRatedTV,
  fetchTrendingMovies,
  fetchTrendingTV,
  fetchPopularMovies,
  fetchPopularTV,
  discoverMovies,
  discoverTV,
  fetchMediaByGenre,
} from "@/lib/api/tmdb";
import { balanceSoftLimitedDashboardContent } from "@/lib/dashboard/contentBalance";
import { fetchAnonymousDashboardRows } from "@/lib/dashboard/engineRows";
import { buildFeatured } from "@/lib/dashboard/featured";

export const dynamic = "force-static";
export const revalidate = 3600; // 1 hora — reduce cold starts en Vercel
export const maxDuration = 60; // Vercel Pro = 60s; Hobby = 10s (máximo posible)

export const metadata = {
  title: "Inicio",
};

/* ======== Curado de listas (mismo criterio que Películas/Series) ======== */
const sortByVotes = (list = [], mediaType = "movie") =>
  balanceSoftLimitedDashboardContent(
    [...list].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)),
    mediaType,
  );

function curateList(
  list,
  { minVotes = 0, minRating = 0, minSize = 20, maxSize = 60, mediaType = "movie" } = {},
) {
  if (!Array.isArray(list)) return [];

  const sorted = sortByVotes(list, mediaType);

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
async function getDashboardData() {
  try {
    const [
      topRatedMovies,
      topRatedTV,
      awarded,
      dramaTV,
      trendingMovies,
      trendingTV,
      popularMovies,
      popularTV,
      recognizedMovies,
      recognizedTV,
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
      fetchTrendingTV(),
      fetchPopularMovies(),
      fetchPopularTV(),
      discoverMovies({
        "vote_average.gte": 6.7,
        "vote_count.gte": 2500,
        sort_by: "vote_count.desc",
        page: 1,
      }),
      discoverTV({
        "vote_average.gte": 6.7,
        "vote_count.gte": 1200,
        sort_by: "vote_count.desc",
        page: 1,
      }),
    ]);

    // Top 20 películas y Top 20 series — se usan los backdrop_path del endpoint de lista.
    // La mejora a backdrop EN se hace client-side en TopRatedHero (ya implementado).
    const topRatedMoviesSSR = topRatedMovies
      .map((m) => ({ ...m, media_type: "movie" }))
      .sort((a, b) => (
        (b.vote_average || 0) - (a.vote_average || 0)
      ));
    const balancedTopRatedMoviesSSR = balanceSoftLimitedDashboardContent(topRatedMoviesSSR, "movie")
      .slice(0, 28);

    const topRatedTVSSR = topRatedTV
      .map((s) => ({ ...s, media_type: "tv" }))
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    const balancedTopRatedTVSSR = balanceSoftLimitedDashboardContent(topRatedTVSSR, "tv")
      .slice(0, 28);

    const awardedSSR = curateList(awarded, {
      minVotes: 1200,
      minRating: 6.8,
      minSize: 20,
      maxSize: 72,
    });

    return {
      topRatedMovies: balancedTopRatedMoviesSSR,
      topRatedTV: balancedTopRatedTVSSR,
      featured: buildFeatured(
        {
          trendingMovies,
          trendingTV,
          popularMovies,
          popularTV,
          recognizedMovies,
          recognizedTV,
          awarded: awardedSSR,
        },
        { size: 8 },
      ),
      awarded: awardedSSR,
      dramaTV: curateList(dramaTV, {
        minVotes: 1000,
        minRating: 6.5,
        minSize: 25,
        maxSize: 84,
        mediaType: "tv",
      }),
      trending: balanceSoftLimitedDashboardContent([...trendingMovies, ...trendingTV], "movie"),
      popular: balanceSoftLimitedDashboardContent([...popularMovies, ...popularTV], "movie"),

      // Trakt se carga en el cliente para que Inicio no bloquee la navegación
      // validando cookies/tokens ni esperando endpoints externos.
      traktMoviesAnticipated: null,
      traktShowsAnticipated: null,
      traktRecommended: null,
      traktRecommendedMovies: null,
      traktRecommendedShows: null,
      traktTrending: [],
      traktPopular: [],
      traktAnticipated: [],
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
      traktRecommended: null,
      traktRecommendedMovies: null,
      traktRecommendedShows: null,
    };
  }
}

/* =================== Página de Inicio =================== */
export default async function HomePage() {
  const [dashboardData, initialEngineRows] = await Promise.all([
    getDashboardData(),
    fetchAnonymousDashboardRows("home"),
  ]);

  return (
    <MainDashboardClient
      initialData={dashboardData}
      initialEngineRows={initialEngineRows}
    />
  );
}
