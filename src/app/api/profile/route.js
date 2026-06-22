import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";
import { fetchTmdbMetadata } from "../_utils/tmdbMetadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tope de tiempo para el enriquecimiento de pósters con TMDb (solo respuesta full).
const POSTER_ENRICH_BUDGET_MS = 2500;

const emptyStats = {
  movies: { watched: 0, plays: 0, minutes: 0, comments: 0, collected: 0 },
  shows: { watched: 0, collected: 0, comments: 0 },
  episodes: { watched: 0, plays: 0, minutes: 0, comments: 0, collected: 0 },
  seasons: { comments: 0 },
  ratings: { total: 0, distribution: {} },
  network: { followers: 0, friends: 0 },
};
const DEFAULT_MOVIE_RUNTIME_MINS = 100;
const DEFAULT_EPISODE_RUNTIME_MINS = 45;

function emptyProfileResponse(status = 401) {
  return NextResponse.json(
    {
      authenticated: false,
      source: "showverse",
      error: "Authentication required",
    },
    { status },
  );
}

function profileType(mediaType) {
  return mediaType === "movie" ? "movie" : "show";
}

function detailsHref(row) {
  const tmdbId = row?.tmdbId;
  if (!tmdbId) return null;
  if ((row.mediaType === "tv" || row.mediaType === "episode") && row.season && row.episode) {
    return `/details/tv/${tmdbId}/season/${row.season}/episode/${row.episode}`;
  }
  return `/details/${row.mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`;
}

function normalizeHistoryRow(row) {
  const posterPath = row.posterPath || row.profilePosterPath || null;
  const item = {
    id: row.id || `${row.mediaType}:${row.tmdbId}:${row.watchedAt || ""}`,
    type: profileType(row.mediaType),
    tmdbId: row.tmdbId,
    title: row.title || "Sin titulo",
    name: row.title || "Sin titulo",
    poster_path: posterPath,
    watched_at: row.watchedAt || null,
    detailsHref: detailsHref(row),
  };

  if (row.mediaType === "tv") {
    item.season = row.season || null;
    item.number = row.episode || null;
    if (row.season && row.episode) {
      item.episode = {
        season: row.season,
        number: row.episode,
        title: row.title || null,
      };
    }
  }

  return item;
}

function normalizeRatingRow(row) {
  const item = {
    id: row.id,
    type: profileType(row.mediaType),
    tmdbId: row.tmdbId,
    title: row.title || "Sin titulo",
    name: row.title || "Sin titulo",
    poster_path: row.posterPath || row.profilePosterPath || null,
    rating: row.rating,
    rated_at: row.ratedAt || row.updatedAt || null,
    detailsHref: detailsHref(row),
  };

  if (row.mediaType === "episode") {
    item.season = row.season || null;
    item.number = row.episode || null;
    item.episode = {
      season: row.season || null,
      number: row.episode || null,
      title: row.title || null,
    };
  }

  return item;
}

function normalizeWatchlistRow(row) {
  return {
    id: row.id,
    type: profileType(row.mediaType),
    tmdbId: row.tmdbId,
    title: row.title || "Sin titulo",
    name: row.title || "Sin titulo",
    poster_path: row.posterPath || row.profilePosterPath || null,
    listed_at: row.addedAt || null,
    detailsHref: detailsHref(row),
  };
}

function ratingDistribution(rows) {
  const distribution = {};
  for (const row of rows) {
    const key = ratingBucket(row.rating);
    if (!key) continue;
    distribution[key] = (distribution[key] || 0) + 1;
  }
  return distribution;
}

function ratingBucket(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return String(Math.round(rating * 2) / 2).replace(/\.0$/, "");
}

function genreName(genre) {
  if (!genre) return null;
  if (typeof genre === "string") return genre;
  return genre.name || null;
}

