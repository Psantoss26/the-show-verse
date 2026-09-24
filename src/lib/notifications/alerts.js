// Reglas puras de la sección de alertas del navbar (sin React ni navegador).
//
// "Leído" y "descartado" son estado de ESTE navegador (localStorage): son una
// comodidad de lectura, no datos de la cuenta. Las alertas en sí salen del
// servidor (/api/users/notifications) y se recalculan en cada petición.

const PREFIX = "showverse:alerts";

export const alertsLastSeenKey = (accountId) => `${PREFIX}:lastSeen:${accountId}`;
export const alertsDismissedKey = (accountId) => `${PREFIX}:dismissed:${accountId}`;
export const alertsUnreadKey = (accountId) => `${PREFIX}:unread:${accountId}`;

// Tope de recordatorios descartados que se recuerdan: los recordatorios caducan
// en el servidor (ventana de días), así que los más antiguos ya no aparecen.
const DISMISSED_MAX = 200;

function time(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Deja la respuesta del servidor con la forma esperada y sin descartados. */
export function normalizeAlerts(json, dismissed = new Set()) {
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    reminders: list(json?.reminders).filter((item) => !dismissed.has(item.id)),
    events: list(json?.events),
    actions: list(json?.actions),
  };
}

/** Nº de alertas posteriores a la última vez que se abrió el desplegable. */
export function countUnread(alerts, lastSeenAt) {
  const since = time(lastSeenAt);
  return [...alerts.reminders, ...alerts.events, ...alerts.actions].filter(
    (item) => time(item.createdAt) > since,
  ).length;
}

/** Añade un descartado conservando solo los más recientes. */
export function addDismissed(list, id) {
  const next = (Array.isArray(list) ? list : []).filter((value) => value !== id);
  next.push(id);
  return next.slice(-DISMISSED_MAX);
}

/** "S01E03 de " para episodios, como en la Actividad del perfil. */
export function episodeCode(item) {
  if (item?.season == null || item?.episode == null) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `S${pad(item.season)}E${pad(item.episode)} de `;
}

// Mismo formato que la Actividad del perfil: relativo la primera semana y fecha
// a partir de ahí.
export function relativeTime(value, now = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.floor(Math.max(0, now - date.getTime()) / 60_000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(date);
}

// Nombre legible de la plataforma de un progreso sincronizado. Los clientes
// mandan ids cortos (extensión: "netflix", "primevideo"…; Android: el mismo id
// o el paquete). Lo que no se reconoce no se muestra.
const PLATFORM_LABELS = {
  netflix: "Netflix",
  primevideo: "Prime Video",
  prime: "Prime Video",
  amazon: "Prime Video",
  max: "Max",
  hbomax: "Max",
  disney: "Disney+",
  disneyplus: "Disney+",
  crunchyroll: "Crunchyroll",
  plex: "Plex",
  appletv: "Apple TV+",
  movistar: "Movistar+",
  filmin: "Filmin",
  skyshowtime: "SkyShowtime",
};

export function platformLabel(platform) {
  const key = String(platform || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return PLATFORM_LABELS[key] || null;
}

/** Fecha de estreno futura ("12 dic 2027") o null si ya se estrenó. */
export function upcomingRelease(date, now = Date.now()) {
  const time = Date.parse(date || "");
  if (!Number.isFinite(time) || time <= now) return null;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(time);
}
