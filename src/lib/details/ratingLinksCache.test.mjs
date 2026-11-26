import test from "node:test";
import assert from "node:assert/strict";
import { clearRatingLinksCache, getRatingLinks } from "./ratingLinksCache.js";

const LINKS = { rt: "https://www.rottentomatoes.com/m/x", mc: null, lb: null };

test("una sola consulta para peticiones simultáneas y repetidas del mismo título", async () => {
  clearRatingLinksCache();
  let calls = 0;
  const resolve = async () => { calls += 1; return LINKS; };
  const [a, b] = await Promise.all([
    getRatingLinks({ type: "movie", tmdbId: "1" }, resolve),
    getRatingLinks({ type: "movie", tmdbId: "1" }, resolve),
  ]);
  assert.deepEqual(a, LINKS);
  assert.equal(a, b);
  await getRatingLinks({ type: "movie", tmdbId: "1" }, resolve);
  assert.equal(calls, 1);
  await getRatingLinks({ type: "tv", tmdbId: "1" }, resolve);
  assert.equal(calls, 2);
});

test("un fallo no se guarda: el siguiente intento vuelve a consultar", async () => {
  clearRatingLinksCache();
  let calls = 0;
  const failing = async () => { calls += 1; throw new Error("down"); };
  await assert.rejects(getRatingLinks({ type: "movie", tmdbId: "2" }, failing));
  await assert.rejects(getRatingLinks({ type: "movie", tmdbId: "2" }, failing));
  assert.equal(calls, 2);
});
