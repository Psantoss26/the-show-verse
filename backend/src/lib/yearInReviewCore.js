// src/lib/yearInReviewCore.js
// Reglas PURAS de "Tu año en The Show Verse" (resumen anual estilo Wrapped):
// sin BD ni red, para poder probarlas con node:test. La capa de datos
// (yearInReview.js) reúne historial, notas, metadatos de TMDb y actividad, y
// este módulo lo convierte en las cifras que pinta cada pantalla.
//
// CRITERIOS que conviene no perder de vista:
//   - Los días, meses y horas se cuentan en la ZONA HORARIA del usuario: un
//     episodio visto el 31 de diciembre a las 23:30 en Madrid es de ese año.
//   - "Marcados en bloque": al marcar una temporada o una serie entera, o al
//     importar, muchas filas comparten el MISMO instante. Esas filas cuentan
//     para los totales (se vieron), pero NO dicen a qué hora ni en qué día se
//     vieron de verdad: se excluyen de horas, días de la semana y maratones.
//   - Duración: la de la fila, si no la de TMDb, y si no un valor por defecto.

export const YEAR_IN_REVIEW_VERSION = 7;

const DEFAULT_MOVIE_MINS = 100;
const DEFAULT_EPISODE_MINS = 45;
// Filas con el mismo instante a partir de las cuales se considera marcado en bloque.
const BULK_GROUP_MIN = 3;
const TOP_LIMIT = 5;

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WEEKDAYS_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const WEEKDAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// ─────────────────────────────────────────────
// Fechas en la zona del usuario
// ─────────────────────────────────────────────

const formatterCache = new Map();

function formatterFor(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        weekday: 'short',
        hourCycle: 'h23',
      });
    } catch {
      formatter = formatterFor('UTC');
    }
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Partes locales de una fecha: año, mes (1-12), día, hora, día de la semana (0 = lunes). */
export function localParts(value, timeZone = 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) parts[part.type] = part.value;
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  return {
    y,
    m,
    d,
    hour,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    dayKey: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  };
}

/**
 * Partes locales de un VISIONADO. Las importaciones guardan a menudo solo la
 * fecha, como medianoche o mediodía UTC exactos (minutos, segundos y
 * milisegundos a cero; un clic real casi nunca cae ahí). En ese caso la fecha
 * buena es la UTC (en la zona del usuario podría saltar de día) y la hora no
 * significa nada: `timeless`.
 */
export function watchLocalParts(value, timeZone = 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const timeless =
    date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
  const dateOnly = timeless && (date.getUTCHours() === 0 || date.getUTCHours() === 12);
  const local = localParts(date, dateOnly ? 'UTC' : timeZone);
  return local ? { ...local, timeless } : null;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}

/** Índice 0-based del día dentro del año para una clave 'YYYY-MM-DD'. */
export function dayOfYear(dayKey) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000);
}

function dayKeyFromIndex(year, index) {
  return new Date(Date.UTC(year, 0, 1) + index * 86_400_000).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────

function titleKey(mediaType, tmdbId) {
  return `${mediaType === 'movie' ? 'movie' : 'tv'}:${tmdbId}`;
}

function round(value, digits = 1) {
  const f = 10 ** digits;
  return Math.round(Number(value || 0) * f) / f;
}

function pct(part, total) {
  return total > 0 ? round((part / total) * 100, 1) : 0;
}

function argMax(values) {
  let best = -1;
  let bestValue = -Infinity;
  values.forEach((value, index) => {
    if (value > bestValue) {
      bestValue = value;
      best = index;
    }
  });
  return bestValue > 0 ? best : -1;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function releaseYear(meta) {
  const year = Number(String(meta?.date || '').slice(0, 4));
  return Number.isInteger(year) && year > 1870 ? year : null;
}

function runtimeFor(row, meta) {
  const own = Number(row.runtimeMins || 0);
  if (own > 0) return own;
  if (row.mediaType === 'movie') {
    const runtime = Number(meta?.runtime || 0);
    return runtime > 0 ? runtime : DEFAULT_MOVIE_MINS;
  }
  if (row.season == null || row.episode == null) return 0;
  const runtime = Number(meta?.episodeRuntime || 0);
  return runtime > 0 ? runtime : DEFAULT_EPISODE_MINS;
}

function displayTitle(meta, row) {
  return meta?.title || row?.title || 'Sin título';
}

function languageName(code) {
  if (!code) return null;
  try {
    const name = new Intl.DisplayNames(['es'], { type: 'language' }).of(code);
    if (!name || name === code) return code.toUpperCase();
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code.toUpperCase();
  }
}

function countryName(code) {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/** Tarjeta mínima de título para la interfaz. */
function titleCard(key, meta, row) {
  const [type, id] = key.split(':');
  return {
    key,
    tmdbId: Number(id),
    mediaType: type,
    title: displayTitle(meta, row),
    posterPath: meta?.posterPath || row?.posterPath || null,
    backdropPath: meta?.backdropPath || null,
    year: releaseYear(meta),
    originalTitle: meta?.originalTitle || null,
  };
}

// ─────────────────────────────────────────────
// Normalización del historial
// ─────────────────────────────────────────────

/**
 * Convierte filas de watch_history en "plays" con partes locales, duración y la
 * marca de bloque. Las filas sin fecha válida se descartan.
 */
export function normalizePlays(history = [], meta = new Map(), timeZone = 'UTC') {
  const plays = [];
  for (const row of history) {
    if (!row?.tmdbId) continue;
    const date = row.watchedAt instanceof Date ? row.watchedAt : new Date(row.watchedAt);
    if (Number.isNaN(date.getTime())) continue;
    const local = watchLocalParts(date, timeZone);
    if (!local) continue;
    const key = titleKey(row.mediaType, row.tmdbId);
    const titleMeta = meta.get(key) || null;
    const isEpisode = row.mediaType !== 'movie' && row.season != null && row.episode != null;
    plays.push({
      key,
      tmdbId: Number(row.tmdbId),
      mediaType: row.mediaType === 'movie' ? 'movie' : 'tv',
      season: row.season == null ? null : Number(row.season),
      episode: row.episode == null ? null : Number(row.episode),
      isEpisode,
      at: date.getTime(),
      local,
      minutes: runtimeFor(row, titleMeta),
      title: row.title || null,
      posterPath: row.posterPath || null,
      grouped: Boolean(row.activityGroup),
      timeless: local.timeless,
      bulk: false,
    });
  }
  plays.sort((a, b) => a.at - b.at);

  // Marcados en bloque: mismo instante exacto (o una acción agrupada).
  const byInstant = new Map();
  for (const play of plays) {
    const list = byInstant.get(play.at);
    if (list) list.push(play);
    else byInstant.set(play.at, [play]);
  }
  for (const list of byInstant.values()) {
    if (list.length >= BULK_GROUP_MIN) for (const play of list) play.bulk = true;
  }
  for (const play of plays) if (play.grouped) play.bulk = true;
  return plays;
}

// ─────────────────────────────────────────────
// Bloques del resumen
// ─────────────────────────────────────────────

function summarizeTotals(plays) {
  const movies = plays.filter((p) => p.mediaType === 'movie');
  const episodes = plays.filter((p) => p.isEpisode);
  const showKeys = new Set(plays.filter((p) => p.mediaType === 'tv').map((p) => p.key));
  const minutes = plays.reduce((sum, p) => sum + p.minutes, 0);
  const movieMinutes = movies.reduce((sum, p) => sum + p.minutes, 0);
  return {
    minutes,
    hours: Math.round(minutes / 60),
    days: round(minutes / 1440, 1),
    plays: movies.length + episodes.length,
    movies: { plays: movies.length, unique: new Set(movies.map((p) => p.key)).size, minutes: movieMinutes },
    episodes: { plays: episodes.length, minutes: minutes - movieMinutes },
    shows: { unique: showKeys.size },
    titles: new Set(plays.map((p) => p.key)).size,
    activeDays: new Set(plays.map((p) => p.local.dayKey)).size,
  };
}

function buildMonthly(plays) {
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: MONTHS_ES[index],
    minutes: 0,
    plays: 0,
    movies: 0,
    episodes: 0,
  }));
  for (const play of plays) {
    const month = months[play.local.m - 1];
    month.minutes += play.minutes;
    month.plays += 1;
    if (play.mediaType === 'movie') month.movies += 1;
    else if (play.isEpisode) month.episodes += 1;
  }
  const peakIndex = argMax(months.map((m) => m.minutes));
  return { months, peak: peakIndex >= 0 ? months[peakIndex] : null };
}

