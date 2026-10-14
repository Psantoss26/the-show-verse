// Nombres de los títulos (inglés, español y original) para el buscador de las
// páginas de usuario. Cada página trae UN nombre por título —el de la ficha
// es-ES o, si llegó de una importación, el inglés—, así que, cuando el usuario
// escribe en el buscador, se piden los de los títulos cargados a
// /api/tmdb/title-names (por lotes, una vez por título) y titleMatchesQuery
// los consulta aquí. Se recuerdan en localStorage: los nombres de un id no
// cambian.

const ENDPOINT = "/api/tmdb/title-names";
const BATCH = 100;
// Cada lote nuevo son hasta 100 fichas de TMDb en el backend: pocos a la vez.
const MAX_PARALLEL_BATCHES = 2;
const STORAGE_KEY = "showverse:titleNames:v1";
const STORAGE_MAX = 6000;

const names = new Map(); // "movie:603" → ["The Matrix", "Matrix"] ([] si no hay)
const inflight = new Set();
const queue = [];
const listeners = new Set();
let running = 0;
let version = 0;
let loaded = false;
let saveTimer = null;

function namesOf(value) {
  if (!value || typeof value !== "object") return [];
  const unique = [];
  for (const name of Array.isArray(value) ? value : [value.en, value.es, value.original]) {
    if (typeof name === "string" && name.trim() && !unique.includes(name.trim())) unique.push(name.trim());
  }
  return unique;
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      for (const [key, value] of Object.entries(saved)) {
        if (!names.has(key)) names.set(key, namesOf(value));
      }
    }
  } catch {
    // Sin almacenamiento se vuelven a pedir: el backend los tiene en caché.
  }
}

function save() {
  if (typeof window === "undefined" || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      // Los más recientes al final: si hay demasiados se quedan esos.
      const entries = [...names].slice(-STORAGE_MAX);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      // Cuota llena o almacenamiento bloqueado: vale con la memoria.
    }
  }, 500);
}

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizedType(value) {
  const type = String(value || "").toLowerCase();
  if (type === "movie" || type === "movies" || type === "film") return "movie";
  if (["tv", "show", "shows", "series", "season", "episode", "episodes"].includes(type)) return "tv";
  return null;
}

// Id de TMDb de un objeto. Con `ids` (forma Trakt) solo vale ids.tmdb: su `id`
// suele ser el de Trakt o el de la fila.
function tmdbIdOf(object) {
  if (!object || typeof object !== "object") return null;
  if (object.ids && typeof object.ids === "object") return positiveId(object.ids.tmdb ?? object.tmdbId);
  return positiveId(object.tmdbId ?? object.tmdb_id ?? object.tmdb ?? object.id);
}

/**
 * "movie:603" / "tv:1396" de un elemento de cualquier página (TMDb, Trakt,
 * backend), o null. Un episodio o una temporada cuentan como su serie.
 */
export function titleNameKey(item) {
  if (!item || typeof item !== "object") return null;

  if (item.show && typeof item.show === "object") {
    const id = positiveId(item.show_tmdb_id ?? item.tmdb_show_id) || tmdbIdOf(item.show);
    if (id) return `tv:${id}`;
  }
  if (item.movie && typeof item.movie === "object") {
    const id = tmdbIdOf(item.movie);
    if (id) return `movie:${id}`;
  }

  let type = normalizedType(item.media_type ?? item.mediaType ?? item.type);
  if (!type) {
    if (item.release_date || item.original_title) type = "movie";
    else if (item.first_air_date || item.original_name) type = "tv";
  }
  if (!type) return null;
  const id =
    type === "tv"
      ? positiveId(item.show_tmdb_id ?? item.tmdb_show_id ?? item.showTmdbId) || tmdbIdOf(item)
      : tmdbIdOf(item);
  return id ? `${type}:${id}` : null;
}

/** Nombres ya conocidos de un elemento (vacío si aún no se han pedido). */
export function getTitleNames(item) {
  load();
  const key = titleNameKey(item);
  return (key && names.get(key)) || [];
}

/** Guarda { "movie:603": { en, es, original } | null, … } y avisa a las páginas. */
export function rememberTitleNames(received) {
  if (!received || typeof received !== "object") return;
  let changed = false;
  for (const [key, value] of Object.entries(received)) {
    if (!/^(movie|tv):\d+$/.test(key)) continue;
    names.set(key, namesOf(value));
    changed = true;
  }
  if (changed) {
    save();
    notify();
  }
}

async function fetchBatch(keys) {
  try {
    const res = await fetch(`${ENDPOINT}?keys=${encodeURIComponent(keys.join(","))}`, {
      credentials: "omit",
    });
    if (!res.ok) return;
    const json = await res.json().catch(() => null);
    rememberTitleNames(json?.names);
  } catch {
    // Sin red: el buscador sigue con el nombre que trae la página.
  } finally {
    for (const key of keys) inflight.delete(key);
  }
}

function pump() {
  while (running < MAX_PARALLEL_BATCHES && queue.length) {
    running += 1;
    fetchBatch(queue.shift()).finally(() => {
      running -= 1;
      pump();
    });
  }
}

/** Pide los nombres que aún no se conocen de estos elementos. */
export function requestTitleNames(items) {
  if (typeof window === "undefined") return;
  load();
  const keys = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = titleNameKey(item);
    if (!key || seen.has(key) || names.has(key) || inflight.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  for (const key of keys) inflight.add(key);
  for (let index = 0; index < keys.length; index += BATCH) {
    queue.push(keys.slice(index, index + BATCH));
  }
  pump();
}

export function subscribeTitleNames(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTitleNamesVersion() {
  return version;
}
