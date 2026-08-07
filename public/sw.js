/* The Show Verse — Service Worker (Fase 1: lectura offline)
 *
 * Objetivo: que la PWA instalada ABRA y sea navegable cuando el servidor propio
 * (NAS) está apagado y el dispositivo tiene internet. Los DATOS de cada página ya
 * viven en localStorage (stale-while-revalidate); este SW solo se encarga del
 * "app shell" (documentos HTML + estáticos) para que la app cargue sin el NAS.
 *
 * Principio irrenunciable (causa del revert anterior): NUNCA degradar la
 * experiencia online. Por eso:
 *   - Navegaciones y RSC → NETWORK-FIRST (siempre lo fresco cuando hay servidor),
 *     con fallback a caché SOLO si la red falla o el origen devuelve 5xx (el túnel
 *     Cloudflare responde 5xx cuando el NAS está caído: hay que tratarlo como
 *     "offline", no como contenido válido).
 *   - Estáticos con hash (/_next/static) → CACHE-FIRST (inmutables).
 *   - Recursos públicos sin hash (logos, iconos, imágenes) → NETWORK-FIRST:
 *     deben actualizarse al mismo tiempo en PWA y WebView.
 *   - /api/* y CUALQUIER petición cross-origin → PASSTHROUGH: el SW no las toca
 *     (los datos los resuelve la app vía localStorage; las imágenes/tráilers de
 *     TMDb/YouTube cargan por internet). Así el SW no puede "bloquear" nada.
 *
 * Kill-switch: si algo se tuerce, poner en la consola del navegador
 *   navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister()))
 * o servir /sw.js?kill — pero la vía soportada es el flag de PwaManager.
 */

const VERSION = "v2";
const SHELL_CACHE = `showverse-shell-${VERSION}`; // documentos HTML + RSC
const ASSET_CACHE = `showverse-assets-${VERSION}`; // solo /_next/static con hash
const OFFLINE_URL = "/offline.html";
const APP_SHELL_URL = "/"; // último recurso de navegación si no hay documento cacheado

// Precache mínimo: el fallback offline y el shell base. El resto se cachea al
// visitarse online (cache-as-you-browse), que es justo "el último contenido cargado".
const PRECACHE_URLS = [OFFLINE_URL, APP_SHELL_URL];

// Next cambia la URL de estos recursos cuando cambia su contenido. Los assets
// de `public/` conservan, en cambio, nombres como `/logo.png`; tratarlos como
// inmutables dejaba versiones distintas en la PWA y el WebView de Android.
const isImmutableAsset = (url) => url.pathname.startsWith("/_next/static/");

const isRscRequest = (request, url) =>
  url.searchParams.has("_rsc") ||
  request.headers.get("RSC") === "1" ||
  (request.headers.get("Accept") || "").includes("text/x-component");

const isNavigation = (request) =>
  request.mode === "navigate" ||
  (request.method === "GET" &&
    (request.headers.get("Accept") || "").includes("text/html"));

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // No abortamos la instalación si algún precache falla (p. ej. offline.html
      // aún no desplegado): cacheamos best-effort uno a uno.
      await Promise.all(
        PRECACHE_URLS.map((u) =>
          cache.add(new Request(u, { cache: "reload" })).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) =>
              k.startsWith("showverse-") &&
              k !== SHELL_CACHE &&
              k !== ASSET_CACHE,
          )
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Permite a la página forzar la activación de un SW nuevo (flujo de actualización).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

// Network-first con fallback a caché. Trata las respuestas NO-ok (>=500, típico del
// túnel con el NAS caído) como fallo → usa la caché. Solo cachea respuestas 200.
async function networkFirst(request, { fallbackToShell = false } = {}) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
      return response;
    }
    // 5xx/opaca/redirección de error → tratamos como offline.
    if (response && response.status >= 500) throw new Error(`origin ${response.status}`);
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackToShell) {
      const shell =
        (await cache.match(APP_SHELL_URL)) || (await cache.match(OFFLINE_URL));
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo GET; el resto (POST de login/logout/mutaciones) pasa directo a la red.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // PASSTHROUGH: cross-origin (imágenes TMDb, YouTube, etc.) → no tocar.
  if (url.origin !== self.location.origin) return;

  // PASSTHROUGH: /api/* → no tocar (los datos los sirve localStorage; nunca
  // cacheamos API para no servir datos obsoletos online).
  if (url.pathname.startsWith("/api/")) return;

  // Estáticos inmutables de Next (con hash) → cache-first.
  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request).catch(() => fetch(request)));
    return;
  }

  // RSC (navegación cliente de App Router) → network-first; si falla, caché; si no
  // hay, dejamos que falle para que el router haga navegación "dura" (que el SW
  // sí sirve desde caché de documentos).
  if (isRscRequest(request, url)) {
    event.respondWith(
      networkFirst(request).catch(() => Response.error()),
    );
    return;
  }

  // Navegaciones (documento HTML) → network-first con fallback al shell.
  if (isNavigation(request)) {
    event.respondWith(networkFirst(request, { fallbackToShell: true }));
    return;
  }

  // Resto de GET same-origin (json públicos, webmanifest…) → network-first suave.
  event.respondWith(networkFirst(request).catch(() => fetch(request)));
});