function buildRhythm(plays) {
  // Horas: solo plays con hora real (ni bloques ni importados sin hora). Días de
  // la semana: también los importados sin hora, porque su FECHA sí es buena.
  const dated = plays.filter((p) => !p.bulk);
  const timed = dated.filter((p) => !p.timeless);
  const hours = Array(24).fill(0);
  const weekdays = Array(7).fill(0);
  for (const play of timed) hours[play.local.hour] += 1;
  for (const play of dated) weekdays[play.local.weekday] += 1;
  const total = timed.length;
  const datedTotal = dated.length;
  const reliable = total >= 5;
  const weekdaysReliable = datedTotal >= 5;
  const peakHour = reliable ? argMax(hours) : -1;
  const peakWeekday = weekdaysReliable ? argMax(weekdays) : -1;
  const sum = (from, to) => hours.slice(from, to).reduce((a, b) => a + b, 0);
  const slots = [
    { id: 'madrugada', label: 'De madrugada', range: '00–06 h', count: sum(0, 6) },
    { id: 'manana', label: 'Por la mañana', range: '06–14 h', count: sum(6, 14) },
    { id: 'tarde', label: 'Por la tarde', range: '14–20 h', count: sum(14, 20) },
    { id: 'noche', label: 'Por la noche', range: '20–24 h', count: sum(20, 24) },
  ].map((slot) => ({ ...slot, share: pct(slot.count, total) }));
  const topSlot = reliable ? slots[argMax(slots.map((s) => s.count))] || null : null;
  const weekendShare = pct(weekdays[5] + weekdays[6], datedTotal);
  return {
    reliable,
    weekdaysReliable,
    timedPlays: total,
    hours,
    weekdays: weekdays.map((count, index) => ({ day: WEEKDAYS_ES[index], count })),
    peakHour: peakHour >= 0 ? peakHour : null,
    peakWeekday: peakWeekday >= 0 ? WEEKDAYS_ES[peakWeekday] : null,
    slots,
    topSlot,
    lateNightShare: pct(sum(0, 5), total),
    weekendShare,
  };
}

function buildCalendar(plays, year, lastDayIndex) {
  const length = daysInYear(year);
  const perDay = Array(length).fill(0);
  const minutesPerDay = Array(length).fill(0);
  for (const play of plays) {
    const index = dayOfYear(play.local.dayKey);
    if (index < 0 || index >= length) continue;
    perDay[index] += 1;
    // El récord de un día no cuenta lo marcado en bloque: 60 episodios
    // registrados de golpe no son 60 episodios vistos ese día.
    if (!play.bulk) minutesPerDay[index] += play.minutes;
  }

  // Racha más larga dentro del año, con sus fechas.
  let longest = { length: 0, start: null, end: null };
  let runStart = -1;
  for (let i = 0; i <= length; i += 1) {
    const active = i < length && perDay[i] > 0;
    if (active && runStart < 0) runStart = i;
    if (!active && runStart >= 0) {
      const runLength = i - runStart;
      if (runLength > longest.length) {
        longest = {
          length: runLength,
          start: dayKeyFromIndex(year, runStart),
          end: dayKeyFromIndex(year, i - 1),
        };
      }
      runStart = -1;
    }
  }

  const busiestIndex = argMax(minutesPerDay);
  const elapsed = Math.max(1, Math.min(length, lastDayIndex + 1));
  const activeDays = perDay.filter((n) => n > 0).length;
  return {
    perDay,
    longestStreak: longest,
    busiestDay:
      busiestIndex >= 0
        ? {
            date: dayKeyFromIndex(year, busiestIndex),
            minutes: minutesPerDay[busiestIndex],
            plays: plays.filter((p) => !p.bulk && dayOfYear(p.local.dayKey) === busiestIndex).length,
          }
        : null,
    activeDays,
    elapsedDays: elapsed,
    activeShare: pct(activeDays, elapsed),
  };
}

