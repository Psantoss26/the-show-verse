// Reglas puras de la sección de alertas del navbar (sin React ni navegador).
//
// "Leído" y "descartado" son estado de ESTE navegador (localStorage): son una
// comodidad de lectura, no datos de la cuenta. Las alertas en sí salen del
// servidor (/api/users/notifications) y se recalculan en cada petición.

const PREFIX = "showverse:alerts";

// Eventos de ventana entre la campana (AlertsMenu) y las ventanas emergentes
// (InAppNotifications): la campana avisa al cargar alertas y atiende peticiones
// de refresco.
export const ALERTS_LOADED_EVENT = "tsv:alerts-loaded";
export const ALERTS_REFRESH_EVENT = "tsv:alerts-refresh";

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

// A igualdad de fecha (p. ej. un visto automático, su "Has visto" y su
// recordatorio llevan la misma hora), primero lo que ha pasado solo, luego lo
// que hiciste y por último lo que te queda por hacer.
const KIND_ORDER = { event: 0, action: 1, reminder: 2 };

/**
 * Todas las alertas en UNA lista, de la más reciente a la más antigua. Antes iban
 * por secciones (novedades, recordatorios, actividad) y algo recién ocurrido
 * podía quedar debajo de alertas más viejas de otra sección.
 * Devuelve `[{ kind, item }]`.
 */