function buildGenreDistribution(rows) {
  const distribution = {};
  for (const row of rows) {
    const genres = Array.isArray(row.genres) ? row.genres : [];
    for (const genre of genres) {
      const name = genreName(genre);
      if (!name) continue;
      distribution[name] = (distribution[name] || 0) + 1;
    }
  }
  return distribution;
}

function buildTopRows(rows, mediaType) {
  const map = new Map();
  for (const row of rows) {
    if (row.mediaType !== mediaType || !row.tmdbId) continue;
    const key = String(row.tmdbId);
    const current = map.get(key) || {
      tmdbId: row.tmdbId,
      title: row.title || "Sin titulo",
      posterPath: row.posterPath || row.profilePosterPath || null,
      plays: 0,
      lastWatchedAt: null,
    };
    current.plays += 1;
    if (!current.posterPath && (row.posterPath || row.profilePosterPath)) {
      current.posterPath = row.posterPath || row.profilePosterPath;
    }
    if (!current.title && row.title) current.title = row.title;
    if (!current.lastWatchedAt || new Date(row.watchedAt) > new Date(current.lastWatchedAt)) {
      current.lastWatchedAt = row.watchedAt || null;
    }
    map.set(key, current);
  }

  return [...map.values()]
    .sort((a, b) => {
      if (b.plays !== a.plays) return b.plays - a.plays;
      return new Date(b.lastWatchedAt || 0) - new Date(a.lastWatchedAt || 0);
    })
    .slice(0, 20);
}

