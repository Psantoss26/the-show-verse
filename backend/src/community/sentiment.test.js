import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeuristicSentiment, parseSentimentResponse, sentimentRowToApi, buildSentimentPrompt,
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
