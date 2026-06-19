// src/server.js
// Punto de entrada del servidor Fastify

import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCookie from '@fastify/cookie';
import fp from 'fastify-plugin';

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

import { getRedis } from './lib/redis.js';

const isDev = process.env.NODE_ENV !== 'production';

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
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await fastify.close();
  process.exit(0);
});
