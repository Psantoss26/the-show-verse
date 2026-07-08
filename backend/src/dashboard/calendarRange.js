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
