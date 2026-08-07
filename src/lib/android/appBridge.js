"use client";

// Puente con la app oficial de Android.
//
// Cuando la web se sirve dentro de la app (android-companion/), la carcasa
// inyecta `window.TSVAndroidBridge` con métodos nativos SÍNCRONOS. Este módulo
// es la única puerta a ese objeto: envuelve cada llamada para que la web nunca
// tenga que comprobar si existe, y para que un fallo del puente no rompa la
// página (una versión vieja de la app puede no tener todos los métodos).
//
// Fuera de la app —navegador, PWA instalada— `isAndroidApp()` es false y todo
// esto queda inerte: la web sigue funcionando exactamente igual que hoy.

import { useEffect, useState } from "react";

function bridge() {
  if (typeof window === "undefined") return null;
  const raw = window.TSVAndroidBridge;
  return raw && typeof raw.isApp === "function" ? raw : null;
}

/** ¿La página se está ejecutando dentro de la app de Android? */
export function isAndroidApp() {
  return bridge() != null;
}

/** Llama a un método del puente y nunca lanza: devuelve `fallback` si no puede. */
function call(method, fallback, ...args) {
  const api = bridge();
  if (!api || typeof api[method] !== "function") return fallback;
  try {
    return api[method](...args);
  } catch {
    return fallback;
  }
}

/**
 * Estado de la sincronización de streaming leído del nativo:
 * `{ paired, origin, notificationAccess, accessibilityGranted,
 *    accessibilityEnabled, paused, indicator, version }`
 * o null fuera de la app.
 */
export function readSyncStatus() {
  const raw = call("syncStatus", null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Empareja este dispositivo con el token que da /api/netflix/pair-mobile.
 * Dentro de la app sustituye al deep link `theshowverse://pair`: no hay que
 * salir de la aplicación ni depender de que el sistema resuelva el esquema.
 */
export function pairDevice(token, origin) {
  return call("pair", false, token, origin) === true;
}

export function unpairDevice() {
  return call("unpair", false) === true;
}

export function setSyncPaused(paused) {
  return call("setPaused", false, !!paused) === true;
}

export function setQuickAccessIndicator(enabled) {
  return call("setIndicator", false, !!enabled) === true;
}

export function setAccessibilityDetection(enabled) {
  return call("setAccessibility", false, !!enabled) === true;
}

export function openSyncPanel() {
  call("openSyncPanel", undefined);
}

export function openNotificationAccessSettings() {
  call("openNotificationAccessSettings", undefined);
}

export function openAccessibilitySettings() {
  call("openAccessibilitySettings", undefined);
}

export function openServerSettings() {
  call("openServerSettings", undefined);
}

/** Compartir con el selector del sistema (en la app) o con la Web Share API. */
export function shareFromApp(text, url) {
  if (isAndroidApp()) {
    call("share", undefined, text || "", url || "");
    return true;
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    navigator.share({ text, url }).catch(() => {});
    return true;
  }
  return false;
}

export function appVersion() {
  return call("appVersion", null);
}

/**
 * Hook seguro para hidratación: en el servidor y en el primer render devuelve
 * false, y pasa a true tras montar si el puente está. Así el HTML del servidor
 * y el del cliente coinciden (el mismo criterio que el resto de la app).
 */
export function useAndroidApp() {
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    setInApp(isAndroidApp());
  }, []);
  return inApp;
}

/**
 * Estado de sincronización con relectura al volver a la pestaña: los permisos
 * se conceden en Ajustes del sistema, fuera de la web, así que al regresar hay
 * que preguntar otra vez en vez de fiarse de lo leído al montar.
 */
export function useSyncStatus() {
  const inApp = useAndroidApp();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!inApp) return undefined;
    const refresh = () => setStatus(readSyncStatus());
    refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [inApp]);

  return { inApp, status, refresh: () => setStatus(readSyncStatus()) };
}
