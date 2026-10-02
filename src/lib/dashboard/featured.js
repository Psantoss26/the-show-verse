// Shared FeaturedHero curation for the home, movies, and series dashboards.
//
// QUÉ ENSEÑA EL HERO
// Solo títulos RECONOCIDOS, en dos grupos que se mezclan:
//   - ESTRENOS: menos de 2 años desde su estreno, ya estrenados, con mucha
//     popularidad actual en TMDb (lo que "suena" ahora). Pesa la demanda.
//   - ASENTADOS: de 2 a 20 años, con muchísimos votos y buena nota (lo más
//     recomendable de las dos últimas décadas). Pesan la calidad y los votos.
// Cada grupo tiene un SUELO DE NOTORIEDAD (votos mínimos, nota mínima y, en
// estrenos, popularidad mínima): un título poco conocido no entra aunque esté
// en tendencia o tenga muy buena nota. Es preferible un hero corto a uno con
// títulos que nadie reconoce.
//
// La lista se reparte ~4 estrenos por cada 6 asentados, intercalados de forma
// uniforme TAMBIÉN en la reserva, para que la mezcla se mantenga cuando el
// cliente sustituye los títulos que el usuario ya ha visto (featuredPersonalize).

const FEATURED_SOURCE_WEIGHTS = {
  trendingMovies: 0.55,
  trendingTV: 0.55,
  recentMovies: 0.45,
  recentTV: 0.45,
  popularMovies: 0.28,
  popularTV: 0.28,
  recognizedMovies: 0.44,
  recognizedTV: 0.44,
  awarded: 0.34,
};

const DEMAND_SOURCES = new Set([
  "trendingMovies",
  "trendingTV",
  "recentMovies",
  "recentTV",
  "popularMovies",
  "popularTV",
]);

// Títulos que muestra el hero y candidatos de reserva que viajan con ellos para
// sustituir en el cliente a los que el usuario ya ha visto o puntuado.
export const FEATURED_HERO_SIZE = 10;
export const FEATURED_HERO_RESERVE = 30;

// Proporción de estrenos en la mezcla (4 de cada 10).
const FEATURED_RECENT_SHARE = 0.4;

const FEATURED_ROTATION_WINDOW_MS = 30 * 60 * 1000;
const FEATURED_ROTATION_POOL_MULTIPLIER = 3;
const FEATURED_ROTATION_JITTER = 0.32;

// Ventana total: nada anterior a los últimos 20 años.
const FEATURED_MAX_AGE_YEARS = 20;
// Por debajo de esto un título es un ESTRENO.
const FEATURED_RECENT_YEARS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365.25 * DAY_MS;

// SUELOS DE NOTORIEDAD. Las series acumulan menos votos que las películas en
// TMDb, y un estreno aún no ha tenido tiempo de acumularlos: por eso el mínimo
// de un estreno CRECE con los meses que lleva en cartel (una película de hace
// dos semanas con 300 votos y mucha popularidad sí es un estreno importante;
// una de hace un año con 300 votos, no).
const NOTABILITY = {
  movie: {
    established: { minVotes: 4000, minRating: 7.0 },
    recent: { baseVotes: 200, votesPerMonth: 80, maxVotes: 1200, minRating: 6.8, minPopularity: 60 },
  },
  tv: {
    established: { minVotes: 2500, minRating: 7.3 },
    recent: { baseVotes: 100, votesPerMonth: 30, maxVotes: 500, minRating: 7.0, minPopularity: 60 },
  },
};

// Series que no son una recomendación destacada aunque tengan votos:
// infantil, noticias, reality, telenovela diaria y tertulias.
const TV_EXCLUDED_GENRES = new Set([10762, 10763, 10764, 10766, 10767]);

const normalize01 = (value, max) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n / max);
};

const logScore = (value, maxLog = 5) =>
  Math.min(1, Math.log10(Number(value || 0) + 1) / maxLog);

