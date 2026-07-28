// src/routes/users.js
// User-owned profile settings and preferences + capa social (Phase 1):
// búsqueda de usuarios, seguir/dejar de seguir, perfil público y favoritos
// curados del perfil.

import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  userPreferences,
  users,
  follows,
  profileFavorites,
} from '../db/schema.js';
import {
  buildUserProfile,
  searchUsers,
  findUserByUsername,
  isFollowing,
  canFollow,
  normalizeProfileFavorites,
  PROFILE_FAVORITES_MAX,
  PROFILE_FAVORITES_TOTAL_MAX,
  getUserReviews,
  getUserWatched,
  getUserWatchlist,
  getUserFavorites,
  getUserRatings,
  getUserLists,
  getUserActivity,
  applyResolvedEnglishPosterPaths,
  resolveEnglishPosterPaths,
} from '../lib/userProfile.js';

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

function serializeProfileFavorite(favorite) {
  return {
    tmdbId: favorite.tmdbId,
    mediaType: favorite.mediaType,
    title: favorite.title,
    posterPath: favorite.posterPath,
  };
}

function profileFavoritesByType(items) {
  const movies = normalizeProfileFavorites(
    items.filter((item) => item.mediaType === 'movie'),
    PROFILE_FAVORITES_MAX,
    'movie',
  );
  const series = normalizeProfileFavorites(
    items.filter((item) => item.mediaType === 'tv'),
    PROFILE_FAVORITES_MAX,
    'tv',
  );
  return { movies, series };
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

  // ══════════════════════════════════════════════
  // SOCIAL (Phase 1): búsqueda, follow, perfil público, favoritos del perfil
  // ══════════════════════════════════════════════

  // GET /users/search?q= — descubrimiento de miembros.
  fastify.get('/search', async (req, reply) => {
    const q = String(req.query?.q || '').trim();
    if (q.length < 1) return reply.send({ results: [] });
    const results = await searchUsers(db, {
      query: q,
      viewerId: req.user.id,
      limit: req.query?.limit,
    });
    return reply.send({ results });
  });

  // GET /users/me/profile-favorites — 5 películas y 5 series destacadas.
  fastify.get('/me/profile-favorites', async (req, reply) => {
    const rows = await db
      .select()
      .from(profileFavorites)
      .where(eq(profileFavorites.userId, req.user.id))
      .orderBy(profileFavorites.position)
      .limit(PROFILE_FAVORITES_TOTAL_MAX);
    const englishPosters = await resolveEnglishPosterPaths(db, rows);
    const resolvedRows = applyResolvedEnglishPosterPaths(
      rows,
      englishPosters,
      { strict: true },
    );
    const { movies, series } = profileFavoritesByType(resolvedRows);
    return reply.send({
      movies: movies.map(serializeProfileFavorite),
      series: series.map(serializeProfileFavorite),
      // Compatibilidad con la versión anterior de la configuración.
      favorites: [...movies, ...series]
        .slice(0, PROFILE_FAVORITES_MAX)
        .map(serializeProfileFavorite),
    });
  });

  // PUT /users/me/profile-favorites — reemplaza ambas filas (≤5 por tipo).
  const profileFavoriteSchema = z.object({
    tmdbId: z.coerce.number().int().positive(),
    mediaType: z.enum(['movie', 'tv']),
    title: z.string().max(512).nullish(),
    posterPath: z.string().max(512).nullish(),
  });
  const favoritesBodySchema = z.object({
    movies: z.array(profileFavoriteSchema).max(PROFILE_FAVORITES_MAX).optional(),
    series: z.array(profileFavoriteSchema).max(PROFILE_FAVORITES_MAX).optional(),
    // Aceptamos temporalmente el payload previo para no romper una pestaña
    // abierta con la versión antigua de la interfaz.
    items: z.array(profileFavoriteSchema).max(PROFILE_FAVORITES_MAX).optional(),
  }).refine(
    (value) => Array.isArray(value.movies) || Array.isArray(value.series) || Array.isArray(value.items),
    { message: 'Indica las películas o series favoritas' },
  );

  fastify.put('/me/profile-favorites', async (req, reply) => {
    const parsed = favoritesBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }
    const groupedPayload = Array.isArray(parsed.data.movies) || Array.isArray(parsed.data.series);
    const legacyItems = groupedPayload ? [] : parsed.data.items || [];
    const movies = normalizeProfileFavorites(
      groupedPayload ? parsed.data.movies || [] : legacyItems.filter((item) => item.mediaType === 'movie'),
      PROFILE_FAVORITES_MAX,
      'movie',
    );
    const series = normalizeProfileFavorites(
      groupedPayload ? parsed.data.series || [] : legacyItems.filter((item) => item.mediaType === 'tv'),
      PROFILE_FAVORITES_MAX,
      'tv',
    );
    const englishPosters = await resolveEnglishPosterPaths(db, [...movies, ...series]);
    const clean = applyResolvedEnglishPosterPaths(
      [...movies, ...series],
      englishPosters,
      { strict: true },
    );
    const resolvedMovies = clean.filter((item) => item.mediaType === 'movie');
    const resolvedSeries = clean.filter((item) => item.mediaType === 'tv');

    await db.transaction(async (tx) => {
      await tx.delete(profileFavorites).where(eq(profileFavorites.userId, req.user.id));
      if (clean.length) {
        await tx.insert(profileFavorites).values(
          clean.map((f) => ({ ...f, userId: req.user.id })),
        );
      }
    });

    return reply.send({
      movies: resolvedMovies.map(serializeProfileFavorite),
      series: resolvedSeries.map(serializeProfileFavorite),
      favorites: clean.slice(0, PROFILE_FAVORITES_MAX).map(serializeProfileFavorite),
    });
  });

  // GET /users/:username/profile — perfil público agregado.
  fastify.get('/:username/profile', async (req, reply) => {
    const target = await findUserByUsername(db, req.params.username);
    if (!target) return reply.status(404).send({ error: 'User not found' });
    const profile = await buildUserProfile(db, target, req.user.id);
    return reply.send({ profile });
  });

  // POST /users/:username/follow — seguir (idempotente).
  fastify.post('/:username/follow', async (req, reply) => {
    const target = await findUserByUsername(db, req.params.username);
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (!canFollow(req.user.id, target.id)) {
      return reply.status(400).send({ error: 'No puedes seguirte a ti mismo' });
    }
    await db
      .insert(follows)
      .values({ followerId: req.user.id, followingId: target.id })
      .onConflictDoNothing();
    return reply.send({ following: true });
  });

  // DELETE /users/:username/follow — dejar de seguir (idempotente).
  fastify.delete('/:username/follow', async (req, reply) => {
    const target = await findUserByUsername(db, req.params.username);
    if (!target) return reply.status(404).send({ error: 'User not found' });
    await db
      .delete(follows)
      .where(and(eq(follows.followerId, req.user.id), eq(follows.followingId, target.id)));
    return reply.send({ following: false });
  });

  // GET /users/:username/followers — quién sigue a este usuario.
  // GET /users/:username/following — a quién sigue este usuario.
  const listFollowRelation = async (req, reply, relation) => {
    const target = await findUserByUsername(db, req.params.username);
    if (!target) return reply.status(404).send({ error: 'User not found' });

    const limit = Math.min(50, Math.max(1, Number(req.query?.limit) || 30));
    const offset = Math.max(0, Number(req.query?.offset) || 0);

    // followers: usuarios cuyo followingId = target (join por followerId).
    // following: usuarios que target sigue (join por followingId).
    const joinCol = relation === 'followers' ? follows.followerId : follows.followingId;
    const filterCol = relation === 'followers' ? follows.followingId : follows.followerId;

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        createdAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(users.id, joinCol))
      .where(and(eq(filterCol, target.id), eq(users.isActive, true)))
      .orderBy(desc(follows.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    // Estado de seguimiento del visor respecto a cada usuario listado.
    const viewerId = req.user.id;
    const followingSet = new Set();
    if (page.length) {
      const ids = page.map((r) => r.id);
      const viewerFollows = await db
        .select({ followingId: follows.followingId })
        .from(follows)
        .where(and(eq(follows.followerId, viewerId), inArray(follows.followingId, ids)));
      for (const r of viewerFollows) followingSet.add(r.followingId);
    }

    return reply.send({
      users: page.map((r) => ({
        username: r.username,
        displayName: r.displayName || r.username,
        avatarUrl: r.avatarUrl || null,
        isFollowing: followingSet.has(r.id),
        isSelf: r.id === viewerId,
      })),
      hasMore,
      offset: offset + page.length,
    });
  };

  fastify.get('/:username/followers', (req, reply) =>
    listFollowRelation(req, reply, 'followers'),
  );
  fastify.get('/:username/following', (req, reply) =>
    listFollowRelation(req, reply, 'following'),
  );

  // ── Secciones del perfil (Phase 2): lectores paginados por username ──
  const sectionEndpoint = (fetcher) => async (req, reply) => {
    const target = await findUserByUsername(db, req.params.username);
    if (!target) return reply.status(404).send({ error: 'User not found' });
    const page = await fetcher(db, target.id, {
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    return reply.send(page);
  };

  fastify.get('/:username/reviews', sectionEndpoint(getUserReviews));
  fastify.get('/:username/watched', sectionEndpoint(getUserWatched));
  fastify.get('/:username/watchlist', sectionEndpoint(getUserWatchlist));
  fastify.get('/:username/favorites', sectionEndpoint(getUserFavorites));
  fastify.get('/:username/ratings', sectionEndpoint(getUserRatings));
  fastify.get('/:username/lists', async (req, reply) => {
    const target = await findUserByUsername(db, req.params.username);
    if (!target) return reply.status(404).send({ error: 'User not found' });
    const page = await getUserLists(db, target.id, {
      limit: req.query?.limit,
      offset: req.query?.offset,
      includePrivateLists: target.id === req.user.id,
    });
    return reply.send(page);
  });
  fastify.get('/:username/activity', sectionEndpoint(getUserActivity));
}
