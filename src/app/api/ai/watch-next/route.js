import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  fetchFavoritesForUser,
  fetchRatedForUser,
  fetchWatchlistForUser,
} from "@/lib/api/tmdb";
import {
  clearTraktCookies,
  getValidTraktToken,
  setTraktCookies,
  traktFetch,
} from "@/lib/trakt/server";
import {
  getTraktAnticipated,
  getTraktPopular,
  getTraktRecommended,
  getTraktTrending,
} from "@/lib/api/traktHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL =
  process.env.OPENAI_WATCH_NEXT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_WATCH_NEXT_REASONING_EFFORT =
  process.env.OPENAI_WATCH_NEXT_REASONING_EFFORT || "low";
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
const GEMINI_MODEL =
  process.env.GEMINI_WATCH_NEXT_MODEL ||
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash";
const WATCH_NEXT_AI_PROVIDER =
  process.env.WATCH_NEXT_AI_PROVIDER ||
  (GEMINI_API_KEY ? "gemini" : "openai");

const WATCH_NEXT_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "watch_next_recommendations",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: {
        type: "string",
        description: "Respuesta breve en español que explique el criterio general.",
      },
      recommendations: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            key: {
              type: "string",
              description: "Clave exacta del candidato elegido, por ejemplo movie:123.",
            },
            reason: {
              type: "string",
              description: "Motivo concreto, en español, para recomendar este título.",
            },
            matchTags: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: { type: "string" },
            },
          },
          required: ["key", "reason", "matchTags"],
        },
      },
    },
    required: ["reply", "recommendations"],
  },
};

const GENRE_HINTS = [
  { id: 28, words: ["acción", "accion", "peleas", "explosiones"] },
  { id: 12, words: ["aventura", "épica", "epica"] },
  { id: 16, words: ["animación", "animacion", "anime"] },
  { id: 35, words: ["comedia", "risa", "divertida", "ligera", "ligero"] },
  { id: 80, words: ["crimen", "mafia", "policíaca", "policiaca"] },
  { id: 18, words: ["drama", "emocional", "intensa", "intenso"] },
  { id: 27, words: ["terror", "miedo", "susto"] },
  { id: 9648, words: ["misterio", "intriga"] },
  { id: 10749, words: ["romance", "amor", "romántica", "romantica"] },
  { id: 878, words: ["ciencia ficción", "ciencia ficcion", "sci-fi", "scifi"] },
  { id: 53, words: ["thriller", "tensión", "tension", "suspense"] },
  { id: 10759, words: ["acción", "accion", "aventura"] },
  { id: 10765, words: ["fantasía", "fantasia", "sci-fi", "sobrenatural"] },
];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function mediaTypeOf(item) {
  if (item?.media_type === "tv" || item?.media_type === "show") return "tv";
  if (item?.media_type === "movie") return "movie";
  if (item?.name && !item?.title) return "tv";
  return "movie";
}

function yearOf(item) {
  const date = item?.release_date || item?.first_air_date || "";
  const year = item?.year || String(date).slice(0, 4);
  return /^\d{4}$/.test(String(year)) ? String(year) : "";
}

function releaseDateOf(item) {
  return item?.release_date || item?.first_air_date || null;
}

function normalizeItem(item, source = "base") {
  if (!item?.id) return null;
  const mediaType = mediaTypeOf(item);
  const title = mediaType === "movie" ? item?.title : item?.name || item?.title;
  if (!title) return null;

  return {
    id: Number(item.id),
    mediaType,
    title,
    year: yearOf(item),
    posterPath: item?.poster_path || null,
    backdropPath: item?.backdrop_path || null,
    overview: item?.overview || "",
    releaseDate: releaseDateOf(item),
    voteAverage:
      typeof item?.vote_average === "number" ? Number(item.vote_average) : null,
    popularity: typeof item?.popularity === "number" ? item.popularity : 0,
    genreIds: safeArray(item?.genre_ids).map(Number).filter(Number.isFinite),
    userRating:
      typeof item?.user_rating === "number" ? Number(item.user_rating) : null,
    sources: [source],
    score: 0,
  };
}

function normalizeTraktHistoryItem(item) {
  if (item?.movie) {
    return {
      id: item.movie?.ids?.tmdb || null,
      mediaType: "movie",
      title: item.movie?.title || "",
      year: item.movie?.year || "",
      watchedAt: item.watched_at || null,
    };
  }

  if (item?.show) {
    return {
      id: item.show?.ids?.tmdb || null,
      mediaType: "tv",
      title: item.show?.title || "",
      year: item.show?.year || "",
      watchedAt: item.watched_at || null,
    };
  }

  return null;
}

function itemKey(item) {
  return `${item?.mediaType || mediaTypeOf(item)}:${Number(item?.id || 0)}`;
}

function addCandidates(map, items, source, baseScore = 0) {
  for (const raw of safeArray(items)) {
    const item = normalizeItem(raw, source);
    if (!item) continue;
    const key = itemKey(item);
    const prev = map.get(key);
    if (prev) {
      prev.sources = Array.from(new Set([...prev.sources, source]));
      prev.score += baseScore;
      prev.voteAverage = prev.voteAverage ?? item.voteAverage;
      prev.popularity = Math.max(prev.popularity || 0, item.popularity || 0);
      prev.genreIds = Array.from(new Set([...prev.genreIds, ...item.genreIds]));
      if (!prev.posterPath && item.posterPath) prev.posterPath = item.posterPath;
      if (!prev.backdropPath && item.backdropPath) prev.backdropPath = item.backdropPath;
      if (!prev.overview && item.overview) prev.overview = item.overview;
    } else {
      item.score = baseScore;
      map.set(key, item);
    }
  }
}

