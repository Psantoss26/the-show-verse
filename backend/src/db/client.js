import '../config/load-env.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Dos URLs de conexión al PostgreSQL propio (NAS):
// DATABASE_URL          → normal (a través de un pooler/PgBouncer si lo hubiera)
// DATABASE_URL_UNPOOLED → conexión directa — obligatoria para migraciones
//
// Autoalojado: ambas apuntan al mismo Postgres (postgres:5432). Solo difieren si
// se pone un pooler delante.

const pooledUrl = process.env.DATABASE_URL;
const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!pooledUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

function shouldUseSsl(connectionUrl) {
  try {
    const { hostname, searchParams } = new URL(connectionUrl);
    const sslMode = searchParams.get('sslmode');
    // sslmode=disable siempre gana (p. ej. Postgres autoalojado sin TLS).
    if (sslMode === 'disable') return false;
    if (sslMode) return true;
    return !['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

function sslConfig(connectionUrl) {
  return shouldUseSsl(connectionUrl) ? { rejectUnauthorized: false } : false;
}

// ─── Queries normales ────────────────────────────────────────────────────────
const queryClient = postgres(pooledUrl, {
  max: 10,             // tope de conexiones simultáneas del pool de la app
  idle_timeout: 30,
  connect_timeout: 10,
  ssl: sslConfig(pooledUrl),
  // prepare:false evita conflictos de prepared statements si hay un PgBouncer
  // (transaction pooling) delante; inofensivo con conexión directa.
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
