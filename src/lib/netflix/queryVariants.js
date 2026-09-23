// src/lib/netflix/queryVariants.js
//
// Construcción de consultas para resolver un título capturado por la extensión /
// app Android contra TMDb. El objetivo es MAXIMIZAR la tasa de resolución (evitar
// el 404 "Could not resolve TMDb entity") probando variantes ordenadas de la más
// probable a la más agresiva. Funciones PURAS y testeables (sin red).

// Alternancia de plataformas de streaming (compartida por el prefijo y el sufijo).
// Alineada con la detección de los clientes (netflix-extension/detection-core.js y
// android-companion SignalBuilder).
const PLATFORMS =
  "prime video|amazon prime video|amazon|netflix|max|hbo max|hbo|disney\\s*\\+|disney plus|star\\s*\\+|paramount\\s*\\+|paramount plus|apple tv\\s*\\+?|movistar\\s*\\+?|filmin|skyshowtime|pluto tv|pluto|rakuten tv|rakuten|atresplayer|rtve(?:\\s*play)?|crunchyroll|plex";

// Prefijo de plataforma al principio del título ("Netflix - Título").
export const PLATFORM_PREFIX_RE = new RegExp(
  `^\\s*(${PLATFORMS})\\s*[:\\-|–·]\\s*`,
  "i",
);

// Sufijo de plataforma al final (típico del título de la pestaña: "Serie - Netflix").
const PLATFORM_SUFFIX_RE = new RegExp(
  `\\s*[-|·–—:]\\s*(${PLATFORMS})\\s*$`,
  "i",
);

// Verbo inicial habitual en los títulos de pestaña ("Watch …", "Ver …").
const WATCH_PREFIX_RE = /^\s*(watch|ver|reproducir|mira|play)\s+/i;

// Etiquetas de idioma / pista de audio que las plataformas (sobre todo anime:
// Crunchyroll) cuelgan del título: "en castellano", "subtitulado", "VOSE"…
const LANG_TOKENS =
  "castellano|espa[nñ]ol|espanol|latino|latinoam[eé]rica|ingl[eé]s|ingles|japon[eé]s|japones|coreano|subtitulad[oa]s?|subt[ií]tulos?|sub|vose?|dual|dub|doblaj[eo]|audio\\s+[a-zñ]+";

// Prefijo de temporada/episodio AL PRINCIPIO del título ("Temporada 1 Título",
// "Episodio 5: Nombre", "Capítulo 3 - X"). El nombre de la serie/episodio queda
// detrás. Se aplica en bucle (cubre "Temporada 1 Episodio 5 X").
const LEADING_SEASON_EPISODE_RE =
  /^\s*(?:temporada|season|saison|staffel|episodio|episode|cap[ií]tulo|chapter|folge)\s*\.?\s*\d+\s*[:\-–·,.]?\s+/i;

// Sufijo "…(Ver|Watch)? (en|on)? PLATAFORMA (en idioma)?" — el patrón de las
// pestañas de Crunchyroll: "… - Ver en Crunchyroll en castellano". Tolera texto
// de idioma DESPUÉS de la plataforma (por eso PLATFORM_SUFFIX_RE no bastaba).
const PLATFORM_WATCH_SUFFIX_RE = new RegExp(
  `\\s*[-–—·|:]?\\s*(?:ver|watch|mira|reproducir|stream)?\\s*(?:en|on)?\\s+(?:${PLATFORMS})(?:\\s+(?:en\\s+)?(?:${LANG_TOKENS}))*\\s*$`,
  "i",
);

// Sufijo de idioma suelto (sin plataforma), exigiendo separador / paréntesis /
// "en " delante para no comerse palabras legítimas: "- castellano", "(VOSE)",
// "en español", "audio latino".
const LANGUAGE_SUFFIX_RE = new RegExp(
  `\\s*(?:[-–—·|:]\\s*|[([]\\s*|\\ben\\s+)(?:${LANG_TOKENS})\\s*[)\\]]?\\s*$`,
  "i",
);

// Nombres de plataforma "a secas": cuando la captura falla, el cliente a veces
// cae al título de la pestaña, que es solo "Netflix"/"Max"/… Buscar eso en TMDb
// devuelve una película basura ("Netflix Tudum 2025", etc.). Estos candidatos se
// DESCARTAN: es mucho mejor no sincronizar que sincronizar algo sin relación.
function normalizePlatformName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const PLATFORM_NAME_SET = new Set(
  [
    "netflix", "prime video", "amazon prime video", "amazon", "max", "hbo max",
    "hbo", "disney", "disney plus", "star", "star plus", "paramount",
    "paramount plus", "apple tv", "apple tv plus", "movistar", "movistar plus",
    "filmin", "skyshowtime", "pluto", "pluto tv", "rakuten", "rakuten tv",
    "atresplayer", "rtve", "rtve play", "crunchyroll", "plex",
  ].map(normalizePlatformName),
);

