// src/lib/notificationsCore.js
// Reglas PURAS de la sección de alertas del navbar (sin BD ni red), para poder
// probarlas con node:test. La consulta a la BD vive en notifications.js.

// Tipos de la actividad propia que se avisan. El feed trae más (reseñas,
// listas), pero las alertas se ciñen a las acciones sobre un título.
export const NOTIFICATION_ACTION_TYPES = new Set(['watched', 'rating', 'watchlist', 'favorite']);

// Margen al casar un visionado con su recibo de progreso: los dos se escriben
// con la misma marca de tiempo (observedAt), así que basta con muy poco.
const AUTO_MATCH_TOLERANCE_MS = 5_000;

/**
 * Clave de entidad de un recibo de progreso (`streaming_events.entity_key`):
 * `mediaType:tmdbId:season:episode`, con 0 cuando no hay temporada/episodio.
 */
export function parseEntityKey(entityKey) {
  const [mediaType, tmdbId, season, episode] = String(entityKey || '').split(':');
  const id = Number(tmdbId);
  if (!['movie', 'tv'].includes(mediaType) || !Number.isInteger(id) || id <= 0) return null;
  const s = Number(season) || null;
  const e = Number(episode) || null;
  return {
    mediaType,
    tmdbId: id,
    season: mediaType === 'tv' ? s : null,
    episode: mediaType === 'tv' ? e : null,
  };
}

/** Clave de la nota que cierra el recordatorio de un visionado. */
export function ratingTargetKey({ mediaType, tmdbId, season, episode }) {
  if (mediaType === 'tv' && season != null && episode != null) {
    return `episode:${Number(tmdbId)}:${season}:${episode}`;
  }
  return `${mediaType}:${Number(tmdbId)}`;
}

/** Clave de la reseña (siempre del título: película o serie). */
export function reviewTargetKey({ mediaType, tmdbId }) {
  return `${mediaType}:${Number(tmdbId)}`;
}

/**
 * Recordatorios de puntuar y reseñar lo visto. Uno por TÍTULO —el visionado más
 * reciente—, para que ver una serie del tirón no llene el desplegable con un
 * aviso por episodio. Si lo más reciente ya está puntuado y reseñado, el título
 * no genera aviso (aunque haya episodios anteriores sin nota).
 *
 * @param watchedRows visionados ordenados del más reciente al más antiguo.
 * @param ratedKeys   claves `ratingTargetKey` que el usuario ya ha puntuado.
 * @param reviewedKeys claves `reviewTargetKey` con reseña propia.
 */
export function buildReminders(watchedRows, ratedKeys, reviewedKeys, { limit = 8 } = {}) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(watchedRows) ? watchedRows : []) {
    if (!row?.tmdbId || !['movie', 'tv'].includes(row.mediaType)) continue;
    const key = `${row.mediaType}:${Number(row.tmdbId)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const needsRating = !ratedKeys.has(ratingTargetKey(row));
    const needsReview = !reviewedKeys.has(reviewTargetKey(row));
    if (!needsRating && !needsReview) continue;

    out.push({
      id: `reminder:${ratingTargetKey(row)}:${new Date(row.createdAt).getTime()}`,
      type: 'reminder',
      tmdbId: Number(row.tmdbId),
      mediaType: row.mediaType,
      season: row.mediaType === 'tv' ? row.season ?? null : null,
      episode: row.mediaType === 'tv' ? row.episode ?? null : null,
      title: row.title || null,
      posterPath: row.posterPath || null,
      createdAt: row.createdAt,
      needsRating,
      needsReview,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function sameInstant(a, b) {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) <= AUTO_MATCH_TOLERANCE_MS;
}

function sameItem(a, b) {
  return (
    a.mediaType === b.mediaType &&
    Number(a.tmdbId) === Number(b.tmdbId) &&
    (a.season ?? null) === (b.season ?? null) &&
    (a.episode ?? null) === (b.episode ?? null)
  );
}

/**
 * Separa la actividad propia de los pasos automáticos a visto. Un "visto" que
 * salió de "Continuar viendo" ya tiene su propio aviso, así que no se repite
 * como acción.
 */
export function splitAutoCompleted(actions, autoCompleted) {
  const auto = Array.isArray(autoCompleted) ? autoCompleted : [];
  return (Array.isArray(actions) ? actions : []).filter(
    (action) =>
      action.type !== 'watched' ||
      !auto.some((item) => sameItem(action, item) && sameInstant(action.createdAt, item.createdAt)),
  );
}

/**
 * Entradas AUTOMÁTICAS en "Continuar viendo". Cada recibo de progreso trae si
 * completó el contenido y cómo acabó el recibo anterior de la misma entidad
 * (`prevCompleted`, null si no hay). Un contenido entra en Continuar viendo con
 * su primer recibo en curso, o con el primero después de haberse terminado
 * (un nuevo visionado). El resto son latidos de la misma sesión.
 */
export function detectContinueWatchingAdds(receipts) {
  return (Array.isArray(receipts) ? receipts : [])
    .filter((row) => row && row.completed === false && (row.prevCompleted == null || row.prevCompleted === true))
    .map((row) => {
      const entity = parseEntityKey(row.entityKey);
      if (!entity) return null;
      return { ...entity, id: `cw:${row.id}`, type: 'cw_added', createdAt: row.observedAt };
    })
    .filter(Boolean);
}

/**
 * Momento en que una serie quedó COMPLETA por primera vez: el visionado con el
 * que el nº de episodios distintos vistos alcanzó los emitidos. Mismo criterio
 * que "series completadas" del perfil (computeShowProgress.baseComplete).
 * Devuelve null si no está completa o no se conoce cuántos episodios tiene.
 *
 * @param rowsAsc visionados de la serie, del más ANTIGUO al más reciente.
 * @param isComplete función (playCounts) => boolean; se inyecta para no acoplar
 *        este módulo al cálculo completo del progreso.
 */
export function showCompletionTime(rowsAsc, isComplete) {
  const playCounts = new Map();
  for (const row of Array.isArray(rowsAsc) ? rowsAsc : []) {
    const season = Number(row?.season);
    const episode = Number(row?.episode);
    if (!Number.isInteger(season) || season <= 0 || !Number.isInteger(episode) || episode <= 0) continue;
    const key = `${season}-${episode}`;
    const isNew = !playCounts.has(key);
    playCounts.set(key, (playCounts.get(key) || 0) + 1);
    if (isNew && isComplete(playCounts)) return row.watchedAt;
  }
  return null;
}

/**
 * Siguiente película de una colección tras [watchedId], por orden de estreno,
 * saltando las que ya se han visto. Null si era la última o ya están todas.
 */
export function nextInCollection(parts, watchedId, watchedIds = new Set()) {
  const ordered = (Array.isArray(parts) ? parts : [])
    .filter((part) => Number.isInteger(Number(part?.id)))
    .slice()
    .sort((a, b) => {
      // Sin fecha (sin anunciar) al final.
      const da = a.release_date || '9999';
      const db = b.release_date || '9999';
      return da.localeCompare(db);
    });
  const index = ordered.findIndex((part) => Number(part.id) === Number(watchedId));
  if (index < 0) return null;
  return ordered.slice(index + 1).find((part) => !watchedIds.has(Number(part.id))) || null;
}
