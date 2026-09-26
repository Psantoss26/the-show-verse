import { workerMessage } from "./client.js";

let navigationIntent = 0;
// `navigate` is the App Router's push/replace. The service worker answers its
// Flight request with the saved page's full-tree stream, so the route opens
// without a document load (which in the installed PWA shows the browser's
// loading bar). If that stream is unavailable, Next itself falls back to a
// document navigation, which the worker serves from the saved copy.
export async function openSavedRoute(href, { replace = false, navigate = null } = {}) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return false;
  if (url.pathname === location.pathname && url.search === location.search) {
    if (url.hash) window.location.hash = url.hash;
    return true;
  }
  const intent = ++navigationIntent;
  const result = await workerMessage({ type: "OFFLINE_HAS_ROUTE", path: url.href });
  if (intent !== navigationIntent || !result?.available) return false;
  if (navigate) navigate(url.pathname + url.search + url.hash);
  else window.location[replace ? "replace" : "assign"](url.href);
  return true;
}
