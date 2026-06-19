// src/routes/auth.js
// Endpoints de autenticación: register, login, refresh, logout, me

import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users, refreshTokens, userPreferences } from '../db/schema.js';
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
}