// ¿La cadena es solo el nombre de una plataforma (no un título real)?
export function isBarePlatformName(value) {
  return PLATFORM_NAME_SET.has(normalizePlatformName(value));
}

// Quita sufijos de edición / formato / año que hacen fallar la búsqueda en TMDb
// ("(2021)", "[4K]", "- Edición extendida", ": Director's Cut", "– VOSE").
export function stripEditionSuffix(value) {
  return String(value || "")
    .replace(/\s*[([{][^)\]}]*[)\]}]\s*$/g, "") // (...) [...] {...} al final
    .replace(
      /\s*[-–:|·]\s*(edici[oó]n|versi[oó]n|edition|version|director'?s cut|extended|unrated|remaster[a-z]*|4k|uhd|hd|imax|vose?|subtitulad[ao]|latino|castellano|dual)\b.*$/i,
      "",
    )
    .trim();
}

// Parte anterior a los dos puntos ("Serie: Nombre del episodio" → "Serie").
// Útil cuando la Media Session junta serie y episodio sin marcador de temporada.
export function beforeColon(value) {
  const t = String(value || "");
  const i = t.indexOf(":");
  return i > 1 ? t.slice(0, i).trim() : "";
}

// Normaliza el título para buscar en TMDb: quita el prefijo de la plataforma, los
// descriptores de temporada/episodio del final y un año entre paréntesis final.
//
// `stripEpisodeMarkers` decide si se quitan los descriptores de temporada/episodio.
// En una SERIE hay que quitarlos (lo que se busca en TMDb es el nombre de la
// serie), pero en una PELÍCULA esos mismos patrones se comen parte del nombre
// real: "John Wick: Capítulo 2" quedaba en "John Wick", que en TMDb es OTRA
// película. Por eso el llamador prueba las dos formas y prioriza según lo que sepa
// del contenido; ver `buildRankedQueryVariants`.
export function cleanSearchTitle(raw, { stripEpisodeMarkers = true } = {}) {
  let t = String(raw || "").trim();
  // Bucle hasta estabilizar: un mismo título puede tener VARIAS capas de basura
  // ("Temporada 1 <episodio> - Ver en Crunchyroll en castellano").
  let prev = null;
  let guard = 0;
  while (t && t !== prev && guard++ < 8) {
    prev = t;
    t = t
      .replace(PLATFORM_PREFIX_RE, "")                       // "Netflix - X"
      .replace(PLATFORM_WATCH_SUFFIX_RE, "")                // "X - Ver en Crunchyroll en castellano"
      .replace(LANGUAGE_SUFFIX_RE, "")                      // "X en castellano" / "X (VOSE)"
      .replace(/\s*[([{]\s*\d{4}\s*[)\]}]\s*$/, "")          // "(2021)" al final
      .trim();
    if (stripEpisodeMarkers) {
      t = t
        .replace(LEADING_SEASON_EPISODE_RE, "")             // "Temporada 1 X"
        .replace(/\s*[-:|–·]\s*(temporada|season|saison|staffel)\s*\.?\s*\d+.*$/i, "") // "X - Temporada 2"
        .replace(/\s*[-:|–·]\s*(episodio|episode|cap[ií]tulo|chapter|folge|ep)\s*\.?\s*\d+.*$/i, "")
        .replace(/\s*[-:|–·]\s*[TS]\s*\d+\s*[:x\s]\s*E?\s*\d+.*$/i, "")
        .trim();
    }
  }
  return t;
}

// Extrae el nombre de la SERIE del título de la pestaña / app ("Stranger Things -
// Netflix", "Watch The Bear | Max", "La Casa de Papel · Netflix"). Es la fuente
// MÁS FIABLE del nombre de la serie cuando la plataforma no expone artist/album y
// el campo `title` acaba siendo el nombre del EPISODIO (causa nº1 del 404 en
// episodios). Quita el verbo inicial y el sufijo de plataforma (repetible).
export function showNameFromTab(tabTitle) {
  let t = String(tabTitle || "").trim();
  if (!t) return "";
  t = t.replace(WATCH_PREFIX_RE, "");
  let prev;
  do {
    prev = t;
    t = t.replace(PLATFORM_SUFFIX_RE, "").trim();
  } while (t && t !== prev);
  return cleanSearchTitle(t);
}

