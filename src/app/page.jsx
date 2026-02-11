// /src/app/page.jsx
import MainDashboardClient from "@/components/MainDashboardClient";
import { cookies } from "next/headers";

import {
  fetchTopRatedMovies,
  fetchTopRatedTV,
  fetchCultClassics,
  fetchTopActionMovies,
  fetchPopularInUS,
  fetchRisingMovies,
  fetchTrendingMovies,
  fetchPopularMovies,
  fetchRecommendedMovies,
  discoverMovies,
  fetchMediaByGenre,
} from "@/lib/api/tmdb";

import {
  getTraktTrending,
  getTraktPopular,
  getTraktRecommended,
  getTraktAnticipated,
  getTraktMoviesAnticipated,
  getTraktShowsAnticipated,
  getTraktPlayed,
  getTraktWatched,
  getTraktCollected,
  removeDuplicates,
} from "@/lib/api/traktHelpers";

export const revalidate = 1800; // 30 minutos

/* ====================================================================
 * MISMO CRITERIO QUE EN CLIENTE (MainDashboardClient.jsx):
 *  1) Idioma EN (si existe)
 *  2) Mejor resolución (área)
 *  3) Votos (vote_count, luego vote_average)
 * ==================================================================== */
function pickBestBackdropByLangResVotesServer(list, opts = {}) {
  const {
    preferLangs = ["en", "en-US"],
    resolutionWindow = 0.98,
    minWidth = 1200,
  } = opts;

  if (!Array.isArray(list) || list.length === 0) return null;

  const area = (img) => (img?.width || 0) * (img?.height || 0);
  const lang = (img) => img?.iso_639_1 || null;

  const sizeFiltered =
    minWidth > 0 ? list.filter((b) => (b?.width || 0) >= minWidth) : list;
  const pool0 = sizeFiltered.length ? sizeFiltered : list;

  const hasPreferred = pool0.some((b) => preferLangs.includes(lang(b)));
  const pool1 = hasPreferred
    ? pool0.filter((b) => preferLangs.includes(lang(b)))
    : pool0;

  const maxArea = Math.max(...pool1.map(area));
  const threshold =
    maxArea * (typeof resolutionWindow === "number" ? resolutionWindow : 1.0);
  const pool2 = pool1.filter((b) => area(b) >= threshold);

  const sorted = [...pool2].sort((a, b) => {
    const aA = area(a);
    const bA = area(b);
    if (bA !== aA) return bA - aA;
    const w = (b.width || 0) - (a.width || 0);
    if (w !== 0) return w;
    const vc = (b.vote_count || 0) - (a.vote_count || 0);
    if (vc !== 0) return vc;
    const va = (b.vote_average || 0) - (a.vote_average || 0);
    return va;
  });

  return sorted[0] || null;
}

/* ========= Backdrop preferido (SERVER) ========= */
async function fetchBestBackdropServer(itemId, mediaType = "movie") {
  try {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    if (!apiKey || !itemId) return null;

    const type = mediaType === "tv" ? "tv" : "movie";
    const url =
      `https://api.themoviedb.org/3/${type}/${itemId}/images` +
      `?api_key=${apiKey}` +
      `&include_image_language=en,en-US,es,es-ES,null`;

    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return null;

    const j = await r.json();
    const backs = Array.isArray(j?.backdrops) ? j.backdrops : [];

    const best = pickBestBackdropByLangResVotesServer(backs, {
      preferLangs: ["en", "en-US"],
      resolutionWindow: 0.98,
      minWidth: 1200,
    });

    return best?.file_path || null;
  } catch {
    return null;
  }
}

/* ====================================================================
 * TRAKT: Discover (Recommended / Anticipated) + hidratado con TMDb
 * ==================================================================== */
const TRAKT_KEY =
  process.env.TRAKT_CLIENT_ID ||
  process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID ||
  process.env.TRAKT_API_KEY;

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

