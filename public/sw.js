/* Offline de consulta. Red primero; nunca se sirven errores como instantáneas.
 * API y documentos privados pertenecen a UNA cuenta. Logout/cambio de cuenta
 * invalida también peticiones en vuelo. Los datos no caducan con el build.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "unversioned";
const SHELL_CACHE = `showverse-shell-${VERSION}`;
const ASSET_CACHE = `showverse-assets-${VERSION}`;
const META_CACHE = "showverse-offline-meta-v1";
const DATA_PREFIX = "showverse-offline-data-v1-";
const OFFLINE_URL = "/offline.html";
const META_URL = new URL("/__offline/session", self.location.origin).href;
const READ_POSTS = new Set(["/api/backend/items/states", "/api/imdb/ratings"]);
let sessionPromise;
let offlineUntil = 0;
let epoch = 0;
let identityChange = Promise.resolve();
let originProbe;
let storageFull = false;

const absolute = (path) => new URL(path, self.location.origin).href;
const unavailable = (response) => response.status >= 500 || [408, 429].includes(response.status);
const jsonResponse = (body, status = 503) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const missing = () => jsonResponse({ offline: true, error: "No hay una copia guardada de estos datos en este dispositivo." });
const isRscRequest = (request, url) => url.searchParams.has("_rsc") || request.headers.get("RSC") === "1" || (request.headers.get("Accept") || "").includes("text/x-component");
const isNavigation = (request) => request.mode === "navigate" || (request.headers.get("Accept") || "").includes("text/html");
const excludedApi = (path) => /\/(?:request-token|pair-mobile|callback|claim|login|connect|disconnect)(?:\/|$)/.test(path) || (!["/api/auth/me", "/api/auth/connections", "/api/spotify/auth/status", "/api/plex/auth/status"].includes(path) && /\/(?:auth|session|private-access)(?:\/|$)/.test(path) && path !== "/api/trakt/auth/status");

async function session() {
  if (!sessionPromise) sessionPromise = (async () => {
    const stored = await (await caches.open(META_CACHE)).match(META_URL);
    return stored ? stored.json() : { owner: null };
  })();
  return sessionPromise;
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}
async function connectivity(online) {
  offlineUntil = online ? 0 : Date.now() + 15000;
  await broadcast({ type: "OFFLINE_CONNECTION", online });
}
async function confirmOriginFailure() {
  // A slow third-party integration or one broken endpoint is not a NAS outage.
  // Only the uncached readiness probe may switch the whole app to read-only.
  if (!originProbe) originProbe = health(new Request(absolute("/api/health"), { cache: "no-store" })).finally(() => { originProbe = null; });
  await originProbe;
}

function changeOwner(owner) {
  identityChange = identityChange.then(async () => {
    const current = await session();
    if (current.owner === owner) return;
    epoch += 1;
    sessionPromise = Promise.resolve({ owner });
    const meta = await caches.open(META_CACHE);
    await meta.put(META_URL, jsonResponse({ owner }, 200));
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(DATA_PREFIX) || key.startsWith("showverse-shell-")).map((key) => caches.delete(key)));
    await broadcast({ type: "OFFLINE_ACCOUNT", owner });
  });
  return identityChange;
}

async function dataCache(owner) {
  return caches.open(`${DATA_PREFIX}${encodeURIComponent(owner || "anonymous")}`);
}
function canonical(input) {
  const url = new URL(typeof input === "string" ? absolute(input) : input.url);
  for (const name of ["_rsc", "_", "ts", "refresh"]) url.searchParams.delete(name);
  if (url.pathname.startsWith("/api/trakt/") && url.searchParams.has("tmdbId")) url.searchParams.delete("traktId");
  url.searchParams.sort();
  return url.href;
}
async function stamped(response) {
  const headers = new Headers(response.headers);
  headers.delete("Vary");
  headers.delete("Set-Cookie");
  headers.set("X-Showverse-Saved-At", String(Date.now()));
  return new Response(await response.arrayBuffer(), { status: response.status, headers });
}
function offlineResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Showverse-Offline", "1");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}
async function safePut(cache, key, response, generation = epoch) {
  const copy = await stamped(response);
  if (generation !== epoch) return;
  try { await cache.put(key, copy); return true; }
  catch { storageFull = true; await broadcast({ type: "OFFLINE_STORAGE_FULL" }); return false; }
}
async function network(request, timeout = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const abort = () => controller.abort();
  request.signal?.addEventListener("abort", abort, { once: true });
  try { return await fetch(new Request(request, { signal: controller.signal })); }
  finally { clearTimeout(timer); request.signal?.removeEventListener("abort", abort); }
}

async function readKey(request) {
  if (request.method === "GET") return canonical(request);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(await request.clone().text()));
  const hex = Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join("");
  const url = new URL(canonical(request));
  url.searchParams.set("__body", hex);
  return url.href;
}

// Estados por entidad: una tarjeta debe funcionar aunque cambie el orden o el
// tamaño del lote POST que la página utiliza para consultarla.
async function storeStates(cache, payload, generation) {
  if (!payload?.states) return;
  await Promise.all(Object.entries(payload.states).map(([key, value]) =>
    safePut(cache, absolute(`/__offline/states/${key}`), jsonResponse(value, 200), generation)));
}
async function cachedStates(cache, request) {
  const body = await request.clone().json().catch(() => null);
  if (!Array.isArray(body?.items)) return null;
  const states = {};
  for (const item of body.items) {
    const key = `${item.mediaType}:${item.tmdbId}`;
    const response = await cache.match(absolute(`/__offline/states/${key}`));
    if (response) states[key] = await response.json();
  }
  return Object.keys(states).length ? offlineResponse(jsonResponse({ states }, 200)) : null;
}

async function cachedCollection(cache, request) {
  const url = new URL(request.url);
  if (!/^\/api\/users\/[^/]+\/(activity|watched|reviews|favorites|watchlist|ratings|lists|followers|following)$/.test(url.pathname)) return null;
  if ([...url.searchParams.keys()].some((key) => !["limit", "offset", "refresh"].includes(key))) return null;
  const saved = await cache.match(absolute(`/__offline/collection${url.pathname}`));
  if (!saved) return null;
  const { items } = await saved.json();
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.max(1, Number(url.searchParams.get("limit")) || 60);
  const rows = items.slice(offset, offset + limit);
  const relation = /\/(followers|following)$/.test(url.pathname);
  return offlineResponse(jsonResponse({ [relation ? "users" : "items"]: rows, hasMore: offset + rows.length < items.length, offset: offset + rows.length }, 200));
}
async function cachedHistory(cache, request) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/trakt/history") return null;
  const saved = await cache.match(canonical("/api/trakt/history?type=all&page=1&limit=all&extended=full&enrich=1"))
    || await cache.match(canonical("/api/trakt/history?type=all&page=1&limit=all&extended=full&enrich=0"));
  if (!saved) return null;
  const snapshot = await saved.json();
  if (!Array.isArray(snapshot.items) || snapshot.pagination?.hasMore) return null;
  const type = url.searchParams.get("type") || "all";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const all = snapshot.items.filter((item) =>
    (type === "all" || item.type === (type === "movies" ? "movie" : "show")) &&
    (!from || String(item.watched_at).slice(0, 10) >= from) &&
    (!to || String(item.watched_at).slice(0, 10) <= to));
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.max(1, Number(url.searchParams.get("limit")) || all.length || 1);
  const items = all.slice((page - 1) * limit, page * limit);
  return offlineResponse(jsonResponse({ ...snapshot, items,
    stats: { plays: items.length, uniques: new Set(items.map((item) => `${item.type}:${item.tmdbId}`)).size,
      movies: items.filter((item) => item.type === "movie").length, shows: items.filter((item) => item.type === "show").length },
    pagination: { page, limit, returned: items.length, hasMore: page * limit < all.length },
  }, 200));
}

async function apiRead(request) {
  const url = new URL(request.url);
  let owner = (await session()).owner;
  let generation = epoch;
  let cache = await dataCache(owner);
  const key = await readKey(request);
  try {
    if (Date.now() < offlineUntil) throw new Error("origin offline");
    const response = await network(request.clone());
    if (unavailable(response)) throw new Error("origin unavailable");
    if (response.ok && !(response.headers.get("Content-Type") || "").includes("application/json")) throw new Error("Invalid API response");
    if (url.pathname === "/api/auth/me" && response.ok) {
      const auth = await response.clone().json();
      // Only an explicit auth response changes the local account. HTML from a
      // captive portal/proxy never erases a valid snapshot.
      if (typeof auth.authenticated === "boolean") {
        await changeOwner(auth.authenticated ? String(auth.user.id) : null);
        owner = (await session()).owner;
        generation = epoch;
        cache = await dataCache(owner);
      }
    }
    if (response.ok && (response.headers.get("Content-Type") || "").includes("application/json")) {
      const payload = await response.clone().json().catch(() => null);
      if (payload && !payload.degraded && !payload.offline && payload.connected !== false) {
        await safePut(cache, key, response.clone(), generation);
        if (url.pathname === "/api/backend/items/states") await storeStates(cache, payload, generation);
      }
    }
    // Never replace a genuine 401/403/404 with private cached data.
    return response;
  } catch (error) {
    if (request.signal?.aborted) throw error;
    await confirmOriginFailure();
    if (generation !== epoch) return missing();
    if (url.pathname === "/api/backend/items/states") {
      const states = await cachedStates(cache, request);
      if (states) return states;
    }
    const collection = await cachedCollection(cache, request);
    if (collection) return collection;
    const history = await cachedHistory(cache, request);
    if (history) return history;
    const saved = await cache.match(key);
    return saved ? offlineResponse(saved) : missing();
  }
}

async function immutable(request) {
  // An offline document from a previous build must retain its matching chunks.
  const saved = await caches.match(request);
  if (saved) return saved;
  const response = await network(request);
  if (response.ok) await safePut(await caches.open(ASSET_CACHE), request, response.clone());
  return response;
}
async function documentKey(request) {
  const url = new URL(canonical(request));
  url.searchParams.set("__owner", (await session()).owner || "anonymous");
  return url.href;
}
async function saveDocument(request, response, generation = epoch) {
  const key = await documentKey(request);
  await safePut(await caches.open(SHELL_CACHE), key, response.clone(), generation);
  const html = await response.text();
  const assets = new Set([...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => absolute(match[1].replaceAll("&amp;", "&")))
    .filter((url) => new URL(url).origin === self.location.origin && new URL(url).pathname.startsWith("/_next/static/")));
  // Includes CSS/fonts and page entry chunks even when reached through Next's
  // client router, which otherwise only stores an RSC fragment, not a document.
  await Promise.all([...assets].map((url) => immutable(new Request(url)).catch(() => null)));
}
async function navigation(request) {
  const generation = epoch;
  const key = await documentKey(request);
  try {
    if (Date.now() < offlineUntil) throw new Error("offline");
    const response = await network(request);
    if (unavailable(response)) throw new Error("origin unavailable");
    if (response.ok && !response.redirected && (response.headers.get("Content-Type") || "").includes("text/html")) {
      await saveDocument(request, response.clone(), generation);
    }
    return response;
  } catch {
    await confirmOriginFailure();
    if (generation === epoch) {
      const names = (await caches.keys()).filter((name) => name.startsWith("showverse-shell-")).reverse();
      // Current build first. Older documents are used ONLY while unreachable.
      names.sort((a, b) => a === SHELL_CACHE ? -1 : b === SHELL_CACHE ? 1 : 0);
      for (const name of names) {
        const saved = await (await caches.open(name)).match(key);
        if (saved) return offlineResponse(saved);
      }
    }
    // Serving '/' here renders the wrong page under the requested URL.
    return (await caches.match(absolute(OFFLINE_URL))) || new Response("Página aún no guardada para consulta sin conexión.", { status: 503 });
  }
}

async function health(request) {
  try {
    const response = await network(request, 4500);
    const payload = response.ok ? await response.clone().json().catch(() => null) : null;
    const online = Boolean(response.ok && payload?.ok === true);
    await connectivity(online);
    return online ? response : missing();
  } catch { await connectivity(false); return missing(); }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const response = await fetch(OFFLINE_URL, { cache: "reload" });
      if (response.ok) await (await caches.open(SHELL_CACHE)).put(absolute(OFFLINE_URL), response);
    } catch { /* next online visit retries */ }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  // Do not erase private snapshots on deploy. Page preparation replaces saved
  // documents first; PRUNE_BUILDS then retires their old executable assets.
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", (event) => {
  const message = event.data;
  if (message === "SKIP_WAITING") { self.skipWaiting(); return; }
  event.waitUntil((async () => {
    let result = { ok: true };
    if (message?.type === "OFFLINE_CLEAR") await changeOwner(null);
    if (message?.type === "OFFLINE_PREPARE_BEGIN") storageFull = false;
    if (message?.type === "OFFLINE_STATUS") result = { owner: (await session()).owner, online: Date.now() >= offlineUntil, storageFull };
    if (message?.type === "OFFLINE_COLLECTION") {
      const owner = (await session()).owner;
      result = { ok: false };
      if (owner && message.owner === owner && /^\/api\/users\/[^/]+\/[a-z]+$/.test(message.path) && Array.isArray(message.items)) {
        const cache = await dataCache(owner);
        const saved = await safePut(cache, absolute(`/__offline/collection${message.path}`), jsonResponse({ items: message.items }, 200));
        result = { ok: saved === true };
      }
    }
    if (message?.type === "OFFLINE_SAVE_ROUTE") {
      const url = new URL(message.path, self.location.origin);
      if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
      const response = await navigation(new Request(url, { headers: { Accept: "text/html" }, credentials: "include" }));
      result = { ok: response.ok && response.headers.get("X-Showverse-Offline") !== "1" };
    }
    if (message?.type === "OFFLINE_ROUTES") {
      const owner = (await session()).owner || "anonymous";
      const paths = new Set();
      for (const name of (await caches.keys()).filter((key) => key.startsWith("showverse-shell-"))) {
        for (const key of await (await caches.open(name)).keys()) {
          const url = new URL(key.url);
          if (url.searchParams.get("__owner") !== owner) continue;
          url.searchParams.delete("__owner");
          paths.add(url.pathname + url.search);
        }
      }
      result = { paths: [...paths] };
    }
    if (message?.type === "PRUNE_BUILDS") {
      // Caller sends this only after ALL previously saved routes were refreshed.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) =>
        (k.startsWith("showverse-shell-") || k.startsWith("showverse-assets-")) && k !== SHELL_CACHE && k !== ASSET_CACHE,
      ).map((k) => caches.delete(k)));
    }
    event.ports?.[0]?.postMessage(result);
  })().catch(() => event.ports?.[0]?.postMessage({ ok: false })));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    // The NAS can be down while the image CDN remains available. Cache image
    // responses as well for the case where the device itself loses internet.
    if (request.method === "GET" && ["image.tmdb.org", "images.unsplash.com"].includes(url.hostname)) {
      event.respondWith((async () => {
        const cache = await caches.open("showverse-offline-images-v1");
        const saved = await cache.match(request);
        if (saved) return saved;
        const response = await fetch(request);
        if (response.ok && ["/api/auth/login", "/api/auth/register", "/api/auth/google/native"].includes(url.pathname)) {
          const auth = await response.clone().json().catch(() => null);
          if (auth?.user?.id) await changeOwner(String(auth.user.id));
        }
        if (response.ok || response.type === "opaque") {
          try { await cache.put(request, response.clone()); } catch { /* quota */ }
        }
        return response;
      })());
    }
    return;
  }
  if (url.pathname === "/api/health") { event.respondWith(health(request)); return; }
  if (url.pathname.startsWith("/api/")) {
    if (request.method !== "GET" && !READ_POSTS.has(url.pathname)) {
      event.respondWith((async () => {
        if (url.pathname === "/api/auth/logout") await changeOwner(null);
        if (Date.now() < offlineUntil) return jsonResponse({ offline: true, error: "Modo sin conexión: solo consulta. No se ha guardado ningún cambio." });
        const response = await fetch(request);
        // Writes are never replayed. Refresh cached reads after a confirmed write.
        if (response.ok) await broadcast({ type: "OFFLINE_DATA_CHANGED" });
        return response;
      })());
      return;
    }
    if (!excludedApi(url.pathname)) event.respondWith(apiRead(request));
    return;
  }
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/_next/static/")) { event.respondWith(immutable(request)); return; }
  if (isRscRequest(request, url)) {
    // A flight response is tied to a router tree, build and prefetch headers.
    // Never replay it for a different tree. Next falls back to a full document.
    event.respondWith((async () => {
      try {
        if (Date.now() < offlineUntil) return Response.error();
        const response = await network(request);
        return unavailable(response) ? Response.error() : response;
      } catch { return Response.error(); }
    })());
    return;
  }
  if (isNavigation(request)) { event.respondWith(navigation(request)); return; }
  event.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    try {
      const response = await network(request);
      if (unavailable(response)) throw new Error("offline");
      if (response.ok) await safePut(cache, request, response.clone());
      return response;
    } catch { return (await caches.match(request)) || Response.error(); }
  })());
});
