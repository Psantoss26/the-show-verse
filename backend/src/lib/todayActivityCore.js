// src/lib/todayActivityCore.js
// Parte pura de la página Hoy (todayActivity.js hace las consultas): rangos de
// día en la zona horaria del usuario, normalización de filas a acciones, hitos
// de episodio y recuentos por día. Las historias, los destacados y el ranking
// se calculan en el cliente (src/lib/today), como hace Trakt: así cambiar de
// agrupación no vuelve a pedir nada.

import { countByInstant, isRealInstant, time } from './realActivityInstant.js';

export const TODAY_SCOPES = ['following', 'community'];
export const TODAY_DEFAULT_TZ = 'Europe/Madrid';
// Días que caben en la pestaña Semana (hoy móvil + 6 días anteriores).
export const TODAY_WEEK_DAYS = 7;
// Cuánto se puede mirar atrás con ?day=YYYY-MM-DD.
export const TODAY_MAX_DAYS_BACK = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeScope(value) {
  return TODAY_SCOPES.includes(value) ? value : 'following';
}

export function safeTimeZone(tz) {
  if (!tz) return TODAY_DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return TODAY_DEFAULT_TZ;
  }
}

const partsFormatters = new Map();
function partsFormatter(tz) {
  if (!partsFormatters.has(tz)) {
    partsFormatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }));
  }
  return partsFormatters.get(tz);
}

