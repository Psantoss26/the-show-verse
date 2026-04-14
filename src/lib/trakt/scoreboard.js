import {
  fetchTrakt,
  fetchTraktMaybe,
  normalizeType,
} from "@/lib/trakt/fetchWithCache";

const EMPTY_STATS = {
  watchers: null,
  plays: null,
  collectors: null,
  comments: null,
  lists: null,
  favorited: null,
};

function shapeStats(stats) {
  if (!stats) return EMPTY_STATS;
  return {
    watchers: typeof stats?.watchers === "number" ? stats.watchers : null,
    plays: typeof stats?.plays === "number" ? stats.plays : null,
    collectors: typeof stats?.collectors === "number" ? stats.collectors : null,
    comments: typeof stats?.comments === "number" ? stats.comments : null,
    lists: typeof stats?.lists === "number" ? stats.lists : null,
    favorited: typeof stats?.favorited === "number" ? stats.favorited : null,
  };
}

async function fetchOptionalStats(paths, fetcher, budgetMs = 1500) {
  const validPaths = (Array.isArray(paths) ? paths : []).filter(Boolean);
  if (!validPaths.length) return null;

  return new Promise((resolve) => {
    let settled = false;
    let pending = validPaths.length;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, budgetMs);

    for (const path of validPaths) {
      fetcher(path)
        .then((result) => {
          if (settled) return;
          if (result) {
            settled = true;
            clearTimeout(timer);
            resolve(result);
            return;
          }
          pending -= 1;
          if (pending === 0) {
            settled = true;
            clearTimeout(timer);
            resolve(null);
          }
        })
        .catch(() => {
          pending -= 1;
          if (!settled && pending === 0) {
            settled = true;
            clearTimeout(timer);
            resolve(null);
          }
        });
    }
  });
}

export async function getTraktScoreboardData({
  type,
  tmdbId,
  season,
  episode,
} = {}) {
  const normalizedType = normalizeType(type);
  const normalizedTmdbId = tmdbId != null ? String(tmdbId) : "";

  if (!normalizedType || !normalizedTmdbId) {
    const err = new Error("Missing type/tmdbId");
    err.status = 400;
    throw err;
  }

  const fastTimeoutMs = process.env.NODE_ENV === "production" ? 5000 : 4000;
  const statsTimeoutMs = process.env.NODE_ENV === "production" ? 12000 : 10000;

  const ft = (path) => fetchTrakt(path, { timeoutMs: fastTimeoutMs });
  const ftStats = (path) =>
    fetchTraktMaybe(path, { timeoutMs: statsTimeoutMs });

  if (normalizedType === "movie" || normalizedType === "show") {
    const plural = normalizedType === "show" ? "shows" : "movies";

    const search = await ft(
      `/search/tmdb/${encodeURIComponent(normalizedTmdbId)}?type=${normalizedType}`,
    );
    const hit = Array.isArray(search) ? search[0] : null;
    const item = hit?.[normalizedType];
    const ids = item?.ids;

    if (!ids?.trakt) return { found: false };

    const traktId = ids.trakt;
    const summary = await ft(`/${plural}/${traktId}`);
    const stats = await fetchOptionalStats(
      [`/${plural}/${traktId}/stats`],
      ftStats,
      1500,
    );

    const slug = summary?.ids?.slug || ids?.slug || traktId;
    const traktUrl =
      normalizedType === "show"
        ? `https://trakt.tv/shows/${slug}`
        : `https://trakt.tv/movies/${slug}`;

    return {
      found: true,
      ids: summary?.ids || ids,
      traktUrl,
      community: {
        rating: typeof summary?.rating === "number" ? summary.rating : null,
        votes: typeof summary?.votes === "number" ? summary.votes : null,
      },
      stats: shapeStats(stats),
      external: {
        rtAudience: null,
        justwatchRank: null,
        justwatchDelta: null,
        justwatchCountry: "ES",
      },
    };
  }

  const seasonNumber = season != null ? Number(season) : null;
  const episodeNumber = episode != null ? Number(episode) : null;

  if (
    !Number.isFinite(seasonNumber) ||
    (normalizedType === "episode" && !Number.isFinite(episodeNumber))
  ) {
    const err = new Error("Missing season/episode params");
    err.status = 400;
    throw err;
  }

  const searchShow = await ft(
    `/search/tmdb/${encodeURIComponent(normalizedTmdbId)}?type=show`,
  );
  const showHit = Array.isArray(searchShow) ? searchShow[0] : null;
  const showItem = showHit?.show;
  const showIds = showItem?.ids;

  if (!showIds?.trakt) return { found: false };

  const traktShowId = showIds.trakt;
  const showSlug = showIds?.slug || traktShowId;

  if (normalizedType === "season") {
    const seasons = await ft(`/shows/${traktShowId}/seasons?extended=full`);
    const seasonObj = Array.isArray(seasons)
      ? seasons.find((s) => Number(s?.number) === Number(seasonNumber))
      : null;

    if (!seasonObj?.ids?.trakt) return { found: false };

    const seasonIds = seasonObj.ids;
    const traktUrl = `https://trakt.tv/shows/${showSlug}/seasons/${seasonNumber}`;

    const stats = await fetchOptionalStats(
      [
        `/seasons/${seasonIds.trakt}/stats`,
        `/shows/${traktShowId}/seasons/${seasonNumber}/stats`,
      ],
      ftStats,
      1500,
    );

    return {
      found: true,
      ids: seasonIds,
      traktUrl,
      community: {
        rating: typeof seasonObj?.rating === "number" ? seasonObj.rating : null,
        votes: typeof seasonObj?.votes === "number" ? seasonObj.votes : null,
      },
      stats: shapeStats(stats),
      external: {
        rtAudience: null,
        justwatchRank: null,
        justwatchDelta: null,
        justwatchCountry: "ES",
      },
    };
  }

  const ep = await ft(
    `/shows/${traktShowId}/seasons/${seasonNumber}/episodes/${episodeNumber}?extended=full`,
  );
  const epIds = ep?.ids;
  if (!epIds?.trakt) return { found: false };

  const traktUrl = `https://trakt.tv/shows/${showSlug}/seasons/${seasonNumber}/episodes/${episodeNumber}`;
  const stats = await fetchOptionalStats(
    [
      `/episodes/${epIds.trakt}/stats`,
      `/shows/${traktShowId}/seasons/${seasonNumber}/episodes/${episodeNumber}/stats`,
    ],
    ftStats,
    1500,
  );

  return {
    found: true,
    ids: epIds,
    traktUrl,
    community: {
      rating: typeof ep?.rating === "number" ? ep.rating : null,
      votes: typeof ep?.votes === "number" ? ep.votes : null,
    },
    stats: shapeStats(stats),
    external: {
      rtAudience: null,
      justwatchRank: null,
      justwatchDelta: null,
      justwatchCountry: "ES",
    },
  };
}
