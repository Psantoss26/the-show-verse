import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPrepareAutomatically, AUTO_PREPARE_INTERVAL_MS, DATA_CHANGE_INTERVAL_MS } from './schedule.js';

const now = 1_800_000_000_000;
const last = (ago, build = 'b1') => ({ updatedAt: now - ago, build });

test('the first copy on a device always runs', () => {
  assert.equal(shouldPrepareAutomatically({ last: null, build: 'b1', now }), true);
});

test('opening the app again does not repeat a recent copy', () => {
  assert.equal(shouldPrepareAutomatically({ last: last(10 * 60 * 1000), build: 'b1', now }), false);
  assert.equal(shouldPrepareAutomatically({ last: last(AUTO_PREPARE_INTERVAL_MS), build: 'b1', now }), true);
});

test('a write does not relaunch the full copy more than once an hour', () => {
  assert.equal(shouldPrepareAutomatically({ last: last(5 * 60 * 1000), build: 'b1', reason: 'data', now }), false);
  assert.equal(shouldPrepareAutomatically({ last: last(DATA_CHANGE_INTERVAL_MS), build: 'b1', reason: 'data', now }), true);
});

test('a new deploy refreshes the saved pages once', () => {
  assert.equal(shouldPrepareAutomatically({ last: last(60 * 1000, 'b0'), build: 'b1', now }), true);
});

test('an interrupted copy is resumed', () => {
  assert.equal(shouldPrepareAutomatically({ last: last(60 * 1000), build: 'b1', pending: true, now }), true);
});

// Escritorio: varias pestañas de la app abiertas. Cada una lanzaba su copia
// completa a la vez, y una pestaña nueva tomaba la copia EN CURSO de otra por
// una interrumpida y arrancaba otra más.
function fakeLocks() {
  const held = new Set();
  return {
    async request(name, options, callback) {
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name }); } finally { held.delete(name); }
    },
  };
}

test('only one tab prepares the offline copy at a time', async () => {
  const { withPreparationLock } = await import('./schedule.js');
  const locks = fakeLocks();
  let release;
  let runs = 0;
  const first = withPreparationLock(() => { runs++; return new Promise((done) => { release = done; }); }, locks);
  const second = await withPreparationLock(() => { runs++; }, locks);
  assert.equal(second.skipped, true);
  release('ok');
  assert.deepEqual(await first, { skipped: false, value: 'ok' });
  assert.equal(runs, 1);
  assert.equal((await withPreparationLock(() => 'again', locks)).value, 'again');
});

test('without the Web Locks API the copy still runs', async () => {
  const { withPreparationLock } = await import('./schedule.js');
  assert.deepEqual(await withPreparationLock(() => 7, undefined), { skipped: false, value: 7 });
});

test('a resumed copy skips the steps that already finished', async () => {
  const { createRunLog } = await import('./schedule.js');
  const writes = [];
  const log = createRunLog({ startedAt: 1, done: ['/api/trakt/history', '/favorites'] }, { resumable: true, save: (run) => writes.push(run) });
  assert.equal(log.isDone('/api/trakt/history'), true);
  assert.equal(log.isDone('/api/lists'), false);
  log.markDone('/api/lists');
  assert.deepEqual(writes.at(-1).done.sort(), ['/api/lists', '/api/trakt/history', '/favorites']);
  const fresh = createRunLog({ startedAt: 1, done: ['/api/trakt/history'] }, { resumable: false, save: () => {} });
  assert.equal(fresh.isDone('/api/trakt/history'), false);
});
