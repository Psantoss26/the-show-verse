import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('el backend acepta una valoración de temporada separada de los episodios', async () => {
  const [route, schema, migration] = await Promise.all([
    readFile(new URL('./ratings.js', import.meta.url), 'utf8'),
    readFile(new URL('../db/schema.js', import.meta.url), 'utf8'),
    readFile(new URL('../../drizzle/0015_steady_expediter.sql', import.meta.url), 'utf8'),
  ]);

  assert.match(route, /z\.enum\(\['movie', 'tv', 'season', 'episode'\]\)/);
  assert.match(route, /season ratings require season and no episode/);
  assert.match(route, /\['movie', 'tv', 'season', 'episode'\]\.includes\(mediaType\)/);
  assert.match(schema, /idx_ratings_unique_season/);
  assert.match(migration, /media_type IN \('movie', 'tv', 'season', 'episode'\)/);
  assert.match(migration, /idx_ratings_unique_season/);
  assert.doesNotMatch(migration, /community_list_items|user_list_items/);
});
