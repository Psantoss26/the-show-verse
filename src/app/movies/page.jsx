// /src/app/movies/page.jsx
import MoviesPageClient from "./MoviesPageClient";

import {
  fetchPopularMedia,
  // OJO: ya no usamos este helper porque hace fetch('/api/...') en server
  // fetchTopRatedIMDb,
  fetchMediaByGenre,
  fetchMediaByKeyword,
  fetchMovieSections,
  fetchMindBendingMovies,
  discoverMovies,
  discoverTV,
  fetchTrendingMovies,
  fetchTrendingTV,
  fetchPopularMovies,
  fetchPopularTV,
} from "@/lib/api/tmdb";
import {
  buildFeatured,
  getFeaturedExclusionKeys,
} from "@/lib/dashboard/featured";

// Ajusta el revalidate según lo fresco que quieras el contenido
export const revalidate = 1800; // 30 minutos
// Margen para que la carga + streaming de datos diferidos termine en Vercel.
export const maxDuration = 30;

export const metadata = {
  title: "Películas",
};

/* ========= Utilidad para obtener la URL base en servidor ========= */
function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL)
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // Fallback para desarrollo local
  return "http://localhost:3000";
}

/* ======== Llamada SERVER-SIDE a /api/imdb/top-rated ======== */
async function fetchTopRatedImdbServer() {
  const baseUrl = getBaseUrl();

  const url = `${baseUrl}/api/imdb/top-rated?type=movie&pages=3&limit=80&minVotes=15000`;

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
      console.error("Error al llamar a /api/imdb/top-rated:", res.status);
      return [];
    }

    // Protegemos el parseo: en producción la respuesta podría no ser JSON.
    const json = await res.json().catch(() => null);
    if (!json) return [];

    if (Array.isArray(json)) return json;
    if (Array.isArray(json.results)) return json.results;
    if (Array.isArray(json.items)) return json.items;
    return [];
  } catch (networkErr) {
    console.error(
      "Error de red al llamar a /api/imdb/top-rated:",
      networkErr?.message,
    );
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ======== Curado de listas tipo Netflix/Prime (solo servidor) ======== */
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

/* ======== Carga de datos CRÍTICOS en el SERVIDOR ======== */
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
      fetchPopularMedia({ type: "movie", language: lang }),
      discoverMovies({ region: "ES", sort_by: "popularity.desc", page: 1 }),
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
      minVotes: 1500,
      minRating: 6.2,
      minSize: 30,
      maxSize: 80,
    });

    const curatedTopES = sortByVotes(topES).slice(0, 10);
    const curatedAwarded = curateList(awarded, {
      minVotes: 1200,
      minRating: 6.8,
      minSize: 20,
      maxSize: 60,
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
        trendingMovies,
        popularMovies,
        recognizedMovies,
        awarded: curatedAwarded,
      },
      {
        size: 8,
        mediaTypes: ["movie"],
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
    console.error("Error cargando datos críticos de películas (SSR):", err);
    return {
      featured: [],
      popular: [],
      "Top 10 hoy en España": [],
    };
  }
}

