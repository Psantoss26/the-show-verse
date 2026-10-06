import assert from "node:assert/strict";
import test from "node:test";

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";

import { buildNeuralGraph } from "./neuralGraph.js";
import { NEURAL_GRAVITY, forceAspect, neuralLayoutAspect } from "./neuralForces.js";

test("proporción de la red: vertical por tramos, horizontal sin cambio", () => {
  assert.equal(neuralLayoutAspect(1440, 900), 1);
  assert.equal(neuralLayoutAspect(1180, 820), 1); // tableta en horizontal
  assert.equal(neuralLayoutAspect(820, 1180), 1); // en vertical, casi cuadrado
  assert.equal(neuralLayoutAspect(390, 844), 1.5); // móvil
  assert.equal(neuralLayoutAspect(412, 915), 1.5);
  assert.equal(neuralLayoutAspect(360, 640), 1); // móvil pequeño: lienzo casi cuadrado
  assert.equal(neuralLayoutAspect(320, 1400), 2); // con tope
  assert.equal(neuralLayoutAspect(0, 0), 1);
});

// Red sintética como la de un perfil real: ~560 títulos, géneros desiguales,
// sagas, décadas, visionados, listas, cifras y notas.
function payload() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const genreIds = [28, 12, 878, 18, 35, 27, 80, 16, 99, 10749, 14, 9648, 53, 36, 10402, 10752, 37, 10751];
  const titles = [];
  for (let i = 0; i < 560; i += 1) {
    const tv = rnd() < 0.15 ? 1 : 0;
    const genres = [Math.floor(rnd() ** 1.6 * 18)];
    if (rnd() < 0.6) genres.push(Math.floor(rnd() * 18));
    titles.push([
      i, tv, `t${i}`, "", 1980 + Math.floor(rnd() * 45), [...new Set(genres)],
      !tv && rnd() < 0.25 ? Math.floor(rnd() * 33) : -1, 1 + Math.floor(rnd() * 6),
      rnd() < 0.6 ? 1 + Math.floor(rnd() * 10) : 0, 1, [202001 + 100 * Math.floor(rnd() * 6)],
      rnd() < 0.3 ? [Math.floor(rnd() * 4)] : [], tv ? 0 : rnd() * 3e8, tv ? 0 : rnd() * 1.5e9, "",
    ]);
  }
  return {
    v: "test",
    genres: genreIds.map((id, i) => [id, `G${i}`]),
    sagas: Array.from({ length: 33 }, (_, i) => [i + 1, `S${i}`]),
    lists: [["l1", "a", "own"], ["l2", "b", "own"], ["c1", "c", "community"], ["c2", "d", "community"]],
    titles,
  };
}

// Mismas fuerzas que el worker; devuelve la proporción alto/ancho de la red
// (entre los percentiles 3 y 97, sin los nodos más sueltos) y su dispersión.
function settle(groups, aspect) {
  const graph = buildNeuralGraph(payload(), { groups, aspect });
  const nodes = graph.nodes.map((n) => ({
    x: n.x, y: n.y, r: n.r,
    charge: n.kind === "title" ? -26 : n.tier === "sub" ? -40 : -320,
    saga: n.kind !== "title" && n.tier === "sub",
    degree: n.degree,
  }));
  const links = graph.links.map(([source, target]) => ({ source, target }));
  const simulation = forceSimulation(nodes)
    .force("link", forceLink(links)
      .distance((l) => (l.source.saga || l.target.saga ? 14 : 26) + l.source.r + l.target.r)
      .strength((l) => (l.source.saga || l.target.saga ? 0.9 : 1 / Math.max(1, Math.min(l.source.degree, l.target.degree)))))
    .force("charge", forceManyBody().strength((n) => n.charge).theta(0.9).distanceMax(600))
    .force("x", forceX(0).strength(NEURAL_GRAVITY))
    .force("y", forceY(0).strength(NEURAL_GRAVITY))
    .force("aspect", forceAspect(aspect))
    .force("collide", forceCollide((n) => n.r + 1.5).iterations(1))
    .alphaDecay(0.03)
    .velocityDecay(0.42)
    .stop();
  while (simulation.alpha() >= simulation.alphaMin()) simulation.tick();
  const range = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(0.97 * (sorted.length - 1))] - sorted[Math.floor(0.03 * (sorted.length - 1))];
  };
  const extent = (values) => Math.max(...values) - Math.min(...values);
  // Como en la vista: un hub sin títulos (una saga vacía) no se pinta.
  const shown = nodes.filter((n) => n.degree > 0);
  const xs = shown.map((n) => n.x);
  const ys = shown.map((n) => n.y);
  return { ratio: range(ys) / range(xs), spanY: extent(ys), coreY: range(ys) };
}

test("forma: en vertical la red se alarga, sea densa o no; en horizontal, igual que antes", () => {
  const sparse = ["genre", "saga"];
  const dense = ["genre", "saga", "decade", "watched", "lists", "money", "ratings"];
  for (const groups of [sparse, dense]) {
    const flat = settle(groups, 1);
    // Proporción 1: la fuerza no actúa (la red sale más o menos redonda).
    assert.ok(flat.ratio > 0.8 && flat.ratio < 1.25, `${groups} sin forma: ${flat.ratio}`);
    const tall = settle(groups, 1.75);
    assert.ok(tall.ratio > 1.4 && tall.ratio < 2, `${groups} en vertical: ${tall.ratio}`);
    // Sin nodos despedidos: lo más alejado sigue cerca del cuerpo de la red
    // (sin la fuerza, la red densa ya llega a ~1,5).
    assert.ok(tall.spanY < tall.coreY * 1.7, `${groups} dispersión: ${tall.spanY} / ${tall.coreY}`);
  }
});
