// Simulación de fuerzas de la vista neural, FUERA del hilo principal.
//
// Con cientos o miles de nodos, cada paso de la simulación (repulsión con
// Barnes-Hut, enlaces y colisiones) cuesta milisegundos; en el hilo principal
// competiría con el scroll y el dibujo. Aquí corre a su ritmo y manda las
// posiciones como Float32Array transferible (sin copia) en cada paso.
//
// Mensajes de entrada:
//   { type: "init", nodes: [{ x, y, r, charge, saga }], links: [[a, b]], instant, resume }
//   { type: "drag", index, x, y }   fija un nodo mientras se arrastra
//   { type: "release", index }      lo suelta
//   { type: "stop" }
// Mensajes de salida:
//   { type: "tick", positions }     x0, y0, x1, y1…
//   { type: "end" }                 la simulación se ha asentado

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";

let simulation = null;
let nodes = [];
let timer = null;

function post() {
  const positions = new Float32Array(nodes.length * 2);
  for (let i = 0; i < nodes.length; i += 1) {
    positions[i * 2] = nodes[i].x;
    positions[i * 2 + 1] = nodes[i].y;
  }
  self.postMessage({ type: "tick", positions }, [positions.buffer]);
}

function run() {
  if (timer || !simulation) return;
  const step = () => {
    timer = null;
    if (!simulation) return;
    if (simulation.alpha() < simulation.alphaMin() && simulation.alphaTarget() === 0) {
      post();
      self.postMessage({ type: "end" });
      return;
    }
    simulation.tick();
    post();
    timer = setTimeout(step, 16);
  };
  step();
}

self.onmessage = ({ data }) => {
  if (data?.type === "init") {
    clearTimeout(timer);
    timer = null;
    nodes = data.nodes.map((node, index) => ({
      index,
      x: node.x,
      y: node.y,
      r: node.r,
      charge: node.charge,
      saga: Boolean(node.saga),
    }));
    const links = data.links.map(([source, target]) => ({ source, target }));
    for (const { source, target } of links) {
      nodes[source].degree = (nodes[source].degree || 0) + 1;
      nodes[target].degree = (nodes[target].degree || 0) + 1;
    }
    simulation = forceSimulation(nodes)
      // Por defecto la fuerza de cada enlace es 1/min(grados): un título tira
      // fuerte de su género, pero el género (con cientos de enlaces) apenas se
      // mueve por cada título. Es lo que forma los racimos.
      // Los enlaces de saga, más cortos y firmes: una saga tiene pocos enlaces y,
      // con la fuerza por defecto, la repulsión de los racimos densos la echaba
      // a la periferia, lejos de sus películas.
      .force(
        "link",
        forceLink(links)
          .distance((link) => (link.source.saga || link.target.saga ? 14 : 26) + link.source.r + link.target.r)
          .strength((link) => (link.source.saga || link.target.saga ? 0.9 : 1 / Math.max(1, Math.min(link.source.degree, link.target.degree)))),
      )
      .force(
        "charge",
        forceManyBody()
          .strength((node) => node.charge)
          .theta(0.9)
          .distanceMax(600),
      )
      // Gravedad hacia el centro: sin ella, un grupo sin conexión con el resto
      // (Documental, por ejemplo) sale despedido por la repulsión de los hubs.
      .force("x", forceX(0).strength(0.06))
      .force("y", forceY(0).strength(0.06))
      .force("collide", forceCollide((node) => node.r + 1.5).iterations(1))
      .alphaDecay(0.03)
      .velocityDecay(0.42)
      .stop();

    // Disposición guardada ya asentada: no se recoloca nada. La simulación
    // queda parada, lista para cuando se arrastre un nodo.
    if (data.resume) {
      simulation.alpha(0);
      post();
      self.postMessage({ type: "end" });
      return;
    }

    // Sin pasos ocultos: la vista ya está pintando estas posiciones de partida
    // (agrupadas por hub), así que la red se expande desde ellas de forma
    // continua; calcular unos pasos sin enseñarlos hacía que saltara de golpe.
    // Con "reducir movimiento" se asienta entera antes de mostrarla.
    const warm = data.instant ? 400 : 0;
    for (let i = 0; i < warm && simulation.alpha() >= simulation.alphaMin(); i += 1) simulation.tick();
    post();
    if (data.instant) {
      self.postMessage({ type: "end" });
      return;
    }
    run();
    return;
  }

  if (!simulation) return;
  if (data?.type === "drag") {
    const node = nodes[data.index];
    if (!node) return;
    node.fx = data.x;
    node.fy = data.y;
    simulation.alphaTarget(0.25);
    if (simulation.alpha() < 0.25) simulation.alpha(0.25);
    run();
  } else if (data?.type === "release") {
    const node = nodes[data.index];
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    simulation.alphaTarget(0);
    run();
  } else if (data?.type === "stop") {
    clearTimeout(timer);
    timer = null;
    simulation.stop();
    simulation = null;
  }
};
