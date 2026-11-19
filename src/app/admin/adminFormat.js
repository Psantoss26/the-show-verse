// Formato y cálculos de las estadísticas del administrador (puro, con tests).
// Cifras en español (coma decimal) y fechas en hora de Madrid, la misma zona
// con la que el backend corta los días (STATS_TIME_ZONE).

export const RANGES = [
  { key: "1h", label: "1 h", long: "la última hora" },
  { key: "24h", label: "24 h", long: "las últimas 24 horas" },
  { key: "7d", label: "7 días", long: "los últimos 7 días" },
  { key: "30d", label: "30 días", long: "los últimos 30 días" },
];

export const TIME_ZONE = "Europe/Madrid";

// Espacio duro entre cifra y unidad: «12 ms» nunca se parte en dos líneas.
const NB = " ";
const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 });

const toNum = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function formatCount(value) {
  return nf0.format(toNum(value));
}

export function formatCompact(value) {
  const n = toNum(value);
  return n < 10000 ? nf0.format(n) : compact.format(n).replace(/\s/g, NB);
}

export function formatMs(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const ms = Number(value);
  if (ms < 1000) return `${Math.round(ms)}${NB}ms`;
  const s = ms / 1000;
  return `${(s >= 10 ? nf0 : nf1).format(s)}${NB}s`;
}

/** Proporción part/total, o null si no hay total (nada que dividir). */
export function rate(part, total) {
  const t = toNum(total);
  return t ? toNum(part) / t : null;
}

function percentText(pct) {
  const abs = Math.abs(pct);
  return `${(abs > 0 && abs < 10 ? nf1 : nf0).format(abs)}${NB}%`;
}

export function formatPercent(part, total) {
  const r = rate(part, total);
  return percentText(r == null ? 0 : r * 100);
}

/**
 * Cambio frente al periodo anterior. null si no hay con qué comparar;
 * «new» si antes no había nada; si no, el porcentaje y su sentido
 * (por debajo de medio punto cuenta como estable).
 */
export function compareToPrevious(current, previous) {
  if (previous == null || !Number.isFinite(Number(previous))) return null;
  const cur = toNum(current);
  const prev = Number(previous);
  if (!prev) return cur ? { kind: "new" } : null;
  const pct = ((cur - prev) / prev) * 100;
  const direction = Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
  return { kind: "change", pct, direction };
}

export function formatDelta(cmp) {
  if (!cmp) return "";
  if (cmp.kind === "new") return "nuevo";
  if (cmp.direction === "flat") return `=${NB}0${NB}%`;
  return `${cmp.pct > 0 ? "+" : "−"}${percentText(cmp.pct)}`;
}

/** good / bad / neutral según si subir es bueno ("up-good") o malo ("up-bad"). */
export function deltaTone(cmp, polarity = "up-good") {
  if (!cmp || cmp.kind !== "change" || cmp.direction === "flat" || polarity === "neutral") return "neutral";
  const up = cmp.direction === "up";
  return (polarity === "up-good") === up ? "good" : "bad";
}

export function statusTone(status) {
  const s = toNum(status);
  if (s >= 500) return "server";
  if (s >= 400) return "client";
  if (s >= 300) return "redirect";
  return "ok";
}

const FAMILY_ORDER = ["1xx", "2xx", "3xx", "4xx", "5xx"];

/** Códigos agrupados en familias (2xx, 4xx…), cada una con sus códigos de más a menos. */
export function statusFamilies(rows) {
  const families = new Map();
  for (const row of rows || []) {
    const status = toNum(row.status);
    const count = toNum(row.count);
    if (!status) continue;
    const family = `${Math.floor(status / 100)}xx`;
    const entry = families.get(family) || { family, tone: statusTone(status), count: 0, codes: [] };
    entry.count += count;
    entry.codes.push({ status, count });
    families.set(family, entry);
  }
  return [...families.values()]
    .sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family))
    .map((f) => ({ ...f, codes: f.codes.sort((a, b) => b.count - a.count) }));
}

const fmtDay = new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, day: "numeric", month: "short" });
const fmtTime = new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const fmtWeekday = new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, weekday: "short" });
const fmtWeekdayLong = new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, weekday: "long" });
const fmtFull = new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "medium" });

const clean = (s) => s.replace(/\./g, "");

function parse(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Etiqueta corta del eje X según el tamaño del tramo. */
export function bucketLabel(iso, bucket) {
  const d = parse(iso);
  if (!d) return "";
  if (bucket === "day") return clean(fmtDay.format(d));
  if (bucket === "minute") return fmtTime.format(d);
  return `${clean(fmtWeekday.format(d))} ${fmtTime.format(d)}`;
}

/** Etiqueta completa del tramo para el tooltip. */
export function tooltipLabel(iso, bucket) {
  const d = parse(iso);
  if (!d) return "";
  if (bucket === "day") return `${fmtWeekdayLong.format(d)}, ${clean(fmtDay.format(d))}`;
  if (bucket === "minute") return fmtTime.format(d);
  const end = new Date(d.getTime() + 3600000);
  return `${clean(fmtWeekday.format(d))} ${clean(fmtDay.format(d))} · ${fmtTime.format(d)}–${fmtTime.format(end)}`;
}

export function formatDateTime(iso) {
  const d = parse(iso);
  return d ? fmtFull.format(d) : "";
}

/** «ahora», «hace 3 min», «hace 2 h», «hace 4 d». */
export function timeAgo(iso, now = Date.now()) {
  const d = parse(iso);
  if (!d) return "";
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export const RECENT_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "errors", label: "Errores" },
  { key: "users", label: "Con sesión" },
  { key: "anonymous", label: "Sin sesión" },
];

export function filterRecent(rows, filter) {
  const list = rows || [];
  if (filter === "errors") return list.filter((r) => toNum(r.status) >= 400);
  if (filter === "users") return list.filter((r) => r.userId);
  if (filter === "anonymous") return list.filter((r) => !r.userId);
  return list;
}

/** Bandera emoji a partir del código ISO de dos letras de Cloudflare. */
export function countryFlag(code) {
  const c = String(code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === "XX" || c === "T1") return "🌐";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));
}

const regionNames = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["es"], { type: "region" })
  : null;

export function countryName(code) {
  const c = String(code || "").toUpperCase();
  if (c === "T1") return "Tor";
  if (!/^[A-Z]{2}$/.test(c) || c === "XX") return "Desconocido";
  try {
    return regionNames?.of(c) || c;
  } catch {
    return c;
  }
}
