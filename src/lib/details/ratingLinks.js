// src/lib/details/ratingLinks.js
//
// Enlaces de "página correspondiente" para los badges de puntuación (TMDb, Trakt,
// IMDb) de las páginas de detalles. La idea es que el icono de cada servicio
// aparezca SIEMPRE con un enlace utilizable, aunque el título todavía no tenga
// puntuación: si el llamante ya conoce la URL canónica se usa esa; si no, se cae a
// una búsqueda determinista (Trakt por id de TMDb, IMDb por id o por título) para
// que el icono nunca quede sin destino.

function tmdbSegment(type) {
  return type === "tv" || type === "show" ? "tv" : "movie";
}

// TMDb: siempre reconstruible desde el tipo + id de TMDb.
export function buildTmdbHref({ href, type, tmdbId } = {}) {
  if (href) return href;
  if (tmdbId == null) return undefined;
  return `https://www.themoviedb.org/${tmdbSegment(type)}/${tmdbId}`;
}

// Trakt: usa la URL canónica si existe; si no, la búsqueda por id de TMDb, que
// redirige a la ficha del título en Trakt.
export function buildTraktHref({ href, type, tmdbId } = {}) {
  if (href) return href;
  if (tmdbId == null) return undefined;
  const idType = tmdbSegment(type) === "tv" ? "show" : "movie";
  return `https://trakt.tv/search/tmdb/${tmdbId}?id_type=${idType}`;
}

// IMDb: URL directa por id de IMDb; si no se conoce, búsqueda por título (IMDb no
// permite construir la URL de la ficha solo con el id de TMDb).
export function buildImdbHref({ href, imdbId, title } = {}) {
  if (href) return href;
  if (imdbId) return `https://www.imdb.com/title/${imdbId}`;
  const q = (title || "").trim();
  if (q) return `https://www.imdb.com/find/?q=${encodeURIComponent(q)}&s=tt`;
  return undefined;
}
