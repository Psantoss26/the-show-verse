// /src/app/series/page.jsx
import SeriesPageClient from "./SeriesPageClient";

import {
  fetchPopularMedia,
  fetchMediaByGenre,
  fetchMediaByKeyword,
  fetchTVSections,
  fetchRomanceSeriesWithGoodReviews,
} from "@/lib/api/tmdb";

import {
  getTraktShowsTrending,
  getTraktShowsPopular,
  getTraktShowsRecommended,
  getTraktShowsAnticipated,
  getTraktShowsPlayed,
  removeDuplicates,
} from "@/lib/api/traktHelpers";

export const revalidate = 1800; // 30 min

/* ========= Utilidad para obtener la URL base en servidor ========= */
function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/* ======== Llamada SERVER-SIDE a /api/imdb/top-rated (series) ======== */
async function fetchTopRatedImdbTvServer() {
  const baseUrl = getBaseUrl();

  const url = `${baseUrl}/api/imdb/top-rated?type=tv&pages=3&limit=80&minVotes=5000`;

  const res = await fetch(url, {
    next: { revalidate },
  });

  if (!res.ok) {
    console.error("Error al llamar a /api/imdb/top-rated (tv):", res.status);
    return [];
  }

  const json = await res.json();

  if (Array.isArray(json)) return json;
  if (Array.isArray(json.results)) return json.results;
  if (Array.isArray(json.items)) return json.items;

  return [];
}

/* ======== Curado de listas tipo Netflix/Prime ======== */
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

/* ======== Carga de datos en el SERVIDOR para series ======== */
async function getDashboardData() {
  const lang = "es-ES";

  try {
    const topImdbPromise = fetchTopRatedImdbTvServer();

    const [
      popular,
      drama,
      scifi_fantasy,
      crime,
      romance,
      animation,
      baseSections,

      // ✅ NUEVAS SECCIONES TRAKT - Solo Series
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
      fetchPopularMedia({ type: "tv", language: lang }),
      fetchMediaByGenre({
        type: "tv",
        genreId: 18,
        minVotes: 800,
        language: lang,
      }), // Drama
      fetchMediaByGenre({
        type: "tv",
        genreId: 10765,
        minVotes: 800,
        language: lang,
      }), // Sci-Fi & Fantasy
      fetchMediaByGenre({
        type: "tv",
        genreId: 80,
        minVotes: 800,
        language: lang,
      }), // Crimen
      fetchRomanceSeriesWithGoodReviews({
        language: lang,
        pages: 1,
      }), // Romance
      fetchMediaByGenre({
        type: "tv",
        genreId: 16,
        minVotes: 400,
        language: lang,
      }), // Animación
      fetchTVSections
        ? fetchTVSections({ language: lang })
        : Promise.resolve({}),

      // ✅ Trakt - Solo Series
      getTraktShowsTrending(24),
      getTraktShowsPopular(24),
      getTraktShowsRecommended(24),
      getTraktShowsAnticipated(24),
      getTraktShowsPlayed("weekly", 24),
      getTraktShowsPlayed("monthly", 24),
      getTraktShowsPlayed("yearly", 24),
      getTraktShowsPlayed("all", 24),
    ]);

    const top_imdb_raw = await topImdbPromise;

    const curatedPopular = curateList(popular, {
      minVotes: 1200,
      minRating: 6.3,
      minSize: 30,
      maxSize: 80,
    });

    const curatedTopIMDb = curateList(top_imdb_raw, {
      minVotes: 8000,
      minRating: 7.4,
      minSize: 30,
      maxSize: 80,
    });

    const curatedDrama = curateList(drama, {
      minVotes: 1000,
      minRating: 6.5,
      minSize: 25,
      maxSize: 70,
    });

    const curatedScifiFantasy = curateList(scifi_fantasy, {
      minVotes: 800,
      minRating: 6.4,
      minSize: 20,
      maxSize: 60,
    });

    const curatedCrime = curateList(crime, {
      minVotes: 800,
      minRating: 6.4,
      minSize: 20,
      maxSize: 60,
    });

    const curatedRomance = curateList(romance, {
      minVotes: 50,
      minRating: 6.0,
      minSize: 20,
      maxSize: 60,
    });

    const curatedAnimation = curateList(animation, {
      minVotes: 400,
      minRating: 6.2,
      minSize: 20,
      maxSize: 60,
    });

    const curatedBaseSections = {};
    const curatedByGenre = {};

    // Curado de secciones base TMDb
    for (const [key, list] of Object.entries(baseSections || {})) {
      if (!Array.isArray(list)) continue;

      if (key === "Top 10 hoy en España") {
        curatedBaseSections[key] = sortByVotes(list).slice(0, 10);
        continue;
      }

      let params;
      if (key === "En Emisión") {
        params = {
          minVotes: 400,
          minRating: 6.5,
          minSize: 20,
          maxSize: 60,
        };
      } else if (key === "Aclamadas por la crítica") {
        params = {
          minVotes: 800,
          minRating: 7.2,
          minSize: 20,
          maxSize: 60,
        };
      } else if (key.startsWith("Década de")) {
        params = {
          minVotes: 600,
          minRating: 6.2,
          minSize: 15,
          maxSize: 60,
        };
      } else if (key === "Por género") {
        // Se trata más abajo
        continue;
      } else {
        params = {
          minVotes: 500,
          minRating: 6.0,
          minSize: 20,
          maxSize: 60,
        };
      }

      curatedBaseSections[key] = curateList(list, params);
    }

    // Curado de "Por género"
    const byGenreRaw = baseSections?.["Por género"] || {};
    for (const [gname, list] of Object.entries(byGenreRaw)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      curatedByGenre[gname] = curateList(list, {
        minVotes: 400,
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

    // Objeto final de dashboard que se envía al cliente
    const dashboard = {
      // TMDb originales
      popular: curatedPopular,
      top_imdb: curatedTopIMDb,
      drama: curatedDrama,
      scifi_fantasy: curatedScifiFantasy,
      crime: curatedCrime,
      romance: curatedRomance,
      animation: curatedAnimation,
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

    return dashboard;
  } catch (err) {
    console.error("Error cargando la página de series (SSR):", err);
    return {};
  }
}

/* =================== Componente de servidor =================== */
export default async function SeriesPage() {
  const dashboardData = await getDashboardData();
  return <SeriesPageClient initialData={dashboardData} />;
}
