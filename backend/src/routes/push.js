// src/routes/push.js
// Dispositivos que reciben notificaciones (ver lib/push.js).
//
//   GET    /push/config         → clave pública VAPID y qué canales hay activos
//   POST   /push/subscriptions  → registra este navegador (Web Push) o la app (FCM)
//   DELETE /push/subscriptions  → deja de avisar a este dispositivo
//   POST   /push/test           → notificación de prueba a todos los dispositivos

import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { pushSubscriptions } from '../db/schema.js';
import { getVapidPublicKey, pushStatus, sendToSubscriptions } from '../lib/push.js';

const subscriptionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('web'),
    endpoint: z.string().url().max(2048),
    keys: z.object({
      p256dh: z.string().min(1).max(512),
      auth: z.string().min(1).max(512),
    }),
  }),
  z.object({
    kind: z.literal('fcm'),
    token: z.string().min(20).max(4096),
  }),
]);

const removeSchema = z.object({ endpoint: z.string().min(1).max(4096) });

export default async function pushRoutes(fastify) {
  fastify.get('/config', async () => ({
    webPushPublicKey: getVapidPublicKey(),
    ...pushStatus(),
  }));

  fastify.post('/subscriptions', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }
    const data = parsed.data;
    const values = {
      userId: req.user.id,
      kind: data.kind,
      endpoint: data.kind === 'web' ? data.endpoint : data.token,
      p256dh: data.kind === 'web' ? data.keys.p256dh : null,
      auth: data.kind === 'web' ? data.keys.auth : null,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
    };
    // El mismo dispositivo puede cambiar de cuenta: el destino pasa a la nueva.
    await db
      .insert(pushSubscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: values.userId,
          kind: values.kind,
          p256dh: values.p256dh,
          auth: values.auth,
          userAgent: values.userAgent,
          lastSeenAt: sql`now()`,
        },
      });
    return reply.status(201).send({ ok: true });
  });

  fastify.delete('/subscriptions', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const parsed = removeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, req.user.id), eq(pushSubscriptions.endpoint, parsed.data.endpoint)));
    return reply.send({ ok: true });
  });

  fastify.post('/test', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, req.user.id));
    if (!subscriptions.length) return reply.status(404).send({ error: 'No hay dispositivos registrados' });
    const sent = await sendToSubscriptions(subscriptions, {
      alertIds: [],
      title: 'The Show Verse',
      body: 'Las notificaciones funcionan en este dispositivo.',
      url: '/',
      image: null,
      tag: 'tsv:test',
      type: 'test',
    });
    return reply.send({ ok: sent > 0, sent, devices: subscriptions.length });
  });
}
