// src/lib/socialBotsCore.js
// Parte pura de los usuarios automáticos (socialBots.js hace las consultas):
// quiénes son, cuándo actúan cada día y qué eligen ver, puntuar o reseñar.
//
// Cada cuenta tiene un plan por día DETERMINISTA (semilla = cuenta + día): un
// reinicio del servidor no cambia los horarios ni duplica acciones, solo pone
// al día las que tocaban mientras estaba parado. Las cuentas no tienen
// contraseña ni un correo real: nadie puede iniciar sesión con ellas.

import { addDays, localDayKey, zonedMidnight } from './todayActivityCore.js';

export const BOT_TZ = 'Europe/Madrid';
export const BOT_EMAIL_DOMAIN = 'theshowverse.invalid';
export const botEmail = (handle) => `bot+${handle}@${BOT_EMAIL_DOMAIN}`;
export const BOT_EMAIL_PATTERN = `bot+%@${BOT_EMAIL_DOMAIN}`;

// Franja en la que actúan (hora local): nadie marca vistos a las 4 de la mañana.
const ACTIVE_FROM_MIN = 9 * 60 + 30;
const ACTIVE_TO_MIN = 23 * 60 + 45;

// Cuántos días atrás cuenta como «estreno» al elegir qué ver.
export const MOVIE_RECENT_DAYS = 60;
export const SHOW_PREMIERE_DAYS = 30;
// Episodios emitidos en los últimos días (el pool del calendario guarda 2).
export const EPISODE_RECENT_DAYS = 2;
// Votos mínimos en TMDb: los pools de estrenos traen mucho título minoritario.
export const MOVIE_MIN_VOTES = 50;
export const PREMIERE_MIN_VOTES = 20;

// Gustos de cada cuenta. `movieShare`: probabilidad de que una sesión sea de
// cine; `bias`: cuánto se aparta su nota de la pública; `genres`: géneros de
// TMDb que prefiere (pesan el doble al elegir).
export const BOTS = [
  {
    handle: 'nachocinefilo', displayName: 'Nacho Molina', bio: 'Cine en pantalla grande siempre que puedo.',
    movieShare: 0.75, bias: -0.3, rateChance: 0.8, reviewChance: 0.25, favoriteChance: 0.3, watchlistChance: 0.2,
    genres: [18, 80, 53, 878, 9648], actions: [2, 4],
  },
  {
    handle: 'martaseries', displayName: 'Marta Iglesias', bio: 'Una serie nueva cada semana. O tres.',
    movieShare: 0.2, bias: 0.2, rateChance: 0.6, reviewChance: 0.12, favoriteChance: 0.25, watchlistChance: 0.25,
    genres: [18, 9648, 80, 10765, 35], actions: [3, 5],
  },
  {
    handle: 'alexsofa', displayName: 'Álex Prieto', bio: 'Comedia, acción y palomitas.',
    movieShare: 0.55, bias: 0.4, rateChance: 0.55, reviewChance: 0.1, favoriteChance: 0.2, watchlistChance: 0.2,
    genres: [35, 28, 12, 10759, 16], actions: [2, 4],
  },
  {
    handle: 'irene_maraton', displayName: 'Irene Campos', bio: 'Si empieza bien, me la veo de un tirón.',
    movieShare: 0.3, bias: 0.1, rateChance: 0.65, reviewChance: 0.15, favoriteChance: 0.3, watchlistChance: 0.15,
    genres: [10765, 18, 9648, 10759, 14], actions: [3, 5],
  },
  {
    handle: 'pauvos', displayName: 'Pau Serra', bio: 'Todo en versión original.',
    movieShare: 0.6, bias: -0.1, rateChance: 0.7, reviewChance: 0.18, favoriteChance: 0.2, watchlistChance: 0.25,
    genres: [18, 10749, 36, 99, 9648], actions: [2, 4],
  },
  {
    handle: 'jorgecritico', displayName: 'Jorge Vidal', bio: 'Exigente con las notas, generoso con las recomendaciones.',
    movieShare: 0.5, bias: -0.7, rateChance: 0.9, reviewChance: 0.3, favoriteChance: 0.12, watchlistChance: 0.2,
    genres: [878, 27, 53, 18, 80], actions: [2, 5],
  },
];

// Seguimientos entre ellas al crearlas (nunca siguen a usuarios reales: eso
// les mandaría avisos de «te sigue»).
export const BOT_FOLLOWS = [
  ['nachocinefilo', 'jorgecritico'], ['jorgecritico', 'nachocinefilo'], ['martaseries', 'irene_maraton'],
  ['irene_maraton', 'martaseries'], ['alexsofa', 'martaseries'], ['pauvos', 'nachocinefilo'],
  ['irene_maraton', 'alexsofa'],
];