function runtimeForProfileRow(row) {
  const stored = Number(row.runtimeMins || 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  if (row.mediaType === "movie") return DEFAULT_MOVIE_RUNTIME_MINS;
  if (row.mediaType === "tv" && row.season && row.episode) return DEFAULT_EPISODE_RUNTIME_MINS;
  return 0;
}

function attachKnownPosters(rows, posterByKey) {
  return rows.map((row) => {
    const key = `${row.mediaType}:${row.tmdbId}`;
    return {
      ...row,
      profilePosterPath: row.posterPath || posterByKey.get(key) || null,
    };
  });
}

function profileTmdbType(mediaType) {
  if (mediaType === "movie") return "movie";
  if (mediaType === "tv" || mediaType === "show" || mediaType === "episode") return "tv";
  return null;
}

function posterKey(mediaType, tmdbId) {
  const type = profileTmdbType(mediaType);
  if (!type || !tmdbId) return null;
  return `${type}:${tmdbId}`;
}

function firstPosterPath(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function plainProfileEntry(item) {
  if (!item || typeof item !== "object") return null;
  const type = profileTmdbType(item.type || item.mediaType);
  const tmdbId = item.tmdbId || item.ids?.tmdb;
  if (!type || !tmdbId) return null;
  return {
    item,
    type,
    tmdbId,
    key: posterKey(type, tmdbId),
    posterPath: firstPosterPath(
      item.poster_path,
      item.posterPath,
      item.profilePosterPath,
    ),
  };
}

function nestedProfileEntry(item, nestedKey, type) {
  const media = item?.[nestedKey];
  if (!media || typeof media !== "object") return null;
  const tmdbId = media.ids?.tmdb || media.tmdbId || media.id;
  if (!tmdbId) return null;
  return {
    item,
    nestedKey,
    type,
    tmdbId,
    key: posterKey(type, tmdbId),
    posterPath: firstPosterPath(
      media.poster_path,
      media.posterPath,
      item.poster_path,
      item.posterPath,
    ),
  };
}

function collectProfilePosterEntries(payload) {
  const entries = [];
  for (const name of ["recentHistory", "recentRatings", "watchlist"]) {
    for (const item of Array.isArray(payload?.[name]) ? payload[name] : []) {
      const entry = plainProfileEntry(item);
      if (entry?.key) entries.push(entry);
    }
  }
  for (const item of Array.isArray(payload?.watchedMovies) ? payload.watchedMovies : []) {
    const entry = nestedProfileEntry(item, "movie", "movie");
    if (entry?.key) entries.push(entry);
  }
  for (const item of Array.isArray(payload?.watchedShows) ? payload.watchedShows : []) {
    const entry = nestedProfileEntry(item, "show", "tv");
    if (entry?.key) entries.push(entry);
  }
  return entries;
}

async function buildProfilePosterMap(entries) {
  const posterByKey = new Map();
  for (const entry of entries) {
    if (entry.posterPath && !posterByKey.has(entry.key)) {
      posterByKey.set(entry.key, entry.posterPath);
    }
  }

  const missing = [...new Map(entries.map((entry) => [entry.key, entry])).values()].filter(
    (entry) => !posterByKey.has(entry.key),
  );
  if (missing.length === 0) return posterByKey;

  let cursor = 0;
  let stop = false;
  const workers = Array.from({ length: Math.min(8, missing.length) }, async () => {
    while (cursor < missing.length && !stop) {
      const index = cursor;
      cursor += 1;
      const entry = missing[index];
      const metadata = await fetchTmdbMetadata(entry.tmdbId, entry.type).catch(() => null);
      const posterPath = firstPosterPath(metadata?.poster_path, metadata?.backdrop_path);
      if (posterPath) posterByKey.set(entry.key, posterPath);
    }
  });

  // Tope de tiempo: si TMDb está frío/lento, devolvemos lo resuelto hasta ahora
  // (el resto se completa en cargas posteriores gracias a la caché de 24h).
  const budget = new Promise((resolve) => setTimeout(resolve, POSTER_ENRICH_BUDGET_MS));
  await Promise.race([Promise.all(workers), budget]);
  stop = true;
  return posterByKey;
}

function withPlainPoster(item, posterPath) {
  if (!posterPath) return item;
  const existing = firstPosterPath(item.poster_path, item.posterPath, item.profilePosterPath);
  if (existing) return item;
  return {
    ...item,
    poster_path: posterPath,
  };
}

function withNestedPoster(item, nestedKey, posterPath) {
  if (!posterPath || !item?.[nestedKey]) return item;
  const media = item[nestedKey];
  const existing = firstPosterPath(media.poster_path, media.posterPath, item.poster_path);
  if (existing) return item;
  return {
    ...item,
    [nestedKey]: {
      ...media,
      poster_path: posterPath,
    },
  };
}

async function enrichProfilePayloadPosters(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const entries = collectProfilePosterEntries(payload);
  if (entries.length === 0) return payload;

  const posterByKey = await buildProfilePosterMap(entries);
  if (posterByKey.size === 0) return payload;

  return {
    ...payload,
    history: Array.isArray(payload.history)
      ? payload.history.map((item) => {
          const entry = plainProfileEntry(item);
          return withPlainPoster(item, entry ? posterByKey.get(entry.key) : null);
        })
      : payload.history,
    recentHistory: Array.isArray(payload.recentHistory)
      ? payload.recentHistory.map((item) => {
          const entry = plainProfileEntry(item);
          return withPlainPoster(item, entry ? posterByKey.get(entry.key) : null);
        })
      : payload.recentHistory,
    recentRatings: Array.isArray(payload.recentRatings)
      ? payload.recentRatings.map((item) => {
          const entry = plainProfileEntry(item);
          return withPlainPoster(item, entry ? posterByKey.get(entry.key) : null);
        })
      : payload.recentRatings,
    watchlist: Array.isArray(payload.watchlist)
      ? payload.watchlist.map((item) => {
          const entry = plainProfileEntry(item);
          return withPlainPoster(item, entry ? posterByKey.get(entry.key) : null);
        })
      : payload.watchlist,
    watchedMovies: Array.isArray(payload.watchedMovies)
      ? payload.watchedMovies.map((item) => {
          const entry = nestedProfileEntry(item, "movie", "movie");
          return withNestedPoster(item, "movie", entry ? posterByKey.get(entry.key) : null);
        })
      : payload.watchedMovies,
    watchedShows: Array.isArray(payload.watchedShows)
      ? payload.watchedShows.map((item) => {
          const entry = nestedProfileEntry(item, "show", "tv");
          return withNestedPoster(item, "show", entry ? posterByKey.get(entry.key) : null);
        })
      : payload.watchedShows,
  };
}

function normalizeTopMovie(row) {
  return {
    plays: Number(row.plays || 0),
    last_watched_at: row.lastWatchedAt || null,
    movie: {
      title: row.title || "Sin titulo",
      year: null,
      ids: { tmdb: row.tmdbId },
      poster_path: row.posterPath || null,
    },
  };
}

function normalizeTopShow(row) {
  return {
    plays: Number(row.plays || 0),
    last_watched_at: row.lastWatchedAt || null,
    show: {
      title: row.title || "Sin titulo",
      year: null,
      ids: { tmdb: row.tmdbId },
      poster_path: row.posterPath || null,
    },
  };
}

function userPayload(user) {
  const username = user?.username || "usuario";
  return {
    username,
    name: user?.displayName || username,
    avatarUrl: user?.avatarUrl || null,
    about: user?.bio || null,
    location: null,
    joined_at: user?.createdAt || null,
    private: false,
    vip: user?.plan && user.plan !== "free",
    vip_ep: false,
    slug: username,
    provider: "showverse",
  };
}

function hasProfileData(json) {
  const stats = json?.stats || {};
  return Boolean(
    (json?.history || []).length ||
      (json?.recentHistory || []).length ||
      (json?.recentRatings || []).length ||
      (json?.watchlist || []).length ||
      (json?.watchedMovies || []).length ||
      (json?.watchedShows || []).length ||
      stats.movies?.plays ||
      stats.episodes?.plays ||
      stats.ratings?.total ||
      stats.collection?.watchlist,
  );
}

async function buildProfileFromExistingBackendRoutes(request, { compact = false } = {}) {
  const historyLimit = compact ? 200 : 1500;
  const ratingsLimit = compact ? 80 : 200;
  const watchlistLimit = compact ? 40 : 100;
  const [me, statsRoot, history, ratings, watchlist] = await Promise.all([
    backendFetchJson(request, "/v1/auth/me"),
    backendFetchJson(request, "/v1/stats"),
    backendFetchJson(request, `/v1/history?limit=${historyLimit}`),
    backendFetchJson(request, `/v1/ratings?limit=${ratingsLimit}`),
    backendFetchJson(request, `/v1/watchlist?limit=${watchlistLimit}`),
  ]);

  if ([me, statsRoot, history, ratings, watchlist].some((result) => result.status === 401)) {
    return { ok: false, status: 401, cookieSource: me };
  }

  if (!me.ok || !me.json?.user) {
    return { ok: false, status: me.status || 503, error: me.error, cookieSource: me };
  }

  const historyRows = Array.isArray(history.json?.results) ? history.json.results : [];
  const ratingRows = Array.isArray(ratings.json?.results) ? ratings.json.results : [];
  const watchlistRows = Array.isArray(watchlist.json?.results) ? watchlist.json.results : [];
  const root = statsRoot.json || {};
  const posterByKey = new Map();
  for (const row of [...ratingRows, ...watchlistRows]) {
    if (row?.posterPath && row?.mediaType && row?.tmdbId) {
      posterByKey.set(`${row.mediaType}:${row.tmdbId}`, row.posterPath);
    }
  }
  const hydratedHistoryRows = attachKnownPosters(historyRows, posterByKey);

  const movieRows = hydratedHistoryRows.filter((row) => row.mediaType === "movie");
  const episodeRows = hydratedHistoryRows.filter((row) => row.mediaType === "tv" && row.season && row.episode);
  const showIds = new Set(hydratedHistoryRows.filter((row) => row.mediaType === "tv").map((row) => row.tmdbId));
  const movieIds = new Set(movieRows.map((row) => row.tmdbId));
  const movieMinutes = movieRows.reduce((sum, row) => sum + runtimeForProfileRow(row), 0);
  const episodeMinutes = episodeRows.reduce((sum, row) => sum + runtimeForProfileRow(row), 0);
  const favoritesCount = Number(root.totalFavorites || 0);
  const watchlistCount = Number(root.totalWatchlist || watchlistRows.length || 0);

  return {
    ok: true,
    cookieSource: [me, statsRoot, history, ratings, watchlist].find((result) => result?.refreshedTokens),
    json: {
      authenticated: true,
      source: "showverse",
      compact,
      user: userPayload(me.json.user),
      stats: {
        ...emptyStats,
        movies: {
          ...emptyStats.movies,
          watched: Number(root.moviesWatched || movieIds.size || 0),
          plays: movieRows.length,
          minutes: movieMinutes,
          collected: favoritesCount,
        },
        shows: {
          ...emptyStats.shows,
          watched: showIds.size,
          collected: favoritesCount,
        },
        episodes: {
          ...emptyStats.episodes,
          watched: Number(root.episodesWatched || episodeRows.length || 0),
          plays: episodeRows.length,
          minutes: episodeMinutes,
        },
        ratings: {
          total: Number(root.totalRatings || ratingRows.length || 0),
          distribution: ratingDistribution(ratingRows),
        },
        collection: {
          favorites: favoritesCount,
          watchlist: watchlistCount,
        },
      },
      history: hydratedHistoryRows.map(normalizeHistoryRow),
      recentHistory: hydratedHistoryRows.slice(0, 20).map(normalizeHistoryRow),
      recentRatings: ratingRows.slice(0, 20).map(normalizeRatingRow),
      watchlist: watchlistRows.slice(0, 20).map(normalizeWatchlistRow),
      genres: buildGenreDistribution(hydratedHistoryRows),
      watchedMovies: buildTopRows(hydratedHistoryRows, "movie").map(normalizeTopMovie),
      watchedShows: buildTopRows(hydratedHistoryRows, "tv").map(normalizeTopShow),
      topActors: [],
      topDirectors: [],
    },
  };
}

export async function GET(request) {
  const compact = request.nextUrl?.searchParams?.get("compact") === "1";
  let backend = await backendFetchJson(
    request,
    `/v1/stats/profile${compact ? "?compact=1" : ""}`,
  );

  if (backend.ok && !hasProfileData(backend.json)) {
    const composed = await buildProfileFromExistingBackendRoutes(request, { compact });
    if (composed.ok && hasProfileData(composed.json)) backend = composed;
  } else if (!backend.ok && backend.status !== 401 && !backend.skipped) {
    const composed = await buildProfileFromExistingBackendRoutes(request, { compact });
    if (composed.ok) backend = composed;
  }

  if (!backend.ok) {
    if (backend.status === 401 || backend.skipped) {
      return emptyProfileResponse(401);
    }

    return NextResponse.json(
      {
        authenticated: true,
        source: "showverse",
        error: backend.error || "No se pudo cargar el perfil.",
      },
      { status: backend.status || 503 },
    );
  }

  const basePayload = {
    authenticated: true,
    ...(backend.json || {}),
    source: "showverse",
  };

  // El primer pintado (compact) NO espera al enriquecimiento de pósters con TMDb:
  // devuelve al instante con los posterPath ya cacheados en BD (como el resto de
  // páginas). El full posterior, en segundo plano, completa los que falten.
  const payload = compact ? basePayload : await enrichProfilePayloadPosters(basePayload);
  const response = NextResponse.json(payload);

  setBackendAuthCookies(response, backend.cookieSource || backend, {
    secure: getCookieSecure(request),
  });

  return response;
}
