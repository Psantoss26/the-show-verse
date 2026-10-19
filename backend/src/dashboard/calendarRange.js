const DAY_MS = 86400000;

function midnightUtcFromYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

function ymdFromMs(ms) {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

export function parseCalendarRange({ start, days } = {}) {
  const clampedDays = Math.min(Math.max(Math.trunc(Number(days) || 1), 1), 62);
  let startMs = midnightUtcFromYmd(start);
  if (startMs == null) {
    // today at UTC midnight (Date.now is allowed at runtime; tests pass explicit start)
    const now = new Date();
    startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }
  const endMs = startMs + (clampedDays - 1) * DAY_MS;
  return { startDate: ymdFromMs(startMs), days: clampedDays, startMs, endMs };
}

export function withinRange(airDate, startMs, endMs) {
  const t = midnightUtcFromYmd(airDate);
  if (t == null) return false;
  return t >= startMs && t <= endMs;
}

// Varios rangos en una petición (`?ranges=2026-10-01:62,2026-12-01:62`): el
// Calendario pide su ventana a trozos de 62 días y, uno por petición, el backend
// repetía en cada uno la lectura de todas las series. Cada trozo se acota igual
// que un `start`/`days` suelto. Como mucho MAX_RANGES (los 12 trozos de la
// ventana más larga y el mes del panel lateral).
export const MAX_RANGES = 16;

export function parseCalendarRanges(raw) {
  return String(raw || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, MAX_RANGES)
    .map((part) => {
      const [start, days] = part.split(':');
      return parseCalendarRange({ start, days });
    });
}
