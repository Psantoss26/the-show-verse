// src/lib/push.js
// Notificaciones del dispositivo: Web Push (navegador, PWA, escritorio) y
// Firebase Cloud Messaging (app de Android, que es un WebView y no recibe Web
// Push).
//
// Qué se avisa lo decide la sección de alertas (notifications.js +
// pushMessages.js): tras cada cambio que puede generar una alerta —un visto
// manual, un progreso sincronizado— se recalculan las alertas del usuario y se
// envían las recientes que aún no se hayan enviado. Así el push y la campana
// del navbar cuentan siempre lo mismo.
//
// Todo es best-effort: sin claves configuradas, sin suscripciones o con un
// fallo de red, simplemente no se envía nada. Nunca rompe la petición que lo
// dispara (se ejecuta después de responder).
//
// Variables de entorno:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  → Web Push (npx web-push generate-vapid-keys)
//   VAPID_SUBJECT                        → mailto: o URL de contacto (opcional)
//   FCM_SERVICE_ACCOUNT_JSON             → cuenta de servicio de Firebase (JSON o base64)

import webpush from 'web-push';
import { SignJWT, importPKCS8 } from 'jose';
import { and, eq, inArray, lt } from 'drizzle-orm';

import { db } from '../db/client.js';
import { pushDeliveries, pushSubscriptions } from '../db/schema.js';
import { getUserNotifications } from './notifications.js';
import { buildPushMessages } from './pushMessages.js';

// Espera tras un cambio antes de calcular: marcar una temporada o un lote de
// sincronización llega en varias peticiones seguidas y debe dar UN aviso.
const DISPATCH_DELAY_MS = 4_000;
const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SEND_TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────

let vapidReady = null;
function webPushConfigured() {
  if (vapidReady != null) return vapidReady;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  vapidReady = false;
  if (!publicKey || !privateKey) return vapidReady;
  try {
    const subject = process.env.VAPID_SUBJECT
      || (process.env.FRONTEND_URL ? String(process.env.FRONTEND_URL).split(',')[0].trim() : '')
      || 'mailto:admin@theshowverse.com';
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidReady = true;
  } catch (err) {
    console.error('[push] Claves VAPID inválidas:', err.message);
  }
  return vapidReady;
}

export function getVapidPublicKey() {
  return webPushConfigured() ? process.env.VAPID_PUBLIC_KEY : null;
}

let serviceAccount;
function fcmServiceAccount() {
  if (serviceAccount !== undefined) return serviceAccount;
  serviceAccount = null;
  const raw = String(process.env.FCM_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return serviceAccount;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed.project_id && parsed.client_email && parsed.private_key) serviceAccount = parsed;
    else console.error('[push] FCM_SERVICE_ACCOUNT_JSON incompleto (project_id, client_email, private_key)');
  } catch (err) {
    console.error('[push] FCM_SERVICE_ACCOUNT_JSON no es JSON válido:', err.message);
  }
  return serviceAccount;
}

export function pushStatus() {
  return { web: Boolean(getVapidPublicKey()), fcm: Boolean(fcmServiceAccount()) };
}

// ─────────────────────────────────────────────
// Envío
// ─────────────────────────────────────────────

// Token OAuth de la cuenta de servicio, reutilizado hasta poco antes de caducar.
let fcmToken = null;
async function fcmAccessToken() {
  const account = fcmServiceAccount();
  if (!account) return null;
  if (fcmToken && fcmToken.expiresAt - 60_000 > Date.now()) return fcmToken.value;

  const key = await importPKCS8(account.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(account.private_key_id && { kid: account.private_key_id }) })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`OAuth FCM ${res.status}: ${json.error || 'sin token'}`);
  fcmToken = { value: json.access_token, expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000 };
  return fcmToken.value;
}

/** @returns {'ok'|'gone'|'error'} `gone`: el destino ya no existe y se borra. */
async function sendWeb(subscription, message) {
  if (!webPushConfigured()) return 'error';
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(message),
      { TTL: 60 * 60, urgency: 'normal', topic: topicFor(message.tag), timeout: SEND_TIMEOUT_MS },
    );
    return 'ok';
  } catch (err) {
    if (err?.statusCode === 404 || err?.statusCode === 410) return 'gone';
    console.error('[push] Web Push falló:', err?.statusCode || err?.message);
    return 'error';
  }
}

