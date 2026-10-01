import assert from 'node:assert/strict';
import test from 'node:test';

import { airedEpisodeCounts, buildFollowingTitleActivity } from './followingTitleActivity.js';

const ANA = { id: 'a', username: 'ana', displayName: 'Ana', avatarUrl: null };
const LUIS = { id: 'l', username: 'luis', displayName: null, avatarUrl: '/l.png' };
const EVA = { id: 'e', username: 'eva', displayName: 'Eva', avatarUrl: null };

test('sin seguidos o sin actividad no hay nadie que mostrar', () => {
  const empty = buildFollowingTitleActivity({ mediaType: 'movie', following: [] });
  assert.equal(empty.following, 0);
  assert.deepEqual(empty.items, []);
  const quiet = buildFollowingTitleActivity({ mediaType: 'movie', following: [ANA] });
  assert.equal(quiet.following, 1);
  assert.equal(quiet.items.length, 0);
});

test('película: visto, nota, favorito, reseña y media del círculo', () => {
  const r = buildFollowingTitleActivity({
    mediaType: 'movie',
    following: [ANA, LUIS, EVA],
    watches: [
      { userId: 'a', season: null, episode: null, at: '2026-05-02T21:13:44.120Z' },
      { userId: 'a', season: null, episode: null, at: '2026-08-02T21:13:44.120Z' },
      { userId: 'l', season: null, episode: null, at: '2026-04-01T20:11:10.500Z' },
    ],
    ratings: [
      { userId: 'a', mediaType: 'movie', season: null, episode: null, rating: 9, at: '2026-08-02T23:00:01.001Z' },
      { userId: 'l', mediaType: 'movie', season: null, episode: null, rating: 6, at: '2026-04-01T23:00:01.001Z' },
    ],
    favorites: [{ userId: 'a', at: '2026-08-03T10:00:01.001Z' }],
    watchlist: [{ userId: 'e', at: '2026-09-01T10:00:01.001Z' }],
    reviews: [{ id: 'c1', userId: 'l', body: 'x'.repeat(400), spoiler: true, likes: 3, at: '2026-04-02T10:00:01.001Z' }],
  });
  assert.equal(r.summary.people, 3);
  assert.equal(r.summary.watched, 2);
  assert.equal(r.summary.watchlist, 1);
  assert.equal(r.summary.averageRating, 7.5);
  const ana = r.items.find((i) => i.user.username === 'ana');
  assert.equal(ana.status, 'rewatched');
  assert.equal(ana.watched.plays, 2);
  assert.equal(ana.favorite, true);
  const luis = r.items.find((i) => i.user.username === 'luis');
  assert.equal(luis.user.displayName, 'luis');
  assert.equal(luis.review.truncated, true);
  assert.equal(luis.review.spoiler, true);
  assert.equal(r.items.find((i) => i.user.username === 'eva').status, 'planned');
  // Quien tiene reseña va primero.
  assert.equal(r.items[0].user.username, 'luis');
});

test('serie: progreso sobre los episodios emitidos y serie terminada', () => {
  const aired = airedEpisodeCounts({ seasons: [{ season_number: 0, episode_count: 5 }, { season_number: 1, episode_count: 3 }] });
  assert.deepEqual(aired, { 1: 3 });
  const watches = (userId, eps) => eps.map((e, i) => ({ userId, season: 1, episode: e, at: `2026-03-0${i + 1}T21:1${i}:05.300Z` }));
  const r = buildFollowingTitleActivity({
    mediaType: 'tv',
    following: [ANA, LUIS],
    watches: [...watches('a', [1, 2, 3]), ...watches('l', [1])],
    airedBySeason: aired,
  });
  const ana = r.items.find((i) => i.user.username === 'ana');
  assert.equal(ana.status, 'completed');
  assert.equal(ana.watched.progressPct, 100);
  assert.deepEqual(ana.watched.lastEpisode, { season: 1, episode: 3 });
  const luis = r.items.find((i) => i.user.username === 'luis');
  assert.equal(luis.status, 'watching');
  assert.equal(luis.watched.progressPct, 33);
  assert.equal(r.summary.completed, 1);
  assert.equal(r.summary.watching, 1);
});

test('las fechas importadas no se enseñan como recientes', () => {
  const r = buildFollowingTitleActivity({
    mediaType: 'movie',
    following: [ANA],
    // Solo fecha (medianoche UTC exacta): importado.
    watches: [{ userId: 'a', season: null, episode: null, at: '2024-02-10T00:00:00.000Z' }],
  });
  assert.equal(r.items[0].watched.lastAt, null);
  assert.equal(r.items[0].lastActivityApprox, true);
});

test('una fecha compartida con muchas filas en toda la tabla (importación) no cuenta como reciente', () => {
  const r = buildFollowingTitleActivity({
    mediaType: 'movie',
    following: [ANA],
    ratings: [{ userId: 'a', mediaType: 'movie', season: null, episode: null, rating: 8, at: '2026-06-20T11:54:13.199Z', same: 300 }],
  });
  assert.equal(r.items[0].rating, 8);
  assert.equal(r.items[0].lastActivityApprox, true);
});
