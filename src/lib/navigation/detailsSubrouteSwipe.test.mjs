import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getDetailsSubrouteSequence,
  isDetailsSubroutePath,
} from "./detailsSubrouteSwipe.js";

test("solo las rutas de temporada y episodio publican anterior/siguiente", () => {
  assert.equal(isDetailsSubroutePath("/details/tv/1399/season/2"), true);
  assert.equal(isDetailsSubroutePath("/details/tv/1399/season/2/"), true);
  assert.equal(isDetailsSubroutePath("/details/tv/1399/season/2/episode/5"), true);
  assert.equal(isDetailsSubroutePath("/details/tv/1399"), false);
  assert.equal(isDetailsSubroutePath("/details/movie/550"), false);
  assert.equal(getDetailsSubrouteSequence("/details/tv/1399/season/2"), null);
});

test("temporadas y episodios publican los destinos de sus flechas y el gesto global los usa", async () => {
  const [season, episode, navigation] = await Promise.all([
    readFile(new URL("../../components/SeasonDetailsClient.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/EpisodeDetailsClient.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/MobileUserPageSwipeNavigation.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(
    season,
    /useDetailsSubrouteSwipe\(pathname, adjacentSeasonHrefs\.previousHref, adjacentSeasonHrefs\.nextHref\)/,
  );
  assert.match(
    episode,
    /useDetailsSubrouteSwipe\(pathname, adjacentEpisodeHrefs\.previousHref, adjacentEpisodeHrefs\.nextHref\)/,
  );
  assert.match(navigation, /getDetailsSubrouteSequence\(pathname\)/);
  assert.match(navigation, /useSyncExternalStore\(/);
  assert.match(navigation, /preservesSubrouteGesture/);
});
