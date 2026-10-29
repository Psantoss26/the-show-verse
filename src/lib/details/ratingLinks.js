// src/lib/details/ratingLinks.js
//
// Enlaces de "página correspondiente" para los badges de puntuación (TMDb, Trakt,
// IMDb) de las páginas de detalles. La idea es que el icono de cada servicio
// aparezca con un enlace utilizable, aunque el título todavía no tenga
// puntuación: si el llamante ya conoce la URL canónica se usa esa; si no, se cae a
// una búsqueda por título para los servicios que no permiten URL directa.

function tmdbSegment(type) {
  return type === "tv" || type === "show" ? "tv" : "movie";
}

// TMDb: siempre reconstruible desde el tipo + id de TMDb.
export function buildTmdbHref({ href, type, tmdbId } = {}) {
  if (href) return href;
  if (tmdbId == null) return undefined;
  return `https://www.themoviedb.org/${tmdbSegment(type)}/${tmdbId}`;
}

// Trakt: usa la URL canónica si existe. La web pública de Trakt ya no resuelve
// de forma fiable `/search/tmdb/:id`, así que el fallback seguro es su búsqueda
// general por título; las pantallas de detalles deben priorizar `traktUrl` del
// scoreboard/status cuando esté disponible.
export function buildTraktHref({ href, title } = {}) {
  if (href) return href;
  const q = (title || "").trim();
  if (!q) return undefined;
  return `https://trakt.tv/search?query=${encodeURIComponent(q)}`;
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

const IMDB_TITLE_ID = /^tt\d+$/;

// IMDb, ficha exacta de un episodio. El primer id válido que no sea el de la serie
// gana, en orden de fiabilidad: el del propio episodio en TMDb (no depende de cómo
// agrupe cada fuente las temporadas), el `tconst` que SeriesGraph ya ha emparejado
// con la ruta de TMDb y el de OMDb. Sin ninguno, cae a `fallbackHref` (la lista de
// episodios de la serie).
export function buildImdbEpisodeHref({
  episodeImdbIds = [],
  showImdbId,
  fallbackHref,
  title,
} = {}) {
  const episodeImdbId = episodeImdbIds.find(
    (id) => typeof id === "string" && IMDB_TITLE_ID.test(id) && id !== showImdbId,
  );
  if (episodeImdbId) return `https://www.imdb.com/es-es/title/${episodeImdbId}/`;
  return buildImdbHref({ href: fallbackHref, imdbId: showImdbId, title });
}
