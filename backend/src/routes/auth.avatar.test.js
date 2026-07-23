import assert from 'node:assert/strict';
import test from 'node:test';

import {
  avatarUrlSchema,
  MAX_AVATAR_DATA_URL_LENGTH,
} from './auth.js';

test('avatar URL validation accepts HTTPS URLs and bounded raster data URLs', () => {
  assert.equal(
    avatarUrlSchema.safeParse('https://cdn.example.com/avatar.webp').success,
    true,
  );
  assert.equal(
    avatarUrlSchema.safeParse('data:image/webp;base64,QUJDRA==').success,
    true,
  );
});

test('avatar URL validation rejects unsafe, unsupported, and oversized image sources', () => {
  assert.equal(avatarUrlSchema.safeParse('http://example.com/avatar.jpg').success, false);
  assert.equal(avatarUrlSchema.safeParse('data:image/svg+xml;base64,PHN2Zy8+').success, false);
  assert.equal(
    avatarUrlSchema.safeParse(`data:image/webp;base64,${'A'.repeat(MAX_AVATAR_DATA_URL_LENGTH)}`).success,
    false,
  );
});
