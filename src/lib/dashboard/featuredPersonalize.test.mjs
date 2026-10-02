import assert from "node:assert/strict";
import test from "node:test";

import { buildFeatured, FEATURED_HERO_SIZE } from "./featured.js";
import { isKnownTitleState, pickFreshFeatured } from "./featuredPersonalize.js";

const movie = (id) => ({ id, title: `Movie ${id}`, media_type: "movie" });
const ids = (items) => items.map((item) => item.id);

test("hero: sin biblioteca conocida se queda con la selección normal", () => {
  const items = Array.from({ length: 15 }, (_, i) => movie(i + 1));
  assert.deepEqual(ids(pickFreshFeatured(items, new Set(), 10)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(ids(pickFreshFeatured(items, null, 10)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("hero: los vistos o puntuados se sustituyen por candidatos de la reserva", () => {
  const items = Array.from({ length: 15 }, (_, i) => movie(i + 1));
  const seen = new Set(["movie:2", "movie:5"]);
  assert.deepEqual(ids(pickFreshFeatured(items, seen, 10)), [1, 3, 4, 6, 7, 8, 9, 10, 11, 12]);
});

test("hero: si no hay bastantes nuevos, completa con los ya vistos", () => {
  const items = Array.from({ length: 5 }, (_, i) => movie(i + 1));
  const seen = new Set(["movie:1", "movie:2", "movie:3"]);
  assert.deepEqual(ids(pickFreshFeatured(items, seen, 4)), [4, 5, 1, 2]);
});

test("hero: visto, puntuado o favorito cuenta como conocido; pendiente no", () => {
  assert.equal(isKnownTitleState({ watched: true }), true);
  assert.equal(isKnownTitleState({ rating: 8 }), true);
  assert.equal(isKnownTitleState({ favorite: true }), true);
  assert.equal(isKnownTitleState({ watchlist: true, rating: null }), false);
  assert.equal(isKnownTitleState({ rating: 0 }), false);
  assert.equal(isKnownTitleState(null), false);
});

test("buildFeatured: la reserva va detrás de la selección y no la repite", () => {
  const year = new Date().getFullYear() - 5;
  const trendingMovies = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    title: `Film ${i + 1}`,
    backdrop_path: `/b${i + 1}.jpg`,
    release_date: `${year}-01-01`,
    vote_average: 8 - i * 0.01,
    vote_count: 5000,
    popularity: 100,
    genre_ids: [i % 10],
  }));
  const plain = buildFeatured({ trendingMovies }, { size: FEATURED_HERO_SIZE, rotationBucket: 1 });
  const withReserve = buildFeatured(
    { trendingMovies },
    { size: FEATURED_HERO_SIZE, reserve: 20, rotationBucket: 1 },
  );

  assert.equal(plain.length, FEATURED_HERO_SIZE);
  assert.equal(withReserve.length, FEATURED_HERO_SIZE + 20);
  assert.deepEqual(ids(withReserve.slice(0, FEATURED_HERO_SIZE)), ids(plain));
  assert.equal(new Set(ids(withReserve)).size, withReserve.length);
});

test("hero: los títulos del hero de Inicio solo entran como último recurso", () => {
  const items = Array.from({ length: 6 }, (_, i) => movie(i + 1));
  const seen = new Set(["movie:2"]);
  const avoid = new Set(["movie:1", "movie:3"]);
  assert.deepEqual(ids(pickFreshFeatured(items, seen, 4, avoid)), [4, 5, 6, 2]);
  assert.deepEqual(ids(pickFreshFeatured(items, seen, 6, avoid)), [4, 5, 6, 2, 1, 3]);
  assert.deepEqual(ids(pickFreshFeatured(items, new Set(), 3, avoid)), [2, 4, 5]);
});
