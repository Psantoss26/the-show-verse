"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import LiquidButton from "@/components/LiquidButton";

async function clearShowVerseCaches() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const keys = await window.caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith("showverse-"))
      .map((key) => window.caches.delete(key)),
  );
}

async function removeLegacyServiceWorkers() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  await clearShowVerseCaches();
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

    removeLegacyServiceWorkers().catch((error) => {
      console.warn("[PWA] No se pudo limpiar el service worker anterior", error);
    });

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
