import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendarRange, withinRange } from './calendarRange.js';

test('parses a valid range', () => {
  const r = parseCalendarRange({ start: '2026-07-06', days: 7 });
  assert.equal(r.startDate, '2026-07-06');
  assert.equal(r.days, 7);
  assert.equal(r.startMs, Date.UTC(2026, 6, 6));
  // endMs is inclusive end-of-window midnight: start + (days-1)
  assert.equal(r.endMs, Date.UTC(2026, 6, 12));
});

test('clamps days to [1,62]', () => {
  assert.equal(parseCalendarRange({ start: '2026-07-06', days: 999 }).days, 62);
  assert.equal(parseCalendarRange({ start: '2026-07-06', days: 0 }).days, 1);
  assert.equal(parseCalendarRange({ start: '2026-07-06', days: -5 }).days, 1);
});

test('invalid start falls back to a valid YYYY-MM-DD', () => {
  const r = parseCalendarRange({ start: 'nope', days: 3 });
  assert.match(r.startDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.days, 3);
});

test('withinRange is inclusive on both ends', () => {
  const startMs = Date.UTC(2026, 6, 6);
  const endMs = Date.UTC(2026, 6, 12);
  assert.equal(withinRange('2026-07-06', startMs, endMs), true);
  assert.equal(withinRange('2026-07-12', startMs, endMs), true);
  assert.equal(withinRange('2026-07-05', startMs, endMs), false);
  assert.equal(withinRange('2026-07-13', startMs, endMs), false);
  assert.equal(withinRange(null, startMs, endMs), false);
});
