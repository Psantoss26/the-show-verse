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
} from "@/lib/api/tmdb";

import {
  getTraktMoviesTrending,
  getTraktMoviesPopular,
  getTraktMoviesRecommended,
  getTraktMoviesAnticipated,
  getTraktMoviesPlayed,
  removeDuplicates,
} from "@/lib/api/traktHelpers";

export const dynamic = "force-dynamic";

// Ajusta el revalidate según lo fresco que quieras el contenido
export const revalidate = 1800; // 30 minutos

/* ========= Utilidad para obtener la URL base en servidor ========= */
function getBaseUrl() {
  // Pon aquí la que uses en tu proyecto (por ejemplo NEXT_PUBLIC_SITE_URL)
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

  const res = await fetch(url, {
    // Opcional, para que Next cachee también esta llamada
    next: { revalidate },
  });

  if (!res.ok) {
    console.error("Error al llamar a /api/imdb/top-rated:", res.status);
    return [];
  }

  const json = await res.json();

  // Cubrimos varias formas posibles de respuesta:
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.results)) return json.results;
  if (Array.isArray(json.items)) return json.items;

  return [];
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

/* ======== Carga de datos en el SERVIDOR ======== */
async function getDashboardData() {
  const lang = "es-ES";

  try {
    // Lanzamos la llamada a IMDb en paralelo
    const topImdbPromise = fetchTopRatedImdbServer();

    const [
      popular,
      action,
      scifi,
      thrillers,
      romance,
      vengeance,
      mind,
      baseSections,

      // ✅ NUEVAS SECCIONES TRAKT - Solo Películas
      traktTrending,
      traktPopular,
      traktRecommended,
      traktAnticipated,
      traktPlayedWeekly,
      traktPlayedMonthly,
      traktPlayedYearly,
      traktPlayedAll,
    ] = await Promise.all([
      // TMDb originales
      fetchPopularMedia({ type: "movie", language: lang }),
      fetchMediaByGenre({
        type: "movie",
        genreId: 28,
        minVotes: 1000,
        language: lang,
      }),
      fetchMediaByGenre({
        type: "movie",
        genreId: 878,
        minVotes: 1000,
        language: lang,
      }),
      fetchMediaByGenre({
        type: "movie",
        genreId: 53,
        minVotes: 1000,
        language: lang,
      }),
      fetchMediaByGenre({
        type: "movie",
        genreId: 10749,
        minVotes: 1000,
        language: lang,
      }),
      fetchMediaByKeyword({
        type: "movie",
        keywordId: 9715,
        minVotes: 500,
        language: lang,
      }),
      fetchMindBendingMovies(),
      fetchMovieSections
        ? fetchMovieSections({ language: lang })
        : Promise.resolve({}),

      // ✅ Trakt - Solo Películas
      getTraktMoviesTrending(50),
      getTraktMoviesPopular(50),
      getTraktMoviesRecommended(50),
      getTraktMoviesAnticipated(50),
      getTraktMoviesPlayed("weekly", 50),
      getTraktMoviesPlayed("monthly", 50),
      getTraktMoviesPlayed("yearly", 50),
      getTraktMoviesPlayed("all", 50),
    ]);

    const top_imdb_raw = await topImdbPromise;

    const curatedPopular = curateList(popular, {
      minVotes: 1500,
      minRating: 6.2,
      minSize: 30,
      maxSize: 80,
    });

    const curatedTopIMDb = curateList(top_imdb_raw, {
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
        curatedBaseSections[key] = sortByVotes(list).slice(0, 10);
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

    // ✅ Limpieza de duplicados en secciones Trakt
    const cleanedTraktTrending = removeDuplicates(traktTrending);
    const cleanedTraktPopular = removeDuplicates(traktPopular);
    const cleanedTraktRecommended = removeDuplicates(traktRecommended);
    const cleanedTraktAnticipated = removeDuplicates(traktAnticipated);
    const cleanedTraktPlayedWeekly = removeDuplicates(traktPlayedWeekly);
    const cleanedTraktPlayedMonthly = removeDuplicates(traktPlayedMonthly);
    const cleanedTraktPlayedYearly = removeDuplicates(traktPlayedYearly);
    const cleanedTraktPlayedAll = removeDuplicates(traktPlayedAll);

    return {
      // TMDb originales
      popular: curatedPopular,
      top_imdb: curatedTopIMDb,
      mind,
      action: curatedAction,
      scifi: curatedScifi,
      thrillers: curatedThrillers,
      romance: curatedRomance,
      vengeance: curatedVengeance,
      ...curatedBaseSections,

      // ✅ NUEVAS SECCIONES TRAKT
      traktTrending: cleanedTraktTrending,
      traktPopular: cleanedTraktPopular,
      traktRecommended: cleanedTraktRecommended,
      traktAnticipated: cleanedTraktAnticipated,
      traktPlayedWeekly: cleanedTraktPlayedWeekly,
      traktPlayedMonthly: cleanedTraktPlayedMonthly,
      traktPlayedYearly: cleanedTraktPlayedYearly,
      traktPlayedAll: cleanedTraktPlayedAll,
    };
  } catch (err) {
    console.error("Error cargando la página de películas (SSR):", err);
    return {};
  }
}

/* =================== Componente de servidor =================== */
export default async function MoviesPage() {
  const dashboardData = await getDashboardData();
  return <MoviesPageClient initialData={dashboardData} />;
}
