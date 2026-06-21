// src/routes/auth.js
// Endpoints de autenticación: register, login, refresh, logout, me

import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users, refreshTokens, userPreferences, connectedAccounts, watchHistory } from '../db/schema.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
} from '../lib/jwt.js';
import { eq, and, gt } from 'drizzle-orm';

const BCRYPT_ROUNDS = 12;

// Validadores
const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  displayName: z.string().max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const tmdbSessionSchema = z.object({
  sessionId: z.string().min(8),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(20),
});

const netflixConnectSchema = z.object({
  email: z.string().email(),
  profileName: z.string().min(1).max(120).optional(),
});

const netflixSyncSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
  watchedAt: z.string().datetime().optional(),
  runtimeMins: z.number().int().positive().optional(),
  title: z.string().max(300).optional(),
  posterPath: z.string().max(300).nullable().optional(),
  netflixVideoId: z.string().max(80).optional(),
  netflixTitle: z.string().max(300).optional(),
  platform: z.string().max(40).optional(),
});

const netflixSyncBatchSchema = z.object({
  items: z
    .array(
      z.object({
        tmdbId: z.number().int().positive(),
        mediaType: z.enum(['movie', 'tv']),
        season: z.number().int().positive().optional(),
        episode: z.number().int().positive().optional(),
        watchedAt: z.string().datetime().optional(),
        title: z.string().max(300).optional(),
        posterPath: z.string().max(300).nullable().optional(),
      }),
    )
    .max(1000),
});

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

function normalizeUsername(value, fallback) {
  const base = String(value || fallback || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);

  return base && base.length >= 3 ? base : fallback;
}

async function uniqueUsername(preferred, providerUid) {
  const base = normalizeUsername(preferred, `tmdb-${providerUid}`);

  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);

    if (!existing) return candidate;
  }

  return `tmdb-${providerUid}`;
}

async function getTmdbAccount(sessionId) {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY is required for TMDb auth bootstrap');
  }

  const url = new URL(`${TMDB_BASE}/account`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('session_id', sessionId);

  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  const json = await res.json().catch(() => ({}));

  if (!res.ok || json?.success === false || !json?.id) {
    const error = new Error(json?.status_message || `TMDb account failed (${res.status})`);
    error.status = res.status;
    throw error;
  }

  return json;
}

async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is required for Google auth');
  }

  const url = new URL(GOOGLE_TOKENINFO_URL);
  url.searchParams.set('id_token', idToken);

  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.sub) {
    const error = new Error(json?.error_description || 'Invalid Google token');
    error.status = 401;
    throw error;
  }

  if (json.aud !== GOOGLE_CLIENT_ID) {
    const error = new Error('Google token audience mismatch');
    error.status = 401;
    throw error;
  }

  if (json.email_verified !== 'true' && json.email_verified !== true) {
    const error = new Error('Google email is not verified');
    error.status = 403;
    throw error;
  }

  return json;
}

/**
 * Genera el par de tokens y guarda el refresh token hasheado en BD.
 */
async function issueTokenPair(userId, { deviceName, ipAddress } = {}) {
  const accessToken = await signAccessToken({ sub: userId });
  const refreshToken = await signRefreshToken({ sub: userId });
  const tokenHash = hashToken(refreshToken);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    deviceName: deviceName || null,
    ipAddress: ipAddress || null,
    expiresAt: refreshTokenExpiresAt(),
  });

  return { accessToken, refreshToken };
}

