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
export function cleanSearchTitle(raw) {
  let t = String(raw || "").trim();
  t = t.replace(PLATFORM_PREFIX_RE, "");
  t = t.replace(/\s*[-:|–·]\s*(temporada|season|saison|staffel)\s*\.?\s*\d+.*$/i, "");
  t = t.replace(/\s*[-:|–·]\s*(episodio|episode|cap[ií]tulo|chapter|folge|ep)\s*\.?\s*\d+.*$/i, "");
  t = t.replace(/\s*[-:|–·]\s*[TS]\s*\d+\s*[:x\s]\s*E?\s*\d+.*$/i, "");
  t = t.replace(/\s*[([{]\s*\d{4}\s*[)\]}]\s*$/, ""); // año entre paréntesis al final
  return t.trim();
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
export function buildQueryVariants({ showName, mainTitle, tabTitle, isSeries } = {}) {
  const showFromTab = showNameFromTab(tabTitle);
  const showSources = [showName, showFromTab];
  // Los clientes solo rellenan `showName` en SERIES, así que su presencia ya
  // implica serie aunque no venga la marca isSeries.
  const seriesLike = Boolean(isSeries) || Boolean(String(showName || "").trim());
  const ordered = seriesLike
    ? [...showSources, mainTitle]
    : [mainTitle, ...showSources];

  const bases = ordered.map((v) => String(v || "").trim()).filter(Boolean);
  const variants = [];
  const add = (value) => {
    const c = cleanSearchTitle(value);
    if (c && c.length >= 2 && !variants.includes(c)) variants.push(c);
  };
  bases.forEach(add);
  bases.map(beforeColon).filter(Boolean).forEach(add);
  bases.map(stripEditionSuffix).forEach(add);
  return variants.slice(0, 5);
}
