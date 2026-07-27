// Inserción OPTIMISTA en las listas de usuario.
//
// Las páginas de Favoritos/Pendientes/Historial y las secciones de Perfil pintan
// primero una instantánea cacheada y luego revalidan contra el backend. Un título
// recién añadido desde una ficha NO está en esa instantánea, así que sólo aparece
// cuando termina la revalidación: instantáneo en localhost, pero con un retardo
// visible en producción (latencia de red) → el título "aparece después" del resto.
//
// Este store registra los altas/bajas recientes de cada lista para que las páginas
// los FUSIONEN en su pintado instantáneo (aparecen a la vez que el resto). Cuando
// los datos frescos ya reflejan el cambio, la entrada se poda.

// v2 descarta altas optimistas antiguas que podían conservar pósters ES antes
// de que Favoritos, Pendientes y Puntuaciones recibieran artwork canónico.
const STORAGE_KEY = "showverse:pending-list-additions:v2";
const HISTORY_REMOVALS_BUCKET = "watchedHistoryRemovals";
// Caducidad de seguridad: si un fetch fresco nunca llega a confirmar el alta, la
// entrada expira y no se queda "pegada" para siempre. Se usa una ventana amplia
// (24 h) porque las secciones de Perfil pueden pintar desde caché sin revalidar
// durante toda la sesión: la poda real ocurre en el primer fetch fresco (pestaña
// o sesión nueva); esto solo evita acumulación indefinida.
const MAX_AGE_MS = 1000 * 60 * 60 * 24;

function normalizeMediaType(mediaType) {
  return mediaType === "tv" || mediaType === "show" || mediaType === "episode"
    ? "tv"
    : "movie";
}

function historyRecordId(item) {
  const id = item?.historyId ?? item?.history_id ?? item?.id;
  return id == null ? null : String(id);
}

function historyRecordEpisode(item) {
  const season = Number(
    item?.season ?? item?.seasonNumber ?? item?.season_number,
  );
  const episode = Number(
    item?.episode ?? item?.episodeNumber ?? item?.episode_number,
  );
  return {
    season: Number.isFinite(season) ? season : null,
    episode: Number.isFinite(episode) ? episode : null,
  };
}

function historyRemovalMatchesItem(removal, item) {
  const removalId =
    removal?.historyId == null ? null : String(removal.historyId);
  if (removalId) return historyRecordId(item) === removalId;

  const targetId = Number(removal?.tmdbId);
  const itemId = Number(item?.tmdbId ?? item?.tmdb_id);
  if (!Number.isFinite(targetId) || itemId !== targetId) return false;
  if (
    normalizeMediaType(removal?.mediaType) !==
    normalizeMediaType(item?.mediaType ?? item?.media_type ?? item?.type)
  ) {
    return false;
  }

  const targetSeason = Number(removal?.season);
  const targetEpisode = Number(removal?.episode);
  const needsSeason =
    removal?.season != null && Number.isFinite(targetSeason);
  const needsEpisode =
    removal?.episode != null && Number.isFinite(targetEpisode);
  if (!needsSeason && !needsEpisode) return true;

  const itemEpisode = historyRecordEpisode(item);
  if (needsSeason && itemEpisode.season !== targetSeason) return false;
  if (needsEpisode && itemEpisode.episode !== targetEpisode) return false;
  return true;
}

export function pendingItemKey(mediaType, tmdbId) {
  return `${normalizeMediaType(mediaType)}:${Number(tmdbId)}`;
}

function readStore() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeStore(data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Sin persistencia (modo privado/cuota): la fusión en memoria de esta sesión
    // no aplica, pero nunca debe romper la mutación.
  }
}

/**
 * Registra un alta (`added=true`) o baja (`added=false`) optimista en una lista.
 * @param {string} listType  favorites | watchlist | ratings | watched
 * @param {{tmdbId:number|string, mediaType:string, title?:string, posterPath?:string, rating?:number}} item
 * @param {boolean} added
 */