export default async function authRoutes(fastify) {
  // ──────────────────────────────────────────────
  // POST /auth/tmdb — Crea/recupera sesión propia desde una sesión TMDb válida
  // ──────────────────────────────────────────────
  fastify.post('/tmdb', async (req, reply) => {
    const parsed = tmdbSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation error',
        issues: parsed.error.issues,
      });
    }

    let account;
    try {
      account = await getTmdbAccount(parsed.data.sessionId);
    } catch (e) {
      return reply.status(e.status || 401).send({
        error: e.message || 'Invalid TMDb session',
      });
    }

    const providerUid = String(account.id);
    const displayName = account.name || account.username || `TMDb ${providerUid}`;
    const avatarPath = account.avatar?.tmdb?.avatar_path || null;

    let user = null;
    const [existingAccount] = await db
      .select({ userId: connectedAccounts.userId })
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.provider, 'tmdb'), eq(connectedAccounts.providerUid, providerUid)))
      .limit(1);

    if (existingAccount) {
      [user] = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          plan: users.plan,
        })
        .from(users)
        .where(eq(users.id, existingAccount.userId))
        .limit(1);

      await db
        .update(connectedAccounts)
        .set({
          accessToken: parsed.data.sessionId,
          metadata: account,
        })
        .where(and(eq(connectedAccounts.provider, 'tmdb'), eq(connectedAccounts.providerUid, providerUid)));
    }

    if (!user) {
      const username = await uniqueUsername(account.username, providerUid);
      const email = `tmdb-${providerUid}@users.theshowverse.local`;

      [user] = await db
        .insert(users)
        .values({
          email,
          username,
          displayName,
          avatarUrl: avatarPath ? `https://image.tmdb.org/t/p/w185${avatarPath}` : null,
          emailVerified: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          plan: users.plan,
        });

      await db.insert(userPreferences).values({ userId: user.id }).onConflictDoNothing();
      await db.insert(connectedAccounts).values({
        userId: user.id,
        provider: 'tmdb',
        providerUid,
        accessToken: parsed.data.sessionId,
        metadata: account,
      }).onConflictDoNothing();
    }

    const { accessToken, refreshToken } = await issueTokenPair(user.id, {
      deviceName: req.headers['user-agent']?.slice(0, 100),
      ipAddress: req.ip,
    });

    return reply.send({
      user,
      accessToken,
      refreshToken,
      provider: 'tmdb',
    });
  });

  // ──────────────────────────────────────────────
  // POST /auth/tmdb/connect — Vincula TMDb al usuario autenticado actual
  // ──────────────────────────────────────────────
  fastify.post('/tmdb/connect', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const parsed = tmdbSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation error',
        issues: parsed.error.issues,
      });
    }

    let account;
    try {
      account = await getTmdbAccount(parsed.data.sessionId);
    } catch (e) {
      return reply.status(e.status || 401).send({
        error: e.message || 'Invalid TMDb session',
      });
    }

    const providerUid = String(account.id);

    const [connected] = await db
      .insert(connectedAccounts)
      .values({
        userId: req.user.id,
        provider: 'tmdb',
        providerUid,
        accessToken: parsed.data.sessionId,
        metadata: account,
      })
      .onConflictDoUpdate({
        target: [connectedAccounts.provider, connectedAccounts.providerUid],
        set: {
          userId: req.user.id,
          accessToken: parsed.data.sessionId,
          refreshToken: null,
          tokenExpiresAt: null,
          metadata: account,
        },
      })
      .returning({
        provider: connectedAccounts.provider,
        providerUid: connectedAccounts.providerUid,
        userId: connectedAccounts.userId,
      });

    return reply.send({
      connected: true,
      provider: 'tmdb',
      providerUid,
      userId: req.user.id,
      account,
      connection: connected,
    });
  });

  // ──────────────────────────────────────────────
  // POST /auth/google — Crea/recupera sesión propia desde Google OAuth
  // ──────────────────────────────────────────────
  fastify.post('/google', async (req, reply) => {
    const parsed = googleAuthSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation error',
        issues: parsed.error.issues,
      });
    }

    let googleProfile;
    try {
      googleProfile = await verifyGoogleIdToken(parsed.data.idToken);
    } catch (e) {
      return reply.status(e.status || 401).send({
        error: e.message || 'Invalid Google token',
      });
    }

    const providerUid = String(googleProfile.sub);
    const email = String(googleProfile.email || '').toLowerCase();
    const displayName = googleProfile.name || googleProfile.given_name || email.split('@')[0] || 'Usuario';
    const avatarUrl = googleProfile.picture || null;

    if (!email) {
      return reply.status(400).send({ error: 'Google account has no email' });
    }

    let user = null;
    const [existingAccount] = await db
      .select({ userId: connectedAccounts.userId })
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.provider, 'google'), eq(connectedAccounts.providerUid, providerUid)))
      .limit(1);

    if (existingAccount) {
      [user] = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          plan: users.plan,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.id, existingAccount.userId))
        .limit(1);
    }

    if (!user) {
      [user] = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          plan: users.plan,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
    }

    if (user && !user.isActive) {
      return reply.status(403).send({ error: 'Account disabled' });
    }

    if (!user) {
      const username = await uniqueUsername(email.split('@')[0], `google-${providerUid.slice(0, 10)}`);
      [user] = await db
        .insert(users)
        .values({
          email,
          username,
          passwordHash: null,
          displayName,
          avatarUrl,
          emailVerified: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          plan: users.plan,
        });

      await db.insert(userPreferences).values({ userId: user.id }).onConflictDoNothing();
    } else {
      const updates = {
        emailVerified: true,
        updatedAt: new Date(),
      };
      if (!user.displayName && displayName) updates.displayName = displayName;
      if (!user.avatarUrl && avatarUrl) updates.avatarUrl = avatarUrl;

      [user] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, user.id))
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          plan: users.plan,
        });
    }

    await db
      .insert(connectedAccounts)
      .values({
        userId: user.id,
        provider: 'google',
        providerUid,
        metadata: {
          email,
          name: googleProfile.name || null,
          picture: avatarUrl,
        },
      })
      .onConflictDoUpdate({
        target: [connectedAccounts.provider, connectedAccounts.providerUid],
        set: {
          userId: user.id,
          metadata: {
            email,
            name: googleProfile.name || null,
            picture: avatarUrl,
          },
        },
      });

    const { accessToken, refreshToken } = await issueTokenPair(user.id, {
      deviceName: req.headers['user-agent']?.slice(0, 100),
      ipAddress: req.ip,
    });

    return reply.send({
      user,
      accessToken,
      refreshToken,
      provider: 'google',
    });
  });

  // ──────────────────────────────────────────────
  // POST /auth/register
  // ──────────────────────────────────────────────
  fastify.post('/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation error',
        issues: parsed.error.issues,
      });
    }

    const { email, username, password, displayName } = parsed.data;

    // Verificar que el email/username no existen
    const existing = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const existingUsername = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username.toLowerCase()))
      .limit(1);

    if (existingUsername.length > 0) {
      return reply.status(409).send({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        passwordHash,
        displayName: displayName || username,
      })
      .returning({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        plan: users.plan,
      });

    // Crear preferencias por defecto
    await db.insert(userPreferences).values({ userId: user.id });

    const { accessToken, refreshToken } = await issueTokenPair(user.id, {
      deviceName: req.headers['user-agent']?.slice(0, 100),
      ipAddress: req.ip,
    });

    return reply.status(201).send({
      user,
      accessToken,
      refreshToken,
    });
  });

  // ──────────────────────────────────────────────
  // POST /auth/login
  // ──────────────────────────────────────────────
  fastify.post('/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid credentials format' });
    }

    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user || !user.passwordHash) {
      // Timing-safe: siempre hashear aunque no exista
      await bcrypt.hash(password, BCRYPT_ROUNDS);
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return reply.status(403).send({ error: 'Account disabled' });
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = await issueTokenPair(user.id, {
      deviceName: req.headers['user-agent']?.slice(0, 100),
      ipAddress: req.ip,
    });

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        plan: user.plan,
      },
      accessToken,
      refreshToken,
    });
  });

  // ──────────────────────────────────────────────
  // POST /auth/refresh
  // ──────────────────────────────────────────────
  fastify.post('/refresh', async (req, reply) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return reply.status(400).send({ error: 'refreshToken required' });
    }

    let payload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' });
    }

    const tokenHash = hashToken(refreshToken);

    // Verificar que el token existe en BD y no ha expirado
    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!storedToken) {
      return reply.status(401).send({ error: 'Refresh token not found or expired' });
    }

    // Rotación: eliminar el token usado y emitir uno nuevo
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));

    const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(
      payload.sub,
      {
        deviceName: storedToken.deviceName,
        ipAddress: req.ip,
      }
    );

    return reply.send({ accessToken, refreshToken: newRefreshToken });
  });

  // ──────────────────────────────────────────────
  // POST /auth/logout
  // ──────────────────────────────────────────────
  fastify.post('/logout', async (req, reply) => {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await db
        .delete(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash));
    }
    return reply.send({ ok: true });
  });

  // ──────────────────────────────────────────────
  // POST /auth/logout/all — Revocar todos los tokens del usuario
  // ──────────────────────────────────────────────
  fastify.post('/logout/all', { preHandler: fastify.requireAuth }, async (req, reply) => {
    await db
      .delete(refreshTokens)
      .where(eq(refreshTokens.userId, req.user.id));
    return reply.send({ ok: true, message: 'All sessions revoked' });
  });

  // ──────────────────────────────────────────────
  // GET /auth/me — Perfil del usuario autenticado
  // ──────────────────────────────────────────────
  fastify.get('/me', { preHandler: fastify.requireAuth }, async (req, reply) => {
    return reply.send({ user: req.user });
  });

  // ──────────────────────────────────────────────
  // PATCH /auth/me — Actualizar perfil
  // ──────────────────────────────────────────────
  fastify.patch('/me', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const updateSchema = z.object({
      displayName: z.string().max(50).optional(),
      bio: z.string().max(500).optional(),
      avatarUrl: z.string().url().optional(),
      locale: z.string().optional(),
      timezone: z.string().optional(),
    });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const updates = { ...parsed.data, updatedAt: new Date() };
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, req.user.id))
      .returning({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        plan: users.plan,
      });

    return reply.send({ user: updated });
  });

  // ──────────────────────────────────────────────
  // GET /connections — Listar conexiones vinculadas del usuario
  // ──────────────────────────────────────────────
  fastify.get('/connections', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const accounts = await db
      .select({
        provider: connectedAccounts.provider,
        providerUid: connectedAccounts.providerUid,
        metadata: connectedAccounts.metadata,
      })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, req.user.id));

    const connections = ['tmdb', 'google', 'trakt', 'netflix'].map((provider) => {
      const conn = accounts.find((a) => a.provider === provider);
      return {
        provider,
        connected: !!conn,
        email: conn?.providerUid || null,
        metadata: conn?.metadata || {},
      };
    });

    return reply.send({ connections });
  });

  // ──────────────────────────────────────────────
  // POST /netflix/connect — Conectar cuenta de Netflix detectada por la extension
  // ──────────────────────────────────────────────
  fastify.post('/netflix/connect', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const parsed = netflixConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const { email, profileName } = parsed.data;
    const syncToken = `tsv_netflix_${nanoid(48)}`;
    const now = new Date();

    await db
      .insert(connectedAccounts)
      .values({
        userId: req.user.id,
        provider: 'netflix',
        providerUid: email,
        accessToken: hashToken(syncToken),
        metadata: {
          email,
          profileName: profileName || 'Principal',
          connectedAt: now.toISOString(),
          lastSyncedAt: null,
          syncMode: 'browser-extension',
        },
      })
      .onConflictDoUpdate({
        target: [connectedAccounts.provider, connectedAccounts.providerUid],
        set: {
          userId: req.user.id,
          accessToken: hashToken(syncToken),
          metadata: {
            email,
            profileName: profileName || 'Principal',
            connectedAt: now.toISOString(),
            lastSyncedAt: null,
            syncMode: 'browser-extension',
          },
        },
      });

    return reply.send({
      connected: true,
      email,
      profileName: profileName || 'Principal',
      syncToken,
    });
  });

  // ──────────────────────────────────────────────
  // POST /netflix/sync — Recibe visionados desde la extension con token revocable
  // ──────────────────────────────────────────────
  fastify.post('/netflix/sync', async (req, reply) => {
    const auth = req.headers.authorization || '';
    const syncToken = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!syncToken) {
      return reply.status(401).send({ error: 'Netflix sync token is required' });
    }

    const parsed = netflixSyncSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const [account] = await db
      .select()
      .from(connectedAccounts)
      .where(and(
        eq(connectedAccounts.provider, 'netflix'),
        eq(connectedAccounts.accessToken, hashToken(syncToken))
      ))
      .limit(1);

    if (!account) {
      return reply.status(401).send({ error: 'Netflix sync token is invalid or revoked' });
    }

    const { tmdbId, mediaType, season, episode, watchedAt, runtimeMins, title, posterPath } = parsed.data;
    if (mediaType === 'tv' && (!season || !episode)) {
      return reply.status(400).send({ error: 'season and episode are required for tv history entries' });
    }

    const recentCutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const duplicateConditions = [
      eq(watchHistory.userId, account.userId),
      eq(watchHistory.tmdbId, tmdbId),
      eq(watchHistory.mediaType, mediaType),
      gt(watchHistory.watchedAt, recentCutoff),
    ];
    if (mediaType === 'tv') {
      duplicateConditions.push(eq(watchHistory.season, season));
      duplicateConditions.push(eq(watchHistory.episode, episode));
    }

    const [recentDuplicate] = await db
      .select({ id: watchHistory.id })
      .from(watchHistory)
      .where(and(...duplicateConditions))
      .limit(1);

    let item = null;
    if (!recentDuplicate) {
      [item] = await db
        .insert(watchHistory)
        .values({
          userId: account.userId,
          tmdbId,
          mediaType,
          season: mediaType === 'tv' ? season : null,
          episode: mediaType === 'tv' ? episode : null,
          watchedAt: watchedAt ? new Date(watchedAt) : new Date(),
          runtimeMins: runtimeMins || null,
          title: title || null,
          posterPath: posterPath || null,
        })
        .returning();
    }

    await db
      .update(connectedAccounts)
      .set({
        metadata: {
          ...(account.metadata || {}),
          lastSyncedAt: new Date().toISOString(),
          lastNetflixVideoId: parsed.data.netflixVideoId || null,
          lastPlatform: parsed.data.platform || 'netflix',
        },
      })
      .where(eq(connectedAccounts.id, account.id));

    return reply.status(recentDuplicate ? 200 : 201).send({
      success: true,
      duplicate: Boolean(recentDuplicate),
      item,
    });
  });

  // ──────────────────────────────────────────────
  // POST /netflix/sync/batch — Backfill/sondeo de la actividad de visionado
  // de Netflix obtenida por la extensión. Autenticado con el token revocable.
  // ──────────────────────────────────────────────
  fastify.post('/netflix/sync/batch', async (req, reply) => {
    const auth = req.headers.authorization || '';
    const syncToken = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!syncToken) {
      return reply.status(401).send({ error: 'Netflix sync token is required' });
    }

    const parsed = netflixSyncBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const [account] = await db
      .select()
      .from(connectedAccounts)
      .where(and(
        eq(connectedAccounts.provider, 'netflix'),
        eq(connectedAccounts.accessToken, hashToken(syncToken)),
      ))
      .limit(1);

    if (!account) {
      return reply.status(401).send({ error: 'Netflix sync token is invalid or revoked' });
    }

    const userId = account.userId;

    // Normaliza y descarta tv sin temporada/episodio.
    const candidates = [];
    for (const item of parsed.data.items) {
      if (item.mediaType === 'tv' && (!item.season || !item.episode)) continue;
      const watchedAt = item.watchedAt ? new Date(item.watchedAt) : new Date();
      if (Number.isNaN(watchedAt.getTime())) continue;
      candidates.push({
        userId,
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        season: item.mediaType === 'tv' ? item.season : null,
        episode: item.mediaType === 'tv' ? item.episode : null,
        watchedAt,
        title: item.title || null,
        posterPath: item.posterPath || null,
      });
    }

    // Deduplica contra el historial existente por (tmdbId, mediaType, season,
    // episode, día). El backfill conserva la fecha real de visionado.
    const dayKey = (value) => {
      const d = value instanceof Date ? value : new Date(value);
      return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    };
    const entryKey = (item) =>
      [item.tmdbId, item.mediaType, item.season ?? '', item.episode ?? '', dayKey(item.watchedAt)].join(':');

    const existing = await db
      .select({
        tmdbId: watchHistory.tmdbId,
        mediaType: watchHistory.mediaType,
        season: watchHistory.season,
        episode: watchHistory.episode,
        watchedAt: watchHistory.watchedAt,
      })
      .from(watchHistory)
      .where(eq(watchHistory.userId, userId));
    const existingKeys = new Set(existing.map(entryKey));

    const toInsert = [];
    const batchSeen = new Set();
    let duplicates = 0;
    for (const item of candidates) {
      const key = entryKey(item);
      if (existingKeys.has(key) || batchSeen.has(key)) {
        duplicates += 1;
        continue;
      }
      batchSeen.add(key);
      toInsert.push(item);
    }

    let imported = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const inserted = await db
        .insert(watchHistory)
        .values(chunk)
        .onConflictDoNothing()
        .returning({ id: watchHistory.id });
      imported += inserted.length;
    }

    await db
      .update(connectedAccounts)
      .set({
        metadata: {
          ...(account.metadata || {}),
          lastSyncedAt: new Date().toISOString(),
        },
      })
      .where(eq(connectedAccounts.id, account.id));

    return reply.send({
      success: true,
      total: parsed.data.items.length,
      imported,
      duplicates,
    });
  });

  // ──────────────────────────────────────────────
  // POST /netflix/disconnect — Desconectar Netflix
  // ──────────────────────────────────────────────
  fastify.post('/netflix/disconnect', { preHandler: fastify.requireAuth }, async (req, reply) => {
    await db
      .delete(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.userId, req.user.id),
          eq(connectedAccounts.provider, 'netflix')
        )
      );

    return reply.send({ disconnected: true });
  });
}
