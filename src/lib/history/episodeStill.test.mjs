import test from "node:test";
import assert from "node:assert/strict";

import {
  historyEpisodeStillSrc,
  historyEpisodeStillSrcSet,
  readResolvedSeasonMetadata,
} from "./episodeSeasonMetadata.js";

test("las miniaturas piden tamaños de still, no w780", () => {
  assert.equal(historyEpisodeStillSrc("/a.jpg"), "https://image.tmdb.org/t/p/w300/a.jpg");
  assert.equal(
    historyEpisodeStillSrcSet("/a.jpg"),
    "https://image.tmdb.org/t/p/w185/a.jpg 185w, https://image.tmdb.org/t/p/w300/a.jpg 300w",
  );
  assert.equal(historyEpisodeStillSrc(null), null);
  assert.equal(historyEpisodeStillSrcSet("  "), undefined);
});

test("solo devuelve metadatos cuando todas las temporadas están resueltas", () => {
  const cache = new Map();
  cache.set("10:1", new Map([["1:1", { title: "Uno", stillPath: "/1.jpg" }]]));
  cache.set("10:2", Promise.resolve(new Map()));
  assert.equal(readResolvedSeasonMetadata(cache, 10, [1, 2]), null);

  cache.set("10:2", new Map([["2:3", { title: "Tres", stillPath: null }]]));
  const merged = readResolvedSeasonMetadata(cache, 10, [1, 2]);
  assert.deepEqual([...merged.keys()], ["1:1", "2:3"]);
  assert.equal(readResolvedSeasonMetadata(cache, null, [1]), null);
  assert.equal(readResolvedSeasonMetadata(cache, 10, []), null);
});
