import assert from 'node:assert/strict';
import test from 'node:test';

import { voteCountsByKind } from './artworkVotes.js';

test('voteCountsByKind groups selections per image kind and skips empty or unknown rows', () => {
  assert.deepEqual(
    voteCountsByKind([
      { kind: 'poster', filePath: '/a.jpg', votes: 3 },
      { kind: 'poster', filePath: '/b.jpg', votes: '1' },
      { kind: 'logo', filePath: '/l.png', votes: 1 },
      { kind: 'poster', filePath: '/c.jpg', votes: 0 },
      { kind: 'other', filePath: '/x.jpg', votes: 4 },
      { kind: 'logo', filePath: null, votes: 2 },
    ]),
    { poster: { '/a.jpg': 3, '/b.jpg': 1 }, logo: { '/l.png': 1 } },
  );
});
