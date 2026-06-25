// /src/app/series/page.jsx
import SeriesPageClient from "./SeriesPageClient";

import {
  fetchPopularMedia,
  fetchMediaByGenre,
  fetchTVSections,
  fetchRomanceSeriesWithGoodReviews,
  discoverTV,
  discoverMovies,
  fetchTrendingMovies,
  fetchTrendingTV,
  fetchPopularMovies,
  fetchPopularTV,
  fetchTrendingTVDay,
} from "@/lib/api/tmdb";
import {
  buildFeatured,
  getFeaturedExclusionKeys,
} from "@/lib/dashboard/featured";
import { balanceSoftLimitedDashboardContent } from "@/lib/dashboard/contentBalance";
import { fetchAnonymousDashboardRows } from "@/lib/dashboard/engineRows";

export const revalidate = 1800; // 30 min
// Margen para que la carga + streaming de datos diferidos termine en Vercel.
export const maxDuration = 30;

export const metadata = {
  title: "Series",
};

/* ========= Utilidad para obtener la URL base en servidor ========= */
function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL)
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/* ======== Llamada SERVER-SIDE a /api/imdb/top-rated (series) ======== */
async function fetchTopRatedImdbTvServer() {
  const baseUrl = getBaseUrl();

  const url = `${baseUrl}/api/imdb/top-rated?type=tv&pages=3&limit=120&minVotes=5000`;

  // Timeout para que este self-fetch (scraping de IMDb, lento) nunca cuelgue la
  // carga del resto de secciones diferidas en producción.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await fetch(url, {
      next: { revalidate },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error("Error al llamar a /api/imdb/top-rated (tv):", res.status);
      return [];
    }

    const json = await res.json().catch(() => null);
    if (!json) return [];

    if (Array.isArray(json)) return json;
    if (Array.isArray(json.results)) return json.results;
    if (Array.isArray(json.items)) return json.items;
    return [];
  } catch (networkErr) {
    console.error(
      "Error de red al llamar a /api/imdb/top-rated (tv):",
      networkErr?.message,
    );
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ======== Curado de listas tipo Netflix/Prime ======== */
const sortByVotes = (list = []) =>
  balanceSoftLimitedDashboardContent(
    [...list].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)),
    "tv",
  );

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

/* ======== Carga de datos CRÍTICOS en el SERVIDOR para series ======== */
async function getCriticalDashboardData() {
  const lang = "es-ES";

  try {
    const [
      popular,
      topES,
      trendingMovies,
      trendingTV,
      popularMovies,
      popularTV,
      recognizedMovies,
      recognizedTV,
      awarded,
    ] = await Promise.all([
      fetchPopularMedia({ type: "tv", language: lang }),
      fetchTrendingTVDay(),
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
      discoverMovies({
        "vote_average.gte": 7.5,
        "vote_count.gte": 2000,
        sort_by: "vote_average.desc",
        page: 1,
      }),
    ]);

    const curatedPopular = curateList(popular, {
      minVotes: 1200,
      minRating: 6.3,
      minSize: 30,
      maxSize: 100,
    });

    const curatedTopES = (topES || []).slice(0, 10);
    const curatedAwarded = curateList(awarded, {
      minVotes: 1200,
      minRating: 6.8,
      minSize: 20,
      maxSize: 72,
    });
    const mainFeatured = buildFeatured(
      {
        trendingMovies,
        trendingTV,
        popularMovies,
        popularTV,
        recognizedMovies,
        recognizedTV,
        awarded: curatedAwarded,
      },
      { size: 8 },
    );
    const { mediaKeys, titleKeys } = getFeaturedExclusionKeys(mainFeatured);
    const featured = buildFeatured(
      {
        trendingTV,
        popularTV,
        recognizedTV,
      },
      {
        size: 8,
        mediaTypes: ["tv"],
        excludeMediaKeys: mediaKeys,
        excludeTitleKeys: titleKeys,
      },
    );

    return {
      featured,
      popular: curatedPopular,
      "Top 10 hoy en España": curatedTopES,
    };
  } catch (err) {
    console.error("Error cargando datos críticos de series (SSR):", err);
    return {
      featured: [],
      popular: [],
      "Top 10 hoy en España": [],
    };
  }
}

