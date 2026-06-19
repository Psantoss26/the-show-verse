// src/lib/redis.js
// Cliente Redis compartido para caché y rate limiting
// Compatible con Redis local, Railway Redis y Upstash (rediss://)

import Redis from 'ioredis';

let redis = null;

export function getRedis() {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  // Upstash usa rediss:// (con TLS). ioredis lo detecta automáticamente.
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) return null; // deja de reintentar tras 5 intentos
      return Math.min(times * 100, 2000);
    },
    lazyConnect: true,
    // TLS habilitado automáticamente si la URL empieza por rediss://
    ...(redisUrl.startsWith('rediss://') && {
      tls: { rejectUnauthorized: false },
    }),
  });

  redis.on('error', (err) => {
    // No crashear si Redis no está disponible — la app funciona sin caché
    if (err.code !== 'ECONNREFUSED') {
      console.error('[Redis] Error:', err.message);
    }
  });

  return redis;
}

/**
 * Obtiene un valor de la caché Redis.
 * @returns {T|null} El valor parseado o null si no existe/expiró.
 */
export async function cacheGet(key) {
  try {
    const r = getRedis();
    const val = await r.get(key);
    if (!val) return null;
    return JSON.parse(val);
  } catch {
    return null;
  }
}

/**
 * Guarda un valor en la caché Redis con TTL en segundos.
 */
export async function cacheSet(key, value, ttlSeconds = 600) {
  try {
    const r = getRedis();
    await r.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Si Redis falla, seguimos sin caché
  }
}

/**
 * Elimina una clave de la caché.
 */
export async function cacheDel(key) {
  try {
    const r = getRedis();
    await r.del(key);
  } catch {}
}

/**
 * Patrón cache-aside: obtiene de caché o ejecuta la función y cachea el resultado.
 */
export async function withCache(key, ttlSeconds, fetchFn) {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;

  const value = await fetchFn();
  if (value !== null && value !== undefined) {
    await cacheSet(key, value, ttlSeconds);
  }
  return value;
}

export default getRedis;
