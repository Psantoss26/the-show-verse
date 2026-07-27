"use client";

import { useEffect, useMemo, useState } from "react";

const BATCH_SIZE = 100;

export function titleStateKey(item) {
  return `${item?.mediaType === "tv" ? "tv" : "movie"}:${Number(item?.tmdbId)}`;
}

function normalizeItems(items) {
  const unique = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const tmdbId = Number(item?.tmdbId);
    const mediaType = item?.mediaType === "tv" ? "tv" : item?.mediaType === "movie" ? "movie" : null;
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !mediaType) continue;
    unique.set(`${mediaType}:${tmdbId}`, { tmdbId, mediaType });
  }
  return [...unique.values()];
}

// Estados privados del visor para los títulos que se están mostrando en un
// perfil. Las peticiones se agrupan para no consultar una vez por tarjeta.
export function useViewerTitleStates(items, enabled = true) {
  const requestedItems = useMemo(() => normalizeItems(items), [items]);
  const [states, setStates] = useState({});

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !requestedItems.length) {
      return undefined;
    }

    (async () => {
      try {
        const chunks = [];
        for (let index = 0; index < requestedItems.length; index += BATCH_SIZE) {
          chunks.push(requestedItems.slice(index, index + BATCH_SIZE));
        }
        const responses = await Promise.all(chunks.map(async (batch) => {
          const response = await fetch("/api/backend/items/states", {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: batch }),
          });
          if (!response.ok) return {};
          const payload = await response.json();
          return payload?.states && typeof payload.states === "object" ? payload.states : {};
        }));
        if (!cancelled) {
          const merged = Object.assign({}, ...responses);
          setStates((prev) => ({ ...prev, ...merged }));
        }
      } catch {
        // En caso de fallo de red se conservan los estados ya cargados sin vaciar la interfaz.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, requestedItems]);

  return states;
}