function buildBinge(plays, meta) {
  // Episodios de una MISMA serie en un MISMO día, sin contar los marcados en bloque.
  const counts = new Map();
  for (const play of plays) {
    if (!play.isEpisode || play.bulk) continue;
    const id = `${play.key}|${play.local.dayKey}`;
    const current = counts.get(id) || { key: play.key, date: play.local.dayKey, episodes: 0, minutes: 0, row: play };
    current.episodes += 1;
    current.minutes += play.minutes;
    counts.set(id, current);
  }
  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.episodes > best.episodes || (entry.episodes === best.episodes && entry.minutes > best.minutes)) {
      best = entry;
    }
  }
  if (!best || best.episodes < 2) return null;
  return {
    ...titleCard(best.key, meta.get(best.key), best.row),
    date: best.date,
    episodes: best.episodes,
    minutes: best.minutes,
  };
}

function seasonCountsFor(titleMeta) {
  const counts = titleMeta?.seasonEpisodeCounts;
  return counts && typeof counts === 'object' ? counts : {};
}

function isBaseComplete(playCounts, seasonCounts) {
  const seasons = Object.keys(seasonCounts).map(Number).filter((s) => s > 0);
  let aired = 0;
  let watched = 0;
  for (const season of seasons) {
    const total = Number(seasonCounts[season] || 0);
    aired += total;
    for (let e = 1; e <= total; e += 1) if (playCounts.has(`${season}-${e}`)) watched += 1;
  }
  return aired > 0 && watched >= aired;
}

function buildShows(yearPlays, priorPlays, meta, ratingByKey) {
  const priorByShow = new Map();
  for (const play of priorPlays) {
    if (play.mediaType !== 'tv') continue;
    let entry = priorByShow.get(play.key);
    if (!entry) {
      entry = new Set();
      priorByShow.set(play.key, entry);
    }
    if (play.isEpisode) entry.add(`${play.season}-${play.episode}`);
  }

  const shows = new Map();
  for (const play of yearPlays) {
    if (play.mediaType !== 'tv') continue;
    let show = shows.get(play.key);
    if (!show) {
      show = {
        key: play.key,
        row: play,
        episodes: 0,
        minutes: 0,
        distinct: new Set(),
        seasons: new Set(),
        rewatchedEpisodes: 0,
        firstAt: play.local.dayKey,
        lastAt: play.local.dayKey,
        days: new Set(),
      };
      shows.set(play.key, show);
    }
    if (!show.row.posterPath && play.posterPath) show.row = play;
    show.minutes += play.minutes;
    show.lastAt = play.local.dayKey;
    show.days.add(play.local.dayKey);
    if (play.isEpisode) {
      const epKey = `${play.season}-${play.episode}`;
      if (show.distinct.has(epKey) || priorByShow.get(play.key)?.has(epKey)) show.rewatchedEpisodes += 1;
      show.episodes += 1;
      show.distinct.add(epKey);
      show.seasons.add(play.season);
    }
  }

  const list = [...shows.values()].map((show) => {
    const titleMeta = meta.get(show.key) || null;
    const prior = priorByShow.get(show.key) || new Set();
    const seasonCounts = seasonCountsFor(titleMeta);
    const before = isBaseComplete(prior, seasonCounts);
    const after = isBaseComplete(new Set([...prior, ...show.distinct]), seasonCounts);
    return {
      ...titleCard(show.key, titleMeta, show.row),
      episodes: show.episodes,
      distinctEpisodes: show.distinct.size,
      minutes: show.minutes,
      seasons: [...show.seasons].sort((a, b) => a - b),
      activeDays: show.days.size,
      firstWatched: show.firstAt,
      lastWatched: show.lastAt,
      isNew: !priorByShow.has(show.key),
      completedThisYear: !before && after,
      rewatchedEpisodes: show.rewatchedEpisodes,
      rating: ratingByKey.get(show.key) ?? null,
      voteAverage: titleMeta?.voteAverage ?? null,
      network: titleMeta?.networks?.[0] || null,
    };
  });
  list.sort((a, b) => b.minutes - a.minutes || b.episodes - a.episodes);
  return list;
}

function buildMovies(yearPlays, priorPlays, meta, ratingByKey) {
  const priorMovies = new Set(priorPlays.filter((p) => p.mediaType === 'movie').map((p) => p.key));
  const movies = new Map();
  for (const play of yearPlays) {
    if (play.mediaType !== 'movie') continue;
    let movie = movies.get(play.key);
    if (!movie) {
      movie = { key: play.key, row: play, plays: 0, minutes: 0, firstAt: play.local.dayKey, lastAt: play.local.dayKey };
      movies.set(play.key, movie);
    }
    movie.plays += 1;
    movie.minutes += play.minutes;
    movie.lastAt = play.local.dayKey;
  }
  const list = [...movies.values()].map((movie) => {
    const titleMeta = meta.get(movie.key) || null;
    return {
      ...titleCard(movie.key, titleMeta, movie.row),
      plays: movie.plays,
      minutes: movie.minutes,
      runtime: Number(titleMeta?.runtime || 0) || null,
      firstWatched: movie.firstAt,
      lastWatched: movie.lastAt,
      rewatch: movie.plays > 1 || priorMovies.has(movie.key),
      rating: ratingByKey.get(movie.key) ?? null,
      voteAverage: titleMeta?.voteAverage ?? null,
    };
  });
  // La película del año: la mejor puntuada por el usuario; a igualdad, la más
  // repetida. Las no puntuadas van detrás, por visionados y nota de TMDb.
  list.sort((a, b) => {
    const ar = a.rating ?? -1;
    const br = b.rating ?? -1;
    if (br !== ar) return br - ar;
    if (b.plays !== a.plays) return b.plays - a.plays;
    return (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
  });
  return list;
}

function buildGenres(titleMinutes, meta, cardsByKey) {
  const genres = new Map();
  let total = 0;
  for (const [key, minutes] of titleMinutes) {
    const names = meta.get(key)?.genres || [];
    if (!names.length) continue;
    total += minutes;
    for (const name of names) {
      const current = genres.get(name) || { name, minutes: 0, titles: 0, keys: [] };
      // Un título con varios géneros reparte su tiempo para que la suma cuadre.
      current.minutes += minutes / names.length;
      current.titles += 1;
      current.keys.push([key, minutes]);
      genres.set(name, current);
    }
  }
  const list = [...genres.values()]
    .sort((a, b) => b.minutes - a.minutes || b.titles - a.titles)
    .map((genre) => ({
      name: genre.name,
      minutes: Math.round(genre.minutes),
      titles: genre.titles,
      share: pct(genre.minutes, total),
      covers: genre.keys
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([key]) => cardsByKey.get(key))
        .filter(Boolean),
    }));
  // Diversidad: entropía normalizada del reparto (0 = un solo género, 1 = todo igual).
  let entropy = 0;
  for (const genre of genres.values()) {
    const p = total > 0 ? genre.minutes / total : 0;
    if (p > 0) entropy -= p * Math.log(p);
  }
  const diversity = genres.size > 1 ? round(entropy / Math.log(genres.size), 2) : 0;
  return { top: list.slice(0, 8), distinct: genres.size, diversity };
}

