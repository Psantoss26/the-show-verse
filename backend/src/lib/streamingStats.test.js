import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeStreaming } from './streamingStats.js';

test('summarizeStreaming: detections, corrections and discards per platform', () => {
  const { totals, platforms } = summarizeStreaming({
    detectionRows: [
      { platform: 'netflix', origin: 'browser', status: 'active', source: 'search', confidence: 'high', count: 6 },
      { platform: 'netflix', origin: 'android', status: 'corrected', source: 'search', confidence: 'medium', count: 2 },
      { platform: 'netflix', origin: 'browser', status: 'active', source: 'content_id', confidence: 'high', count: 2 },
      { platform: 'max', origin: null, status: 'active', source: null, confidence: null, count: 1 },
    ],
    discardRows: [
      { platform: 'netflix', origin: 'android', reason: 'unresolved', count: 2, attempts: 7 },
      { platform: 'movistar', origin: 'browser', reason: 'empty_title', count: 3, attempts: 3 },
    ],
  });

  assert.deepEqual(platforms.map((p) => p.platform), ['netflix', 'movistar', 'max']);
  const netflix = platforms[0];
  assert.equal(netflix.detected, 10);
  assert.equal(netflix.corrected, 2);
  assert.equal(netflix.discarded, 2);
  assert.equal(netflix.discardedAttempts, 7);
  assert.deepEqual(netflix.bySource, { search: 8, content_id: 2 });
  assert.deepEqual(netflix.byConfidence, { high: 8, medium: 2 });
  assert.deepEqual(netflix.byReason, { unresolved: 2 });
  assert.deepEqual(netflix.byOrigin.android, { detected: 2, corrected: 2, discarded: 2 });
  assert.deepEqual(netflix.byOrigin.browser, { detected: 8, corrected: 0, discarded: 0 });
  // (10 − 2) / (10 + 2)
  assert.equal(netflix.successRate, 0.667);

  // Una plataforma sin ninguna detección resuelta: 0 %.
  assert.equal(platforms[1].successRate, 0);
  // Sin origen ni fuente: se cuentan igual.
  assert.deepEqual(platforms[2].byOrigin, { unknown: { detected: 1, corrected: 0, discarded: 0 } });
  assert.deepEqual(platforms[2].bySource, { search: 1 });

  assert.equal(totals.detected, 11);
  assert.equal(totals.discarded, 5);
  assert.deepEqual(totals.byReason, { unresolved: 2, empty_title: 3 });
});

test('summarizeStreaming: nothing observed has no rate', () => {
  const { totals, platforms } = summarizeStreaming();
  assert.deepEqual(platforms, []);
  assert.equal(totals.successRate, null);
});
