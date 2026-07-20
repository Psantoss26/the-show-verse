import { normalizeText } from "./resolve.js";

function titleFor(result, mediaType) {
  return mediaType === "tv"
    ? result?.name || result?.original_name
    : result?.title || result?.original_title;
}

export function pickTmdbResult(results, query, mediaType, { exactOnly = false } = {}) {
  const candidates = Array.isArray(results) ? results.filter((item) => item?.id) : [];
  if (!candidates.length) return null;

  const normalizedQuery = normalizeText(query);
  const exact = candidates.find(
    (item) =>
      normalizeText(titleFor(item, mediaType)) === normalizedQuery ||
      normalizeText(item?.original_title || item?.original_name) ===
        normalizedQuery,
  );

  return exact || (exactOnly ? null : candidates[0]);
}

function isExactTitle(entity, query, mediaType) {
  if (!entity) return false;
  const q = normalizeText(query);
  return (
    normalizeText(titleFor(entity, mediaType)) === q ||
    normalizeText(entity?.original_title || entity?.original_name) === q
  );
}

// Nombres de episodio GENÉRICOS que se repiten entre temporadas ("Piloto",
// "Final", "Parte 2", "Capítulo 3"…). Nunca valen para un match por INCLUSIÓN
// (señalarían una temporada equivocada); solo por igualdad exacta y, aun así,
// idealmente con la temporada ya acotada. Se compara sobre texto NORMALIZADO
// (minúsculas, sin acentos).
const GENERIC_EPISODE_RE =
  /^(?:piloto|pilot|finale?|final|el final|season finale|final de temporada|(?:parte|part|capitulo|chapter|episodio|episode|ep)\s*\d{1,3})$/;

export function isGenericEpisodeName(name) {
  const q = normalizeText(name);
  return !q || GENERIC_EPISODE_RE.test(q);
}

// ¿`a` y `b` (normalizados) casan por inclusión de forma FIABLE? Exige longitud
// mínima 6 en ambos y que ninguno sea un nombre genérico: con el umbral antiguo
// (4) nombres como "Piloto" o "Final" casaban con el episodio equivocado.
function reliableInclusion(a, b) {
  if (!a || !b || a.length < 6 || b.length < 6) return false;
  if (GENERIC_EPISODE_RE.test(a) || GENERIC_EPISODE_RE.test(b)) return false;
  return a.includes(b) || b.includes(a);
}

// Encuentra {season, episode} comparando el nombre del episodio detectado
// (Media Session / selector) con la lista de episodios de TMDb (normalizada).
// Pura y testeable: recibe los episodios ya obtenidos, sin red.
export function matchEpisodeByName({ episodeName, seasonEpisodes }) {
  if (!episodeName || !Array.isArray(seasonEpisodes)) return null;
  const q = normalizeText(episodeName);
  if (!q || q.length < 2) return null;
  // 1. Coincidencia exacta del nombre normalizado.
  let hit = seasonEpisodes.find((e) => normalizeText(e?.name) === q);
  // 2. Uno contiene al otro (endurecido): cubre títulos parciales o con prefijo
  //    distinto ("El proyecto Nina" ⊂ "Capítulo cinco: El proyecto Nina").
  if (!hit) {
    hit = seasonEpisodes.find((e) => reliableInclusion(normalizeText(e?.name), q));
  }
  return hit
    ? { season: hit.season_number, episode: hit.episode_number }
    : null;
}

