// backend/src/lib/adminStats.js
// Partes puras de las estadísticas del administrador (/v1/admin/stats):
// rangos de tiempo, tipo de cliente según el navegador y resúmenes por ruta.

export const STATS_RANGES = {
  '1h': { interval: '1 hour', bucket: 'minute' },
  '24h': { interval: '24 hours', bucket: 'hour' },
  '7d': { interval: '7 days', bucket: 'hour' },
  '30d': { interval: '30 days', bucket: 'day' },
};

export function parseStatsRange(value) {
  const key = String(value || '24h');
  return Object.hasOwn(STATS_RANGES, key) ? { key, ...STATS_RANGES[key] } : { key: '24h', ...STATS_RANGES['24h'] };
}

const BOT_RE = /bot|crawl|spider|slurp|curl|wget|python-requests|httpclient|go-http|scrapy|headless|uptime|monitor/i;

/** Tipo de cliente a partir del navegador reenviado por la web. */
export function clientKind(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'Desconocido';
  if (BOT_RE.test(ua)) return 'Bots y scripts';
  if (/okhttp|Dalvik|ShowVerseSync/i.test(ua)) return 'App Android';
  if (/^node$|undici|node-fetch/i.test(ua)) return 'Servidor';
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return 'Navegador móvil';
  if (/Mozilla\//.test(ua)) return 'Navegador de escritorio';
  return 'Otros';
}

/** Suma filas {user_agent, count} por tipo de cliente, de más a menos. */
export function summarizeClients(rows) {
  const totals = new Map();
  for (const row of rows || []) {
    const kind = clientKind(row.user_agent);
    totals.set(kind, (totals.get(kind) || 0) + Number(row.count || 0));
  }
  return [...totals.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count);
}

function toRoute(row) {
  return {
    method: row.method,
    route: row.route,
    count: Number(row.count) || 0,
    avgMs: Number(row.avg_ms) || 0,
    p95Ms: Number(row.p95_ms) || 0,
    errors4xx: Number(row.errors_4xx) || 0,
    errors5xx: Number(row.errors_5xx) || 0,
  };
}

/**
 * De las filas por ruta: las más pedidas, las más lentas (p95, con un mínimo
 * de peticiones para que una sola lenta no las tape) y las que más fallan.
 */
export function summarizeRoutes(rows, { top = 15, slow = 10, minForSlow = 5 } = {}) {
  const routes = (rows || []).map(toRoute);
  return {
    topRoutes: [...routes].sort((a, b) => b.count - a.count).slice(0, top),
    slowRoutes: routes
      .filter((r) => r.count >= minForSlow)
      .sort((a, b) => b.p95Ms - a.p95Ms)
      .slice(0, slow),
    errorRoutes: routes
      .filter((r) => r.errors4xx + r.errors5xx > 0)
      .sort((a, b) => (b.errors5xx - a.errors5xx) || (b.errors4xx - a.errors4xx))
      .slice(0, slow),
  };
}
