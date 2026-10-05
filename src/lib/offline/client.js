// Browser-side bridge. No tokens or credentials are written into snapshots.
export const CONNECTION_EVENT = "showverse:offline-connection";
export const PREPARATION_EVENT = "showverse:offline-preparation";
// Copia sin conexión en marcha de un usuario (ver prepare.js): si existe al
// arrancar, la anterior se cortó y la siguiente la reanuda.
export const runKey = (userId) => `showverse:offline:run:${userId}`;
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
// `freshSince`: al reanudar una copia interrumpida, lo guardado después de ese
// instante no se vuelve a descargar.
export async function saveOfflineRoute(path, { freshSince } = {}) {
  return workerMessage({ type: "OFFLINE_SAVE_ROUTE", path, freshSince });
}
export async function clearOfflineAccount() {
  return workerMessage({ type: "OFFLINE_CLEAR" });
}
