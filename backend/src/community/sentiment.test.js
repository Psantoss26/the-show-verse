import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeuristicSentiment, parseSentimentResponse, sentimentRowToApi, buildSentimentPrompt, generateSentiment,
} from './sentiment.js';

test('heuristic finds a positive and a negative theme', () => {
  const r = buildHeuristicSentiment([
    { body: 'An absolute masterpiece, the best acting ever' },
    { body: 'The plot makes no sense and it was boring' },
  ]);
  assert.ok(r.good.length >= 1);
  assert.ok(r.bad.length >= 1);
  assert.ok(typeof r.good[0].text_es === 'string' && r.good[0].text_es.length > 0);
});

test('parseSentimentResponse accepts strict JSON', () => {
  const r = parseSentimentResponse('{"good":[{"text_es":"Gran actuación"}],"bad":[{"text_es":"Ritmo lento"}]}');
  assert.deepEqual(r, { good: [{ text_es: 'Gran actuación' }], bad: [{ text_es: 'Ritmo lento' }] });
});

test('parseSentimentResponse extracts JSON from noisy text and caps at 5', () => {
  const noisy = 'Aquí tienes: {"good":[{"text_es":"a"},{"text_es":"b"},{"text_es":"c"},{"text_es":"d"},{"text_es":"e"},{"text_es":"f"}],"bad":[]} gracias';
  const r = parseSentimentResponse(noisy);
  assert.equal(r.good.length, 5);
  assert.equal(r.bad.length, 0);
});

test('parseSentimentResponse returns null on garbage', () => {
  assert.equal(parseSentimentResponse('no json here'), null);
});

test('sentimentRowToApi maps to UI contract', () => {
  const api = sentimentRowToApi(
    { good: [{ text_es: 'Bien' }], bad: [{ text_es: 'Mal' }] }, 42,
  );
  assert.deepEqual(api.good, [{ sentiment_es: 'Bien' }]);
  assert.deepEqual(api.bad, [{ sentiment_es: 'Mal' }]);
  assert.equal(api.comment_count, 42);
});

test('buildSentimentPrompt includes the title and comments', () => {
  const { system, user } = buildSentimentPrompt({ comments: [{ body: 'Great film' }], title: 'Heat' });
  assert.match(system, /positiv/i);
  assert.match(user, /Heat/);
  assert.match(user, /Great film/);
});

test('generateSentiment: sin NVIDIA_API_KEY no llama a nadie', async () => {
  let called = false;
  const r = await generateSentiment({ comments: [{ body: 'great' }], title: 'X' }, { env: {}, fetchImpl: async () => { called = true; } });
  assert.equal(r, null);
  assert.equal(called, false);
});

test('generateSentiment: usa el modelo de NVIDIA que responde', async () => {
  const content = '<think>analizo</think>```json\n{"good":[{"text_es":"Gran reparto"}],"bad":[]}\n```';
  const models = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    models.push(body.model);
    if (models.length === 1) return { ok: false, status: 502, text: async () => 'bad gateway' };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  const r = await generateSentiment(
    { comments: [{ body: 'great cast' }], title: 'X' },
    { env: { NVIDIA_API_KEY: 'nvapi-test', NVIDIA_MODEL: 'a/uno,b/dos' }, fetchImpl },
  );
  assert.deepEqual(r, { good: [{ text_es: 'Gran reparto' }], bad: [], provider: 'nvidia', model: 'b/dos' });
  assert.deepEqual(models, ['a/uno', 'b/dos']);
});

test('generateSentiment: si NVIDIA falla devuelve null', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => '' });
  const r = await generateSentiment({ comments: [{ body: 'x' }] }, { env: { NVIDIA_API_KEY: 'k' }, fetchImpl });
  assert.equal(r, null);
});
