const DISABLED_QUEUE_KEY = "showverse:disabled-mutations";
const EVENT_NAME = "showverse:mutation-queue-disabled";

function clearQueue() {
  if (typeof window === "undefined" || !("localStorage" in window)) return;
  window.localStorage.removeItem(DISABLED_QUEUE_KEY);
  window.localStorage.removeItem("showverse:offline:mutationQueue:v1");
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { pending: 0 } }));
}

export function getOfflineQueueCount() {
  return 0;
}

export function subscribeOfflineQueue(listener) {
  if (typeof window === "undefined") return () => {};
  listener(0);
  return () => {};
}

export function enqueueOfflineMutation() {
  clearQueue();
  return 0;
}

export async function flushOfflineMutations() {
  clearQueue();
  return { synced: 0, pending: 0 };
}

export async function offlineMutationFetch(url, init = {}) {
  clearQueue();
  return fetch(url, init);
}

export const OFFLINE_QUEUE_EVENT = EVENT_NAME;
