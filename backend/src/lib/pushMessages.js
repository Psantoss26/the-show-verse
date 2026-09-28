// src/lib/pushMessages.js
// Reglas PURAS de las notificaciones push (sin BD ni red): qué alertas se
// avisan en el dispositivo y con qué texto. Las alertas salen de
// getUserNotifications (notifications.js), así que el push y la campana del
// navbar cuentan siempre lo mismo.

// Solo se avisa de lo recién ocurrido: una alerta que ya tenía un rato cuando
// se calcula (p. ej. una suscripción nueva) no debe llegar como si fuera nueva.
export const PUSH_FRESH_MS = 15 * 60 * 1000;

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';

// Mismos nombres que la campana (src/lib/notifications/alerts.js).
const PLATFORM_LABELS = {
  netflix: 'Netflix',
  primevideo: 'Prime Video',
  prime: 'Prime Video',
  amazon: 'Prime Video',
  max: 'Max',
  hbomax: 'Max',
  disney: 'Disney+',
  disneyplus: 'Disney+',
  crunchyroll: 'Crunchyroll',
  plex: 'Plex',
  appletv: 'Apple TV+',
  movistar: 'Movistar+',
  filmin: 'Filmin',
  skyshowtime: 'SkyShowtime',
};

function platformLabel(platform) {
  const key = String(platform || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return PLATFORM_LABELS[key] || null;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function episodeCode(item) {
  if (item?.season == null || item?.episode == null) return null;
  return `S${pad(item.season)}E${pad(item.episode)}`;
}

/** Ficha a la que lleva la alerta. Mismo criterio que getActivityDetailsHref. */
export function alertUrl(item) {
  const id = Number(item?.tmdbId);
  if (!Number.isInteger(id) || id <= 0) return '/';
  if (item.mediaType === 'tv' && item.season != null && item.episode != null) {
    return `/details/tv/${id}/season/${item.season}/episode/${item.episode}`;
  }
  if (item.mediaType === 'tv' && item.season != null) return `/details/tv/${id}/season/${item.season}`;
  return `/details/${item.mediaType === 'tv' ? 'tv' : 'movie'}/${id}`;
}

function reminderText(item) {
  if (!item.needsRating) return 'Escribe tu reseña';
  const verb = item.needsReview ? 'Puntúa y reseña' : 'Puntúa';
  if (item.level === 'episode' || (item.season != null && item.episode != null)) {
    return `${verb} el episodio ${episodeCode(item)}`;
  }
  if (item.level === 'season' || item.season != null) return `${verb} la temporada ${item.season}`;
  return `${verb} ${item.mediaType === 'tv' ? 'la serie' : 'la película'}`;
}

function eventText(item) {
  const code = episodeCode(item);
  switch (item.type) {
    case 'cw_added': {
      const platform = platformLabel(item.platform);
      return `${code ? `${code} se ha añadido` : 'Añadida'} a Continuar viendo${platform ? ` · ${platform}` : ''}`;
    }
    case 'auto_watched':
      return code ? `Has terminado ${code}` : 'Has terminado la película';
    case 'show_completed':
      return 'Has completado la serie';
    case 'collection_next':
      return item.afterTitle ? `Siguiente de la saga después de ${item.afterTitle}` : 'Siguiente de la saga';
    default:
      return null;
  }
}

function time(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Notificaciones a enviar para las alertas RECIENTES. Las del mismo título se
 * juntan en una sola ("Has terminado S01E03. Puntúa el episodio S01E03"), para
 * que terminar algo no dispare dos avisos seguidos. La actividad propia
 * ("Has visto…") no se avisa: ya la cubre el recordatorio de puntuar.
 *
 * `delivered`: ids ya enviados, que no se repiten ni dentro de un grupo.
 *
 * @returns {Array<{ alertIds: string[], title: string, body: string,
 *   url: string, image: string|null, tag: string }>}
 *   de la más antigua a la más reciente.
 */
export function buildPushMessages(
  notifications,
  { now = Date.now(), freshMs = PUSH_FRESH_MS, delivered = new Set() } = {},
) {
  const alerts = [
    ...(notifications?.events || []).map((item) => ({ item, text: eventText(item), reminder: false })),
    ...(notifications?.reminders || []).map((item) => ({ item, text: reminderText(item), reminder: true })),
  ].filter(({ item, text }) =>
    text && item?.id && !delivered.has(item.id) && now - time(item.createdAt) <= freshMs);

  const groups = new Map();
  for (const alert of alerts) {
    const key = `${alert.item.mediaType}:${Number(alert.item.tmdbId)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(alert);
  }

  const messages = [];
  for (const [key, group] of groups) {
    // Lo que pasó primero, primero; el recordatorio (lo que queda por hacer), al final.
    group.sort((a, b) => Number(a.reminder) - Number(b.reminder) || time(a.item.createdAt) - time(b.item.createdAt));
    const target = group.find((alert) => alert.reminder)?.item || group[group.length - 1].item;
    const withPoster = group.find((alert) => alert.item.posterPath)?.item;
    messages.push({
      alertIds: group.map((alert) => alert.item.id),
      title: group.find((alert) => alert.item.title)?.item.title || 'The Show Verse',
      body: group.map((alert) => alert.text).join('. '),
      url: alertUrl(target),
      image: withPoster ? `${POSTER_BASE}${withPoster.posterPath}` : null,
      tag: `tsv:${key}`,
      createdAt: new Date(Math.max(...group.map((alert) => time(alert.item.createdAt)))).toISOString(),
    });
  }
  return messages.sort((a, b) => time(a.createdAt) - time(b.createdAt));
}
