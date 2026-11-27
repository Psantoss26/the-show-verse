import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchMissingScores,
  getMissingScoreItems,
  perItemFetcher,
  tmdbMetaKey,
  traktScoreRequest,
} from "./scoreOnDemand.js";

const movie = (id, extra = {}) => ({ id, title: `M${id}`, media_type: "movie", ...extra });
const show = (id) => ({ id, name: `S${id}`, media_type: "tv" });

test("solo faltan los títulos sin nota conocida; un «sin nota» confirmado no falta", () => {
  const scores = new Map([["movie:1", 7.5], ["movie:2", null]]);
  const missing = getMissingScoreItems([movie(1), movie(2), movie(3), show(3), movie(3)], scores);
  assert.deepEqual(missing.map((i) => `${i.media_type}:${i.id}`), ["movie:3", "tv:3"]);
});

test("los que ya traen la nota consigo no faltan (TMDb en Favoritos)", () => {
  const items = [movie(1, { vote_average: 7 }), movie(2), movie(3, { vote_average: 0 })];
  const missing = getMissingScoreItems(items, new Map(), (item) => item.vote_average != null);
  assert.deepEqual(missing.map((i) => i.id), [2]);
});

test("por tandas: avisa tras cada una, normaliza notas y cuenta los fallos", async () => {
  const items = [movie(1), movie(2), movie(3), movie(4), movie(5)];
  const calls = [];
  const sizes = [];
  const { resolved, failed } = await fetchMissingScores(items, {
    batchSize: 2,
    fetchBatch: async (batch) => {
      sizes.push(batch.length);
      if (batch.some((i) => i.id === 5)) throw new Error("red");
      // movie:2 no viene en la respuesta: fallido. movie:4 sin nota.
      return new Map(batch.filter((i) => i.id !== 2).map((i) => [`movie:${i.id}`, i.id === 4 ? 0 : i.id + 0.5]));
    },
    onBatch: (batch, done, total) => calls.push([done, total, batch.size]),
  });
  assert.deepEqual(sizes, [2, 2, 1]);
  assert.deepEqual(calls, [[2, 5, 1], [4, 5, 2], [5, 5, 0]]);
  assert.deepEqual([...resolved], [["movie:1", 1.5], ["movie:3", 3.5], ["movie:4", null]]);
  assert.equal(failed, 2);
});

test("perItemFetcher: la tanda va a la vez y un fallo no tumba al resto", async () => {
  let active = 0;
  let maxActive = 0;
  const fetchBatch = perItemFetcher(async (item) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 1));
    active--;
    if (item.id === 2) throw new Error("red");
    return item.id === 3 ? undefined : 8;
  });
  const out = await fetchBatch([movie(1), movie(2), movie(3)]);
  assert.equal(maxActive, 3);
  assert.deepEqual([...out], [["movie:1", 8], ["movie:3", null]]);
});

test("cancelar corta entre tandas y no avisa más", async () => {
  let cancelled = false;
  const calls = [];
  await fetchMissingScores([movie(1), movie(2), movie(3)], {
    batchSize: 1,
    isCancelled: () => cancelled,
    fetchBatch: async (batch) => {
      cancelled = batch[0].id === 2;
      return new Map([[`movie:${batch[0].id}`, 7]]);
    },
    onBatch: (_b, done) => calls.push(done),
  });
  assert.deepEqual(calls, [1]);
});

test("claves de petición", () => {
  assert.deepEqual(traktScoreRequest(show(9)), { type: "tv", tmdbId: 9, includeStats: false });
  assert.equal(tmdbMetaKey(movie(603)), "movie:603");
  assert.equal(tmdbMetaKey(show(1396)), "tv:1396");
});
