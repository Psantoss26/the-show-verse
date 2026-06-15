const VERSION = "showverse-v8";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const API_CACHE = `${VERSION}-api`;
const IMAGE_CACHE = `${VERSION}-images`;
const ROUTE_CACHE = `${VERSION}-routes`;
const OFFLINE_FALLBACK_URL = "/offline.html";
const OFFLINE_JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const TMDB_BASE = "https://api.themoviedb.org/3";
let runtimeConfig = {
  tmdbApiKey: "",
};

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

function isAuthNavigationPath(pathname) {
  return (
    pathname === "/auth/callback" ||
    pathname.startsWith("/auth/callback/") ||
    pathname === "/auth/tmdb/callback" ||
    pathname.startsWith("/auth/tmdb/callback/")
  );
}

function isNetworkOnlyApiPath(pathname) {
  return (
    pathname === "/api/health" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/dashboard/sections/") ||
    pathname.startsWith("/api/tmdb/auth/") ||
    pathname === "/api/tmdb/collection" ||
    pathname.startsWith("/api/tmdb/movies/") ||
    pathname.startsWith("/api/tmdb/tv/") ||
    pathname === "/api/tmdb/account" ||
    pathname === "/api/tmdb/account/me" ||
    pathname.startsWith("/api/tmdb/account/me/") ||
    pathname.startsWith("/api/tmdb/session/") ||
    pathname.startsWith("/api/trakt/auth/") ||
    pathname.startsWith("/api/trakt/oauth/")
  );
}

function isOfflineCacheableUrl(url) {
  if (url.origin !== self.location.origin) return true;
  if (isAuthNavigationPath(url.pathname)) return false;
  if (isNetworkOnlyApiPath(url.pathname)) return false;
  return true;
}

function localJson(payload, { status = 200 } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: OFFLINE_JSON_HEADERS,
  });
}

function getTmdbApiKey() {
  return runtimeConfig.tmdbApiKey || "";
}