function buildRatings(allRatings, meta, year, timeZone) {
  // Las importaciones ponen la MISMA fecha a cientos de notas: esas no son notas
  // "de este año", son notas antiguas traídas de otra plataforma.
  const perInstant = new Map();
  for (const rating of allRatings) {
    const at = new Date(rating.ratedAt).getTime();
    perInstant.set(at, (perInstant.get(at) || 0) + 1);
  }
  const ratings = allRatings.filter((r) => (perInstant.get(new Date(r.ratedAt).getTime()) || 0) < BULK_GROUP_MIN);
  const inYear = ratings.filter((r) => {
    const local = localParts(r.ratedAt, timeZone);
    return local && local.y === year && Number(r.rating) > 0;
  });
  if (!inYear.length) return null;
  const distribution = Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: 0 }));
  let sum = 0;
  for (const rating of inYear) {
    const value = Number(rating.rating);
    sum += value;
    const bucket = Math.min(10, Math.max(1, Math.round(value)));
    distribution[bucket - 1].count += 1;
  }

  // Comparación con la nota pública de TMDb (solo títulos completos).
  const titled = inYear
    .filter((r) => r.mediaType === 'movie' || r.mediaType === 'tv')
    .map((r) => {
      const key = titleKey(r.mediaType, r.tmdbId);
      const titleMeta = meta.get(key) || null;
      return {
        ...titleCard(key, titleMeta, r),
        rating: Number(r.rating),
        voteAverage: Number(titleMeta?.voteAverage || 0) || null,
      };
    });
  const compared = titled.filter((t) => t.voteAverage);
  const avgDiff = compared.length
    ? round(compared.reduce((acc, t) => acc + (t.rating - t.voteAverage), 0) / compared.length, 2)
    : null;
  const controversial = compared
    .map((t) => ({ ...t, diff: round(t.rating - t.voteAverage, 1) }))
    .filter((t) => Math.abs(t.diff) >= 1.5)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0] || null;
  const byScore = [...titled].sort((a, b) => b.rating - a.rating || (b.voteAverage ?? 0) - (a.voteAverage ?? 0));
  return {
    count: inYear.length,
    titles: titled.length,
    episodes: inYear.filter((r) => r.mediaType === 'episode').length,
    seasons: inYear.filter((r) => r.mediaType === 'season').length,
    average: round(sum / inYear.length, 1),
    distribution,
    perfectScores: inYear.filter((r) => Number(r.rating) >= 10).length,
    vsTmdb: avgDiff,
    compared: compared.length,
    highest: byScore.slice(0, 3),
    lowest: byScore.length > 3 ? byScore.at(-1) : null,
    controversial,
  };
}

function buildEras(titleKeys, meta, cardsByKey, year) {
  const decades = new Map();
  const dated = [];
  for (const key of titleKeys) {
    const released = releaseYear(meta.get(key));
    if (!released) continue;
    dated.push([key, released]);
    const decade = Math.floor(released / 10) * 10;
    decades.set(decade, (decades.get(decade) || 0) + 1);
  }
  if (!dated.length) return null;
  dated.sort((a, b) => a[1] - b[1]);
  const total = dated.length;
  const list = [...decades.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, count]) => ({ decade, label: String(decade), count, share: pct(count, total) }));
  const topDecade = [...list].sort((a, b) => b.count - a.count)[0] || null;
  const fresh = dated.filter(([, y]) => y >= year - 1);
  const releasesThisYear = dated.filter(([, y]) => y === year);
  return {
    decades: list,
    topDecade,
    averageYear: Math.round(dated.reduce((acc, [, y]) => acc + y, 0) / total),
    oldest: { ...cardsByKey.get(dated[0][0]), year: dated[0][1] },
    newest: { ...cardsByKey.get(dated.at(-1)[0]), year: dated.at(-1)[1] },
    releasesThisYear: releasesThisYear.length,
    releasesCovers: releasesThisYear.slice(-6).map(([key]) => cardsByKey.get(key)).filter(Boolean),
    freshShare: pct(fresh.length, total),
    classicShare: pct(dated.filter(([, y]) => y <= year - 25).length, total),
  };
}

function buildWorld(titleMinutes, meta) {
  const languages = new Map();
  const countries = new Map();
  let total = 0;
  for (const [key, minutes] of titleMinutes) {
    const titleMeta = meta.get(key);
    if (!titleMeta) continue;
    total += 1;
    if (titleMeta.originalLanguage) {
      const current = languages.get(titleMeta.originalLanguage) || { code: titleMeta.originalLanguage, titles: 0, minutes: 0 };
      current.titles += 1;
      current.minutes += minutes;
      languages.set(titleMeta.originalLanguage, current);
    }
    for (const code of new Set(titleMeta.countries || [])) {
      const current = countries.get(code) || { code, titles: 0, minutes: 0 };
      current.titles += 1;
      current.minutes += minutes;
      countries.set(code, current);
    }
  }
  if (!total) return null;
  const sortBy = (a, b) => b.titles - a.titles || b.minutes - a.minutes;
  const langList = [...languages.values()].sort(sortBy).map((l) => ({ ...l, name: languageName(l.code), share: pct(l.titles, total) }));
  const countryList = [...countries.values()].sort(sortBy).map((c) => ({ ...c, name: countryName(c.code), share: pct(c.titles, total) }));
  // El idioma "descubrimiento": el primero que no es inglés ni español.
  const discovery = langList.find((l) => l.code !== 'en' && l.code !== 'es') || null;
  return {
    languages: langList.slice(0, 6),
    countries: countryList.slice(0, 8),
    distinctLanguages: languages.size,
    distinctCountries: countries.size,
    discovery,
  };
}

