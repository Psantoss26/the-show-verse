// src/lib/netflix/queryVariants.js
//
// Construcción de consultas para resolver un título capturado por la extensión /
// app Android contra TMDb. El objetivo es MAXIMIZAR la tasa de resolución (evitar
// el 404 "Could not resolve TMDb entity") probando variantes ordenadas de la más
// probable a la más agresiva. Funciones PURAS y testeables (sin red).

// Prefijo de plataforma que algunas pestañas/apps anteponen al título. Lista
// alineada con la detección de los clientes (netflix-extension/detection-core.js
// y android-companion SignalBuilder), que antes divergía y dejaba pasar prefijos
// de Crunchyroll, Movistar, Filmin, SkyShowtime, Apple TV, Pluto, Rakuten, etc.
export const PLATFORM_PREFIX_RE =
  /^\s*(prime video|amazon prime video|amazon|netflix|max|hbo max|hbo|disney\s*\+|disney plus|star\s*\+|paramount\s*\+|paramount plus|apple tv\s*\+?|movistar\s*\+?|filmin|skyshowtime|pluto tv|pluto|rakuten tv|rakuten|atresplayer|rtve(?:\s*play)?|crunchyroll|plex)\s*[:\-|–·]\s*/i;

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

// Lista ORDENADA y sin duplicados de consultas para TMDb, de la más probable a la
// más agresiva. Cubre:
//  1. título de serie y título principal limpios (por si la detección del cliente
//     confundió serie/episodio y metió el nombre real en el otro campo),
//  2. la parte antes de ":" (formato "Serie: Episodio" / "Título: Subtítulo"),
//  3. el título sin sufijos de edición/formato.
export function buildQueryVariants({ showName, mainTitle } = {}) {
  const bases = [showName, mainTitle]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const variants = [];
  const add = (value) => {
    const c = cleanSearchTitle(value);
    if (c && c.length >= 2 && !variants.includes(c)) variants.push(c);
  };
  bases.forEach(add);
  bases.map(beforeColon).filter(Boolean).forEach(add);
  bases.map(stripEditionSuffix).forEach(add);
  return variants.slice(0, 4);
}
