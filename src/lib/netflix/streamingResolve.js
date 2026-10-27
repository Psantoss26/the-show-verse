import { normalizeText } from "./resolve.js";

function titleFor(result, mediaType) {
  return mediaType === "tv"
    ? result?.name || result?.original_name
    : result?.title || result?.original_title;
}

// Año de estreno de un resultado de TMDb, o null.
function yearOf(item) {
  const year = Number(String(item?.release_date || item?.first_air_date || "").slice(0, 4));
  return Number.isInteger(year) && year > 1800 ? year : null;
}

// Año que da la plataforma (ficha o metadatos), o null si no es creíble.
function validYear(year) {
  const n = Number(year);
  return Number.isInteger(n) && n >= 1880 && n <= 2100 ? n : null;
}

const sameYear = (item, year) => year != null && yearOf(item) != null && Math.abs(yearOf(item) - year) <= 1;

// Título sin un paréntesis final: TMDb en español titula «Incontrolable (I
// Swear)» lo que la plataforma llama «Incontrolable».
const withoutTrailingParenthetical = (title) => String(title || "").replace(/\s*\([^)]*\)\s*$/, "");

/**
 * ¿Es este resultado EXACTAMENTE el título buscado? Con `year` (el que da la
 * plataforma) cuenta también el título sin un paréntesis final si el año casa.
 */
export function isExactTitle(entity, query, mediaType, { year = null } = {}) {
  if (!entity) return false;
  const q = normalizeText(query);
  const names = [titleFor(entity, mediaType), entity?.original_title || entity?.original_name];
  if (names.some((name) => normalizeText(name) === q)) return true;
  return sameYear(entity, validYear(year))
    && names.some((name) => normalizeText(withoutTrailingParenthetical(name)) === q);
}

/**
 * El resultado exacto (y, si hay año, el exacto de ese año antes que otro del
 * mismo título: «Incontrolable» de 2025 y no la de 2006), o el primero si no
 * se exige exactitud.
 */