// ─── Azar reproducible ────────────────────────────────────────────────────────

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Generador mulberry32 con semilla de texto: devuelve números en [0, 1). */
export function seededRandom(seed) {
  let state = hashString(String(seed)) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
export const chance = (rng, p) => rng() < p;

// ─── Plan del día ─────────────────────────────────────────────────────────────

/**
 * Instantes (ms) en los que la cuenta actúa ese día, ordenados. Llevan
 * segundos y milisegundos: una fecha en punto se tomaría por importada.
 */
export function planBotDay(bot, dayKey, tz = BOT_TZ) {
  const rng = seededRandom(`${bot.handle}|${dayKey}|plan`);
  const [min, max] = bot.actions;
  const count = randInt(rng, min, max);
  const midnight = zonedMidnight(dayKey, tz);
  const slots = [];
  for (let i = 0; i < count; i += 1) {
    const minute = randInt(rng, ACTIVE_FROM_MIN, ACTIVE_TO_MIN);
    slots.push(midnight + minute * 60_000 + randInt(rng, 1, 59) * 1000 + randInt(rng, 1, 999));
  }
  return slots.sort((a, b) => a - b);
}

/** Cuántas acciones del plan ya tocaban a esta hora. */
export function dueCount(slots, nowMs) {
  return slots.filter((slot) => slot <= nowMs).length;
}

export const botDayKey = (nowMs, tz = BOT_TZ) => localDayKey(nowMs, tz);

/** Día local de hoy desplazado `delta` días (YYYY-MM-DD). */
export const dayKeyOffset = (nowMs, delta, tz = BOT_TZ) => addDays(localDayKey(nowMs, tz), delta);

// ─── Elección de títulos ──────────────────────────────────────────────────────

export const titleKey = (mediaType, tmdbId) => `${mediaType}:${Number(tmdbId)}`;
export const episodeKey = (tmdbId, season, episode) => `tv:${Number(tmdbId)}:${Number(season)}:${Number(episode)}`;

const inRange = (date, from, to) => Boolean(date) && date >= from && date <= to;

/**
 * Candidatos de una sesión a partir de los pools ya cacheados del dashboard
 * (ninguna llamada extra a TMDb):
 *   movies     → películas estrenadas hace menos de MOVIE_RECENT_DAYS
 *   premieres  → series estrenadas hace menos de SHOW_PREMIERE_DAYS (1x01)
 *   episodes   → episodios emitidos hoy o en los EPISODE_RECENT_DAYS anteriores
 *   upcoming   → próximos estrenos (para pendientes)
 */
export function buildCandidates({ newMovies = [], newShows = [], trendingMovies = [], calendar = [] }, nowMs, tz = BOT_TZ) {
  const today = dayKeyOffset(nowMs, 0, tz);
  const movieFrom = dayKeyOffset(nowMs, -MOVIE_RECENT_DAYS, tz);
  const showFrom = dayKeyOffset(nowMs, -SHOW_PREMIERE_DAYS, tz);
  const episodeFrom = dayKeyOffset(nowMs, -EPISODE_RECENT_DAYS, tz);
  const seen = new Set();
  const unique = (card) => {
    const key = titleKey(card.mediaType, card.tmdbId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  const usable = (card) => card?.tmdbId && card.title && card.posterPath;

  const movies = [...newMovies, ...trendingMovies]
    .filter((card) => usable(card) && card.voteCount >= MOVIE_MIN_VOTES && inRange(card.releaseDate, movieFrom, today))
    .filter(unique);
  const premieres = newShows.filter((card) =>
    usable(card) && card.voteCount >= PREMIERE_MIN_VOTES && inRange(card.releaseDate, showFrom, today));
  const upcoming = [...newMovies, ...newShows].filter((card) => usable(card) && card.releaseDate > today);
  const episodes = calendar
    .filter((entry) => entry?.show?.tmdbId && entry.show.title && inRange(entry.episode?.airDate, episodeFrom, today))
    .map((entry) => ({
      tmdbId: Number(entry.show.tmdbId),
      title: entry.show.title,
      posterPath: entry.show.posterPath || null,
      season: Number(entry.episode.season),
      episode: Number(entry.episode.number),
    }))
    .filter((entry) => entry.season >= 1 && entry.episode >= 1);
  return { movies, premieres, episodes, upcoming };
}

/**
 * Elige uno al azar, con más peso para los primeros (los pools vienen por
 * popularidad) y el doble para los géneros que le gustan a la cuenta.
 */
export function pickWeighted(rng, items, bot) {
  if (!items.length) return null;
  const weights = items.map((item, index) => {
    const genreBoost = (item.genreIds || []).some((id) => bot.genres.includes(id)) ? 2 : 1;
    return genreBoost / Math.sqrt(index + 1);
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Qué hace la cuenta en esta sesión. `done` trae lo que ya tiene (claves de
 * títulos vistos, episodios vistos y pendientes) para no repetir.
 * Devuelve { kind: 'movie' | 'episode' | 'premiere' | 'watchlist', ... } o null.
 */
export function chooseSession(rng, bot, candidates, done) {
  const movies = candidates.movies.filter((card) => !done.titles.has(titleKey('movie', card.tmdbId)));
  const premieres = candidates.premieres.filter((card) => !done.episodes.has(episodeKey(card.tmdbId, 1, 1)));
  const episodes = candidates.episodes.filter((ep) => !done.episodes.has(episodeKey(ep.tmdbId, ep.season, ep.episode)));
  const upcoming = candidates.upcoming.filter((card) => !done.watchlist.has(titleKey(card.mediaType, card.tmdbId)));

  const options = [];
  if (upcoming.length && chance(rng, bot.watchlistChance)) options.push('watchlist');
  else if (chance(rng, bot.movieShare)) options.push('movie', 'episode', 'premiere');
  else options.push(rng() < 0.7 ? 'episode' : 'premiere', 'episode', 'premiere', 'movie');
  options.push('watchlist');

  for (const kind of options) {
    if (kind === 'movie' && movies.length) return { kind, title: pickWeighted(rng, movies, bot) };
    if (kind === 'premiere' && premieres.length) return { kind, title: pickWeighted(rng, premieres, bot) };
    if (kind === 'episode' && episodes.length) return { kind, title: pickWeighted(rng, episodes, bot) };
    if (kind === 'watchlist' && upcoming.length) return { kind, title: pickWeighted(rng, upcoming, bot) };
  }
  return null;
}

/**
 * Episodios previos que se ve «de un tirón» antes del nuevo (0–2): solo los
 * de la misma temporada que aún no tiene. Los anteriores ya se emitieron.
 */
export function marathonEpisodes(rng, ep, done) {
  if (ep.episode <= 1 || !chance(rng, 0.3)) return [];
  const extra = randInt(rng, 1, Math.min(2, ep.episode - 1));
  const previous = [];
  for (let n = ep.episode - extra; n < ep.episode; n += 1) {
    if (!done.episodes.has(episodeKey(ep.tmdbId, ep.season, n))) previous.push(n);
  }
  return previous;
}

// ─── Notas y reseñas ──────────────────────────────────────────────────────────

/** Nota de 1 a 10 en medios puntos: la pública ± su sesgo y algo de ruido. */
export function botRating(rng, voteAverage, bot) {
  const base = Number(voteAverage) > 0 ? Number(voteAverage) : 7;
  const noise = (rng() + rng() - 1) * 1.4;
  const value = Math.round((base + bot.bias + noise) * 2) / 2;
  return Math.min(10, Math.max(1, value));
}

const REVIEWS = {
  high: [
    'Me ha encantado. De lo mejor que he visto este año.',
    'Muy recomendable: no me esperaba que me enganchara tanto.',
    'Brutal. Me la apunto para volver a verla.',
    'Qué buena. El reparto está espectacular.',
    'Sale de las expectativas altas y aun así las supera.',
    'Imprescindible. La banda sonora acompaña de maravilla.',
  ],
  mid: [
    'Entretenida, aunque se alarga un poco en la parte central.',
    'Bien hecha y se ve a gusto, sin ser nada del otro mundo.',
    'Tiene momentos muy buenos y otros que sobran. Aprobado alto.',
    'Cumple de sobra para una tarde de sofá.',
    'Buen ritmo y buena fotografía; el guion flojea al final.',
  ],
  low: [
    'Esperaba bastante más. Se me ha hecho larga.',
    'Buena idea de partida, pero no termina de arrancar.',
    'No es para mí. Se queda a medio camino.',
    'Visualmente cumple, pero la historia no engancha.',
  ],
};

/** Reseña corta acorde a la nota. */
export function botReview(rng, rating) {
  const band = rating >= 8.5 ? 'high' : rating >= 6.5 ? 'mid' : 'low';
  const pool = REVIEWS[band];
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Instante «real» hace entre `minMinutes` y `maxMinutes`: con segundos y
 * milisegundos que no caen en punto (Hoy descartaría una fecha en punto).
 */
export function jitteredAgo(rng, nowMs, minMinutes, maxMinutes) {
  const ms = nowMs - (minMinutes + rng() * (maxMinutes - minMinutes)) * 60_000;
  const date = new Date(Math.floor(ms));
  if (date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) date.setUTCMilliseconds(137);
  return date;
}
