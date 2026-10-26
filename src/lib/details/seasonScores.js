// Puntuaciones de una TEMPORADA (Trakt, sus estadísticas e IMDb), con caché en
// memoria y consultas en vuelo compartidas. Las usan la ficha de la temporada
// (SeasonDetailsClient) y su vista previa de pulsación larga
// (preview/SeasonPeek): abrir la ficha desde la vista previa no repite las
// consultas.

import {
  fetchSeriesGraphRatingsCached,
  getSeriesGraphSeasonAggregate,
} from "@/lib/details/seriesGraphRatings";

const seasonScoreboardCache = new Map();
const seasonScoreboardInflight = new Map();
const seasonStatsCache = new Map();
const seasonStatsInflight = new Map();
const seasonImdbCache = new Map();
const seasonImdbInflight = new Map();

// Valores que la ficha ya trae del servidor: la siguiente consulta los usa.
export function primeSeasonScoreboard(key, value) {
  if (value) seasonScoreboardCache.set(key, value);
}

export function primeSeasonImdb(key, value) {
  if (value) seasonImdbCache.set(key, value);
}

export async function fetchSeasonScoreboardCached({
  showId,
  seasonNumber,
  signal,
}) {
  const key = `${showId}:${seasonNumber}`;
  if (seasonScoreboardCache.has(key)) {
    return seasonScoreboardCache.get(key);
  }
  if (seasonScoreboardInflight.has(key)) {
    return seasonScoreboardInflight.get(key);
  }

  const promise = fetch(
    `/api/scoreboard/public?type=season&id=${encodeURIComponent(showId)}&season=${encodeURIComponent(seasonNumber)}`,
    {
      cache: "force-cache",
      signal,
    },
  )
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      const value = res.ok && json?.found ? json : null;
      if (value) {
        seasonScoreboardCache.set(key, value);
      }
      return value;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    })
    .finally(() => {
      seasonScoreboardInflight.delete(key);
    });

  seasonScoreboardInflight.set(key, promise);
  return promise;
}

export async function fetchSeasonStatsCached({ showId, seasonNumber, signal }) {
  const key = `${showId}:${seasonNumber}`;
  if (seasonStatsCache.has(key)) {
    return seasonStatsCache.get(key);
  }
  if (seasonStatsInflight.has(key)) {
    return seasonStatsInflight.get(key);
  }

  const promise = fetch(
    `/api/trakt/stats?type=season&tmdbId=${encodeURIComponent(showId)}&season=${encodeURIComponent(seasonNumber)}`,
    {
      cache: "force-cache",
      signal,
    },
  )
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      const hasNumericStats = Object.values(json?.stats || {}).some(
        (value) => typeof value === "number",
      );
      const value = res.ok && json?.found && hasNumericStats ? json : null;
      if (value) {
        seasonStatsCache.set(key, value);
      }
      return value;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    })
    .finally(() => {
      seasonStatsInflight.delete(key);
    });

  seasonStatsInflight.set(key, promise);
  return promise;
}

export async function fetchSeasonImdbCached({
  showId,
  showImdbId,
  seasonNumber,
  signal,
}) {
  const key = `${showId}:${showImdbId}:${seasonNumber}`;
  if (seasonImdbCache.has(key)) {
    return seasonImdbCache.get(key);
  }
  if (seasonImdbInflight.has(key)) {
    return seasonImdbInflight.get(key);
  }

  const promise = fetch(
    `/api/ratings/season?showId=${encodeURIComponent(showId)}&imdbId=${encodeURIComponent(showImdbId)}&season=${encodeURIComponent(seasonNumber)}`,
    {
      cache: "force-cache",
      signal,
    },
  )
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      const value =
        res.ok &&
        (typeof json?.rating === "number" || typeof json?.votes === "number")
          ? json
          : null;
      if (value) {
        seasonImdbCache.set(key, value);
      }
      return value;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    })
    .finally(() => {
      seasonImdbInflight.delete(key);
    });

  seasonImdbInflight.set(key, promise);
  return promise;
}

export const hasNumericSeasonStats = (stats) =>
  Object.values(stats || {}).some((value) => typeof value === "number");

// Respuesta del marcador público → { rating, votes, stats, traktUrl }.
export function parseSeasonScoreboard(json) {
  if (!json?.found) return null;
  return {
    loading: false,
    rating:
      typeof json?.community?.rating === "number"
        ? json.community.rating
        : null,
    votes:
      typeof json?.community?.votes === "number" ? json.community.votes : null,
    stats: json?.stats || null,
    traktUrl: json?.traktUrl || null,
  };
}

// Marcador de Trakt con sus estadísticas: si el marcador llega sin ellas, se
// piden aparte (lo mismo que hace la ficha).
export async function loadSeasonTraktScoreboard({
  showId,
  seasonNumber,
  signal,
}) {
  let json = await fetchSeasonScoreboardCached({
    showId,
    seasonNumber,
    signal,
  });
  if (!hasNumericSeasonStats(parseSeasonScoreboard(json)?.stats)) {
    const statsOnly = await fetchSeasonStatsCached({
      showId,
      seasonNumber,
      signal,
    });
    if (statsOnly?.found && hasNumericSeasonStats(statsOnly?.stats)) {
      json = {
        ...(json || {}),
        found: true,
        traktUrl: json?.traktUrl || statsOnly?.traktUrl || null,
        community: json?.community || null,
        stats: statsOnly.stats,
      };
    }
  }
  return parseSeasonScoreboard(json);
}

// IMDb de la temporada: la media de sus episodios en SeriesGraph y, si no la
// hay, la de OMDb con el id de IMDb de la serie.
export async function loadSeasonImdb({
  showId,
  showName,
  showImdbId,
  seasonNumber,
  tmdbSeasons,
  signal,
}) {
  const ratings = await fetchSeriesGraphRatingsCached({
    showId,
    title: showName,
    signal,
  });
  const aggregate = getSeriesGraphSeasonAggregate({
    ratings,
    seasonNumber,
    tmdbSeasons,
    showId,
    title: showName,
  });
  if (aggregate?.rating != null || !showImdbId) return aggregate || null;
  return fetchSeasonImdbCached({ showId, showImdbId, seasonNumber, signal });
}
