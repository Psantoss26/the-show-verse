function normalizeMediaType(value) {
  if (value === "movie") return "movie";
  if (value === "tv" || value === "show") return "tv";
  return null;
}

export function watchedKey(mediaType, tmdbId) {
  const normalizedType = normalizeMediaType(mediaType);
  const normalizedId = Number(tmdbId);
  if (!normalizedType || !Number.isFinite(normalizedId) || normalizedId <= 0) {
    return null;
  }
  return `${normalizedType}:${normalizedId}`;
}

function watchedAtMs(value) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Convierte los eventos canónicos de PostgreSQL en el mismo índice compacto
 * que utiliza el cruce de créditos de TMDb. Una serie puede tener muchas filas
 * (una por episodio), pero para ActorDetails solo necesitamos una entrada por
 * título con el último visionado y el número total de registros.
 */
export function buildBackendWatchedMap(items = []) {
  const watched = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const mediaType = item?.mediaType ?? item?.media_type;
    const tmdbId = item?.tmdbId ?? item?.tmdb_id;
    const key = watchedKey(mediaType, tmdbId);
    if (!key) continue;

    const watchedAt = item?.watchedAt ?? item?.watched_at ?? null;
    const current = watched.get(key);
    watched.set(key, {
      plays: Number(current?.plays || 0) + 1,
      last_watched_at:
        !current || watchedAtMs(watchedAt) > watchedAtMs(current.last_watched_at)
          ? watchedAt
          : current.last_watched_at,
    });
  }

  return watched;
}

export function buildTraktWatchedMap(items = [], mediaType) {
  const watched = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const entity = mediaType === "movie" ? item?.movie : item?.show;
    const key = watchedKey(mediaType, entity?.ids?.tmdb);
    if (!key) continue;

    watched.set(key, {
      plays: Number(item?.plays || 0),
      last_watched_at: item?.last_watched_at || null,
      collected_at: item?.collected_at || null,
    });
  }

  return watched;
}
