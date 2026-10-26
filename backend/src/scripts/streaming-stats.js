// Resumen por plataforma de la detección de streaming de TODOS los usuarios:
// cuántas observaciones se resolvieron, cuántas hubo que corregir y cuántas se
// descartaron y por qué. Es la medición de base para saber qué plataforma falla
// más (ver docs/features/detecciones-streaming.md). Solo lee.
//
// Uso:
//   npm run streaming:stats
//   npm run streaming:stats -- --days 30 --origin android
//   npm run streaming:stats -- --json

import { closeDb, db } from '../db/client.js';
import { streamingStats } from '../routes/streamingDetections.js';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const days = Math.min(30, Math.max(1, Number.parseInt(option('--days') || '7', 10) || 7));
const origin = ['browser', 'android'].includes(option('--origin')) ? option('--origin') : 'all';
const since = new Date(Date.now() - days * 86_400_000);

const summary = await streamingStats(db, { since, origin });
await closeDb();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ days, origin, ...summary }, null, 2));
  process.exit(0);
}

const pct = (value) => (value == null ? '—' : `${Math.round(value * 100)} %`);
const parts = (map) => Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
const row = (p) => ({
  plataforma: p.platform,
  resueltas: p.detected,
  corregidas: p.corrected,
  descartadas: p.discarded,
  acierto: pct(p.successRate),
  motivos: parts(p.byReason),
  vía: parts(p.bySource),
});

console.log(`Detección de streaming, últimos ${days} días (${origin === 'all' ? 'todos los clientes' : origin}):\n`);
if (!summary.platforms.length) {
  console.log('Sin observaciones en el periodo.');
} else {
  console.table([...summary.platforms.map(row), row({ ...summary.totals, platform: 'TOTAL' })]);
}
