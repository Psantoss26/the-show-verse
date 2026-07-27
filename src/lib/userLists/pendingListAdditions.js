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
