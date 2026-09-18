// Browser-side bridge. No tokens or credentials are written into snapshots.
export const CONNECTION_EVENT = "showverse:offline-connection";
export const PREPARATION_EVENT = "showverse:offline-preparation";
let online = true;

export function isServerReachable() { return online; }
export function reportConnection(value) {
  online = Boolean(value);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CONNECTION_EVENT, { detail: { online } }));
}
export function requireOnline() {
  if (!online) throw new Error("Sin conexión con el servidor: solo consulta. No se ha guardado ningún cambio.");
}
export async function workerMessage(message, timeout = 30000) {
  const worker = typeof navigator !== "undefined" && navigator.serviceWorker?.controller;
  if (!worker) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, timeout);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer); channel.port1.close(); resolve(event.data);
    };
    worker.postMessage(message, [channel.port2]);
  });
}
export async function saveOfflineRoute(path) {
  return workerMessage({ type: "OFFLINE_SAVE_ROUTE", path });
}
export async function clearOfflineAccount() {
  return workerMessage({ type: "OFFLINE_CLEAR" });
}
