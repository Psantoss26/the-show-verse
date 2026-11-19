// backend/src/routes/admin.js
// Estadísticas del administrador sobre request_log (ver plugins/requestLog.js).
//
//   GET /v1/admin/me                  → { admin } (cualquier sesión)
//   GET /v1/admin/stats?range=        → resumen general (solo administradores)
//   GET /v1/admin/stats/users/:id     → actividad de un usuario (solo administradores)
//
// range: 1h | 24h (por defecto) | 7d | 30d, alineado al inicio de un tramo
// (días en STATS_TIME_ZONE, Europe/Madrid por defecto); `previous` son los
// totales del periodo anterior del mismo largo. Administradores: ADMIN_USER_IDS.

import { sql } from 'drizzle-orm';

import db from '../db/client.js';
import { isAdminUser } from '../lib/admin.js';
import { parseStatsRange, summarizeClients, summarizeRoutes } from '../lib/adminStats.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const num = (value) => Number(value) || 0;

// Zona de los tramos diarios: un «día» empieza a medianoche en España, no en UTC.
const TIME_ZONE = process.env.STATS_TIME_ZONE || 'Europe/Madrid';

/** Inicio del tramo de `expr` (minuto, hora o día local). */
function bucketOf(range, expr) {
  return range.bucket === 'day'
    ? sql`(date_trunc('day', (${expr}) at time zone ${TIME_ZONE}) at time zone ${TIME_ZONE})`
    : sql`date_trunc(${range.bucket}, (${expr}))`;
}

// La ventana empieza al principio de un tramo: así el primer punto de la serie
// está completo (antes salía recortado y parecía una caída) y la serie suma lo
// mismo que los totales. Solo el último tramo, el actual, va en curso.
function windowStart(range) {
  return bucketOf(range, sql`now() - ${range.interval}::interval`);
}

function since(range) {
  return sql`ts >= ${windowStart(range)}`;
}

/** El periodo anterior, del mismo largo, para comparar. */
function previousWindow(range) {
  return sql`ts >= ${windowStart(range)} - ${range.interval}::interval and ts < ${windowStart(range)}`;
}

function userFilter(userId) {
  return userId ? sql`and user_id = ${userId}` : sql``;
}

async function totals(range, userId, { previous = false } = {}) {
  const [row] = await db.execute(sql`
    select count(*)::int as requests,
           count(*) filter (where status >= 500)::int as errors_5xx,
           count(*) filter (where status >= 400 and status < 500)::int as errors_4xx,
           count(distinct user_id)::int as users,
           count(*) filter (where user_id is null)::int as anonymous,
           count(distinct ip)::int as ips,
           coalesce(percentile_cont(0.5) within group (order by duration_ms), 0)::int as p50_ms,
           coalesce(percentile_cont(0.95) within group (order by duration_ms), 0)::int as p95_ms
      from request_log
     where ${previous ? previousWindow(range) : since(range)} ${userFilter(userId)}
  `);
  return {
    requests: num(row?.requests),
    errors5xx: num(row?.errors_5xx),
    errors4xx: num(row?.errors_4xx),
    users: num(row?.users),
    anonymous: num(row?.anonymous),
    ips: num(row?.ips),
    p50Ms: num(row?.p50_ms),
    p95Ms: num(row?.p95_ms),
  };
}

async function series(range, userId) {
  const step = `1 ${range.bucket}`;
  const buckets = range.bucket === 'day'
    ? sql`select d at time zone ${TIME_ZONE} as t
            from generate_series(
              date_trunc('day', (now() - ${range.interval}::interval) at time zone ${TIME_ZONE}),
              date_trunc('day', now() at time zone ${TIME_ZONE}),
              '1 day'::interval
            ) as d`
    : sql`select generate_series(${windowStart(range)}, date_trunc(${range.bucket}, now()), ${step}::interval) as t`;
  const rows = await db.execute(sql`
    with buckets as (${buckets}),
    counts as (
      select ${bucketOf(range, sql`ts`)} as t,
             count(*)::int as requests,
             count(*) filter (where status >= 400 and status < 500)::int as errors_4xx,
             count(*) filter (where status >= 500)::int as errors_5xx,
             count(distinct user_id)::int as users,
             percentile_cont(0.5) within group (order by duration_ms)::int as p50_ms,
             percentile_cont(0.95) within group (order by duration_ms)::int as p95_ms
        from request_log
       where ${since(range)} ${userFilter(userId)}
       group by 1
    )
    select b.t, coalesce(c.requests, 0) as requests, coalesce(c.errors_4xx, 0) as errors_4xx,
           coalesce(c.errors_5xx, 0) as errors_5xx, coalesce(c.users, 0) as users,
           c.p50_ms, c.p95_ms
      from buckets b left join counts c on c.t = b.t
     order by b.t
  `);
  return [...rows].map((r) => ({
    t: new Date(r.t).toISOString(),
    requests: num(r.requests),
    errors4xx: num(r.errors_4xx),
    errors5xx: num(r.errors_5xx),
    users: num(r.users),
    // Sin peticiones no hay latencia: null (hueco en la gráfica), no 0 ms.
    p50Ms: r.p50_ms == null ? null : num(r.p50_ms),
    p95Ms: r.p95_ms == null ? null : num(r.p95_ms),
  }));
}

