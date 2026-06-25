const SOFT_LIMITED_GENRES = new Set([
  16, // Animation
  99, // Documentary
]);

const QUALITY = {
  movie: {
    goodVotes: 900,
    goodRating: 7.0,
    standoutVotes: 2500,
    standoutRating: 7.7,
  },
  tv: {
    goodVotes: 250,
    goodRating: 7.1,
    standoutVotes: 700,
    standoutRating: 7.8,
  },
};

const PREFERRED_LANGS = new Set(["en", "es"]);
const PREFERRED_COUNTRIES = new Set(["US", "ES"]);

function getGenreIds(item) {
  if (Array.isArray(item?.genre_ids)) return item.genre_ids;
  if (Array.isArray(item?.genreIds)) return item.genreIds;
  return [];
}

function getMediaType(item, fallback = "movie") {
  const type = item?.media_type || item?.mediaType || fallback;
  return type === "tv" ? "tv" : "movie";
}

function getOriginalLanguage(item) {
  return item?.original_language || item?.originalLanguage || null;
}

function getOriginCountries(item) {
  if (Array.isArray(item?.origin_country)) return item.origin_country;
  if (Array.isArray(item?.originCountry)) return item.originCountry;
  return [];
}

function getVoteAverage(item) {
  const value = item?.vote_average ?? item?.voteAverage;
  return typeof value === "number" ? value : 0;
}

function getVoteCount(item) {
  const value = item?.vote_count ?? item?.voteCount;
  return typeof value === "number" ? value : 0;
}

export function isSoftLimitedDashboardContent(item) {
  const ids = getGenreIds(item);
  const hasSoftGenre = ids.some((id) => SOFT_LIMITED_GENRES.has(id));
  const isAnimeLike = getOriginalLanguage(item) === "ja" && ids.includes(16);
  return hasSoftGenre || isAnimeLike;
}

export function softLimitedDashboardWeight(item, fallbackMediaType = "movie") {
  if (!isSoftLimitedDashboardContent(item)) return 1;

  const quality = QUALITY[getMediaType(item, fallbackMediaType)] || QUALITY.movie;
  const votes = getVoteCount(item);
  const rating = getVoteAverage(item);

  if (votes >= quality.standoutVotes && rating >= quality.standoutRating) {
    return 0.94;
  }
  if (votes >= quality.goodVotes && rating >= quality.goodRating) {
    return 0.78;
  }
  return 0.58;
}

export function localePriorityDashboardWeight(item) {
  const lang = getOriginalLanguage(item);
  const countries = getOriginCountries(item);
  const hasPreferredLang = PREFERRED_LANGS.has(lang);
  const hasPreferredCountry = countries.some((country) => PREFERRED_COUNTRIES.has(country));

  if (hasPreferredLang && hasPreferredCountry) return 1.18;
  if (hasPreferredCountry) return 1.13;
  if (hasPreferredLang) return 1.1;
  return 1;
}

export function dashboardContentPriorityWeight(item, fallbackMediaType = "movie") {
  return softLimitedDashboardWeight(item, fallbackMediaType) * localePriorityDashboardWeight(item);
}

export function balanceSoftLimitedDashboardContent(list = [], fallbackMediaType = "movie") {
  return [...list]
    .map((item, index, items) => ({
      item,
      index,
      weightedRank: (items.length - index) * dashboardContentPriorityWeight(item, fallbackMediaType),
    }))
    .sort((a, b) => b.weightedRank - a.weightedRank || a.index - b.index)
    .map(({ item }) => item);
}
