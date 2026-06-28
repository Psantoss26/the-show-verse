// src/lib/userLists/optimisticListCache.js
//
// Actualización OPTIMISTA de las cachés de las páginas de usuario (Favoritos,
// Pendientes, Historial, En progreso).
//
// Problema: cada una de esas páginas pinta al instante su lista desde una caché
// en localStorage (stale-while-revalidate) y luego refresca en segundo plano.
// Cuando el usuario añade un título nuevo desde otra pantalla (ficha, tarjetas
// del dashboard…), la caché aún NO lo contiene, así que al entrar en la página
// los títulos antiguos aparecen al instante pero el nuevo tarda en salir (hasta
// que termina el refresco). Aquí actualizamos la caché correspondiente en cuanto
// la mutación tiene éxito, de modo que el título nuevo aparezca A LA VEZ que el
// resto en el pintado instantáneo. El refresco posterior reescribe la lista
// completa con los datos canónicos, así que el item optimista solo hace de
// puente (no se quedan duplicados ni datos parciales).
//
// IMPORTANTE: ninguna función de este módulo debe lanzar; un fallo aquí jamás
// puede romper la mutación que la invoca.

// ── Núcleo PURO (sin window, testeable) ───────────────────────────────────────

// Antepone `item` a la lista del envelope, deduplicando por `keyOf` (si se pasa)
// para no duplicar un título que ya estuviera. Conserva el resto del envelope
// (t, ratedItems, hasMore…) intacto: NO refrescamos `t`, así la página sigue
// revalidando y reescribe la lista con los datos completos.
export function addItemToEnvelope(envelope, item, { keyOf = null, itemsField = "items" } = {}) {
  const base = envelope && typeof envelope === "object" ? envelope : {};
  const items = Array.isArray(base[itemsField]) ? base[itemsField] : [];
  let rest = items;
  if (keyOf) {
    const k = keyOf(item);
    rest = items.filter((it) => keyOf(it) !== k);
  }
  return { ...base, [itemsField]: [item, ...rest] };
}

// Elimina del envelope los items que cumplan `predicate`.
export function removeItemsFromEnvelope(envelope, predicate, { itemsField = "items" } = {}) {
  const base = envelope && typeof envelope === "object" ? envelope : {};
  const items = Array.isArray(base[itemsField]) ? base[itemsField] : [];
  return { ...base, [itemsField]: items.filter((it) => !predicate(it)) };
}

// ── Construcción de items mínimos PERO renderizables ──────────────────────────
// Se rellenan con valores seguros (null / [] / "") los campos que las tarjetas
// pueden llegar a leer, para que un item optimista nunca rompa el render.

function buildTmdbListItem({ type, mediaId, title, posterPath, backdropPath }) {
  const id = Number(mediaId);
  if (!Number.isFinite(id)) return null;
  const mediaType = type === "tv" || type === "show" ? "tv" : "movie";
  const safeTitle = title || "";
  return {
    id,
    media_type: mediaType,
    title: safeTitle,
    name: safeTitle,
    title_es: safeTitle,
    poster_path: posterPath || null,
    backdrop_path: backdropPath || null,
    release_date: null,
    first_air_date: null,
    vote_average: null,
    genre_ids: [],
    user_rating: null,
    _optimistic: true,
  };
}

function tmdbKeyOf(it) {
  return `${it?.media_type}:${it?.id}`;
}

function buildHistoryEntry({ type, tmdbId, watchedAt, title, posterPath }) {
  const id = Number(tmdbId);
  if (!Number.isFinite(id)) return null;
  const tempId = `optimistic:${id}:${Date.now()}`;
  const watched =
    typeof watchedAt === "string" && watchedAt
      ? watchedAt
      : new Date().toISOString();
  const safeTitle = title || "";
  return {
    id: tempId,
    history_id: tempId,
    type: type || "movie",
    tmdbId: id,
    watched_at: watched,
    title: safeTitle,
    title_es: safeTitle,
    poster_path: posterPath || null,
    backdrop_path: null,
    _optimistic: true,
  };
}

