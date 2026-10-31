"use client";

// Cliente por LOTES de /api/tmdb/title-meta (géneros y duración): las filas
// que montan a la vez se agrupan en POSTs de hasta MAX_PER_REQUEST títulos,
// como el arte (artworkBatch). Solo se recuerda lo que llega bien.

import { useEffect, useState } from "react";

import { titleMetaKey } from "./titleMeta.js";

const BATCH_WINDOW_MS = 16;
const MAX_PER_REQUEST = 16;

const resolved = new Map(); // "movie:603" -> { genres, runtime }
const waiting = new Map(); // "movie:603" -> [resolve, …]
const inFlight = new Set();
let timer = 0;

async function send(keys) {
  try {
    const res = await fetch("/api/tmdb/title-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: keys }),
    });
    const json = res.ok ? await res.json() : null;
    const meta = json?.meta || {};
    for (const key of keys) {
      const value = meta[key] || undefined;
      if (value) resolved.set(key, value);
      for (const done of waiting.get(key) || []) done(value);
      waiting.delete(key);
    }
  } catch {
    for (const key of keys) {
      for (const done of waiting.get(key) || []) done(undefined);
      waiting.delete(key);
    }
  }
}

function flush() {
  timer = 0;
  const keys = [...waiting.keys()].filter((key) => !inFlight.has(key));
  for (let start = 0; start < keys.length; start += MAX_PER_REQUEST) {
    const chunk = keys.slice(start, start + MAX_PER_REQUEST);
    chunk.forEach((key) => inFlight.add(key));
    send(chunk).finally(() => chunk.forEach((key) => inFlight.delete(key)));
  }
}

function requestKey(key) {
  if (resolved.has(key)) return Promise.resolve(resolved.get(key));
  return new Promise((resolve) => {
    const list = waiting.get(key);
    if (list) list.push(resolve);
    else waiting.set(key, [resolve]);
    if (!inFlight.has(key) && !timer) timer = setTimeout(flush, BATCH_WINDOW_MS);
  });
}

/**
 * { meta: { genres, runtime } | null, pending } de un título. Con
 * `enabled: false` no pide nada.
 */
export function useTitleMeta(mediaType, id, { enabled = true } = {}) {
  const key = enabled ? titleMetaKey(mediaType, id) : null;
  const [state, setState] = useState(() => ({ key, meta: key ? resolved.get(key) : undefined }));
  // Lo que ya resolvió otra fila del mismo título también vale.
  const current = (state.key === key ? state.meta : undefined) ?? (key ? resolved.get(key) : undefined);

  useEffect(() => {
    if (!key || resolved.has(key)) return undefined;
    let alive = true;
    requestKey(key).then((meta) => {
      // Sin respuesta: se deja de esperar (la fila no reserva más hueco).
      if (alive) setState({ key, meta: meta || null });
    });
    return () => {
      alive = false;
    };
  }, [key]);

  return { meta: current || null, pending: Boolean(key) && current === undefined };
}