function buildTmdbUrl(path, params = {}) {
  const apiKey = getTmdbApiKey();
  if (!apiKey) return null;

  const url = new URL(`${TMDB_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("api_key", apiKey);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

async function fetchTmdbJson(path, params = {}, init = {}) {
  const url = buildTmdbUrl(path, params);
  if (!url) {
    return localJson({ error: "TMDB_CLIENT_KEY_MISSING", offline: true }, { status: 503 });
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const json = await response.json().catch(() => ({}));
  return localJson(json, { status: response.ok ? 200 : response.status || 500 });
}

async function fetchTmdbData(path, params = {}, init = {}) {
  const url = buildTmdbUrl(path, params);
  if (!url) throw new Error("TMDB_CLIENT_KEY_MISSING");
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.status_message || `TMDb ${response.status}`);
  }
  return json;
}

async function localDashboardSection(section) {
  const config = {
    tendencias: {
      title: "Tendencias",
      eyebrow: "TMDb",
      description: "Los títulos que más se están moviendo ahora mismo.",
    },
    populares: {
      title: "Populares",
      eyebrow: "TMDb",
      description: "Películas y series con mayor tracción.",
    },
    recomendados: {
      title: "Recomendados",
      eyebrow: "TMDb",
      description: "Recomendaciones generadas desde TMDb en el dispositivo.",
    },
    "mas-esperadas": {
      title: "Más esperadas",
      eyebrow: "TMDb",
      description: "Estrenos anticipados destacados.",
    },
  }[section];

  if (!config) {
    return localJson({ error: "Sección no encontrada", items: [] }, { status: 404 });
  }

  let items = [];
  if (section === "tendencias") {
    const data = await fetchTmdbData("/trending/all/week");
    items = (data.results || []).filter((item) => item.media_type === "movie" || item.media_type === "tv");
  } else if (section === "populares") {
    const [movies, shows] = await Promise.all([
      fetchTmdbData("/movie/popular", { page: 1 }),
      fetchTmdbData("/tv/popular", { page: 1 }),
    ]);
    items = [
      ...(movies.results || []).map((item) => ({ ...item, media_type: "movie" })),
      ...(shows.results || []).map((item) => ({ ...item, media_type: "tv" })),
    ];
  } else if (section === "mas-esperadas") {
    const today = new Date().toISOString().slice(0, 10);
    const [movies, shows] = await Promise.all([
      fetchTmdbData("/discover/movie", {
        "primary_release_date.gte": today,
        sort_by: "popularity.desc",
        page: 1,
      }),
      fetchTmdbData("/discover/tv", {
        "first_air_date.gte": today,
        sort_by: "popularity.desc",
        page: 1,
      }),
    ]);
    items = [
      ...(movies.results || []).map((item) => ({ ...item, media_type: "movie" })),
      ...(shows.results || []).map((item) => ({ ...item, media_type: "tv" })),
    ];
  } else if (section === "recomendados") {
    const [movies, shows] = await Promise.all([
      fetchTmdbData("/movie/popular", { page: 2 }),
      fetchTmdbData("/tv/popular", { page: 2 }),
    ]);
    items = [
      ...(movies.results || []).map((item) => ({ ...item, media_type: "movie" })),
      ...(shows.results || []).map((item) => ({ ...item, media_type: "tv" })),
    ];
  }

  return localJson({
    section,
    ...config,
    items: items.map((item) => ({
      ...item,
      source: "tmdb",
      sources: ["tmdb"],
      section,
      _key: `local:${item.media_type}:${item.id}`,
    })),
    localRuntime: true,
  });
}

async function localTmdbApiFallback(request) {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return localJson({
      ok: true,
      service: "the-show-verse-pwa",
      localRuntime: true,
      serverReachable: false,
      timestamp: new Date().toISOString(),
    });
  }

  if (url.pathname.startsWith("/api/dashboard/sections/")) {
    const section = decodeURIComponent(url.pathname.split("/").pop() || "");
    return localDashboardSection(section);
  }

  if (url.pathname === "/api/tmdb/auth/request-token") {
    const tokenResponse = await fetchTmdbJson("/authentication/token/new");
    const tokenJson = await tokenResponse.clone().json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenJson?.success || !tokenJson?.request_token) {
      return tokenResponse;
    }

    const origin = url.origin;
    const redirectTo = `${origin}/auth/callback`;
    const authenticateUrl =
      `https://www.themoviedb.org/authenticate/${tokenJson.request_token}` +
      `?redirect_to=${encodeURIComponent(redirectTo)}`;

    return localJson({
      request_token: tokenJson.request_token,
      expires_at: tokenJson.expires_at,
      redirect_to: redirectTo,
      authenticate_url: authenticateUrl,
      localRuntime: true,
    });
  }

  if (url.pathname === "/api/tmdb/auth/session") {
    if (request.method !== "POST") {
      return localJson({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    }
    const body = await request.json().catch(() => ({}));
    const requestToken = body?.request_token || body?.requestToken;
    if (!requestToken) {
      return localJson({ error: "Falta request_token" }, { status: 400 });
    }
    return fetchTmdbJson("/authentication/session/new", {}, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=utf-8" },
      body: JSON.stringify({ request_token: requestToken }),
    });
  }

  if (url.pathname === "/api/tmdb/auth/account") {
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      return localJson({ error: "Missing session_id" }, { status: 400 });
    }
    return fetchTmdbJson("/account", { session_id: sessionId });
  }

  if (url.pathname === "/api/tmdb/collection") {
    const id = url.searchParams.get("id");
    if (!id) return localJson({ error: "Missing id" }, { status: 400 });
    const collection = await fetchTmdbData(`/collection/${id}`, { language: "es-ES" });
    const parts = Array.isArray(collection?.parts) ? [...collection.parts] : [];
    parts.sort((a, b) =>
      (a?.release_date || "9999-99-99").localeCompare(b?.release_date || "9999-99-99"),
    );
    return localJson({
      ok: true,
      collection: {
        source: "collection",
        id: String(collection?.id),
        name: collection?.name || "Colección",
        description: collection?.overview || "",
        item_count: parts.length,
        poster_path: collection?.poster_path || null,
        backdrop_path: collection?.backdrop_path || null,
        tmdbUrl: collection?.id ? `https://www.themoviedb.org/collection/${collection.id}` : null,
      },
      items: parts.map((item) => ({
        ...item,
        media_type: "movie",
        title: item?.title,
      })),
      localRuntime: true,
    });
  }

  {
    const creditsMatch = url.pathname.match(/^\/api\/tmdb\/movies\/([^/]+)\/credits$/);
    if (creditsMatch) {
      return fetchTmdbJson(`/movie/${creditsMatch[1]}/credits`, { language: "es-ES" });
    }
  }

  {
    const tvMatch = url.pathname.match(/^\/api\/tmdb\/tv\/([^/]+)$/);
    if (tvMatch) {
      return fetchTmdbJson(`/tv/${tvMatch[1]}`, { language: "es-ES" });
    }
  }

  {
    const episodeMatch = url.pathname.match(
      /^\/api\/tmdb\/tv\/([^/]+)\/season\/([^/]+)\/episode\/([^/]+)$/,
    );
    if (episodeMatch) {
      const data = await fetchTmdbData(
        `/tv/${episodeMatch[1]}/season/${episodeMatch[2]}/episode/${episodeMatch[3]}`,
        { language: "es-ES" },
      );
      return localJson({
        name: data?.name || null,
        season_number: data?.season_number ?? Number(episodeMatch[2]),
        episode_number: data?.episode_number ?? Number(episodeMatch[3]),
        localRuntime: true,
      });
    }
  }

  return localJson({ error: "LOCAL_API_FALLBACK_UNAVAILABLE", offline: true }, { status: 503 });
}

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
    await cache.match("/"),
    await staticCache.match("/"),
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