/* ======== Carga de datos DIFERIDOS en el SERVIDOR ======== */
async function getDeferredDashboardData() {
  const lang = "es-ES";

  try {
    const [
      topImdbRaw,
      action,
      scifi,
      thrillers,
      romance,
      vengeance,
      mind,
      blockbustersP1,
      blockbustersP2,
      blockbustersP3,
      baseSections,
      // Cada llamada se protege con .catch para que un fallo aislado (p. ej. en
      // producción) no rechace todo el Promise.all y deje sin secciones la
      // página. Las que devuelven array caen a [], baseSections a {}.
    ] = await Promise.all([
      fetchTopRatedImdbServer().catch(() => []),
      fetchMediaByGenre({
        type: "movie",
        genreId: 28,
        minVotes: 1000,
        language: lang,
      }).catch(() => []),
      fetchMediaByGenre({
        type: "movie",
        genreId: 878,
        minVotes: 1000,
        language: lang,
      }).catch(() => []),
      fetchMediaByGenre({
        type: "movie",
        genreId: 53,
        minVotes: 1000,
        language: lang,
      }).catch(() => []),
      fetchMediaByGenre({
        type: "movie",
        genreId: 10749,
        minVotes: 1000,
        language: lang,
      }).catch(() => []),
      fetchMediaByKeyword({
        type: "movie",
        keywordId: 9715,
        minVotes: 500,
        language: lang,
      }).catch(() => []),
      fetchMindBendingMovies().catch(() => []),
      discoverMovies({ "vote_count.gte": 4000, sort_by: "popularity.desc", page: 1 }).catch(() => []),
      discoverMovies({ "vote_count.gte": 4000, sort_by: "popularity.desc", page: 2 }).catch(() => []),
      discoverMovies({ "vote_count.gte": 4000, sort_by: "popularity.desc", page: 3 }).catch(() => []),
      (fetchMovieSections
        ? fetchMovieSections({ language: lang })
        : Promise.resolve({})
      ).catch(() => ({})),
    ]);

    const curatedTopIMDb = curateList(topImdbRaw, {
      minVotes: 20000,
      minRating: 7.3,
      minSize: 30,
      maxSize: 80,
    });

    const curatedAction = curateList(action, {
      minVotes: 2000,
      minRating: 6.2,
      minSize: 25,
      maxSize: 70,
    });

    const curatedScifi = curateList(scifi, {
      minVotes: 1500,
      minRating: 6.3,
      minSize: 20,
      maxSize: 60,
    });

    const curatedThrillers = curateList(thrillers, {
      minVotes: 1500,
      minRating: 6.3,
      minSize: 20,
      maxSize: 60,
    });

    const curatedRomance = curateList(romance, {
      minVotes: 1500,
      minRating: 6.2,
      minSize: 20,
      maxSize: 60,
    });

    const curatedVengeance = curateList(vengeance, {
      minVotes: 800,
      minRating: 6.0,
      minSize: 20,
      maxSize: 50,
    });

    const curatedBaseSections = {};
    for (const [key, list] of Object.entries(baseSections || {})) {
      if (!Array.isArray(list)) continue;

      if (key === "Top 10 hoy en España") {
        continue;
      }

      let params;
      if (key === "Premiadas") {
        params = {
          minVotes: 1200,
          minRating: 6.8,
          minSize: 20,
          maxSize: 60,
        };
      } else if (key === "Superéxito") {
        params = {
          minVotes: 3000,
          minRating: 6.5,
          minSize: 25,
          maxSize: 60,
        };
      } else if (key.startsWith("Década de")) {
        params = {
          minVotes: 800,
          minRating: 6.2,
          minSize: 15,
          maxSize: 60,
        };
      } else if (key === "Por género") {
        continue;
      } else {
        params = {
          minVotes: 700,
          minRating: 6.0,
          minSize: 20,
          maxSize: 60,
        };
      }

      curatedBaseSections[key] = curateList(list, params);
    }

    const curatedByGenre = {};
    const byGenreRaw = baseSections?.["Por género"] || {};
    for (const [gname, list] of Object.entries(byGenreRaw)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      curatedByGenre[gname] = curateList(list, {
        minVotes: 600,
        minRating: 6.0,
        minSize: 15,
        maxSize: 50,
      });
    }
    if (Object.keys(curatedByGenre).length > 0) {
      curatedBaseSections["Por género"] = curatedByGenre;
    }

    const blockbustersRaw = [...blockbustersP1, ...blockbustersP2, ...blockbustersP3];
    curatedBaseSections["Superéxito"] = curateList(blockbustersRaw, {
      minVotes: 4000,
      minRating: 6.5,
      minSize: 25,
      maxSize: 80,
    });

    const imdbIdSet = new Set(curatedTopIMDb.map((m) => m.id));
    if (curatedBaseSections["Más votadas"]) {
      curatedBaseSections["Más votadas"] = curatedBaseSections[
        "Más votadas"
      ].filter((m) => !imdbIdSet.has(m.id));
    }
    const seenAfterMostVoted = new Set([
      ...imdbIdSet,
      ...(curatedBaseSections["Más votadas"] || []).map((m) => m.id),
    ]);
    if (curatedBaseSections["Superéxito"]) {
      curatedBaseSections["Superéxito"] = curatedBaseSections[
        "Superéxito"
      ].filter((m) => !seenAfterMostVoted.has(m.id));
    }

    return {
      top_imdb: curatedTopIMDb,
      mind,
      action: curatedAction,
      scifi: curatedScifi,
      thrillers: curatedThrillers,
      romance: curatedRomance,
      vengeance: curatedVengeance,
      ...curatedBaseSections,
    };
  } catch (err) {
    console.error("Error cargando datos diferidos de películas:", err);
    return {};
  }
}

/* =================== Componente de servidor =================== */
export default async function MoviesPage() {
  const initialData = await getCriticalDashboardData();
  const deferredDataPromise = getDeferredDashboardData();

  return (
    <MoviesPageClient
      initialData={initialData}
      deferredDataPromise={deferredDataPromise}
    />
  );
}
