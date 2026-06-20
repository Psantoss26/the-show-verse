// /src/app/movies/page.jsx
import { cookies } from "next/headers";
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
} from "@/lib/api/tmdb";
import { normalizeLocale } from "@/lib/localization";

// Ajusta el revalidate según lo fresco que quieras el contenido
export const revalidate = 1800; // 30 minutos

export async function generateMetadata() {
  const locale = await getUserLocale();
  return {
    title: locale === "en-US" ? "Movies" : "Peliculas",
  };
}

async function getUserLocale() {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get("showverse_locale")?.value);
}

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

  let res;
  try {
    res = await fetch(url, {
      // Opcional, para que Next cachee también esta llamada
      next: { revalidate },
    });
  } catch (networkErr) {
    console.error(
      "Error de red al llamar a /api/imdb/top-rated:",
      networkErr?.message,
    );
    return [];
  }

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

/* ======== Carga de datos CRÍTICOS en el SERVIDOR ======== */
async function getCriticalDashboardData(lang) {
  try {
    const [popular, topES] = await Promise.all([
      fetchPopularMedia({ type: "movie", language: lang }),
      discoverMovies({ region: "ES", sort_by: "popularity.desc", page: 1 }),
    ]);

    const curatedPopular = curateList(popular, {
      minVotes: 1500,
      minRating: 6.2,
      minSize: 30,
      maxSize: 80,
    });

    const curatedTopES = sortByVotes(topES).slice(0, 10);

    return {
      popular: curatedPopular,
      "Top 10 hoy en España": curatedTopES,
    };
  } catch (err) {
    console.error("Error cargando datos críticos de películas (SSR):", err);
    return {
      popular: [],
      "Top 10 hoy en España": [],
    };
  }
}

/* ======== Carga de datos DIFERIDOS en el SERVIDOR ======== */
async function getDeferredDashboardData(lang) {
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
    ] = await Promise.all([
      fetchTopRatedImdbServer(),
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
      discoverMovies({ "vote_count.gte": 4000, sort_by: "popularity.desc", page: 1 }),
      discoverMovies({ "vote_count.gte": 4000, sort_by: "popularity.desc", page: 2 }),
      discoverMovies({ "vote_count.gte": 4000, sort_by: "popularity.desc", page: 3 }),
      fetchMovieSections
        ? fetchMovieSections({ language: lang })
        : Promise.resolve({}),
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
  const lang = await getUserLocale();
  const initialData = await getCriticalDashboardData(lang);
  const deferredDataPromise = getDeferredDashboardData(lang);

  return (
    <MoviesPageClient
      language={lang}
      initialData={initialData}
      deferredDataPromise={deferredDataPromise}
    />
  );
}
