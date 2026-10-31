import assert from "node:assert/strict";
import test from "node:test";

import { rankRecommendations } from "./recommendationRanking.js";

const TODAY = "2026-10-31";

const title = (id, extra = {}) => ({
  id,
  title: `T${id}`,
  poster_path: `/p${id}.jpg`,
  release_date: "2015-01-01",
  vote_average: 7,
  vote_count: 1000,
  ...extra,
});

const many = (from, count, extra) =>
  Array.from({ length: count }, (_, i) => title(from + i, extra));

test("junta Trakt y las páginas de TMDb sin duplicar ni incluir el propio título", () => {
  const ranked = rankRecommendations({
    related: [title(5), title(99), title(300, { media_type: "movie" })],
    recommendationPages: [many(1, 20), many(21, 20)],
    type: "movie",
    selfId: 99,
    today: TODAY,
  });
  const ids = ranked.map((item) => item.id);
  assert.equal(ids.length, 40);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes(99));
  assert.ok(ranked.every((item) => item.media_type === "movie"));
});

test("descarta sin póster, sin estrenar, de adultos y con muy pocos votos", () => {
  const ranked = rankRecommendations({
    recommendationPages: [
      [
        ...many(1, 12),
        title(100, { poster_path: null }),
        title(101, { release_date: "2027-03-01" }),
        title(102, { release_date: "" }),
        title(103, { adult: true }),
        title(104, { vote_count: 3, vote_average: 10 }),
      ],
    ],
    type: "movie",
    selfId: 1000,
    today: TODAY,
  });
  const ids = ranked.map((item) => item.id);
  for (const id of [100, 101, 102, 103, 104]) assert.ok(!ids.includes(id));
});

test("con pocos candidatos votados admite los de pocos votos, detrás", () => {
  const ranked = rankRecommendations({
    recommendationPages: [
      [title(1, { vote_count: 5, vote_average: 9.5 }), title(2)],
    ],
    type: "tv",
    today: TODAY,
  });
  assert.deepEqual(
    ranked.map((item) => item.id),
    [2, 1],
  );
});

test("la nota bayesiana adelanta un título bueno y muy votado a uno mediocre", () => {
  const recs = many(1, 20);
  recs[0] = title(1, { vote_average: 5.1, vote_count: 900 });
  recs[3] = title(4, { vote_average: 8.4, vote_count: 25000 });
  const ranked = rankRecommendations({
    recommendationPages: [recs],
    type: "movie",
    today: TODAY,
  });
  const ids = ranked.map((item) => item.id);
  assert.ok(ids.indexOf(4) < ids.indexOf(1));
});

test("Trakt manda en la relevancia y estar en las dos fuentes suma", () => {
  const ranked = rankRecommendations({
    related: [title(200), title(5), title(201)],
    recommendationPages: [many(1, 15)],
    type: "movie",
    today: TODAY,
  });
  const ids = ranked.map((item) => item.id);
  assert.equal(ids[0], 200);
  assert.ok(ids.indexOf(5) < ids.indexOf(1));
});
