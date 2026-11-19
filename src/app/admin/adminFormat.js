// Formato de las estadísticas del administrador (puro, con tests).

export const RANGES = [
  { key: "1h", label: "1 h" },
  { key: "24h", label: "24 h" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
];

const nf = new Intl.NumberFormat("es-ES");

export function formatCount(value) {
  return nf.format(Number(value) || 0);
}

export function formatMs(value) {
  const ms = Number(value) || 0;
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`;
}

export function formatPercent(part, total) {
  const t = Number(total) || 0;
  if (!t) return "0 %";
  const pct = ((Number(part) || 0) / t) * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)} %`;
}

/** Etiqueta del eje X según el tamaño del tramo de la serie. */
export function bucketLabel(iso, bucket) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (bucket === "day") return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  if (bucket === "minute") return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("es-ES", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/** «hace 3 min», «hace 2 h», «hace 4 d». */
export function timeAgo(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export function statusTone(status) {
  const s = Number(status) || 0;
  if (s >= 500) return "text-red-400";
  if (s >= 400) return "text-amber-300";
  if (s >= 300) return "text-sky-300";
  return "text-emerald-300";
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
  if (!/^[A-Z]{2}$/.test(c)) return "Desconocido";
  if (c === "XX") return "Desconocido";
  try {
    return regionNames?.of(c) || c;
  } catch {
    return c;
  }
}
