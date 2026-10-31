// /src/lib/details/recommendationRanking.js
// Recomendaciones de la ficha (DetailsClient, DetailModal y su vista lateral).
//
// TMDb solo da 20 recomendaciones por página y su orden es pobre: para Origen
// abre con Paycheck y Push, y en la lista entran títulos sin póster, sin
// estrenar o con un puñado de votos. Aquí se juntan dos fuentes:
//
//   - `related`: los títulos relacionados de Trakt (ya convertidos a la forma
//     de TMDb). Es la fuente más fiable y manda en la relevancia.
//   - `recommendationPages`: las dos primeras páginas de `/recommendations` de
//     TMDb, que rellenan y sirven de respaldo si Trakt no responde.
//
// y se ordena con un criterio propio:
//
//   - Relevancia: la posición en cada fuente (Trakt pesa más) y estar en las
//     dos.
//   - Calidad: nota bayesiana, que no deja que un 9,0 con 12 votos supere a un
//     8,2 con 20.000.
//
// Se descartan el propio título, los de adultos, los que no tienen póster, los
// que aún no se han estrenado y los de muy pocos votos (salvo que sin ellos no
// se llegue a un mínimo de títulos).

export const RECOMMENDATIONS_LIMIT = 40;
const MIN_VOTES = 40;
const MIN_RESULTS_BEFORE_RELAXING = 12;
// Nota bayesiana: media general y votos "previos" de TMDb.
const PRIOR_MEAN = 6.4;
const PRIOR_VOTES = 250;
const RELEVANCE_WEIGHT = 0.6;
const QUALITY_WEIGHT = 0.4;
// La relevancia de TMDb cuenta menos que la de Trakt.
const TMDB_RELEVANCE_FACTOR = 0.75;
const BOTH_SOURCES_BONUS = 0.15;

function releaseDateOf(item) {
  return item?.release_date || item?.first_air_date || "";
}

function bayesianRating(item) {
  const votes = Math.max(0, Number(item?.vote_count) || 0);
  const average = Number(item?.vote_average) || 0;
  return (votes * average + PRIOR_VOTES * PRIOR_MEAN) / (votes + PRIOR_VOTES);
}

function isReleased(item, today) {
  const date = releaseDateOf(item);
  // Sin fecha conocida no se puede saber: se trata como no estrenado.
  return Boolean(date) && date <= today;
}

/**
 * @param {object}   input
 * @param {Array}    [input.related]              Relacionados de Trakt (forma de TMDb), en orden.
 * @param {Array[]}  [input.recommendationPages]  Páginas de `/recommendations` de TMDb, en orden.
 * @param {string}   input.type                   "movie" | "tv" del título de la ficha.
 * @param {number|string} [input.selfId]          Id del título de la ficha.
 * @param {string}   [input.today]                "YYYY-MM-DD" (por defecto, hoy).
 * @param {number}   [input.limit]
 */
export function rankRecommendations({
  related = [],
  recommendationPages = [],
  type,
  selfId = null,
  today = new Date().toISOString().slice(0, 10),
  limit = RECOMMENDATIONS_LIMIT,
} = {}) {
  const candidates = new Map();
  const selfKey = selfId != null ? `${type}:${selfId}` : null;

  const add = (item, source, position) => {
    if (!item?.id) return;
    const mediaType =
      item.media_type === "movie" || item.media_type === "tv"
        ? item.media_type
        : type;
    const key = `${mediaType}:${item.id}`;
    if (key === selfKey) return;
    const existing = candidates.get(key);
    if (existing) {
      if (existing[source] == null) existing[source] = position;
      return;
    }
    candidates.set(key, {
      item: { ...item, media_type: mediaType },
      trakt: source === "trakt" ? position : null,
      tmdb: source === "tmdb" ? position : null,
    });
  };

  const relatedList = Array.isArray(related) ? related : [];
  relatedList.forEach((item, index) => add(item, "trakt", index));
  let tmdbCount = 0;
  for (const page of recommendationPages) {
    for (const item of Array.isArray(page) ? page : []) {
      add(item, "tmdb", tmdbCount);
      tmdbCount += 1;
    }
  }

  const eligible = [...candidates.values()].filter(
    ({ item }) => !item.adult && item.poster_path && isReleased(item, today),
  );
  const voted = eligible.filter(
    ({ item }) => (Number(item.vote_count) || 0) >= MIN_VOTES,
  );
  // Títulos de nicho: si con el mínimo de votos se quedan muy pocos, entran
  // también los de menos votos (la nota bayesiana ya los deja atrás).
  const pool = voted.length >= MIN_RESULTS_BEFORE_RELAXING ? voted : eligible;

  if (!pool.length) return [];

  const traktTotal = Math.max(relatedList.length, 1);
  const tmdbTotal = Math.max(tmdbCount, 1);
  const ratings = pool.map(({ item }) => bayesianRating(item));
  const minRating = Math.min(...ratings);
  const ratingSpan = Math.max(...ratings) - minRating || 1;

  const relevanceOf = (entry) => {
    const fromTrakt = entry.trakt != null ? 1 - entry.trakt / traktTotal : 0;
    const fromTmdb =
      entry.tmdb != null
        ? TMDB_RELEVANCE_FACTOR * (1 - entry.tmdb / tmdbTotal)
        : 0;
    const bonus =
      entry.trakt != null && entry.tmdb != null ? BOTH_SOURCES_BONUS : 0;
    return Math.max(fromTrakt, fromTmdb) + bonus;
  };

  return pool
    .map((entry, index) => ({
      entry,
      relevance: relevanceOf(entry),
      score:
        RELEVANCE_WEIGHT * relevanceOf(entry) +
        QUALITY_WEIGHT * ((ratings[index] - minRating) / ratingSpan),
    }))
    .sort((a, b) => b.score - a.score || b.relevance - a.relevance)
    .slice(0, limit)
    .map(({ entry }) => entry.item);
}
