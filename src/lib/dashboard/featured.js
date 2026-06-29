// Shared FeaturedHero curation for the home, movies, and series dashboards.

const FEATURED_SOURCE_WEIGHTS = {
  trendingMovies: 0.55,
  trendingTV: 0.55,
  popularMovies: 0.28,
  popularTV: 0.28,
  recognizedMovies: 0.44,
  recognizedTV: 0.44,
  awarded: 0.34,
};

const FEATURED_ROTATION_WINDOW_MS = 30 * 60 * 1000;
const FEATURED_ROTATION_POOL_MULTIPLIER = 3;
const FEATURED_ROTATION_JITTER = 0.32;

// Recomendaciones del hero: "de los últimos 20 años como mucho". Lo anterior se
// descarta del pool, y dentro de la ventana penalizamos los estrenos muy
// recientes (este año / el último año largo) para favorecer títulos asentados,
// populares y bien valorados de las dos últimas décadas.
const FEATURED_MAX_AGE_YEARS = 20;
// Un título cuenta como "reciente" (sujeto a penalización y a un tope de cuántos
// pueden aparecer) si tiene menos de este nº de años.
const FEATURED_RECENT_YEARS = 1.5;

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

function yearsSinceRelease(item) {
  const time = getReleaseDate(item);
  if (!time) return 20;
  return Math.max(0, (Date.now() - time) / (365.25 * 24 * 60 * 60 * 1000));
}

const isRecentRelease = (item) =>
  yearsSinceRelease(item) < FEATURED_RECENT_YEARS;