// Lista ORDENADA y sin duplicados de consultas para TMDb, de la más probable a la
// más agresiva. Fuentes de nombre:
//   - showName / showNameFromTab(tabTitle): el nombre de la SERIE (lo que hay que
//     buscar en un episodio).
//   - mainTitle: el título principal; en películas es el bueno, pero en episodios
//     puede ser el nombre del EPISODIO.
// En SERIES se prueban primero los nombres de serie (serie/pestaña) y luego el
// mainTitle; en películas al revés. En ambos casos se incluyen TODAS las fuentes
// como respaldo, para no fallar aunque la clasificación serie/película sea errónea.
// Además, por cada base: la parte antes de ":" y la versión sin sufijos de edición.
export function buildQueryVariants(input = {}) {
  return buildRankedQueryVariants(input).map((v) => v.query);
}

// Igual que `buildQueryVariants` pero conservando de QUÉ campo salió cada consulta
// y si esa fuente es FIABLE (`strong`).
//
// POR QUÉ IMPORTA. Las fuentes no valen lo mismo. `showName`, `mainTitle` o el
// nombre de serie del título de pestaña los publica el reproductor y describen lo
// que se está viendo. En cambio el texto de una notificación de Android, el
// subtítulo o el badge de temporada son campos de relleno: traen "T1:E1",
// "Ver ahora", el nombre del perfil o la descripción del episodio. Buscar eso en
// TMDb devuelve, por relevancia de búsqueda libre, un título APROXIMADO sin
// ninguna relación; y como el llamador se quedaba con la primera consulta que
// resolviese algo, ese título acababa en el historial. Marcando la fuente, quien
// resuelve puede exigir coincidencia EXACTA a las consultas poco fiables y
// aceptar aproximaciones solo de las fiables.
export function buildRankedQueryVariants({
  showName,
  mainTitle,
  movieTitle,
  tabTitle,
  queueTitle,
  albumArtist,
  showCandidates,
  weakCandidates,
  isSeries,
} = {}) {
  const showFromTab = showNameFromTab(tabTitle);
  // Fuentes del nombre de la SERIE cuando `title` es el episodio: queueTitle,
  // albumArtist y una lista abierta `showCandidates` (p. ej. el título de la
  // notificación de Android). Así, venga la serie del campo que venga, se prueba.
  const strongExtra = Array.isArray(showCandidates) ? showCandidates : [];
  const weakExtra = Array.isArray(weakCandidates) ? weakCandidates : [];
  const showSources = [showName, queueTitle, albumArtist, ...strongExtra, showFromTab];
  // Los clientes solo rellenan `showName` en SERIES, así que su presencia ya
  // implica serie aunque no venga la marca isSeries.
  const seriesLike = Boolean(isSeries) || Boolean(String(showName || "").trim());
  const mainSources = [mainTitle, movieTitle];
  const ordered = (
    seriesLike ? [...showSources, ...mainSources] : [...mainSources, ...showSources]
  )
    .map((value) => ({ value, strong: true }))
    // Las fuentes poco fiables van SIEMPRE al final, después de todas las buenas.
    .concat(weakExtra.map((value) => ({ value, strong: false })));

  const bases = ordered
    .map((b) => ({ ...b, value: String(b.value || "").trim() }))
    .filter((b) => b.value);
  const variants = [];
  const seen = new Set();
  const add = ({ value, strong }, options) => {
    const c = cleanSearchTitle(value, options);
    if (!c || c.length < 2 || isBarePlatformName(c)) return;
    if (seen.has(c)) return;
    seen.add(c);
    variants.push({ query: c, strong });
  };
  // En una serie interesa el nombre de la serie, así que se prueba primero el
  // título SIN descriptores de temporada/episodio. En una película se prueba
  // primero el título ÍNTEGRO: quitarlos mutila nombres como "John Wick:
  // Capítulo 2". La otra forma va detrás, como respaldo, en los dos casos.
  const passes = seriesLike
    ? [{ stripEpisodeMarkers: true }, { stripEpisodeMarkers: false }]
    : [{ stripEpisodeMarkers: false }, { stripEpisodeMarkers: true }];
  for (const options of passes) {
    bases.forEach((b) => add(b, options));
  }
  bases.forEach((b) => add({ ...b, value: beforeColon(b.value) }));
  bases.forEach((b) => add({ ...b, value: stripEditionSuffix(b.value) }));
  // Tope de consultas. Cada una cuesta hasta tres peticiones por tipo de medio, y
  // solo se agotan cuando nada resuelve —justo el caso en el que el cliente va a
  // reintentar de todas formas—, así que no compensa alargar más la lista.
  return variants.slice(0, 6);
}
