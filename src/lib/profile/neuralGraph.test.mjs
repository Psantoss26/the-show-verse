import assert from "node:assert/strict";
import test from "node:test";

import {
  FLAG_FAVORITE,
  FLAG_WATCHED,
  FLAG_WATCHLIST,
  buildNeuralGraph,
  computeVisibility,
  fitCamera,
  searchNodes,
  titlePasses,
} from "./neuralGraph.js";

const payload = {
  genres: [[878, "Ciencia ficción"], [12, "Aventura"]],
  sagas: [[87096, "Avatar"]],
  titles: [
    [19995, 0, "Avatar", "/a.jpg", 2009, [0, 1], 0, 3, 10, FLAG_WATCHED | FLAG_FAVORITE],
    [76600, 0, "Avatar: El sentido del agua", "", 2022, [0, 1], 0, 1, 0, FLAG_WATCHED],
    [66732, 1, "Stranger Things", "", 2016, [0], -1, 34, 9, FLAG_WATCHED],
    [1, 0, "Pendiente", "", 0, [], -1, 0, 0, FLAG_WATCHLIST],
  ],
};

test("grafo: hubs primero y enlaces derivados de géneros y saga", () => {
  const graph = buildNeuralGraph(payload);
  assert.deepEqual(graph.nodes.slice(0, 3).map((n) => n.kind), ["genre", "genre", "saga"]);
  assert.equal(graph.nodes.length, 7);
  // Avatar: 2 géneros + saga; la secuela igual; Stranger Things: 1 género.
  assert.equal(graph.links.length, 7);
  assert.equal(graph.nodes[0].degree, 3); // Ciencia ficción
  assert.equal(graph.nodes[2].degree, 2); // saga Avatar
  assert.deepEqual(graph.stats, { titles: 4, movies: 3, series: 1, genres: 2, sagas: 1 });
  assert.ok(graph.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});

test("grafo: tamaños por visionados, pendientes pequeños y filtros", () => {
  const graph = buildNeuralGraph(payload);
  const [avatar, secuela, stranger, pending] = graph.nodes.slice(3);
  assert.ok(stranger.r > avatar.r && avatar.r > secuela.r);
  assert.equal(pending.pending, true);
  assert.equal(avatar.title.saga, "Avatar");
  assert.equal(titlePasses(stranger, { type: "movie" }), false);
  assert.equal(titlePasses(avatar, { record: "favorite" }), true);
  assert.equal(titlePasses(secuela, { record: "favorite" }), false);
  assert.equal(titlePasses(pending, { record: "pending" }), true);
});

test("visibilidad: un hub sin títulos visibles se oculta", () => {
  const graph = buildNeuralGraph(payload);
  const onlySeries = computeVisibility(graph, { type: "tv" });
  // Ciencia ficción (tiene Stranger Things) sí; Aventura y la saga Avatar no.
  assert.deepEqual([...onlySeries.slice(0, 3)], [1, 0, 0]);
  assert.equal(onlySeries[5], 1);
});

test("agrupar: solo género quita las sagas; por década crea un hub por década", () => {
  const genresOnly = buildNeuralGraph(payload, { groupBy: "genre" });
  assert.equal(genresOnly.nodes.filter((n) => n.kind === "saga").length, 0);
  assert.equal(genresOnly.links.length, 5);

  const decades = buildNeuralGraph(payload, { groupBy: "decade" });
  const hubs = decades.nodes.filter((n) => n.kind === "decade");
  assert.deepEqual(hubs.map((n) => n.label), ["Años 2000", "Años 2010", "Años 2020"]);
  // Cada título con año se une a su década; el que no tiene año queda suelto.
  assert.equal(decades.links.length, 3);
  const [avatar] = decades.nodes.filter((n) => n.kind === "title");
  assert.equal(avatar.color, hubs[0].color);
});

test("búsqueda sin tildes ni mayúsculas", () => {
  const graph = buildNeuralGraph(payload);
  assert.deepEqual(searchNodes(graph.nodes, "CIENCIA").length, 1);
  assert.deepEqual(searchNodes(graph.nodes, "stranger").map((i) => graph.nodes[i].label), ["Stranger Things"]);
  assert.deepEqual(searchNodes(graph.nodes, "  "), []);
});

test("encuadre: centra y ajusta el zoom a los puntos", () => {
  const cam = fitCamera([{ x: -100, y: 0 }, { x: 100, y: 0 }], 440, 300, { padding: 20 });
  assert.equal(cam.k, 2);
  assert.equal(cam.x, 0);
  assert.equal(cam.y, 0);
});
