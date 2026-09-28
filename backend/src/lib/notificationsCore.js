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

/**
 * Clave de la nota que cierra un recordatorio. Película y serie comparten la
 * forma `mediaType:tmdbId`; la temporada y el episodio llevan su número.
 */
export function ratingTargetKey({ mediaType, tmdbId, season, episode }) {
  const id = Number(tmdbId);
  if (mediaType === 'episode' || (mediaType === 'tv' && season != null && episode != null)) {
    return `episode:${id}:${season}:${episode}`;
  }
  if (mediaType === 'season' || (mediaType === 'tv' && season != null)) {
    return `season:${id}:${season}`;
  }
  return `${mediaType}:${id}`;
}

/** Clave de la reseña (siempre del título: película o serie). */
export function reviewTargetKey({ mediaType, tmdbId }) {
  return `${mediaType}:${Number(tmdbId)}`;
}

/**
 * Momento en que un visionado cuenta para las alertas. Lo normal es la fecha
 * del visionado, pero un "visto" registrado a mano con fecha pasada ("lo vi el
 * mes pasado") se avisa cuando se registró. Solo si la inserción fue de UN
 * título (`singleTitle`): una importación mete muchos títulos de golpe y no
 * debe llenar las alertas de recordatorios de cosas vistas hace años.
 */
export function watchEventAt({ watchedAt, createdAt, singleTitle }) {
  const watched = new Date(watchedAt);
  const created = new Date(createdAt);
  if (!singleTitle || Number.isNaN(created.getTime())) return watched;
  if (Number.isNaN(watched.getTime())) return created;
  return created > watched ? created : watched;
}

/**
 * Visionados con los que se TERMINÓ algo por primera vez: una temporada (todos
 * sus episodios emitidos vistos) o la serie entera. Mismo criterio que
 * "series completadas" del perfil.
 *
 * @param rowsAsc visionados de UNA serie (con `id`), del más antiguo al más
 *        reciente y, a igual fecha, por temporada y episodio.
 * @param seasonEpisodeCounts temporada -> nº de episodios emitidos.
 * @param isShowComplete función (playCounts) => boolean.
 * @returns {{ seasons: Map<string, number>, showRowId: string|null }}
 *          `seasons`: id del visionado -> temporada que completó.
 */
export function completionMarks(rowsAsc, seasonEpisodeCounts, isShowComplete) {
  const seasons = new Map();
  let showRowId = null;
  const playCounts = new Map();
  const seasonSeen = new Map();
  for (const row of Array.isArray(rowsAsc) ? rowsAsc : []) {
    const season = Number(row?.season);
    const episode = Number(row?.episode);
    if (!Number.isInteger(season) || season <= 0 || !Number.isInteger(episode) || episode <= 0) continue;
    const key = `${season}-${episode}`;
    const isNew = !playCounts.has(key);
    playCounts.set(key, (playCounts.get(key) || 0) + 1);
    if (!isNew) continue;

    const aired = Number(seasonEpisodeCounts?.[season] || 0);
    if (aired > 0 && episode <= aired) {
      const count = (seasonSeen.get(season) || 0) + 1;
      seasonSeen.set(season, count);
      if (count === aired) seasons.set(String(row.id), season);
    }
    if (showRowId == null && isShowComplete(playCounts)) showRowId = String(row.id);
  }
  return { seasons, showRowId };
}

/**
 * Recordatorios de puntuar y reseñar lo terminado:
 *   - película: puntuar y reseñar;
 *   - serie completada: puntuar y reseñar la serie;
 *   - temporada completada: puntuar la temporada;
 *   - episodio: puntuar el episodio.
 * La reseña solo se pide al terminar una película o una serie. Cada aviso solo
 * sale si falta lo que pide, venga el visionado de la sincronización o de un
 * registro manual.
 *
 * Un visionado da UN aviso, el del nivel más alto que falte: el episodio que
 * cierra una temporada avisa de la temporada, y si además cierra la serie, de
 * la serie. Por serie hay como mucho un aviso de cada nivel, y el de episodio
 * solo mira el visionado más reciente, para que ver una serie del tirón no
 * llene el desplegable con un aviso por episodio.
 *
 * @param watchedRows visionados (con `id`) ordenados del más reciente al más
 *        antiguo; `createdAt` es el momento del aviso.
 * @param ratedKeys   claves `ratingTargetKey` que el usuario ya ha puntuado.
 * @param reviewedKeys claves `reviewTargetKey` con reseña propia.
 * @param completions `tmdbId` -> resultado de `completionMarks` de esa serie.
 */
export function buildReminders(watchedRows, ratedKeys, reviewedKeys, { completions = new Map(), limit = 8 } = {}) {
  const out = [];
  const seenTitles = new Set();
  const showState = new Map();

  const push = (row, level, needsRating, needsReview) => {
    const season = level === 'episode' || level === 'season' ? row.season ?? null : null;
    const episode = level === 'episode' ? row.episode ?? null : null;
    const target = ratingTargetKey({ mediaType: row.mediaType, tmdbId: row.tmdbId, season, episode });
    out.push({
      id: `reminder:${target}:${new Date(row.createdAt).getTime()}`,
      type: 'reminder',
      level,
      tmdbId: Number(row.tmdbId),
      mediaType: row.mediaType,
      season,
      episode,
      title: row.title || null,
      posterPath: row.posterPath || null,
      createdAt: row.createdAt,
      needsRating,
      needsReview,
    });
  };

  for (const row of Array.isArray(watchedRows) ? watchedRows : []) {
    if (!row?.tmdbId || !['movie', 'tv'].includes(row.mediaType)) continue;
    const titleKey = reviewTargetKey(row);

    if (row.mediaType === 'movie') {
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);
      const needsRating = !ratedKeys.has(ratingTargetKey(row));
      const needsReview = !reviewedKeys.has(titleKey);
      if (needsRating || needsReview) push(row, 'movie', needsRating, needsReview);
      continue;
    }

    // Serie: sin temporada/episodio no hay nada que puntuar por visionado.
    if (row.season == null || row.episode == null) continue;
    const state = showState.get(titleKey) || { latestSeen: false, show: false, season: false };
    showState.set(titleKey, state);
    const isLatest = !state.latestSeen;
    state.latestSeen = true;

    const marks = completions.get(Number(row.tmdbId));
    const rowId = String(row.id);

    if (marks?.showRowId === rowId) {
      const needsRating = !ratedKeys.has(ratingTargetKey({ mediaType: 'tv', tmdbId: row.tmdbId }));
      const needsReview = !reviewedKeys.has(titleKey);
      if (needsRating || needsReview) {
        if (!state.show) push(row, 'show', needsRating, needsReview);
        state.show = true;
        continue;
      }
    }

    const completedSeason = marks?.seasons?.get(rowId);
    if (completedSeason != null) {
      const seasonKey = ratingTargetKey({ mediaType: 'season', tmdbId: row.tmdbId, season: completedSeason });
      if (!ratedKeys.has(seasonKey)) {
        if (!state.season) push({ ...row, season: completedSeason }, 'season', true, false);
        state.season = true;
        continue;
      }
    }

    if (isLatest && !ratedKeys.has(ratingTargetKey(row))) push(row, 'episode', true, false);
  }

  return out
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
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
