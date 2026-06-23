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

export const dynamic = "force-static";
export const revalidate = 3600; // 1 hora — reduce cold starts en Vercel
export const maxDuration = 60; // Vercel Pro = 60s; Hobby = 10s (máximo posible)

export const metadata = {
  title: "Inicio",
};

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

/* ======== Selección de contenido DESTACADO para el hero ======== */
const FEATURED_SOURCE_WEIGHTS = {
  trendingMovies: 0.55,
  trendingTV: 0.55,
  popularMovies: 0.28,
  popularTV: 0.28,
  recognizedMovies: 0.44,
  recognizedTV: 0.44,
  awarded: 0.34,
};

const normalize01 = (value, max) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n / max);
};

const logScore = (value, maxLog = 5) =>
  Math.min(1, Math.log10(Number(value || 0) + 1) / maxLog);

function getReleaseDate(item) {
  const raw = item?.release_date || item?.first_air_date || "";
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function yearsSinceRelease(item) {
  const time = getReleaseDate(item);
  if (!time) return 20;
  return Math.max(0, (Date.now() - time) / (365.25 * 24 * 60 * 60 * 1000));
}

function getMediaKey(item, fallbackType = "movie") {
  if (!item?.id) return null;
  const type =
    item.media_type === "tv" ||
      fallbackType === "tv" ||
      (item.name && !item.title) ||
      item.first_air_date
      ? "tv"
      : "movie";
  return `${type}:${item.id}`;
}

function inferMediaType(item, fallbackType = "movie") {
  return getMediaKey(item, fallbackType)?.split(":")[0] || fallbackType;
}

function normalizeFeaturedItem(raw, mediaType) {
  const type = inferMediaType(raw, mediaType);
  return {
    ...raw,
    media_type: type,
  };
}

// Mezcla curada a partir de fuentes SSR: interés actual, reconocimiento amplio
// y premios. No usa las listas top rated para que el hero no sea redundante con
// la sección de mejor valoradas.
function buildFeatured(
  {
    trendingMovies = [],
    trendingTV = [],
    popularMovies = [],
    popularTV = [],
    recognizedMovies = [],
    recognizedTV = [],
    awarded = [],
  } = {},
  { size = 8 } = {},
) {
  const pool = new Map();
  const addAll = (list, mediaType, source) => {
    for (const [index, raw] of (Array.isArray(list) ? list : []).entries()) {
      if (!raw?.id) continue;
      if (!raw.backdrop_path) continue; // exige imagen horizontal de calidad

      const item = normalizeFeaturedItem(raw, mediaType);
      const key = getMediaKey(item, mediaType);
      if (!key) continue;

      const current = pool.get(key);
      const sources = {
        ...(current?.__featuredSources || {}),
        [source]: {
          rank: index + 1,
          weight: FEATURED_SOURCE_WEIGHTS[source] || 0,
        },
      };

      pool.set(key, {
        ...(current || {}),
        ...item,
        media_type: item.media_type,
        __featuredKey: key,
        __featuredSources: sources,
      });
    }
  };

  addAll(trendingMovies, "movie", "trendingMovies");
  addAll(trendingTV, "tv", "trendingTV");
  addAll(popularMovies, "movie", "popularMovies");
  addAll(popularTV, "tv", "popularTV");
  addAll(recognizedMovies, "movie", "recognizedMovies");
  addAll(recognizedTV, "tv", "recognizedTV");
  addAll(awarded, "movie", "awarded");

  const scoreOf = (m) => {
    const voteAverage = Number(m?.vote_average || 0);
    const voteCount = Number(m?.vote_count || 0);
    const popularity = Number(m?.popularity || 0);
    const bayesianRating =
      voteCount > 0 ? (voteCount / (voteCount + 1200)) * voteAverage + (1200 / (voteCount + 1200)) * 7 : 0;
    const quality = normalize01(bayesianRating, 10);
    const confidence = logScore(voteCount, 5);
    const demand = logScore(popularity, 3);
    const freshEnough = Math.max(0, 1 - yearsSinceRelease(m) / 12);
    const sourceScore = Object.values(m.__featuredSources || {}).reduce(
      (sum, source) => {
        const rankBonus = Math.max(0, 1 - (Number(source.rank || 1) - 1) / 20);
        return sum + Number(source.weight || 0) * (0.72 + rankBonus * 0.28);
      },
      0,
    );

    return (
      quality * 1.25 +
      confidence * 0.72 +
      demand * 0.42 +
      freshEnough * 0.18 +
      sourceScore
    );
  };

  const ranked = [...pool.values()]
    .filter((item) => {
      const votes = Number(item?.vote_count || 0);
      const rating = Number(item?.vote_average || 0);
      const hasDemandSource = Object.keys(item.__featuredSources || {}).some((source) =>
        source.startsWith("trending") ||
        source.startsWith("popular") ||
        source.startsWith("recognized"),
      );
      return rating >= 6.6 && (votes >= 700 || hasDemandSource);
    })
    .sort((a, b) => scoreOf(b) - scoreOf(a));

  const result = [];
  const typeCounts = { movie: 0, tv: 0 };
  const genreCounts = new Map();
  const maxPerType = Math.ceil(size * 0.65);

  for (const item of ranked) {
    if (result.length >= size) break;
    if (typeCounts[item.media_type] >= maxPerType) continue;

    const primaryGenre = Array.isArray(item.genre_ids) ? item.genre_ids[0] : null;
    if (primaryGenre && (genreCounts.get(primaryGenre) || 0) >= 3) continue;

    result.push(item);
    typeCounts[item.media_type] += 1;
    if (primaryGenre) genreCounts.set(primaryGenre, (genreCounts.get(primaryGenre) || 0) + 1);
  }

  if (result.length < size) {
    for (const item of ranked) {
      if (result.length >= size) break;
      if (result.some((selected) => selected.__featuredKey === item.__featuredKey)) continue;
      result.push(item);
    }
  }

  return result.slice(0, size).map(({ __featuredKey, __featuredSources, ...item }) => item);
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
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .slice(0, 20);

    const topRatedTVSSR = topRatedTV
      .map((s) => ({ ...s, media_type: "tv" }))
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .slice(0, 20);

    const awardedSSR = curateList(awarded, {
      minVotes: 1200,
      minRating: 6.8,
      minSize: 20,
      maxSize: 60,
    });

    return {
      topRatedMovies: topRatedMoviesSSR,
      topRatedTV: topRatedTVSSR,
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
        maxSize: 70,
      }),
      trending: [...trendingMovies, ...trendingTV],
      popular: [...popularMovies, ...popularTV],

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
  const dashboardData = await getDashboardData();
  return <MainDashboardClient initialData={dashboardData} />;
}
