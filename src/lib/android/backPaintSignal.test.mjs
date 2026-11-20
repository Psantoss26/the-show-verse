import test from "node:test";
import assert from "node:assert/strict";
import { normalizePath, popStateNeedsRouteCommit } from "./backPaintSignal.js";

test("la ruta se compara sin codificar y sin barra final", () => {
  assert.equal(normalizePath("/u/jos%C3%A9/"), "/u/josé");
  assert.equal(normalizePath(""), "/");
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("/%E0%A4%A"), "/%E0%A4%A");
});

test("volver a otra ruta espera a su commit", () => {
  assert.equal(popStateNeedsRouteCommit("/u/ana", "/details/movie/1"), true);
});

test("volver a la misma ruta (cambia la query) avisa sin esperar", () => {
  assert.equal(popStateNeedsRouteCommit("/favorites", "/favorites"), false);
  assert.equal(popStateNeedsRouteCommit("/u/jos%C3%A9", "/u/josé"), false);
});