async function networkOnlyNavigation(request, preloadResponsePromise = null) {
  try {
    const preloadResponse = preloadResponsePromise ? await preloadResponsePromise : null;
    const response = preloadResponse || (await fetch(request));
    if (await isUnusableResponse(response)) {
      throw new Error("unusable-response");
    }
    return response;
  } catch {
    const staticCache = await caches.open(STATIC_CACHE);
    return (
      (await staticCache.match(OFFLINE_FALLBACK_URL)) ||
      new Response("Necesitas conexion con el servidor para iniciar sesion.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({ offline: true }), {
      status: 503,
      headers: OFFLINE_JSON_HEADERS,
    });
  }
}

async function networkOnlyWithLocalFallback(request) {
  const fallbackRequest = request.clone();
  const runLocalFallback = async () => {
    try {
      return await localTmdbApiFallback(fallbackRequest.clone());
    } catch (error) {
      return localJson(
        {
          error: error?.message || "LOCAL_API_FALLBACK_FAILED",
          offline: true,
        },
        { status: 503 },
      );
    }
  };

  try {
    const response = await fetch(request);
    if (response.status >= 500) {
      return runLocalFallback();
    }
    return response;
  } catch {
    return runLocalFallback();
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
      const normalizedUrl = new URL(url, self.location.origin);
      if (!isOfflineCacheableUrl(normalizedUrl)) return;
      const response = await fetch(request);
      if (!response.ok || (await isUnusableResponse(response))) return;

      const targetCache =
        normalizedUrl.pathname.match(/\.[a-z0-9]+$/i)
          ? staticCache
          : pageCache;
      await targetCache.put(request, response.clone());
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
  if (data.type === "SHOWVERSE_CLIENT_CONFIG") {
    runtimeConfig = {
      ...runtimeConfig,
      tmdbApiKey: typeof data.tmdbApiKey === "string" ? data.tmdbApiKey : runtimeConfig.tmdbApiKey,
    };
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    if (url.origin === self.location.origin && isAuthNavigationPath(url.pathname)) {
      event.respondWith(networkOnlyNavigation(request, event.preloadResponse));
      return;
    }
    event.respondWith(networkFirst(request, event.preloadResponse));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, 120));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    if (isNetworkOnlyApiPath(url.pathname)) {
      event.respondWith(networkOnlyWithLocalFallback(request));
      return;
    }
    event.respondWith(staleWhileRevalidate(request, API_CACHE, 120));
    return;
  }

  if (
    sameOriginUrl(request) &&
    !url.pathname.startsWith("/api/") &&
    (request.headers.get("accept") || "").includes("text/x-component")
  ) {
    if (isAuthNavigationPath(url.pathname)) {
      event.respondWith(networkOnly(request));
      return;
    }
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
