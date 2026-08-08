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

// ---------------------------------------------------------------------------
// Inicio de sesión con Google, nativo.
//
// El botón normal navega a accounts.google.com, y Google RECHAZA su formulario
// dentro de un WebView (`disallowed_useragent`), así que la app no tiene más
// remedio que abrir el navegador: se ve el salto a Chrome y la sesión se crea
// en las cookies del navegador, no en las de la app. Con el puente, el sistema
// devuelve el idToken sin salir de la app y aquí se canjea por la sesión.
//
// El nativo no puede devolver el token en el propio `return` (el selector de
// cuentas tarda lo que tarde el usuario), así que responde llamando a
// `window.__tsvGoogleSignInResult(peticion, json)`. Esto lo envuelve en promesa.
const peticionesGoogle = new Map();

function instalarReceptor() {
  if (typeof window === "undefined" || window.__tsvGoogleSignInResult) return;
  window.__tsvGoogleSignInResult = (peticion, payload) => {
    const resolver = peticionesGoogle.get(peticion);
    if (!resolver) return;
    peticionesGoogle.delete(peticion);
    try {
      resolver(JSON.parse(payload));
    } catch {
      resolver({ ok: false, error: "bad_payload" });
    }
  };
}

/** ¿Puede la app hacer el login sin navegador? */
export function canNativeGoogleSignIn() {
  return call("canSignInWithGoogle", false) === true;
}

/**
 * Pide el idToken al sistema. Resuelve con
 * `{ ok, idToken?, cancelled?, error? }`; nunca rechaza.
 */
export function requestNativeGoogleIdToken() {
  if (!canNativeGoogleSignIn()) {
    return Promise.resolve({ ok: false, error: "unavailable" });
  }
  instalarReceptor();
  const peticion = `g${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    peticionesGoogle.set(peticion, resolve);
    const lanzada = call("signInWithGoogle", false, peticion);
    if (lanzada !== true) {
      peticionesGoogle.delete(peticion);
      resolve({ ok: false, error: "unavailable" });
    }
    // Red de seguridad: si el nativo no contestara nunca, la promesa no se
    // queda colgada y la web puede ofrecer el flujo por navegador.
    setTimeout(() => {
      if (peticionesGoogle.delete(peticion)) resolve({ ok: false, error: "timeout" });
    }, 120000);
  });
}

/**
 * Login completo dentro de la app: token del sistema → canje en el servidor
 * (mismo endpoint del backend que usa el flujo web) → cookies en el WebView.
 */
export async function signInWithGoogleNative() {
  const nativo = await requestNativeGoogleIdToken();
  if (!nativo?.ok || !nativo?.idToken) return nativo || { ok: false };

  try {
    const res = await fetch("/api/auth/google/native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken: nativo.idToken }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = json?.error || "exchange_failed";
      logToApp(`Google: ✗ el servidor rechazó el token (${res.status} ${error})`);
      return { ok: false, error };
    }
    logToApp("Google: ✓ sesión iniciada en la app");
    return { ok: true };
  } catch {
    logToApp("Google: ✗ sin red al canjear el token");
    return { ok: false, error: "network" };
  }
}

/** Deja una línea en el registro nativo (visible en el panel de sincronización). */
export function logToApp(mensaje) {
  call("log", undefined, String(mensaje || "").slice(0, 200));
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
