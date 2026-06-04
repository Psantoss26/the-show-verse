// /src/app/api/trakt/profile/route.js
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
} from "@/lib/trakt/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRAKT_API = "https://api.trakt.tv";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

function traktHeaders(accessToken) {
  const key = process.env.TRAKT_CLIENT_ID;
  if (!key) throw new Error("Missing TRAKT_CLIENT_ID env var");
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": key,
    "User-Agent": process.env.TRAKT_USER_AGENT || "TheShowVerse/1.0",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

async function fetchTmdbPoster(tmdbId, type) {
  if (!TMDB_KEY || !tmdbId) return null;
  try {
    const endpoint = type === "movie" ? "movie" : "tv";
    const res = await fetch(
      `${TMDB_API}/${endpoint}/${tmdbId}?api_key=${TMDB_KEY}&language=es-ES`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await safeJson(res);
    if (!data) return null;
    return {
      poster_path: data.poster_path || null,
      backdrop_path: data.backdrop_path || null,
      title: type === "movie" ? (data.title || data.original_title) : (data.name || data.original_name),
      year: (type === "movie" ? data.release_date : data.first_air_date)?.slice(0, 4) || null,
      vote_average: data.vote_average || null,
      genres: data.genres || [],
      overview: data.overview || null,
    };
  } catch {
    return null;
  }
}

async function fetchTmdbEpisode(tmdbId, season, episode) {
  if (!TMDB_KEY || !tmdbId || !season || !episode) return null;
  try {
    const res = await fetch(
      `${TMDB_API}/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${TMDB_KEY}&language=es-ES&append_to_response=external_ids`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await safeJson(res);
    if (!data) return null;
    return {
      name: data.name || null,
      still_path: data.still_path || null,
      air_date: data.air_date || null,
      vote_average: data.vote_average || null,
      vote_count: data.vote_count || null,
      imdb_id: data.external_ids?.imdb_id || null,
    };
  } catch {
    return null;
  }
}

async function parallelLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function GET(request) {
  try {
    const searchParams = request?.nextUrl?.searchParams || new URLSearchParams();
    const compact = searchParams.get("compact") === "1";
    const userOnly = searchParams.get("userOnly") === "1";
    const cookieStore = await cookies();
    const { token, refreshedTokens, shouldClear } = await getValidTraktToken(cookieStore);

    if (!token) {
      const res = NextResponse.json({ error: "Not authenticated", notConnected: true }, { status: 401 });
      if (shouldClear) clearTraktCookies(res);
      return res;
    }

    const h = traktHeaders(token);

    const recentHistoryLimit = compact ? 15 : 30;

    // Fetch all Trakt endpoints in parallel
    const [
      settingsRes,
      statsRes,
      historyRes,
      ratingsMoviesRes,
      ratingsShowsRes,
      watchlistRes,
      collectionMoviesRes,
    ] = await Promise.allSettled([
      fetch(`${TRAKT_API}/users/settings`, { headers: h, cache: "no-store" }),
      compact
        ? Promise.resolve(null)
        : fetch(`${TRAKT_API}/users/me/stats`, { headers: h, cache: "no-store" }),
      fetch(`${TRAKT_API}/sync/history?limit=${recentHistoryLimit}&extended=full`, { headers: h, cache: "no-store" }),
      fetch(`${TRAKT_API}/sync/ratings/movies?limit=15&extended=full`, { headers: h, cache: "no-store" }),
      fetch(`${TRAKT_API}/sync/ratings/shows?limit=15&extended=full`, { headers: h, cache: "no-store" }),
      fetch(`${TRAKT_API}/sync/watchlist?extended=full&limit=15`, { headers: h, cache: "no-store" }),
      compact
        ? Promise.resolve(null)
        : fetch(`${TRAKT_API}/sync/collection/movies`, { headers: h, cache: "no-store" }),
    ]);

    // Parse settings (required)
    if (settingsRes.status !== "fulfilled" || !settingsRes.value?.ok) {
      const res = NextResponse.json({ error: "Failed to fetch user info", notConnected: true }, { status: 401 });
      if (shouldClear) clearTraktCookies(res);
      return res;
    }
    const settings = await safeJson(settingsRes.value);
    const userInfo = settings?.user || {};
    const username = userInfo?.ids?.slug || userInfo?.username || "me";
    const avatarPath = userInfo?.images?.avatar?.full || null;
    const baseUser = {
      username: userInfo?.username || username,
      name: userInfo?.name || userInfo?.username || "Usuario",
      about: userInfo?.about || null,
      location: userInfo?.location || null,
      joined_at: userInfo?.joined_at || null,
      age: userInfo?.age || null,
      gender: userInfo?.gender || null,
      avatarUrl: avatarPath || null,
      private: userInfo?.private || false,
      vip: userInfo?.vip || false,
      vip_ep: userInfo?.vip_ep || false,
      slug: userInfo?.ids?.slug || username,
      traktUrl: `https://trakt.tv/users/${userInfo?.ids?.slug || username}`,
    };

    if (userOnly) {
      const response = NextResponse.json({ user: baseUser });
      if (refreshedTokens) setTraktCookies(response, refreshedTokens);
      return response;
    }

    // Parse stats
    const stats = statsRes.status === "fulfilled" && statsRes.value?.ok
      ? await safeJson(statsRes.value) : null;

    // Parse recent history and enrich with TMDb posters
    const rawHistory = historyRes.status === "fulfilled" && historyRes.value?.ok
      ? (await safeJson(historyRes.value)) || [] : [];

    // Parse ratings
    const rawRatingsMovies = ratingsMoviesRes.status === "fulfilled" && ratingsMoviesRes.value?.ok
      ? (await safeJson(ratingsMoviesRes.value)) || [] : [];
    const rawRatingsShows = ratingsShowsRes.status === "fulfilled" && ratingsShowsRes.value?.ok
      ? (await safeJson(ratingsShowsRes.value)) || [] : [];

    // Parse watchlist
    const rawWatchlist = watchlistRes.status === "fulfilled" && watchlistRes.value?.ok
      ? (await safeJson(watchlistRes.value)) || [] : [];

    // Parse collection count
    const rawCollection = collectionMoviesRes.status === "fulfilled" && collectionMoviesRes.value?.ok
      ? (await safeJson(collectionMoviesRes.value)) || [] : [];

    // Also fetch followers/following counts and top watched
    const [followersRes, followingRes, watchedMoviesRes, watchedShowsRes] = await Promise.allSettled([
      compact
        ? Promise.resolve(null)
        : fetch(`${TRAKT_API}/users/${username}/followers`, { headers: h, cache: "no-store" }),
      compact
        ? Promise.resolve(null)
        : fetch(`${TRAKT_API}/users/${username}/following`, { headers: h, cache: "no-store" }),
      compact
        ? Promise.resolve(null)
        : fetch(`${TRAKT_API}/users/${username}/watched/movies`, { headers: h, cache: "no-store" }),
      compact
        ? Promise.resolve(null)
        : fetch(`${TRAKT_API}/users/${username}/watched/shows`, { headers: h, cache: "no-store" }),
    ]);
    const followers = followersRes.status === "fulfilled" && followersRes.value?.ok
      ? (await safeJson(followersRes.value)) || [] : [];
    const following = followingRes.status === "fulfilled" && followingRes.value?.ok
      ? (await safeJson(followingRes.value)) || [] : [];
    const rawWatchedMovies = watchedMoviesRes.status === "fulfilled" && watchedMoviesRes.value?.ok
      ? (await safeJson(watchedMoviesRes.value)) || [] : [];
    const rawWatchedShows = watchedShowsRes.status === "fulfilled" && watchedShowsRes.value?.ok
      ? (await safeJson(watchedShowsRes.value)) || [] : [];

    // Normalize history entries
    const normalizedHistory = rawHistory
      .map((h) => {
        if (h?.movie) {
          const tmdbId = h.movie?.ids?.tmdb;
          return {
            type: "movie",
            tmdbId,
            title: h.movie?.title,
            year: h.movie?.year,
            watched_at: h.watched_at,
            detailsHref: tmdbId ? `/details/movie/${tmdbId}` : null,
          };
        }
        if (h?.show && h?.episode) {
          const tmdbId = h.show?.ids?.tmdb;
          const season = h.episode?.season;
          const number = h.episode?.number;
          return {
            type: "show",
            tmdbId,
            title: h.show?.title,
            year: h.show?.year,
            watched_at: h.watched_at,
            episode: {
              season,
              number,
              title: h.episode?.title,
            },
            detailsHref: tmdbId && season && number
              ? `/details/tv/${tmdbId}/season/${season}/episode/${number}`
              : tmdbId ? `/details/tv/${tmdbId}` : null,
          };
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 15);

    // Normalize recent ratings (movies + shows combined, sorted by rated_at)
    const normalizedRatings = [
      ...rawRatingsMovies.map((r) => ({
        type: "movie",
        tmdbId: r.movie?.ids?.tmdb,
        title: r.movie?.title,
        year: r.movie?.year,
        rating: r.rating,
        rated_at: r.rated_at,
        detailsHref: r.movie?.ids?.tmdb ? `/details/movie/${r.movie.ids.tmdb}` : null,
      })),
      ...rawRatingsShows.map((r) => ({
        type: "show",
        tmdbId: r.show?.ids?.tmdb,
        title: r.show?.title,
        year: r.show?.year,
        rating: r.rating,
        rated_at: r.rated_at,
        detailsHref: r.show?.ids?.tmdb ? `/details/tv/${r.show.ids.tmdb}` : null,
      })),
    ]
      .sort((a, b) => new Date(b.rated_at) - new Date(a.rated_at))
      .slice(0, 15);

    // Normalize watchlist
    const normalizedWatchlist = rawWatchlist
      .map((w) => {
        const item = w.movie || w.show;
        if (!item) return null;
        const type = w.movie ? "movie" : "show";
        const tmdbId = item?.ids?.tmdb;
        return {
          type,
          tmdbId,
          title: item?.title,
          year: item?.year,
          listed_at: w.listed_at,
          detailsHref: tmdbId ? `/details/${type === "movie" ? "movie" : "tv"}/${tmdbId}` : null,
        };
      })
      .filter(Boolean)
      .slice(0, 15);

    // Enrich history with TMDb posters (parallel, limited concurrency)
    const enrichHistoryPromise = parallelLimit(normalizedHistory, 6, async (item) => {
      const [tmdb, episodeDetail] = await Promise.all([
        fetchTmdbPoster(item.tmdbId, item.type === "movie" ? "movie" : "tv"),
        item.episode && !compact
          ? fetchTmdbEpisode(item.tmdbId, item.episode.season, item.episode.number)
          : Promise.resolve(null),
      ]);
      return {
        ...item,
        poster_path: tmdb?.poster_path || null,
        backdrop_path: tmdb?.backdrop_path || null,
        title: tmdb?.title || item.title,
        year: tmdb?.year || item.year,
        vote_average: episodeDetail?.vote_average || tmdb?.vote_average || null,
        genres: tmdb?.genres || [],
        episode: item.episode
          ? {
            ...item.episode,
            title: episodeDetail?.name || item.episode.title,
            still_path: episodeDetail?.still_path || null,
            air_date: episodeDetail?.air_date || null,
            vote_average: episodeDetail?.vote_average || null,
            vote_count: episodeDetail?.vote_count || null,
            imdb_id: episodeDetail?.imdb_id || null,
          }
          : item.episode,
      };
    });

    // Enrich recent ratings
    const enrichRatingsPromise = parallelLimit(normalizedRatings, 6, async (item) => {
      const tmdb = await fetchTmdbPoster(item.tmdbId, item.type === "movie" ? "movie" : "tv");
      return {
        ...item,
        poster_path: tmdb?.poster_path || null,
        title: tmdb?.title || item.title,
        year: tmdb?.year || item.year,
        vote_average: tmdb?.vote_average || null,
        genres: tmdb?.genres || [],
      };
    });

    // Build top movies/shows (Trakt returns watched sorted by plays desc by default)
    const normalizedTopMovies = rawWatchedMovies.slice(0, 15).map((item) => ({
      movie: { ...item.movie, plays: item.plays },
      plays: item.plays,
    }));
    const normalizedTopShows = rawWatchedShows.slice(0, 15).map((item) => ({
      show: { ...item.show, plays: item.plays },
      plays: item.plays,
    }));

    const enrichTopMoviesPromise = compact
      ? []
      : parallelLimit(normalizedTopMovies, 6, async (item) => {
          const tmdbId = item.movie?.ids?.tmdb;
          const tmdb = await fetchTmdbPoster(tmdbId, "movie");
          return { ...item, movie: { ...item.movie, poster_path: tmdb?.poster_path || null, title: tmdb?.title || item.movie?.title } };
        });
    const enrichTopShowsPromise = compact
      ? []
      : parallelLimit(normalizedTopShows, 6, async (item) => {
          const tmdbId = item.show?.ids?.tmdb;
          const tmdb = await fetchTmdbPoster(tmdbId, "tv");
          return { ...item, show: { ...item.show, poster_path: tmdb?.poster_path || null, title: tmdb?.title || item.show?.title } };
        });

    // Enrich watchlist
    const enrichWatchlistPromise = parallelLimit(normalizedWatchlist, 4, async (item) => {
      const tmdb = await fetchTmdbPoster(item.tmdbId, item.type === "movie" ? "movie" : "tv");
      return {
        ...item,
        poster_path: tmdb?.poster_path || null,
        backdrop_path: tmdb?.backdrop_path || null,
        title: tmdb?.title || item.title,
        year: tmdb?.year || item.year,
        vote_average: tmdb?.vote_average || null,
        genres: tmdb?.genres || [],
      };
    });

    const [
      enrichedHistory,
      enrichedRatings,
      enrichedTopMovies,
      enrichedTopShows,
      enrichedWatchlist,
    ] = await Promise.all([
      enrichHistoryPromise,
      enrichRatingsPromise,
      enrichTopMoviesPromise,
      enrichTopShowsPromise,
      enrichWatchlistPromise,
    ]);

    const payload = {
      user: {
        ...baseUser,
        followers: Array.isArray(followers) ? followers.length : 0,
        following: Array.isArray(following) ? following.length : 0,
      },
      stats: stats || null,
      recentHistory: enrichedHistory,
      recentRatings: enrichedRatings,
      watchlist: enrichedWatchlist,
      topMovies: enrichedTopMovies,
      topShows: enrichedTopShows,
      collectionCount: Array.isArray(rawCollection) ? rawCollection.length : 0,
    };

    const response = NextResponse.json(payload);
    if (refreshedTokens) setTraktCookies(response, refreshedTokens);
    return response;
  } catch (e) {
    console.error("Error in profile route:", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
