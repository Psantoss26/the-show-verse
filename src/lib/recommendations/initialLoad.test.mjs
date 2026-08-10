import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const recommendationsClient = readFileSync(
  new URL("../../app/recommendations/RecommendationsClient.jsx", import.meta.url),
  "utf8",
);

test("la carga inicial no muestra un icono antes de que la baraja esté lista", () => {
  assert.doesNotMatch(recommendationsClient, /Loader2/);
  assert.match(recommendationsClient, /\) : loading \? null : showEmpty \? \(/);
});
