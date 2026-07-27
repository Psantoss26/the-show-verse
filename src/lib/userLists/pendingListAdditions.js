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

const STORAGE_KEY = "showverse:pending-list-additions:v1";
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
    at: Date.now(),
    removed: !added,
  };
  data[listType] = bucket;
  writeStore(data);
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
export function prunePendingListChanges(listType, presentKeys) {
  const data = readStore();
  const bucket = data[listType];
  if (!bucket) return;
  const present = presentKeys instanceof Set ? presentKeys : new Set(presentKeys || []);
  const now = Date.now();
  let changed = false;
  for (const [key, entry] of Object.entries(bucket)) {
    const expired = now - (entry?.at || 0) > MAX_AGE_MS;
    // Alta confirmada = ya está en frescos. Baja confirmada = ya NO está.
    const confirmed = entry?.removed ? !present.has(key) : present.has(key);
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