function buildPeople(titleMinutes, credits) {
  const actors = new Map();
  const directors = new Map();
  const add = (map, person, key, minutes) => {
    if (!person?.id || !person?.name) return;
    const current = map.get(person.id) || {
      id: person.id,
      name: person.name,
      profilePath: person.profilePath || null,
      titles: new Set(),
      minutes: 0,
    };
    if (!current.profilePath && person.profilePath) current.profilePath = person.profilePath;
    if (!current.titles.has(key)) {
      current.titles.add(key);
      current.minutes += minutes;
    }
    map.set(person.id, current);
  };
  for (const [key, minutes] of titleMinutes) {
    const titleCredits = credits.get(key);
    if (!titleCredits) continue;
    for (const person of (titleCredits.cast || []).slice(0, 8)) add(actors, person, key, minutes);
    for (const person of titleCredits.directors || []) add(directors, person, key, minutes);
  }
  const finish = (map, min) =>
    [...map.values()]
      .filter((p) => p.titles.size >= min)
      .sort((a, b) => b.titles.size - a.titles.size || b.minutes - a.minutes)
      .map((p) => ({ id: p.id, name: p.name, profilePath: p.profilePath, titles: p.titles.size, minutes: p.minutes, titleKeys: [...p.titles] }));
  const topActors = finish(actors, 2).slice(0, 6);
  const topDirectors = finish(directors, 2).slice(0, 4);
  if (!topActors.length && !topDirectors.length) return null;
  return { actors: topActors, directors: topDirectors, coverage: credits.size };
}

function buildNetworks(shows) {
  const networks = new Map();
  for (const show of shows) {
    const network = show.network;
    if (!network?.id) continue;
    const current = networks.get(network.id) || { id: network.id, name: network.name, logoPath: network.logoPath || null, shows: 0, minutes: 0 };
    current.shows += 1;
    current.minutes += show.minutes;
    networks.set(network.id, current);
  }
  return [...networks.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 5);
}

// ─────────────────────────────────────────────
// Fondos: siempre arte SIN idioma
// ─────────────────────────────────────────────

/**
 * Mejor imagen SIN idioma (sin texto) de una galería de TMDb. Es la misma
 * política que `pickBestNeutralPosterByResVotes` del frontend (héroe móvil de
 * la ficha): solo entradas con `iso_639_1` nulo; mínimo de ancho si lo hay;
 * entre las de máxima resolución (ventana del 98 %), la de más votos. A
 * diferencia de aquel, NO cae nunca a arte con idioma: sin textless, null.
 */
export function pickTextlessImage(list, { minWidth = 600, resolutionWindow = 0.98 } = {}) {
  const neutral = (Array.isArray(list) ? list : []).filter((img) => img?.file_path && !img.iso_639_1);
  if (!neutral.length) return null;
  const area = (img) => (Number(img.width) || 0) * (Number(img.height) || 0);
  const wide = neutral.filter((img) => (Number(img.width) || 0) >= minWidth);
  const pool = wide.length ? wide : neutral;
  const threshold = Math.max(...pool.map(area)) * resolutionWindow;
  return [...pool]
    .filter((img) => area(img) >= threshold)
    .sort((a, b) =>
      area(b) - area(a) ||
      (Number(b.width) || 0) - (Number(a.width) || 0) ||
      (Number(b.vote_count) || 0) - (Number(a.vote_count) || 0) ||
      (Number(b.vote_average) || 0) - (Number(a.vote_average) || 0),
    )[0]?.file_path || null;
}

/** Claves de los títulos cuyo arte se usa como FONDO en el resumen. */
export function backgroundTitleKeys(recap) {
  if (!recap || recap.empty) return [];
  return [
    ...new Set([
      recap.topTitle?.key,
      recap.shows?.top?.[0]?.key,
      recap.movies?.top?.[0]?.key,
      ...(recap.posterWall || []).map((poster) => poster.key),
    ].filter(Boolean)),
  ];
}

/**
 * Añade a las tarjetas del resumen su arte de fondo sin idioma:
 * `textlessPosterPath` (preferido: encaja en el marco vertical) y
 * `textlessBackdropPath` (respaldo). El muro de pósters se queda solo con los
 * títulos que tienen póster sin idioma.
 */
export function attachBackgrounds(recap, backgrounds) {
  if (!recap || recap.empty || !(backgrounds instanceof Map)) return recap;
  const patch = (card) => {
    if (!card?.key) return card;
    const art = backgrounds.get(card.key);
    card.textlessPosterPath = art?.poster || null;
    card.textlessBackdropPath = art?.backdrop || null;
    return card;
  };
  patch(recap.topTitle);
  (recap.shows?.top || []).forEach(patch);
  (recap.movies?.top || []).forEach(patch);
  recap.posterWall = (recap.posterWall || [])
    .map(patch)
    .filter((poster) => poster.textlessPosterPath);
  return recap;
}

// ─────────────────────────────────────────────
// Banda sonora por pantalla
// ─────────────────────────────────────────────

