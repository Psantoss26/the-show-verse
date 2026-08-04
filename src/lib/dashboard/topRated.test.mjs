import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { combineTopRatedItems } from "./topRated.js";

const dashboardClient = readFileSync(
  new URL("../../components/MainDashboardClient.jsx", import.meta.url),
  "utf8",
);

test("combina películas y series conservando el tipo y ordenando la clasificación", () => {
  const result = combineTopRatedItems(
    [
      { id: 1, title: "Película B", vote_average: 8.8, vote_count: 100 },
      { id: 2, title: "Película A", vote_average: 9.1, vote_count: 200 },
    ],
    [
      { id: 1, name: "Serie A", vote_average: 9.1, vote_count: 300 },
      { id: 3, name: "Serie B", vote_average: 8.7, vote_count: 500 },
    ],
  );

  assert.deepEqual(
    result.map(({ id, media_type }) => `${media_type}:${id}`),
    ["tv:1", "movie:2", "movie:1", "tv:3"],
  );
});

test("elimina duplicados solo dentro del mismo tipo", () => {
  const result = combineTopRatedItems(
    [{ id: 10, title: "Película", vote_average: 8 }],
    [
      { id: 10, name: "Serie", vote_average: 9 },
      { id: 10, name: "Serie repetida", vote_average: 7 },
    ],
  );

  assert.deepEqual(
    result.map(({ id, media_type }) => `${media_type}:${id}`),
    ["tv:10", "movie:10"],
  );
});

test("Mejor valoradas consume una sola lista mixta y no muestra selector", () => {
  const hero = dashboardClient.slice(
    dashboardClient.indexOf("function TopRatedHero"),
    dashboardClient.indexOf("/* =================== MainDashboard"),
  );

  assert.match(hero, /function TopRatedHero\(\{\s*items: mixedItems,/);
  assert.doesNotMatch(hero, /activeTab|Películas|Series/);
  assert.doesNotMatch(hero, /dashboardSegmentGroupClass/);
  assert.match(hero, /heroBackdrops\[itemBackdropKey\]/);
  assert.match(hero, /getBackdropCacheKey\(movie, mediaType\)/);
});