// El topic de Web Push sustituye un aviso aún no entregado del mismo título.
// Solo admite [A-Za-z0-9-_] y 32 caracteres.
function topicFor(tag) {
  return String(tag || '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32) || undefined;
}

async function sendFcm(subscription, message) {
  const account = fcmServiceAccount();
  if (!account) return 'error';
  try {
    const token = await fcmAccessToken();
    // Mensaje SOLO de datos: así lo recibe siempre la app, que decide si lo
    // enseña dentro (app abierta) o como notificación del sistema.
    const data = {
      type: message.type || '',
      title: message.title,
      body: message.body,
      url: message.url,
      tag: message.tag,
      alertIds: message.alertIds.join(','),
      ...(message.image && { image: message.image }),
    };
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: { token: subscription.endpoint, data, android: { priority: 'high', ttl: '3600s' } },
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.ok) return 'ok';
    const json = await res.json().catch(() => ({}));
    const code = json?.error?.details?.find((d) => d?.errorCode)?.errorCode || json?.error?.status;
    if (res.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') return 'gone';
    console.error('[push] FCM falló:', res.status, code);
    return 'error';
  } catch (err) {
    console.error('[push] FCM falló:', err.message);
    return 'error';
  }
}

/** Envía un mensaje a todos los dispositivos de la lista y poda los muertos. */
export async function sendToSubscriptions(subscriptions, message) {
  const results = await Promise.all(
    subscriptions.map(async (sub) => ({
      sub,
      result: sub.kind === 'fcm' ? await sendFcm(sub, message) : await sendWeb(sub, message),
    })),
  );
  const gone = results.filter((r) => r.result === 'gone').map((r) => r.sub.id);
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone)).catch(() => {});
  return results.filter((r) => r.result === 'ok').length;
}

// ─────────────────────────────────────────────
// Despacho
// ─────────────────────────────────────────────

async function userSubscriptions(userId) {
  const status = pushStatus();
  if (!status.web && !status.fcm) return [];
  const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  return rows.filter((row) => (row.kind === 'fcm' ? status.fcm : status.web));
}

/** Calcula las alertas del usuario y envía las recientes que falten. */
export async function dispatchPushForUser(userId) {
  const subscriptions = await userSubscriptions(userId);
  if (!subscriptions.length) return 0;

  const notifications = await getUserNotifications(db, userId);
  const now = Date.now();
  const candidateIds = buildPushMessages(notifications, { now }).flatMap((m) => m.alertIds);
  if (!candidateIds.length) return 0;

  const deliveredRows = await db
    .select({ alertId: pushDeliveries.alertId })
    .from(pushDeliveries)
    .where(and(eq(pushDeliveries.userId, userId), inArray(pushDeliveries.alertId, candidateIds)));
  const delivered = new Set(deliveredRows.map((row) => row.alertId));

  let sent = 0;
  for (const message of buildPushMessages(notifications, { now, delivered })) {
    // Se reserva ANTES de enviar: si dos despachos coinciden (dos instancias),
    // solo el que inserta primero envía.
    const claimed = await db
      .insert(pushDeliveries)
      .values(message.alertIds.map((alertId) => ({ userId, alertId })))
      .onConflictDoNothing()
      .returning({ alertId: pushDeliveries.alertId });
    if (!claimed.length) continue;
    const delivered = await sendToSubscriptions(subscriptions, message);
    sent += delivered;
    // Sin ningún envío correcto (red caída, servicio de push con error), se
    // libera la reserva: el siguiente cambio lo vuelve a intentar mientras
    // la alerta siga siendo reciente.
    if (!delivered) {
      await db
        .delete(pushDeliveries)
        .where(and(
          eq(pushDeliveries.userId, userId),
          inArray(pushDeliveries.alertId, claimed.map((row) => row.alertId)),
        ))
        .catch(() => {});
    }
  }

  await db
    .delete(pushDeliveries)
    .where(and(eq(pushDeliveries.userId, userId), lt(pushDeliveries.sentAt, new Date(now - DELIVERY_RETENTION_MS))))
    .catch(() => {});
  return sent;
}

const pending = new Map();

/**
 * Programa un despacho para el usuario tras un cambio. Varias llamadas
 * seguidas se agrupan en una. No espera ni lanza nunca.
 */
export function schedulePushDispatch(userId, log = console) {
  if (!userId || process.env.NODE_ENV === 'test') return;
  const status = pushStatus();
  if (!status.web && !status.fcm) return;

  clearTimeout(pending.get(userId));
  const timer = setTimeout(() => {
    pending.delete(userId);
    dispatchPushForUser(userId).catch((err) => log.error?.({ err, userId }, '[push] despacho fallido'));
  }, DISPATCH_DELAY_MS);
  timer.unref?.();
  pending.set(userId, timer);
}
