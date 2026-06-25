// backend/src/dashboard/filters.js
// Reglas de contenido compartidas por pools y recomendaciones.
//
// Objetivo de producto: plataforma de cine/series general centrada en España.
//   1. No mostrar contenido infantil ni reality (no encajan en el catálogo).
//   2. España como mercado principal: el anime y el contenido asiático no deben
//      ser predominantes (se limitan, no se eliminan).

// ─── Géneros de TV excluidos ────────────────────────────────────────────────
// IDs de género de TMDB que NO forman parte de una plataforma de cine/series
// general. (Estos IDs son específicos de TV; el cine no los usa.)
export const EXCLUDED_TV_GENRES = new Set([
  10762, // Kids (infantil)
  10764, // Reality
  10767, // Talk (programas de entrevistas)
  10763, // News (informativos)
]);

// `without_genres` listo para pasar a discover de TV (evita gastar resultados
// del pool en reality/infantil antes de filtrar/cap).
export const TV_WITHOUT_GENRES = [...EXCLUDED_TV_GENRES].join(',');

// ─── Idiomas asiáticos a despriorizar ───────────────────────────────────────
// No se eliminan: se limita su proporción por pool (capAsian) para que el
// anime y el contenido asiático no dominen frente al contenido general.
export const DEMOTE_LANGS = new Set([
  'ja', // japonés (anime)
  'ko', // coreano
  'zh', // chino (mandarín)
  'cn', // chino (cantonés)
  'th', // tailandés
  'hi', // hindi
  'ta', // tamil
  'te', // telugu
  'ml', // malayalam
  'vi', // vietnamita
  'id', // indonesio
  'tl', // tagalo
]);

// Proporción máxima de títulos en idioma asiático respecto al resto del pool.
// 0.4 → asiático ≈ 28 % del total como mucho (0.4 / 1.4).
export const ASIAN_MAX_RATIO = 0.4;
// Mínimo de títulos asiáticos a conservar aunque el resto sea pequeño (para no
// eliminar los más conocidos: Attack on Titan, Squid Game, El viaje de Chihiro…).
const ASIAN_MIN_KEEP = 3;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** ¿La card pertenece a un género excluido (infantil/reality/talk/news)? */
export function isExcludedGenre(card) {
  const ids = card?.genreIds;
  if (!Array.isArray(ids)) return false;
  for (const id of ids) {
    if (EXCLUDED_TV_GENRES.has(id)) return true;
  }
  return false;
}

/** Quita contenido infantil y reality (por género). */
export function excludeKidsReality(cards) {
  return (cards || []).filter((c) => c && !isExcludedGenre(c));
}

/**
 * Limita la proporción de títulos en idioma asiático para que no sean
 * predominantes. Conserva todos los no-asiáticos y, como mucho,
 * `ASIAN_MAX_RATIO` de asiáticos respecto a ellos (mínimo `ASIAN_MIN_KEEP`).
 * El orden dentro del pool es indiferente (la rotación diaria lo baraja); lo
 * relevante es la COMPOSICIÓN del conjunto.
 */
export function capAsian(cards) {
  const rest = [];
  const asian = [];
  for (const c of cards || []) {
    if (!c) continue;
    if (DEMOTE_LANGS.has(c.originalLanguage)) asian.push(c);
    else rest.push(c);
  }
  const allowed = Math.max(ASIAN_MIN_KEEP, Math.round(rest.length * ASIAN_MAX_RATIO));
  return [...rest, ...asian.slice(0, allowed)];
}