export function recordPendingListChange(listType, item, added) {
  const tmdbId = item?.tmdbId ?? item?.id;
  if (typeof window === "undefined" || !listType || !tmdbId) return;
  const key = pendingItemKey(item?.mediaType ?? item?.media_type, tmdbId);
  const data = readStore();
  const bucket = data[listType] || {};
  bucket[key] = {
    key,
    tmdbId: Number(tmdbId),
    mediaType: normalizeMediaType(item?.mediaType ?? item?.media_type),
    title: item?.title ?? item?.name ?? null,
    posterPath: item?.posterPath ?? item?.poster_path ?? null,
    rating: typeof item?.rating === "number" ? item.rating : null,
    historyId:
      item?.historyId ?? item?.history_id ?? null,
    at: Date.now(),
    removed: !added,
  };
  data[listType] = bucket;
  writeStore(data);
}

/**
 * Conserva la baja de un registro de Historial mientras Diario sigue mostrando
 * una instantánea anterior en sessionStorage. Admite una reproducción concreta
 * o todos los registros de un título/temporada/episodio.
 */
export function recordPendingHistoryRemoval({
  historyId,
  mediaType,
  tmdbId,
  season,
  episode,
} = {}) {
  if (typeof window === "undefined") return;
  const exactId = historyId == null ? null : String(historyId);
  const numericTmdbId = Number(tmdbId);
  if (!exactId && !Number.isFinite(numericTmdbId)) return;

  const normalizedType = normalizeMediaType(mediaType);
  const key = exactId
    ? `id:${exactId}`
    : [
        "target",
        normalizedType,
        numericTmdbId,
        season ?? "*",
        episode ?? "*",
      ].join(":");
  const data = readStore();
  const bucket = data[HISTORY_REMOVALS_BUCKET] || {};
  bucket[key] = {
    historyId: exactId,
    mediaType: normalizedType,
    tmdbId: Number.isFinite(numericTmdbId) ? numericTmdbId : null,
    season: season ?? null,
    episode: episode ?? null,
    at: Date.now(),
  };
  data[HISTORY_REMOVALS_BUCKET] = bucket;
  writeStore(data);
}

export function getPendingHistoryRemovals() {
  const bucket = readStore()[HISTORY_REMOVALS_BUCKET] || {};
  const now = Date.now();
  return Object.values(bucket).filter(
    (entry) =>
      entry &&
      now - Number(entry.at || 0) >= 0 &&
      now - Number(entry.at || 0) <= MAX_AGE_MS,
  );
}

export function filterPendingHistoryRemovals(
  items,
  removals = getPendingHistoryRemovals(),
) {
  const source = Array.isArray(items) ? items : [];
  const activeRemovals = Array.isArray(removals) ? removals : [];
  if (!activeRemovals.length) return items;
  return source.filter(
    (item) =>
      !activeRemovals.some((removal) =>
        historyRemovalMatchesItem(removal, item),
      ),
  );
}

/**
 * Sustituye silenciosamente la ventana superior de Diario por la respuesta
 * fresca y conserva las páginas antiguas ya cargadas. Así una baja del servidor
 * desaparece sin vaciar la sección ni perder el punto de scroll.
 */
export function mergeFreshDiaryItems(
  cachedItems,
  freshItems,
  { freshHasMore = false } = {},
) {
  const cached = Array.isArray(cachedItems) ? cachedItems : [];
  const fresh = Array.isArray(freshItems) ? freshItems : [];
  if (!freshHasMore) return fresh;

  const freshIds = new Set(
    fresh.map(historyRecordId).filter(Boolean),
  );
  const freshTimes = fresh
    .map((item) => {
      const value = item?.watchedAt ?? item?.watched_at;
      return new Date(value).getTime();
    })
    .filter(Number.isFinite);
  const oldestFreshTime = freshTimes.length
    ? Math.min(...freshTimes)
    : null;

  const preserved = cached.filter((item) => {
    const id = historyRecordId(item);
    if (id && freshIds.has(id)) return false;
    if (oldestFreshTime == null) return true;
    const value = item?.watchedAt ?? item?.watched_at;
    const watchedAt = new Date(value).getTime();
    return !Number.isFinite(watchedAt) || watchedAt <= oldestFreshTime;
  });
  return [...fresh, ...preserved];
}

