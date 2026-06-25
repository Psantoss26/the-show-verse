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

const SOFT_LIMITED_GENRES = new Set([
  16, // Animation
  99, // Documentary
]);

const SOFT_LIMIT_QUALITY = {
  movie: {
    goodVotes: 900,
    goodRating: 7.0,
    standoutVotes: 2500,
    standoutRating: 7.7,
  },
  tv: {
    goodVotes: 250,
    goodRating: 7.1,
    standoutVotes: 700,
    standoutRating: 7.8,
  },
};

const PREFERRED_LANGS = new Set(['en', 'es']);
const PREFERRED_COUNTRIES = new Set(['US', 'ES']);

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

function genreIds(card) {
  return Array.isArray(card?.genreIds) ? card.genreIds : [];
}

function mediaTypeOf(card) {
  return card?.mediaType === 'tv' ? 'tv' : 'movie';
}

function originCountries(card) {
  return Array.isArray(card?.originCountry) ? card.originCountry : [];
}

export function localePriorityWeight(card) {
  const lang = card?.originalLanguage || null;
  const countries = originCountries(card);
  const hasPreferredLang = PREFERRED_LANGS.has(lang);
  const hasPreferredCountry = countries.some((country) => PREFERRED_COUNTRIES.has(country));

  if (hasPreferredLang && hasPreferredCountry) return 1.18;
  if (hasPreferredCountry) return 1.13;
  if (hasPreferredLang) return 1.1;
  return 1;
}

export function isSoftLimitedContent(card) {
  const ids = genreIds(card);
  const hasSoftGenre = ids.some((id) => SOFT_LIMITED_GENRES.has(id));
  const isAnimeLike = card?.originalLanguage === 'ja' && ids.includes(16);
  return hasSoftGenre || isAnimeLike;
}

export function softLimitedContentWeight(card) {
  if (!isSoftLimitedContent(card)) return 1;

  const type = mediaTypeOf(card);
  const quality = SOFT_LIMIT_QUALITY[type] || SOFT_LIMIT_QUALITY.movie;
  const votes = Number(card?.voteCount) || 0;
  const rating = Number(card?.voteAverage) || 0;

  if (votes >= quality.standoutVotes && rating >= quality.standoutRating) {
    return 0.94;
  }
  if (votes >= quality.goodVotes && rating >= quality.goodRating) {
    return 0.78;
  }
  return 0.58;
}

export function contentPriorityWeight(card) {
  return softLimitedContentWeight(card) * localePriorityWeight(card);
}

export function balanceSoftLimitedContent(cards) {
  return (cards || [])
    .map((card, index, list) => ({
      card,
      index,
      weightedRank: (list.length - index) * contentPriorityWeight(card),
    }))
    .sort((a, b) => b.weightedRank - a.weightedRank || a.index - b.index)
    .map(({ card }) => card);
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
