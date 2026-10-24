import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTodayActions,
  countActionsByDay,
  episodeMilestone,
  localDayKey,
  resolveTodayRange,
  safeTimeZone,
  todayDays,
  zonedMidnight,
} from './todayActivityCore.js';

const TZ = 'Europe/Madrid';
// 2026-10-24 15:30:12 en Madrid (UTC+2 en verano).
const NOW = Date.parse('2026-10-24T13:30:12.345Z');

test('medianoche local respeta el cambio de hora', () => {
  assert.equal(new Date(zonedMidnight('2026-10-24', TZ)).toISOString(), '2026-10-23T22:00:00.000Z');
  // El 25 de octubre de 2026 Madrid vuelve a UTC+1.
  assert.equal(new Date(zonedMidnight('2026-10-26', TZ)).toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal(localDayKey(Date.parse('2026-10-23T22:30:00Z'), TZ), '2026-10-24');
});

test('zona horaria inválida vuelve a Madrid', () => {
  assert.equal(safeTimeZone('Marte/Olympus'), TZ);
  assert.equal(safeTimeZone(null), TZ);
  assert.equal(safeTimeZone('America/New_York'), 'America/New_York');
});

test('rangos: hoy móvil, ayer local, semana y fechas fuera de límite', () => {
  const today = resolveTodayRange('today', NOW, TZ);
  assert.equal(today.endAt - today.startAt, 24 * 3600 * 1000 + 1);

  const yesterday = resolveTodayRange('yesterday', NOW, TZ);
  assert.equal(yesterday.day, '2026-10-23');
  assert.equal(new Date(yesterday.startAt).toISOString(), '2026-10-22T22:00:00.000Z');
  assert.equal(new Date(yesterday.endAt).toISOString(), '2026-10-23T22:00:00.000Z');

  const week = resolveTodayRange('week', NOW, TZ);
  assert.equal(new Date(week.startAt).toISOString(), '2026-10-17T22:00:00.000Z');

  assert.equal(resolveTodayRange('2026-10-24', NOW, TZ), null, 'hoy no es un día pasado');
  assert.equal(resolveTodayRange('2026-08-01', NOW, TZ), null, 'demasiado atrás');
  assert.equal(resolveTodayRange('ayer', NOW, TZ), null);
  assert.equal(resolveTodayRange('2026-10-20', NOW, TZ).day, '2026-10-20');
});

test('pestañas: hoy + 6 días anteriores', () => {
  const days = todayDays(NOW, TZ);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.key).slice(0, 3), ['today', '2026-10-23', '2026-10-22']);
});

test('hitos de episodio', () => {
  const meta = {
    status: 'Returning Series',
    seasons: [{ season_number: 0, episode_count: 3 }, { season_number: 1, episode_count: 8 }, { season_number: 2, episode_count: 10 }],
    last_episode_to_air: { season_number: 2, episode_number: 10, episode_type: 'finale' },
  };
  assert.equal(episodeMilestone(1, 1, meta), 'series_premiere');
  assert.equal(episodeMilestone(2, 1, meta), 'season_premiere');
  assert.equal(episodeMilestone(1, 8, meta), 'season_finale');
  assert.equal(episodeMilestone(2, 10, meta), 'season_finale');
  assert.equal(episodeMilestone(2, 5, meta), null);
  assert.equal(episodeMilestone(2, 10, { ...meta, status: 'Ended' }), 'series_finale');
  assert.equal(episodeMilestone(1, 8, { ...meta, status: 'Ended' }), 'season_finale');
  assert.equal(episodeMilestone(null, null, meta), null);
});

test('acciones: descarta importaciones y series marcadas de golpe', () => {
  const actions = buildTodayActions({
    watches: [
      { id: 'w1', userId: 'a', tmdbId: 1, mediaType: 'tv', season: 1, episode: 2, at: '2026-10-24T10:13:44.120Z' },
      // Medianoche UTC exacta: importación.
      { id: 'w2', userId: 'a', tmdbId: 2, mediaType: 'movie', at: '2026-10-24T00:00:00.000Z' },
      // Bloque con el mismo instante.
      { id: 'w3', userId: 'b', tmdbId: 3, mediaType: 'movie', at: '2026-10-24T09:10:11.000Z', same: 40 },
      // Serie completa marcada de una vez.
      { id: 'w4', userId: 'b', tmdbId: 4, mediaType: 'tv', season: 1, episode: 1, activityGroup: 'g', at: '2026-10-24T09:10:12.500Z' },
      { id: 'w5', userId: 'b', tmdbId: 5, mediaType: 'movie', at: '2026-10-24T11:10:12.500Z' },
    ],
    ratings: [
      { id: 'r1', userId: 'a', tmdbId: 1, mediaType: 'episode', season: 1, episode: 2, rating: 8, at: '2026-10-24T10:20:01.001Z' },
      { id: 'r2', userId: 'a', tmdbId: 9, mediaType: 'movie', rating: 6, at: '2026-10-24T12:00:00.000Z' },
    ],
    comments: [
      { id: 'c1', userId: 'b', tmdbId: 5, mediaType: 'movie', body: 'Muy buena', spoiler: false, likes: 2, at: '2026-10-24T11:30:00.000Z' },
      { id: 'c2', userId: 'b', tmdbId: 5, mediaType: 'movie', body: '', at: '2026-10-24T11:31:00.000Z' },
    ],
  });
  assert.deepEqual(actions.map((a) => a.key), ['comment:c1', 'watch:w5', 'rating:r1', 'watch:w1']);
  const episode = actions.find((a) => a.key === 'watch:w1');
  assert.equal(episode.target, 'episode');
  assert.equal(episode.season, 1);
  const rating = actions.find((a) => a.key === 'rating:r1');
  assert.equal(rating.target, 'episode');
  assert.equal(rating.mediaType, 'tv');
  assert.equal(actions[0].comment.likes, 2);
});

test('recuentos por pestaña', () => {
  const days = todayDays(NOW, TZ);
  const actions = [
    { activityAt: '2026-10-24T13:00:00.000Z' },
    // Ayer por la tarde: cae en «hoy» (24 h móviles) y en «ayer».
    { activityAt: '2026-10-23T18:00:00.000Z' },
    { activityAt: '2026-10-22T08:00:00.000Z' },
  ];
  const counts = countActionsByDay(actions, days);
  assert.equal(counts[0].count, 2);
  assert.equal(counts[1].count, 1);
  assert.equal(counts[2].count, 1);
});
