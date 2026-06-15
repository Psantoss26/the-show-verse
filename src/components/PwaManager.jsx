"use client";

import { useEffect, useRef, useState } from "react";
import { Download, WifiOff, RotateCw } from "lucide-react";
import {
  flushOfflineMutations,
  getOfflineQueueCount,
  subscribeOfflineQueue,
} from "@/lib/offline/syncQueue";
import LiquidButton from "@/components/LiquidButton";

const ENABLE_SERVICE_WORKER = process.env.NODE_ENV === "production";
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || "";
const APP_SHELL_ROUTES = [
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
];

function isAuthRoute(pathname) {
  return (
    pathname === "/auth/callback" ||
    pathname.startsWith("/auth/callback/") ||
    pathname === "/auth/tmdb/callback" ||
    pathname.startsWith("/auth/tmdb/callback/")
  );
}

function isCacheableInternalRoute(url) {
  if (url.origin !== window.location.origin) return false;
  if (isAuthRoute(url.pathname)) return false;
  if (url.hash && url.pathname === window.location.pathname) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/_next/")) return false;
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return false;
  return true;
}

function collectInternalRoutes(limit = 80) {
  if (typeof document === "undefined") return APP_SHELL_ROUTES;

  const routes = new Set(APP_SHELL_ROUTES);
  document.querySelectorAll("a[href]").forEach((anchor) => {
    if (routes.size >= limit) return;
    try {
      const url = new URL(anchor.getAttribute("href"), window.location.origin);
      if (!isCacheableInternalRoute(url)) return;
      routes.add(`${url.pathname}${url.search}`);
    } catch {}
  });

  return Array.from(routes).slice(0, limit);
}

async function clearShowVerseCaches() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const keys = await window.caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith("showverse-"))
      .map((key) => window.caches.delete(key)),
  );
}

export default function PwaManager() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [online, setOnline] = useState(true);
  const [serverReachable, setServerReachable] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const serverReachableRef = useRef(true);
  const routeWarmupScheduledRef = useRef(false);

  useEffect(() => {
    serverReachableRef.current = serverReachable;
  }, [serverReachable]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setOnline(navigator.onLine);
    setPending(getOfflineQueueCount());
    setIsInstalled(
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator.standalone === true,
    );
    if (!ENABLE_SERVICE_WORKER && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .then(clearShowVerseCaches)
        .catch((error) => {
          console.warn("[PWA] No se pudo limpiar el service worker local", error);
        });
    } else if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          registration.update?.().catch(() => {});
          warmAppShell(registration);
        })
        .catch((error) => {
          console.warn("[PWA] No se pudo registrar el service worker", error);
        });
    }

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    const pingServer = async () => {
      if (!navigator.onLine) {
        setServerReachable(false);
        return false;
      }

      try {
        const res = await fetch(`/api/health?__pwa_ping=${Date.now()}`, {
          cache: "no-store",
          credentials: "include",
        });
        const ok = res.ok;
        setServerReachable(ok);
        return ok;
      } catch {
        setServerReachable(false);
        return false;
      }
    };

    const onOnline = () => {
      setOnline(true);
      syncNow();
      pingServer().then((ok) => {
        if (ok) warmAppShell();
      });
    };
    const onOffline = () => {
      setOnline(false);
      setServerReachable(false);
    };

    const onDocumentClick = (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;

      let url;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (!isCacheableInternalRoute(url)) return;
      if (navigator.onLine && serverReachableRef.current) return;

      event.preventDefault();
      window.location.assign(`${url.pathname}${url.search}${url.hash}`);
    };

    const unsubscribe = subscribeOfflineQueue(setPending);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("click", onDocumentClick, true);

    if (navigator.onLine) {
      syncNow();
      pingServer().then((ok) => {
        if (ok) warmAppShell();
      });
    }

    const pingInterval = window.setInterval(pingServer, 30000);
    const mutationObserver =
      "MutationObserver" in window
        ? new MutationObserver(() => {
            if (!navigator.onLine || !serverReachableRef.current) return;
            scheduleRouteWarmup();
          })
        : null;
    mutationObserver?.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      unsubscribe();
      window.clearInterval(pingInterval);
      mutationObserver?.disconnect();
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, []);

  async function syncNow() {
    setSyncing(true);
    try {
      const result = await flushOfflineMutations();
      setPending(result.pending);
    } finally {
      setSyncing(false);
    }
  }

  async function warmAppShell(registration = null) {
    if (typeof window === "undefined" || !navigator.onLine) return;
    if (!("serviceWorker" in navigator)) return;

    try {
      const readyRegistration = registration || (await navigator.serviceWorker.ready);
      const worker =
        readyRegistration.active ||
        readyRegistration.waiting ||
        readyRegistration.installing ||
        navigator.serviceWorker.controller;

      worker?.postMessage({
        type: "SHOWVERSE_CLIENT_CONFIG",
        tmdbApiKey: TMDB_API_KEY,
      });

      worker?.postMessage({
        type: "SHOWVERSE_WARM_APP_SHELL",
        urls: collectInternalRoutes(),
      });
    } catch (error) {
      console.warn("[PWA] No se pudo preparar el modo offline", error);
    }
  }

  function scheduleRouteWarmup() {
    if (typeof window === "undefined") return;
    if (routeWarmupScheduledRef.current) return;
    routeWarmupScheduledRef.current = true;

    const run = () => {
      routeWarmupScheduledRef.current = false;
      warmAppShell();
    };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 4000 });
      return;
    }
    window.setTimeout(run, 1000);
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setInstallPrompt(null);
  }

  const showInstall = installPrompt && !isInstalled;
  const showStatus = !online || pending > 0;
  if (!showInstall && !showStatus) return null;

  return (
    <>
      {showStatus && (
        <div className="fixed bottom-20 left-3 right-3 z-50 mx-auto flex max-w-md flex-wrap items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/90 px-3 py-2 text-xs text-white shadow-2xl backdrop-blur-md lg:bottom-4 lg:right-4 lg:left-auto">
          <div className="flex items-center gap-2 text-neutral-200">
            {!online ? (
              <WifiOff className="h-4 w-4 text-amber-300" />
            ) : (
              <RotateCw
                className={`h-4 w-4 text-emerald-300 ${syncing ? "animate-spin" : ""}`}
              />
            )}
            <span>
              {!online
                ? "Modo offline"
                : pending > 0
                  ? `${pending} cambio${pending === 1 ? "" : "s"} pendiente${pending === 1 ? "" : "s"}`
                  : "Sincronizado"}
            </span>
            {online && pending > 0 && (
              <button
                type="button"
                onClick={syncNow}
                disabled={syncing}
                className="rounded-lg bg-white/10 px-2 py-1 font-bold text-white transition hover:bg-white/20 disabled:opacity-60"
              >
                Sincronizar
              </button>
            )}
          </div>
        </div>
      )}

      {showInstall && (
        <LiquidButton
          onClick={installApp}
          activeColor="blue"
          groupId="pwa-install-action"
          title="Instalar app"
          className="!fixed !bottom-20 !right-4 !z-50 lg:!bottom-4 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15"
        >
          <Download className="h-5 w-5" />
        </LiquidButton>
      )}
    </>
  );
}