/** Claves de título de los plays que cumplen `filter`, por minutos (desc). */
function rankKeys(plays, filter = () => true) {
  const minutes = new Map();
  for (const play of plays) {
    if (!filter(play)) continue;
    minutes.set(play.key, (minutes.get(play.key) || 0) + play.minutes);
  }
  return [...minutes.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
}

const SLOT_HOURS = { madrugada: [0, 6], manana: [6, 14], tarde: [14, 20], noche: [20, 24] };

/**
 * Qué título suena en cada pantalla. Cada pantalla tiene candidatos ordenados
 * por lo representativos que son de ESA pantalla (el título que más pesó en tu
 * mes fuerte, en tu franja horaria, en tu década…). Se reparte buscando
 * variedad: cada pantalla coge su primer candidato que aún no haya sonado, y
 * si todos han sonado ya, el primero. La portada, el tiempo total y el resumen
 * comparten a propósito el título del año, para abrir y cerrar con la misma
 * canción; las pantallas que giran en torno a UN título (serie y película del
 * año, el maratón) suenan siempre con el suyo.
 */
export function assignSoundtracks({ yearPlays, topTitleKey, shows, movies, genres, binge, calendar, rhythm, monthly, ratings, eras, world, people, milestones, persona, firstKey, lastKey, meta }) {
  const timed = (p) => !p.bulk && !p.timeless;
  const real = (p) => !p.bulk;
  const otherMedium = topTitleKey?.startsWith('tv:') ? 'movie' : 'tv';
  const decadeOf = (key) => {
    const year = releaseYear(meta.get(key));
    return year ? Math.floor(year / 10) * 10 : null;
  };
  const languageOf = (key) => meta.get(key)?.originalLanguage || null;
  const slot = rhythm.topSlot ? SLOT_HOURS[rhythm.topSlot.id] : null;
  const streak = calendar.longestStreak;
  const personTitles = (person) => (person?.titleKeys || []);

  const personaCandidates = {
    maratoniano: [binge?.key, shows[0]?.key],
    cinefilo: [movies[0]?.key, ...rankKeys(yearPlays, (p) => p.mediaType === 'movie')],
    explorador: [...rankKeys(yearPlays, (p) => world?.discovery && languageOf(p.key) === world.discovery.code)],
    nostalgico: [eras?.oldest?.key, ...rankKeys(yearPlays, (p) => (releaseYear(meta.get(p.key)) || 9999) <= yearPlays[0].local.y - 25)],
    aldia: [eras?.newest?.key, ...rankKeys(yearPlays, (p) => (releaseYear(meta.get(p.key)) || 0) >= yearPlays[0].local.y - 1)],
    noctambulo: rankKeys(yearPlays, (p) => timed(p) && p.local.hour < 5),
    critico: (ratings?.highest || []).map((t) => t.key),
    fiel: [...movies.filter((m) => m.rewatch).map((m) => m.key), ...shows.filter((s) => s.rewatchedEpisodes > 0).map((s) => s.key)],
    constante: streak?.start ? rankKeys(yearPlays, (p) => p.local.dayKey >= streak.start && p.local.dayKey <= streak.end) : [],
  };

  const candidates = {
    split: rankKeys(yearPlays, (p) => p.mediaType === otherMedium),
    bookends: [firstKey, lastKey],
    genres: (genres.top[0]?.covers || []).map((c) => c.key),
    topShows: shows.slice(1).map((s) => s.key),
    topMovies: movies.slice(1).map((m) => m.key),
    binge: [binge?.key, ...(calendar.busiestDay ? rankKeys(yearPlays, (p) => real(p) && p.local.dayKey === calendar.busiestDay.date) : [])],
    rhythm: slot
      ? rankKeys(yearPlays, (p) => timed(p) && p.local.hour >= slot[0] && p.local.hour < slot[1])
      : rankKeys(yearPlays, (p) => real(p) && rhythm.peakWeekday && p.local.weekday === rhythm.weekdays.findIndex((d) => d.day === rhythm.peakWeekday)),
    calendar: [
      ...(monthly.peak ? rankKeys(yearPlays, (p) => p.local.m === monthly.peak.month) : []),
      ...(streak?.start ? rankKeys(yearPlays, (p) => p.local.dayKey >= streak.start && p.local.dayKey <= streak.end) : []),
    ],
    ratings: [ratings?.controversial?.diff > 0 ? ratings.controversial.key : null, ...(ratings?.highest || []).map((t) => t.key)],
    eras: [
      ...(eras?.topDecade ? rankKeys(yearPlays, (p) => decadeOf(p.key) === eras.topDecade.decade) : []),
      eras?.oldest?.key,
    ],
    world: [
      ...(world?.discovery ? rankKeys(yearPlays, (p) => languageOf(p.key) === world.discovery.code) : []),
      ...rankKeys(yearPlays, (p) => languageOf(p.key) && languageOf(p.key) !== 'en'),
    ],
    people: [
      ...rankKeys(yearPlays, (p) => personTitles(people?.actors?.[0]).includes(p.key)),
      ...rankKeys(yearPlays, (p) => personTitles(people?.directors?.[0]).includes(p.key)),
    ],
    milestones: rankKeys(yearPlays, (p) => milestones.completedShows.some((show) => show.key === p.key)),
    persona: personaCandidates[persona?.id] || [],
  };

  const bySlide = {
    intro: topTitleKey,
    minutes: topTitleKey,
    topShow: shows[0]?.key || null,
    topMovie: movies[0]?.key || null,
    summary: topTitleKey,
  };
  // El maratón enseña UNA serie concreta: suena esa aunque ya haya sonado.
  if (binge?.key) bySlide.binge = binge.key;
  const used = new Set(Object.values(bySlide).filter(Boolean));
  for (const [slide, list] of Object.entries(candidates)) {
    if (bySlide[slide]) continue;
    const clean = [...new Set(list.filter(Boolean))];
    const pick = clean.find((key) => !used.has(key)) || clean[0] || topTitleKey;
    bySlide[slide] = pick || null;
    if (pick) used.add(pick);
  }
  return bySlide;
}

// ─────────────────────────────────────────────
// Perfil de espectador (la "personalidad" del año)
// ─────────────────────────────────────────────

export const PERSONAS = Object.freeze({
  maratoniano: {
    name: 'El Maratoniano',
    tagline: '«Solo uno más» nunca fue solo uno.',
    description: 'Encadenas episodios como quien respira. Las temporadas te duran un fin de semana.',
  },
  cinefilo: {
    name: 'El Cinéfilo',
    tagline: 'Tu sitio es la butaca.',
    description: 'Lo tuyo son las historias que empiezan y terminan en una sola sesión. El cine manda en tu año.',
  },
  explorador: {
    name: 'El Explorador',
    tagline: 'Ningún género te queda lejos.',
    description: 'Saltas de un país, un idioma y un género a otro sin mirar atrás. Tu lista no tiene fronteras.',
  },
  nostalgico: {
    name: 'El Arqueólogo',
    tagline: 'Los clásicos nunca pasan de moda.',
    description: 'Buceas en décadas pasadas en busca de joyas. El catálogo antiguo no tiene secretos para ti.',
  },
  aldia: {
    name: 'El Estreno Andante',
    tagline: 'Si salió ayer, tú ya lo has visto.',
    description: 'Vas siempre al día: estrenos, temporadas nuevas y lo que da que hablar.',
  },
  noctambulo: {
    name: 'El Noctámbulo',
    tagline: 'Tu mejor horario empieza a medianoche.',
    description: 'Mientras el resto duerme, tú le das al play. La madrugada es tu sala privada.',
  },
  critico: {
    name: 'El Crítico',
    tagline: 'Todo merece una nota.',
    description: 'No ves por ver: puntúas, comparas y tienes un criterio muy tuyo.',
  },
  fiel: {
    name: 'El Fiel',
    tagline: 'Lo bueno se vuelve a ver.',
    description: 'Vuelves a tus historias favoritas una y otra vez. Repetir también es disfrutar.',
  },
  constante: {
    name: 'El Constante',
    tagline: 'Un poco cada día.',
    description: 'Tu ritmo no falla: pocas semanas se te escapan sin darle al play.',
  },
});

/** Puntuaciones (0-1) de cada rasgo y el perfil dominante. */
export function computePersona(signals) {
  const s = signals || {};
  const scores = {
    maratoniano: clamp01(((s.bingeEpisodes || 0) - 2) / 8) * 0.6 + clamp01((s.episodesPerActiveDay || 0) / 6) * 0.4,
    cinefilo: clamp01(((s.movieShare || 0) - 0.3) / 0.5),
    explorador: clamp01(((s.genreDiversity || 0) - 0.55) / 0.35) * 0.5 + clamp01(((s.distinctLanguages || 0) - 1) / 6) * 0.5,
    nostalgico: clamp01(((s.classicShare || 0) - 10) / 40),
    aldia: clamp01(((s.freshShare || 0) - 25) / 50),
    noctambulo: s.rhythmReliable ? clamp01(((s.lateNightShare || 0) - 8) / 25) : 0,
    critico: clamp01((s.ratingsPerTitle || 0) / 0.8) * 0.8 + (Math.abs(s.vsTmdb || 0) >= 0.8 ? 0.2 : 0),
    fiel: clamp01((s.rewatchShare || 0) / 25),
    constante: clamp01(((s.activeShare || 0) - 25) / 55) * 0.6 + clamp01((s.longestStreak || 0) / 30) * 0.4,
  };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [primaryId, primaryScore] = ranked[0];
  const [secondaryId, secondaryScore] = ranked[1];
  return {
    id: primaryId,
    ...PERSONAS[primaryId],
    score: round(primaryScore, 2),
    secondary: secondaryScore >= 0.35 ? { id: secondaryId, name: PERSONAS[secondaryId].name, score: round(secondaryScore, 2) } : null,
    traits: ranked.slice(0, 5).map(([id, score]) => ({ id, name: PERSONAS[id].name, score: round(score, 2) })),
  };
}

// ─────────────────────────────────────────────
// Ensamblado
// ─────────────────────────────────────────────

/**
 * @param {object} input
 * @param {number} input.year
 * @param {string} [input.timeZone]
 * @param {Date|string|number} [input.now]
 * @param {Array} input.history       filas de watch_history (todas las del usuario)
 * @param {Array} [input.ratings]     filas de user_ratings
 * @param {Map}   [input.meta]        'movie:1'|'tv:2' → metadatos recortados (ver yearInReview.js)
 * @param {Map}   [input.credits]     'movie:1'|'tv:2' → { cast, directors }
 * @param {object} [input.activity]   recuentos sociales y de colección del año
 * @param {Array} [input.achievements] logros desbloqueados en el año
 * @param {object|null} [input.community] { activeUsers, rank }
 */
export function buildYearInReview(input) {
  const year = Number(input.year);
  const timeZone = input.timeZone || 'UTC';
  const meta = input.meta instanceof Map ? input.meta : new Map();
  const credits = input.credits instanceof Map ? input.credits : new Map();
  const now = localParts(input.now ?? new Date(), timeZone);

  const allPlays = normalizePlays(input.history || [], meta, timeZone);
  const yearPlays = allPlays.filter((p) => p.local.y === year);
  const priorPlays = allPlays.filter((p) => p.local.y < year);
  const prevPlays = allPlays.filter((p) => p.local.y === year - 1);

  const yearCounts = new Map();
  for (const play of allPlays) yearCounts.set(play.local.y, (yearCounts.get(play.local.y) || 0) + 1);
  const availableYears = [...yearCounts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([y, count]) => ({ year: y, plays: count }));

  const isCurrentYear = now?.y === year;
  const lastDayIndex = isCurrentYear ? dayOfYear(now.dayKey) : daysInYear(year) - 1;

  const base = {
    version: YEAR_IN_REVIEW_VERSION,
    year,
    timeZone,
    isCurrentYear,
    availableYears,
    generatedAt: new Date().toISOString(),
  };

  if (!yearPlays.length) {
    return { ...base, empty: true };
  }

  const ratingByKey = new Map();
  for (const rating of input.ratings || []) {
    if (rating.mediaType !== 'movie' && rating.mediaType !== 'tv') continue;
    if (rating.season != null || rating.episode != null) continue;
    ratingByKey.set(titleKey(rating.mediaType, rating.tmdbId), Number(rating.rating));
  }

  const totals = summarizeTotals(yearPlays);
  const previous = summarizeTotals(prevPlays);

  // Minutos y tarjeta por título del año (base de géneros, idiomas y personas).
  const titleMinutes = new Map();
  const cardsByKey = new Map();
  for (const play of yearPlays) {
    titleMinutes.set(play.key, (titleMinutes.get(play.key) || 0) + play.minutes);
    if (!cardsByKey.has(play.key) || (!cardsByKey.get(play.key).posterPath && play.posterPath)) {
      cardsByKey.set(play.key, titleCard(play.key, meta.get(play.key), play));
    }
  }

  const shows = buildShows(yearPlays, priorPlays, meta, ratingByKey);
  const movies = buildMovies(yearPlays, priorPlays, meta, ratingByKey);
  const monthly = buildMonthly(yearPlays);
  const rhythm = buildRhythm(yearPlays);
  const calendar = buildCalendar(yearPlays, year, lastDayIndex);
  const binge = buildBinge(yearPlays, meta);
  const genres = buildGenres(titleMinutes, meta, cardsByKey);
  const ratings = buildRatings(input.ratings || [], meta, year, timeZone);
  const eras = buildEras([...titleMinutes.keys()], meta, cardsByKey, year);
  const world = buildWorld(titleMinutes, meta);
  const people = buildPeople(titleMinutes, credits);
  const networks = buildNetworks(shows);

  const longestMovie = movies
    .filter((m) => m.runtime)
    .sort((a, b) => b.runtime - a.runtime)[0] || null;

  // El título del año: el que más tiempo se llevó (suele ser una serie).
  const topTitleKey = [...titleMinutes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const topTitle = topTitleKey
    ? { ...cardsByKey.get(topTitleKey), minutes: titleMinutes.get(topTitleKey), share: pct(titleMinutes.get(topTitleKey), totals.minutes) }
    : null;

  const firstPlay = yearPlays[0];
  const lastPlay = yearPlays.at(-1);
  const rewatchMovies = movies.filter((m) => m.rewatch).length;
  const rewatchEpisodes = shows.reduce((acc, s) => acc + s.rewatchedEpisodes, 0);

  const activity = input.activity || {};
  const milestones = {
    newShows: shows.filter((s) => s.isNew).length,
    completedShows: shows.filter((s) => s.completedThisYear).map((s) => ({
      key: s.key,
      tmdbId: s.tmdbId,
      title: s.title,
      posterPath: s.posterPath,
      backdropPath: s.backdropPath,
    })),
    newMovies: movies.filter((m) => !m.rewatch).length,
    rewatchMovies,
    rewatchEpisodes,
    favoritesAdded: Number(activity.favoritesAdded || 0),
    watchlistAdded: Number(activity.watchlistAdded || 0),
    listsCreated: Number(activity.listsCreated || 0),
    listItemsAdded: Number(activity.listItemsAdded || 0),
    comments: Number(activity.comments || 0),
    followersGained: Number(activity.followersGained || 0),
    followingAdded: Number(activity.followingAdded || 0),
    likesReceived: Number(activity.likesReceived || 0),
    achievements: (input.achievements || []).slice(0, 12),
  };

  const ratedTitles = ratings?.titles || 0;
  const persona = computePersona({
    bingeEpisodes: binge?.episodes || 0,
    episodesPerActiveDay: totals.activeDays ? totals.episodes.plays / totals.activeDays : 0,
    movieShare: totals.minutes ? totals.movies.minutes / totals.minutes : 0,
    genreDiversity: genres.diversity,
    distinctLanguages: world?.distinctLanguages || 0,
    classicShare: eras?.classicShare || 0,
    freshShare: eras?.freshShare || 0,
    lateNightShare: rhythm.lateNightShare,
    rhythmReliable: rhythm.reliable,
    ratingsPerTitle: totals.titles ? ratedTitles / totals.titles : 0,
    vsTmdb: ratings?.vsTmdb || 0,
    rewatchShare: pct(rewatchMovies + rewatchEpisodes, totals.plays),
    activeShare: calendar.activeShare,
    longestStreak: calendar.longestStreak.length,
  });

  const community = input.community && input.community.activeUsers >= 10
    ? {
        activeUsers: input.community.activeUsers,
        rank: input.community.rank,
        topPercent: Math.max(1, Math.ceil((input.community.rank / input.community.activeUsers) * 100)),
      }
    : null;

  const bulkPlays = yearPlays.filter((p) => p.bulk).length;

  const soundtrackBySlide = assignSoundtracks({
    yearPlays,
    topTitleKey,
    shows,
    movies,
    genres,
    binge,
    calendar,
    rhythm,
    monthly,
    ratings,
    eras,
    world,
    people,
    milestones,
    persona,
    firstKey: firstPlay?.key,
    lastKey: lastPlay?.key,
    meta,
  });
  // Tarjetas mínimas para resolver cada pista (título, original y año). Las
  // notas pueden ser de títulos no vistos este año: se construyen desde meta.
  const soundtrackCards = {};
  for (const key of new Set(Object.values(soundtrackBySlide).filter(Boolean))) {
    const card = cardsByKey.get(key) || titleCard(key, meta.get(key), null);
    soundtrackCards[key] = {
      key,
      tmdbId: card.tmdbId,
      mediaType: card.mediaType,
      title: card.title,
      originalTitle: card.originalTitle,
      year: card.year,
      posterPath: card.posterPath,
    };
  }

  return {
    ...base,
    empty: false,
    totals,
    previous: previous.plays
      ? {
          minutes: previous.minutes,
          titles: previous.titles,
          plays: previous.plays,
          minutesDelta: previous.minutes ? round(((totals.minutes - previous.minutes) / previous.minutes) * 100, 0) : null,
        }
      : null,
    topTitle,
    shows: {
      top: shows.slice(0, TOP_LIMIT),
      total: shows.length,
    },
    movies: {
      top: movies.slice(0, TOP_LIMIT),
      total: movies.length,
      longest: longestMovie,
    },
    genres,
    monthly,
    rhythm,
    calendar,
    binge,
    ratings,
    eras,
    world,
    people,
    networks,
    firstOfYear: firstPlay ? { ...cardsByKey.get(firstPlay.key), date: firstPlay.local.dayKey, season: firstPlay.season, episode: firstPlay.episode } : null,
    lastOfYear: lastPlay ? { ...cardsByKey.get(lastPlay.key), date: lastPlay.local.dayKey, season: lastPlay.season, episode: lastPlay.episode } : null,
    milestones,
    persona,
    community,
    soundtrack: { bySlide: soundtrackBySlide, cards: soundtrackCards },
    posterWall: [...titleMinutes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => cardsByKey.get(key))
      .filter((card) => card?.posterPath)
      .slice(0, 36)
      .map((card) => ({ key: card.key, posterPath: card.posterPath, title: card.title })),
    quality: {
      bulkShare: pct(bulkPlays, yearPlays.length),
      metadataCoverage: pct([...titleMinutes.keys()].filter((key) => meta.has(key)).length, titleMinutes.size),
      creditsCoverage: pct([...titleMinutes.keys()].filter((key) => credits.has(key)).length, titleMinutes.size),
    },
  };
}
