import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import reliability from './sync-reliability.js';
const source = await readFile(new URL('./content.js', import.meta.url), 'utf8');

function player() {
  let tick, clock = 100_000, episode = 1;
  const sent = [], listeners = {};
  const video = { readyState: 4, duration: 1000, currentTime: 100, clientWidth: 800, clientHeight: 500, addEventListener() {} };
  const context = {
    console: { log() {}, warn() {} },
    Date: class extends Date { static now() { return clock; } },
    setInterval: fn => { tick = fn; return 1; }, clearInterval() {},
    setTimeout, clearTimeout,
    location: { hostname: 'www.netflix.com', href: 'https://www.netflix.com/watch/series' },
    navigator: {},
    document: { title: 'Test Show', querySelectorAll: selector => selector === 'video' ? [video] : [], getElementById: () => null, addEventListener() {} },
    window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    // La detección se sustituye por una señal controlada: lo que se prueba aquí es
    // el TRANSPORTE (reintentos, respuestas tardías, cierre de pestaña), no la
    // lectura del reproductor — eso lo cubre players.test.js con DOM real.
    self: { TSVSyncReliability: reliability, TSVDetection: {
      isBarePlatformName: () => false,
      composePlaybackSignal: () => ({ contentId: 'series', showName: 'Test Show', episodeName: `Episode ${episode}`, season: 1, episode, durationSec: video.duration, positionSec: video.currentTime }),
      fillMissingTitles: signal => signal,
      pickProgressPoint: (live, cached) => live || cached,
    } },
    chrome: { runtime: { id: 'test', sendMessage: (message, callback) => { sent.push({ message, callback }); } },
      storage: { local: { get: (_keys, callback) => callback({ indicatorEnabled: false }) }, onChanged: { addListener() {} } } },
  };
  vm.runInNewContext(source, context);
  return { tick: () => tick(), sent, advance: ms => { clock += ms; }, episode: n => { episode = n; }, close: () => listeners.pagehide(), video };
}

test('the actual content script retries a transient resolution failure after backoff', () => {
  const p = player(); p.tick();
  p.sent.find(x => x.message.action === 'syncWatch').callback({ success: false, status: 503 });
  p.tick();
  assert.equal(p.sent.filter(x => x.message.action === 'syncWatch').length, 1);
  p.advance(6000); p.tick();
  assert.equal(p.sent.filter(x => x.message.action === 'syncWatch').length, 2);
});
test('a late episode response cannot overwrite the next episode', () => {
  const p = player(); p.tick();
  const first = p.sent.find(x => x.message.action === 'syncWatch');
  p.episode(2); p.tick();
  const second = p.sent.filter(x => x.message.action === 'syncWatch')[1];
  second.callback({ success: true, synced: { tmdbId: 22, mediaType: 'tv', season: 1, episode: 2 } });
  first.callback({ success: true, synced: { tmdbId: 11, mediaType: 'tv', season: 1, episode: 1 } });
  p.advance(31_000); p.tick();
  assert.ok(p.sent.filter(x => x.message.action === 'syncProgress').every(x => x.message.tmdbId === 22));
});
test('closing before resolution preserves the final observation for offline recovery', () => {
  const p = player(); p.tick(); p.video.currentTime = 950; p.close();
  const pending = p.sent.find(x => x.message.action === 'queuePlayback');
  assert.equal(pending.message.positionSec, 950);
  assert.equal(pending.message.episode, 1);
});

