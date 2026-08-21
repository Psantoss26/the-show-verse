import { getMediaMetadataMap, metadataFor } from './mediaMetadata.js';

function validScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score > 0 && score <= 10 ? score : null;
}

// Un servidor recién actualizado no debería llegar a este estado (el arranque
// aplica las migraciones antes de atender tráfico), pero la compatibilidad evita
// tumbar la lectura de todas las listas si una instancia vieja apunta unos
// segundos a un esquema que todavía no tiene la columna aditiva.
export function isMissingVoteAverageColumn(error) {
  let current = error;
  while (current) {
    const code = current?.code;
    const message = String(current?.message || '');
    if (code === '42703' && /vote_average/i.test(message)) return true;
    current = current?.cause;
  }
  return false;
}

/**
 * Resuelve únicamente puntuaciones que ya están almacenadas. Es deliberadamente
 * cache-only: abrir una lista de 1.000 títulos nunca dispara 1.000 llamadas a
 * TMDb. Las puntuaciones faltantes se completan al añadir/importar el título.
 */
export async function hydrateListRatings(items = []) {
  const rows = Array.isArray(items) ? items : [];
  const metadataByKey = await getMediaMetadataMap(rows, { fetchMissing: false })
    .catch(() => new Map());

  return rows.map((item) => {
    const score = validScore(item?.voteAverage)
      ?? validScore(metadataFor(metadataByKey, item?.mediaType, item?.tmdbId)?.vote_average);
    return score == null ? item : { ...item, voteAverage: score };
  });
}

export function buildRatingSummary(items = []) {
  const rows = Array.isArray(items) ? items : [];
  const scores = rows.map((item) => validScore(item?.voteAverage)).filter((score) => score != null);
  if (!scores.length) return null;

  return {
    average: Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)),
    ratedCount: scores.length,
    totalCount: rows.length,
  };
}