async function tmdbList(path, params = {}) {
  if (!TMDB_API_KEY) return [];
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", "es-ES");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, { next: { revalidate: 60 * 30 } });
  const json = await safeJson(res);
  return res.ok ? safeArray(json?.results) : [];
}

async function getTmdbFallbackCandidates(limit = 30) {
  const [movies, shows] = await Promise.all([
    tmdbList("/movie/popular", { page: 1 }).catch(() => []),
    tmdbList("/tv/popular", { page: 1 }).catch(() => []),
  ]);

  return [...movies, ...shows]
    .filter((item) => item?.media_type !== "person")
    .slice(0, limit);
}

async function getTmdbNoveltyCandidates(limit = 40) {
  const [
    nowPlaying,
    upcoming,
    onTheAir,
    airingToday,
    weeklyTrending,
  ] = await Promise.all([
    tmdbList("/movie/now_playing", { page: 1, region: "ES" }).catch(() => []),
    tmdbList("/movie/upcoming", { page: 1, region: "ES" }).catch(() => []),
    tmdbList("/tv/on_the_air", { page: 1 }).catch(() => []),
    tmdbList("/tv/airing_today", { page: 1 }).catch(() => []),
    tmdbList("/trending/all/week", { page: 1 }).catch(() => []),
  ]);

  return {
    nowPlaying: nowPlaying.slice(0, limit),
    upcoming: upcoming.slice(0, limit),
    onTheAir: onTheAir.slice(0, limit),
    airingToday: airingToday.slice(0, limit),
    weeklyTrending: weeklyTrending
      .filter((item) => item?.media_type !== "person")
      .slice(0, limit),
  };
}

async function getTmdbQualityCandidates(limit = 30) {
  const [movies, shows] = await Promise.all([
    tmdbList("/movie/top_rated", { page: 1, region: "ES" }).catch(() => []),
    tmdbList("/tv/top_rated", { page: 1 }).catch(() => []),
  ]);

  return [...movies, ...shows]
    .filter((item) => item?.media_type !== "person")
    .slice(0, limit);
}

async function getTmdbDiscoveryCandidates(message, limit = 32) {
  const wantedGenres = getWantedGenreIds(message);
  const wantedType = getWantedMediaType(message);
  const yearIntent = extractYearIntent(message);
  const genreParam = wantedGenres.length ? wantedGenres.slice(0, 4).join("|") : null;

  const commonParams = {
    page: 1,
    sort_by: yearIntent ? "vote_count.desc" : "popularity.desc",
    "vote_count.gte": yearIntent ? 30 : 80,
    "vote_average.gte": 5.5,
  };

  // When a specific year is requested, use primary_release_year (exact match)
  // When a decade range is requested, use primary_release_date.gte/lte
  if (yearIntent?.specificYear) {
    commonParams["primary_release_year"] = yearIntent.specificYear;
  } else if (yearIntent?.yearMin) {
    commonParams["primary_release_date.gte"] = `${yearIntent.yearMin}-01-01`;
    commonParams["primary_release_date.lte"] = `${yearIntent.yearMax || yearIntent.yearMin + 9}-12-31`;
  }

  const movieParams = genreParam
    ? { ...commonParams, with_genres: genreParam, region: "ES" }
    : { ...commonParams, region: "ES" };
  const tvParams = genreParam
    ? { ...commonParams, with_genres: genreParam }
    : commonParams;

  // For TV year filtering use first_air_date instead of primary_release_date
  if (yearIntent?.specificYear) {
    tvParams["first_air_date_year"] = yearIntent.specificYear;
    delete tvParams["primary_release_year"];
  } else if (yearIntent?.yearMin) {
    tvParams["first_air_date.gte"] = `${yearIntent.yearMin}-01-01`;
    tvParams["first_air_date.lte"] = `${yearIntent.yearMax || yearIntent.yearMin + 9}-12-31`;
    delete tvParams["primary_release_date.gte"];
    delete tvParams["primary_release_date.lte"];
  }

  const [movies, shows] = await Promise.all([
    wantedType === "tv"
      ? Promise.resolve([])
      : tmdbList("/discover/movie", movieParams).catch(() => []),
    wantedType === "movie"
      ? Promise.resolve([])
      : tmdbList("/discover/tv", tvParams).catch(() => []),
  ]);

  return [...movies, ...shows]
    .filter((item) => item?.media_type !== "person")
    .slice(0, limit);
}

