import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeStreamingPlatform,
  resolveEpisodePlaybackLink,
  sanitizePlaybackUrl,
} from './streamingPlayback.js';

test('normalizes the supported streaming platform aliases', () => {
  assert.equal(normalizeStreamingPlatform('Amazon Prime Video'), 'prime');
  assert.equal(normalizeStreamingPlatform('HBO Max'), 'max');
  assert.equal(normalizeStreamingPlatform('Disney+'), 'disney');
  assert.equal(normalizeStreamingPlatform('unknown'), null);
});

test('keeps an exact player URL on the matching official platform', () => {
  const result = resolveEpisodePlaybackLink({
    platform: 'netflix',
    contentId: '81234567',
    playbackUrl: 'https://www.netflix.com/watch/81234567?trackId=123',
  });

  assert.deepEqual(result, {
    platform: 'netflix',
    providerName: 'Netflix',
    contentId: '81234567',
    playbackUrl: 'https://www.netflix.com/watch/81234567?trackId=123',
  });
});

test('rejects cross-platform and executable URLs', () => {
  assert.equal(
    sanitizePlaybackUrl('netflix', 'https://example.com/watch/81234567'),
    null,
  );
  assert.equal(
    sanitizePlaybackUrl('netflix', 'javascript:alert(document.domain)'),
    null,
  );
});

test('builds the Netflix player fallback from its stable numeric content id', () => {
  assert.equal(
    resolveEpisodePlaybackLink({
      platform: 'netflix',
      contentId: '81234567',
    })?.playbackUrl,
    'https://www.netflix.com/watch/81234567',
  );
});

test('does not invent non-Netflix URLs without their exact source URL', () => {
  assert.equal(
    resolveEpisodePlaybackLink({
      platform: 'plex',
      contentId: '/library/metadata/42',
    }),
    null,
  );
  assert.equal(
    resolveEpisodePlaybackLink({
      platform: 'disney',
      contentId: 'd1a2-b3c4',
    }),
    null,
  );
});
