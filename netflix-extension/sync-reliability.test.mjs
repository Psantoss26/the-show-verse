import { test } from 'node:test';
import assert from 'node:assert/strict';
import reliability from './sync-reliability.js';
const { createOutbox, contentKey } = reliability;

test('a failed delivery survives worker restart with the same event identity', async () => {
  let state, clock = 0, attempts = [];
  const options = { read: async () => structuredClone(state), write: async v => { state = structuredClone(v); }, now: () => clock };
  const first = createOutbox({ ...options, send: async p => { attempts.push(p.eventId); throw Error('offline'); } });
  await first.enqueue('user-a', { eventId: 'one', positionSeconds: 20 });
  await first.drain('user-a');
  assert.equal(state.entries.length, 1);
  clock = 600_000;
  const restarted = createOutbox({ ...options, send: async p => { attempts.push(p.eventId); return { status: 200 }; } });
  await restarted.drain('user-a');
  assert.deepEqual(attempts, ['one', 'one']);
  assert.equal(state.entries.length, 0);
});
test('concurrent enqueue and drain do not erase newly recorded progress', async () => {
  let state, release;
  const outbox = createOutbox({ read: async () => structuredClone(state), write: async v => { state = structuredClone(v); },
    send: async p => { if (p.eventId === 'a') await new Promise(r => { release = r; }); return { status: 200 }; } });
  await outbox.enqueue('owner', { eventId: 'a' });
  const draining = outbox.drain('owner');
  await new Promise(r => setImmediate(r));
  await outbox.enqueue('owner', { eventId: 'b' });
  release(); await draining;
  assert.equal(state.entries.length, 0);
});
test('paused and unauthorized deliveries remain queued; new pairing cannot upload old data', async () => {
  let state, status = { paused: true }, sent = 0;
  const outbox = createOutbox({ read: async () => structuredClone(state), write: async v => { state = structuredClone(v); },
    send: async () => { sent++; return status; } });
  await outbox.enqueue('old', { eventId: 'old' }); await outbox.drain('old');
  assert.equal(state.entries.length, 1);
  status = { status: 401 }; await outbox.drain('old');
  assert.equal(state.entries.length, 1);
  await outbox.drain('new'); assert.equal(sent, 2);
  await outbox.enqueue('new', { eventId: 'new' });
  assert.deepEqual(state.entries.map(e => e.payload.eventId), ['new']);
});
test('series content IDs cannot hide an episode change', () => {
  assert.notEqual(contentKey('max', { contentId: 'series', season: 1, episode: 1 }), contentKey('max', { contentId: 'series', season: 1, episode: 2 }));
});
