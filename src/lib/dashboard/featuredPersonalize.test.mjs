import assert from "node:assert/strict";
import test from "node:test";

import { buildFeatured, classifyFeaturedCandidate, FEATURED_HERO_SIZE } from "./featured.js";
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

const NOW = Date.parse("2026-10-01T00:00:00Z");
const daysAgo = (days) => new Date(NOW - days * 864e5).toISOString().slice(0, 10);
const trending = { trendingMovies: { rank: 1, weight: 0.55 } };

test("notoriedad: un título en tendencia con pocos votos no entra", () => {
  const obscure = { media_type: "movie", release_date: daysAgo(200), vote_count: 40, vote_average: 8.4, popularity: 300, __featuredSources: trending };
  assert.equal(classifyFeaturedCandidate(obscure, NOW), null);
});

test("notoriedad: un estreno importante entra aunque aún tenga pocos votos", () => {
  const blockbuster = { media_type: "movie", release_date: daysAgo(14), vote_count: 320, vote_average: 7.6, popularity: 500, __featuredSources: trending };
  assert.equal(classifyFeaturedCandidate(blockbuster, NOW), "recent");
  // Sin popularidad ni fuente de demanda, el mismo estreno no es "importante".
  assert.equal(classifyFeaturedCandidate({ ...blockbuster, popularity: 20 }, NOW), null);
  assert.equal(classifyFeaturedCandidate({ ...blockbuster, __featuredSources: {} }, NOW), null);
});

test("notoriedad: asentados con miles de votos; fuera de ventana o sin estrenar, no", () => {
  const classic = { media_type: "movie", release_date: daysAgo(3650), vote_count: 25000, vote_average: 8.2, popularity: 40 };
  assert.equal(classifyFeaturedCandidate(classic, NOW), "established");
  assert.equal(classifyFeaturedCandidate({ ...classic, vote_count: 1800 }, NOW), null);
  assert.equal(classifyFeaturedCandidate({ ...classic, release_date: daysAgo(365 * 25) }, NOW), null);
  assert.equal(classifyFeaturedCandidate({ ...classic, release_date: daysAgo(-30) }, NOW), null);
  const talkShow = { media_type: "tv", first_air_date: daysAgo(3650), vote_count: 5000, vote_average: 7.8, genre_ids: [10767] };
  assert.equal(classifyFeaturedCandidate(talkShow, NOW), null);
});

test("buildFeatured: mezcla 4 estrenos y 6 asentados también en la reserva", () => {
  const recent = Array.from({ length: 30 }, (_, i) => ({
    id: 1000 + i, title: `New ${i}`, backdrop_path: "/n.jpg", release_date: daysAgo(30 + i * 5),
    vote_count: 3000, vote_average: 7.5, popularity: 400 - i, genre_ids: [i % 12],
  }));
  const established = Array.from({ length: 40 }, (_, i) => ({
    id: 2000 + i, title: `Old ${i}`, backdrop_path: "/o.jpg", release_date: daysAgo(2000 + i * 30),
    vote_count: 20000 - i * 100, vote_average: 8, popularity: 50, genre_ids: [i % 12],
  }));
  const list = buildFeatured(
    { trendingMovies: recent, recognizedMovies: established },
    { size: 10, reserve: 20, rotationBucket: 0, now: NOW },
  );
  assert.equal(list.length, 30);
  for (let block = 0; block < 3; block += 1) {
    const slice = list.slice(block * 10, block * 10 + 10);
    assert.equal(slice.filter((m) => m.id < 2000).length, 4, `bloque ${block}`);
  }
});
