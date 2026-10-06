import assert from "node:assert/strict";
import test from "node:test";

import {
  FLAG_FAVORITE,
  FLAG_WATCHED,
  FLAG_WATCHLIST,
  buildNeuralGraph,
  computeVisibility,
  fitCamera,
  hubTitleIndices,
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

// Carga con los campos nuevos: [..., meses, listas, presupuesto, recaudación, nota TMDb].
const extended = {
  genres: [[878, "Ciencia ficción"]],
  sagas: [[87096, "Avatar"]],
  lists: [["l1", "Mi lista", "own"], ["c1", "Clásicos", "community"]],
  titles: [
    [19995, 0, "Avatar", "", 2009, [0], 0, 3, 8.5, FLAG_WATCHED, [202312, 202403], [0, 1], 237e6, 2.9e9, 7.6],
    [76600, 0, "Avatar 2", "", 2022, [0], 0, 1, 0, FLAG_WATCHED, [202403], [0], 460e6, 2.3e9, 7.7],
    [66732, 1, "Stranger Things", "", 2016, [0], -1, 34, 9, FLAG_WATCHED, [202501], [], 0, 0, 8.6],
    [1, 0, "Pendiente", "", 0, [], -1, 0, 0, FLAG_WATCHLIST],
  ],
};
const hubs = (graph, kind) => graph.nodes.filter((n) => n.kind === kind);

test("agrupar por visionado: años con sus meses; sin visionados no se une", () => {
  const graph = buildNeuralGraph(extended, { groupBy: "watched" });
  assert.deepEqual(hubs(graph, "year").map((n) => n.label), ["2023", "2024", "2025"]);
  assert.deepEqual(hubs(graph, "month").map((n) => n.label), ["dic 2023", "mar 2024", "ene 2025"]);
  assert.ok(hubs(graph, "month").every((n) => n.tier === "sub"));
  const index = (id) => graph.nodes.findIndex((n) => n.id === id);
  // Avatar: diciembre de 2023 y marzo de 2024; color del último año.
  assert.equal(graph.neighbors[index("movie:19995")].length, 2);
  assert.equal(graph.nodes[index("movie:19995")].color, hubs(graph, "year")[1].color);
  assert.equal(graph.neighbors[index("movie:1")].length, 0);
  // El año es visible por sus meses aunque no tenga títulos directos.
  const visible = computeVisibility(graph, { type: "tv" });
  const year2025 = graph.nodes.findIndex((n) => n.kind === "year" && n.id === 2025);
  const year2023 = graph.nodes.findIndex((n) => n.kind === "year" && n.id === 2023);
  assert.equal(visible[year2025], 1);
  assert.equal(visible[year2023], 0);
  // Los títulos de un año son los de sus meses, sin repetir.
  const year2024 = graph.nodes.findIndex((n) => n.kind === "year" && n.id === 2024);
  assert.equal(hubTitleIndices(graph, year2024).length, 2);
});

test("agrupar por listas: propias, de la comunidad y colecciones, con enlace", () => {
  const graph = buildNeuralGraph(extended, { groupBy: "lists" });
  assert.deepEqual(graph.nodes.slice(0, 3).map((n) => [n.kind, n.label, n.href]), [
    ["list", "Mi lista", "/lists/l1"],
    ["community", "Clásicos", "/lists/community/c1"],
    ["collection", "Avatar", "/lists/collection/87096"],
  ]);
  assert.equal(graph.nodes[0].degree, 2);
  assert.equal(graph.nodes[2].degree, 2);
});

test("agrupar por dinero: rangos de presupuesto y recaudación, solo con títulos", () => {
  const graph = buildNeuralGraph(extended, { groupBy: "money" });
  assert.deepEqual(hubs(graph, "budget").map((n) => n.label), ["Presupuesto > 200 M$"]);
  assert.deepEqual(hubs(graph, "revenue").map((n) => n.label), ["Recaudación > 1.000 M$"]);
  // La serie no tiene presupuesto: queda suelta.
  const series = graph.nodes.findIndex((n) => n.id === "tv:66732");
  assert.equal(graph.neighbors[series].length, 0);
});

test("agrupar por puntuaciones: tu nota entera y la de TMDb por tramos", () => {
  const graph = buildNeuralGraph(extended, { groupBy: "ratings" });
  assert.deepEqual(hubs(graph, "rating").map((n) => n.label), ["Tu nota 9", "Tu nota 8"]);
  assert.deepEqual(hubs(graph, "tmdb").map((n) => n.label), ["TMDb 8-9", "TMDb 7-8"]);
  const avatar2 = graph.nodes.findIndex((n) => n.id === "movie:76600");
  // Sin nota propia: solo el tramo de TMDb, y su color.
  assert.equal(graph.neighbors[avatar2].length, 1);
  assert.equal(graph.nodes[avatar2].color, hubs(graph, "tmdb")[1].color);
});

test("cargas antiguas (sin campos nuevos) no rompen las agrupaciones nuevas", () => {
  for (const groupBy of ["watched", "lists", "money", "ratings"]) {
    const graph = buildNeuralGraph(payload, { groupBy });
    assert.equal(graph.stats.titles, 4);
    assert.ok(graph.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  }
});
