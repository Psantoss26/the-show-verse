"use client";

import { startTransition, useEffect, useMemo, useRef } from "react";

import {
  fetchImdbScoresForItems,
  getScoreItemKey,
  readScoreCacheEntries,
  resolveImdbBatch,
  shouldRefreshScore,
  writeScoreCache,
} from "@/lib/userLists/listScoreCache";

// Lotes pequeños y en paralelo: el primero llega antes y la lista empieza a
// recolocarse cuanto antes, en vez de esperar a un lote grande. (El endpoint
// admite hasta 250 títulos y resuelve los ids de IMDb con concurrencia propia;
// más lotes simultáneos hacían que TMDb limitara la ráfaga.)
const IMDB_SCORE_BATCH_SIZE = 40;
const IMDB_SCORE_PARALLEL_BATCHES = 3;
// Segundo intento, en la misma visita, de los títulos que quedaron sin resolver
// por un fallo pasajero (no por no tener nota).
const IMDB_SCORE_RETRY_DELAY_MS = 2000;

// Notas de IMDb de una lista de usuario (ordenar por valoración / agrupar por
// IMDb), compartido por Favoritos y Pendientes.
//
// - Las que FALTAN en caché se piden en lotes paralelos y cada lote se aplica
//   en cuanto llega: las tarjetas siguen a la vista y se van recolocando con su
//   animación (proceso visual), sin vaciar la lista mientras tanto.
// - Las que están en caché pero CADUCADAS se refrescan solo en la caché, sin
//   tocar el estado: la lista visible no se reordena y la próxima visita entra
//   con el valor nuevo.
// - Cada lote se guarda en caché nada más llegar, aunque la página ya se haya
//   desmontado. Antes solo se guardaba al final de TODO y únicamente si no se
//   había cancelado: al salir antes (en móvil, abrir una ficha es una
//   navegación completa) no se guardaba nada y cada visita volvía a empezar.
// - Los títulos sin nota CONFIRMADA en IMDb se guardan como entrada negativa;
//   los que fallan (no se pudo averiguar) no, y se reintentan una vez.
// - Depende de QUÉ títulos hay, no de la referencia de `items`, que cambia al
//   fusionar las notas del usuario o al llegar la respuesta fresca: depender de
//   ella cancelaba la carga a mitad y la reiniciaba de cero.
//
// `frozen`: al volver (atrás) con el orden congelado no se refresca nada, para
// no reordenar; el orden queda exactamente como lo dejó el usuario.
export default function useImdbScoreLoader({
  items,
  enabled,
  frozen,
  setImdbScores,
  setLoading,
}) {
  const scoreItemsKey = useMemo(
    () => items.map(getScoreItemKey).sort().join(","),
    [items],
  );
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!scoreItemsKey || !enabled || frozen) return;

    let cancelled = false;
    const currentItems = itemsRef.current;

    const fetchInBatches = async (list, onBatch) => {
      const batches = [];
      for (let i = 0; i < list.length; i += IMDB_SCORE_BATCH_SIZE) {
        batches.push(list.slice(i, i + IMDB_SCORE_BATCH_SIZE));
      }
      let nextBatch = 0;
      const worker = async () => {
        while (!cancelled && nextBatch < batches.length) {
          const batch = batches[nextBatch++];
          const batchScores = await fetchImdbScoresForItems(batch).catch(
            () => null,
          );
          onBatch(batch, batchScores);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(IMDB_SCORE_PARALLEL_BATCHES, batches.length) },
          worker,
        ),
      );
    };

    // Guarda el lote en caché (aunque la página ya se haya ido) y devuelve lo
    // resuelto y lo que falló.
    const persistBatch = (batch, batchScores) => {
      const result = resolveImdbBatch(batch, batchScores);
      if (result.resolved.size > 0) {
        writeScoreCache(
          "imdb",
          result.resolved,
          new Set(result.resolved.keys()),
        );
      }
      return result;
    };

    const load = async () => {
      const cachedEntries = readScoreCacheEntries("imdb");
      const now = Date.now();
      const missing = [];
      const stale = [];
      currentItems.forEach((item) => {
        const key = getScoreItemKey(item);
        if (!key) return;
        const entry = cachedEntries.get(key);
        if (!entry) missing.push(item);
        else if (shouldRefreshScore(item, entry, now)) stale.push(item);
      });

      // Notas ya en caché que este montaje aún no tiene (p. ej. guardadas por
      // una carga anterior que se interrumpió).
      setImdbScores((prev) => {
        let next = null;
        cachedEntries.forEach((entry, key) => {
          if (prev.has(key)) return;
          next ??= new Map(prev);
          next.set(key, entry.score);
        });
        return next ?? prev;
      });

      if (missing.length === 0 && stale.length === 0) return;
      setLoading(true);

      try {
        if (missing.length > 0) {
          let failed = [];
          const applyBatch = (batch, batchScores) => {
            const result = persistBatch(batch, batchScores);
            failed = failed.concat(result.failed);
            if (cancelled || result.resolved.size === 0) return;
            startTransition(() =>
              setImdbScores((prev) => {
                const next = new Map(prev);
                result.resolved.forEach((score, key) => next.set(key, score));
                return next;
              }),
            );
          };
          await fetchInBatches(missing, applyBatch);
          // Un fallo pasajero no debe dejar esos títulos al final de su grupo
          // hasta la próxima visita: se reintentan una vez, ya sin ráfaga.
          if (!cancelled && failed.length > 0) {
            const retry = failed;
            failed = [];
            await new Promise((resolve) =>
              setTimeout(resolve, IMDB_SCORE_RETRY_DELAY_MS),
            );
            if (!cancelled) await fetchInBatches(retry, applyBatch);
          }
        }

        if (!cancelled && stale.length > 0) {
          await fetchInBatches(stale, (batch, batchScores) => {
            persistBatch(batch, batchScores);
          });
        }
      } catch (error) {
        console.error("Error loading IMDb scores:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [scoreItemsKey, enabled, frozen, setImdbScores, setLoading]);
}
