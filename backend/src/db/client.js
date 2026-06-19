import '../config/load-env.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Neon provee dos URLs:
// DATABASE_URL       → Pooled (PgBouncer) — para queries normales, más eficiente
// DATABASE_URL_UNPOOLED → Conexión directa — obligatoria para migraciones
//
// En local (dev), ambas variables pueden apuntar a la misma BD.

const pooledUrl = process.env.DATABASE_URL;
const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!pooledUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

function shouldUseSsl(connectionUrl) {
  try {
    const { hostname, searchParams } = new URL(connectionUrl);
    const sslMode = searchParams.get('sslmode');
    if (sslMode && sslMode !== 'disable') return true;
    return !['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

function sslConfig(connectionUrl) {
  return shouldUseSsl(connectionUrl) ? { rejectUnauthorized: false } : false;
}

// ─── Queries normales (usa el pool de Neon/PgBouncer) ───────────────────────
const queryClient = postgres(pooledUrl, {
  max: 10,             // Neon free tier: máx 10 conexiones simultáneas
  idle_timeout: 30,
  connect_timeout: 10,
  ssl: sslConfig(pooledUrl),
  // Neon requiere esto con PgBouncer para evitar prepared statement conflicts:
  prepare: false,
});

// ─── Migraciones (conexión directa, sin pooling) ─────────────────────────────
// Drizzle migrate necesita una conexión directa (no PgBouncer)
export const migrationClient = postgres(directUrl, {
  max: 1,
  ssl: sslConfig(directUrl),
});

export const db = drizzle(queryClient, { schema, logger: false });

export async function closeDb() {
  await Promise.allSettled([
    queryClient.end({ timeout: 5 }),
    migrationClient.end({ timeout: 5 }),
  ]);
}

export default db;
