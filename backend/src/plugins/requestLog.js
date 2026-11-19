// backend/src/plugins/requestLog.js
// Guarda cada petición al backend en request_log (ver lib/requestLog.js) y
// borra cada hora las filas con más de REQUEST_LOG_RETENTION_DAYS días (90 por
// defecto). REQUEST_LOG_ENABLED=false lo apaga.
//
// Va después de authPlugin: el hook onResponse lee req.user.

import fp from 'fastify-plugin';
import { sql } from 'drizzle-orm';

import db from '../db/client.js';
import { requestLog } from '../db/schema.js';
import {
  buildRequestLogEntry,
  createRequestLogBuffer,
  shouldLogRequest,
} from '../lib/requestLog.js';

const RETENTION_EVERY_MS = 60 * 60 * 1000;

export function requestLogRetentionDays(env = process.env) {
  const days = Number(env.REQUEST_LOG_RETENTION_DAYS);
  return Number.isFinite(days) && days >= 1 ? Math.floor(days) : 90;
}

export async function pruneRequestLog(days = requestLogRetentionDays()) {
  const rows = await db.execute(sql`
    delete from request_log where ts < now() - make_interval(days => ${days})
  `);
  return rows.count ?? 0;
}

async function requestLogPlugin(fastify, opts = {}) {
  if (process.env.REQUEST_LOG_ENABLED === 'false') return;

  const buffer = opts.buffer || createRequestLogBuffer({
    insert: (rows) => db.insert(requestLog).values(rows),
    onError: (err) => fastify.log.warn({ err: err?.message }, 'request_log: no se pudo escribir el lote'),
  });

  fastify.addHook('onResponse', async (req, reply) => {
    if (!shouldLogRequest(req)) return;
    buffer.push(buildRequestLogEntry(req, reply));
  });

  let retentionTimer = null;
  if (opts.retention !== false) {
    const prune = () => pruneRequestLog().catch((err) => {
      fastify.log.warn({ err: err?.message }, 'request_log: falló la retención');
    });
    // Primera pasada al minuto de arrancar, luego cada hora.
    const first = setTimeout(prune, 60 * 1000);
    first.unref?.();
    retentionTimer = setInterval(prune, RETENTION_EVERY_MS);
    retentionTimer.unref?.();
    fastify.addHook('onClose', async () => clearTimeout(first));
  }

  fastify.addHook('onClose', async () => {
    if (retentionTimer) clearInterval(retentionTimer);
    await buffer.close();
  });
}

export default fp(requestLogPlugin, { name: 'request-log' });
