// src/lib/navigation/titlePeek.mjs
// Qué título enseña la vista previa de pulsación larga (MobileTitlePeek) según
// el elemento que se mantiene pulsado. Sin dependencias: es puro y testeable.
//
// Las tarjetas de la app llegan de dos formas:
//   - un enlace a la ficha (`<a href="/details/movie/603">`): casi todas las
//     páginas (Películas, Series, Descubrir, Favoritas, Pendientes, Historial,
//     listas, perfil…). No hace falta tocarlas: el `href` ya dice el título;
//   - un botón que abre la ficha rápida (`onClick={() => openDetailModal(item)}`):
//     las filas de los dashboards. Esas declaran el título con el atributo
//     `data-sv-peek` (ver `titlePeekAttrs`).
//
// Cuentan películas, series y episodios, y las temporadas de la sección
// Temporadas de la ficha de una serie (solo por el atributo: un enlace a una
// temporada sigue con su comportamiento de siempre). Personas, colecciones o
// listas no tienen vista previa.

import { getMediaTypeForItem } from "../dashboard/mediaType.mjs";

export const TITLE_PEEK_ATTR = "data-sv-peek";

// Elementos que la vista previa reconoce. `[data-sv-no-peek]` la desactiva en
// un bloque concreto (la propia vista previa, por ejemplo).
export const TITLE_PEEK_SELECTOR = `a[href*="/details/"], [${TITLE_PEEK_ATTR}]`;

const DETAILS_PATH_RE =
  /^\/details\/(movie|tv)\/(\d+)(?:\/season\/(\d+)\/episode\/(\d+))?\/?$/;

const toId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// `/details/tv/1399/season/1/episode/2?x=1` → item de la ficha rápida.
export function titlePeekItemFromHref(href, base = "https://showverse.local") {
  if (typeof href !== "string" || !href) return null;
  let url;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  // Un enlace a otra web (IMDb, TMDb…) que casualmente lleve /details/.
  if (url.origin !== new URL(base).origin) return null;

  const match = DETAILS_PATH_RE.exec(url.pathname);
  if (!match) return null;
  const [, type, rawId, rawSeason, rawEpisode] = match;
  const id = toId(rawId);
  if (id == null) return null;

  if (rawSeason != null) {
    if (type !== "tv") return null;
    const seasonNumber = Number(rawSeason);
    const episodeNumber = Number(rawEpisode);
    return {
      media_type: "episode",
      id,
      showId: id,
      seasonNumber,
      episodeNumber,
      detailsHref: url.pathname,
    };
  }

  return { id, media_type: type, detailsHref: url.pathname };
}

// Valor de `data-sv-peek`: «movie:603», «tv:1399», «tv:1399:1:2» (episodio)
// o «season:1399:1» (temporada).
export function titlePeekItemFromAttr(value) {
  if (typeof value !== "string" || !value) return null;
  const [type, rawId, rawSeason, rawEpisode] = value.split(":");
  if (type === "season") {
    const showId = toId(rawId);
    const seasonNumber = Number(rawSeason);
    if (showId == null || rawSeason === "" || !Number.isInteger(seasonNumber) || seasonNumber < 0) {
      return null;
    }
    return {
      media_type: "season",
      id: showId,
      showId,
      seasonNumber,
      detailsHref: `/details/tv/${showId}/season/${seasonNumber}`,
    };
  }
  if (type !== "movie" && type !== "tv") return null;
  const id = toId(rawId);
  if (id == null) return null;
  if (rawSeason != null && rawEpisode != null && type === "tv") {
    return titlePeekItemFromHref(
      `/details/tv/${id}/season/${Number(rawSeason)}/episode/${Number(rawEpisode)}`,
    );
  }
  return { id, media_type: type };
}

// Atributos para una tarjeta sin enlace: `<button {...titlePeekAttrs(item)}>`.
// El tipo se deduce del item si no se pasa. Sin id no añade nada.
export function titlePeekAttrs(item, mediaType) {
  const id = toId(item?.id ?? item?.tmdbId ?? item?.tmdb_id);
  const type = mediaType ?? getMediaTypeForItem(item);
  if (id == null || (type !== "movie" && type !== "tv")) return {};
  return { [TITLE_PEEK_ATTR]: `${type}:${id}` };
}

// Atributos para la tarjeta de una temporada (sección Temporadas de la ficha).
export function titlePeekSeasonAttrs(showId, seasonNumber) {
  const id = toId(showId);
  const season = Number(seasonNumber);
  if (id == null || !Number.isInteger(season) || season < 0) return {};
  return { [TITLE_PEEK_ATTR]: `season:${id}:${season}` };
}

// Movimiento del dedo a partir del cual la pulsación es un desplazamiento y no
// una pulsación larga (px). El mismo margen que da el navegador a un toque.
export const TITLE_PEEK_MOVE_TOLERANCE = 10;
// Tiempo que hay que mantener el dedo (ms). Algo por debajo del menú
// contextual del sistema (~500 ms), que así no llega a abrirse.
export const TITLE_PEEK_HOLD_MS = 420;

export function exceedsPeekMoveTolerance(start, point) {
  if (!start || !point) return true;
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  return dx * dx + dy * dy > TITLE_PEEK_MOVE_TOLERANCE * TITLE_PEEK_MOVE_TOLERANCE;
}
