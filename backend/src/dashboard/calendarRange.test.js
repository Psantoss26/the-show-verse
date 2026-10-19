import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RANGES, parseCalendarRange, parseCalendarRanges, withinRange } from './calendarRange.js';

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

test('parseCalendarRanges parses each start:days, clamped like a single range', () => {
  const ranges = parseCalendarRanges('2026-10-01:62, 2026-12-01:999,,2027-02-01:0');
  assert.deepEqual(ranges.map((r) => [r.startDate, r.days]), [
    ['2026-10-01', 62],
    ['2026-12-01', 62],
    ['2027-02-01', 1],
  ]);
  assert.deepEqual(ranges[0], parseCalendarRange({ start: '2026-10-01', days: 62 }));
});

test('parseCalendarRanges caps the number of ranges and tolerates empty input', () => {
  const many = Array.from({ length: MAX_RANGES + 4 }, () => '2026-10-01:7').join(',');
  assert.equal(parseCalendarRanges(many).length, MAX_RANGES);
  assert.deepEqual(parseCalendarRanges(''), []);
  assert.deepEqual(parseCalendarRanges(undefined), []);
});
