// src/lib/contentIdMap.js
// Mapa (plataforma, id de contenido) → título de TMDb, sin base de datos para
// poder probarlo aislado. Ver db/schema.js → streaming_content_ids.
//
// El texto del reproductor cambia con cada rediseño de la plataforma y a veces
// trae relleno; el id del contenido no. Una vez resuelto un id, se reutiliza:
//   - el propio usuario: su fila manda (la corrección, siempre; la automática,
//     mientras no la contradiga el reproductor, ver extension-sync);
//   - los demás: cuando al menos `minSupporters` usuarios distintos coinciden
//     en el mismo título y episodio, y ninguno otro empata en cabeza.

// Plataformas cuyo id de reproducción identifica el EPISODIO o la película que
// suena. Prime Video no: su /detail/<id> es la ficha de la serie o temporada. Plex
// tampoco: la URL sigue en la ficha anterior mientras se reproduce.
const ITEM_LEVEL_PLATFORMS = new Set(['netflix', 'max', 'disney', 'crunchyroll']);

const CONTENT_ID_RE = /^[\w.:-]{1,200}$/;

/** Id utilizable para el mapa, o null. */
export function mapContentId(platform, contentId) {
  if (!ITEM_LEVEL_PLATFORMS.has(platform)) return null;
  const id = typeof contentId === 'string' ? contentId.trim() : '';
  return CONTENT_ID_RE.test(id) ? id : null;
}

/**
 * Destino de una fila: película, o episodio concreto. Una serie sin episodio no
 * se guarda (un id de reproducción nunca es la serie entera).
 */
export function contentTarget({ tmdbId, mediaType, season, episode, title, posterPath }) {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;
  if (mediaType === 'movie') {
    return { tmdbId, mediaType, season: null, episode: null, title: title ?? null, posterPath: posterPath ?? null };
  }
  if (mediaType === 'tv' && Number.isInteger(season) && season > 0
    && Number.isInteger(episode) && episode > 0) {
    return { tmdbId, mediaType, season, episode, title: title ?? null, posterPath: posterPath ?? null };
  }
  return null;
}

/**
 * Si una detección registrada enseña al mapa por sí sola: reproducción real,
 * confianza alta y no resuelta ya por el propio mapa.
 */
export function learnsFromDetection({ kind, confidence, source }) {
  return kind === 'playback' && confidence === 'high' && source !== 'content_id';
}

export const targetKey = (t) => `${t.mediaType}:${t.tmdbId}:${t.season ?? ''}:${t.episode ?? ''}`;

/**
 * Decide el título de un id.
 * @param {object|null} own fila del propio usuario
 * @param {Array<{tmdbId, mediaType, season, episode, title, posterPath, supporters}>} ranked
 *   destinos de todos los usuarios con su número de usuarios, de más a menos
 * @returns {null | {scope:'user'|'global', source:'auto'|'correction'|null, tmdbId, mediaType,
 *   season, episode, title, posterPath, supporters?}}
 */
export function decideContent(own, ranked, minSupporters) {
  const pick = (row) => ({
    tmdbId: row.tmdbId,
    mediaType: row.mediaType,
    season: row.season ?? null,
    episode: row.episode ?? null,
    title: row.title ?? null,
    posterPath: row.posterPath ?? null,
  });
  if (own) return { scope: 'user', source: own.source, ...pick(own) };
  const [first, second] = Array.isArray(ranked) ? ranked : [];
  if (!first || (first.supporters ?? 0) < minSupporters) return null;
  if (second && second.supporters === first.supporters) return null;
  return { scope: 'global', source: null, supporters: first.supporters, ...pick(first) };
}