/* ======== Carga de datos DIFERIDOS en el SERVIDOR para series ======== */
async function getDeferredDashboardData() {
  const lang = "es-ES";

  try {
    const [
      topImdbRaw,
      drama,
      scifi_fantasy,
      crime,
      romance,
      animation,
      kDrama,
      baseSections,
      // Cada llamada se protege con .catch para que un fallo aislado (p. ej. en
      // producción) no rechace todo el Promise.all y deje sin secciones la
      // página. Las que devuelven array caen a [], baseSections a {}.
    ] = await Promise.all([
      fetchTopRatedImdbTvServer().catch(() => []),
      fetchMediaByGenre({
        type: "tv",
        genreId: 18,
        minVotes: 800,
        language: lang,
      }).catch(() => []), // Drama
      fetchMediaByGenre({
        type: "tv",
        genreId: 10765,
        minVotes: 800,
        language: lang,
      }).catch(() => []), // Sci-Fi & Fantasy
      fetchMediaByGenre({
        type: "tv",
        genreId: 80,
        minVotes: 800,
        language: lang,
      }).catch(() => []), // Crimen
      fetchRomanceSeriesWithGoodReviews({
        language: lang,
        pages: 1,
      }).catch(() => []), // Romance
      fetchMediaByGenre({
        type: "tv",
        genreId: 16,
        minVotes: 700,
        language: lang,
      }).catch(() => []), // Animación
      discoverTV({
        with_original_language: "ko",
        sort_by: "popularity.desc",
        "vote_count.gte": 300,
      }).catch(() => []), // K-Drama
      (fetchTVSections
        ? fetchTVSections({ language: lang })
        : Promise.resolve({})
      ).catch(() => ({})),
    ]);

    const curatedTopIMDb = curateList(topImdbRaw, {
      minVotes: 8000,
      minRating: 7.4,
      minSize: 30,
      maxSize: 100,
    });

    const curatedDrama = curateList(drama, {
      minVotes: 1000,
      minRating: 6.5,
      minSize: 25,
      maxSize: 84,
    });

    const curatedScifiFantasy = curateList(scifi_fantasy, {
      minVotes: 800,
      minRating: 6.4,
      minSize: 20,
      maxSize: 72,
    });

    const curatedCrime = curateList(crime, {
      minVotes: 800,
      minRating: 6.4,
      minSize: 20,
      maxSize: 72,
    });

    const curatedRomance = curateList(romance, {
      minVotes: 50,
      minRating: 6.0,
      minSize: 20,
      maxSize: 72,
    });

    const curatedAnimation = curateList(animation, {
      minVotes: 700,
      minRating: 7.0,
      minSize: 14,
      maxSize: 36,
    });

    const curatedKDrama = curateList(kDrama, {
      minVotes: 300,
      minRating: 6.0,
      minSize: 20,
      maxSize: 72,
    });

    const curatedBaseSections = {};
    const curatedByGenre = {};

    // Curado de secciones base TMDb
    for (const [key, list] of Object.entries(baseSections || {})) {
      if (!Array.isArray(list)) continue;

      if (key === "Top 10 hoy en España") {
        continue;
      }

      let params;
      if (key === "Premiadas") {
        params = {
          minVotes: 800,
          minRating: 7.2,
          minSize: 20,
          maxSize: 72,
        };
      } else if (key === "Superéxito") {
        params = {
          minVotes: 1500,
          minRating: 6.5,
          minSize: 20,
          maxSize: 72,
        };
      } else if (key === "Más votadas") {
        params = {
          minVotes: 600,
          minRating: 6.2,
          minSize: 20,
          maxSize: 72,
        };
      } else if (key.startsWith("Década de")) {
        params = {
          minVotes: 600,
          minRating: 6.2,
          minSize: 15,
          maxSize: 72,
        };
      } else if (key === "Por género") {
        continue;
      } else {
        params = {
          minVotes: 500,
          minRating: 6.0,
          minSize: 20,
          maxSize: 72,
        };
      }

      curatedBaseSections[key] = curateList(list, params);
    }

    // Curado de "Por género"
    const byGenreRaw = baseSections?.["Por género"] || {};
    for (const [gname, list] of Object.entries(byGenreRaw)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      const softLimitedGenre = /animaci[oó]n|documental/i.test(gname);
      curatedByGenre[gname] = curateList(list, {
        minVotes: softLimitedGenre ? 700 : 400,
        minRating: softLimitedGenre ? 7.0 : 6.0,
        minSize: softLimitedGenre ? 10 : 15,
        maxSize: softLimitedGenre ? 40 : 60,
      });
    }
    if (Object.keys(curatedByGenre).length > 0) {
      curatedBaseSections["Por género"] = curatedByGenre;
    }

    return {
      top_imdb: curatedTopIMDb,
      drama: curatedDrama,
      scifi_fantasy: curatedScifiFantasy,
      crime: curatedCrime,
      kDrama: curatedKDrama,
      romance: curatedRomance,
      animation: curatedAnimation,
      ...curatedBaseSections,
    };
  } catch (err) {
    console.error("Error cargando datos diferidos de series:", err);
    return {};
  }
}

/* =================== Componente de servidor =================== */
export default async function SeriesPage() {
  const [initialData, initialEngineRows] = await Promise.all([
    getCriticalDashboardData(),
    fetchAnonymousDashboardRows("series"),
  ]);
  const deferredDataPromise = getDeferredDashboardData();

  return (
    <SeriesPageClient
      initialData={initialData}
      deferredDataPromise={deferredDataPromise}
      initialEngineRows={initialEngineRows}
    />
  );
}
