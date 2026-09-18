import { workerMessage } from "./client.js";

let navigationIntent = 0;
export async function openSavedRoute(href, { replace = false } = {}) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return false;
  if (url.pathname === location.pathname && url.search === location.search) {
    if (url.hash) window.location.hash = url.hash;
    return true;
  }
  const intent = ++navigationIntent;
  const result = await workerMessage({ type: "OFFLINE_HAS_ROUTE", path: url.href });
  if (intent !== navigationIntent || !result?.available) return false;
  window.location[replace ? "replace" : "assign"](url.href);
  return true;
}
