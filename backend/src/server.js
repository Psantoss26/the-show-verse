// src/server.js
// Punto de entrada del servidor Fastify

import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCookie from '@fastify/cookie';
import { sql } from 'drizzle-orm';

import { getAllowedOrigins, validateRuntimeEnv } from './config/env.js';
import { db, closeDb } from './db/client.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import favoritesRoutes from './routes/favorites.js';
import watchlistRoutes from './routes/watchlist.js';
import historyRoutes from './routes/history.js';
import ratingsRoutes from './routes/ratings.js';
import listsRoutes from './routes/lists.js';
import itemsRoutes from './routes/items.js';
import tmdbRoutes from './routes/tmdb.js';
import importRoutes from './routes/import.js';
import statsRoutes from './routes/stats.js';

import { closeRedis, getRedis } from './lib/redis.js';

const isDev = process.env.NODE_ENV !== 'production';
validateRuntimeEnv();

const allowedOrigins = getAllowedOrigins();
const defaultDevOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const origins = allowedOrigins.length > 0 ? allowedOrigins : defaultDevOrigins;
  return origins.includes(origin);
}

const fastify = Fastify({
  logger: {
    level: isDev ? 'info' : 'warn',
    transport: isDev
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  trustProxy: true, // Necesario para obtener IP real detrás de Nginx/Vercel
});

// ────────────────────────────────────────────
// Plugins de seguridad
// ────────────────────────────────────────────
await fastify.register(fastifyHelmet, {
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

await fastify.register(fastifyCors, {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    return cb(new Error(`CORS origin not allowed: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

await fastify.register(fastifyCookie, {
  secret: process.env.JWT_ACCESS_SECRET || 'dev-cookie-secret',
});

// Rate limiting global
await fastify.register(fastifyRateLimit, {
  max: 200,
  timeWindow: '1 minute',
  redis: await (async () => {
    try {
      const r = getRedis();
      if (!r) return null;
      await r.ping();
      return r;
    } catch {
      return null; // Fallback a memoria si Redis no está disponible
    }
  })(),
  keyGenerator: (req) => req.user?.id || req.ip, // Por usuario si está autenticado
  errorResponseBuilder: () => ({
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please wait before retrying.',
  }),
});

// ────────────────────────────────────────────
// Plugin de autenticación
// ────────────────────────────────────────────
await fastify.register(authPlugin);

// ────────────────────────────────────────────
// Health check
// ────────────────────────────────────────────
fastify.get('/health', async () => ({
  status: 'ok',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
}));

fastify.get('/ready', async (req, reply) => {
  const checks = {
    database: 'unknown',
    redis: process.env.REDIS_URL ? 'unknown' : 'disabled',
  };
  const errors = {};

  try {
    await db.execute(sql`select 1`);
    checks.database = 'ok';
  } catch (err) {
    checks.database = 'error';
    errors.database = err.message;
  }

  if (process.env.REDIS_URL) {
    try {
      const redis = getRedis();
      await redis.ping();
      checks.redis = 'ok';
    } catch (err) {
      checks.redis = 'error';
      errors.redis = err.message;
    }
  }

  const ready = checks.database === 'ok' && checks.redis !== 'error';

  return reply.status(ready ? 200 : 503).send({
    status: ready ? 'ready' : 'not_ready',
    checks,
    ...(Object.keys(errors).length > 0 && { errors }),
    timestamp: new Date().toISOString(),
  });
});

// ────────────────────────────────────────────
// Rutas de la API v1
// ────────────────────────────────────────────
const apiV1 = async (app) => {
  app.register(authRoutes, { prefix: '/auth' });
  app.register(favoritesRoutes, { prefix: '/favorites' });
  app.register(watchlistRoutes, { prefix: '/watchlist' });
  app.register(historyRoutes, { prefix: '/history' });
  app.register(ratingsRoutes, { prefix: '/ratings' });
  app.register(listsRoutes, { prefix: '/lists' });
  app.register(itemsRoutes, { prefix: '/items' });
  app.register(tmdbRoutes, { prefix: '/tmdb' });
  app.register(importRoutes, { prefix: '/import' });
  app.register(statsRoutes, { prefix: '/stats' });
};

await fastify.register(apiV1, { prefix: '/v1' });

// ────────────────────────────────────────────
// 404 handler global
// ────────────────────────────────────────────
fastify.setNotFoundHandler((req, reply) => {
  reply.status(404).send({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`,
  });
});

// ────────────────────────────────────────────
// Error handler global
// ────────────────────────────────────────────
fastify.setErrorHandler((err, req, reply) => {
  fastify.log.error(err);

  const status = err.statusCode || err.status || 500;
  reply.status(status).send({
    error: err.message || 'Internal Server Error',
    ...(isDev && { stack: err.stack }),
  });
});

// ────────────────────────────────────────────
// Arrancar servidor
// ────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`\n🚀 The Show Verse API running at http://${HOST}:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL ? '✅ Connected' : '⚠️  DATABASE_URL not set'}`);
  console.log(`⚡ Redis: ${process.env.REDIS_URL ? '✅ Configured' : '⚠️  REDIS_URL not set (cache disabled)'}\n`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// Graceful shutdown
async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  await fastify.close();
  await closeRedis();
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
