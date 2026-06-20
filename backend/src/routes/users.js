// src/routes/users.js
// User-owned profile settings and preferences.

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { userPreferences } from '../db/schema.js';

const preferencesSchema = z.object({
  defaultView: z.enum(['grid', 'list', 'compact']).optional(),
  language: z.string().min(2).max(16).optional(),
  adultContent: z.boolean().optional(),
  notificationSettings: z.record(z.any()).optional(),
  uiSettings: z.record(z.any()).optional(),
});

function normalizePreferences(row) {
  return {
    defaultView: row?.defaultView || 'grid',
    language: row?.language || 'es-ES',
    adultContent: Boolean(row?.adultContent),
    notificationSettings: row?.notificationSettings || {},
    uiSettings: row?.uiSettings || {},
    updatedAt: row?.updatedAt || null,
  };
}

async function ensurePreferences(userId) {
  const [existing] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(userPreferences)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  return created || {
    userId,
    defaultView: 'grid',
    language: 'es-ES',
    adultContent: false,
    notificationSettings: {},
    uiSettings: {},
    updatedAt: new Date(),
  };
}

export default async function usersRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.get('/preferences', async (req, reply) => {
    const preferences = await ensurePreferences(req.user.id);
    return reply.send({ preferences: normalizePreferences(preferences) });
  });

  fastify.patch('/preferences', async (req, reply) => {
    const parsed = preferencesSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const current = await ensurePreferences(req.user.id);
    const next = parsed.data;
    const values = {
      userId: req.user.id,
      defaultView: next.defaultView ?? current.defaultView ?? 'grid',
      language: next.language ?? current.language ?? 'es-ES',
      adultContent: next.adultContent ?? Boolean(current.adultContent),
      notificationSettings: next.notificationSettings ?? current.notificationSettings ?? {},
      uiSettings: {
        ...(current.uiSettings || {}),
        ...(next.uiSettings || {}),
      },
      updatedAt: new Date(),
    };

    const [preferences] = await db
      .insert(userPreferences)
      .values(values)
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: values,
      })
      .returning();

    return reply.send({ preferences: normalizePreferences(preferences) });
  });
}