async function getTmdbAccount(sessionId) {
  if (!TMDB_API_KEY || !sessionId) return null;
  const url = `${TMDB_BASE}/account?api_key=${encodeURIComponent(
    TMDB_API_KEY,
  )}&session_id=${encodeURIComponent(sessionId)}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await safeJson(res);
  return res.ok ? json : null;
}

async function getTmdbContext(cookieStore) {
  const sessionId = cookieStore.get("tmdb_session_id")?.value || null;
  if (!sessionId) {
    return {
      connected: false,
      favorites: [],
      watchlist: [],
      rated: [],
    };
  }

  try {
    const account = await getTmdbAccount(sessionId);
    if (!account?.id) throw new Error("TMDb account unavailable");
    const [favorites, watchlist, rated] = await Promise.all([
      fetchFavoritesForUser(account.id, sessionId),
      fetchWatchlistForUser(account.id, sessionId),
      fetchRatedForUser(account.id, sessionId),
    ]);

    return {
      connected: true,
      account: { id: account.id, username: account.username || account.name || null },
      favorites: safeArray(favorites),
      watchlist: safeArray(watchlist),
      rated: safeArray(rated),
    };
  } catch {
    return {
      connected: false,
      favorites: [],
      watchlist: [],
      rated: [],
    };
  }
}

async function getTraktContext(cookieStore) {
  try {
    const { token, refreshedTokens, shouldClear } =
      await getValidTraktToken(cookieStore);
    if (!token) {
      return { connected: false, history: [], ratings: [], refreshedTokens, shouldClear };
    }

    const [historyRes, movieRatingsRes, showRatingsRes] = await Promise.all([
      traktFetch("/sync/history?extended=full&page=1&limit=120", {
        token,
        timeoutMs: 9000,
      }),
      traktFetch("/sync/ratings/movies?extended=full&page=1&limit=100", {
        token,
        timeoutMs: 9000,
      }),
      traktFetch("/sync/ratings/shows?extended=full&page=1&limit=100", {
        token,
        timeoutMs: 9000,
      }),
    ]);

    const history = historyRes.ok
      ? safeArray(historyRes.json).map(normalizeTraktHistoryItem).filter((x) => x?.id)
      : [];
    const ratings = [
      ...(movieRatingsRes.ok ? safeArray(movieRatingsRes.json) : []).map((it) => ({
        rating: it?.rating,
        item: it?.movie,
        mediaType: "movie",
      })),
      ...(showRatingsRes.ok ? safeArray(showRatingsRes.json) : []).map((it) => ({
        rating: it?.rating,
        item: it?.show,
        mediaType: "tv",
      })),
    ];

    return {
      connected: true,
      history,
      ratings,
      refreshedTokens,
      shouldClear,
    };
  } catch {
    return { connected: false, history: [], ratings: [] };
  }
}

function getWantedMediaType(message) {
  const text = String(message || "").toLowerCase();
  if (/\b(pel[ií]cula|peli|film|cine)\b/.test(text)) return "movie";
  if (/\b(serie|series|cap[ií]tulos?|temporada)\b/.test(text)) return "tv";
  return null;
}

function getWantedGenreIds(message) {
  const text = String(message || "").toLowerCase();
  const ids = new Set();
  for (const hint of GENRE_HINTS) {
    if (hint.words.some((word) => text.includes(word))) ids.add(hint.id);
  }
  return Array.from(ids);
}

function wantsFutureReleases(message) {
  return /\b(pr[oó]xim[oa]s?|futur[oa]s?|cuando salga|estrenos? futuros?|esperad[oa]s?)\b/i.test(
    String(message || ""),
  );
}

function wantsRewatch(message) {
  return /\b(rever|revisionar|volver a ver|rewatch|repetir|otra vez)\b/i.test(
    String(message || ""),
  );
}

function normalizeRecentKeys(value) {
  return [
    ...new Set(
      safeArray(value)
        .map((key) => String(key || "").trim())
        .filter((key) => /^(movie|tv):\d+$/.test(key)),
    ),
  ].slice(0, 80);
}

function clampRecommendationLimit(value, fallback = 5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(8, Math.trunc(n)));
}

/**
 * Extract a specific year or decade range from the user message.
 * Returns { yearMin, yearMax, specificYear } or null if nothing found.
 */
function extractYearIntent(message) {
  const text = String(message || "");

  // Specific 4-digit year: "del año 1996", "de 1996", "año 1996", "1996"
  const specificYearMatch = text.match(/\b(19[0-9]{2}|20[0-2][0-9])\b/);
  if (specificYearMatch) {
    const year = parseInt(specificYearMatch[1], 10);
    return { yearMin: year, yearMax: year, specificYear: year };
  }

  // Decade patterns: "años 90", "los 90", "los 80s", "de los 2000s"
  const decadeMatch = text.match(/\b(?:a[ñn]os?\s+|los\s+|de\s+los\s+|de\s+)([12][0-9]){0,1}([0-9]{2})(?:s|'s)?\b/i);
  if (decadeMatch) {
    const raw = decadeMatch[0].replace(/[^0-9]/g, "");
    const decade = parseInt(raw.slice(-2), 10);
    if (decade >= 20 && decade <= 99) {
      // Two-digit decade like "90" → 1990s, "80" → 1980s, "70" → 1970s
      const century = decade >= 20 && decade <= 29 ? 2000 : 1900;
      const yearMin = century + Math.floor(decade / 10) * 10;
      return { yearMin, yearMax: yearMin + 9, specificYear: null };
    }
  }

  // Named decade patterns
  if (/\b(noventa|90s|'?90s?)\b/i.test(text)) return { yearMin: 1990, yearMax: 1999, specificYear: null };
  if (/\b(ochenta|80s|'?80s?)\b/i.test(text)) return { yearMin: 1980, yearMax: 1989, specificYear: null };
  if (/\b(setenta|70s|'?70s?)\b/i.test(text)) return { yearMin: 1970, yearMax: 1979, specificYear: null };
  if (/\b(dos\s*mil|2000s|'?00s?)\b/i.test(text)) return { yearMin: 2000, yearMax: 2009, specificYear: null };
  if (/\b(2010s|'?10s?)\b/i.test(text)) return { yearMin: 2010, yearMax: 2019, specificYear: null };
  if (/\b(2020s|'?20s?)\b/i.test(text)) return { yearMin: 2020, yearMax: 2029, specificYear: null };

  return null;
}

function inferFavoriteGenres({ favorites, rated, traktRatings }) {
  const counts = new Map();
  const add = (item, weight = 1) => {
    for (const id of safeArray(item?.genre_ids)) {
      const n = Number(id);
      if (!Number.isFinite(n)) continue;
      counts.set(n, (counts.get(n) || 0) + weight);
    }
  };

  for (const item of safeArray(favorites)) add(item, 2);
  for (const item of safeArray(rated)) {
    const rating = Number(item?.user_rating || 0);
    if (rating >= 7) add(item, rating >= 9 ? 3 : 1.5);
  }
  for (const rating of safeArray(traktRatings)) {
    if (Number(rating?.rating || 0) >= 8) add(rating.item, 1.5);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);
}

function scoreCandidates({
  candidates,
  message,
  profileGenres,
  watchedSet,
  recentKeySet,
  quickPick = false,
}) {
  const wantedType = getWantedMediaType(message);
  const wantedGenres = getWantedGenreIds(message);
  const yearIntent = extractYearIntent(message);
  const text = String(message || "").toLowerCase();
  const wantsShort = /corta|corto|rápida|rapida|poco tiempo|algo breve/.test(text);
  const wantsQuality = /buena|mejor|obra maestra|top|calidad|notaza/.test(text);
  const allowWatched = wantsRewatch(message);

  // Has ANY specific user intent (genre, type, year) — if so, we should suppress
  // novelty bonuses so discovery candidates (filtered by intent) can compete.
  const hasSpecificIntent = !!(yearIntent || wantedGenres.length > 0 || wantedType);

  return candidates
    .map((item) => {
      let score = item.score || 0;
      const key = itemKey(item);
      const genreIds = new Set(item.genreIds || []);

      const daysFromRelease = item.releaseDate
        ? Math.round(
            (new Date(`${item.releaseDate}T00:00:00Z`).getTime() - Date.now()) /
              86400000,
          )
        : null;
      const isRecentRelease =
        Number.isFinite(daysFromRelease) &&
        daysFromRelease <= 45 &&
        daysFromRelease >= -180;
      const isNearRelease =
        Number.isFinite(daysFromRelease) &&
        daysFromRelease > 45 &&
        daysFromRelease <= 120;

      if (!hasSpecificIntent) {
        // No specific request — full novelty/trending bonuses ("recomiéndame algo")
        if (item.sources.includes("watchlist")) score += quickPick ? 10 : 20;
        if (item.sources.includes("trakt_recommended")) score += 28;
        if (item.sources.includes("trakt_trending")) score += 18;
        if (item.sources.includes("trakt_anticipated")) score += 18;
        if (item.sources.includes("trakt_popular")) score += 8;
        if (item.sources.includes("tmdb_now_playing")) score += 24;
        if (item.sources.includes("tmdb_upcoming")) score += 18;
        if (item.sources.includes("tmdb_on_the_air")) score += 22;
        if (item.sources.includes("tmdb_airing_today")) score += 18;
        if (item.sources.includes("tmdb_weekly_trending")) score += 20;
        if (item.sources.includes("tmdb_fallback")) score += 5;
        if (isRecentRelease) score += item.mediaType === "movie" ? 18 : 12;
        if (isNearRelease) score += 8;
      } else {
        // Specific request — suppress novelty bonuses so intent-matching content wins.
        // Only keep watchlist/personal signals.
        if (item.sources.includes("watchlist")) score += 20;
        if (item.sources.includes("trakt_recommended")) score += 10;
        // Small recency bonus so recent content in the right category still shows
        if (isRecentRelease && !yearIntent) score += item.mediaType === "movie" ? 6 : 4;
      }

      if (item.voteAverage) score += item.voteAverage * (wantsQuality ? 3 : 1.7);
      if (item.popularity) score += Math.min(16, Math.log10(item.popularity + 1) * 7);

      if (wantedType && item.mediaType === wantedType) score += 30;
      if (wantedType && item.mediaType !== wantedType) score -= 40;

      // Genre matching — strong signal when user has asked for specific genres
      for (const id of wantedGenres) {
        if (genreIds.has(id)) score += hasSpecificIntent ? 35 : 18;
      }

      // Year/decade matching — strongly boost items from requested period
      if (yearIntent) {
        const itemYear = parseInt(item.year, 10);
        if (!isNaN(itemYear)) {
          if (yearIntent.specificYear) {
            if (itemYear === yearIntent.specificYear) score += 60;
            else score -= Math.min(80, Math.abs(itemYear - yearIntent.specificYear) * 8);
          } else {
            if (itemYear >= yearIntent.yearMin && itemYear <= yearIntent.yearMax) score += 40;
            else score -= 30;
          }
        }
      }

      for (const id of profileGenres) {
        if (genreIds.has(id)) score += 5;
      }
      if (wantsShort && item.mediaType === "movie") score += 10;
      if (recentKeySet?.has(key)) score -= quickPick ? 110 : 85;
      if (watchedSet.has(key) && !allowWatched) {
        score -= item.sources.includes("watchlist") ? 75 : 150;
      }
      if (watchedSet.has(key) && allowWatched) score += 15;

      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);
}

function primarySource(item) {
  const sources = safeArray(item?.sources);
  return (
    sources.find((source) => source === "watchlist") ||
    sources.find((source) => source.startsWith("tmdb_")) ||
    sources.find((source) => source.startsWith("trakt_")) ||
    sources[0] ||
    "unknown"
  );
}

function genreSimilarity(a, b) {
  const aGenres = new Set(safeArray(a?.genreIds));
  const bGenres = new Set(safeArray(b?.genreIds));
  if (!aGenres.size || !bGenres.size) return 0;
  let intersection = 0;
  for (const id of aGenres) {
    if (bGenres.has(id)) intersection += 1;
  }
  return intersection / new Set([...aGenres, ...bGenres]).size;
}

function normalizedTitle(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleLooksTooSimilar(a, b) {
  const left = normalizedTitle(a?.title);
  const right = normalizedTitle(b?.title);
  if (!left || !right) return false;
  return (
    left === right ||
    left.startsWith(`${right} `) ||
    right.startsWith(`${left} `)
  );
}

function diversifyRecommendations({
  candidates,
  limit,
  message,
  recentKeySet,
  quickPick = false,
}) {
  const wantedType = getWantedMediaType(message);
  const allowWatched = wantsRewatch(message);
  const selected = [];
  const pool = safeArray(candidates)
    .filter((item) => item?.id && item?.mediaType)
    .filter((item) => {
      if (wantedType && item.mediaType !== wantedType) return false;
      if (!allowWatched && item.score < -80) return false;
      return true;
    });

  const sourceCounts = new Map();
  const typeCounts = new Map();

  while (selected.length < limit && pool.length) {
    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const item = pool[i];
      const key = itemKey(item);
      const source = primarySource(item);
      let penalty = 0;

      if (recentKeySet?.has(key)) penalty += quickPick ? 95 : 70;
      if (!wantedType) penalty += (typeCounts.get(item.mediaType) || 0) * 10;
      penalty += (sourceCounts.get(source) || 0) * 8;

      for (const picked of selected) {
        penalty += genreSimilarity(item, picked) * 20;
        if (titleLooksTooSimilar(item, picked)) penalty += 55;
        if (item.year && picked.year && item.year === picked.year) penalty += 3;
      }

      const relevance = Number(item.score || 0);
      const finalScore = relevance * 0.72 - penalty * 0.28;
      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestIndex = i;
      }
    }

    if (bestIndex < 0) break;
    const [picked] = pool.splice(bestIndex, 1);
    selected.push(picked);
    const source = primarySource(picked);
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    typeCounts.set(picked.mediaType, (typeCounts.get(picked.mediaType) || 0) + 1);
  }

  if (selected.length >= limit) return selected;

  for (const item of safeArray(candidates)) {
    if (selected.length >= limit) break;
    const key = itemKey(item);
    if (selected.some((picked) => itemKey(picked) === key)) continue;
    if (wantedType && item.mediaType !== wantedType) continue;
    selected.push(item);
  }

  return selected.slice(0, limit);
}

function buildReason(item, message, source = "ranking") {
  const bits = [];
  if (item.sources.includes("tmdb_now_playing")) {
    bits.push("es una novedad reciente de cine");
  }
  if (item.sources.includes("tmdb_on_the_air") || item.sources.includes("tmdb_airing_today")) {
    bits.push("está entre las series activas ahora mismo");
  }
  if (item.sources.includes("tmdb_weekly_trending") || item.sources.includes("trakt_trending")) {
    bits.push("está funcionando muy bien en tendencia");
  }
  if (item.sources.includes("tmdb_upcoming") || item.sources.includes("trakt_anticipated")) {
    bits.push("aparece entre los próximos estrenos más relevantes");
  }
  if (item.sources.includes("trakt_recommended")) {
    bits.push("también aparece entre recomendaciones de Trakt");
  }
  if (item.sources.includes("watchlist")) {
    bits.push("además ya la tienes pendiente");
  }
  if (item.voteAverage && item.voteAverage >= 7.5) {
    bits.push(`tiene una valoración sólida (${item.voteAverage.toFixed(1)})`);
  }
  if (getWantedMediaType(message) === item.mediaType) {
    bits.push(`encaja con que te apetece ${item.mediaType === "movie" ? "una película" : "una serie"}`);
  }
  if (!bits.length) bits.push("equilibra afinidad con tu perfil y popularidad actual");

  return `${bits.slice(0, 2).join(" y ")}.`;
}

function serializeRecommendation(item, message, source = "ranking") {
  const sourceTags = item.sources.map((s) => {
    if (s === "watchlist") return "Pendiente";
    if (s === "trakt_recommended") return "Trakt";
    if (s === "trakt_trending") return "Tendencia";
    if (s === "trakt_anticipated") return "Esperada";
    if (s === "trakt_popular") return "Popular";
    if (s === "tmdb_now_playing") return "Novedad";
    if (s === "tmdb_upcoming") return "Estreno";
    if (s === "tmdb_on_the_air") return "En emisión";
    if (s === "tmdb_airing_today") return "Hoy";
    if (s === "tmdb_weekly_trending") return "Tendencia";
    if (s === "tmdb_fallback") return "TMDb";
    if (s === "tmdb_discovery") return "TMDb";
    return s;
  });

  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    voteAverage: item.voteAverage,
    href: `/details/${item.mediaType}/${item.id}`,
    reason: item.reason || buildReason(item, message, source),
    matchTags: item.matchTags || Array.from(new Set(sourceTags)).slice(0, 3),
  };
}

function buildFallbackReply({ message, ranked, contextSummary }) {
  const hasPersonal =
    contextSummary.watchlistCount ||
    contextSummary.favoritesCount ||
    contextSummary.historyCount ||
    contextSummary.ratedCount;
  const intro = hasPersonal
    ? "He cruzado lo que te apetece con novedades, tendencias y tu perfil, sin limitarme a tus pendientes."
    : "No tengo mucho contexto personal todavía, así que he priorizado novedades, tendencias y opciones fuertes.";
  const mood = String(message || "").trim()
    ? ` Para "${String(message).trim()}", empezaría por estas opciones.`
    : " Estas son buenas candidatas para decidir rápido.";
  return `${intro}${mood}`;
}

function buildSelectionReply({ message, selected, contextSummary, quickPick }) {
  const count = safeArray(selected).length;
  if (quickPick) {
    return `He elegido ${count || 3} opciones variadas para decidir rápido, penalizando lo que ya te recomendé hace poco.`;
  }

  if (String(message || "").trim()) {
    const hasSpecificIntent =
      extractYearIntent(message) ||
      getWantedGenreIds(message).length > 0 ||
      getWantedMediaType(message);
    if (hasSpecificIntent) {
      const personal = contextSummary.traktConnected || contextSummary.tmdbConnected
        ? " y tus señales personales"
        : "";
      return `He priorizado títulos que encajan con "${String(message).trim()}"${personal}, evitando repetirte lo recomendado hace poco.`;
    }
    return buildFallbackReply({ message, ranked: selected, contextSummary });
  }

  return "He elegido opciones variadas combinando tendencias, novedades y señales de tu perfil.";
}

function extractOutputText(json) {
  if (typeof json?.output_text === "string") return json.output_text;
  const chunks = [];
  for (const out of safeArray(json?.output)) {
    for (const content of safeArray(out?.content)) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonLoose(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function isNoveltyCandidate(item) {
  return safeArray(item?.sources).some((source) =>
    [
      "tmdb_now_playing",
      "tmdb_upcoming",
      "tmdb_on_the_air",
      "tmdb_airing_today",
      "tmdb_weekly_trending",
      "trakt_trending",
      "trakt_anticipated",
    ].includes(source),
  );
}

function selectCandidatesForAi(candidates) {
  const selected = new Map();
  const add = (items, limit) => {
    for (const item of safeArray(items)) {
      if (selected.size >= limit) break;
      selected.set(itemKey(item), item);
    }
  };

  add(candidates.slice(0, 18), 36);
  add(candidates.filter(isNoveltyCandidate).slice(0, 18), 36);
  add(candidates.filter((item) => item.sources.includes("watchlist")).slice(0, 6), 36);
  add(candidates, 36);

  return [...selected.values()];
}

function compactCandidatesForAi(candidates) {
  return selectCandidatesForAi(candidates).map((item) => ({
    key: itemKey(item),
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    voteAverage: item.voteAverage,
    releaseDate: item.releaseDate,
    sources: item.sources,
    overview: item.overview ? item.overview.slice(0, 280) : "",
    score: Math.round(item.score),
  }));
}

function buildAiSystemPrompt() {
  return [
    "Eres un recomendador experto de cine y series para The Show Verse. Tu misión es seleccionar exactamente entre 4 y 6 títulos de la lista de candidatos.",
    "REGLAS ESTRICTAS:",
    "1. Elige ÚNICAMENTE títulos que aparezcan en la lista 'candidates' con su campo 'key' exacto.",
    "2. NO inventes títulos ni uses IDs de tu memoria. Solo los candidatos provistos.",
    "3. Prioriza novedades recientes, estrenos, series en emisión y tendencias cuando el usuario lo pide.",
    "4. Usa el historial, favoritos, valoraciones y watchlist ÚNICAMENTE como señales de afinidad personal.",
    "5. Selecciona variedad: mezcla películas y series salvo que el usuario pida explícitamente un tipo.",
    "6. El campo 'reason' debe ser específico, máximo 2 frases, explicando POR QUÉ ese título encaja con lo que pide el usuario.",
    "7. 'matchTags' deben ser 2-3 etiquetas cortas en español (ej: 'Tendencia', 'Sci-Fi', 'Valoración alta', 'En emisión', 'Tu perfil').",
    "8. El campo 'reply' es una frase de 1-2 oraciones en español explicando el criterio general de selección.",
    "FORMATO DE RESPUESTA (JSON estricto):",
    '{"reply":"string","recommendations":[{"key":"movie:123","reason":"string","matchTags":["string"]}]}',
    "Todo debe estar en español.",
  ].join(" ");
}

function buildAiUserPayload({ message, candidates, contextSummary }) {
  const compactCandidates = compactCandidatesForAi(candidates);
  const userContext = [
    contextSummary.traktConnected || contextSummary.tmdbConnected
      ? `El usuario tiene ${contextSummary.historyCount} títulos en historial, ${contextSummary.favoritesCount} favoritos, ${contextSummary.watchlistCount} pendientes y ${contextSummary.ratedCount} valorados.`
      : "No hay datos personales del usuario disponibles.",
    message
      ? `PETICIÓN DEL USUARIO: "${message}". Prioriza candidatos que cumplan esta petición.`
      : "El usuario no especificó preferencias concretas.",
    `Hay ${compactCandidates.length} candidatos disponibles. Selecciona entre 4 y 6.`,
  ].join(" ");

  return JSON.stringify({
    userRequest: message,
    context: userContext,
    contextSummary,
    candidates: compactCandidates,
  });
}

function normalizeAiSelection({ parsed, candidates, message }) {
  if (!parsed?.recommendations?.length) return null;

  const byKey = new Map(candidates.map((item) => [itemKey(item), item]));
  const byId = new Map(
    candidates.map((item) => [`${item.mediaType}:${Number(item.id)}`, item]),
  );
  const byBareId = new Map(
    candidates.map((item) => [String(Number(item.id)), item]),
  );
  const byBareTitle = new Map(
    candidates.map((item) => [String(item.title || "").trim().toLowerCase(), item]),
  );
  const byTitle = new Map(
    candidates.map((item) => [
      `${item.mediaType}:${String(item.title || "").trim().toLowerCase()}`,
      item,
    ]),
  );
  const selected = parsed.recommendations
    .map((rec) => {
      const explicitKey = String(rec?.key || "").trim();
      const derivedKey =
        rec?.mediaType && rec?.id
          ? `${rec.mediaType === "show" ? "tv" : rec.mediaType}:${Number(rec.id)}`
          : "";
      const titleKey =
        rec?.mediaType && rec?.title
          ? `${rec.mediaType === "show" ? "tv" : rec.mediaType}:${String(rec.title).trim().toLowerCase()}`
          : "";
      const item =
        byKey.get(explicitKey) ||
        byKey.get(derivedKey) ||
        byId.get(derivedKey) ||
        byBareId.get(explicitKey) ||
        byTitle.get(titleKey) ||
        byBareTitle.get(String(rec?.title || "").trim().toLowerCase());
      if (!item) return null;
      return {
        ...item,
        reason: String(rec.reason || "").trim() || buildReason(item, message, "ai"),
        matchTags: safeArray(rec.matchTags).slice(0, 4),
      };
    })
    .filter(Boolean)
    .slice(0, 8);

  if (!selected.length) return null;

  return {
    reply:
      typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : null,
    recommendations: selected,
  };
}

function openAiRequestBody(input) {
  const body = {
    model: OPENAI_MODEL,
    max_output_tokens: 1800,
    store: false,
    text: {
      format: WATCH_NEXT_RESPONSE_FORMAT,
      verbosity: "low",
    },
    input,
  };

  if (/^gpt-5/i.test(OPENAI_MODEL)) {
    body.reasoning = { effort: OPENAI_WATCH_NEXT_REASONING_EFFORT };
  } else {
    body.temperature = 0.35;
  }

  return body;
}

async function getOpenAiRecommendation({ message, candidates, contextSummary }) {
  if (!OPENAI_API_KEY) return null;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(
      openAiRequestBody([
        {
          role: "system",
          content: buildAiSystemPrompt(),
        },
        {
          role: "user",
          content: buildAiUserPayload({ message, candidates, contextSummary }),
        },
      ]),
    ),
    cache: "no-store",
  });

  const json = await safeJson(res);
  if (!res.ok) {
    console.warn("[watch-next] OpenAI fallback:", {
      status: res.status,
      code: json?.error?.code || json?.error?.type || "unknown",
    });
    return null;
  }
  const parsed = parseJsonLoose(extractOutputText(json));
  const normalized = normalizeAiSelection({ parsed, candidates, message });
  if (!normalized) return null;

  return {
    reply:
      normalized.reply ||
      buildFallbackReply({
        message,
        ranked: normalized.recommendations,
        contextSummary,
      }),
    recommendations: normalized.recommendations,
    provider: "openai",
  };
}

function extractGeminiText(json) {
  // Handle direct JSON object response (when responseMimeType is application/json)
  const candidate = json?.candidates?.[0];
  if (!candidate) return "";

  const parts = safeArray(candidate?.content?.parts);
  const text = parts
    .map((part) => {
      // Parts can have 'text' directly (for JSON mime type responses, the text IS the JSON)
      if (typeof part?.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();

  return text;
}

async function getGeminiRecommendation({ message, candidates, contextSummary }) {
  if (!GEMINI_API_KEY) return null;

  const model = encodeURIComponent(GEMINI_MODEL);

  // Build generation config — thinkingBudget only for models that support it
  const isThinkingModel = /thinking|exp/i.test(GEMINI_MODEL);
  const generationConfig = {
    temperature: 0.4,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    ...(isThinkingModel ? { thinkingConfig: { thinkingBudget: 512 } } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildAiSystemPrompt() }],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildAiUserPayload({
                    message,
                    candidates,
                    contextSummary,
                  }),
                },
              ],
            },
          ],
          generationConfig,
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const json = await safeJson(res);
  if (!res.ok) {
    console.warn("[watch-next] Gemini error:", {
      status: res.status,
      code: json?.error?.status || json?.error?.code || "unknown",
      message: json?.error?.message?.slice(0, 120) || "unknown",
    });
    return null;
  }

  const rawText = extractGeminiText(json);
  if (!rawText) {
    // Log finish reason for debugging
    const finishReason = json?.candidates?.[0]?.finishReason;
    console.warn("[watch-next] Gemini empty response:", { finishReason });
    return null;
  }

  const parsed = parseJsonLoose(rawText);
  if (!parsed?.recommendations?.length) {
    console.warn("[watch-next] Gemini invalid JSON:", {
      rawText: rawText.slice(0, 200),
    });
    return null;
  }
  const normalized = normalizeAiSelection({ parsed, candidates, message });
  if (!normalized) {
    console.warn("[watch-next] Gemini no candidate match:", {
      keys: parsed.recommendations.map((r) => r?.key).join(", "),
    });
    return null;
  }

  return {
    reply:
      normalized.reply ||
      buildFallbackReply({
        message,
        ranked: normalized.recommendations,
        contextSummary,
      }),
    recommendations: normalized.recommendations,
    provider: "gemini",
  };
}

async function getAiRecommendation({ message, candidates, contextSummary }) {
  const providers = String(WATCH_NEXT_AI_PROVIDER)
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider) => provider === "openai" || provider === "gemini");

  const orderedProviders = providers.length
    ? providers
    : [GEMINI_API_KEY ? "gemini" : "openai"];
  for (const provider of orderedProviders) {
    let result = null;
    try {
      result =
        provider === "openai"
          ? await getOpenAiRecommendation({
              message,
              candidates,
                contextSummary,
              })
            : provider === "gemini"
              ? await getGeminiRecommendation({
                  message,
                  candidates,
                  contextSummary,
                })
              : null;
    } catch (error) {
      console.warn("[watch-next] AI provider exception:", {
        provider,
        code: error?.name || "error",
        message: String(error?.message || "unknown").slice(0, 140),
      });
    }

    if (result?.recommendations?.length) return result;
  }

  return null;
}

export async function POST(request) {
  const cookieStore = await cookies();
  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === "quick_pick" ? "quick_pick" : "chat";
  const quickPick = mode === "quick_pick";
  const message = String(
    body?.message || (quickPick ? "Recomiéndame 3 cosas para ver ahora" : ""),
  )
    .trim()
    .slice(0, 800);
  const limit = clampRecommendationLimit(body?.limit, quickPick ? 3 : 5);
  const recentKeys = normalizeRecentKeys(body?.recentKeys);
  const recentKeySet = new Set(recentKeys);

  // Check whether the user is requesting specific year/decade content upfront
  // so we know whether to skip novelty sources and focus on discovery
  const yearIntentForPool = extractYearIntent(message);

  const [
    tmdbContext,
    traktContext,
    baseRecommended,
    trending,
    anticipated,
    popular,
    tmdbNovelty,
    tmdbFallback,
    tmdbDiscovery,
  ] =
    await Promise.all([
      getTmdbContext(cookieStore),
      getTraktContext(cookieStore),
      getTraktRecommended(30).catch(() => []),
      getTraktTrending(24).catch(() => []),
      getTraktAnticipated(24).catch(() => []),
      getTraktPopular(24).catch(() => []),
      // Skip novelty sources when user explicitly requests a specific year/decade
      yearIntentForPool
        ? Promise.resolve({ nowPlaying: [], upcoming: [], onTheAir: [], airingToday: [], weeklyTrending: [] })
        : getTmdbNoveltyCandidates(36).catch(() => ({
            nowPlaying: [],
            upcoming: [],
            onTheAir: [],
            airingToday: [],
            weeklyTrending: [],
          })),
      getTmdbFallbackCandidates(30).catch(() => []),
      // Always fetch discovery candidates filtered by message intent (year, decade, genre)
      getTmdbDiscoveryCandidates(message, 40).catch(() => []),
    ]);

  const watchedSet = new Set(
    safeArray(traktContext.history).map((item) => itemKey(item)),
  );
  const profileGenres = inferFavoriteGenres({
    favorites: tmdbContext.favorites,
    rated: tmdbContext.rated,
    traktRatings: traktContext.ratings,
  });

  const candidateMap = new Map();
  addCandidates(candidateMap, safeArray(tmdbNovelty.nowPlaying), "tmdb_now_playing", 24);
  addCandidates(candidateMap, safeArray(tmdbNovelty.upcoming), "tmdb_upcoming", 18);
  addCandidates(candidateMap, safeArray(tmdbNovelty.onTheAir), "tmdb_on_the_air", 22);
  addCandidates(candidateMap, safeArray(tmdbNovelty.airingToday), "tmdb_airing_today", 18);
  addCandidates(
    candidateMap,
    safeArray(tmdbNovelty.weeklyTrending),
    "tmdb_weekly_trending",
    20,
  );
  addCandidates(candidateMap, tmdbContext.watchlist, "watchlist", 18);
  addCandidates(candidateMap, baseRecommended, "trakt_recommended", 22);
  addCandidates(candidateMap, trending, "trakt_trending", 18);
  addCandidates(candidateMap, anticipated, "trakt_anticipated", 18);
  addCandidates(candidateMap, popular, "trakt_popular", 10);
  addCandidates(candidateMap, tmdbFallback, "tmdb_fallback", 6);
  // Discovery candidates get a strong base score whenever there is specific user intent
  // (year, decade, genre, or type) so they can compete with generic trending content.
  const hasAnyIntent = !!(
    yearIntentForPool ||
    getWantedGenreIds(message).length > 0 ||
    getWantedMediaType(message)
  );
  addCandidates(candidateMap, tmdbDiscovery, "tmdb_discovery", hasAnyIntent ? 35 : 8);

  const ranked = scoreCandidates({
    candidates: [...candidateMap.values()],
    message,
    profileGenres,
    watchedSet,
    recentKeySet,
    quickPick,
  });

  const contextSummary = {
    tmdbConnected: tmdbContext.connected,
    traktConnected: traktContext.connected,
    historyCount: traktContext.history.length,
    favoritesCount: tmdbContext.favorites.length,
    watchlistCount: tmdbContext.watchlist.length,
    ratedCount: tmdbContext.rated.length + traktContext.ratings.length,
    aiEnabled: !!(GEMINI_API_KEY || OPENAI_API_KEY),
    aiProviders: {
      gemini: !!GEMINI_API_KEY,
      openai: !!OPENAI_API_KEY,
    },
    quickPick,
    recentKeysCount: recentKeys.length,
  };

  const ai = await getAiRecommendation({
    message,
    candidates: ranked,
    contextSummary,
  }).catch(() => null);

  const aiRanked = ai?.recommendations?.length
    ? [
        ...ai.recommendations,
        ...ranked.filter(
          (item) =>
            !ai.recommendations.some(
              (recommended) => itemKey(recommended) === itemKey(item),
            ),
        ),
      ]
    : ranked;
  const selected = diversifyRecommendations({
    candidates: aiRanked,
    limit,
    message,
    recentKeySet,
    quickPick,
  });
  const payload = {
    reply: buildSelectionReply({
      message,
      selected,
      contextSummary,
      quickPick,
    }),
    recommendations: selected.map((item) =>
      serializeRecommendation(item, message, ai ? "ai" : "ranking"),
    ),
    contextSummary,
    mode: ai ? "ai" : "ranking",
    requestMode: mode,
    provider: ai?.provider || "ranking",
    engine: ai?.provider || "rules",
    diversityApplied: true,
  };

  const res = NextResponse.json(payload);
  if (traktContext.refreshedTokens) {
    setTraktCookies(res, traktContext.refreshedTokens);
  }
  if (traktContext.shouldClear) {
    clearTraktCookies(res);
  }
  return res;
}
