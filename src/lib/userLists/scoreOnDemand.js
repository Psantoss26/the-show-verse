// Medias BAJO DEMANDA en la cabecera de una agrupación (Favoritos, Pendientes
// y Biblioteca). Mientras nada de la página pida las notas de una fuente
// (IMDb, Trakt o TMDb: agrupar, ordenar o filtrar por ellas), no se cargan:
// cada cabecera ofrece calcular esa media solo con sus títulos. Se pide una vez
// por título que falte en la caché compartida (listScoreCache), por tandas, y
// el resultado se guarda allí para que repetir no cueste nada.
//
// Cada fuente pide a su manera (ver hooks/useGroupScoresOnDemand.js): Trakt
// título a título, IMDb y TMDb en lotes. Aquí solo va lo común.

import { getListItemType, getScoreItemKey } from "./listScoreCache.js";

// Títulos por tanda de cada fuente: Trakt, 4 peticiones sueltas a la vez;
// IMDb, un lote de /api/imdb/ratings; TMDb, un lote de /api/tmdb/title-meta.
export const SCORE_ON_DEMAND_BATCH = { trakt: 4, imdb: 40, tmdb: 16 };

// Títulos del grupo cuya nota aún no se conoce. `scores` es el Map de la
// página: id → nota, o `null` si la fuente confirmó que no tiene. `hasScore`
// (opcional) descarta los que ya traen la nota consigo (TMDb en Favoritos).
export function getMissingScoreItems(items, scores, hasScore = null) {
  const seen = new Set();
  const missing = [];
  for (const item of Array.isArray(items) ? items : []) {
    const key = getScoreItemKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (hasScore?.(item)) continue;
    if (!scores?.has(key)) missing.push(item);
  }
  return missing;
}

export function normalizeScore(score) {
  return typeof score === "number" && Number.isFinite(score) && score > 0 ? score : null;
}

// Adapta una petición por título (`fetchScore(item)` → nota, `null` sin nota,
// o lanza si falla) a una por tanda: las de la tanda van a la vez.
export function perItemFetcher(fetchScore) {
  return async (batch) => {
    const out = new Map();
    await Promise.all(
      batch.map(async (item) => {
        try {
          out.set(getScoreItemKey(item), normalizeScore(await fetchScore(item)));
        } catch {
          // Fallo pasajero: no se sabe nada, no se guarda.
        }
      }),
    );
    return out;
  };
}

// Pide las notas que faltan por tandas de `batchSize`. `fetchBatch(batch)`
// devuelve un Map id → nota (`null` = sin nota confirmada); un título que no
// viene (o una tanda que lanza) se da por fallido: no se guarda y se podrá
// reintentar. `onBatch(resolved, done, total)` recibe tras cada tanda las
// notas nuevas. `isCancelled()` corta entre tandas. Devuelve lo resuelto y
// cuántos fallaron.
export async function fetchMissingScores(items, { fetchBatch, batchSize, onBatch, isCancelled = () => false }) {
  const resolved = new Map();
  const size = Math.max(1, batchSize || 1);
  let done = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += size) {
    if (isCancelled()) break;
    const batch = items.slice(i, i + size);
    let got = null;
    try {
      got = await fetchBatch(batch);
    } catch {
      got = null;
    }
    const batchResolved = new Map();
    for (const item of batch) {
      const key = getScoreItemKey(item);
      if (got instanceof Map && got.has(key)) batchResolved.set(key, normalizeScore(got.get(key)));
      else failed += 1;
    }
    done += batch.length;
    batchResolved.forEach((value, key) => resolved.set(key, value));
    if (!isCancelled()) onBatch?.(batchResolved, done, items.length);
  }
  return { resolved, failed };
}

export function traktScoreRequest(item) {
  return { type: getListItemType(item), tmdbId: item.id, includeStats: false };
}

// "movie:603" de /api/tmdb/title-meta (la misma forma que getScoreItemKey).
export function tmdbMetaKey(item) {
  return `${getListItemType(item) === "tv" ? "tv" : "movie"}:${item.id}`;
}