function zonedParts(ms, tz) {
  const out = {};
  for (const part of partsFormatter(tz).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out;
}

// Desfase (ms) de la zona respecto a UTC en ese instante.
function offsetAt(ms, tz) {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** Fecha local 'YYYY-MM-DD' de un instante en la zona dada. */
export function localDayKey(ms, tz) {
  const p = zonedParts(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Hora local (0–23) de un instante en la zona dada. */
export function localHour(ms, tz) {
  return zonedParts(ms, tz).hour;
}

export function addDays(dayKey, delta) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

/** Instante UTC de la medianoche local de `dayKey` en la zona (respeta el cambio de hora). */
export function zonedMidnight(dayKey, tz) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let ms = guess - offsetAt(guess, tz);
  // Segunda pasada: si entre medias hubo cambio de hora el desfase es otro.
  ms = guess - offsetAt(ms, tz);
  return ms;
}

/**
 * Ventanas de las pestañas: «hoy» son las últimas 24 h (como Trakt: a las 9 de
 * la mañana no estaría vacío) y cada día anterior va de medianoche a medianoche
 * locales. La Semana es la unión de las 7.
 */
export function todayDays(nowMs, tz) {
  const todayKey = localDayKey(nowMs, tz);
  // Fin exclusivo en todas las ventanas: el de hoy es justo después de ahora.
  const days = [{ key: 'today', startAt: nowMs - DAY_MS, endAt: nowMs + 1 }];
  for (let i = 1; i < TODAY_WEEK_DAYS; i += 1) {
    const key = addDays(todayKey, -i);
    days.push({ key, startAt: zonedMidnight(key, tz), endAt: zonedMidnight(addDays(key, 1), tz) });
  }
  return days;
}

/**
 * Rango pedido con ?day=. Devuelve null si es inválido o está fuera del límite.
 * `yesterday` se resuelve al día local anterior.
 */
export function resolveTodayRange(day, nowMs, tz) {
  const todayKey = localDayKey(nowMs, tz);
  const value = day || 'today';
  if (value === 'today') return { day: 'today', startAt: nowMs - DAY_MS, endAt: nowMs + 1 };
  if (value === 'week') {
    return { day: 'week', startAt: zonedMidnight(addDays(todayKey, -(TODAY_WEEK_DAYS - 1)), tz), endAt: nowMs + 1 };
  }
  const key = value === 'yesterday' ? addDays(todayKey, -1) : value;
  if (!DAY_KEY_RE.test(key) || Number.isNaN(Date.parse(`${key}T00:00:00Z`))) return null;
  if (key >= todayKey || key < addDays(todayKey, -TODAY_MAX_DAYS_BACK)) return null;
  return { day: key, startAt: zonedMidnight(key, tz), endAt: zonedMidnight(addDays(key, 1), tz) };
}

const MILESTONE_RANK = { season_premiere: 1, season_finale: 2, series_premiere: 3, series_finale: 4 };

export function milestoneRank(milestone) {
  return MILESTONE_RANK[milestone] || 0;
}

/**
 * Hito de un episodio a partir de la ficha de la serie en tmdb_cache. TMDb
 * marca el último emitido con `episode_type: 'finale'`; para el resto se usa
 * el número de episodios de su temporada.
 */
export function episodeMilestone(season, episode, showMeta) {
  const s = Number(season);
  const e = Number(episode);
  if (!(s > 0) || !(e > 0)) return null;
  if (s === 1 && e === 1) return 'series_premiere';
  if (e === 1) return 'season_premiere';

  const seasons = Array.isArray(showMeta?.seasons) ? showMeta.seasons : [];
  const lastSeason = Math.max(0, ...seasons.map((x) => Number(x?.season_number) || 0));
  const ended = ['Ended', 'Canceled'].includes(showMeta?.status);
  const last = showMeta?.last_episode_to_air;
  const isLastAired = Number(last?.season_number) === s && Number(last?.episode_number) === e;
  const seasonCount = Number(seasons.find((x) => Number(x?.season_number) === s)?.episode_count) || 0;
  const isFinale = (isLastAired && last?.episode_type === 'finale') || (seasonCount > 0 && e === seasonCount);
  if (!isFinale) return null;
  return ended && s === lastSeason ? 'series_finale' : 'season_finale';
}

/**
 * Filas de las tres fuentes → acciones de Hoy. Descarta las fechas falsas de
 * importación (ver realActivityInstant) y las "series completas" marcadas de
 * golpe (activity_group), que no son visionados de ese día.
 *
 * @param {object} input
 * @param {Array} input.watches   [{ id, userId, tmdbId, mediaType, season, episode, activityGroup, at, same }]
 * @param {Array} input.ratings   [{ id, userId, tmdbId, mediaType, season, episode, rating, at, same }]
 * @param {Array} input.comments  [{ id, userId, tmdbId, mediaType, body, spoiler, likes, at }]
 */
export function buildTodayActions({ watches = [], ratings = [], comments = [] } = {}) {
  const actions = [];

  const watchCount = countByInstant(watches);
  for (const row of watches) {
    if (row.activityGroup) continue;
    if (!isRealInstant(row.at, watchCount(row))) continue;
    const isEpisode = row.mediaType === 'tv' && row.season != null && row.episode != null;
    actions.push({
      key: `watch:${row.id}`,
      kind: 'watch',
      userId: row.userId,
      activityAt: new Date(row.at).toISOString(),
      mediaType: row.mediaType === 'tv' ? 'tv' : 'movie',
      tmdbId: Number(row.tmdbId),
      target: isEpisode ? 'episode' : row.mediaType === 'tv' ? 'show' : 'movie',
      season: isEpisode ? Number(row.season) : null,
      episode: isEpisode ? Number(row.episode) : null,
    });
  }

  const ratingCount = countByInstant(ratings);
  for (const row of ratings) {
    if (!isRealInstant(row.at, ratingCount(row))) continue;
    const target = row.mediaType === 'tv' ? 'show' : row.mediaType;
    actions.push({
      key: `rating:${row.id}`,
      kind: 'rating',
      userId: row.userId,
      activityAt: new Date(row.at).toISOString(),
      mediaType: row.mediaType === 'movie' ? 'movie' : 'tv',
      tmdbId: Number(row.tmdbId),
      target,
      season: row.season != null ? Number(row.season) : null,
      episode: row.episode != null ? Number(row.episode) : null,
      rating: Number(row.rating),
    });
  }

  // Las reseñas se escriben a mano en la app: su fecha siempre es real.
  for (const row of comments) {
    if (!row.body || !time(row.at)) continue;
    actions.push({
      key: `comment:${row.id}`,
      kind: 'comment',
      userId: row.userId,
      activityAt: new Date(row.at).toISOString(),
      mediaType: row.mediaType === 'tv' ? 'tv' : 'movie',
      tmdbId: Number(row.tmdbId),
      target: row.mediaType === 'tv' ? 'show' : 'movie',
      season: null,
      episode: null,
      comment: {
        id: row.id,
        body: String(row.body),
        spoiler: Boolean(row.spoiler),
        likes: Number(row.likes) || 0,
      },
    });
  }

  actions.sort((a, b) => time(b.activityAt) - time(a.activityAt));
  return actions;
}

/** Acciones por pestaña de día (las ventanas pueden solaparse: hoy móvil y ayer). */
export function countActionsByDay(actions, days) {
  return days.map((day) => ({
    ...day,
    count: actions.filter((a) => {
      const t = time(a.activityAt);
      return t >= day.startAt && t < day.endAt;
    }).length,
  }));
}

export function actionsInRange(actions, range) {
  return actions.filter((a) => {
    const t = time(a.activityAt);
    return t >= range.startAt && t < range.endAt;
  });
}
