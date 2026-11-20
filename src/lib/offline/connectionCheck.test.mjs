import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConnection } from './connectionCheck.js';

function env({ results, hidden = () => false, deviceOffline = () => false, onProbe } = {}) {
  const waits = [];
  let probes = 0;
  let epoch = 0;
  return {
    waits,
    get probes() { return probes; },
    bumpEpoch() { epoch += 1; },
    options: {
      probe: async () => { const ok = results[probes] ?? results.at(-1); probes += 1; onProbe?.(probes); return ok; },
      wait: async (ms) => { waits.push(ms); },
      isHidden: hidden,
      isDeviceOffline: deviceOffline,
      hiddenEpoch: () => epoch,
    },
  };
}

test('a reachable server answers online at once', async () => {
  const e = env({ results: [true] });
  assert.equal(await checkConnection(e.options), true);
  assert.equal(e.probes, 1);
});

test('failures while the network wakes up do not count as offline', async () => {
  const e = env({ results: [false, false, true] });
  assert.equal(await checkConnection(e.options), true);
  assert.equal(e.probes, 3);
});

test('the server is declared down only after every confirmation fails', async () => {
  const e = env({ results: [false] });
  assert.equal(await checkConnection(e.options), false);
  assert.equal(e.probes, 3);
  assert.deepEqual(e.waits, [3000, 6000]);
});

test('a device without network is offline without waiting', async () => {
  const e = env({ results: [false], deviceOffline: () => true });
  assert.equal(await checkConnection(e.options), false);
  assert.equal(e.probes, 1);
  assert.deepEqual(e.waits, []);
});

test('a hidden page gives no verdict and does not probe', async () => {
  const e = env({ results: [false], hidden: () => true });
  assert.equal(await checkConnection(e.options), null);
  assert.equal(e.probes, 0);
});

test('a probe that spanned a stay in the background is repeated, not counted', async () => {
  // La petición en vuelo al pasar a segundo plano falla al volver: el sistema
  // cortó la conexión mientras la página estaba congelada.
  let e;
  e = env({ results: [false, false, false, true], onProbe: (n) => { if (n === 1) e.bumpEpoch(); } });
  assert.equal(await checkConnection(e.options), true);
  assert.equal(e.probes, 4);
});

test('a failure that ends with the page hidden gives no verdict', async () => {
  let hidden = false;
  const e = env({ results: [false], hidden: () => hidden, onProbe: () => { hidden = true; } });
  assert.equal(await checkConnection(e.options), null);
});
