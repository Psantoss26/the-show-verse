"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import LiquidButton from "@/components/LiquidButton";

// Kill-switch de escape: si el SW diera problemas, poner en localStorage
//   showverse:sw:disabled = "1"   (o abrir la app con ?nosw en la URL)
// y recargar: se desregistra y se limpian cachés, volviendo al comportamiento
// puramente online.
const SW_DISABLED_KEY = "showverse:sw:disabled";

async function clearShowVerseCaches() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const keys = await window.caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith("showverse-"))
      .map((key) => window.caches.delete(key)),
  );
}

async function unregisterAll() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((r) => r.unregister()));
  await clearShowVerseCaches();
}

function swDisabled() {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).has("nosw")) {
      window.localStorage.setItem(SW_DISABLED_KEY, "1");
      return true;
    }
    return window.localStorage.getItem(SW_DISABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function PwaManager() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsInstalled(
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator.standalone === true,
    );

    const canUseSW = "serviceWorker" in navigator;
    // Solo registramos el SW en producción (evita interferir con el HMR de dev).
    const shouldRegister =
      canUseSW &&
      process.env.NODE_ENV === "production" &&
      !swDisabled();

    if (canUseSW && !shouldRegister) {
      // Escape / dev: aseguramos que no queda ningún SW previo controlando.
      unregisterAll().catch(() => {});
    }

    if (shouldRegister) {
      let refreshing = false;
      // Al activarse un SW nuevo (actualización), recargamos UNA vez para servir
      // los assets frescos. Guardado con flag para no entrar en bucle de recargas.
      const onControllerChange = () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange,
      );

      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          // Flujo de actualización: cuando hay un worker nuevo instalado y ya
          // había uno controlando, le pedimos que active y (vía controllerchange)
          // recargamos para tomar el código nuevo.
          registration.addEventListener("updatefound", () => {
            const nw = registration.installing;
            if (!nw) return;
            nw.addEventListener("statechange", () => {
              if (
                nw.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                nw.postMessage?.("SKIP_WAITING");
              }
            });
          });
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

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setInstallPrompt(null);
  }

  const showInstall = installPrompt && !isInstalled;
  if (!showInstall) return null;

  return (
    <LiquidButton
      onClick={installApp}
      activeColor="blue"
      groupId="pwa-install-action"
      title="Instalar app"
      className="!fixed !bottom-20 !right-4 !z-50 lg:!bottom-4 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15"
    >
      <Download className="h-5 w-5" />
    </LiquidButton>
  );
}
