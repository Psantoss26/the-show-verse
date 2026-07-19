// Cola de mutaciones OFFLINE (Fase 2).
//
// Cuando el servidor propio (NAS) está caído, las escrituras del usuario (visto,
// puntuación, favorito, pendiente, historial…) se ENCOLAN en localStorage y se
// REPRODUCEN al reconectar. Vive en la CAPA DE APP (envoltorio de fetch), NUNCA en el
// service worker: por eso el SW no intercepta /api y no puede "bloquear" nada (la
// causa del revert anterior de PWA offline).
//
// Todos los call sites ya llaman:
//   offlineMutationFetch(url, init, { label, dedupeKey })
// El `dedupeKey` identifica ENTIDAD+acción (p. ej. "tmdb:favorite:tv:123",
// "trakt:watched:movie:456") y es el MISMO para añadir/quitar, así que la cola
// colapsa a "last-write-wins": marcar y desmarcar el mismo título offline se
// resuelven al último intento (no se sincronizan operaciones que se anulan).

const QUEUE_KEY = "showverse:offline:mutationQueue:v1";
const EVENT_NAME = "showverse:offline-queue";

function hasWindow() {
  return typeof window !== "undefined" && "localStorage" in window;
}

function readQueue() {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // cuota superada / modo privado
  }
  emit(queue.length);
}

function emit(pending) {
  if (!hasWindow()) return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { pending } }));
  } catch {
    // ignore
  }
}

let seq = 0;
function nextId() {
  seq += 1;
  return `m${Date.now()}_${seq}`;
}

function isMutation(init) {
  const m = (init?.method || "GET").toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

// Respuesta sintética "ok en cola": el call site sigue con su actualización OPTIMISTA
// (cacheAddFavorite, cacheAddHistory…) como si la escritura hubiera ido bien.
function queuedResponse() {
  return new Response(JSON.stringify({ ok: true, queued: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function getOfflineQueueCount() {
  return readQueue().length;
}

export function subscribeOfflineQueue(listener) {
  if (!hasWindow()) return () => {};
  const handler = (e) =>
    listener(e?.detail?.pending ?? readQueue().length);
  window.addEventListener(EVENT_NAME, handler);
  listener(readQueue().length); // valor inicial
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export function enqueueOfflineMutation(entry) {
  if (!hasWindow() || !entry?.url) return 0;
  const dedupeKey = entry.dedupeKey || null;
  const queue = readQueue();
  // Colapsa por entidad+acción (last-write-wins): quita intentos previos de lo mismo.
  const next = dedupeKey
    ? queue.filter((q) => q.dedupeKey !== dedupeKey)
    : queue.slice();
  next.push({
    id: nextId(),
    url: entry.url,
    init: entry.init || null,
    dedupeKey,
    label: entry.label || null,
    ts: Date.now(),
  });
  writeQueue(next);
  return next.length;
}

export async function offlineMutationFetch(url, init = {}, meta = {}) {
  // SSR o petición no-mutación → fetch normal (nunca encolamos lecturas).
  if (!hasWindow() || !isMutation(init)) return fetch(url, init);

  try {
    const res = await fetch(url, init);
    if (res.ok) {
      // Online: aprovechamos para vaciar lo que hubiera pendiente.
      if (readQueue().length) flushOfflineMutations();
      return res;
    }
    // 5xx (túnel Cloudflare con el NAS caído) → encolar. 4xx = error real del
    // cliente/validación/auth → devolver tal cual (el call site lo maneja).
    if (res.status >= 500) {
      enqueueOfflineMutation({
        url,
        init,
        dedupeKey: meta?.dedupeKey,
        label: meta?.label,
      });
      return queuedResponse();
    }
    return res;
  } catch {
    // Red caída → encolar y responder "en cola".
    enqueueOfflineMutation({
      url,
      init,
      dedupeKey: meta?.dedupeKey,
      label: meta?.label,
    });
    return queuedResponse();
  }
}

let flushing = false;

// Reproduce la cola EN ORDEN. Descarta las que triunfan o dan un 4xx irrecuperable;
// se detiene (y reintenta luego) ante 5xx / rate-limit / red caída, conservando el
// orden. Idempotente y seguro de llamar varias veces (guard `flushing`).
export async function flushOfflineMutations() {
  if (!hasWindow() || flushing) {
    return { synced: 0, pending: readQueue().length };
  }
  flushing = true;
  let synced = 0;
  try {
    // Cota de seguridad por si algo se atasca.
    for (let guard = 0; guard < 500; guard += 1) {
      const queue = readQueue();
      if (!queue.length) break;
      const item = queue[0];

      let res;
      try {
        res = await fetch(item.url, item.init || {});
      } catch {
        break; // red caída: reintentar más tarde
      }

      const status = res.status;
      const irrecoverableClientError =
        status >= 400 &&
        status < 500 &&
        status !== 401 && // sesión (puede estar refrescando)
        status !== 408 && // timeout
        status !== 429; // rate limit
      if (res.ok || irrecoverableClientError) {
        // Éxito o error de cliente sin arreglo posible → sacar de la cola.
        const rest = readQueue().filter((q) => q.id !== item.id);
        writeQueue(rest);
        if (res.ok) synced += 1;
      } else {
        break; // 5xx/401/408/429: el servidor aún no puede; reintentar luego.
      }
    }
  } finally {
    flushing = false;
  }
  return { synced, pending: readQueue().length };
}

export const OFFLINE_QUEUE_EVENT = EVENT_NAME;
