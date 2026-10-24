// src/lib/today/seenStories.js
//
// Fotogramas de historias ya vistos en este navegador (como Trakt: clave
// `today-seen-stories`, ventana de 24 h). Es una comodidad por espectador: si
// el almacenamiento falla o se borra, todas las historias vuelven a salir como
// nuevas y no pasa nada más.

export const SEEN_STORIES_KEY = "today-seen-stories";
export const SEEN_STORIES_TTL_MS = 24 * 60 * 60 * 1000;

/** Quita las marcas de más de 24 h. Puro. */
export function pruneSeen(map, now = Date.now()) {
  const out = {};
  for (const [key, at] of Object.entries(map && typeof map === "object" ? map : {})) {
    if (Number.isFinite(at) && now - at < SEEN_STORIES_TTL_MS) out[key] = at;
  }
  return out;
}

export function readSeenStories(now = Date.now()) {
  try {
    const raw = window.localStorage.getItem(SEEN_STORIES_KEY);
    return pruneSeen(raw ? JSON.parse(raw) : {}, now);
  } catch {
    return {};
  }
}

export function writeSeenStories(map, now = Date.now()) {
  const pruned = pruneSeen(map, now);
  try {
    window.localStorage.setItem(SEEN_STORIES_KEY, JSON.stringify(pruned));
  } catch {
    // Sin almacenamiento (ventana privada, cuota): se queda solo en memoria.
  }
  return pruned;
}

/** ¿Queda algún fotograma del grupo sin ver? Decide el aro de color. */
export function hasUnseenFrames(group, seen) {
  return (group?.frames || []).some((frame) => !seen?.[frame.key]);
}

/** Primer fotograma sin ver del grupo (o el primero si ya se vio todo). */
export function firstUnseenIndex(group, seen) {
  const index = (group?.frames || []).findIndex((frame) => !seen?.[frame.key]);
  return index < 0 ? 0 : index;
}
