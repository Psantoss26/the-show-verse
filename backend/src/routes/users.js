// src/routes/users.js
// User-owned profile settings and preferences.

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { userPreferences } from '../db/schema.js';

const ARTWORK_KINDS = ['poster', 'mobilePoster', 'backdrop', 'background', 'logo'];
const artworkChangeSchema = z.object({
  type: z.enum(['movie', 'tv']),
  id: z.coerce.number().int().positive(),
  kind: z.enum(ARTWORK_KINDS),
  // Solo se guardan file_path relativos de TMDb; nunca URLs o data URI arbitrarias.
  filePath: z.string().max(512).regex(/^\/[A-Za-z0-9._/-]+$/).nullable(),
});

const preferencesSchema = z.object({
  defaultView: z.enum(['grid', 'list', 'compact']).optional(),
  language: z.string().min(2).max(16).optional(),
  adultContent: z.boolean().optional(),
  notificationSettings: z.record(z.any()).optional(),
  uiSettings: z.record(z.any()).optional(),
  artworkChanges: z.array(artworkChangeSchema).min(1).max(ARTWORK_KINDS.length).optional(),
});

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function withoutArtworkOverrides(uiSettings) {
  const otherSettings = { ...asRecord(uiSettings) };
  delete otherSettings.artworkOverrides;
  return otherSettings;
}

export function artworkKey(type, id) {
  return `${type}:${Number(id)}`;
}

// Mantiene el artwork dentro de uiSettings, pero lo aísla por usuario porque la
// fila user_preferences pertenece exclusivamente al usuario autenticado.
export function applyArtworkChanges(uiSettings, changes) {
  const current = asRecord(uiSettings);
  const overrides = { ...asRecord(current.artworkOverrides) };

  for (const change of changes) {
    const key = artworkKey(change.type, change.id);
    const entry = { ...asRecord(overrides[key]) };

    if (change.filePath) entry[change.kind] = change.filePath;
    else delete entry[change.kind];

    if (Object.keys(entry).length > 0) overrides[key] = entry;
    else delete overrides[key];
  }

  return { ...current, artworkOverrides: overrides };
}

export function getArtworkOverrides(uiSettings, { type, ids, kind }) {
  const overrides = asRecord(asRecord(uiSettings).artworkOverrides);
  const result = {};

  for (const id of ids) {
    const entry = asRecord(overrides[artworkKey(type, id)]);
    result[String(id)] = kind ? entry[kind] || null : entry;
  }

  return result;
}

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

async function updateArtworkPreferences(userId, changes) {
  // El bloqueo de fila evita perder una selección cuando dos dispositivos
  // cambian artwork distinto a la vez. Es especialmente importante para el
  // restablecimiento, que borra varios tipos de imagen en una única operación.
  return db.transaction(async (tx) => {
    await tx.insert(userPreferences).values({ userId }).onConflictDoNothing();

    const [current] = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .for('update')
      .limit(1);

    const [preferences] = await tx
      .update(userPreferences)
      .set({
        uiSettings: applyArtworkChanges(current?.uiSettings, changes),
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, userId))
      .returning();

    return preferences;
  });
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

    const next = parsed.data;

    if (next.artworkChanges?.length) {
      const preferences = await updateArtworkPreferences(
        req.user.id,
        next.artworkChanges,
      );
      return reply.send({ preferences: normalizePreferences(preferences) });
    }

    const current = await ensurePreferences(req.user.id);
    const values = {
      userId: req.user.id,
      defaultView: next.defaultView ?? current.defaultView ?? 'grid',
      language: next.language ?? current.language ?? 'es-ES',
      adultContent: next.adultContent ?? Boolean(current.adultContent),
      notificationSettings: next.notificationSettings ?? current.notificationSettings ?? {},
      uiSettings: {
        ...(current.uiSettings || {}),
        // El artwork solo se modifica con artworkChanges, que bloquea la fila
        // durante la escritura. Así, una pestaña con preferencias antiguas no
        // puede resucitar una portada que se restableció en otro dispositivo.
        ...withoutArtworkOverrides(next.uiSettings),
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
