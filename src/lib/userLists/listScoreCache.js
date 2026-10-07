// Caché de puntuaciones (IMDb / Trakt) de las listas de usuario: Favoritos y
// Pendientes. Ambas páginas comparten la MISMA entrada de localStorage
// (`showverse:scores:<fuente>:v2`), así que también comparten cómo se lee, se
// escribe y se refresca: antes cada página tenía su copia y una podía guardar
// entradas que la otra interpretaba de otra forma.

// Los títulos recientes cambian de nota más rápido; los antiguos aguantan más.
export const SCORE_CACHE_RECENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
export const SCORE_CACHE_ACTIVE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
export const SCORE_CACHE_RECENT_TTL_MS = 12 * 60 * 60 * 1000;
export const SCORE_CACHE_ACTIVE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const SCORE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Un «sin nota en IMDb» confirmado se vuelve a comprobar pasado un día.
export const SCORE_CACHE_MISSING_TTL_MS = 24 * 60 * 60 * 1000;

const scoreCacheKey = (source) => `showverse:scores:${source}:v2`;

export function getListItemType(item) {
  return item?.media_type || (item?.title ? "movie" : "tv");
}

export function getScoreItemKey(item) {
  return item?.id == null ? "" : `${getListItemType(item)}:${item.id}`;
}

function getItemReleaseTime(item) {
  const date = item?.release_date || item?.first_air_date;
  const time = date ? Date.parse(date) : NaN;
  return Number.isNaN(time) ? null : time;
}

export function getScoreCacheTtlForItem(item, now = Date.now()) {
  const releaseTime = getItemReleaseTime(item);
  if (!releaseTime) return SCORE_CACHE_TTL_MS;
  const age = now - releaseTime;
  if (age < SCORE_CACHE_RECENT_WINDOW_MS) return SCORE_CACHE_RECENT_TTL_MS;
  if (age < SCORE_CACHE_ACTIVE_WINDOW_MS) return SCORE_CACHE_ACTIVE_TTL_MS;
  return SCORE_CACHE_TTL_MS;
}

export function readScoreCacheEntries(source, now = Date.now()) {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(scoreCacheKey(source));
    if (!raw) return new Map();

    const parsed = JSON.parse(raw);
    const cache = new Map();

    Object.entries(parsed).forEach(([id, entry]) => {
      if (!entry?.t || now - entry.t >= SCORE_CACHE_TTL_MS) return;
      // Una entrada negativa solo vale si el servidor CONFIRMÓ que no hay nota
      // (`none`). Las de una versión anterior podían venir de un fallo pasajero
      // y dejaban títulos con nota clavados al final de su grupo: se ignoran y
      // se vuelven a pedir.
      if (entry.score === null && !entry.none) return;
      cache.set(id, { score: entry.score, t: entry.t });
    });

    return cache;
  } catch {
    return new Map();
  }
}

export function readScoreCache(source) {
  const cache = new Map();
  readScoreCacheEntries(source).forEach((entry, id) => {
    cache.set(id, entry.score);
  });
  return cache;
}

export function shouldRefreshScore(item, entry, now = Date.now()) {
  if (!entry) return true;
  // Entrada negativa (`score: null`): IMDb no tiene nota para el título. Se
  // reintenta pasado un día, por si la ha conseguido, pero no en cada visita.
  if (entry.score === null) {
    return now - Number(entry.t || 0) >= SCORE_CACHE_MISSING_TTL_MS;
  }
  if (typeof entry.score !== "number" || Number.isNaN(entry.score)) {
    return true;
  }
  return now - Number(entry.t || 0) >= getScoreCacheTtlForItem(item, now);
}

// `scoresMap`: id → nota (`null` = «sin nota» confirmado). Con `refreshedIds`
// solo se reescriben esos ids; las demás entradas vigentes se conservan.
export function writeScoreCache(source, scoresMap, refreshedIds = null) {
  if (typeof window === "undefined") return;
  try {
    const key = scoreCacheKey(source);
    const now = Date.now();
    const raw = window.localStorage.getItem(key);
    const previous = raw ? JSON.parse(raw) : {};
    const data = {};

    Object.entries(previous || {}).forEach(([id, entry]) => {
      if (entry?.t && now - entry.t < SCORE_CACHE_TTL_MS) {
        data[id] = entry;
      }
    });

    const ids = refreshedIds instanceof Set ? refreshedIds : scoresMap.keys();
    for (const id of ids) {
      if (!scoresMap.has(id)) continue;
      const score = scoresMap.get(id);
      data[id] =
        score === null ? { score, t: now, none: true } : { score, t: now };
    }

    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to write score cache:", e);
  }
}

// Pide las notas de IMDb de un lote de títulos.
//
// `null` = la petición FALLÓ (no se sabe nada). Si respondió, `unresolved` lista
// los títulos cuyo id de IMDb no se pudo averiguar (p. ej. TMDb limitó la
// ráfaga): tampoco se sabe nada de ellos. Solo el resto, si no trae nota, es un
// «sin nota» confirmado que puede guardarse como negativo.
export async function fetchImdbScoresForItems(items) {
  const payloadItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const key = getScoreItemKey(item);
      if (!key) return null;
      return {
        key,
        id: item.id,
        mediaType: getListItemType(item),
        imdbId: item.imdb_id || item.imdbId || null,
      };
    })
    .filter(Boolean);

  if (!payloadItems.length) return { items: {}, unresolved: new Set() };

  const res = await fetch("/api/imdb/ratings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: payloadItems }),
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  if (!json || json.error) return null;
  return {
    items: json.items && typeof json.items === "object" ? json.items : {},
    unresolved: new Set(Array.isArray(json.unresolved) ? json.unresolved : []),
  };
}

// Interpreta la respuesta de un lote: notas resueltas (`null` = sin nota
// confirmado) y títulos de los que no se supo nada (se reintentarán).
export function resolveImdbBatch(batch, batchScores) {
  const resolved = new Map();
  const failed = [];
  for (const item of batch) {
    const key = getScoreItemKey(item);
    if (!key) continue;
    if (!batchScores || batchScores.unresolved.has(key)) {
      failed.push(item);
      continue;
    }
    const rating = Number(batchScores.items[key]?.rating);
    resolved.set(key, Number.isFinite(rating) && rating > 0 ? rating : null);
  }
  return { resolved, failed };
}
