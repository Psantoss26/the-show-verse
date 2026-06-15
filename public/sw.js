const VERSION = "showverse-v6";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const API_CACHE = `${VERSION}-api`;
const IMAGE_CACHE = `${VERSION}-images`;
const ROUTE_CACHE = `${VERSION}-routes`;
const OFFLINE_FALLBACK_URL = "/offline.html";
const OFFLINE_JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

const APP_SHELL = [
  "/",
  "/movies",
  "/series",
  "/favorites",
  "/watchlist",
  "/calendar",
  "/history",
  "/in-progress",
  "/profile",
  "/lists",
  "/login",
  OFFLINE_FALLBACK_URL,
  "/site.webmanifest",
  "/favicon.ico",
  "/browser-icon.png",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/pwa-icon-1024.png",
  "/pwa-maskable-512.png",
  "/pwa-apple-icon.png",
  "/logo-TSV-sinFondo.png",
  "/logo-final.png",
];

const NAVIGATION_PRELOAD_SUPPORTED = "navigationPreload" in self.registration;

function sameOriginUrl(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(
          APP_SHELL.map((url) =>
            fetch(url, { credentials: "include", cache: "reload" }).then(
              async (response) => {
                if (response.ok && !(await isUnusableResponse(response))) {
                  await cache.put(url, response.clone());
                }
              },
            ),
          ),
        ),
      )
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
      .then(() =>
        NAVIGATION_PRELOAD_SUPPORTED
          ? self.registration.navigationPreload.enable()
          : undefined,
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

async function isUnusableResponse(response) {
  if (!response) return true;
  if (response.status >= 500) return true;

  const contentType = response.headers.get("content-type") || "";
  const robots = response.headers.get("x-robots-tag") || "";
  if (response.status === 404 && /noindex/i.test(robots)) return true;
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return false;

  try {
    const text = await response.clone().text();
    return (
      text.includes("Servidor en mantenimiento") ||
      text.includes("theshowverse-maintenance") ||
      text.trim() === "Not Found"
    );
  } catch {
    return false;
  }
}

async function getUsableCachedNavigation(request) {
  const cache = await caches.open(PAGE_CACHE);
  const staticCache = await caches.open(STATIC_CACHE);
  const routeCache = await caches.open(ROUTE_CACHE);
  const url = new URL(request.url, self.location.origin);
  const pathnameRequest = new Request(url.pathname, {
    method: "GET",
    credentials: "include",
  });
  const candidates = [
    await cache.match(request),
    await routeCache.match(request),
    await cache.match(pathnameRequest),
    await routeCache.match(pathnameRequest),
    await cache.match(url.pathname),
    await routeCache.match(url.pathname),
    await staticCache.match(OFFLINE_FALLBACK_URL),
  ];

  for (const candidate of candidates) {
    if (candidate && !(await isUnusableResponse(candidate))) {
      return candidate;
    }
  }

  return null;
}

async function networkFirst(request, preloadResponsePromise = null) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const preloadResponse = preloadResponsePromise ? await preloadResponsePromise : null;
    const response = preloadResponse || (await fetch(request));
    if (await isUnusableResponse(response)) {
      throw new Error("unusable-response");
    }
    if (response.ok) {
      cache.put(request, response.clone());
      const url = new URL(request.url, self.location.origin);
      if (!url.search) {
        cache.put(url.pathname, response.clone());
      }
    }
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

async function routeStaleWhileRevalidate(request) {
  const cache = await caches.open(ROUTE_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request, { credentials: "include" })
    .then(async (response) => {
      if (response.ok && !(await isUnusableResponse(response))) {
        cache.put(request, response.clone());
        trimCache(ROUTE_CACHE, 80);
      }
      return response;
    })
    .catch(() => null);

  return (
    cached ||
    (await fresh) ||
    new Response("The Show Verse esta disponible offline cuando ya has visitado esta pantalla.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
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

  const response = await fresh;
  if (cached && (!response || response.status >= 500 || response.status === 404)) {
    return cached;
  }

  return cached || response || new Response(JSON.stringify({ offline: true }), {
    status: 503,
    headers: OFFLINE_JSON_HEADERS,
  });
}

async function warmAppShell(urls = APP_SHELL) {
  const staticCache = await caches.open(STATIC_CACHE);
  const pageCache = await caches.open(PAGE_CACHE);

  await Promise.allSettled(
    urls.map(async (url) => {
      const request = new Request(url, {
        method: "GET",
        credentials: "include",
        cache: "reload",
      });
      const response = await fetch(request);
      if (!response.ok || (await isUnusableResponse(response))) return;

      const targetCache =
        new URL(url, self.location.origin).pathname.match(/\.[a-z0-9]+$/i)
          ? staticCache
          : pageCache;
      await targetCache.put(request, response.clone());
      const normalizedUrl = new URL(url, self.location.origin);
      if (!normalizedUrl.search && targetCache === pageCache) {
        await targetCache.put(normalizedUrl.pathname, response.clone());
      }
    }),
  );

  await Promise.all([trimCache(STATIC_CACHE, 140), trimCache(PAGE_CACHE, 40)]);
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SHOWVERSE_WARM_APP_SHELL") {
    event.waitUntil(warmAppShell(Array.isArray(data.urls) ? data.urls : APP_SHELL));
  }
  if (data.type === "SHOWVERSE_CACHE_ROUTES") {
    event.waitUntil(warmAppShell(Array.isArray(data.urls) ? data.urls : []));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, event.preloadResponse));
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

  if (
    sameOriginUrl(request) &&
    !url.pathname.startsWith("/api/") &&
    (request.headers.get("accept") || "").includes("text/x-component")
  ) {
    event.respondWith(routeStaleWhileRevalidate(request));
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
