"use client";

// Cliente por LOTES de /api/tmdb/artwork: las peticiones de arte que llegan en
// el mismo instante (una parrilla que monta, las vistas previas del índice) se
// agrupan en un solo POST de hasta 60 títulos. El servidor consulta TMDb y lo
// cachea un día (ver la ruta).
//
// Devuelve las elecciones { poster, previewPoster, previewBackdrop } o
// `undefined` si no se pudo consultar (el llamador cae a pedir /images él
// mismo). Solo se recuerda lo que llega bien.

const BATCH_WINDOW_MS = 16;
const MAX_PER_REQUEST = 60;

const resolved = new Map(); // "movie:603" -> picks
const waiting = new Map(); // "movie:603" -> [resolve, …]
let timer = 0;

function keyOf(mediaType, id) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return `${mediaType === "tv" ? "tv" : "movie"}:${numeric}`;
}

async function send(keys) {
  try {
    const res = await fetch("/api/tmdb/artwork", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: keys }),
    });
    const json = res.ok ? await res.json() : null;
    const artwork = json?.artwork || {};
    for (const key of keys) {
      const picks = artwork[key] || undefined;
      if (picks) resolved.set(key, picks);
      for (const done of waiting.get(key) || []) done(picks);
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
const inFlight = new Set();

/** Lo ya resuelto de un título, sin esperar (undefined si aún no se tiene). */
export function peekListArtwork(mediaType, id) {
  const key = keyOf(mediaType, id);
  return key ? resolved.get(key) : undefined;
}

/** Elecciones de arte de un título (lote compartido con quien pida a la vez). */
export function requestListArtwork(mediaType, id) {
  const key = keyOf(mediaType, id);
  if (!key) return Promise.resolve(undefined);
  if (resolved.has(key)) return Promise.resolve(resolved.get(key));
  return new Promise((resolve) => {
    const list = waiting.get(key);
    if (list) list.push(resolve);
    else waiting.set(key, [resolve]);
    if (!inFlight.has(key) && !timer) timer = setTimeout(flush, BATCH_WINDOW_MS);
  });
}
