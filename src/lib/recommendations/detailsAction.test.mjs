import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const recommendationsClient = readFileSync(
  new URL("../../app/recommendations/RecommendationsClient.jsx", import.meta.url),
  "utf8",
);

test("la fila de acciones permite abrir la ficha de la recomendación actual", () => {
  assert.match(recommendationsClient, /label="Más información"/);
  assert.match(recommendationsClient, /router\.push\(currentDetailsHref\)/);
  assert.match(recommendationsClient, /disabled={!currentDetailsHref}/);
  assert.match(recommendationsClient, /<Info \/>/);
});

test("la ficha actual se precarga sin consumir la recomendación", () => {
  assert.match(
    recommendationsClient,
    /currentDetailsHref = current \? detailsHref\(current\) : null/,
  );
  assert.match(recommendationsClient, /router\.prefetch\(currentDetailsHref\)/);
});
