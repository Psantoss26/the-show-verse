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

// Umbrales de "plausibilidad" para no confiar ciegamente en un candidato de
// TMDb cuando el texto de origen (leído del árbol de accesibilidad de la
// ficha, ruidoso por naturaleza: botones, badges, texto de otras secciones…)
// no da un título EXACTO. Sin esto, `pickTmdbResult` sin `exactOnly` devuelve
// el primer resultado de la búsqueda de TMDb aunque no tenga relación real con
// el texto detectado -- causa nº1 de notificaciones de "acceso a ficha" sobre
// títulos irrelevantes.
const MIN_PLAUSIBLE_POPULARITY = 3;
const MIN_PLAUSIBLE_VOTES = 15;

// ¿El título del candidato guarda relación textual real con la consulta (por
// inclusión, ya normalizados)? Evita aceptar un resultado que a TMDb le
// "parece relevante" por búsqueda libre pero no tiene nada que ver con el
// texto detectado en pantalla.
function hasTextualOverlap(entityTitle, query) {
  const a = normalizeText(entityTitle);
  const b = normalizeText(query);
  if (!a || !b || a.length < 3 || b.length < 3) return false;
  return a === b || a.includes(b) || b.includes(a);
}

// ¿Tiene sentido aceptar este candidato como resolución real? Un título EXACTO
// siempre es plausible (máxima confianza posible). Para el resto, exige
// relación textual real con la consulta Y un mínimo reconocimiento en TMDb
// (popularidad o votos): un texto de UI mal filtrado puede "casar" con algo en
// TMDb por relevancia de búsqueda libre, pero rara vez con algo popular Y
// relacionado textualmente a la vez.
export function isPlausibleMatch(entity, query, mediaType) {
  if (!entity) return false;
  if (isExactTitle(entity, query, mediaType)) return true;
  if (!hasTextualOverlap(titleFor(entity, mediaType), query)) return false;
  const popularity = Number(entity.popularity) || 0;
  const voteCount = Number(entity.vote_count) || 0;
  return popularity >= MIN_PLAUSIBLE_POPULARITY || voteCount >= MIN_PLAUSIBLE_VOTES;
}

// Umbral de DURACIÓN real de reproducción para diferenciar película de
// EPISODIO de serie cuando el título coincide EXACTO en ambos tipos (p. ej.
// "X-Men": la película de 2000 Y la serie animada de 1992 se llaman igual).
// La duración real es una señal mucho más fiable que la popularidad de TMDb
// (volátil, no indica qué está viendo el usuario AHORA) para saber si es un
// largometraje o un episodio -- causa del bug donde "X-Men" (película) se
// registraba como la serie por tener esta más popularidad en TMDb ese día.
// Fuera de estos umbrales la duración es concluyente; en la zona intermedia
// (podría ser una película corta o un episodio largo) se mantiene el criterio
// de popularidad como desempate, igual que antes.
const MOVIE_MIN_DURATION_SEC = 70 * 60; // 70 min: casi ningún episodio llega aquí
const EPISODE_MAX_DURATION_SEC = 45 * 60; // 45 min: por debajo, rara vez es largometraje

function decideByDuration(durationSec) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  if (durationSec >= MOVIE_MIN_DURATION_SEC) return "movie";
  if (durationSec <= EPISODE_MAX_DURATION_SEC) return "tv";
  return null;
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
  // Duración real (segundos) de la reproducción en curso, si se conoce. Sirve
  // para desempatar película/serie cuando el título coincide exacto en ambas
  // -- ver `decideByDuration`. Solo disponible durante reproducción real, no
  // al navegar una ficha (resolveOnly): ahí queda `null` y el desempate cae al
  // criterio de popularidad de siempre.
  durationSec = null,
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
    const candidate = exactShow || pickTmdbResult(tvResults, query, "tv");
    // Con pista de serie (episodio/subtítulo) el candidato EXACTO siempre vale;
    // el candidato SIN exactitud (fallback) solo si es plausible -- si no, cae
    // al resto de la función en vez de forzar una serie sin relación real.
    if (isPlausibleMatch(candidate, query, "tv")) {
      return showLevel(candidate);
    }
  }

  // Coincidencia EXACTA como serie Y como película (p. ej. "Stranger Things"
  // existe de ambas, y "X-Men" también: la película de 2000 y la serie
  // animada de 1992). Primero se intenta desempatar por DURACIÓN real de
  // reproducción (mucho más fiable: una peli de 100 min no es un episodio); si
  // no es concluyente (o no hay reproducción, p. ej. resolveOnly), se elige la
  // más POPULAR, que sigue siendo el mejor criterio disponible sin duración.
  if (exactShow && exactMovie) {
    const byDuration = decideByDuration(durationSec);
    if (byDuration === "movie") {
      return { kind: "resolved", mediaType: "movie", entity: exactMovie, confidence: "high" };
    }
    if (byDuration === "tv") {
      return showLevel(exactShow);
    }
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
  // Sin título exacto en ningún lado: exigimos que el candidato tenga relación
  // textual real con la consulta Y un mínimo reconocimiento en TMDb. Sin esto,
  // `pickTmdbResult` sin `exactOnly` devuelve el primer resultado de búsqueda
  // libre de TMDb aunque no tenga nada que ver con el texto detectado --causa
  // de notificaciones de ficha sobre títulos irrelevantes.
  const moviePlausible = isPlausibleMatch(movie, query, "movie");
  const showPlausible = isPlausibleMatch(show, query, "tv");
  const asMovie = () => ({
    kind: "resolved",
    mediaType: "movie",
    entity: movie,
    confidence: isExactTitle(movie, query, "movie") ? "high" : "medium",
  });

  // Candidato plausible de película Y de serie: mismo desempate que arriba
  // (duración real primero, popularidad como respaldo) para no confundir una
  // serie con una película que comparte nombre, p. ej. "Hunter x Hunter" → la
  // película "Hunter X" en vez del anime.
  if (moviePlausible && showPlausible) {
    const byDuration = decideByDuration(durationSec);
    if (byDuration === "movie") return asMovie();
    if (byDuration === "tv") return showLevel(show);
    const showPop = Number(show.popularity) || 0;
    const moviePop = Number(movie.popularity) || 0;
    return showPop > moviePop ? showLevel(show) : asMovie();
  }
  if (moviePlausible) return asMovie();
  if (showPlausible) return showLevel(show);
  return null;
}