async function routes(range, userId) {
  const rows = await db.execute(sql`
    select method, route, count(*)::int as count,
           round(avg(duration_ms))::int as avg_ms,
           percentile_cont(0.95) within group (order by duration_ms)::int as p95_ms,
           count(*) filter (where status >= 400 and status < 500)::int as errors_4xx,
           count(*) filter (where status >= 500)::int as errors_5xx
      from request_log
     where ${since(range)} ${userFilter(userId)}
     group by method, route
     order by count desc
     limit 500
  `);
  return summarizeRoutes([...rows]);
}

async function groupCounts(column, range, userId, limit = 15) {
  const rows = await db.execute(sql`
    select ${sql.raw(column)} as key, count(*)::int as count
      from request_log
     where ${since(range)} ${userFilter(userId)}
     group by 1 order by 2 desc limit ${limit}
  `);
  return [...rows];
}

async function recent(userId, limit) {
  const rows = await db.execute(sql`
    select r.ts, r.method, r.route, r.status, r.duration_ms, r.user_id, r.country,
           r.ip, r.user_agent, u.username
      from request_log r left join users u on u.id = r.user_id
     where true ${userId ? sql`and r.user_id = ${userId}` : sql``}
     order by r.ts desc limit ${limit}
  `);
  return [...rows].map((r) => ({
    ts: new Date(r.ts).toISOString(),
    method: r.method,
    route: r.route,
    status: num(r.status),
    durationMs: num(r.duration_ms),
    userId: r.user_id,
    username: r.username || null,
    country: r.country,
    ip: r.ip,
    userAgent: r.user_agent,
  }));
}

async function topUsers(range) {
  const rows = await db.execute(sql`
    select r.user_id, u.username, u.display_name, u.avatar_url,
           count(*)::int as count,
           count(*) filter (where r.status >= 400)::int as errors,
           max(r.ts) as last_seen,
           count(distinct r.ip)::int as ips
      from request_log r join users u on u.id = r.user_id
     where ${since(range)}
     group by r.user_id, u.username, u.display_name, u.avatar_url
     order by count desc limit 25
  `);
  return [...rows].map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    count: num(r.count),
    errors: num(r.errors),
    lastSeen: new Date(r.last_seen).toISOString(),
    ips: num(r.ips),
  }));
}

async function breakdowns(range, userId) {
  const [countries, statuses, agents] = await Promise.all([
    groupCounts('country', range, userId),
    groupCounts('status', range, userId, 20),
    groupCounts('user_agent', range, userId, 500),
  ]);
  return {
    countries: countries.map((r) => ({ country: r.key || '??', count: num(r.count) })),
    statusCodes: statuses.map((r) => ({ status: num(r.key), count: num(r.count) })),
    clients: summarizeClients(agents.map((r) => ({ user_agent: r.key, count: r.count }))),
  };
}

export default async function adminRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.get('/me', async (req) => ({ admin: isAdminUser(req.user) }));

  fastify.register(async (adminOnly) => {
    adminOnly.addHook('preHandler', async (req, reply) => {
      if (!isAdminUser(req.user)) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Solo administradores' });
      }
    });

    adminOnly.get('/stats', async (req) => {
      const range = parseStatsRange(req.query?.range);
      const [summary, previous, timeline, routeStats, users, parts, latest] = await Promise.all([
        totals(range),
        totals(range, null, { previous: true }),
        series(range),
        routes(range),
        topUsers(range),
        breakdowns(range),
        recent(null, 60),
      ]);
      return {
        range: range.key,
        bucket: range.bucket,
        generatedAt: new Date().toISOString(),
        totals: summary,
        previous,
        series: timeline,
        ...routeStats,
        topUsers: users,
        ...parts,
        recent: latest,
      };
    });

    adminOnly.get('/stats/users/:id', async (req, reply) => {
      const userId = String(req.params?.id || '');
      if (!UUID_RE.test(userId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'id de usuario no válido' });
      }
      const [user] = await db.execute(sql`
        select id, username, display_name, avatar_url, created_at from users where id = ${userId}
      `);
      if (!user) return reply.status(404).send({ error: 'Not Found', message: 'Usuario no encontrado' });

      const range = parseStatsRange(req.query?.range);
      const [summary, previous, timeline, routeStats, parts, latest, lastSeen] = await Promise.all([
        totals(range, userId),
        totals(range, userId, { previous: true }),
        series(range, userId),
        routes(range, userId),
        breakdowns(range, userId),
        recent(userId, 150),
        db.execute(sql`select max(ts) as ts from request_log where user_id = ${userId}`),
      ]);
      return {
        range: range.key,
        bucket: range.bucket,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
          createdAt: user.created_at ? new Date(user.created_at).toISOString() : null,
          lastSeen: lastSeen?.[0]?.ts ? new Date(lastSeen[0].ts).toISOString() : null,
        },
        generatedAt: new Date().toISOString(),
        totals: summary,
        previous,
        series: timeline,
        ...routeStats,
        ...parts,
        recent: latest,
      };
    });
  });
}
