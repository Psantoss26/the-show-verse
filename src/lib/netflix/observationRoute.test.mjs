import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import * as resolver from './streamingResolve.js';
import * as resolve from './resolve.js';
import * as variants from './queryVariants.js';
import * as cache from './requestCache.js';

const source = await readFile(new URL('../../app/api/netflix/extension-sync/route.js', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function handler() {
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
    '@/lib/backend/server': {
      backendFetchJson: async (_req, path) => ({ ok: true, json: { results: path.includes('type=movie') ? [{ id: 550, title: 'Fight Club' }] : [] } }),
      getBackendBaseUrl: () => 'http://backend.test', getCookieSecure: () => false, setBackendAuthCookies: () => {},
    },
    '@/lib/netflix/streamingResolve': resolver,
    '@/lib/netflix/resolve': resolve,
    '@/lib/netflix/queryVariants': variants,
    '@/lib/netflix/requestCache': cache,
  };
  const cjsModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    assert.ok(dependencies[name], `unmocked dependency ${name}`); return dependencies[name];
  }, cjsModule, cjsModule.exports);
  return cjsModule.exports.POST;
}
const request = (payload, auth = 'Bearer test-token') => ({ json: async () => payload, headers: new Headers({ authorization: auth }) });
test('offline observations resolve into progress without changing event identity or time', async () => {
  const post = handler();
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, completed: true }), { status: 200 });
  };
  try {
    const payload = { mainTitle: 'Fight Club', platform: 'netflix', recordProgress: true, eventId: '7efb8859-9da4-4c12-a17c-936515402c2c', observedAt: '2026-09-19T08:00:00.000Z', positionSec: 950, durationSec: 1000, estimated: true };
    const result = await post(request(payload));
    assert.equal(result.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'http://backend.test/v1/auth/netflix/progress');
    assert.equal(sent[0].body.eventId, payload.eventId);
    assert.equal(sent[0].body.observedAt, payload.observedAt);
    assert.equal(sent[0].body.positionSeconds, 950);
    assert.equal(sent[0].body.estimated, true);
    assert.equal(sent[0].body.tmdbId, 550);
    sent.length = 0;
    await post(request({ mainTitle: 'Fight Club', resolveOnly: true }));
    assert.equal(sent.length, 0, 'browsing must never record playback');
    assert.equal((await post(request(payload, ''))).status, 401);
  } finally { globalThis.fetch = originalFetch; }
});