function traktHeaders() {
  if (!TRAKT_KEY) return null;
  return {
    "content-type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": TRAKT_KEY,
  };
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchTrakt(path) {
  const headers = traktHeaders();
  if (!headers) return [];
  const res = await fetch(`https://api.trakt.tv${path}`, {
    headers,
    // cache y revalidate independientes (puedes alinearlo con 1800 si quieres)
    next: { revalidate: 60 * 60 }, // 1h
  });
  const json = await safeJson(res);
  if (!res.ok) return [];
  return Array.isArray(json) ? json : [];
}

async function fetchTmdbDetails(type, id) {
  if (!TMDB_KEY || !type || !id) return null;
  const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}&language=es-ES`;
  const res = await fetch(url, { next: { revalidate: 60 * 60 } });
  const json = await safeJson(res);
  if (!res.ok) return null;
  return json;
}

function interleave(a, b, limit = 24) {
  const out = [];
  let i = 0;
  while (out.length < limit && (i < a.length || i < b.length)) {
    if (i < a.length) out.push(a[i]);
    if (out.length >= limit) break;
    if (i < b.length) out.push(b[i]);
    i++;
  }
  return out;
}

async function mapWithConcurrency(items, worker, concurrency = 8) {
  const out = new Array(items.length);
  let idx = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (idx < items.length) {
        const cur = idx++;
        out[cur] = await worker(items[cur]).catch(() => null);
      }
    },
  );

  await Promise.all(runners);
  return out.filter(Boolean);
}

async function getTraktDiscoverRecommended(limit = 24) {
  // Movies + TV, alternado
  const [movies, shows] = await Promise.all([
    fetchTrakt(`/movies/recommended/weekly?extended=full&limit=30`),
    fetchTrakt(`/shows/recommended/weekly?extended=full&limit=30`),
  ]);

  const movieSeeds = movies
    .map((m) => ({ media_type: "movie", tmdb: m?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const showSeeds = shows
    .map((s) => ({ media_type: "tv", tmdb: s?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const mixed = interleave(movieSeeds, showSeeds, limit);

  return await mapWithConcurrency(
    mixed,
    async (it) => {
      const details = await fetchTmdbDetails(
        it.media_type === "tv" ? "tv" : "movie",
        it.tmdb,
      );
      // si no hay poster, se ve feo en tu grid (y además te rompe consistencia)
      if (!details?.id || !details?.poster_path) return null;

      return {
        id: details.id,
        media_type: it.media_type,
        title: details.title || null,
        name: details.name || null,
        poster_path: details.poster_path || null,
        backdrop_path: details.backdrop_path || null,
        release_date: details.release_date || null,
        first_air_date: details.first_air_date || null,
        vote_average: details.vote_average ?? null,
        runtime: details.runtime ?? null,
        number_of_episodes: details.number_of_episodes ?? null,
      };
    },
    8,
  );
}

async function getTraktDiscoverAnticipated(limit = 24) {
  // anticipated devuelve wrappers { list_count, movie/show }
  const [moviesRaw, showsRaw] = await Promise.all([
    fetchTrakt(`/movies/anticipated?extended=full&limit=30`),
    fetchTrakt(`/shows/anticipated?extended=full&limit=30`),
  ]);

  const movieSeeds = moviesRaw
    .map((x) => x?.movie)
    .filter(Boolean)
    .map((m) => ({ media_type: "movie", tmdb: m?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const showSeeds = showsRaw
    .map((x) => x?.show)
    .filter(Boolean)
    .map((s) => ({ media_type: "tv", tmdb: s?.ids?.tmdb }))
    .filter((x) => x.tmdb);

  const mixed = interleave(movieSeeds, showSeeds, limit);

  return await mapWithConcurrency(
    mixed,
    async (it) => {
      const details = await fetchTmdbDetails(
        it.media_type === "tv" ? "tv" : "movie",
        it.tmdb,
      );
      if (!details?.id || !details?.poster_path) return null;

      return {
        id: details.id,
        media_type: it.media_type,
        title: details.title || null,
        name: details.name || null,
        poster_path: details.poster_path || null,
        backdrop_path: details.backdrop_path || null,
        release_date: details.release_date || null,
        first_air_date: details.first_air_date || null,
        vote_average: details.vote_average ?? null,
        runtime: details.runtime ?? null,
        number_of_episodes: details.number_of_episodes ?? null,
      };
    },
    8,
  );
}

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
    // Preparamos todas las llamadas en paralelo para optimizar
    const [
      topRatedMovies,
      topRatedTV,
      awarded,
      dramaTV,
      trending,
      popular,

      // ✅ NUEVAS SECCIONES TRAKT - Contenido Mixto (películas + series)
      traktTrending,
      traktPopular,
      traktRecommended,
      traktAnticipated,
      traktMoviesAnticipated,
      traktShowsAnticipated,
      traktPlayedWeekly,
      traktPlayedMonthly,
      traktWatchedWeekly,
      traktWatchedMonthly,
      traktCollectedWeekly,
      traktCollectedMonthly,
    ] = await Promise.all([
      // TMDb secciones originales
      fetchTopRatedMovies(),
      fetchTopRatedTV(),
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

      // ✅ Trakt - Contenido Mixto (Movies + Shows)
      TRAKT_KEY ? getTraktTrending(30) : Promise.resolve([]),
      TRAKT_KEY ? getTraktPopular(30) : Promise.resolve([]),
      TRAKT_KEY ? getTraktRecommended(30) : Promise.resolve([]),
      TRAKT_KEY ? getTraktAnticipated(30) : Promise.resolve([]),
      TRAKT_KEY ? getTraktMoviesAnticipated(30) : Promise.resolve([]),
      TRAKT_KEY ? getTraktShowsAnticipated(30) : Promise.resolve([]),
      TRAKT_KEY ? getTraktPlayed("weekly", 30) : Promise.resolve([]),
      TRAKT_KEY ? getTraktPlayed("monthly", 30) : Promise.resolve([]),
      TRAKT_KEY ? getTraktWatched("weekly", 30) : Promise.resolve([]),
      TRAKT_KEY ? getTraktWatched("monthly", 30) : Promise.resolve([]),
      TRAKT_KEY ? getTraktCollected("weekly", 30) : Promise.resolve([]),
      TRAKT_KEY ? getTraktCollected("monthly", 30) : Promise.resolve([]),
    ]);

    const recommended = sessionId
      ? await fetchRecommendedMovies(sessionId)
      : [];

    // ✅ Top 20 películas y Top 20 series por separado (con backdrops)
    const topMovies = topRatedMovies
      .map((m) => ({ ...m, media_type: "movie" }))
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .slice(0, 20);

    const topShows = topRatedTV
      .map((s) => ({ ...s, media_type: "tv" }))
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .slice(0, 20);

    const addBackdrops = (list) =>
      Promise.all(
        list.map(async (m) => {
          const mediaType = m.media_type === "tv" ? "tv" : "movie";
          const preferred = await fetchBestBackdropServer(m.id, mediaType);
          return {
            ...m,
            backdrop_path:
              preferred || m.backdrop_path || m.poster_path || null,
          };
        }),
      );

    const [topRatedMoviesWithBackdrop, topRatedTVWithBackdrop] =
      await Promise.all([addBackdrops(topMovies), addBackdrops(topShows)]);

    // ✅ Eliminamos duplicados en las secciones de Trakt para evitar repeticiones
    const cleanedTraktTrending = removeDuplicates(traktTrending);
    const cleanedTraktPopular = removeDuplicates(traktPopular);
    const cleanedTraktRecommended = removeDuplicates(traktRecommended);
    const cleanedTraktAnticipated = removeDuplicates(traktAnticipated);
    const cleanedTraktMoviesAnticipated = removeDuplicates(
      traktMoviesAnticipated,
    );
    const cleanedTraktShowsAnticipated = removeDuplicates(
      traktShowsAnticipated,
    );
    const cleanedTraktPlayedWeekly = removeDuplicates(traktPlayedWeekly);
    const cleanedTraktPlayedMonthly = removeDuplicates(traktPlayedMonthly);
    const cleanedTraktWatchedWeekly = removeDuplicates(traktWatchedWeekly);
    const cleanedTraktWatchedMonthly = removeDuplicates(traktWatchedMonthly);
    const cleanedTraktCollectedWeekly = removeDuplicates(traktCollectedWeekly);
    const cleanedTraktCollectedMonthly = removeDuplicates(
      traktCollectedMonthly,
    );

    return {
      // TMDb originales
      topRatedMovies: topRatedMoviesWithBackdrop,
      topRatedTV: topRatedTVWithBackdrop,
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

      // ✅ NUEVAS SECCIONES TRAKT
      traktTrending: cleanedTraktTrending,
      traktPopular: cleanedTraktPopular,
      traktRecommended: cleanedTraktRecommended,
      traktAnticipated: cleanedTraktAnticipated,
      traktMoviesAnticipated: cleanedTraktMoviesAnticipated,
      traktShowsAnticipated: cleanedTraktShowsAnticipated,
      traktPlayedWeekly: cleanedTraktPlayedWeekly,
      traktPlayedMonthly: cleanedTraktPlayedMonthly,
      traktWatchedWeekly: cleanedTraktWatchedWeekly,
      traktWatchedMonthly: cleanedTraktWatchedMonthly,
      traktCollectedWeekly: cleanedTraktCollectedWeekly,
      traktCollectedMonthly: cleanedTraktCollectedMonthly,
    };
  } catch (err) {
    console.error("Error cargando MainDashboard (SSR):", err);
    return {};
  }
}

/* =================== Página de Inicio =================== */
export default async function HomePage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("tmdb_session_id")?.value || null;

  const dashboardData = await getDashboardData(sessionId);
  return <MainDashboardClient initialData={dashboardData} />;
}
