const SEARCH_HISTORY_STORAGE_KEY = "showverse:navbar:search-history:v1";
export const SEARCH_HISTORY_LIMIT = 8;
const inMemoryHistoryByStorage = new WeakMap();

function getStorage(storage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function normalizeSearchQuery(query) {
  return String(query || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function searchQueryKey(query) {
  return normalizeSearchQuery(query)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function normalizeHistory(entries) {
  const seen = new Set();
  const normalized = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const query = normalizeSearchQuery(entry);
    const key = searchQueryKey(query);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(query);
    if (normalized.length === SEARCH_HISTORY_LIMIT) break;
  }

  return normalized;
}

function writeSearchHistory(entries, storage) {
  const target = getStorage(storage);
  const normalized = normalizeHistory(entries);
  if (!target) return normalized;

  inMemoryHistoryByStorage.set(target, normalized);

  try {
    if (normalized.length) {
      target.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(normalized));
    } else {
      target.removeItem(SEARCH_HISTORY_STORAGE_KEY);
    }
  } catch {
    // localStorage puede no estar disponible en modo privado o por cuota.
  }

  return normalized;
}

export function readSearchHistory(storage) {
  const target = getStorage(storage);
  if (!target) return [];

  const inMemoryHistory = inMemoryHistoryByStorage.get(target);
  if (inMemoryHistory) return [...inMemoryHistory];

  try {
    const raw = target.getItem(SEARCH_HISTORY_STORAGE_KEY);
    const persisted = raw ? normalizeHistory(JSON.parse(raw)) : [];
    inMemoryHistoryByStorage.set(target, persisted);
    return [...persisted];
  } catch {
    return [];
  }
}

export function addSearchHistory(query, storage) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return readSearchHistory(storage);

  const current = readSearchHistory(storage);
  const queryKey = searchQueryKey(normalizedQuery);
  return writeSearchHistory(
    [
      normalizedQuery,
      ...current.filter((entry) => searchQueryKey(entry) !== queryKey),
    ],
    storage,
  );
}

export function removeSearchHistory(query, storage) {
  const queryKey = searchQueryKey(query);
  return writeSearchHistory(
    readSearchHistory(storage).filter(
      (entry) => searchQueryKey(entry) !== queryKey,
    ),
    storage,
  );
}

export function clearSearchHistory(storage) {
  return writeSearchHistory([], storage);
}
