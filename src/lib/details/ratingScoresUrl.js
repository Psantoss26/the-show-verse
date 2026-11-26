// src/lib/details/ratingScoresUrl.js
//
// URL de /api/links/ratings/scores para UNA fuente. Compartida por el hook del
// cliente (useRatingScores), su arranque al tocar un enlace
// (RatingScoresPrefetch) y la precarga en el HTML de la ficha
// (RatingScoresPreload): una precarga solo se aprovecha si la URL es
// EXACTAMENTE la misma, parámetros y orden incluidos.

export function ratingScoreSourcesFor(type) {
  if (type === "movie") return ["rt", "mc", "lb"];
  if (type === "tv") return ["rt", "mc"];
  return [];
}

export function ratingScoresUrl(type, tmdbId, source) {
  return `/api/links/ratings/scores?${new URLSearchParams({ type, tmdbId: String(tmdbId), source })}`;
}

// /details/movie/27205 o /details/tv/1396 (la ficha, no temporadas ni
// episodios) → { type, tmdbId } | null.
export function ratingScoresTargetFromPath(pathname) {
  const match = /^\/details\/(movie|tv)\/([1-9]\d{0,9})\/?$/.exec(String(pathname || ""));
  return match ? { type: match[1], tmdbId: match[2] } : null;
}
