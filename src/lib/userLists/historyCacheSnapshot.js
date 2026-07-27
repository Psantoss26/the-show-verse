/**
 * El Historial conserva una instantánea en memoria para poder restaurar cientos
 * de registros aunque localStorage se quede sin cuota. Las mutaciones optimistas,
 * en cambio, actualizan localStorage desde otro módulo.
 *
 * Una fecha mayor identifica una instantánea completa más reciente. En caso de
 * empate gana la persistida: mantiene la misma fecha deliberadamente durante
 * una mutación optimista, pero ya contiene el nuevo registro.
 */
export function selectHistoryCacheEnvelope(memory, persisted) {
  if (!memory) return persisted || null;
  if (!persisted) return memory;

  const memoryTime = Number(memory.t);
  const persistedTime = Number(persisted.t);
  const safeMemoryTime = Number.isFinite(memoryTime) ? memoryTime : 0;
  const safePersistedTime = Number.isFinite(persistedTime) ? persistedTime : 0;

  return safePersistedTime >= safeMemoryTime ? persisted : memory;
}

/**
 * Fusiona la primera página canónica con todas las páginas ya restauradas.
 * Cuando una entrada optimista ya tiene equivalente canónico, la sustituye en
 * vez de conservar ambas. Los contadores permiten varias visualizaciones del
 * mismo título en un mismo día sin eliminar más optimistas de las confirmadas.
 */
export function mergeHistoryTopSnapshot(
  previous,
  fresh,
  { idOf, optimisticKeyOf },
) {
  const current = Array.isArray(previous) ? previous : [];
  const incoming = Array.isArray(fresh) ? fresh : [];
  const confirmedByKey = new Map();

  for (const item of incoming) {
    const key = optimisticKeyOf(item);
    if (key) confirmedByKey.set(key, (confirmedByKey.get(key) || 0) + 1);
  }

  const base = current.filter((item) => {
    if (!item?._optimistic) return true;
    const key = optimisticKeyOf(item);
    const remaining = key ? confirmedByKey.get(key) || 0 : 0;
    if (remaining <= 0) return true;
    confirmedByKey.set(key, remaining - 1);
    return false;
  });

  const seen = new Set(base.map((item) => String(idOf(item))));
  const merged = [...base];
  for (const item of incoming) {
    const id = String(idOf(item));
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}
