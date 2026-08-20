// src/routes/auth.js
// Endpoints de autenticación: register, login, refresh, logout, me

import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  users,
  refreshTokens,
  emailChangeTokens,
  userPreferences,
  connectedAccounts,
  watchHistory,
  watchProgress,
} from '../db/schema.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
} from '../lib/jwt.js';
import { sendEmailChangeVerification } from '../lib/email.js';
import { REFRESH_ROTATION_GRACE_MS } from '../lib/refreshRotation.js';
import { syncDedupKey } from './netflixSyncDedup.js';
import {
  shouldRecordCompletion,
  REWATCH_COMPLETION_COOLDOWN_MS,
} from '../lib/rewatchCompletion.js';
import { getRuntimeSeconds } from '../lib/tmdbRuntime.js';
import { eq, and, gt, lt, isNull, sql } from 'drizzle-orm';

const BCRYPT_ROUNDS = 12;
const EMAIL_CHANGE_TOKEN_TTL_MS = 30 * 60 * 1000;
export const MAX_AVATAR_DATA_URL_LENGTH = 480_000;

const httpsAvatarUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === 'https:', {
    message: 'Avatar URL must use HTTPS',
  });

const localAvatarDataUrlSchema = z
  .string()
  .max(MAX_AVATAR_DATA_URL_LENGTH)
  .regex(
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/i,
    'Avatar image must be an optimized PNG, JPEG, or WebP data URL',
  );

export const avatarUrlSchema = z.union([
  httpsAvatarUrlSchema,
  localAvatarDataUrlSchema,
]);

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

const changeEmailRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  currentPassword: z.string().min(1).max(128).optional(),
});

const confirmEmailChangeSchema = z.object({
  token: z.string().min(32).max(256),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: z.string().min(8).max(128),
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
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  // La posición no la publica el reproductor: está DEDUCIDA por reloj desde que
  // se empezó a mirar (algunas apps de Android). Sirve para que el título salga
  // en "Continuar viendo", pero no para dar nada por visto.
  estimated: z.boolean().optional(),
});

// Progreso de reproducción en curso (position/duration) desde la extensión o la
// app Android. season/episode 0 = película o sin episodio concreto.
const netflixProgressSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  season: z.number().int().min(0).optional(),
  episode: z.number().int().min(0).optional(),
  positionSeconds: z.number().int().min(0),
  runtimeSeconds: z.number().int().min(0),
  platform: z.string().max(40).optional(),
  title: z.string().max(300).optional(),
  posterPath: z.string().max(300).nullable().optional(),
  // Con qué seguridad se resolvió el título (lo devuelve /extension-sync). Viaja
  // en cada ping para poder guardarlo TAL CUAL al completar: antes se escribía
  // 'high' a ciegas y una resolución dudosa quedaba en el historial indistinguible
  // de una segura.
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  // La posición viene DEDUCIDA por reloj, no publicada por el reproductor (varias
  // apps de Android no exponen `position` en su MediaSession). El handler ya la
  // trataba distinto —ni completa ni pisa hacia atrás una posición real— pero el
  // campo NO estaba declarado aquí: Zod elimina las claves desconocidas, así que
  // `parsed.data.estimated` llegaba siempre `undefined` y las dos protecciones
  // quedaban muertas. Declararlo es lo que las reactiva.
  estimated: z.boolean().optional(),
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

function hashEmailChangeToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function getFrontendUrl() {
  const candidate = String(process.env.FRONTEND_URL || '').split(',')[0]?.trim();
  if (!candidate) {
    const error = new Error('FRONTEND_URL is required to send email verification links');
    error.status = 503;
    throw error;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    const error = new Error('FRONTEND_URL is invalid');
    error.status = 500;
    throw error;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    hasPassword: Boolean(user.passwordHash),
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    plan: user.plan,
    planExpiresAt: user.planExpiresAt,
  };
}

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
      user: {
        ...user,
        emailVerified: false,
        hasPassword: true,
      },
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
        emailVerified: user.emailVerified,
        hasPassword: true,
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

    // Rotación TOLERANTE A CONCURRENCIA: en vez de BORRAR el token usado de
    // inmediato —lo que hacía que refrescos concurrentes del mismo token (al
    // volver a la app y cargar el dashboard, con el access token ya caducado)
    // recibieran 401 y cerraran la sesión sin motivo— lo «retiramos» acortando
    // su expiración a una breve ventana de gracia. Durante esa ventana, los
    // refrescos concurrentes con el mismo token siguen siendo válidos y reciben
    // un par nuevo. Pasada la ventana, el token caduca de forma natural y deja
    // de aceptarse (la rotación sigue siendo efectiva).
    // La misma lógica está modelada y testeada en lib/refreshRotation.js.
    const graceExpiry = new Date(Date.now() + REFRESH_ROTATION_GRACE_MS);
    await db
      .update(refreshTokens)
      .set({ expiresAt: graceExpiry })
      .where(
        and(
          eq(refreshTokens.id, storedToken.id),
          // Sólo acortar, nunca extender (idempotente si ya estaba retirado).
          gt(refreshTokens.expiresAt, graceExpiry),
        ),
      );

    const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(
      payload.sub,
      {
        deviceName: storedToken.deviceName,
        ipAddress: req.ip,
      }
    );

    // Mantenimiento: eliminar los refresh tokens del usuario ya caducados
    // (incluidos los retirados hace más de la ventana de gracia) para que la
    // tabla no crezca sin límite ahora que no borramos en cada rotación.
    await db
      .delete(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, storedToken.userId),
          lt(refreshTokens.expiresAt, new Date()),
        ),
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
  // POST /auth/account/email/change-request
  // El correo no se actualiza aquí: primero se verifica el control de la nueva
  // dirección mediante un enlace de un solo uso.
  // ──────────────────────────────────────────────
  fastify.post(
    '/account/email/change-request',
    {
      preHandler: fastify.requireAuth,
      config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
    },
    async (req, reply) => {
      const parsed = changeEmailRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
      }

      const email = parsed.data.email.toLowerCase();
      const currentPassword = parsed.data.currentPassword;

      if (req.user.passwordHash) {
        if (!currentPassword || !(await bcrypt.compare(currentPassword, req.user.passwordHash))) {
          return reply.status(401).send({ error: 'Current password is incorrect' });
        }
      }

      if (email === req.user.email && req.user.emailVerified) {
        return reply.send({ ok: true, alreadyVerified: true, email });
      }

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing && existing.id !== req.user.id) {
        return reply.status(409).send({ error: 'Email already registered' });
      }

      let frontendUrl;
      try {
        frontendUrl = getFrontendUrl();
      } catch (error) {
        return reply.status(error.status || 503).send({ error: error.message });
      }

      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashEmailChangeToken(token);
      const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS);
      const verificationUrl = new URL('/auth/verify-email', frontendUrl);
      verificationUrl.searchParams.set('token', token);

      await db.transaction(async (tx) => {
        await tx.delete(emailChangeTokens).where(eq(emailChangeTokens.userId, req.user.id));
        await tx.insert(emailChangeTokens).values({
          userId: req.user.id,
          email,
          tokenHash,
          expiresAt,
        });
      });

      try {
        await sendEmailChangeVerification({
          to: email,
          verificationUrl: verificationUrl.toString(),
        });
      } catch (error) {
        await db.delete(emailChangeTokens).where(eq(emailChangeTokens.tokenHash, tokenHash));
        return reply.status(error.status || 502).send({
          error: error.message || 'No se pudo enviar el correo de verificación',
        });
      }

      return reply.send({
        ok: true,
        pendingEmail: email,
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  // ──────────────────────────────────────────────
  // POST /auth/account/email/confirm
  // Es pública para que el enlace pueda abrirse en cualquier dispositivo. El
  // token aleatorio, de un uso y con caducidad es la credencial de esta acción.
  // ──────────────────────────────────────────────
  fastify.post('/account/email/confirm', async (req, reply) => {
    const parsed = confirmEmailChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid verification link' });
    }

    const tokenHash = hashEmailChangeToken(parsed.data.token);
    let consumed;
    try {
      consumed = await db.transaction(async (tx) => {
        const [token] = await tx
          .delete(emailChangeTokens)
          .where(eq(emailChangeTokens.tokenHash, tokenHash))
          .returning();

        if (!token || token.expiresAt <= new Date()) return null;

        const [emailOwner] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, token.email))
          .limit(1);

        if (emailOwner && emailOwner.id !== token.userId) {
          const error = new Error('Email already registered');
          error.status = 409;
          throw error;
        }

        await tx
          .update(users)
          .set({ email: token.email, emailVerified: true, updatedAt: new Date() })
          .where(eq(users.id, token.userId));
        await tx.delete(refreshTokens).where(eq(refreshTokens.userId, token.userId));
        return token;
      });
    } catch (error) {
      return reply.status(error.status || 500).send({
        error: error.message || 'No se pudo confirmar el correo',
      });
    }

    if (!consumed) {
      return reply.status(400).send({ error: 'This verification link is invalid or has expired' });
    }

    return reply.send({ ok: true, email: consumed.email, sessionsRevoked: true });
  });

  // ──────────────────────────────────────────────
  // PUT /auth/account/password
  // Requiere la contraseña actual si ya existe una. Las cuentas OAuth pueden
  // crear una primera contraseña desde una sesión autenticada.
  // ──────────────────────────────────────────────
  fastify.put(
    '/account/password',
    {
      preHandler: fastify.requireAuth,
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    },
    async (req, reply) => {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
      }

      if (req.user.passwordHash) {
        if (!parsed.data.currentPassword || !(await bcrypt.compare(parsed.data.currentPassword, req.user.passwordHash))) {
          return reply.status(401).send({ error: 'Current password is incorrect' });
        }
      }

      const passwordHash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS);
      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(users.id, req.user.id));
        await tx.delete(refreshTokens).where(eq(refreshTokens.userId, req.user.id));
      });

      return reply.send({ ok: true, sessionsRevoked: true });
    },
  );

  // ──────────────────────────────────────────────
  // GET /auth/me — Perfil del usuario autenticado
  // ──────────────────────────────────────────────
  fastify.get('/me', { preHandler: fastify.requireAuth }, async (req, reply) => {
    return reply.send({ user: publicUser(req.user) });
  });

  // ──────────────────────────────────────────────
  // PATCH /auth/me — Actualizar perfil
  // ──────────────────────────────────────────────
  fastify.patch('/me', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const updateSchema = z.object({
      username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/).optional(),
      displayName: z.string().max(50).optional(),
      bio: z.string().max(500).optional(),
      avatarUrl: avatarUrlSchema.nullable().optional(),
      locale: z.string().optional(),
      timezone: z.string().optional(),
    });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const updates = { ...parsed.data, updatedAt: new Date() };
    if (updates.username) {
      updates.username = updates.username.toLowerCase();
      if (updates.username !== req.user.username) {
        const [existingUsername] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, updates.username))
          .limit(1);

        if (existingUsername) {
          return reply.status(409).send({ error: 'Username already taken' });
        }
      }
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, req.user.id))
      .returning({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        passwordHash: users.passwordHash,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        plan: users.plan,
      });

    return reply.send({ user: publicUser(updated) });
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
  // POST /netflix/pair-mobile — Empareja la app companion de Android.
  // Crea/actualiza una fila de dispositivo SEPARADA (providerUid propio) para no
  // pisar el token de la extensión. Usa provider='netflix' para que el lookup de
  // /netflix/sync (por hash de token) la encuentre. Devuelve el token en claro.
  // ──────────────────────────────────────────────
  fastify.post('/netflix/pair-mobile', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const syncToken = `tsv_netflix_${nanoid(48)}`;
    const now = new Date();
    const providerUid = `mobile:${req.user.id}`;
    const metadata = {
      profileName: 'Android',
      connectedAt: now.toISOString(),
      lastSyncedAt: null,
      syncMode: 'android-app',
    };

    await db
      .insert(connectedAccounts)
      .values({
        userId: req.user.id,
        provider: 'netflix',
        providerUid,
        accessToken: hashToken(syncToken),
        metadata,
      })
      .onConflictDoUpdate({
        target: [connectedAccounts.provider, connectedAccounts.providerUid],
        set: {
          userId: req.user.id,
          accessToken: hashToken(syncToken),
          metadata,
        },
      });

    return reply.send({ paired: true, syncToken });
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

    const {
      tmdbId,
      mediaType,
      season,
      episode,
      watchedAt,
      runtimeMins,
      title,
      posterPath,
      confidence,
    } = parsed.data;
    // Nota: un tv sin temporada/episodio es válido → fallback a nivel serie
    // (episode = null, confidence 'low'). No se rechaza.

    const watchedDate = watchedAt ? new Date(watchedAt) : new Date();
    // Dedup con la MISMA regla que syncDedupKey: episodio → 12 h; nivel serie
    // (episode null) → por día. Traemos los visionados recientes de este título
    // (últimas 24 h cubren ambas ventanas) y comparamos por clave.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentRows = await db
      .select({
        season: watchHistory.season,
        episode: watchHistory.episode,
        watchedAt: watchHistory.watchedAt,
      })
      .from(watchHistory)
      .where(and(
        eq(watchHistory.userId, account.userId),
        eq(watchHistory.tmdbId, tmdbId),
        eq(watchHistory.mediaType, mediaType),
        gt(watchHistory.watchedAt, since),
      ));

    const incomingKey = syncDedupKey({
      tmdbId,
      mediaType,
      season: mediaType === 'tv' ? season ?? null : null,
      episode: mediaType === 'tv' ? episode ?? null : null,
      watchedAt: watchedDate,
    });
    const recentDuplicate = recentRows.some(
      (r) =>
        syncDedupKey({
          tmdbId,
          mediaType,
          season: r.season,
          episode: r.episode,
          watchedAt: r.watchedAt,
        }) === incomingKey,
    );

    let item = null;
    if (!recentDuplicate) {
      [item] = await db
        .insert(watchHistory)
        .values({
          userId: account.userId,
          tmdbId,
          mediaType,
          season: mediaType === 'tv' ? season ?? null : null,
          episode: mediaType === 'tv' ? episode ?? null : null,
          watchedAt: watchedDate,
          runtimeMins: runtimeMins || null,
          title: title || null,
          posterPath: posterPath || null,
          confidence: confidence || 'high',
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
  // POST /netflix/progress — Progreso de reproducción (extensión + Android).
  // Cada ~30 s el cliente envía posición/duración del contenido YA resuelto
  // (tmdbId/mediaType/temporada/episodio cacheados). Mientras se ve, se hace
  // upsert en watch_progress ("Continuar viendo"). Al llegar al 90% se marca
  // como visto en el historial (con dedup) y se elimina de "Continuar viendo".
  // ──────────────────────────────────────────────
  fastify.post('/netflix/progress', async (req, reply) => {
    const auth = req.headers.authorization || '';
    const syncToken = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!syncToken) {
      return reply.status(401).send({ error: 'Netflix sync token is required' });
    }

    const parsed = netflixProgressSchema.safeParse(req.body);
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

    const {
      tmdbId, mediaType, positionSeconds, runtimeSeconds, platform, title, posterPath,
      confidence, estimated,
    } = parsed.data;
    const isTv = mediaType === 'tv';
    // Clave del índice único: 0 para película o episodio desconocido.
    const season = isTv ? (parsed.data.season ?? 0) : 0;
    const episode = isTv ? (parsed.data.episode ?? 0) : 0;

    // Duración efectiva: la que reporta el cliente o, si no la trae (Plex y algunos
    // episodios de Netflix no exponen duración en la MediaSession), la de TMDb. Sin
    // ella no se puede calcular el % y el título no entraba en "Continuar viendo".
    let effectiveRuntime = runtimeSeconds > 0 ? runtimeSeconds : 0;
    if (effectiveRuntime <= 0) {
      effectiveRuntime = await getRuntimeSeconds({
        tmdbId,
        mediaType,
        season: isTv ? season : 0,
        episode: isTv ? episode : 0,
      });
    }
    const percent = effectiveRuntime > 0 ? Math.min(1, positionSeconds / effectiveRuntime) : 0;
    const COMPLETE_AT = 0.9;
    const userId = account.userId;

    // ── Completado (≥90% y con duración conocida): registrar play + quitar de
    // "Continuar viendo". Regla del "cruce del 90%" (ver lib/rewatchCompletion.js):
    // la fila de watch_progress SOLO existe mientras percent < 0.9, así que si
    // existía al llegar aquí es que veníamos reproduciendo por debajo del umbral y
    // lo cruzamos AHORA → un play nuevo (primer visionado O rewatch). Los pings de
    // cola (95%, 98%…) de una misma sesión ya no tienen fila y se colapsan por el
    // cooldown. Esto permite re-sincronizar el mismo episodio el mismo día como un
    // rewatch (antes: bucket de 12 h que lo descartaba).
    // Con posición DEDUCIDA no se completa nunca: el porcentaje saldría de
    // comparar el rato que llevamos mirando contra la duración de TMDb, y eso daba
    // por vistos episodios que no se habían terminado. Se sigue actualizando
    // "Continuar viendo" más abajo.
    if (effectiveRuntime > 0 && percent >= COMPLETE_AT && !estimated) {
      const now = new Date();
      // Valores tal y como se guardan en watch_history (null para película o
      // episodio desconocido); watch_progress usa el sentinel 0 (season/episode).
      const storedSeason = isTv ? (season || null) : null;
      const storedEpisode = isTv ? (episode || null) : null;

      // 1) Quitar de "Continuar viendo" y saber si HABÍA una sesión en curso (<90%).
      const removedProgress = await db
        .delete(watchProgress)
        .where(and(
          eq(watchProgress.userId, userId),
          eq(watchProgress.tmdbId, tmdbId),
          eq(watchProgress.mediaType, mediaType),
          eq(watchProgress.season, season),
          eq(watchProgress.episode, episode),
        ))
        .returning({ id: watchProgress.id });
      const wasInProgress = removedProgress.length > 0;

      // 2) Sin fila (pings de cola tras completar, o salto directo al final): mira
      //    si ya hay un play del MISMO ítem dentro del cooldown para no duplicar.
      let hasRecentPlay = false;
      if (!wasInProgress) {
        const cooldownSince = new Date(now.getTime() - REWATCH_COMPLETION_COOLDOWN_MS);
        const [recent] = await db
          .select({ id: watchHistory.id })
          .from(watchHistory)
          .where(and(
            eq(watchHistory.userId, userId),
            eq(watchHistory.tmdbId, tmdbId),
            eq(watchHistory.mediaType, mediaType),
            storedSeason == null ? isNull(watchHistory.season) : eq(watchHistory.season, storedSeason),
            storedEpisode == null ? isNull(watchHistory.episode) : eq(watchHistory.episode, storedEpisode),
            gt(watchHistory.watchedAt, cooldownSince),
          ))
          .limit(1);
        hasRecentPlay = Boolean(recent);
      }

      const recorded = shouldRecordCompletion({ wasInProgress, hasRecentPlay });

      let item = null;
      if (recorded) {
        [item] = await db
          .insert(watchHistory)
          .values({
            userId,
            tmdbId,
            mediaType,
            season: storedSeason,
            episode: storedEpisode,
            watchedAt: now,
            runtimeMins: effectiveRuntime ? Math.round(effectiveRuntime / 60) : null,
            title: title || null,
            posterPath: posterPath || null,
            // La que traiga el cliente; 'high' solo si no la manda (clientes viejos).
            confidence: confidence || 'high',
          })
          .returning();
      }

      return reply.send({ ok: true, completed: true, recorded, duplicate: !recorded, percent: 1, item });
    }

    // ── En curso: upsert del progreso.
    await db
      .insert(watchProgress)
      .values({
        userId,
        tmdbId,
        mediaType,
        season,
        episode,
        positionSeconds,
        runtimeSeconds: effectiveRuntime,
        percent,
        platform: platform || null,
        title: title || null,
        posterPath: posterPath || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          watchProgress.userId,
          watchProgress.tmdbId,
          watchProgress.mediaType,
          watchProgress.season,
          watchProgress.episode,
        ],
        set: {
          // Una posición DEDUCIDA no puede hacer retroceder una real ya guardada:
          // al retomar por el minuto 40, la estimación empieza en 0 y mandaba
          // "Continuar viendo" al principio. Con posición real se guarda tal cual
          // (un rebobinado del usuario es legítimo).
          positionSeconds: estimated
            ? sql`GREATEST(${watchProgress.positionSeconds}, ${positionSeconds})`
            : positionSeconds,
          runtimeSeconds: effectiveRuntime,
          percent: estimated
            ? sql`GREATEST(${watchProgress.percent}, ${percent})`
            : percent,
          platform: platform || null,
          title: title || null,
          posterPath: posterPath || null,
          updatedAt: new Date(),
        },
      });

    return reply.send({ ok: true, completed: false, percent });
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