// Candidatos de episodio en un CONJUNTO de episodios de varias temporadas,
// separados por calidad del match ({exact, partial}), sin duplicados por T/E.
// Permite al llamante detectar AMBIGÜEDAD (mismo nombre en varias temporadas) y
// preferir no fijar nada antes que fijar la temporada equivocada. Pura.
export function matchEpisodeCandidates({ episodeName, seasonEpisodes }) {
  const out = { exact: [], partial: [] };
  if (!episodeName || !Array.isArray(seasonEpisodes)) return out;
  const q = normalizeText(episodeName);
  if (!q || q.length < 2) return out;
  // Dos pasadas: primero los EXACTOS y después los parciales, para que un mismo
  // episodio presente en dos idiomas (es+en concatenados) no quede como "parcial"
  // por casar antes en el idioma equivocado.
  const seen = new Set();
  for (const e of seasonEpisodes) {
    const n = normalizeText(e?.name);
    if (!n || n !== q) continue;
    const key = `${e.season_number}:${e.episode_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.exact.push({ season: e.season_number, episode: e.episode_number });
  }
  for (const e of seasonEpisodes) {
    const n = normalizeText(e?.name);
    if (!n) continue;
    const key = `${e.season_number}:${e.episode_number}`;
    if (seen.has(key)) continue;
    if (reliableInclusion(n, q)) {
      seen.add(key);
      out.partial.push({ season: e.season_number, episode: e.episode_number });
    }
  }
  return out;
}

// Nivel de confianza de una resolución.
//   - episodio por número/nombre + título exacto  → high
//   - episodio por número/nombre sin título exacto → medium
//   - episodio por heurística                      → medium
//   - sin episodio (nivel serie)                   → low
export function scoreConfidence({ exactTitle, episodeSource }) {
  if (episodeSource === "number" || episodeSource === "name") {
    return exactTitle ? "high" : "medium";
  }
  if (episodeSource === "heuristic") return "medium";
  return "low";
}

export async function searchTmdbCandidatesWithFallback({
  mediaType,
  backendSearch,
  directSearch,
}) {
  const backendResults = await backendSearch(mediaType).catch(() => []);
  if (Array.isArray(backendResults) && backendResults.length > 0) {
    return backendResults;
  }

  const directResults = await directSearch(mediaType).catch(() => []);
  return Array.isArray(directResults) ? directResults : [];
}

export async function resolveStreamingEntity({
  query,
  expectedMediaType = null,
  preferTv = false,
  search,
}) {
  // Nivel serie (sin episodio conocido): confianza baja, pero SÍ se registra
  // (fallback show-level) en vez de descartarse.
  const showLevel = (entity) => ({
    kind: "show_level",
    mediaType: "tv",
    entity,
    confidence: "low",
  });

  if (expectedMediaType === "tv") {
    const results = await search("tv");
    const entity = pickTmdbResult(results, query, "tv");
    if (!entity) return null;
    // El episodio viene por número (el llamador ya lo parseó) → alta si exacto.
    return {
      kind: "resolved",
      mediaType: "tv",
      entity,
      confidence: scoreConfidence({
        exactTitle: isExactTitle(entity, query, "tv"),
        episodeSource: "number",
      }),
    };
  }

  const [movieResults, tvResults] = await Promise.all([
    search("movie"),
    search("tv"),
  ]);
  const exactMovie = pickTmdbResult(movieResults, query, "movie", {
    exactOnly: true,
  });
  const exactShow = pickTmdbResult(tvResults, query, "tv", {
    exactOnly: true,
  });

  if (preferTv && (exactShow || (!exactMovie && tvResults.length > 0))) {
    return showLevel(exactShow || pickTmdbResult(tvResults, query, "tv"));
  }

  // Coincidencia EXACTA como serie Y como película (p. ej. "Stranger Things"
  // existe de ambas): elegimos la más POPULAR, que es casi siempre la buscada.
  // Clave para el modo resolveOnly (ficha), donde no hay pista de tipo.
  if (exactShow && exactMovie) {
    const showPop = Number(exactShow.popularity) || 0;
    const moviePop = Number(exactMovie.popularity) || 0;
    return showPop >= moviePop
      ? showLevel(exactShow)
      : { kind: "resolved", mediaType: "movie", entity: exactMovie, confidence: "high" };
  }

  if (exactShow && !exactMovie) {
    return showLevel(exactShow);
  }

  if (exactMovie) {
    return {
      kind: "resolved",
      mediaType: "movie",
      entity: exactMovie,
      confidence: "high",
    };
  }

  if (exactShow) {
    return showLevel(exactShow);
  }

  const movie = pickTmdbResult(movieResults, query, "movie");
  const show = pickTmdbResult(tvResults, query, "tv");
  const asMovie = () => ({
    kind: "resolved",
    mediaType: "movie",
    entity: movie,
    confidence: isExactTitle(movie, query, "movie") ? "high" : "medium",
  });

  // Sin coincidencia exacta: si hay candidato de película Y de serie, elegir por
  // POPULARIDAD (evita coger una peli irrelevante en vez de una serie muy popular,
  // p. ej. "Hunter x Hunter" → la película "Hunter X" en vez del anime).
  if (movie && show) {
    const showPop = Number(show.popularity) || 0;
    const moviePop = Number(movie.popularity) || 0;
    return showPop > moviePop ? showLevel(show) : asMovie();
  }
  if (movie) return asMovie();
  return show ? showLevel(show) : null;
}
