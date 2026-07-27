/**
 * El Historial conserva una instantánea en memoria para poder restaurar cientos
 * de registros aunque localStorage se quede sin cuota. Las mutaciones optimistas,
 * en cambio, actualizan localStorage desde otro módulo.
 *
 * Una fecha mayor identifica una instantánea completa más reciente. En caso de
 * empate gana la persistida: mantiene la misma fecha deliberadamente durante
 * una mutación optimista, pero ya contiene el nuevo registro.
 */
export function selectHistoryCacheEnvelope(memory, persisted) {
  if (!memory) return persisted || null;
  if (!persisted) return memory;

  const memoryTime = Number(memory.t);
  const persistedTime = Number(persisted.t);
  const safeMemoryTime = Number.isFinite(memoryTime) ? memoryTime : 0;
  const safePersistedTime = Number.isFinite(persistedTime) ? persistedTime : 0;

  return safePersistedTime >= safeMemoryTime ? persisted : memory;
}

/**
 * Fusiona la primera página canónica con todas las páginas ya restauradas.
 * Cuando una entrada optimista ya tiene equivalente canónico, la sustituye en
 * vez de conservar ambas. Los contadores permiten varias visualizaciones del
 * mismo título en un mismo día sin eliminar más optimistas de las confirmadas.
 */
export function mergeHistoryTopSnapshot(
  previous,
  fresh,
  { idOf, optimisticKeyOf },
) {
  const current = Array.isArray(previous) ? previous : [];
  const incoming = Array.isArray(fresh) ? fresh : [];
  const confirmedByKey = new Map();

  for (const item of incoming) {
    const key = optimisticKeyOf(item);
    if (key) confirmedByKey.set(key, (confirmedByKey.get(key) || 0) + 1);
  }

  const base = current.filter((item) => {
    if (!item?._optimistic) return true;
    const key = optimisticKeyOf(item);
    const remaining = key ? confirmedByKey.get(key) || 0 : 0;
    if (remaining <= 0) return true;
    confirmedByKey.set(key, remaining - 1);
    return false;
  });

  const seen = new Set(base.map((item) => String(idOf(item))));
  const merged = [...base];
  for (const item of incoming) {
    const id = String(idOf(item));
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}

function normalizeHistoryMediaType(value) {
  return value === "tv" ||
    value === "show" ||
    value === "episode" ||
    value === "episodes"
    ? "tv"
    : "movie";
}

function historyEntryMediaType(entry) {
  if (entry?.movie) return "movie";
  if (entry?.show || entry?.episode) return "tv";
  return normalizeHistoryMediaType(entry?.media_type ?? entry?.type);
}

function historyEntryTmdbId(entry) {
  return Number(
    entry?.tmdbId ??
      entry?.tmdb_id ??
      entry?.show_tmdb_id ??
      entry?.tmdb_show_id ??
      entry?.movie?.ids?.tmdb ??
      entry?.show?.ids?.tmdb ??
      entry?.show?.tmdbId ??
      entry?.ids?.tmdb,
  );
}

function historyEntryEpisode(entry) {
  const season = Number(
    entry?.episode?.season ??
      entry?.season ??
      entry?.season_number ??
      entry?.seasonNumber,
  );
  const episode = Number(
    entry?.episode?.number ??
      entry?.episode?.episode ??
      entry?.episode_number ??
      entry?.episodeNumber ??
      entry?.number,
  );
  return {
    season: Number.isFinite(season) ? season : null,
    episode: Number.isFinite(episode) ? episode : null,
  };
}

/**
 * Identifica los registros que una acción de DetailsClient/DetailModal acaba de
 * borrar. Admite tanto la forma anidada de Trakt como la forma plana del backend
 * y la entrada optimista utilizada antes de volver a Historial.
 */
export function historyEntryMatchesTarget(
  entry,
  { mediaType, tmdbId, season, episode },
) {
  const targetId = Number(tmdbId);
  if (!Number.isFinite(targetId) || historyEntryTmdbId(entry) !== targetId) {
    return false;
  }
  if (historyEntryMediaType(entry) !== normalizeHistoryMediaType(mediaType)) {
    return false;
  }

  const targetSeason = Number(season);
  const targetEpisode = Number(episode);
  const needsSeason = season != null && Number.isFinite(targetSeason);
  const needsEpisode = episode != null && Number.isFinite(targetEpisode);
  if (!needsSeason && !needsEpisode) return true;

  const entryEpisode = historyEntryEpisode(entry);
  if (needsSeason && entryEpisode.season !== targetSeason) return false;
  if (needsEpisode && entryEpisode.episode !== targetEpisode) return false;
  return true;
}
