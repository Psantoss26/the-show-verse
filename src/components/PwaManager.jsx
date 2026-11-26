"use client";

import { useEffect } from "react";
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
  // Un dispositivo que ya venía con localStorage lleno (el techo son ~5 MB y las
  // cachés por título de las fichas crecen sin freno) arranca haciendo sitio.
  // Sin esto, las páginas de usuario no podrían reescribir su caché y seguirían
  // pintándose vacías al volver de una ficha. Ver lib/storage/localStorageBudget.
  useEffect(() => {
    sweepLocalStorageOnStartup();
  }, []);

  // PWA instalada en móvil: la pulsación larga no abre menú. Chrome Android
  // ignora `-webkit-touch-callout` (ver globals.css) y en enlaces e imágenes
  // abre su menú de «abrir en pestaña / descargar imagen»; ese menú sale del
  // evento `contextmenu`. En campos editables se respeta (pegar, seleccionar).
  useEffect(() => {
    // `fullscreen`: la PWA de Android va inmersiva (ver site.webmanifest).
    const query = window.matchMedia?.(
      "(display-mode: standalone) and (hover: none) and (pointer: coarse), (display-mode: fullscreen) and (hover: none) and (pointer: coarse)",
    );
    if (!query) return;
    const onContextMenu = (event) => {
      if (!query.matches) return;
      const editable = event.target?.closest?.(
        'input, textarea, [contenteditable]:not([contenteditable="false"])',
      );
      if (editable) return;
      event.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

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
      navigator.serviceWorker
        .register(SW_URL, { scope: "/" })
        .then((registration) => {
          // Flujo de actualización: cuando hay un worker nuevo instalado y ya
          // había uno controlando, le pedimos que active. `clients.claim()` hará
          // que controle las peticiones posteriores sin recargar el documento
          // que el usuario ya está viendo.
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

    // SIN BOTÓN DE INSTALAR: la web no ofrece instalarse. Se anula el aviso
    // propio del navegador (la mini barra de «Añadir a pantalla de inicio» de
    // Chrome en Android); quien quiera la PWA la instala desde el menú del
    // navegador.
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  return null;
}
