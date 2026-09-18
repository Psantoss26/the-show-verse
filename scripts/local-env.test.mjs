import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateEnvFile } from './local-env.mjs';

test('local setup preserves API keys and stable JWTs, replaces remote URLs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tsv-env-'));
  try {
    const file = join(dir, '.env.local');
    writeFileSync(file, 'TMDB_API_KEY=keep-me\nDATABASE_URL=postgresql://remote/db\n');
    updateEnvFile(file, { DATABASE_URL: 'postgresql://localhost/db' }, ['JWT_ACCESS_SECRET']);
    const first = readFileSync(file, 'utf8');
    updateEnvFile(file, { DATABASE_URL: 'postgresql://localhost/db' }, ['JWT_ACCESS_SECRET']);
    assert.equal(readFileSync(file, 'utf8'), first);
    assert.match(first, /TMDB_API_KEY=keep-me/);
    assert.match(first, /DATABASE_URL=postgresql:\/\/localhost\/db/);
    assert.match(first, /JWT_ACCESS_SECRET=[a-f0-9]{96}/);
    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
