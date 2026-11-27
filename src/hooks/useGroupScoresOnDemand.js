"use client";

// Calcula bajo demanda la media de IMDb, Trakt o TMDb de una agrupación (ver
// lib/userLists/scoreOnDemand.js). Lleva el progreso y los fallos por fuente y
// grupo; las notas nuevas se funden en el Map de la página de esa fuente y se
// guardan en la caché compartida de puntuaciones (listScoreCache).
//
// `sources`: { imdb?: { scores, setScores }, trakt?: …, tmdb?: … } con solo las
// fuentes que la página deja calcular a mano. `getGroupOnDemand` arma la lista
// que pinta GroupScoreStats.

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { traktGetScoreboard } from "@/lib/api/traktClient";
import {
  fetchImdbScoresForItems,
  getScoreItemKey,
  resolveImdbBatch,
  writeScoreCache,
} from "@/lib/userLists/listScoreCache";
import {
  SCORE_ON_DEMAND_BATCH,
  fetchMissingScores,
  getMissingScoreItems,
  perItemFetcher,
  tmdbMetaKey,
  traktScoreRequest,
} from "@/lib/userLists/scoreOnDemand";

const FETCH_BATCH = {
  trakt: perItemFetcher(async (item) => {
    const data = await traktGetScoreboard(traktScoreRequest(item));
    if (!data) throw new Error("trakt");
    if (data.found === false) return null;
    return data?.community?.rating ?? null;
  }),
  imdb: async (batch) => resolveImdbBatch(batch, await fetchImdbScoresForItems(batch)).resolved,
  tmdb: async (batch) => {
    const res = await fetch("/api/tmdb/title-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: batch.map(tmdbMetaKey) }),
    });
    if (!res.ok) throw new Error("tmdb");
    const meta = (await res.json())?.meta || {};
    const out = new Map();
    for (const item of batch) {
      const entry = meta[tmdbMetaKey(item)];
      // `null` = TMDb no respondió para ese título: no se sabe nada.
      if (entry) out.set(getScoreItemKey(item), entry.voteAverage ?? null);
    }
    return out;
  },
};

const slot = (source, groupKey) => `${source}|${groupKey}`;

export default function useGroupScoresOnDemand(sources) {
  // slot → { done, total } mientras se calcula.
  const [progress, setProgress] = useState(() => new Map());
  // Slots pedidos a mano en esta visita y los que acabaron sin poder resolver nada.
  const [requested, setRequested] = useState(() => new Set());
  const [failed, setFailed] = useState(() => new Set());
  const sourcesRef = useRef(sources);
  const runningRef = useRef(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    sourcesRef.current = sources;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setSlot = useCallback((setter, key, value) => {
    setter((prev) => {
      const has = prev.has(key);
      if (prev instanceof Map) {
        if (!value && !has) return prev;
        const next = new Map(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      }
      if (Boolean(value) === has) return prev;
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const request = useCallback(
    async (source, groupKey, items, hasScore) => {
      const key = slot(source, groupKey);
      const target = sourcesRef.current?.[source];
      if (!target || runningRef.current.has(key)) return;
      const missing = getMissingScoreItems(items, target.scores, hasScore);
      if (!missing.length) return;
      runningRef.current.add(key);
      setSlot(setRequested, key, true);
      setSlot(setFailed, key, false);
      setSlot(setProgress, key, { done: 0, total: missing.length });
      const saved = new Map();
      try {
        await fetchMissingScores(missing, {
          batchSize: SCORE_ON_DEMAND_BATCH[source],
          fetchBatch: FETCH_BATCH[source],
          isCancelled: () => !mountedRef.current,
          onBatch: (batch, done, total) => {
            batch.forEach((value, id) => saved.set(id, value));
            setSlot(setProgress, key, { done, total });
            if (!batch.size) return;
            startTransition(() =>
              sourcesRef.current?.[source]?.setScores((prev) => {
                const next = new Map(prev);
                batch.forEach((value, id) => next.set(id, value));
                return next;
              }),
            );
          },
        });
      } finally {
        runningRef.current.delete(key);
        if (saved.size) writeScoreCache(source, saved, new Set(saved.keys()));
        if (mountedRef.current) {
          setSlot(setProgress, key, null);
          // Nada resuelto: el botón pasa a «reintentar».
          if (!saved.size) setSlot(setFailed, key, true);
        }
      }
    },
    [setSlot],
  );

  // Lista para GroupScoreStats: una entrada por fuente con títulos sin nota
  // (`missing`, que cuenta la página al hacer las medias) o calculándose.
  const getGroupOnDemand = (groupKey, items, missingBySource, hasScoreBySource = {}) => {
    const out = [];
    for (const source of ["imdb", "trakt", "tmdb"]) {
      if (!sources?.[source]) continue;
      const key = slot(source, groupKey);
      out.push({
        key: source,
        missing: missingBySource?.[source] || 0,
        progress: progress.get(key) || null,
        requested: requested.has(key),
        failed: failed.has(key),
        onRequest: () => request(source, groupKey, items, hasScoreBySource[source]),
      });
    }
    return out;
  };

  return { getGroupOnDemand };
}
