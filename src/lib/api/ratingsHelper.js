// src/lib/api/ratingsHelper.js
const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const RATINGS_REVALIDATE_SECONDS = 60 * 60 * 24 * 30; // 30 días
const OMDB_API_KEY = process.env.OMDB_API_KEY;
const OMDB_BASE_URL = "https://www.omdbapi.com/";

async function tmdbFetch(path, searchParams = {}) {
  if (!TMDB_API_KEY) {
    throw new Error(
      "TMDB_API_KEY o NEXT_PUBLIC_TMDB_API_KEY no está configurada en el entorno.",
    );
  }

  const url = new URL(TMDB_BASE_URL + path);
  url.searchParams.set("api_key", TMDB_API_KEY);

  for (const [k, v] of Object.entries(searchParams)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    next: { revalidate: RATINGS_REVALIDATE_SECONDS },
  });

  const status = res.status;
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      json?.status_message || json?.error || "Error en la llamada a TMDb.";
    const err = new Error(msg);
    err.status = status;
    throw err;
  }

  return json;
}

async function omdbFetchSeason(imdbId, seasonNumber) {
  if (!OMDB_API_KEY || !imdbId) return null;

  const url = new URL(OMDB_BASE_URL);
  url.searchParams.set("apikey", OMDB_API_KEY);
  url.searchParams.set("i", imdbId);
  url.searchParams.set("Season", String(seasonNumber));

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: RATINGS_REVALIDATE_SECONDS },
    });
    const json = await res.json();
    if (!res.ok || json?.Response === "False") return null;
    return json;
  } catch {
    return null;
  }
}

async function buildOmdbEpisodeMap(imdbId, maxSeasons = 10) {
  if (!OMDB_API_KEY || !imdbId) return { map: new Map(), seasons: [] };

  const omdbSeasons = [];
  const episodeMap = new Map();
  let absoluteCounter = 1;

  for (let s = 1; s <= maxSeasons; s++) {
    const omdbSeason = await omdbFetchSeason(imdbId, s);
    if (!omdbSeason?.Episodes?.length) {
      if (s === 1) break;
      break;
    }

    const episodes = omdbSeason.Episodes.map((ep) => {
      const episodeNumber = Number(ep.Episode);
      if (!Number.isFinite(episodeNumber)) return null;

      let rating = null;
      let votes = null;

      if (ep.imdbRating && ep.imdbRating !== "N/A") {
        const r = Number(ep.imdbRating);
        if (Number.isFinite(r) && r > 0 && r <= 10) rating = r;
      }

      if (ep.imdbVotes && ep.imdbVotes !== "N/A") {
        const v = Number(String(ep.imdbVotes).replace(/,/g, ""));
        if (Number.isFinite(v) && v > 0) votes = v;
      }

      const entry = {
        season: s,
        episode: episodeNumber,
        rating,
        votes,
        title: ep.Title || null,
      };

      episodeMap.set(absoluteCounter, entry);
      absoluteCounter++;

      return entry;
    }).filter(Boolean);

    omdbSeasons.push({
      seasonNumber: s,
      episodeCount: episodes.length,
      episodes,
    });
  }

  return { map: episodeMap, seasons: omdbSeasons };
}

function calculateAbsoluteEpisodeNumber(
  seasonNumber,
  episodeNumber,
  allSeasons,
) {
  if (seasonNumber === 1) return episodeNumber;

  let absolute = episodeNumber;
  for (const s of allSeasons) {
    if (s.season_number >= seasonNumber) break;
    absolute += s.episode_count || 0;
  }
  return absolute;
}