// Crunchyroll web: el <video> está en un iframe (static.crunchyroll.com) y el
// título en la página principal. El iframe solo informa; la página sincroniza.
function crunchyroll({ subframe }) {
  let tick, clock = 100_000;
  const sent = [], posted = [], listeners = {};
  const video = { readyState: 4, duration: 1440, currentTime: 300, clientWidth: 800, clientHeight: 450, paused: false, ended: false, addEventListener() {} };
  const host = subframe ? 'static.crunchyroll.com' : 'www.crunchyroll.com';
  const location = { hostname: host, href: `https://${host}/watch/GZ7UV13VE` };
  const win = { addEventListener: (name, fn) => { listeners[name] = fn; } };
  win.self = win;
  win.top = subframe ? { postMessage: (data) => posted.push(data) } : win;
  const context = {
    console: { log() {}, warn() {} },
    Date: class extends Date { static now() { return clock; } },
    setInterval: fn => { tick = fn; return 1; }, clearInterval() {},
    setTimeout, clearTimeout, URL,
    location,
    navigator: {},
    document: { title: 'Frieren', querySelectorAll: selector => selector === 'video' && subframe ? [video] : [], getElementById: () => null, addEventListener() {} },
    window: win,
    self: { TSVSyncReliability: reliability, TSVDetection: {
      isBarePlatformName: () => false,
      composePlaybackSignal: (i) => ({ contentId: 'GZ7UV13VE', showName: 'Frieren', episodeName: 'La promesa', episode: 12, durationSec: i.durationSec, positionSec: i.positionSec }),
      fillMissingTitles: signal => signal,
      pickProgressPoint: (live, cached) => live || cached,
      stripPlatformPrefix: t => t,
      detectFromJsonLd: () => null,
      detectFromMeta: () => '',
    } },
    chrome: { runtime: { id: 'test', sendMessage: (message, callback) => { sent.push({ message, callback }); } },
      storage: { local: { get: (_keys, callback) => callback({ indicatorEnabled: false }) }, onChanged: { addListener() {} } } },
  };
  vm.runInNewContext(source, context);
  const message = (data, origin = 'https://static.crunchyroll.com') =>
    listeners.message({ data, origin, source: {} });
  return { tick: () => tick(), sent, posted, message, advance: ms => { clock += ms; }, video, location };
}

test('Crunchyroll player iframe only reports the video and never syncs on its own', () => {
  const p = crunchyroll({ subframe: true }); p.tick();
  assert.equal(p.sent.length, 0);
  assert.equal(p.posted.length, 1);
  assert.equal(p.posted[0].currentTime, 300);
  assert.equal(p.posted[0].duration, 1440);
});

test('Crunchyroll top page syncs progress using the iframe video', () => {
  const p = crunchyroll({ subframe: false });
  p.message({ source: 'tsv-player-frame', event: 'tick', currentTime: 300, duration: 1440, width: 800, height: 450 });
  p.tick();
  const watch = p.sent.find(x => x.message.action === 'syncWatch');
  assert.ok(watch, 'resolves the title playing in the iframe');
  assert.equal(watch.message.positionSec, 300);
  watch.callback({ success: true, synced: { tmdbId: 209867, mediaType: 'tv', season: 1, episode: 12 } });
  const progress = p.sent.find(x => x.message.action === 'syncProgress');
  assert.ok(progress, 'sends progress once resolved');
  assert.equal(progress.message.runtimeSeconds, 1440);
});

test('Crunchyroll top page ignores messages from other origins and stale state', () => {
  const p = crunchyroll({ subframe: false });
  p.message({ source: 'tsv-player-frame', currentTime: 300, duration: 1440 }, 'https://evil.example');
  p.tick();
  assert.equal(p.sent.filter(x => x.message.action === 'syncWatch').length, 0);
  p.message({ source: 'tsv-player-frame', currentTime: 300, duration: 1440 });
  p.location.href = 'https://www.crunchyroll.com/series/GY5P48XEY/frieren';
  p.tick();
  assert.equal(p.sent.filter(x => x.message.action === 'syncWatch').length, 0);
});

// Netflix desde el reproductor y sus metadatos (netflix-source.js): content.js
// real, con el módulo real, el mensaje de netflix-page.js y fetch simulado.
const netflixSource = (await import('./netflix-source.js')).default;
const STRANGER_THINGS = {
  video: {
    type: 'show', id: 80057281, title: 'Stranger Things', year: 2016, currentEpisode: 81091417,
    hiddenEpisodeNumbers: false,
    seasons: [{ seq: 4, episodes: [{ id: 81091417, seq: 5, title: 'Chapter Five: The Nina Project' }] }],
  },
};

