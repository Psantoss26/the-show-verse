import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('la actividad conserva el tipo de puntuación y usa la serie para hidratarla', async () => {
  const source = await readFile(new URL('./userProfile.js', import.meta.url), 'utf8');
  const activity = source.slice(
    source.indexOf('export async function getUserActivity'),
    source.indexOf('// Máximo de cuentas seguidas', source.indexOf('export async function getUserActivity')),
  );

  assert.match(activity, /ratingTarget: row\.mediaType/);
  assert.match(activity, /\['season', 'episode'\]\.includes\(row\.mediaType\) \? 'tv' : row\.mediaType/);
});
