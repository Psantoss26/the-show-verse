// src/lib/streamingStats.js
// Resumen por plataforma de la detección de streaming, para saber dónde falla
// (sin base de datos, para poder probarlo aislado). Lo usan GET /streaming/stats
// (un usuario) y scripts/streaming-stats.js (todos).
//
// Las filas de entrada ya vienen agrupadas por SQL con su recuento:
//   - detecciones (streaming_detections): lo que el resolutor convirtió en un
//     título. Las corregidas son las que acertó mal;
//   - descartes (streaming_discards): lo que no pudo convertir, con su motivo.
// `successRate` = detecciones no corregidas / todas las observaciones. Es una
// cota superior: un error que nadie corrige cuenta como acierto.

const ORIGINS = ['browser', 'android'];

function emptyEntry() {
  return {
    detected: 0,
    corrected: 0,
    discarded: 0,
    discardedAttempts: 0,
    bySource: {},
    byConfidence: {},
    byReason: {},
    byOrigin: {},
    successRate: null,
  };
}

const bump = (map, key, n) => { map[key] = (map[key] || 0) + n; };
const originOf = (value) => (ORIGINS.includes(value) ? value : 'unknown');

function originEntry(entry, origin) {
  return (entry.byOrigin[origin] ||= { detected: 0, corrected: 0, discarded: 0 });
}

function finish(entry) {
  const observed = entry.detected + entry.discarded;
  entry.successRate = observed ? Math.round(((entry.detected - entry.corrected) / observed) * 1000) / 1000 : null;
  return entry;
}

/**
 * @param {{ detectionRows?: Array<{platform, origin?, status, source?, confidence?, count}>,
 *   discardRows?: Array<{platform, origin?, reason, count, attempts?}> }} rows
 * @returns {{ totals: object, platforms: Array<object> }} plataformas de más a menos observaciones
 */
export function summarizeStreaming({ detectionRows = [], discardRows = [] } = {}) {
  const totals = emptyEntry();
  const byPlatform = new Map();
  const entriesFor = (platform) => {
    const key = platform || 'unknown';
    if (!byPlatform.has(key)) byPlatform.set(key, { platform: key, ...emptyEntry() });
    return [totals, byPlatform.get(key)];
  };

  for (const row of detectionRows) {
    const n = Number(row.count) || 0;
    if (!n) continue;
    const corrected = row.status === 'corrected' ? n : 0;
    for (const entry of entriesFor(row.platform)) {
      entry.detected += n;
      entry.corrected += corrected;
      bump(entry.bySource, row.source || 'search', n);
      if (row.confidence) bump(entry.byConfidence, row.confidence, n);
      const origin = originEntry(entry, originOf(row.origin));
      origin.detected += n;
      origin.corrected += corrected;
    }
  }

  for (const row of discardRows) {
    const n = Number(row.count) || 0;
    if (!n) continue;
    for (const entry of entriesFor(row.platform)) {
      entry.discarded += n;
      entry.discardedAttempts += Number(row.attempts) || n;
      bump(entry.byReason, row.reason, n);
      originEntry(entry, originOf(row.origin)).discarded += n;
    }
  }

  const platforms = [...byPlatform.values()]
    .map(finish)
    .sort((a, b) => (b.detected + b.discarded) - (a.detected + a.discarded) || a.platform.localeCompare(b.platform));
  return { totals: finish(totals), platforms };
}
