import assert from "node:assert/strict";
import test from "node:test";

import { pickFresherImdbScore } from "./omdbCache.js";

const dataset = { imdbRating: 7.4, imdbVotes: 48210 };
const omdb = { imdbRating: 7.8, imdbVotes: 3120 };

test("IMDb: gana la lectura con más votos, llegue antes o después", () => {
  assert.deepEqual(pickFresherImdbScore(dataset, omdb), dataset);
  assert.deepEqual(pickFresherImdbScore(omdb, dataset), dataset);
});

test("IMDb: con votos gana a sin votos; sin datos, la otra", () => {
  assert.deepEqual(pickFresherImdbScore({ imdbRating: 7, imdbVotes: null }, dataset), dataset);
  assert.deepEqual(pickFresherImdbScore({ imdbRating: null, imdbVotes: null }, omdb), omdb);
  assert.deepEqual(pickFresherImdbScore({ imdbRating: 6.1, imdbVotes: null }, { imdbRating: 6.4, imdbVotes: null }), { imdbRating: 6.1, imdbVotes: null });
  assert.deepEqual(pickFresherImdbScore(null, null), { imdbRating: null, imdbVotes: null });
});
