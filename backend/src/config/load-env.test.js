import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function load(mode, localUrl = 'postgresql://localhost/local', localDev = false) {
  const dir = mkdtempSync(join(tmpdir(), 'tsv-loader-'));
  try {
    mkdirSync(join(dir, 'src/config'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    symlinkSync(fileURLToPath(new URL('../../node_modules', import.meta.url)), join(dir, 'node_modules'));
    copyFileSync(new URL('./load-env.js', import.meta.url), join(dir, 'src/config/load-env.js'));
    writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgresql://base/base\n');
    writeFileSync(join(dir, '.env.local'), `DATABASE_URL=${localUrl}\nDATABASE_URL_UNPOOLED=${localUrl}\nREDIS_URL=redis://localhost\n`);
    const env = { PATH: process.env.PATH, NODE_ENV: mode, DATABASE_URL: 'postgresql://process/db' };
    if (localDev) env.SHOWVERSE_LOCAL_DEV = '1';
    return spawnSync(process.execPath, ['--input-type=module', '-e',
      'import "./src/config/load-env.js"; console.log(process.env.DATABASE_URL);'],
    { cwd: dir, env, encoding: 'utf8' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

for (const mode of ['production', 'test']) {
  test(`${mode} never loads .env.local`, () => {
    const result = load(mode);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'postgresql://process/db');
  });
}
test('development overrides base database with local config', () => {
  const result = load('development');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'postgresql://localhost/local');
});
test('local dev rejects a remote database before opening connections', () => {
  const result = load('development', 'postgresql://production/db', true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_URL debe apuntar a localhost/);
});