async function runBatched(promisesFactories, batchSize = 4) {
  const results = [];
  for (let i = 0; i < promisesFactories.length; i += batchSize) {
    const batch = promisesFactories.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Obtiene ratings de episodios para una serie de TV
 * @param {number} id - TMDb ID de la serie
 * @param {boolean} excludeSpecials - Excluir especiales (season 0)
 * @returns {Promise<object>} - Objeto con summary y seasons con ratings
 */
export async function getEpisodeRatings(id, excludeSpecials = false) {
  const show = await tmdbFetch(`/tv/${id}`, {
    language: "es-ES",
    append_to_response: "external_ids",
  });

  const allSeasons = Array.isArray(show.seasons) ? show.seasons : [];
  const imdbId = show?.external_ids?.imdb_id || null;
  const useOmdb = Boolean(imdbId && OMDB_API_KEY);

  const seasons = allSeasons
    .filter((s) => {
      if (!s) return false;
      if (excludeSpecials && s.season_number === 0) return false;
      if (!s.episode_count || s.episode_count <= 0) return false;
      return true;
    })
    .sort((a, b) => a.season_number - b.season_number);

  console.log(
    `[Ratings API] Serie ${id}: Pre-escaneando estructura de OMDb...`,
  );
  const omdbData = useOmdb
    ? await buildOmdbEpisodeMap(imdbId, 10)
    : { map: new Map(), seasons: [] };

  if (omdbData.seasons.length > 0) {
    console.log(
      `[Ratings API] Serie ${id}: Detectadas ${omdbData.seasons.length} temporadas en OMDb con ${omdbData.map.size} episodios totales`,
    );
  }

  const seasonFactories = seasons.map((seasonMeta) => async () => {
    try {
      const seasonDetail = await tmdbFetch(
        `/tv/${id}/season/${seasonMeta.season_number}`,
        { language: "es-ES" },
      );

      const tmdbEpisodes = Array.isArray(seasonDetail.episodes)
        ? seasonDetail.episodes
        : [];

      const mappedEpisodes = tmdbEpisodes
        .filter((ep) => ep && typeof ep.episode_number === "number")
        .sort((a, b) => a.episode_number - b.episode_number)
        .map((ep) => {
          const tmdbRating =
            typeof ep.vote_average === "number" ? ep.vote_average : null;
          const tmdbVotes =
            typeof ep.vote_count === "number" ? ep.vote_count : null;

          const absoluteEpNumber = calculateAbsoluteEpisodeNumber(
            seasonMeta.season_number,
            ep.episode_number,
            seasons,
          );

          const omdbEntry = omdbData.map.get(absoluteEpNumber) || null;
          const imdbRating = omdbEntry?.rating || null;
          const imdbVotes = omdbEntry?.votes || null;

          const display = imdbRating ?? tmdbRating ?? null;
          const source =
            imdbRating != null ? "imdb" : tmdbRating != null ? "tmdb" : null;

          const values = [imdbRating, tmdbRating].filter(
            (v) => typeof v === "number",
          );
          const avg =
            values.length > 0
              ? Number(
                  (values.reduce((a, b) => a + b, 0) / values.length).toFixed(
                    1,
                  ),
                )
              : null;

          return {
            episodeNumber: ep.episode_number,
            name:
              ep.name || omdbEntry?.title || `Episodio ${ep.episode_number}`,
            airDate: ep.air_date || null,
            tmdb: tmdbRating,
            tmdbVotes,
            imdb: imdbRating,
            imdbVotes,
            display,
            source,
            avg,
            _debug: useOmdb
              ? {
                  absoluteNumber: absoluteEpNumber,
                  omdbSeason: omdbEntry?.season || null,
                  omdbEpisode: omdbEntry?.episode || null,
                }
              : null,
          };
        });

      const hasAnyRating = mappedEpisodes.some(
        (ep) => typeof ep.imdb === "number" || typeof ep.tmdb === "number",
      );

      if (!mappedEpisodes.length || !hasAnyRating) return null;

      return {
        seasonNumber: seasonMeta.season_number,
        name: seasonMeta.name || `Temporada ${seasonMeta.season_number}`,
        episodeCount: seasonMeta.episode_count || mappedEpisodes.length,
        episodes: mappedEpisodes,
      };
    } catch (e) {
      console.error(
        `Error cargando temporada ${seasonMeta.season_number} de ${id}:`,
        e,
      );
      return null;
    }
  });

  const seasonsWithEpisodesRaw = await runBatched(seasonFactories, 4);
  const seasonsWithEpisodes = seasonsWithEpisodesRaw.filter(Boolean);

  const totalEpisodes = seasonsWithEpisodes.reduce(
    (acc, s) => acc + (s.episodeCount || 0),
    0,
  );

  return {
    summary: {
      seasons: seasonsWithEpisodes.length,
      totalEpisodes,
      sources: ["imdb", "tmdb", "avg"],
      cacheTtlDays: 30,
    },
    seasons: seasonsWithEpisodes,
  };
}
