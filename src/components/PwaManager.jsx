"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import LiquidButton from "@/components/LiquidButton";
import { useAndroidApp } from "@/lib/android/appBridge";
import { sweepLocalStorageOnStartup } from "@/lib/storage/localStorageBudget";

// Kill-switch de escape: si el SW diera problemas, poner en localStorage
//   showverse:sw:disabled = "1"   (o abrir la app con ?nosw en la URL)
// y recargar: se desregistra y se limpian cachés, volviendo al comportamiento
// puramente online.
const SW_DISABLED_KEY = "showverse:sw:disabled";

// EL SELLO DE BUILD VA EN LA URL DEL SCRIPT, y no es cosmético:
//   1. El navegador solo busca un SW nuevo si el script CAMBIA. Con la URL fija
//      `/sw.js`, un despliegue que no tocara ese fichero no disparaba
//      install/activate, así que las cachés del build anterior seguían vivas.
//   2. El propio SW lee este `v` para nombrar sus cachés, de forma que `activate`
//      se lleve las del build anterior en vez de acumularlas.
// Ver el porqué completo en public/sw.js. Lo inyecta next.config.ts.
const SW_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_SW_BUILD || "dev"}`;

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
  // Dentro de la app de Android ya ESTÁS en la app: ofrecer "instalar la PWA"
  // ahí sería instalar una segunda copia de lo mismo.
  const inAndroidApp = useAndroidApp();

  // Un dispositivo que ya venía con localStorage lleno (el techo son ~5 MB y las
  // cachés por título de las fichas crecen sin freno) arranca haciendo sitio.
  // Sin esto, las páginas de usuario no podrían reescribir su caché y seguirían
  // pintándose vacías al volver de una ficha. Ver lib/storage/localStorageBudget.
  useEffect(() => {
    sweepLocalStorageOnStartup();
  }, []);

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
        .register(SW_URL, { scope: "/" })
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

  const showInstall = installPrompt && !isInstalled && !inAndroidApp;
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
