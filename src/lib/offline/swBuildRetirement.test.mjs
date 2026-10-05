import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

// LA COPIA SIN CONEXIÓN NO PUEDE CRECER CON CADA DESPLIEGUE.
//
// El fallo que esto vigila: las copias de las páginas del build anterior solo
// se borraban (PRUNE_BUILDS) si la preparación entera salía sin un solo fallo.
// Con cualquier fallo —una ruta que ya no existe, un microcorte—, cada
// despliegue añadía otra copia COMPLETA de todas las fichas guardadas (~420 KB
// cada una) más el JavaScript de ese build. El almacenamiento se agotaba y,
// llegado a ese punto, la copia se cortaba siempre hacia el mismo número de
// páginas y quedaba «Copia parcial», que a su vez impedía volver a podar.

const source = await readFile(new URL('../../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://app.test';
const html = (body) => new Response(`<html>${body}</html>`, { headers: { 'Content-Type': 'text/html' } });

/**
 * Service worker del build `version` sobre un almacenamiento compartido entre
 * builds (`stores`), como en el navegador. `limite` simula la cuota: número
 * máximo de documentos guardados entre todas las cachés de páginas.
 */
function worker(version, stores = new Map(), { limite = Infinity } = {}) {
  const listeners = {};
  const key = (request) => typeof request === 'string' ? new URL(request, origin).href : request.url;
  const documentos = () => [...stores.entries()]
    .filter(([name]) => name.startsWith('showverse-shell-'))
    .reduce((total, [, store]) => total + store.size, 0);
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request) { return store.get(key(request))?.clone(); },
        async put(request, response) {
          if (name.startsWith('showverse-shell-') && !store.has(key(request)) && documentos() >= limite) {
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
          }
          store.set(key(request), response.clone());
        },
        async delete(request) { return store.delete(key(request)); },
        async keys() { return [...store.keys()].map((url) => new Request(url)); },
      };
    },
    async match(request) { for (const store of stores.values()) { const found = store.get(key(request)); if (found) return found.clone(); } },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  let handler = () => html('vacía');
  const context = vm.createContext({
    URL, URLSearchParams, Request, Response, Headers, TextEncoder, Uint8Array, Blob, atob, DOMException,
    crypto: webcrypto, AbortController, setTimeout, clearTimeout, console, caches,
    fetch: async (request) => handler(request),
    self: { location: { href: `${origin}/sw.js?v=${version}`, origin }, skipWaiting: async () => {},
      clients: { claim: async () => {}, matchAll: async () => [] },
      addEventListener: (name, fn) => { listeners[name] = fn; },
    },
  });
  vm.runInContext(source, context);
  return {
    stores,
    network(fn) { handler = fn; },
    async login(id) { await context.changeOwner(id); },
    async message(data) {
      let pending; let result;
      listeners.message({ data, ports: [{ postMessage: (value) => { result = value; } }], waitUntil: (promise) => { pending = promise; } });
      await pending; return result;
    },
    async save(path, extra = {}) { return this.message({ type: 'OFFLINE_SAVE_ROUTE', path, ...extra }); },
    async has(path) { return (await this.message({ type: 'OFFLINE_HAS_ROUTE', path })).available; },
  };
}

/** Lo que hay guardado de una ruta en la caché de páginas de un build. */
function guardado(stores, version, path) {
  const store = stores.get(`showverse-shell-${version}`);
  if (!store) return undefined;
  return [...store.keys()].find((url) => new URL(url).pathname === path);
}

/** Simula que la cuenta ya existía en el almacenamiento (el build nuevo no la cambia). */
async function mismaCuenta(sw) { await sw.login('alice'); }

test('al guardar una ruta en el build nuevo, se retira su copia del build anterior', async () => {
  const a = worker('build-a'); await mismaCuenta(a);
  a.network(() => html('Ficha 42 (a)'));
  assert.equal((await a.save('/details/movie/42')).ok, true);
  assert.equal((await a.save('/details/movie/7')).ok, true);

  const b = worker('build-b', a.stores); await mismaCuenta(b);
  b.network(() => html('Ficha 42 (b)'));
  assert.equal((await b.save('/details/movie/42')).ok, true);

  assert.equal(guardado(b.stores, 'build-a', '/details/movie/42'), undefined, 'la copia vieja de la ficha 42 sigue ocupando sitio');
  assert.ok(guardado(b.stores, 'build-b', '/details/movie/42'));
  // La que aún no se ha refrescado se conserva: es la única copia que hay.
  assert.ok(guardado(b.stores, 'build-a', '/details/movie/7'));
  assert.equal(await b.has('/details/movie/7'), true);
});

test('un build sin páginas propias desaparece con su JavaScript', async () => {
  const a = worker('build-a'); await mismaCuenta(a);
  a.network(() => html('Ficha 42 (a)'));
  await a.save('/details/movie/42');
  await (await caches(a).open('showverse-assets-build-a')).put(`${origin}/_next/static/a.js`, new Response('a'));

  const b = worker('build-b', a.stores); await mismaCuenta(b);
  b.network(() => html('Ficha 42 (b)'));
  await b.save('/details/movie/42');

  assert.equal(b.stores.has('showverse-shell-build-a'), false);
  assert.equal(b.stores.has('showverse-assets-build-a'), false);
});

test('sin espacio, retirar la copia vieja de la ruta deja sitio para la nueva', async () => {
  const a = worker('build-a', new Map(), { limite: 2 }); await mismaCuenta(a);
  a.network(() => html('vieja'));
  await a.save('/details/movie/1');
  await a.save('/details/movie/2');

  const b = worker('build-b', a.stores, { limite: 2 }); await mismaCuenta(b);
  b.network(() => html('nueva'));
  assert.equal((await b.save('/details/movie/1')).ok, true, 'con la cuota llena, la ruta no llega a guardarse');
  assert.equal((await b.save('/details/movie/2')).ok, true);
  assert.equal(b.stores.has('showverse-shell-build-a'), false);
});

test('una ruta que ya no existe (404) se olvida en vez de contar como fallo para siempre', async () => {
  const a = worker('build-a'); await mismaCuenta(a);
  a.network(() => html('lista borrada'));
  await a.save('/lists/borrada');

  const b = worker('build-b', a.stores); await mismaCuenta(b);
  b.network(() => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/html' } }));
  const result = await b.save('/lists/borrada');
  assert.equal(result.ok, false);
  assert.equal(result.gone, true);
  assert.equal(await b.has('/lists/borrada'), false);
  assert.equal(b.stores.has('showverse-shell-build-a'), false);
});

test('al reanudar una copia interrumpida no se vuelve a descargar lo ya guardado', async () => {
  const a = worker('build-a'); await mismaCuenta(a);
  let descargas = 0;
  a.network(() => { descargas += 1; return html('Ficha 42'); });
  const inicio = Date.now();
  await a.save('/details/movie/42');
  assert.equal(descargas, 1);
  const reanudada = await a.save('/details/movie/42', { freshSince: inicio });
  assert.equal(reanudada.ok, true);
  assert.equal(descargas, 1, 'la ficha ya estaba guardada en esta copia y se ha vuelto a pedir');
  // Una copia de antes de empezar sí se refresca.
  await a.save('/details/movie/42', { freshSince: Date.now() + 1000 });
  assert.equal(descargas, 2);
});

// Acceso a la API de cachés compartida desde fuera del worker.
function caches(sw) {
  return {
    async open(name) {
      if (!sw.stores.has(name)) sw.stores.set(name, new Map());
      const store = sw.stores.get(name);
      return { async put(url, response) { store.set(url, response); } };
    },
  };
}
