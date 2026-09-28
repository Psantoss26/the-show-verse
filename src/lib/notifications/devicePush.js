"use client";

// Notificaciones del DISPOSITIVO (con la app cerrada o en segundo plano).
//
//   - Navegador / PWA / escritorio: Web Push con el service worker (public/sw.js).
//   - App de Android: es un WebView, que no recibe Web Push; el nativo usa
//     Firebase Cloud Messaging y le pasa su token a la web por el puente.
//
// Qué se avisa lo decide el backend (backend/src/lib/push.js). Aquí solo se
// pide permiso y se registra o quita este dispositivo.

import {
  androidPushPermission,
  androidPushToken,
  isAndroidApp,
  requestAndroidPushPermission,
  supportsAndroidPush,
} from "@/lib/android/appBridge";

// En Android no hay "suscripción" que consultar: si la persona las apaga desde
// la web se recuerda aquí, para no volver a registrar el token al arrancar.
const ANDROID_OFF_KEY = "showverse:push:android-off";
const SW_READY_TIMEOUT_MS = 4_000;

function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key, on) {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    /* sin almacenamiento: se vuelve a registrar al arrancar, nada grave */
  }
}

function base64UrlToBytes(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** "android" | "web" | null (este dispositivo no puede recibirlas). */
export function devicePushKind() {
  if (typeof window === "undefined") return null;
  if (isAndroidApp()) return supportsAndroidPush() ? "android" : null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return null;
  }
  return "web";
}

// El SW solo se registra en producción (PwaManager). Sin él no hay Web Push.
async function swRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)),
  ]);
}

async function saveSubscription(body) {
  const res = await fetch("/api/push/subscriptions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("No se pudo registrar este dispositivo.");
}

async function removeSubscription(endpoint) {
  await fetch("/api/push/subscriptions", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}

/**
 * Estado en este dispositivo:
 * `{ kind, permission: "granted"|"denied"|"default", enabled }`.
 */
export async function getDevicePushState() {
  const kind = devicePushKind();
  if (kind === "android") {
    const permission = androidPushPermission();
    return {
      kind,
      permission,
      enabled: permission === "granted" && Boolean(androidPushToken()) && !readFlag(ANDROID_OFF_KEY),
    };
  }
  if (kind === "web") {
    const permission = Notification.permission;
    const registration = permission === "granted" ? await swRegistration() : null;
    const subscription = await registration?.pushManager.getSubscription().catch(() => null);
    return { kind, permission, enabled: Boolean(subscription) };
  }
  return { kind: null, permission: "denied", enabled: false };
}

/** Pide permiso (debe llamarse desde un gesto del usuario) y registra el dispositivo. */
export async function enableDevicePush() {
  const kind = devicePushKind();
  if (kind === "android") {
    const permission = await requestAndroidPushPermission();
    if (permission !== "granted") throw new Error("Permiso de notificaciones denegado.");
    const token = androidPushToken();
    if (!token) throw new Error("La app aún no tiene un token de notificaciones. Vuelve a intentarlo en unos segundos.");
    await saveSubscription({ kind: "fcm", token });
    writeFlag(ANDROID_OFF_KEY, false);
    return;
  }
  if (kind !== "web") throw new Error("Este navegador no admite notificaciones.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permiso de notificaciones denegado.");

  const registration = await swRegistration();
  if (!registration) throw new Error("Las notificaciones necesitan la app instalada o la web en producción.");

  const config = await fetch("/api/push/config", { cache: "no-store" }).then((res) => res.json()).catch(() => null);
  if (!config?.webPushPublicKey) throw new Error("El servidor no tiene las notificaciones configuradas.");

  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(config.webPushPublicKey),
    }));
  const json = subscription.toJSON();
  await saveSubscription({ kind: "web", endpoint: json.endpoint, keys: json.keys });
}

export async function disableDevicePush() {
  const kind = devicePushKind();
  if (kind === "android") {
    const token = androidPushToken();
    writeFlag(ANDROID_OFF_KEY, true);
    if (token) await removeSubscription(token);
    return;
  }
  if (kind !== "web") return;
  const registration = await swRegistration();
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  if (!subscription) return;
  await removeSubscription(subscription.endpoint);
  await subscription.unsubscribe().catch(() => {});
}

/**
 * Al arrancar con sesión: si este dispositivo ya tenía las notificaciones
 * activas, se vuelve a registrar con la cuenta actual (cambio de cuenta, token
 * de FCM renovado, suscripción caducada). No pide permiso nunca.
 */
export async function syncDevicePush() {
  const kind = devicePushKind();
  if (kind === "android") {
    if (readFlag(ANDROID_OFF_KEY) || androidPushPermission() !== "granted") return;
    const token = androidPushToken();
    if (token) await saveSubscription({ kind: "fcm", token }).catch(() => {});
    return;
  }
  if (kind !== "web" || Notification.permission !== "granted") return;
  const registration = await swRegistration();
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  if (!subscription) return;
  const json = subscription.toJSON();
  await saveSubscription({ kind: "web", endpoint: json.endpoint, keys: json.keys }).catch(() => {});
}

export async function sendTestPush() {
  const res = await fetch("/api/push/test", { method: "POST", credentials: "include" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || "No se pudo enviar la prueba.");
  return json;
}