function stableNoise(value) {
  const input = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function getReleaseDate(item) {
  const raw = item?.release_date || item?.first_air_date || "";
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export function getMediaKey(item, fallbackType = "movie") {
  if (!item?.id) return null;
  const type =
    item.media_type === "tv" ||
    fallbackType === "tv" ||
    (item.name && !item.title) ||
    item.first_air_date
      ? "tv"
      : "movie";
  return `${type}:${item.id}`;
}

function inferMediaType(item, fallbackType = "movie") {
  return getMediaKey(item, fallbackType)?.split(":")[0] || fallbackType;
}

export function getFeaturedTitleKey(item) {
  const title =
    item?.title || item?.name || item?.original_title || item?.original_name || "";

  return title
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getFeaturedExclusionKeys(items = []) {
  const mediaKeys = new Set();
  const titleKeys = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    const key = getMediaKey(item, item?.media_type || "movie");
    const titleKey = getFeaturedTitleKey(item);
    if (key) mediaKeys.add(key);
    if (titleKey) titleKeys.add(titleKey);
  }

  return { mediaKeys, titleKeys };
}

/**
 * Clasifica un candidato: "recent", "established" o null si no es lo bastante
 * conocido (o está fuera de la ventana, o aún no se ha estrenado).
 */
export function classifyFeaturedCandidate(item, now = Date.now()) {
  const released = getReleaseDate(item);
  if (!released || released > now) return null;
  const years = (now - released) / YEAR_MS;
  if (years > FEATURED_MAX_AGE_YEARS) return null;

  if (
    item?.media_type === "tv" &&
    (item.genre_ids || []).some((genre) => TV_EXCLUDED_GENRES.has(genre))
  ) {
    return null;
  }

  const rules = NOTABILITY[item?.media_type === "tv" ? "tv" : "movie"];
  const votes = Number(item?.vote_count || 0);
  const rating = Number(item?.vote_average || 0);
  const popularity = Number(item?.popularity || 0);

  if (years < FEATURED_RECENT_YEARS) {
    const r = rules.recent;
    const months = years * 12;
    const minVotes = Math.min(r.maxVotes, r.baseVotes + r.votesPerMonth * months);
    const hasDemandSource = Object.keys(item?.__featuredSources || {}).some((s) =>
      DEMAND_SOURCES.has(s),
    );
    if (
      hasDemandSource &&
      votes >= minVotes &&
      rating >= r.minRating &&
      popularity >= r.minPopularity
    ) {
      return "recent";
    }
    return null;
  }

  const e = rules.established;
  return votes >= e.minVotes && rating >= e.minRating ? "established" : null;
}

function sourceScoreOf(item) {
  return Object.values(item.__featuredSources || {}).reduce((sum, source) => {
    const rankBonus = Math.max(0, 1 - (Number(source.rank || 1) - 1) / 20);
    return sum + Number(source.weight || 0) * (0.72 + rankBonus * 0.28);
  }, 0);
}

function bayesianQuality(item, priorVotes) {
  const voteAverage = Number(item?.vote_average || 0);
  const voteCount = Number(item?.vote_count || 0);
  if (voteCount <= 0) return 0;
  const rating =
    (voteCount / (voteCount + priorVotes)) * voteAverage +
    (priorVotes / (voteCount + priorVotes)) * 7;
  return normalize01(rating, 10);
}

// Estrenos: manda lo que suena AHORA (popularidad y tendencia), con la nota
// como desempate de calidad.
function recentScore(item) {
  return (
    logScore(item.popularity, 3) * 1.5 +
    bayesianQuality(item, 300) * 1.0 +
    logScore(item.vote_count, 4) * 0.5 +
    sourceScoreOf(item)
  );
}

// Asentados: manda la calidad respaldada por MUCHOS votos; la popularidad
// actual solo desempata para no rescatar títulos que ya nadie ve.
function establishedScore(item) {
  return (
    bayesianQuality(item, 3000) * 1.5 +
    logScore(item.vote_count, 5) * 1.0 +
    logScore(item.popularity, 3) * 0.5 +
    sourceScoreOf(item)
  );
}

// Rota dentro de la parte alta del ranking: el desempate determinista cambia
// cada 30 minutos pero es estable entre recargas, y nunca deja entrar títulos
// fuera de la parte alta.
function rotateTop(ranked, windowSize, rotationBucket) {
  const top = ranked.slice(0, windowSize)
    .map(({ item, score }) => ({
      item,
      rotated:
        score +
        stableNoise(`${rotationBucket}:${item.__featuredKey}`) * FEATURED_ROTATION_JITTER,
    }))
    .sort((a, b) => b.rotated - a.rotated)
    .map(({ item }) => item);
  return [...top, ...ranked.slice(windowSize).map(({ item }) => item)];
}

// ¿La posición `index` de la lista le toca a un estreno? Reparte la cuota de
// forma uniforme (con 0.4: posiciones 2, 4, 7, 9 de cada 10).
function isRecentSlot(index, share) {
  return Math.floor((index + 1) * share) > Math.floor(index * share);
}

export function buildFeatured(
  {
    trendingMovies = [],
    trendingTV = [],
    recentMovies = [],
    recentTV = [],
    popularMovies = [],
    popularTV = [],
    recognizedMovies = [],
    recognizedTV = [],
    awarded = [],
  } = {},
  {
    size = FEATURED_HERO_SIZE,
    // Candidatos de RESERVA tras la selección: el cliente los usa para cubrir
    // los huecos de los títulos que el usuario ya ha visto o puntuado (ver
    // featuredPersonalize.js). El resultado mide `size + reserve`; los
    // `size` primeros son la selección normal y no dependen de `reserve`.
    reserve = 0,
    mediaTypes = ["movie", "tv"],
    excludeMediaKeys = new Set(),
    excludeTitleKeys = new Set(),
    rotationBucket = Math.floor(Date.now() / FEATURED_ROTATION_WINDOW_MS),
    now = Date.now(),
  } = {},
) {
  const allowedTypes = new Set(mediaTypes);
  const pool = new Map();
  const addAll = (list, mediaType, source) => {
    for (const [index, raw] of (Array.isArray(list) ? list : []).entries()) {
      if (!raw?.id) continue;
      if (!raw.backdrop_path) continue;

      const type = inferMediaType(raw, mediaType);
      if (!allowedTypes.has(type)) continue;

      const key = getMediaKey(raw, mediaType);
      const titleKey = getFeaturedTitleKey(raw);
      if (!key) continue;
      if (excludeMediaKeys.has(key) || (titleKey && excludeTitleKeys.has(titleKey))) {
        continue;
      }

      const current = pool.get(key);
      const previousRank = current?.__featuredSources?.[source]?.rank;
      pool.set(key, {
        ...(current || {}),
        ...raw,
        media_type: type,
        __featuredKey: key,
        __featuredSources: {
          ...(current?.__featuredSources || {}),
          [source]: {
            rank: previousRank ? Math.min(previousRank, index + 1) : index + 1,
            weight: FEATURED_SOURCE_WEIGHTS[source] || 0,
          },
        },
      });
    }
  };

  addAll(trendingMovies, "movie", "trendingMovies");
  addAll(trendingTV, "tv", "trendingTV");
  addAll(recentMovies, "movie", "recentMovies");
  addAll(recentTV, "tv", "recentTV");
  addAll(popularMovies, "movie", "popularMovies");
  addAll(popularTV, "tv", "popularTV");
  addAll(recognizedMovies, "movie", "recognizedMovies");
  addAll(recognizedTV, "tv", "recognizedTV");
  addAll(awarded, "movie", "awarded");

  const recentRanked = [];
  const establishedRanked = [];
  for (const item of pool.values()) {
    const kind = classifyFeaturedCandidate(item, now);
    if (kind === "recent") recentRanked.push({ item, score: recentScore(item) });
    else if (kind === "established") establishedRanked.push({ item, score: establishedScore(item) });
  }
  recentRanked.sort((a, b) => b.score - a.score);
  establishedRanked.sort((a, b) => b.score - a.score);

  const total = size + Math.max(0, reserve);
  const recentShare = FEATURED_RECENT_SHARE;
  const recentWindow = Math.max(1, Math.ceil(size * recentShare)) * FEATURED_ROTATION_POOL_MULTIPLIER;
  const establishedWindow = Math.max(1, size - Math.ceil(size * recentShare)) * FEATURED_ROTATION_POOL_MULTIPLIER;
  const queues = {
    recent: rotateTop(recentRanked, recentWindow, rotationBucket),
    established: rotateTop(establishedRanked, establishedWindow, rotationBucket),
  };

  // Variedad por bloques del tamaño del hero: como mucho ~65% de un tipo (en
  // Inicio) y 3 títulos del mismo género principal por bloque. Son topes
  // BLANDOS: si no hay otra cosa, se relajan antes que dejar huecos.
  const maxPerType = mediaTypes.length > 1 ? Math.ceil(size * 0.65) : size;
  const result = [];
  const taken = new Set();
  let blockTypes = { movie: 0, tv: 0 };
  let blockGenres = new Map();

  const fits = (item, strict) => {
    if (taken.has(item.__featuredKey)) return false;
    if (!strict) return true;
    if (blockTypes[item.media_type] >= maxPerType) return false;
    const genre = Array.isArray(item.genre_ids) ? item.genre_ids[0] : null;
    return !(genre && (blockGenres.get(genre) || 0) >= 3);
  };
  const takeFrom = (queue, strict) => {
    const index = queue.findIndex((item) => fits(item, strict));
    if (index < 0) return null;
    const [item] = queue.splice(index, 1);
    return item;
  };

  for (let index = 0; index < total; index += 1) {
    if (index % size === 0) {
      blockTypes = { movie: 0, tv: 0 };
      blockGenres = new Map();
    }
    const preferred = isRecentSlot(index % size, recentShare) ? "recent" : "established";
    const other = preferred === "recent" ? "established" : "recent";
    const item =
      takeFrom(queues[preferred], true) ||
      takeFrom(queues[other], true) ||
      takeFrom(queues[preferred], false) ||
      takeFrom(queues[other], false);
    if (!item) break;

    taken.add(item.__featuredKey);
    result.push(item);
    blockTypes[item.media_type] += 1;
    const genre = Array.isArray(item.genre_ids) ? item.genre_ids[0] : null;
    if (genre) blockGenres.set(genre, (blockGenres.get(genre) || 0) + 1);
  }

  // El primer título visible cambia con la rotación (solo dentro de la
  // selección; la reserva conserva su orden).
  const selected = result.slice(0, size);
  const startIndex = selected.length
    ? Math.abs(Number(rotationBucket) || 0) % selected.length
    : 0;
  const ordered = [
    ...selected.slice(startIndex),
    ...selected.slice(0, startIndex),
    ...result.slice(size),
  ];

  return ordered.map((item) => {
    const cleanItem = { ...item };
    delete cleanItem.__featuredKey;
    delete cleanItem.__featuredSources;
    return cleanItem;
  });
}