// Perfil de "madurez" para el hero: en lugar de premiar lo recién estrenado,
// penaliza este año y el último año largo, da la máxima puntuación a la franja
// asentada (~1,5–12 años) y decae suavemente hasta el límite de 20 años.
function maturityScore(item) {
  const years = yearsSinceRelease(item);
  if (years > FEATURED_MAX_AGE_YEARS) return 0; // fuera de ventana (se filtra)
  if (years < 0.5) return 0.12; // este año / recién estrenado: muy poco
  if (years < FEATURED_RECENT_YEARS) return 0.4; // último año largo: penalizado
  if (years <= 12) return 1; // franja óptima
  return Math.max(0.55, 1 - (years - 12) / 18); // 12–20 años: decae suave
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

function normalizeFeaturedItem(raw, mediaType) {
  const type = inferMediaType(raw, mediaType);
  return {
    ...raw,
    media_type: type,
  };
}

export function getFeaturedTitleKey(item) {
  const title =
    item?.title || item?.name || item?.original_title || item?.original_name || "";

  return title
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

// Mixes current demand, broad recognition, and awards. It intentionally avoids
// top-rated lists so the hero does not duplicate the first ranked sections.
export function buildFeatured(
  {
    trendingMovies = [],
    trendingTV = [],
    popularMovies = [],
    popularTV = [],
    recognizedMovies = [],
    recognizedTV = [],
    awarded = [],
  } = {},
  {
    size = 10,
    mediaTypes = ["movie", "tv"],
    excludeMediaKeys = new Set(),
    excludeTitleKeys = new Set(),
    rotationBucket = Math.floor(Date.now() / FEATURED_ROTATION_WINDOW_MS),
  } = {},
) {
  const allowedTypes = new Set(mediaTypes);
  const pool = new Map();
  const addAll = (list, mediaType, source) => {
    for (const [index, raw] of (Array.isArray(list) ? list : []).entries()) {
      if (!raw?.id) continue;
      if (!raw.backdrop_path) continue;

      const item = normalizeFeaturedItem(raw, mediaType);
      if (!allowedTypes.has(item.media_type)) continue;

      const key = getMediaKey(item, mediaType);
      const titleKey = getFeaturedTitleKey(item);
      if (!key) continue;
      if (excludeMediaKeys.has(key) || (titleKey && excludeTitleKeys.has(titleKey))) {
        continue;
      }

      const current = pool.get(key);
      const sources = {
        ...(current?.__featuredSources || {}),
        [source]: {
          rank: index + 1,
          weight: FEATURED_SOURCE_WEIGHTS[source] || 0,
        },
      };

      pool.set(key, {
        ...(current || {}),
        ...item,
        media_type: item.media_type,
        __featuredKey: key,
        __featuredSources: sources,
      });
    }
  };

  addAll(trendingMovies, "movie", "trendingMovies");
  addAll(trendingTV, "tv", "trendingTV");
  addAll(popularMovies, "movie", "popularMovies");
  addAll(popularTV, "tv", "popularTV");
  addAll(recognizedMovies, "movie", "recognizedMovies");
  addAll(recognizedTV, "tv", "recognizedTV");
  addAll(awarded, "movie", "awarded");

  const scoreOf = (m) => {
    const voteAverage = Number(m?.vote_average || 0);
    const voteCount = Number(m?.vote_count || 0);
    const popularity = Number(m?.popularity || 0);
    const bayesianRating =
      voteCount > 0
        ? (voteCount / (voteCount + 1200)) * voteAverage +
          (1200 / (voteCount + 1200)) * 7
        : 0;
    const quality = normalize01(bayesianRating, 10);
    const confidence = logScore(voteCount, 5);
    const demand = logScore(popularity, 3);
    const maturity = maturityScore(m);
    const sourceScore = Object.values(m.__featuredSources || {}).reduce(
      (sum, source) => {
        const rankBonus = Math.max(0, 1 - (Number(source.rank || 1) - 1) / 20);
        return sum + Number(source.weight || 0) * (0.72 + rankBonus * 0.28);
      },
      0,
    );

    return (
      quality * 1.25 +
      confidence * 0.72 +
      demand * 0.42 +
      maturity * 0.6 +
      sourceScore
    );
  };

  const rankedByRelevance = [...pool.values()]
    .filter((item) => {
      const votes = Number(item?.vote_count || 0);
      const rating = Number(item?.vote_average || 0);
      // Ventana dura: nada anterior a los últimos 20 años.
      if (yearsSinceRelease(item) > FEATURED_MAX_AGE_YEARS) return false;
      const hasDemandSource = Object.keys(item.__featuredSources || {}).some(
        (source) =>
          source.startsWith("trending") ||
          source.startsWith("popular") ||
          source.startsWith("recognized"),
      );
      return rating >= 6.6 && (votes >= 700 || hasDemandSource);
    })
    .map((item) => ({ item, score: scoreOf(item) }))
    .sort((a, b) => b.score - a.score);

  // Solo rotamos dentro de la parte alta del ranking. El pequeño desempate
  // determinista cambia cada 30 minutos, pero mantiene estables los resultados
  // entre recargas y nunca permite entrar a títulos fuera del pool relevante.
  const rotationPoolSize = Math.min(
    rankedByRelevance.length,
    Math.max(size, size * FEATURED_ROTATION_POOL_MULTIPLIER),
  );
  const rotatingPool = rankedByRelevance
    .slice(0, rotationPoolSize)
    .map(({ item, score }) => ({
      item,
      rotatedScore:
        score +
        stableNoise(`${rotationBucket}:${item.__featuredKey}`) *
          FEATURED_ROTATION_JITTER,
    }))
    .sort((a, b) => b.rotatedScore - a.rotatedScore)
    .map(({ item }) => item);
  const ranked = [
    ...rotatingPool,
    ...rankedByRelevance
      .slice(rotationPoolSize)
      .map(({ item }) => item),
  ];

  const result = [];
  const typeCounts = { movie: 0, tv: 0 };
  const genreCounts = new Map();
  const maxPerType = mediaTypes.length > 1 ? Math.ceil(size * 0.65) : size;
  // Tope de estrenos recientes: como mucho ~1 de cada 4 (p. ej. 2-3 de 10), para
  // que el hero no se llene de novedades del año.
  const maxRecent = Math.max(1, Math.round(size * 0.25));
  let recentCount = 0;

  for (const item of ranked) {
    if (result.length >= size) break;
    if (typeCounts[item.media_type] >= maxPerType) continue;

    const recent = isRecentRelease(item);
    if (recent && recentCount >= maxRecent) continue;

    const primaryGenre = Array.isArray(item.genre_ids) ? item.genre_ids[0] : null;
    if (primaryGenre && (genreCounts.get(primaryGenre) || 0) >= 3) continue;

    result.push(item);
    typeCounts[item.media_type] += 1;
    if (recent) recentCount += 1;
    if (primaryGenre) genreCounts.set(primaryGenre, (genreCounts.get(primaryGenre) || 0) + 1);
  }

  if (result.length < size) {
    for (const item of ranked) {
      if (result.length >= size) break;
      if (result.some((selected) => selected.__featuredKey === item.__featuredKey)) {
        continue;
      }
      result.push(item);
    }
  }

  const selected = result.slice(0, size);
  const startIndex = selected.length
    ? Math.abs(Number(rotationBucket) || 0) % selected.length
    : 0;
  const rotatedSelection = [
    ...selected.slice(startIndex),
    ...selected.slice(0, startIndex),
  ];

  return rotatedSelection.map((item) => {
    const cleanItem = { ...item };
    delete cleanItem.__featuredKey;
    delete cleanItem.__featuredSources;
    return cleanItem;
  });
}
