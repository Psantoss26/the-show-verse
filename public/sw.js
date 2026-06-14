const VERSION = "showverse-v4";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const API_CACHE = `${VERSION}-api`;
const IMAGE_CACHE = `${VERSION}-images`;
const OFFLINE_FALLBACK_URL = "/offline.html";

const APP_SHELL = [
  "/",
  OFFLINE_FALLBACK_URL,
  "/site.webmanifest",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/pwa-icon-1024.png",
  "/pwa-maskable-512.png",
  "/pwa-apple-icon.png",
  "/logo-TSV-sinFondo.png",
  "/logo-final.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("showverse-") && !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

async function isMaintenanceResponse(response) {
  if (!response) return true;
  if (response.status >= 500) return true;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return false;

  try {
    const text = await response.clone().text();
    return (
      text.includes("Servidor en mantenimiento") ||
      text.includes("theshowverse-maintenance")
    );
  } catch {
    return false;
  }
}

async function getUsableCachedNavigation(request) {
  const cache = await caches.open(PAGE_CACHE);
  const staticCache = await caches.open(STATIC_CACHE);
  const candidates = [
    await cache.match(request),
    await cache.match("/"),
    await staticCache.match(OFFLINE_FALLBACK_URL),
  ];

  for (const candidate of candidates) {
    if (candidate && !(await isMaintenanceResponse(candidate))) {
      return candidate;
    }
  }

  return null;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (await isMaintenanceResponse(response)) {
      throw new Error("maintenance-response");
    }
    if (response.ok) cache.put(request, response.clone());
    await trimCache(PAGE_CACHE, 30);
    return response;
  } catch {
    return (
      (await getUsableCachedNavigation(request)) ||
      new Response("The Show Verse esta disponible offline cuando ya has visitado esta pantalla.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    cache.put(request, response.clone());
    trimCache(cacheName, maxEntries);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
        trimCache(cacheName, maxEntries);
      }
      return response;
    })
    .catch(() => null);

  return cached || (await fresh) || new Response(JSON.stringify({ offline: true }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, 120));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE, 120));
    return;
  }

  if (url.hostname === "api.themoviedb.org") {
    event.respondWith(staleWhileRevalidate(request, API_CACHE, 160));
    return;
  }

  if (
    request.destination === "image" ||
    url.hostname === "image.tmdb.org" ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|avif|svg)$/)
  ) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, 220));
  }
});
