// contentIdMatch.js — Cuándo se usa el título que el backend conoce para el id de
// contenido de la plataforma (Netflix /watch/<id>…) en vez de buscar por texto.
// Ver backend/src/lib/contentIdMap.js.
//
// La corrección del propio usuario para ese id manda siempre. Lo demás (su
// resolución automática anterior o el consenso de otros usuarios) solo vale si
// el reproductor no lo contradice: otro número de episodio o de temporada, una
// película donde el mapa dice serie (o al revés), un título que el usuario ya
// vetó para este texto o una regla suya que apunta a otro título. En ese caso se
// busca por texto como siempre, y la resolución nueva rehace la fila automática.

/**
 * @param {object|null} content respuesta `content` de /detections/lookup
 * @param {{ override?: {tmdbId:number, mediaType:string}|null, rejected?: Set<string>,
 *   clientSaysMovie?: boolean, seriesEvidence?: boolean, season?: number|null,
 *   episode?: number|null }} evidence lo que dice el reproductor
 * @returns {object|null} el `content` aceptado, o null
 */
export function pickContentMatch(content, evidence = {}) {
  if (!content || !Number.isInteger(content.tmdbId) || !content.mediaType) return null;
  if (content.mediaType === "tv" && !(content.season > 0 && content.episode > 0)) return null;
  if (content.scope === "user" && content.source === "correction") return content;

  const { override, rejected, clientSaysMovie, seriesEvidence, season, episode } = evidence;
  if (content.mediaType === "tv") {
    if (clientSaysMovie) return null;
    if (episode != null && episode !== content.episode) return null;
    if (season != null && season !== content.season) return null;
  } else if (seriesEvidence || episode != null || season != null) {
    return null;
  }
  if (rejected?.has(`${content.mediaType}:${content.tmdbId}`)) return null;
  if (override && (override.tmdbId !== content.tmdbId || override.mediaType !== content.mediaType)) {
    return null;
  }
  return content;
}
