const SOURCE_WEIGHTS = {
  topToday: 0.72,
  trending: 0.55,
  popular: 0.36,
};

const normalize01 = (value, max) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n / max);
};

const logScore = (value, maxLog = 5) =>
  Math.min(1, Math.log10(Number(value || 0) + 1) / maxLog);

const getReleaseDate = (item) => {
  const raw = item?.release_date || item?.first_air_date || "";
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const yearsSinceRelease = (item) => {
  const time = getReleaseDate(item);
  if (!time) return 20;
  return Math.max(0, (Date.now() - time) / (365.25 * 24 * 60 * 60 * 1000));
};

const getMediaKey = (item, mediaType) => {
  if (!item?.id) return null;
  return `${item.media_type || mediaType}:${item.id}`;
};

export function buildDashboardFeatured(
  { topToday = [], trending = [], popular = [], mediaType = "movie" } = {},
  { size = 8 } = {},
) {
  const pool = new Map();

  const addAll = (list, source) => {
    for (const [index, raw] of (Array.isArray(list) ? list : []).entries()) {
      if (!raw?.id) continue;
      if (!raw.backdrop_path && !raw.poster_path) continue;

      const item = {
        ...raw,
        media_type: raw.media_type || mediaType,
      };
      const key = getMediaKey(item, mediaType);
      if (!key) continue;

      const current = pool.get(key);
      const sources = {
        ...(current?.__featuredSources || {}),
        [source]: {
          rank: index + 1,
          weight: SOURCE_WEIGHTS[source] || 0,
        },
      };

      pool.set(key, {
        ...(current || {}),
        ...item,
        __featuredSources: sources,
      });
    }
  };

  addAll(topToday, "topToday");
  addAll(trending, "trending");
  addAll(popular, "popular");

  const scoreOf = (item) => {
    const voteAverage = Number(item?.vote_average || 0);
    const voteCount = Number(item?.vote_count || 0);
    const popularity = Number(item?.popularity || 0);
    const bayesianRating =
      voteCount > 0
        ? (voteCount / (voteCount + 900)) * voteAverage +
          (900 / (voteCount + 900)) * 7
        : 0;
    const sourceScore = Object.values(item.__featuredSources || {}).reduce(
      (sum, source) => {
        const rankBonus = Math.max(0, 1 - (Number(source.rank || 1) - 1) / 18);
        return sum + Number(source.weight || 0) * (0.68 + rankBonus * 0.32);
      },
      0,
    );

    return (
      sourceScore +
      normalize01(bayesianRating, 10) * 1.1 +
      logScore(voteCount, 5) * 0.58 +
      logScore(popularity, 3) * 0.46 +
      Math.max(0, 1 - yearsSinceRelease(item) / 10) * 0.18
    );
  };

  return [...pool.values()]
    .filter((item) => {
      const rating = Number(item?.vote_average || 0);
      const votes = Number(item?.vote_count || 0);
      const sources = Object.keys(item.__featuredSources || {});
      return rating >= 5.8 && (votes >= 120 || sources.includes("topToday"));
    })
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, size)
    .map(({ __featuredSources, ...item }) => item);
}
