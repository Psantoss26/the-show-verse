import { slugifyForSeriesGraph } from "@/lib/details/formatters";
import { pickExternalIds, withTitleExternalLinks } from "@/lib/details/titleExternalLinks";

function normalizeUrl(value) {
  if (!value) return null;
  const url = String(value).trim();
  if (!url) return null;
  return url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `https://${url}`;
}

/**
 * Enlaces de referencia de una serie compartidos por sus fichas de temporada
 * y episodio. Son los equivalentes que puede mostrar DetailsClient sin pedir
 * más datos al montar una subficha: con `externalIds` (los de la serie en
 * TMDb) suma Instagram, IMDb, TMDb y Trakt; Wikipedia la añade el modal de
 * enlaces (ver `tvWikipediaQuery`).
 */
export function buildTvExternalLinks({
  showId,
  title,
  originalTitle,
  homepage,
  externalIds = null,
}) {
  const resolvedTitle = String(title || originalTitle || "").trim();
  const seriesGraphTitle = String(originalTitle || title || "").trim();
  const items = [];
  const officialUrl = normalizeUrl(homepage);

  if (officialUrl) {
    items.push({
      id: "web",
      label: "Web oficial",
      icon: "/logo-Web.png",
      href: officialUrl,
    });
  }

  if (resolvedTitle) {
    items.push({
      id: "jw",
      label: "JustWatch",
      icon: "/logo-JustWatch.png",
      href: `https://www.justwatch.com/es/buscar?q=${encodeURIComponent(resolvedTitle)}`,
    });
  }

  if (showId && seriesGraphTitle) {
    items.push({
      id: "sg",
      label: "SeriesGraph",
      icon: "/logoseriesgraph.png",
      href: `https://seriesgraph.com/show/${showId}-${slugifyForSeriesGraph(seriesGraphTitle)}`,
    });
  }

  if (resolvedTitle) {
    items.push({
      id: "fa",
      label: "FilmAffinity",
      icon: "/logoFilmaffinity.png",
      href: `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(resolvedTitle)}&stype=title`,
    });
  }

  const ids = pickExternalIds(externalIds);
  return withTitleExternalLinks(items, {
    instagramId: ids.instagramId,
    type: "tv",
    tmdbId: showId,
    imdbId: ids.imdbId,
  });
}

/** Consulta de Wikipedia de la serie para el modal de enlaces de una subficha. */
export function tvWikipediaQuery({ showId, externalIds = null }) {
  const ids = pickExternalIds(externalIds);
  return { wikidataId: ids.wikidataId, imdbId: ids.imdbId, type: "tv", tmdbId: showId };
}
