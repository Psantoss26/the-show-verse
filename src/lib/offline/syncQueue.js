// Offline is strictly read-only. Retire legacy queues without replaying them.
import { requireOnline } from "./client.js";
const QUEUE_KEY = "showverse:offline:mutationQueue:v1";
export const OFFLINE_QUEUE_EVENT = "showverse:offline-queue";
function clearLegacyQueue() {
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(QUEUE_KEY); } catch { /* unavailable storage */ }
  }
}
export function getOfflineQueueCount() { return 0; }
export function subscribeOfflineQueue(listener) { listener(0); return () => {}; }
export function enqueueOfflineMutation() { clearLegacyQueue(); return 0; }
export async function flushOfflineMutations() { clearLegacyQueue(); return { synced: 0, pending: 0 }; }
export async function offlineMutationFetch(url, init = {}) {
  clearLegacyQueue();
  requireOnline();
  return fetch(url, init);
}
