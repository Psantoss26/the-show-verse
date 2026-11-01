import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOTS,
  botRating,
  botReview,
  buildCandidates,
  chooseSession,
  dueCount,
  episodeKey,
  jitteredAgo,
  marathonEpisodes,
  planBotDay,
  seededRandom,
  titleKey,
} from './socialBotsCore.js';
import { isRealInstant } from './realActivityInstant.js';
import { localDayKey, localHour } from './todayActivityCore.js';

const TZ = 'Europe/Madrid';
// 2026-10-24 15:30:12 en Madrid.
const NOW = Date.parse('2026-10-24T13:30:12.345Z');
const emptyDone = () => ({ titles: new Set(), episodes: new Set(), watchlist: new Set() });

test('el plan del día es estable, cae en horario de día y con fechas reales', () => {
  for (const bot of BOTS) {
    const slots = planBotDay(bot, '2026-10-24', TZ);
    assert.deepEqual(slots, planBotDay(bot, '2026-10-24', TZ));
    assert.ok(slots.length >= bot.actions[0] && slots.length <= bot.actions[1]);
    for (const slot of slots) {
      assert.equal(localDayKey(slot, TZ), '2026-10-24');
      assert.ok(localHour(slot, TZ) >= 9);
      assert.ok(isRealInstant(slot));
    }
  }
  assert.notDeepEqual(planBotDay(BOTS[0], '2026-10-24', TZ), planBotDay(BOTS[0], '2026-10-25', TZ));
});

test('dueCount cuenta los instantes ya pasados', () => {
  assert.equal(dueCount([10, 20, 30], 25), 2);
  assert.equal(dueCount([], 25), 0);
});

test('candidatos: solo estrenos recientes, episodios recién emitidos y próximos', () => {
  const card = (tmdbId, mediaType, releaseDate, voteCount = 100) => ({ tmdbId, mediaType, title: `T${tmdbId}`, posterPath: '/p.jpg', releaseDate, voteCount });
  const c = buildCandidates({
    newMovies: [card(1, 'movie', '2026-10-20'), card(2, 'movie', '2026-12-01'), card(3, 'movie', '2026-01-01')],
    newShows: [card(10, 'tv', '2026-10-10'), card(11, 'tv', '2027-01-01'), card(12, 'tv', '2026-10-12', 3)],
    trendingMovies: [card(1, 'movie', '2026-10-20'), card(4, 'movie', '2026-09-30'), card(6, 'movie', '2026-10-02', 10), { ...card(5, 'movie', '2026-10-01'), posterPath: null }],
    calendar: [
      { show: { tmdbId: 20, title: 'S', posterPath: '/s.jpg' }, episode: { season: 2, number: 3, airDate: '2026-10-23' } },
      { show: { tmdbId: 21, title: 'F', posterPath: '/f.jpg' }, episode: { season: 1, number: 1, airDate: '2026-10-28' } },
      { show: { tmdbId: 22, title: 'V', posterPath: '/v.jpg' }, episode: { season: 1, number: 1, airDate: '2026-10-10' } },
    ],
  }, NOW, TZ);
  assert.deepEqual(c.movies.map((m) => m.tmdbId), [1, 4]);
  assert.deepEqual(c.premieres.map((m) => m.tmdbId), [10]);
  assert.deepEqual(c.upcoming.map((m) => m.tmdbId), [2, 11]);
  assert.deepEqual(c.episodes.map((e) => [e.tmdbId, e.season, e.episode]), [[20, 2, 3]]);
});

test('no repite lo que ya vio o ya tiene en pendientes', () => {
  const candidates = {
    movies: [{ tmdbId: 1, mediaType: 'movie', title: 'A' }],
    premieres: [{ tmdbId: 10, mediaType: 'tv', title: 'B' }],
    episodes: [{ tmdbId: 20, title: 'C', season: 1, episode: 4 }],
    upcoming: [{ tmdbId: 2, mediaType: 'movie', title: 'D' }],
  };
  const done = emptyDone();
  done.titles.add(titleKey('movie', 1));
  done.episodes.add(episodeKey(10, 1, 1));
  done.episodes.add(episodeKey(20, 1, 4));
  done.watchlist.add(titleKey('movie', 2));
  for (let i = 0; i < 50; i += 1) {
    assert.equal(chooseSession(seededRandom(`x${i}`), BOTS[i % BOTS.length], candidates, done), null);
  }
  const fresh = emptyDone();
  const kinds = new Set();
  for (let i = 0; i < 200; i += 1) kinds.add(chooseSession(seededRandom(`y${i}`), BOTS[i % BOTS.length], candidates, fresh).kind);
  assert.deepEqual([...kinds].sort(), ['episode', 'movie', 'premiere', 'watchlist']);
});

test('maratón: solo episodios previos de la misma temporada que no tiene', () => {
  const done = emptyDone();
  done.episodes.add(episodeKey(20, 2, 4));
  for (let i = 0; i < 100; i += 1) {
    const previous = marathonEpisodes(seededRandom(`m${i}`), { tmdbId: 20, season: 2, episode: 5 }, done);
    assert.ok(previous.every((n) => n >= 3 && n < 5 && n !== 4));
    assert.deepEqual(marathonEpisodes(seededRandom(`m${i}`), { tmdbId: 20, season: 1, episode: 1 }, done), []);
  }
});

test('notas entre 1 y 10 en medios puntos y reseña acorde', () => {
  for (let i = 0; i < 300; i += 1) {
    const rng = seededRandom(`r${i}`);
    const rating = botRating(rng, [0, 3, 7.4, 9.9][i % 4], BOTS[i % BOTS.length]);
    assert.ok(rating >= 1 && rating <= 10);
    assert.equal(rating * 2, Math.round(rating * 2));
    assert.equal(typeof botReview(rng, rating), 'string');
  }
});

test('jitteredAgo nunca cae en punto y queda en el pasado', () => {
  const exact = Date.parse('2026-10-24T13:00:00.000Z');
  for (let i = 0; i < 100; i += 1) {
    const at = jitteredAgo(seededRandom(`j${i}`), exact + 60_000, 1, 1);
    assert.ok(isRealInstant(at));
    assert.ok(at.getTime() <= exact + 60_000);
  }
});