function profileListItemKey(item) {
  const tmdbId = item?.tmdbId ?? item?.tmdb_id ?? item?.id;
  if (tmdbId == null) return null;
  return pendingItemKey(
    item?.mediaType ?? item?.media_type ?? item?.type,
    tmdbId,
  );
}

function profileListItemDate(item) {
  const value =
    item?.ratedAt ??
    item?.rated_at ??
    item?.addedAt ??
    item?.added_at;
  const timestamp = value == null ? NaN : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildPendingProfileListItem(entry, section, existing = null) {
  const current = existing && typeof existing === "object" ? existing : {};
  const dateField = section === "ratings" ? "ratedAt" : "addedAt";
  const item = {
    ...current,
    tmdbId: Number(entry.tmdbId),
    mediaType: normalizeMediaType(entry.mediaType),
    title: entry.title || current.title || current.name || "",
    posterPath:
      entry.posterPath ||
      current.posterPath ||
      current.poster_path ||
      null,
    [dateField]: new Date(entry.at || Date.now()).toISOString(),
    _optimistic: true,
  };
  if (section === "ratings" && typeof entry.rating === "number") {
    item.rating = entry.rating;
  }
  return item;
}

/**
 * Aplica al snapshot paginado de Perfil los cambios optimistas de las listas
 * simples. Las altas se colocan en la cabecera y las actualizaciones de una
 * puntuación reemplazan el valor anterior sin duplicar la tarjeta.
 */
export function mergePendingProfileListItems(
  items,
  section,
  { additions = [], removedKeys = new Set() } = {},
) {
  const source = Array.isArray(items) ? items : [];
  const removed =
    removedKeys instanceof Set
      ? removedKeys
      : new Set(removedKeys || []);
  const validAdditions = (Array.isArray(additions) ? additions : []).filter(
    (entry) => entry?.key && Number.isFinite(Number(entry?.tmdbId)),
  );
  if (!removed.size && !validAdditions.length) return items;

  const existingByKey = new Map(
    source
      .map((item) => [profileListItemKey(item), item])
      .filter(([key]) => Boolean(key)),
  );
  const addedKeys = new Set(validAdditions.map((entry) => entry.key));
  const base = source.filter((item) => {
    const key = profileListItemKey(item);
    return !removed.has(key) && !addedKeys.has(key);
  });
  const prepend = validAdditions
    .filter((entry) => !removed.has(entry.key))
    .map((entry) =>
      buildPendingProfileListItem(
        entry,
        section,
        existingByKey.get(entry.key),
      ),
    );
  return [...prepend, ...base];
}

/**
 * Reemplaza la ventana superior de una sección paginada de Perfil con datos
 * frescos y conserva las páginas antiguas ya cargadas. Los elementos que
 * desaparecieron dentro de la ventana autoritativa no sobreviven en la caché.
 */
export function mergeFreshProfileListItems(
  cachedItems,
  freshItems,
  { freshHasMore = false } = {},
) {
  const cached = Array.isArray(cachedItems) ? cachedItems : [];
  const fresh = Array.isArray(freshItems) ? freshItems : [];
  if (!freshHasMore) return fresh;

  const freshKeys = new Set(
    fresh.map(profileListItemKey).filter(Boolean),
  );
  const freshTimes = fresh
    .map(profileListItemDate)
    .filter((value) => value != null);
  const oldestFreshTime = freshTimes.length
    ? Math.min(...freshTimes)
    : null;
  const preserved = cached.filter((item) => {
    const key = profileListItemKey(item);
    if (key && freshKeys.has(key)) return false;
    if (oldestFreshTime == null) return true;
    const timestamp = profileListItemDate(item);
    return timestamp == null || timestamp <= oldestFreshTime;
  });
  return [...fresh, ...preserved];
}

/**
 * Cambios vigentes (no caducados) de una lista.
 * @returns {{additions: Array, removedKeys: Set<string>}}
 */
export function getPendingListChanges(listType) {
  const bucket = readStore()[listType] || {};
  const now = Date.now();
  const additions = [];
  const removedKeys = new Set();
  for (const entry of Object.values(bucket)) {
    if (!entry || now - (entry.at || 0) > MAX_AGE_MS) continue;
    if (entry.removed) removedKeys.add(entry.key);
    else additions.push(entry);
  }
  // Más recientes primero (los usuarios esperan ver lo último añadido arriba).
  additions.sort((a, b) => (b.at || 0) - (a.at || 0));
  return { additions, removedKeys };
}

function buildPendingTmdbItem(entry, addedIndex) {
  const mediaType = normalizeMediaType(entry?.mediaType);
  const title = entry?.title || "";
  return {
    id: Number(entry?.tmdbId),
    media_type: mediaType,
    title,
    name: title,
    title_es: title,
    poster_path: entry?.posterPath || null,
    backdrop_path: null,
    release_date: null,
    first_air_date: null,
    vote_average: null,
    genre_ids: [],
    user_rating: typeof entry?.rating === "number" ? entry.rating : null,
    _addedIndex: addedIndex,
    _optimistic: true,
  };
}

/**
 * Fusiona cambios pendientes con la forma de datos que consumen las páginas
 * completas de Favoritos y Pendientes. Es pura para poder verificar que el
 * primer lote ya contiene las altas recientes y no las inserta en otro render.
 */
export function mergePendingTmdbItems(
  items,
  { additions = [], removedKeys = new Set() } = {},
) {
  const source = Array.isArray(items) ? items : [];
  const removed = removedKeys instanceof Set
    ? removedKeys
    : new Set(removedKeys || []);
  const base = removed.size
    ? source.filter((item) => !removed.has(pendingItemKey(item?.media_type, item?.id)))
    : source;
  const present = new Set(
    base.map((item) => pendingItemKey(item?.media_type, item?.id)),
  );
  const missing = additions.filter((entry) => !present.has(entry?.key));

  if (!missing.length && base.length === source.length) return items;

  const minAddedIndex = base.reduce(
    (minimum, item) =>
      Math.min(minimum, Number.isFinite(Number(item?._addedIndex))
        ? Number(item._addedIndex)
        : 0),
    0,
  );
  const prepend = missing.map((entry, index) =>
    buildPendingTmdbItem(
      entry,
      minAddedIndex - missing.length + index,
    ),
  );
  return prepend.length ? [...prepend, ...base] : base;
}

export function mergePendingTmdbListItems(items, listType) {
  return mergePendingTmdbItems(items, getPendingListChanges(listType));
}

/**
 * Poda las entradas ya confirmadas por los datos frescos (o caducadas). `presentKeys`
 * = claves (pendingItemKey) que YA vienen en la respuesta fresca del backend.
 */
export function prunePendingListChanges(
  listType,
  presentKeys,
  { completeSnapshot = true } = {},
) {
  const data = readStore();
  const bucket = data[listType];
  if (!bucket) return;
  const present = presentKeys instanceof Set ? presentKeys : new Set(presentKeys || []);
  const now = Date.now();
  let changed = false;
  for (const [key, entry] of Object.entries(bucket)) {
    const expired = now - (entry?.at || 0) > MAX_AGE_MS;
    // Alta confirmada = ya está en frescos. Una baja solo puede confirmarse por
    // ausencia cuando la respuesta cubre TODA la lista; en una página parcial,
    // el título podría encontrarse en un lote posterior.
    const confirmed = entry?.removed
      ? completeSnapshot && !present.has(key)
      : present.has(key);
    if (expired || confirmed) {
      delete bucket[key];
      changed = true;
    }
  }
  if (changed) {
    data[listType] = bucket;
    writeStore(data);
  }
}
