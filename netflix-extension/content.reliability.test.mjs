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
