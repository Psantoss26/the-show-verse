// Preferencias de la vista neural del perfil, guardadas en este navegador como
// las del resto de páginas (modo de vista de Favoritos, Diario, Historial…).
// Van por CUENTA: cada usuario que entra en el dispositivo conserva las suyas.
//
//   headerCollapsed  cabecera del perfil compacta      (por defecto: sí)
//   menuVisible      menú de opciones desplegado       (por defecto: no)
//   type             Tipo: all | movie | tv            (por defecto: all)
//   record           Registro: all | watched | rated | favorite | pending
//   groupBy          Agrupar: genre-saga | genre | decade

const STORAGE_PREFIX = "showverse:profile:neural:v1:";

export const NEURAL_DEFAULTS = Object.freeze({
  headerCollapsed: true,
  menuVisible: false,
  type: "all",
  record: "all",
  groupBy: "genre-saga",
});

const ALLOWED = {
  type: ["all", "movie", "tv"],
  record: ["all", "watched", "rated", "favorite", "pending"],
  groupBy: ["genre-saga", "genre", "decade"],
};

// Copia en memoria: las dos piezas que la usan (cabecera y vista) leen lo
// mismo aunque el almacenamiento no esté disponible.
const memory = new Map();

function storageKey(accountId) {
  return `${STORAGE_PREFIX}${accountId || "anon"}`;
}

/** Limpia un objeto leído del almacenamiento: solo valores conocidos. */
export function sanitizeNeuralPreferences(value) {
  const out = { ...NEURAL_DEFAULTS };
  if (!value || typeof value !== "object") return out;
  if (typeof value.headerCollapsed === "boolean") out.headerCollapsed = value.headerCollapsed;
  if (typeof value.menuVisible === "boolean") out.menuVisible = value.menuVisible;
  for (const key of Object.keys(ALLOWED)) {
    if (ALLOWED[key].includes(value[key])) out[key] = value[key];
  }
  return out;
}

export function readNeuralPreferences(accountId) {
  const key = storageKey(accountId);
  if (memory.has(key)) return memory.get(key);
  let stored = null;
  if (typeof window !== "undefined") {
    try {
      stored = JSON.parse(window.localStorage.getItem(key) || "null");
    } catch {
      stored = null;
    }
  }
  const prefs = sanitizeNeuralPreferences(stored);
  memory.set(key, prefs);
  return prefs;
}

/** ¿Esta cuenta ha usado ya la vista neural en este navegador? */
export function hasNeuralPreferences(accountId) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(accountId)) != null;
  } catch {
    return false;
  }
}

export function saveNeuralPreferences(accountId, patch) {
  const key = storageKey(accountId);
  const next = sanitizeNeuralPreferences({ ...readNeuralPreferences(accountId), ...patch });
  memory.set(key, next);
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Sin almacenamiento: se conserva durante la sesión.
  }
  return next;
}
