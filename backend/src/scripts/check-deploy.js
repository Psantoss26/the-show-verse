import { sql } from 'drizzle-orm';
import { validateRuntimeEnv, getAllowedOrigins } from '../config/env.js';
import { closeDb, db } from '../db/client.js';
import { closeRedis, getRedis } from '../lib/redis.js';

const results = [];

function ok(name, detail = 'ok') {
  results.push({ name, status: 'ok', detail });
}

function fail(name, err) {
  results.push({
    name,
    status: 'error',
    detail: err?.message || String(err),
  });
}

async function check(name, fn) {
  try {
    const detail = await fn();
    ok(name, detail);
  } catch (err) {
    fail(name, err);
  }
}

await check('environment', async () => {
  validateRuntimeEnv();
  const origins = getAllowedOrigins();
  return origins.length > 0 ? `origins=${origins.join(',')}` : 'no CORS origins configured';
});

await check('database', async () => {
  await db.execute(sql`select 1`);
  return 'select 1';
});

if (process.env.REDIS_URL) {
  await check('redis', async () => {
    const redis = getRedis();
    await redis.ping();
    return 'ping';
  });
} else {
  ok('redis', 'disabled');
}

if (process.env.TMDB_API_KEY) {
  await check('tmdb', async () => {
    const url = new URL('https://api.themoviedb.org/3/configuration');
    url.searchParams.set('api_key', process.env.TMDB_API_KEY);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`TMDb HTTP ${res.status}`);
    return 'configuration';
  });
}

await closeRedis();
await closeDb();

for (const row of results) {
  const icon = row.status === 'ok' ? 'OK' : 'FAIL';
  console.log(`${icon} ${row.name}: ${row.detail}`);
}

const failed = results.filter((row) => row.status !== 'ok');
if (failed.length > 0) {
  process.exit(1);
}