// ── Configuración por lista ───────────────────────────────────────────────────
const LISTS = {
  favorites: { cacheKey: "showverse:favorites:items:v3", keyOf: tmdbKeyOf },
  watchlist: { cacheKey: "showverse:watchlist:items:v3", keyOf: tmdbKeyOf },
  // El historial admite varias entradas del mismo título (varias visualizaciones),
  // así que NO deduplicamos: simplemente anteponemos.
  history: { cacheKey: "showverse:history:items:v4", keyOf: null },
};

// "En progreso" es distinto: la mutación ("episodio visto") no lleva poster ni
// el progreso real, y marcar el ÚLTIMO episodio mueve la serie de "en progreso"
// a "completadas". Construir un item optimista correcto es frágil, así que en su
// lugar INVALIDAMOS las cachés de la página /En progreso al ver un episodio: en
// la siguiente visita hace un fetch fresco (rápido, vía el backend) y muestra la
// lista completa y correcta —con la serie nueva incluida— a la vez. Solo afecta
// a esa página tras una marca de visto; el resto sigue con su pintado instantáneo.
const IN_PROGRESS_CACHE_KEY = "showverse:showverse:in-progress:v6";
const COMPLETED_CACHE_KEY = "showverse:showverse:completed:v4";
const HISTORY_CACHE_KEY = "showverse:history:items:v4";

function removeKeys(keys) {
  try {
    if (typeof window === "undefined") return;
    for (const k of keys) window.localStorage.removeItem(k);
  } catch {
    // ignorar
  }
}

// ── Acceso a localStorage (con guardas) ───────────────────────────────────────
function readCache(cacheKey) {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(cacheKey, envelope) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(cacheKey, JSON.stringify(envelope));
  } catch {
    // modo privado / cuota: ignorar
  }
}

function mutateEnvelope(config, mutator) {
  const envelope = readCache(config.cacheKey);
  // Si NO hay caché previa, no hacemos nada: la página hará un fetch en frío y
  // ya incluirá el título nuevo (no hay pintado obsoleto que corregir).
  if (!envelope) return;
  writeCache(config.cacheKey, mutator(envelope, "items"));
}

// ── API pública ───────────────────────────────────────────────────────────────

function add(list, item) {
  if (!item) return;
  const config = LISTS[list];
  if (!config) return;
  mutateEnvelope(config, (env, itemsField) =>
    addItemToEnvelope(env, item, { keyOf: config.keyOf, itemsField }),
  );
}

function remove(list, predicate) {
  const config = LISTS[list];
  if (!config) return;
  mutateEnvelope(config, (env, itemsField) =>
    removeItemsFromEnvelope(env, predicate, { itemsField }),
  );
}

export function cacheAddFavorite(args) {
  add("favorites", buildTmdbListItem(args));
}
export function cacheRemoveFavorite({ type, mediaId }) {
  const key = `${type === "tv" || type === "show" ? "tv" : "movie"}:${Number(mediaId)}`;
  remove("favorites", (it) => tmdbKeyOf(it) === key);
}

export function cacheAddWatchlist(args) {
  add("watchlist", buildTmdbListItem(args));
}
export function cacheRemoveWatchlist({ type, mediaId }) {
  const key = `${type === "tv" || type === "show" ? "tv" : "movie"}:${Number(mediaId)}`;
  remove("watchlist", (it) => tmdbKeyOf(it) === key);
}

export function cacheAddHistory(args) {
  add("history", buildHistoryEntry(args));
}
export function cacheRemoveHistory(historyId) {
  if (historyId == null) return;
  const target = String(historyId);
  remove(
    "history",
    (it) => String(it?.history_id ?? it?.id) === target,
  );
}

// Marcar visto un episodio/temporada/serie cambia DOS páginas: "En progreso"
// (y Completadas) y el "Historial" (crea entradas de visualización). Invalidamos
// sus cachés para que, en la siguiente visita, pidan la lista fresca y muestren
// las novedades junto al resto, en vez de pintar una caché obsoleta que aún no
// las contiene. Solo afecta a esas páginas tras marcar algo visto; el resto de
// la navegación conserva su pintado instantáneo.
export function clearWatchDerivedCaches() {
  removeKeys([IN_PROGRESS_CACHE_KEY, COMPLETED_CACHE_KEY, HISTORY_CACHE_KEY]);
}
