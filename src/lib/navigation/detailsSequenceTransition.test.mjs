import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = (await readFile(new URL('./detailsSequenceTransition.js', import.meta.url), 'utf8'))
  .replaceAll('export ', '');

function setup({ native = true, reduced = false, stalledBackground = false, castReady = true } = {}) {
  const nodes = [];
  function node() {
    const attributes = new Map();
    return {
      attributes, style: {}, inert: false, isConnected: true, removed: false,
      setAttribute(key, value) { attributes.set(key, value); },
      getAttribute(key) { return attributes.get(key); },
      hasAttribute(key) { return attributes.has(key); },
      removeAttribute(key) { attributes.delete(key); },
      getBoundingClientRect: () => ({ top: -100, left: 0, width: 1280 }),
      cloneNode: () => node(), querySelectorAll: () => [], querySelector: () => null,
      append(child) { this.child = child; },
      remove() { this.removed = true; },
      animate() { return { finished: Promise.resolve() }; },
    };
  }
  const outgoing = node();
  const incoming = node();
  let focused = false;
  const heading = { setAttribute() {}, focus() { focused = true; } };
  incoming.querySelector = (selector) => selector === 'h1' ? heading : null;
  let ready = false;
  incoming.getAttribute = (key) => (key === 'data-details-cast-ready' ? castReady : ready) ? 'true' : 'false';
  if (stalledBackground) incoming.querySelectorAll = (selector) => selector === '[data-details-background-preview]' ? [{}] : [];
  const html = node();
  const listeners = new Map();
  const location = { pathname: '/details/movie/1' };
  let transitions = 0;
  const document = {
    documentElement: html, body: { append() {} },
    createElement() { const el = node(); nodes.push(el); return el; },
    querySelector(selector) {
      if (selector === '[data-details-root][data-details-href]') return outgoing;
      if (selector === '[data-details-href="/details/movie/2"]') return incoming;
      return null;
    },
  };
  if (native) document.startViewTransition = (update) => {
    assert.equal(ready, true, 'No capturar la ficha nueva mientras sigue cargando');
    assert.equal(nodes.at(-1).removed, false, 'La ficha anterior sigue visible hasta el intercambio');
    transitions++;
    update();
    return { finished: Promise.resolve(), skipTransition() {} };
  };
  const window = {
    scrollTo() {},
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
  };
  window.parent = window;
  const context = vm.createContext({
    document, window, location, innerHeight: 900,
    matchMedia: (query) => ({ matches: query.includes('reduced') ? reduced : true }),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); if (ms === 900) timer.unref(); return timer; },
    getComputedStyle: () => ({ backgroundImage: 'url(https://image.tmdb.org/t/p/w1280/background.jpg)' }),
    Image: class { decode() { return stalledBackground ? new Promise(() => {}) : Promise.resolve(); } },
  });
  vm.runInContext(source + '\nglobalThis.run = navigateDetailsSequence;', context);
  return {
    run: (navigate) => context.run({ href: '/details/movie/2', direction: 'next', navigate }),
    ready: () => { ready = true; location.pathname = '/details/movie/2'; },
    cancel: () => listeners.get('popstate')?.(),
    state: () => ({ focused, transitions, active: html.hasAttribute('data-details-sequence-transition'),
      overlayRemoved: nodes[0]?.removed, outgoingInert: outgoing.inert, incomingInert: incoming.inert,
      listenerCount: listeners.size }),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 60));

test('mantiene la ficha antigua, espera la nueva y descarta clics repetidos', async () => {
  const app = setup();
  let calls = 0;
  const pending = app.run(() => { calls++; });
  await tick();
  assert.equal(app.state().overlayRemoved, false);
  assert.equal(app.state().outgoingInert, true);
  assert.equal(app.state().transitions, 0);
  assert.equal(await app.run(() => { calls++; }), false);
  assert.equal(calls, 1);
  app.ready();
  assert.equal(await pending, true);
  assert.deepEqual(app.state(), { focused: true, transitions: 1, active: false,
    overlayRemoved: true, outgoingInert: false, incomingInert: false, listenerCount: 0 });
});

test('fallback y movimiento reducido esperan igualmente a la ficha lista', async () => {
  for (const options of [{ native: false }, { reduced: true }]) {
    const app = setup(options);
    const pending = app.run(() => {});
    await tick();
    assert.equal(app.state().overlayRemoved, false);
    app.ready();
    assert.equal(await pending, true);
    assert.equal(app.state().transitions, 0);
    assert.equal(app.state().focused, true);
    assert.equal(app.state().incomingInert, false);
  }
});

test('navegación rechazada o fallida libera la ficha y permite reintentar', async () => {
  const app = setup();
  assert.equal(await app.run(() => false), false);
  assert.equal(app.state().active, false);
  await assert.rejects(app.run(() => { throw new Error('offline'); }), /offline/);
  assert.equal(app.state().outgoingInert, false);
  assert.equal(app.state().listenerCount, 0);
  app.ready();
  assert.equal(await app.run(() => {}), true);
});

test('volver con el navegador cancela la espera y limpia la instantánea', async () => {
  const app = setup();
  const pending = app.run(() => {});
  app.cancel();
  assert.equal(await pending, false);
  assert.equal(app.state().active, false);
  assert.equal(app.state().overlayRemoved, true);
  assert.equal(app.state().listenerCount, 0);
});


test('una imagen lenta y el reparto pendiente no retienen la cabecera nueva', async () => {
  const app = setup({ stalledBackground: true, castReady: false });
  const started = Date.now();
  app.ready();
  assert.equal(await app.run(() => {}), true);
  assert.ok(Date.now() - started < 450, 'El fondo ligero tiene un presupuesto breve, sin esperar al reparto');
  assert.equal(app.state().focused, true);
  assert.equal(app.state().overlayRemoved, true);
});
