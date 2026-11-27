// src/lib/ui/phoneScoreboardScores.js
// Puntuaciones del marcador de teléfono (ficha en el móvil y modal en vista
// teléfono). Ajuste de cuenta «Puntuaciones en el móvil»: una lista para
// películas y otra para series, cada una de 1 a 4 puntuaciones y en el orden
// que el usuario las colocó en el editor. Por defecto TMDb, Trakt e IMDb.
//
// Letterboxd solo tiene películas: nunca entra en la lista de series.
//
// Formato antiguo (lista única, con "rtTv" = Rotten Tomatoes solo en series):
// se convierte al leerlo.
export const PHONE_SCORES_KEY = "phoneScores";
export const PHONE_SCORES_MAX = 4;
export const PHONE_SCORE_TYPES = ["movie", "tv"];

export const PHONE_SCORE_OPTIONS = [
  { key: "tmdb", label: "TMDb", logo: "/logo-TMDb.png" },
  { key: "trakt", label: "Trakt", logo: "/logo-Trakt.png" },
  { key: "imdb", label: "IMDb", logo: "/logo-IMDb.png" },
  { key: "rt", label: "Rotten Tomatoes", logo: "/logo-RottenTomatoes.png" },
  { key: "mc", label: "Metacritic", logo: "/logo-Metacritic.png" },
  { key: "lb", label: "Letterboxd", logo: "/logo-Letterboxd.png", moviesOnly: true },
];

const KEYS = new Set(PHONE_SCORE_OPTIONS.map((option) => option.key));
const MOVIES_ONLY = new Set(PHONE_SCORE_OPTIONS.filter((o) => o.moviesOnly).map((o) => o.key));
const DEFAULT_LIST = ["tmdb", "trakt", "imdb"];

export const DEFAULT_PHONE_SCORES = Object.freeze({
  movie: Object.freeze([...DEFAULT_LIST]),
  tv: Object.freeze([...DEFAULT_LIST]),
});

const typeOf = (mediaType) => (mediaType === "tv" ? "tv" : "movie");

// Puntuaciones que se pueden elegir para un tipo.
export function phoneScoreOptionsFor(mediaType) {
  const type = typeOf(mediaType);
  return PHONE_SCORE_OPTIONS.filter((option) => type === "movie" || !option.moviesOnly);
}

export function isPhoneScoreAllowed(key, mediaType) {
  return KEYS.has(key) && (typeOf(mediaType) === "movie" || !MOVIES_ONLY.has(key));
}

function sanitizeList(value, type) {
  if (!Array.isArray(value)) return [...DEFAULT_LIST];
  const picked = [];
  for (const key of value) {
    if (picked.length >= PHONE_SCORES_MAX) break;
    if (picked.includes(key) || !isPhoneScoreAllowed(key, type)) continue;
    picked.push(key);
  }
  return picked.length ? picked : [...DEFAULT_LIST];
}

// Lista única antigua → { movie, tv }.
function fromLegacyList(list) {
  return {
    movie: list.filter((key) => key !== "rtTv"),
    tv: list.map((key) => (key === "rtTv" ? "rt" : key)),
  };
}

export function sanitizePhoneScores(value) {
  const source = Array.isArray(value)
    ? fromLegacyList(value)
    : value && typeof value === "object"
      ? value
      : {};
  return {
    movie: sanitizeList(source.movie, "movie"),
    tv: sanitizeList(source.tv, "tv"),
  };
}

export function getPhoneScores(preferences) {
  return sanitizePhoneScores(preferences?.uiSettings?.[PHONE_SCORES_KEY]);
}

// Las claves que se pintan para un tipo ("movie" | "tv"), en su orden.
export function phoneScoresFor(scores, mediaType) {
  return sanitizePhoneScores(scores)[typeOf(mediaType)];
}

// Lo que se pinta de verdad: una puntuación elegida que se quedó sin nota (ya
// no se espera; p. ej. Rotten Tomatoes en muchas series de anime) cede su
// puesto a TMDb, salvo que TMDb ya esté en el marcador o tampoco tenga nota.
// Así el marcador no se queda con un hueco menos. Solo la primera que falte.
// `hasScore(key)`: hay nota o se está esperando (hueco reservado).
export function phoneScoresWithFallback(list, hasScore) {
  if (!Array.isArray(list) || list.includes("tmdb") || !hasScore("tmdb")) return list;
  const missing = list.findIndex((key) => !hasScore(key));
  if (missing < 0) return list;
  const next = [...list];
  next[missing] = "tmdb";
  return next;
}

// --- Operaciones del editor (sobre la lista de un tipo) ---------------------
// Todas devuelven una lista válida: si la operación no cabe, la lista igual.

// Coloca `key` en el hueco `index`. Si ya estaba, se mueve allí. Si el hueco
// está ocupado por otra y la lista está llena, la sustituye; si no, se inserta.
export function placePhoneScore(list, key, index, mediaType) {
  const current = sanitizeList(list, typeOf(mediaType));
  if (!isPhoneScoreAllowed(key, mediaType)) return current;
  const at = Math.max(0, Math.min(Number.isInteger(index) ? index : current.length, PHONE_SCORES_MAX - 1));
  const from = current.indexOf(key);
  if (from >= 0) {
    const next = current.filter((k) => k !== key);
    next.splice(Math.min(at, next.length), 0, key);
    return next;
  }
  const next = [...current];
  if (next.length >= PHONE_SCORES_MAX) {
    next[Math.min(at, next.length - 1)] = key;
    return next;
  }
  next.splice(Math.min(at, next.length), 0, key);
  return next;
}

// Sustituye la puntuación `targetKey` por `key` (que viene de fuera).
export function replacePhoneScore(list, targetKey, key, mediaType) {
  const current = sanitizeList(list, typeOf(mediaType));
  if (!isPhoneScoreAllowed(key, mediaType) || current.includes(key)) return current;
  return current.map((k) => (k === targetKey ? key : k));
}

// Quita una puntuación; nunca deja la lista vacía.
export function removePhoneScore(list, key, mediaType) {
  const current = sanitizeList(list, typeOf(mediaType));
  const next = current.filter((k) => k !== key);
  return next.length ? next : current;
}

export function withPhoneScores(uiSettings, scores) {
  return { ...(uiSettings || {}), [PHONE_SCORES_KEY]: sanitizePhoneScores(scores) };
}
