// backend/src/dashboard/pools.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeCards,
  withinCalendarWindow,
  buildUpcomingEpisodeEntry,
  CALENDAR_PAST_DAYS,
  CALENDAR_AHEAD_DAYS,
} from './pools.js';

test('dedupeCards removes duplicate mediaType:tmdbId keeping first', () => {
  const a = { tmdbId: 1, mediaType: 'movie', title: 'A' };
  const b = { tmdbId: 1, mediaType: 'movie', title: 'A2' };
  const c = { tmdbId: 1, mediaType: 'tv', title: 'C' };
  assert.deepEqual(dedupeCards([a, b, c]).map((x) => x.title), ['A', 'C']);
});

const day = (offset, now) => {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

test('withinCalendarWindow accepts dates inside [-PAST, +AHEAD] and rejects outside', () => {
  const now = Date.parse('2026-07-04T12:00:00Z');
  assert.equal(withinCalendarWindow(day(0, now), now), true); // hoy
  assert.equal(withinCalendarWindow(day(-CALENDAR_PAST_DAYS, now), now), true); // borde pasado
  assert.equal(withinCalendarWindow(day(CALENDAR_AHEAD_DAYS, now), now), true); // borde futuro
  assert.equal(withinCalendarWindow(day(-CALENDAR_PAST_DAYS - 1, now), now), false); // demasiado viejo
  assert.equal(withinCalendarWindow(day(CALENDAR_AHEAD_DAYS + 1, now), now), false); // demasiado lejano
  assert.equal(withinCalendarWindow(null, now), false);
  assert.equal(withinCalendarWindow('no-date', now), false);
});

test('buildUpcomingEpisodeEntry shapes an entry and carries sources', () => {
  const entry = buildUpcomingEpisodeEntry(
    { tmdbId: 1399, title: 'GoT', posterPath: '/p.jpg', backdropPath: '/b.jpg' },
    { air_date: '2026-07-06', season_number: 3, episode_number: 3, name: 'Ep' },
    ['favorite', 'in_progress'],
  );
  assert.deepEqual(entry, {
    id: 'tv:1399:3:3',
    show: { tmdbId: 1399, title: 'GoT', posterPath: '/p.jpg', backdropPath: '/b.jpg' },
    episode: { season: 3, number: 3, title: 'Ep', airDate: '2026-07-06' },
    sources: ['favorite', 'in_progress'],
  });
});

test('buildUpcomingEpisodeEntry returns null without a valid next episode', () => {
  const show = { tmdbId: 1, title: 'X' };
  assert.equal(buildUpcomingEpisodeEntry(show, null), null); // sin next episode
  assert.equal(buildUpcomingEpisodeEntry(show, { air_date: '2026-07-06' }), null); // sin season/number
  assert.equal(buildUpcomingEpisodeEntry(null, { air_date: '2026-07-06', season_number: 1, episode_number: 1 }), null);
});
