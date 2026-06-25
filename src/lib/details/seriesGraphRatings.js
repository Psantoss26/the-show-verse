// src/lib/details/seriesGraphRatings.js
import { slugifyForSeriesGraph } from "@/lib/details/formatters";

const ratingsCache = new Map();
const ratingsInflight = new Map();

function toRatingNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toVoteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function getSeasonNumber(season) {
  const parsed = Number(
    season?.season_number ?? season?.seasonNumber ?? season?.number,
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function getEpisodeNumber(episode) {
  const parsed = Number(
    episode?.episode_number ?? episode?.episodeNumber ?? episode?.number,
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function getSeriesGraphRating(episode) {
  return toRatingNumber(
    episode?.seriesGraphRating ??
      episode?.seriesgraphRating ??
      episode?.series_graph_rating ??
      episode?.rating ??
      episode?.vote_average,
  );
}

function getSeriesGraphVotes(episode) {
  return toVoteNumber(
    episode?.seriesGraphVotes ??
      episode?.seriesgraphVotes ??
      episode?.series_graph_votes ??
      episode?.votes ??
      episode?.vote_count ??
      episode?.num_votes,
  );
}

function buildSeriesGraphUrl(showId, title) {
  const slug = slugifyForSeriesGraph(title || "");
  return `https://seriesgraph.com/show/${encodeURIComponent(String(showId))}${
    slug ? `-${slug}` : ""
  }`;
}

function getNormalizedRatingSeasons(ratings) {
  return (
    Array.isArray(ratings?.seasons)
      ? ratings.seasons
      : Array.isArray(ratings)
        ? ratings
        : []
  )
    .map((season) => {
      const seasonNumber = getSeasonNumber(season);
      const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
      if (!Number.isFinite(seasonNumber) || seasonNumber <= 0) return null;
      if (!episodes.length) return null;
      return { season, seasonNumber, episodes };
    })
    .filter(Boolean)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
}

function getTmdbSeasonsSorted(tmdbSeasons) {
  return (Array.isArray(tmdbSeasons) ? tmdbSeasons : [])
    .map((season) => {
      const number = Number(season?.season_number ?? season?.seasonNumber);
      const count = Number(season?.episode_count ?? season?.episodeCount);
      if (!Number.isFinite(number) || number <= 0) return null;
      if (!Number.isFinite(count) || count <= 0) return null;
      return { number, count };
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);
}

// Rango de número de episodio ABSOLUTO que cubre una temporada de TMDb,
// asumiendo numeración acumulada (la que usa el anime tipo One Piece). Para la
// T13 de One Piece (101 eps, con 421 antes) devuelve { start: 422, end: 522 }.
function getAbsoluteRangeForTmdbSeason(tmdbSeasonsSorted, seasonNumber) {
  const target = Number(seasonNumber);
  let start = 1;
  for (const season of tmdbSeasonsSorted) {
    if (season.number === target) {
      return { start, end: start + season.count - 1 };
    }
    if (season.number < target) start += season.count;
  }
  return null;
}

function aggregateEpisodeRatings(episodes) {
  const list = Array.isArray(episodes) ? episodes : [];
  const values = list
    .map((episode) => getSeriesGraphRating(episode))
    .filter((rating) => rating != null);
  if (!values.length) return null;
  const votes = list.reduce(
    (sum, episode) => sum + (getSeriesGraphVotes(episode) || 0),
    0,
  );
  const rating = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { rating: Number(rating.toFixed(1)), votes: votes > 0 ? votes : null };
}

function getTmdbEpisodeOrdinal(tmdbSeasons, seasonNumber, episodeNumber) {
  const targetSeasonNumber = Number(seasonNumber);
  const targetEpisodeNumber = Number(episodeNumber);
  if (
    !Number.isFinite(targetSeasonNumber) ||
    !Number.isFinite(targetEpisodeNumber) ||
    targetSeasonNumber <= 0 ||
    targetEpisodeNumber <= 0
  ) {
    return null;
  }

  const seasons = getTmdbSeasonsSorted(tmdbSeasons);
  if (!seasons.length) return null;

  let cumulativeStart = 0;
  let targetCount = null;
  for (const season of seasons) {
    if (season.number === targetSeasonNumber) {
      targetCount = season.count;
      break;
    }
    if (season.number < targetSeasonNumber) cumulativeStart += season.count;
  }

  // Si el número de episodio ya supera el tamaño de su temporada, TMDb usa
  // numeración ABSOLUTA (p. ej. T13 de One Piece = 422..522), así que el número
  // ya ES el ordinal. En caso contrario es relativo a la temporada y sumamos el
  // desplazamiento de las temporadas anteriores.
  if (targetCount != null && targetEpisodeNumber > targetCount) {
    return targetEpisodeNumber;
  }
  return targetEpisodeNumber + cumulativeStart;
}

function mapTmdbRouteToRatingsEpisode({
  ratings,
  tmdbSeasons,
  seasonNumber,
  episodeNumber,
} = {}) {
  const seasons = getNormalizedRatingSeasons(ratings);
  if (!seasons.length) return null;

  const directSeasonNumber = Number(seasonNumber);
  const directEpisodeNumber = Number(episodeNumber);
  const directSeason = seasons.find(
    (season) => season.seasonNumber === directSeasonNumber,
  );
  const directEpisode = directSeason?.episodes.find(
    (episode) => getEpisodeNumber(episode) === directEpisodeNumber,
  );
  if (directEpisode) {
    return {
      season: directSeason.season,
      episode: directEpisode,
      seasonNumber: directSeasonNumber,
      episodeNumber: directEpisodeNumber,
    };
  }

  const ordinal = getTmdbEpisodeOrdinal(
    tmdbSeasons,
    seasonNumber,
    episodeNumber,
  );
  if (!Number.isFinite(ordinal) || ordinal <= 0) return null;

  let remaining = ordinal;
  for (const season of seasons) {
    const sortedEpisodes = [...season.episodes].sort(
      (a, b) => (getEpisodeNumber(a) || 0) - (getEpisodeNumber(b) || 0),
    );
    if (remaining <= sortedEpisodes.length) {
      const episode = sortedEpisodes[remaining - 1];
      return {
        season: season.season,
        episode,
        seasonNumber: season.seasonNumber,
        episodeNumber: getEpisodeNumber(episode),
      };
    }
    remaining -= sortedEpisodes.length;
  }

  return null;
}

export async function fetchSeriesGraphRatingsCached({
  showId,
  title,
  signal,
} = {}) {
  if (!showId) return null;

  const key = String(showId);
  if (ratingsCache.has(key)) return ratingsCache.get(key);
  if (ratingsInflight.has(key)) return ratingsInflight.get(key);

  const params = new URLSearchParams({ tmdbId: key });
  if (title) params.set("title", title);

  const promise = fetch(`/api/seriesgraph/episode-ratings?${params}`, {
    cache: "force-cache",
    signal,
  })
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      const value = res.ok ? json : null;
      if (value) ratingsCache.set(key, value);
      return value;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    })
    .finally(() => {
      ratingsInflight.delete(key);
    });

  ratingsInflight.set(key, promise);
  return promise;
}

// Media de SeriesGraph por temporada de TMDb. Devuelve un Map(seasonNumber ->
// { rating, votes }). Cuando SeriesGraph entrega una única temporada absoluta
// pero TMDb reparte los episodios en varias temporadas (anime), reparte los
// episodios por el rango absoluto que cubre cada temporada de TMDb; así las
// puntuaciones dejan de mostrarse solo en la temporada 1.
export function getSeriesGraphSeasonAverages({ ratings, tmdbSeasons } = {}) {
  const seasons = getNormalizedRatingSeasons(ratings);
  const result = new Map();
  if (!seasons.length) return result;

  const tmdbSorted = getTmdbSeasonsSorted(tmdbSeasons);
  const flattened = seasons.length === 1 && tmdbSorted.length > 1;

  if (!flattened) {
    seasons.forEach(({ seasonNumber, episodes }) => {
      const aggregate = aggregateEpisodeRatings(episodes);
      if (aggregate) result.set(seasonNumber, aggregate);
    });
    return result;
  }

  const allEpisodes = seasons[0].episodes;
  for (const tmdbSeason of tmdbSorted) {
    const range = getAbsoluteRangeForTmdbSeason(tmdbSorted, tmdbSeason.number);
    if (!range) continue;
    const inRange = allEpisodes.filter((episode) => {
      const number = getEpisodeNumber(episode);
      return (
        Number.isFinite(number) &&
        number >= range.start &&
        number <= range.end
      );
    });
    const aggregate = aggregateEpisodeRatings(inRange);
    if (aggregate) result.set(tmdbSeason.number, aggregate);
  }
  return result;
}

export function getSeriesGraphSeasonAggregate({
  ratings,
  seasonNumber,
  tmdbSeasons,
  showId,
  title,
} = {}) {
  const targetSeasonNumber = Number(seasonNumber);
  if (!Number.isFinite(targetSeasonNumber) || targetSeasonNumber <= 0) {
    return null;
  }

  const averages = getSeriesGraphSeasonAverages({ ratings, tmdbSeasons });
  const aggregate = averages.get(targetSeasonNumber);
  if (!aggregate || aggregate.rating == null) return null;

  return {
    id: null,
    rating: aggregate.rating,
    votes: aggregate.votes,
    source: "seriesgraph",
    url: ratings?.meta?.providerUrl || buildSeriesGraphUrl(showId, title),
  };
}

export function getSeriesGraphEpisodeRating({
  ratings,
  seasonNumber,
  episodeNumber,
  tmdbSeasons,
  showId,
  title,
} = {}) {
  const targetSeasonNumber = Number(seasonNumber);
  const targetEpisodeNumber = Number(episodeNumber);
  if (
    !Number.isFinite(targetSeasonNumber) ||
    !Number.isFinite(targetEpisodeNumber)
  ) {
    return null;
  }

  const resolved = mapTmdbRouteToRatingsEpisode({
    ratings,
    tmdbSeasons,
    seasonNumber: targetSeasonNumber,
    episodeNumber: targetEpisodeNumber,
  });
  const episode = resolved?.episode || null;
  const rating = getSeriesGraphRating(episode);
  if (rating == null) return null;

  return {
    id: episode?.tconst || null,
    rating,
    votes: getSeriesGraphVotes(episode),
    source: "seriesgraph",
    url: ratings?.meta?.providerUrl || buildSeriesGraphUrl(showId, title),
    seasonNumber: resolved?.seasonNumber ?? targetSeasonNumber,
    episodeNumber: resolved?.episodeNumber ?? targetEpisodeNumber,
  };
}