export function alertsTimeline(alerts) {
  const rows = [
    ...(alerts?.events || []).map((item) => ({ kind: "event", item })),
    ...(alerts?.actions || []).map((item) => ({ kind: "action", item })),
    ...(alerts?.reminders || []).map((item) => ({ kind: "reminder", item })),
  ];
  return rows.sort((a, b) => {
    const diff = time(b.item.createdAt) - time(a.item.createdAt);
    return diff !== 0 ? diff : KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });
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

// Logotipo cuadrado de cada plataforma (mismos ficheros de /public que el
// selector de Continuar viendo), a la derecha de la alerta.
const PLATFORM_ICONS = {
  netflix: "/netflix.png",
  primevideo: "/amazonprimevideo.png",
  prime: "/amazonprimevideo.png",
  amazon: "/amazonprimevideo.png",
  max: "/hbomax.png",
  hbomax: "/hbomax.png",
  disney: "/disney.png",
  disneyplus: "/disney.png",
  crunchyroll: "/crunchyroll.png",
  plex: "/plex.png",
  appletv: "/appletv.png",
  movistar: "/movistar.png",
};

export function platformIcon(platform) {
  const key = String(platform || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return PLATFORM_ICONS[key] || null;
}

/** Fecha de estreno futura ("12 dic 2027") o null si ya se estrenó. */
export function upcomingRelease(date, now = Date.now()) {
  const time = Date.parse(date || "");
  if (!Number.isFinite(time) || time <= now) return null;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(time);
}

/**
 * Alertas que merecen ventana emergente: novedades, recordatorios y actividad
 * propia (lo hecho desde OTRO dispositivo; lo de este ya se avisó al hacerlo,
 * y `skip` lo descarta) posteriores a `since` y aún no enseñadas. Agrupadas por
 * título, como las notificaciones push, de la más antigua a la más reciente.
 * Devuelve `[{ key, rows: [{ kind, item }] }]`.
 */
export function freshAlertGroups(alerts, { since, shown = new Set(), skip = () => false } = {}) {
  const from = time(since);
  const rows = [
    ...(alerts?.events || []).map((item) => ({ kind: "event", item })),
    ...(alerts?.actions || []).map((item) => ({ kind: "action", item })),
    ...(alerts?.reminders || []).map((item) => ({ kind: "reminder", item })),
  ].filter(({ kind, item }) =>
    item?.id && !shown.has(item.id) && time(item.createdAt) >= from && !(kind === "action" && skip(item)));

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.item.mediaType}:${Number(row.item.tmdbId)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups]
    .map(([key, group]) => ({
      key,
      rows: group.sort(
        (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || time(a.item.createdAt) - time(b.item.createdAt),
      ),
    }))
    .sort((a, b) => latest(a.rows) - latest(b.rows));
}

function shortCode(item) {
  if (item?.season == null || item?.episode == null) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `S${pad(item.season)}E${pad(item.episode)}`;
}

// Frase de cada alerta SIN el título (el aviso lo pone aparte), con los mismos
// textos que las notificaciones push (backend/src/lib/pushMessages.js).
function alertSentence({ kind, item }) {
  const code = shortCode(item);
  if (kind === "reminder") {
    if (!item.needsRating) return "Escribe tu reseña";
    const verb = item.needsReview ? "Puntúa y reseña" : "Puntúa";
    if (code) return `${verb} el episodio ${code}`;
    if (item.season != null) return `${verb} la temporada ${item.season}`;
    return `${verb} ${item.mediaType === "tv" ? "la serie" : "la película"}`;
  }
  if (kind === "event") {
    if (item.type === "cw_added") {
      const platform = platformLabel(item.platform);
      return `${code ? `${code} añadido` : "Añadida"} a Continuar viendo${platform ? ` · ${platform}` : ""}`;
    }
    if (item.type === "auto_watched") return code ? `Has terminado ${code}` : "Has terminado la película";
    if (item.type === "show_completed") return "Has completado la serie";
    if (item.type === "collection_next") {
      return item.afterTitle ? `Siguiente de la saga después de ${item.afterTitle}` : "Siguiente de la saga";
    }
    return null;
  }
  if (item.type === "rating") {
    return typeof item.rating === "number" ? `Has puntuado con un ${item.rating}/10` : "Has puntuado";
  }
  if (item.type === "watchlist") return "Añadida a Pendientes";
  if (item.type === "favorite") return "Añadida a Favoritas";
  if (item.completedShow) return "Has completado la serie";
  return code ? `Has visto ${code}` : "Marcado como visto";
}

// Icono y rótulo del aviso según la alerta principal del grupo.
const ALERT_LOOK = {
  cw_added: { icon: "progress", label: "Continuar viendo" },
  auto_watched: { icon: "autoWatched", label: "Visto" },
  show_completed: { icon: "completed", label: "Serie completada" },
  collection_next: { icon: "saga", label: "Saga" },
  watched: { icon: "watched", label: "Visto" },
  rating: { icon: "rate", label: "Nota" },
  watchlist: { icon: "watchlist", label: "Pendientes" },
  favorite: { icon: "favorite", label: "Favoritas" },
  reminder: { icon: "reminder", label: "Recordatorio" },
  reminderReview: { icon: "reminderReview", label: "Recordatorio" },
};

/** Icono y rótulo para un tipo de alerta (también el `type` de un push). */
export function alertLook(type) {
  return ALERT_LOOK[type] || { icon: "bell", label: "Aviso" };
}

/**
 * Contenido del aviso para un grupo de `freshAlertGroups`:
 * `{ icon, label, title, text, posterPath, target }` (`target`: la alerta a la
 * que lleva tocarlo; el recordatorio si lo hay, para puntuar directamente).
 */
export function describeAlertGroup(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const primary = list[0];
  if (!primary) return null;
  const look = alertLook(
    primary.kind === "reminder" ? (primary.item.needsRating ? "reminder" : "reminderReview") : primary.item.type,
  );
  return {
    ...look,
    title: list.find((row) => row.item.title)?.item.title || null,
    text: list.map(alertSentence).filter(Boolean).join(". "),
    posterPath: list.find((row) => row.item.posterPath)?.item.posterPath || null,
    target: list.find((row) => row.kind === "reminder")?.item || list[list.length - 1].item,
  };
}

function latest(rows) {
  return Math.max(...rows.map(({ item }) => time(item.createdAt)));
}
