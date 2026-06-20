import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    poster_path: row.posterPath || null,
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
    poster_path: row.posterPath || null,
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

async function buildProfileFromExistingBackendRoutes(request) {
  const [me, statsRoot, history, ratings, watchlist] = await Promise.all([
    backendFetchJson(request, "/v1/auth/me"),
    backendFetchJson(request, "/v1/stats"),
    backendFetchJson(request, "/v1/history?limit=1500"),
    backendFetchJson(request, "/v1/ratings?limit=200"),
    backendFetchJson(request, "/v1/watchlist?limit=100"),
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
  let backend = await backendFetchJson(request, "/v1/stats/profile");

  if (backend.ok && !hasProfileData(backend.json)) {
    const composed = await buildProfileFromExistingBackendRoutes(request);
    if (composed.ok && hasProfileData(composed.json)) backend = composed;
  } else if (!backend.ok && backend.status !== 401 && !backend.skipped) {
    const composed = await buildProfileFromExistingBackendRoutes(request);
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

  const response = NextResponse.json({
    authenticated: true,
    ...(backend.json || {}),
    source: "showverse",
  });

  setBackendAuthCookies(response, backend.cookieSource || backend, {
    secure: getCookieSecure(request),
  });

  return response;
}
