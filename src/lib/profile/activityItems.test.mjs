import assert from "node:assert/strict";
import test from "node:test";

import { dedupeActivityItems } from "./activityItems.js";

test("conserva una sola copia de cada evento de actividad al solaparse páginas", () => {
  const firstRating = { id: "rating:652e5d7c-5831-43dc-a80a-2408ca6cbea5", rating: 8 };
  const repeatedRating = { id: firstRating.id, rating: 8, stale: true };
  const watched = { id: "watched:abc" };

  assert.deepEqual(
    dedupeActivityItems([firstRating, watched, repeatedRating]),
    [firstRating, watched],
  );
});

test("no descarta eventos sin una identidad pública", () => {
  const anonymousA = { type: "list" };
  const anonymousB = { type: "list" };

  assert.deepEqual(dedupeActivityItems([anonymousA, anonymousB]), [anonymousA, anonymousB]);
});
