import assert from "node:assert/strict";
import test from "node:test";

import {
  FLAG_FAVORITE,
  FLAG_WATCHED,
  FLAG_WATCHLIST,
  buildNeuralGraph,
  computeVisibility,
  fitCamera,
  groupSummary,
  hubTitleIndices,
  normalizeGroups,
  searchNodes,
  titleFacts,
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

test("agrupar: solo género no crea sagas; por década crea un hub por década", () => {
  const genresOnly = buildNeuralGraph(payload, { groups: ["genre"] });
  assert.equal(genresOnly.nodes.filter((n) => n.kind === "saga").length, 0);
  assert.equal(genresOnly.links.length, 5);

  const decades = buildNeuralGraph(payload, { groups: ["decade"] });
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

test("encuadre: con recorte, unos pocos nodos sueltos no alejan la red", () => {
  // 98 puntos en un cuadrado de 200 y dos sueltos muy arriba y abajo.
  const points = Array.from({ length: 98 }, (_, i) => ({ x: (i % 14) * 15 - 100, y: Math.floor(i / 14) * 30 - 100 }));
  points.push({ x: 0, y: -900 }, { x: 0, y: 900 });
  const all = fitCamera(points, 400, 400, { padding: 0 });
  const trimmed = fitCamera(points, 400, 400, { padding: 0, trimY: 0.02 });
  // Recortar solo a lo ancho no sirve aquí: los sueltos están arriba y abajo.
  assert.ok(fitCamera(points, 400, 400, { padding: 0, trimX: 0.02 }).k < 0.25);
  assert.ok(all.k < 0.25);
  assert.ok(trimmed.k > 1.8);
  // Margen distinto por eje.
  const wide = fitCamera([{ x: -100, y: -100 }, { x: 100, y: 100 }], 220, 1000, { padX: 10, padY: 300 });
  assert.equal(wide.k, 1);
});

// Carga con los campos nuevos: [..., meses, listas, presupuesto, recaudación, id de IMDb].
const extended = {
  genres: [[878, "Ciencia ficción"]],
  sagas: [[87096, "Avatar"]],
  lists: [["l1", "Mi lista", "own"], ["c1", "Clásicos", "community"]],
  titles: [
    [19995, 0, "Avatar", "", 2009, [0], 0, 3, 8.5, FLAG_WATCHED, [202312, 202403], [0, 1], 237e6, 2.9e9, "tt0499549"],
    [76600, 0, "Avatar 2", "", 2022, [0], 0, 1, 0, FLAG_WATCHED, [202403], [0], 460e6, 2.3e9, "tt1630029"],
    [66732, 1, "Stranger Things", "", 2016, [0], -1, 34, 9, FLAG_WATCHED, [202501], [], 0, 0, "tt4574334"],
    [1, 0, "Pendiente", "", 0, [], -1, 0, 0, FLAG_WATCHLIST],
  ],
};
const hubs = (graph, kind) => graph.nodes.filter((n) => n.kind === kind);

test("agrupar por visionado: años con sus meses; sin visionados no se une", () => {
  const graph = buildNeuralGraph(extended, { groups: ["watched"] });
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
  const graph = buildNeuralGraph(extended, { groups: ["lists"] });
  assert.deepEqual(graph.nodes.slice(0, 3).map((n) => [n.kind, n.label, n.href]), [
    ["list", "Mi lista", "/lists/l1"],
    ["community", "Clásicos", "/lists/community/c1"],
    ["collection", "Avatar", "/lists/collection/87096"],
  ]);
  assert.equal(graph.nodes[0].degree, 2);
  assert.equal(graph.nodes[2].degree, 2);
});

test("agrupar por dinero: rangos de presupuesto, recaudación y beneficio, solo con títulos", () => {
  const graph = buildNeuralGraph(extended, { groups: ["money"] });
  assert.deepEqual(hubs(graph, "budget").map((n) => n.label), ["Presupuesto > 200 M$"]);
  assert.deepEqual(hubs(graph, "revenue").map((n) => n.label), ["Recaudación > 1.000 M$"]);
  assert.deepEqual(hubs(graph, "profit").map((n) => n.label), ["Beneficio > 1.000 M$"]);
  // Pérdidas, y sin beneficio si falta una de las dos cifras.
  const flop = buildNeuralGraph({
    ...extended,
    titles: [[5, 0, "Fracaso", "", 2020, [], -1, 1, 0, FLAG_WATCHED, [], [], 90e6, 30e6], [6, 0, "Sin cifras", "", 2020, [], -1, 1, 0, FLAG_WATCHED, [], [], 90e6, 0]],
  }, { groups: ["money"] });
  assert.deepEqual(hubs(flop, "profit").map((n) => n.label), ["Con pérdidas"]);
  assert.equal(flop.neighbors[flop.nodes.findIndex((n) => n.id === "movie:6")].length, 1);
  assert.deepEqual(titleFacts(flop, flop.nodes.findIndex((n) => n.id === "movie:5")), ["Presupuesto 90 M$ · Recaudación 30 M$"]);
  // La serie no tiene presupuesto: queda suelta.
  const series = graph.nodes.findIndex((n) => n.id === "tv:66732");
  assert.equal(graph.neighbors[series].length, 0);
});

test("agrupar por puntuaciones: tu nota entera y la de IMDb por tramos", () => {
  const imdb = { "movie:19995": 7.9, "movie:76600": 7.5, "tv:66732": 8.6 };
  const graph = buildNeuralGraph(extended, { groups: ["ratings"], imdb });
  assert.deepEqual(hubs(graph, "rating").map((n) => n.label), ["Tu nota 9", "Tu nota 8"]);
  assert.deepEqual(hubs(graph, "imdb").map((n) => n.label), ["IMDb 8-9", "IMDb 7-8"]);
  const avatar2 = graph.nodes.findIndex((n) => n.id === "movie:76600");
  // Sin nota propia: solo el tramo de IMDb, y su color.
  assert.equal(graph.neighbors[avatar2].length, 1);
  assert.equal(graph.nodes[avatar2].color, hubs(graph, "imdb")[1].color);
  // Sin notas de IMDb (aún no llegan o no las hay), solo la tuya.
  assert.equal(hubs(buildNeuralGraph(extended, { groups: ["ratings"] }), "imdb").length, 0);
});

test("ficha del título: una línea por tipo de dato de la agrupación", () => {
  const facts = (groupBy, id, options = {}) => {
    const graph = buildNeuralGraph(extended, { groups: groupBy, ...options });
    return titleFacts(graph, graph.nodes.findIndex((n) => n.id === id));
  };
  assert.deepEqual(facts("genre-saga", "movie:19995"), ["Avatar", "Ciencia ficción"]);
  assert.deepEqual(facts("genre", "movie:19995"), ["Ciencia ficción"]);
  assert.deepEqual(facts("decade", "movie:19995"), ["Años 2000"]);
  assert.deepEqual(facts("watched", "movie:19995"), ["Visto en mar 2024, dic 2023"]);
  assert.deepEqual(facts("watched", "movie:1"), ["Sin visionados"]);
  assert.deepEqual(facts("lists", "movie:19995"), ["Mi lista · Clásicos · Avatar"]);
  // En ninguna lista: sin línea.
  assert.deepEqual(facts("lists", "tv:66732"), []);
  assert.deepEqual(facts("money", "movie:19995"), ["Presupuesto 237 M$ · Recaudación 2.900 M$"]);
  // Las series no tienen cifras: no se dice nada.
  assert.deepEqual(facts("money", "tv:66732"), []);
  assert.deepEqual(facts("ratings", "movie:19995", { imdb: { "movie:19995": 7.9 } }), ["IMDb 7,9"]);
  assert.deepEqual(facts("ratings", "movie:19995"), ["Sin nota de IMDb"]);
});

test("cargas antiguas (sin campos nuevos) no rompen las agrupaciones nuevas", () => {
  for (const groupBy of ["watched", "lists", "money", "ratings"]) {
    const graph = buildNeuralGraph(payload, { groups: [groupBy] });
    assert.equal(graph.stats.titles, 4);
    assert.ok(graph.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  }
});

test("agrupaciones: válidas, sin repetir, en orden fijo y nunca vacías", () => {
  assert.deepEqual(normalizeGroups(["decade", "genre", "decade", "otra"]), ["genre", "decade"]);
  assert.deepEqual(normalizeGroups("genre-saga"), ["genre", "saga"]);
  assert.deepEqual(normalizeGroups("money"), ["money"]);
  assert.deepEqual(normalizeGroups([]), ["genre", "saga"]);
  assert.deepEqual(normalizeGroups(null), ["genre", "saga"]);
});

test("mezclar: cada título se une a los hubs de todas las agrupaciones marcadas", () => {
  const graph = buildNeuralGraph(payload, { groups: ["decade", "genre"] });
  assert.deepEqual(graph.groups, ["genre", "decade"]);
  assert.equal(hubs(graph, "genre").length, 2);
  assert.equal(hubs(graph, "decade").length, 3);
  // Avatar: 2 géneros + su década.
  const avatar = graph.nodes.findIndex((n) => n.id === "movie:19995");
  assert.equal(graph.neighbors[avatar].length, 3);
  // Con géneros, el color sigue siendo el del género principal.
  assert.equal(graph.nodes[avatar].color, hubs(graph, "genre")[0].color);
  assert.ok([...hubs(graph, "genre"), ...hubs(graph, "decade")].every((n) => n.tier === "main"));
  // Cada hub sabe de qué agrupación es.
  assert.deepEqual([...new Set(graph.nodes.filter((n) => n.kind !== "title").map((n) => n.group))], ["genre", "decade"]);
});

test("saga: sola forma racimos; junto a otra se queda dentro y no da el color", () => {
  const alone = buildNeuralGraph(payload, { groups: ["saga"] });
  assert.equal(hubs(alone, "saga")[0].tier, "main");
  assert.equal(hubs(alone, "genre").length, 0);
  assert.equal(alone.nodes.find((n) => n.id === "movie:19995").color, hubs(alone, "saga")[0].color);

  const mixed = buildNeuralGraph(payload, { groups: ["saga", "decade"] });
  assert.equal(hubs(mixed, "saga")[0].tier, "sub");
  const avatar = mixed.nodes.find((n) => n.id === "movie:19995");
  assert.equal(avatar.color, hubs(mixed, "decade")[0].color);
});

test("listas + saga: las colecciones no se duplican (son las sagas)", () => {
  const graph = buildNeuralGraph(extended, { groups: ["lists", "saga"] });
  assert.equal(hubs(graph, "collection").length, 0);
  assert.equal(hubs(graph, "saga").length, 1);
  assert.equal(hubs(graph, "list").length, 1);
  const avatar = graph.nodes.findIndex((n) => n.id === "movie:19995");
  // Mi lista, Clásicos y la saga Avatar.
  assert.equal(graph.neighbors[avatar].length, 3);
});

test("ficha y pie con varias agrupaciones", () => {
  const imdb = { "movie:19995": 7.9 };
  const graph = buildNeuralGraph(extended, { groups: ["genre", "saga", "decade", "ratings"], imdb });
  const avatar = graph.nodes.findIndex((n) => n.id === "movie:19995");
  assert.deepEqual(titleFacts(graph, avatar), ["Avatar", "Ciencia ficción", "Años 2000", "IMDb 7,9"]);
  // Varios géneros en su línea; las cifras de una serie no ocupan ninguna.
  const mixed = buildNeuralGraph(payload, { groups: ["genre", "money", "watched"] });
  assert.deepEqual(titleFacts(mixed, mixed.nodes.findIndex((n) => n.id === "movie:19995")), ["Ciencia ficción · Aventura", "Sin visionados"]);
  assert.deepEqual(titleFacts(mixed, mixed.nodes.findIndex((n) => n.id === "tv:66732")), ["Ciencia ficción", "Sin visionados"]);

  const all = new Uint8Array(graph.nodes.length).fill(1);
  assert.deepEqual(groupSummary(graph, all), ["1 género", "1 saga", "3 décadas", "3 notas"]);
  // Solo series: ni saga ni décadas de películas.
  assert.deepEqual(groupSummary(graph, computeVisibility(graph, { type: "tv" })), ["1 género", "0 sagas", "1 década", "1 nota"]);
});
