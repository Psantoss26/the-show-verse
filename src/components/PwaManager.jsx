"use client";

import { useEffect, useState } from "react";
import { Download, WifiOff, RotateCw } from "lucide-react";
import {
  flushOfflineMutations,
  getOfflineQueueCount,
  subscribeOfflineQueue,
} from "@/lib/offline/syncQueue";

const ENABLE_SERVICE_WORKER = process.env.NODE_ENV === "production";

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
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

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
      navigator.serviceWorker.register("/sw.js").catch((error) => {
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
    const onOnline = () => {
      setOnline(true);
      syncNow();
    };
    const onOffline = () => setOnline(false);

    const unsubscribe = subscribeOfflineQueue(setPending);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if (navigator.onLine) syncNow();

    return () => {
      unsubscribe();
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
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
        <button
          type="button"
          onClick={installApp}
          className="fixed bottom-20 right-4 z-50 grid h-12 w-12 place-items-center rounded-full border border-sky-300/25 bg-sky-500/15 text-sky-100 shadow-[0_0_22px_rgba(14,165,233,0.24)] ring-1 ring-sky-500/35 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.04] hover:bg-sky-500/20 hover:text-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 active:scale-95 lg:bottom-4"
          title="Instalar app"
          aria-label="Instalar app"
        >
          <Download className="h-5 w-5" />
        </button>
      )}
    </>
  );
}