function netflixWatch({ metadata = STRANGER_THINGS, hang = false } = {}) {
  let tick, clock = 100_000;
  const sent = [], fetched = [], listeners = {};
  const video = { readyState: 4, duration: 3100, currentTime: 600, clientWidth: 1280, clientHeight: 720, addEventListener() {} };
  const win = { addEventListener: (name, fn) => { listeners[name] = fn; } };
  const context = {
    console: { log() {}, warn() {} },
    Date: class extends Date { static now() { return clock; } },
    setInterval: fn => { tick = fn; return 1; }, clearInterval() {},
    setTimeout, clearTimeout,
    location: { hostname: 'www.netflix.com', href: 'https://www.netflix.com/watch/81091417', pathname: '/watch/81091417' },
    navigator: {},
    document: { title: 'Netflix', querySelectorAll: selector => selector === 'video' ? [video] : [], getElementById: () => null, addEventListener() {} },
    window: win,
    fetch: (url) => {
      fetched.push(url);
      if (hang) return new Promise(() => {});
      return Promise.resolve(metadata
        ? { ok: true, json: async () => metadata }
        : { ok: false, status: 404, json: async () => ({}) });
    },
    self: { TSVSyncReliability: reliability, TSVNetflix: netflixSource, TSVDetection: {
      isBarePlatformName: () => false,
      // Lo que queda en el DOM con el overlay oculto: una fila del catálogo.
      composePlaybackSignal: (i) => ({ contentId: '81091417', showName: 'Top 10 en España', episodeName: 'Fila', season: 1, episode: 1,
        durationSec: i.durationSec, positionSec: i.positionSec }),
      fillMissingTitles: signal => signal,
      pickProgressPoint: (live, cached) => live || cached,
    } },
    chrome: { runtime: { id: 'test', sendMessage: (message, callback) => { sent.push({ message, callback }); } },
      storage: { local: { get: (_keys, callback) => callback({ indicatorEnabled: false }) }, onChanged: { addListener() {} } } },
  };
  vm.runInNewContext(source, context);
  const player = (data) => listeners.message({ data: { source: 'tsv-netflix-player', ...data }, source: win });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const watches = () => sent.filter(x => x.message.action === 'syncWatch');
  return { tick: () => tick(), sent, fetched, player, settle, watches, advance: ms => { clock += ms; } };
}

test('Netflix resolves with the metadata of the video the player reports, not the DOM', async () => {
  const p = netflixWatch();
  p.player({ videoId: '81091417', paused: false, buildId: 'v1' });
  p.tick();
  // Mientras llegan los metadatos no se resuelve con el DOM.
  assert.equal(p.watches().length, 0);
  assert.match(p.fetched[0], /memberapi\/release\/metadata\?languages=en-US&movieid=81091417$/);
  await p.settle();
  p.tick();
  const [watch] = p.watches();
  assert.equal(watch.message.showName, 'Stranger Things');
  assert.equal(watch.message.mainTitle, 'Stranger Things');
  assert.equal(watch.message.subTitle, 'Chapter Five: The Nina Project');
  assert.deepEqual([watch.message.season, watch.message.episode], [4, 5]);
  assert.equal(watch.message.contentId, '81091417');
  assert.equal(watch.message.identitySource, 'netflix_metadata');
  assert.equal(watch.message.releaseYear, 2016);
});

test('Netflix falls back to the DOM when there is no metadata', async () => {
  const p = netflixWatch({ metadata: null });
  p.tick();
  await p.settle();
  // Probó todas las variantes sin BUILD_IDENTIFIER y no reintenta en cada ciclo.
  assert.equal(p.fetched.length, 2);
  p.tick();
  const [watch] = p.watches();
  assert.equal(watch.message.showName, 'Top 10 en España');
  assert.equal(watch.message.identitySource, undefined);
  assert.equal(p.fetched.length, 2);
});

test('Netflix does not wait forever for metadata that never arrives', () => {
  const p = netflixWatch({ hang: true });
  p.tick();
  assert.equal(p.watches().length, 0);
  p.advance(7000); p.tick();
  assert.equal(p.watches().length, 1);
});

test('the video the player reports wins over the URL', async () => {
  const p = netflixWatch({ metadata: { video: { ...STRANGER_THINGS.video, currentEpisode: 81091418,
    seasons: [{ seq: 4, episodes: [{ id: 81091418, seq: 6, title: 'Chapter Six: The Dive' }] }] } } });
  p.player({ videoId: '81091418', paused: false });
  p.tick();
  assert.match(p.fetched[0], /movieid=81091418$/);
  await p.settle();
  p.tick();
  assert.deepEqual([p.watches()[0].message.contentId, p.watches()[0].message.episode], ['81091418', 6]);
});