export function pickTmdbResult(results, query, mediaType, { exactOnly = false, year = null } = {}) {
  const candidates = Array.isArray(results) ? results.filter((item) => item?.id) : [];
  if (!candidates.length) return null;

  const y = validYear(year);
  const exact = candidates.filter((item) => isExactTitle(item, query, mediaType, { year: y }));
  const exactOfYear = y != null ? exact.find((item) => sameYear(item, y)) : null;
  return exactOfYear || exact[0] || (exactOnly ? null : candidates[0]);
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
//
// La inclusión, además, tiene que CUBRIR buena parte del texto más largo. Sin
// esa proporción bastaba con que un título corto apareciera dentro de cualquier
// frase: "La Niña" casaba con "Capítulo cinco: La Nina" y un episodio acababa
// registrado como una serie ajena. Un sufijo o prefijo corto ("Stranger Things
// 4", "The Office (US)") sigue casando.
// La proporción se mide sin las palabras de RELLENO que las plataformas añaden al
// título ("temporada", "episodio", números sueltos, "T1", "E3"…): "Peaky
// Blinders temporada" sigue siendo Peaky Blinders.
const MIN_INCLUSION_COVERAGE = 0.6;
const FILLER_TOKEN_RE =
  /^(?:temporada|season|saison|staffel|episodio|episode|ep|capitulo|chapter|folge|parte|part|serie|series|pelicula|movie|film|ver|watch|completa|complete|\d+|[tse]\d+)$/;

function withoutFiller(text) {
  return text.split(" ").filter((token) => token && !FILLER_TOKEN_RE.test(token)).join(" ");
}

function hasTextualOverlap(entityTitle, query) {
  const a = normalizeText(entityTitle);
  const b = normalizeText(query);
  if (!a || !b || a.length < 3 || b.length < 3) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (!longer.includes(shorter)) return false;
  const core = withoutFiller(longer) || longer;
  return shorter.length / Math.max(core.length, shorter.length) >= MIN_INCLUSION_COVERAGE;
}

// ¿Tiene sentido aceptar este candidato como resolución real? Un título EXACTO
// siempre es plausible (máxima confianza posible). Para el resto, exige
// relación textual real con la consulta Y un mínimo reconocimiento en TMDb
// (popularidad o votos): un texto de UI mal filtrado puede "casar" con algo en
// TMDb por relevancia de búsqueda libre, pero rara vez con algo popular Y
// relacionado textualmente a la vez.
export function isPlausibleMatch(entity, query, mediaType, { year = null } = {}) {
  if (!entity) return false;
  if (isExactTitle(entity, query, mediaType, { year })) return true;
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
  const { exact, partial } = matchEpisodeCandidates({ episodeName, seasonEpisodes });
  if (exact.length === 1) return exact[0];
  if (!exact.length && partial.length === 1) return partial[0];
  return null;
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
  // Año de estreno que da la plataforma, si lo da: desempata títulos iguales y
  // admite «Título (subtítulo)» de TMDb cuando casa.
  year = null,
  search,
}) {
  const opts = { year };
  // Nivel serie (sin episodio conocido): confianza baja, pero SÍ se registra
  // (fallback show-level) en vez de descartarse.
  //
  // `exact` viaja en TODAS las resoluciones porque el llamador prueba varias
  // consultas (queryVariants) de fiabilidad muy distinta: un candidato EXACTO
  // vale venga de donde venga, mientras que uno aproximado solo es aceptable si
  // la consulta salió de una fuente fiable. Sin este dato el llamador se
  // quedaba con lo primero que resolviera, aunque fuese un texto de relleno.
  const showLevel = (entity) => ({
    kind: "show_level",
    mediaType: "tv",
    entity,
    confidence: "low",
    exact: isExactTitle(entity, query, "tv", opts),
  });

  // La plataforma dice con seguridad que es una PELÍCULA (JSON-LD, ruta de la
  // ficha o metadatos): no se busca entre series.
  if (expectedMediaType === "movie") {
    const results = await search("movie");
    const entity = pickTmdbResult(results, query, "movie", opts);
    if (!isPlausibleMatch(entity, query, "movie", opts)) return null;
    const exact = isExactTitle(entity, query, "movie", opts);
    return { kind: "resolved", mediaType: "movie", entity, exact, confidence: exact ? "high" : "medium" };
  }

  if (expectedMediaType === "tv") {
    const results = await search("tv");
    const entity = pickTmdbResult(results, query, "tv", opts);
    if (!isPlausibleMatch(entity, query, "tv", opts)) return null;
    // El episodio viene por número (el llamador ya lo parseó) → alta si exacto.
    const exact = isExactTitle(entity, query, "tv", opts);
    return {
      kind: "resolved",
      mediaType: "tv",
      entity,
      exact,
      confidence: scoreConfidence({ exactTitle: exact, episodeSource: "number" }),
    };
  }

  const [movieResults, tvResults] = await Promise.all([
    search("movie"),
    search("tv"),
  ]);
  const exactMovie = pickTmdbResult(movieResults, query, "movie", {
    exactOnly: true,
    year,
  });
  const exactShow = pickTmdbResult(tvResults, query, "tv", {
    exactOnly: true,
    year,
  });

  if (preferTv && (exactShow || (!exactMovie && tvResults.length > 0))) {
    const candidate = exactShow || pickTmdbResult(tvResults, query, "tv", opts);
    // Con pista de serie (episodio/subtítulo) el candidato EXACTO siempre vale;
    // el candidato SIN exactitud (fallback) solo si es plausible -- si no, cae
    // al resto de la función en vez de forzar una serie sin relación real.
    if (isPlausibleMatch(candidate, query, "tv", opts)) {
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
      return { kind: "resolved", mediaType: "movie", entity: exactMovie, confidence: "high", exact: true };
    }
    if (byDuration === "tv") {
      return showLevel(exactShow);
    }
    const showPop = Number(exactShow.popularity) || 0;
    const moviePop = Number(exactMovie.popularity) || 0;
    return showPop >= moviePop
      ? showLevel(exactShow)
      : { kind: "resolved", mediaType: "movie", entity: exactMovie, confidence: "high", exact: true };
  }

  if (exactShow && !exactMovie) {
    // Sin ninguna pista de serie y con duración de largometraje, el título exacto
    // de una serie no debe ganarle a una película plausible: pasa cuando TMDb
    // escribe la película con una variante del nombre ("… (Otro día para matar)")
    // y existe una serie que se llama justo como el título detectado. Con pista de
    // serie (`preferTv`) no se aplica: un episodio largo seguiría siendo episodio.
    if (!preferTv && decideByDuration(durationSec) === "movie") {
      const movie = pickTmdbResult(movieResults, query, "movie", opts);
      if (isPlausibleMatch(movie, query, "movie", opts)) {
        return {
          kind: "resolved",
          mediaType: "movie",
          entity: movie,
          confidence: "medium",
          exact: false,
        };
      }
    }
    return showLevel(exactShow);
  }

  if (exactMovie) {
    return {
      kind: "resolved",
      mediaType: "movie",
      entity: exactMovie,
      confidence: "high",
      exact: true,
    };
  }

  if (exactShow) {
    return showLevel(exactShow);
  }

  const movie = pickTmdbResult(movieResults, query, "movie", opts);
  const show = pickTmdbResult(tvResults, query, "tv", opts);
  // Sin título exacto en ningún lado: exigimos que el candidato tenga relación
  // textual real con la consulta Y un mínimo reconocimiento en TMDb. Sin esto,
  // `pickTmdbResult` sin `exactOnly` devuelve el primer resultado de búsqueda
  // libre de TMDb aunque no tenga nada que ver con el texto detectado --causa
  // de notificaciones de ficha sobre títulos irrelevantes.
  const moviePlausible = isPlausibleMatch(movie, query, "movie", opts);
  const showPlausible = isPlausibleMatch(show, query, "tv", opts);
  const asMovie = () => ({
    kind: "resolved",
    mediaType: "movie",
    entity: movie,
    confidence: isExactTitle(movie, query, "movie", opts) ? "high" : "medium",
    exact: isExactTitle(movie, query, "movie", opts),
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

/**
 * Ajusta la temporada y el episodio que da una plataforma a la numeración de
 * TMDb. Las plataformas agrupan y parten temporadas a su manera y cuentan
 * episodios que TMDb no tiene (especiales, recapitulaciones), así que su par no
 * siempre existe en TMDb, o existe pero es otro episodio:
 *
 *   - «Ataque a los Titanes»: la «Temporada 4 Parte 2» es la 6 de Netflix y su
 *     episodio 82 (numeración absoluta) es el S4E23 de TMDb;
 *   - «Jujutsu Kaisen»: TMDb la tiene en una temporada; el T2:E32 es el S1E32;
 *   - «My Hero Academia»: Netflix suma especiales y su «93» es el S5E1, no el S5E5;
 *   - «Dragon Ball Z Kai»: Netflix la tiene en 2 temporadas y TMDb en 6; el T2:E1
 *     de Netflix es el S5E1 de TMDb.
 *
 * Con la POSICIÓN del episodio en la plataforma (`absoluteEpisode`, contando
 * todas sus temporadas, y `seasonEpisodeIndex`, dentro de la suya: la extensión
 * las saca de los metadatos de Netflix), lo general es ALINEAR por inicios de
 * temporada: cuando una plataforma agrupa o parte temporadas, las suyas empiezan
 * casi siempre donde empieza alguna de TMDb, y lo que se desvía es la cuenta de
 * antes. Si el inicio de la temporada de la plataforma cae cerca (≤ 6 %) del de
 * una temporada de TMDb, el episodio se cuenta desde ahí (`via: 'aligned'`); si
 * no (la plataforma parte una temporada de TMDb por la mitad), se reparte la
 * posición absoluta (`via: 'absolute'`).
 *
 * Sin esas posiciones (clientes antiguos, otras plataformas) se deduce lo que se
 * puede del par: si existe se queda; si el número no cabe en esa temporada es
 * absoluto; si cae en la misma temporada que dice la plataforma, la cuenta de
 * antes es dudosa (`absolute_same_season`); en una serie de una sola temporada se
 * supone absoluto (`absolute_guess`). Lo dudoso lo confirma o corrige el nombre
 * del episodio en el llamador.
 *
 * Devuelve { season, episode, via, candidates } (candidates: los pares
 * alternativos, para comprobarlos por nombre) o null si no hay forma de saberlo.
 *
 * @param {{season:number, episode:number, absoluteEpisode?:number|null,
 *   seasonEpisodeIndex?:number|null}} numbers
 * @param {Array<{season_number:number, episode_count:number}>} realSeasons temporadas > 0
 */
export function reconcileEpisodeNumbers(
  { season, episode, absoluteEpisode = null, seasonEpisodeIndex = null },
  realSeasons,
) {
  const seasons = (Array.isArray(realSeasons) ? realSeasons : [])
    .map((s) => ({ season: Number(s?.season_number), count: Number(s?.episode_count) || 0 }))
    .filter((s) => Number.isInteger(s.season) && s.season > 0)
    .sort((a, b) => a.season - b.season);
  if (!seasons.length || !(season > 0) || !(episode > 0)) return null;

  // Posición de inicio de cada temporada de TMDb (1 = primer episodio de la T1).
  let cursor = 1;
  for (const s of seasons) {
    s.start = cursor;
    cursor += s.count;
  }
  const total = cursor - 1;
  const positionOf = (pair) => {
    const s = seasons.find((x) => x.season === pair.season);
    return s && pair.episode <= s.count ? s.start + pair.episode - 1 : null;
  };
  // Cuenta `n` episodios desde el inicio de la temporada `from` (índice).
  const countFrom = (from, n, via) => {
    let left = n;
    for (let i = from; i < seasons.length; i += 1) {
      if (left <= seasons[i].count) return { season: seasons[i].season, episode: left, via };
      left -= seasons[i].count;
    }
    return null;
  };
  const distribute = (position, via) => (position > 0 && position <= total ? countFrom(0, position, via) : null);
  const positive = (v) => (Number.isInteger(v) && v > 0 ? v : null);
  const tolerance = (position) => Math.max(3, Math.ceil(position * 0.06));

  const claimed = seasons.find((s) => s.season === season);
  const asIs = claimed && episode <= claimed.count ? { season, episode, via: "as_is" } : null;
  const finish = (best, others) => {
    if (!best) return null;
    const seen = new Set([`${best.season}:${best.episode}`]);
    const candidates = others.filter((c) => {
      if (!c) return false;
      const key = `${c.season}:${c.episode}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { ...best, candidates };
  };

  const position = positive(absoluteEpisode);
  const index = positive(seasonEpisodeIndex);
  if (position) {
    // El par vale tal cual solo si su posición en TMDb cuadra con la de la
    // plataforma: en una serie reagrupada, el T2:E1 de Netflix NO es el de TMDb.
    if (asIs && Math.abs(positionOf(asIs) - position) <= tolerance(position)) {
      return finish(asIs, []);
    }
    const absolute = distribute(position, "absolute");
    let aligned = null;
    if (index && index <= position) {
      const platformStart = position - index + 1;
      let best = null;
      seasons.forEach((s, i) => {
        const gap = Math.abs(s.start - platformStart);
        if (gap <= tolerance(platformStart) && (!best || gap < best.gap)) best = { i, gap };
      });
      if (best) aligned = countFrom(best.i, index, "aligned");
    }
    return finish(aligned || absolute, [absolute, asIs]);
  }

  // Sin posiciones: lo que se pueda deducir del par.
  if (asIs) return finish(asIs, []);
  const largest = Math.max(...seasons.map((s) => s.count));
  if (!claimed && seasons.length === 1) {
    const guess = distribute(episode, "absolute_guess");
    return finish(guess, []);
  }
  const cannotBeRelative = claimed ? episode > claimed.count : episode > largest;
  if (!cannotBeRelative) return null;
  const absolute = distribute(episode, "absolute");
  if (absolute && claimed && absolute.season === claimed.season) {
    // Misma temporada en las dos: lo que no cuadra es la cuenta de antes, y la
    // posición dentro de la temporada (si se sabe) es la buena.
    if (index && index <= claimed.count) {
      return finish({ season, episode: index, via: "season_index" }, [absolute]);
    }
    return finish({ ...absolute, via: "absolute_same_season" }, []);
  }
  return finish(absolute, []);
}

/**
 * El episodio de TMDb cuyo NOMBRE casa con el de la plataforma, buscando cerca
 * (±`window` episodios) de la posición calculada. Corrige un desfase que quede
 * tras alinear (especiales repartidos de otra forma). Solo un candidato único:
 * exacto, o si no hay exactos, por inclusión fiable (ver matchEpisodeCandidates).
 *
 * @param {string} episodeName nombre que da la plataforma
 * @param {Array<{season_number, episode_number, name}>} allEpisodes de TMDb (es + en)
 * @param {Array<{season_number, episode_count}>} realSeasons
 * @param {{season:number, episode:number}} around posición calculada
 * @returns {{season:number, episode:number}|null}
 */
export function anchorEpisodeByName(episodeName, allEpisodes, realSeasons, around, window = 12) {
  if (!episodeName || isGenericEpisodeName(episodeName) || !around) return null;
  const seasons = (Array.isArray(realSeasons) ? realSeasons : [])
    .map((s) => ({ season: Number(s?.season_number), count: Number(s?.episode_count) || 0 }))
    .filter((s) => Number.isInteger(s.season) && s.season > 0)
    .sort((a, b) => a.season - b.season);
  let cursor = 1;
  const startOf = new Map();
  for (const s of seasons) {
    startOf.set(s.season, cursor);
    cursor += s.count;
  }
  const pos = (season, ep) => (startOf.has(season) ? startOf.get(season) + ep - 1 : null);
  const center = pos(around.season, around.episode);
  if (center == null) return null;
  const nearby = (Array.isArray(allEpisodes) ? allEpisodes : []).filter((e) => {
    const p = pos(Number(e?.season_number), Number(e?.episode_number));
    return p != null && Math.abs(p - center) <= window;
  });
  const { exact, partial } = matchEpisodeCandidates({ episodeName, seasonEpisodes: nearby });
  const unique = (list) => {
    const keys = [...new Set(list.map((c) => `${c.season}:${c.episode}`))];
    return keys.length === 1 ? list[0] : null;
  };
  return unique(exact) || (exact.length === 0 ? unique(partial) : null);
}

/**
 * Un par que existe en TMDb no es por fuerza el episodio que suena: sin las
 * posiciones de la plataforma (app Android, otras plataformas), el «T2:E1» de una
 * serie que la plataforma reagrupa («Dragon Ball Z Kai»: 2 temporadas frente a
 * 6) existe en TMDb pero es otro. Si el NOMBRE del episodio no es el de ese par
 * pero casa EXACTO con un único episodio de la serie, ese es el bueno.
 *
 * Conservador: un nombre genérico, traducido distinto (sin coincidencia exacta)
 * o repetido entre temporadas no cambia nada; tampoco si casa con el propio par.
 * @returns {{season:number, episode:number}|null} el episodio por nombre, o null
 */
export function episodeElsewhereByName(episodeName, allEpisodes, pair) {
  if (!episodeName || isGenericEpisodeName(episodeName) || !pair) return null;
  const { exact } = matchEpisodeCandidates({ episodeName, seasonEpisodes: allEpisodes });
  const keys = [...new Set(exact.map((c) => `${Number(c.season)}:${Number(c.episode)}`))];
  if (keys.length !== 1) return null;
  const [season, episode] = keys[0].split(":").map(Number);
  if (season === Number(pair.season) && episode === Number(pair.episode)) return null;
  return { season, episode };
}
