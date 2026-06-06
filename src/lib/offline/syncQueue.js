const QUEUE_KEY = "showverse:offline:mutationQueue:v1";
const EVENT_NAME = "showverse:offline-queue-changed";

function canUseStorage() {
  return typeof window !== "undefined" && "localStorage" in window;
}

function readQueue() {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: { pending: queue.length } }),
  );
}

function normalizeHeaders(headers) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

function queueableInit(init = {}) {
  return {
    method: init.method || "POST",
    headers: normalizeHeaders(init.headers),
    body: init.body ?? null,
    credentials: init.credentials || "include",
  };
}

function getDedupeKey(url, init, dedupeKey) {
  if (dedupeKey) return dedupeKey;
  return `${init.method || "POST"}:${url}:${init.body || ""}`;
}

function createQueuedResponse(pendingCount) {
  return new Response(
    JSON.stringify({
      ok: true,
      offlineQueued: true,
      pendingCount,
    }),
    {
      status: 202,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function getOfflineQueueCount() {
  return readQueue().length;
}

export function subscribeOfflineQueue(listener) {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener(getOfflineQueueCount());
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

export function enqueueOfflineMutation(url, init = {}, metadata = {}) {
  const queue = readQueue();
  const storedInit = queueableInit(init);
  const dedupeKey = getDedupeKey(url, storedInit, metadata.dedupeKey);
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url,
    init: storedInit,
    dedupeKey,
    label: metadata.label || "Operación offline",
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  const nextQueue = [
    ...queue.filter((entry) => entry.dedupeKey !== dedupeKey),
    item,
  ].slice(-100);

  writeQueue(nextQueue);
  return nextQueue.length;
}

function shouldRetryResponse(res) {
  return res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
}

export async function flushOfflineMutations() {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { synced: 0, pending: getOfflineQueueCount() };
  }

  const queue = readQueue();
  if (!queue.length) return { synced: 0, pending: 0 };

  const remaining = [];
  let synced = 0;

  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        ...item.init,
        cache: "no-store",
      });

      if (res.ok) {
        synced += 1;
        continue;
      }

      if (shouldRetryResponse(res)) {
        remaining.push({ ...item, attempts: (item.attempts || 0) + 1 });
      }
    } catch {
      remaining.push({ ...item, attempts: (item.attempts || 0) + 1 });
      remaining.push(...queue.slice(queue.indexOf(item) + 1));
      break;
    }
  }

  writeQueue(remaining);
  return { synced, pending: remaining.length };
}

export async function offlineMutationFetch(url, init = {}, metadata = {}) {
  const method = String(init.method || "GET").toUpperCase();
  if (typeof window === "undefined" || method === "GET") {
    return fetch(url, init);
  }

  if (!navigator.onLine) {
    const pending = enqueueOfflineMutation(url, init, metadata);
    return createQueuedResponse(pending);
  }

  try {
    const res = await fetch(url, init);
    if (res.ok || !shouldRetryResponse(res)) return res;

    const pending = enqueueOfflineMutation(url, init, metadata);
    return createQueuedResponse(pending);
  } catch {
    const pending = enqueueOfflineMutation(url, init, metadata);
    return createQueuedResponse(pending);
  }
}

export const OFFLINE_QUEUE_EVENT = EVENT_NAME;
