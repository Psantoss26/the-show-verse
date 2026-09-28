// Reglas PURAS de la vista neuronal del perfil (sin React ni canvas).
//
// El backend manda una carga compacta (backend/src/lib/neuralGraphCore.js):
//   genres: [[id, nombre]], sagas: [[id, nombre]],
//   titles: [[tmdbId, esSerie, título, póster, año, [géneros], saga, vistas,
//             nota, flags]]
// Aquí se expande a nodos y enlaces. Los enlaces no viajan por la red: salen de
// los índices de género y saga de cada título.

export const FLAG_WATCHED = 1;
export const FLAG_RATED = 2;
export const FLAG_FAVORITE = 4;
export const FLAG_WATCHLIST = 8;

// Un color por género, REPARTIDOS POR TODO EL CÍRCULO CROMÁTICO y con
// luminosidades distintas: los géneros que suelen ir juntos (Acción/Aventura,
// Ciencia ficción/Fantasía, Crimen/Suspense, Romance/Drama) caen en tonos
// alejados para que sus racimos se distingan a simple vista.
export const GENRE_COLORS = {
  28: "#f43f3f", // Acción — rojo
  27: "#be123c", // Terror — carmesí
  10402: "#fda4af", // Música — rosa claro
  10749: "#ec4899", // Romance — rosa
  10766: "#f9a8d4", // Telenovela — rosa pálido
  14: "#d946ef", // Fantasía — fucsia
  10764: "#c084fc", // Reality — lila
  18: "#8b5cf6", // Drama — violeta
  9648: "#6366f1", // Misterio — índigo
  80: "#3b82f6", // Crimen — azul
  10767: "#7dd3fc", // Talk show — celeste
  878: "#22d3ee", // Ciencia ficción — cian
  99: "#2dd4bf", // Documental — turquesa
  16: "#10b981", // Animación — esmeralda
  10751: "#4ade80", // Familia — verde
  10752: "#84cc16", // Bélica — lima
  35: "#fde047", // Comedia — amarillo
  12: "#f59e0b", // Aventura — ámbar
  36: "#d6a26b", // Historia — tostado
  53: "#fb923c", // Suspense — naranja
  37: "#c2410c", // Western — óxido
  10763: "#94a3b8", // Noticias — pizarra
};
// Las sagas en un tono neutro: con un color de género se confundirían con él.
export const SAGA_COLOR = "#e7e5e4";
export const UNKNOWN_COLOR = "#71717a";

export function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Pseudoaleatorio con semilla (mulberry32): las posiciones iniciales son
// siempre las mismas para el mismo grafo, así no "baila" al volver a entrar.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Expande la carga del backend a un grafo.
 * @returns {{
 *   nodes: Array<{ kind: "genre"|"saga"|"title", label, color, r, degree,
 *                  x, y, search, title? }>,
 *   links: Array<[number, number]>,
 *   neighbors: Array<number[]>,
 *   stats: { titles, movies, series, genres, sagas },
 * }}
 * Los nodos van en orden: géneros, sagas y títulos.
 */
export function buildNeuralGraph(payload, { groupBy = "genre-saga" } = {}) {
  const genres = Array.isArray(payload?.genres) ? payload.genres : [];
  const sagas = Array.isArray(payload?.sagas) ? payload.sagas : [];
  const rows = Array.isArray(payload?.titles) ? payload.titles : [];
  const byDecade = groupBy === "decade";
  const withGenres = !byDecade;
  const withSagas = groupBy === "genre-saga";

  const nodes = [];
  const links = [];
  const genreBase = 0;
  if (withGenres) {
    for (const [id, name] of genres) {
      nodes.push({ kind: "genre", id, label: name, color: GENRE_COLORS[id] || UNKNOWN_COLOR, degree: 0 });
    }
  }
  const sagaBase = nodes.length;
  if (withSagas) {
    for (const [id, name] of sagas) {
      nodes.push({ kind: "saga", id, label: name, color: SAGA_COLOR, degree: 0 });
    }
  }
  // Décadas: una por cada década con algún título, de la más antigua a la más
  // reciente, con un degradado de color frío (antiguo) a cálido (actual).
  const decadeIndex = new Map();
  if (byDecade) {
    const decades = [...new Set(rows.map((row) => decadeOf(row[4])).filter((d) => d != null))].sort((x, y) => x - y);
    decades.forEach((decade, i) => {
      decadeIndex.set(decade, nodes.length);
      nodes.push({
        kind: "decade",
        id: decade,
        label: decadeLabel(decade),
        color: decadeColor(i, decades.length),
        degree: 0,
      });
    });
  }

  let movies = 0;
  let series = 0;
  for (const row of rows) {
    const [tmdbId, isTv, title, posterPath, year, genreIdx, sagaIdx, plays, rating, flags] = row;
    const index = nodes.length;
    const mediaType = isTv ? "tv" : "movie";
    if (isTv) series += 1;
    else movies += 1;
    const primary = Array.isArray(genreIdx) && genreIdx.length ? genres[genreIdx[0]]?.[0] : null;
    const decadeHub = byDecade ? decadeIndex.get(decadeOf(year)) : undefined;
    const onlyPending = (flags & FLAG_WATCHLIST) && !(flags & (FLAG_WATCHED | FLAG_RATED | FLAG_FAVORITE));
    const r = onlyPending
      ? 2.6
      : Math.min(9, 3 + 1.1 * Math.log2(1 + Math.max(0, plays)) + (flags & FLAG_FAVORITE ? 0.8 : 0));
    nodes.push({
      kind: "title",
      id: `${mediaType}:${tmdbId}`,
      label: title || "Sin título",
      color: byDecade
        ? decadeHub != null ? nodes[decadeHub].color : UNKNOWN_COLOR
        : primary ? GENRE_COLORS[primary] || UNKNOWN_COLOR : UNKNOWN_COLOR,
      r,
      degree: 0,
      pending: Boolean(onlyPending),
      search: normalizeSearch(title),
      title: {
        tmdbId,
        mediaType,
        title: title || "",
        posterPath: posterPath || null,
        year: year || null,
        genres: (genreIdx || []).map((i) => genres[i]?.[1]).filter(Boolean),
        saga: sagaIdx >= 0 ? sagas[sagaIdx]?.[1] || null : null,
        plays: plays || 0,
        rating: rating || 0,
        flags: flags || 0,
      },
    });
    if (withGenres) {
      for (const g of genreIdx || []) {
        if (g >= 0 && g < genres.length) links.push([genreBase + g, index]);
      }
    }
    if (withSagas && sagaIdx >= 0 && sagaIdx < sagas.length) links.push([sagaBase + sagaIdx, index]);
    if (decadeHub != null) links.push([decadeHub, index]);
  }

  const neighbors = nodes.map(() => []);
  for (const [a, b] of links) {
    neighbors[a].push(b);
    neighbors[b].push(a);
    nodes[a].degree += 1;
    nodes[b].degree += 1;
  }
  for (const node of nodes) {
    if (node.kind === "genre" || node.kind === "decade") node.r = 7 + 1.5 * Math.sqrt(node.degree);
    if (node.kind === "saga") node.r = 4.5 + 1.2 * Math.sqrt(node.degree);
    if (node.kind !== "title") node.search = normalizeSearch(node.label);
  }

  seedPositions(nodes, neighbors);
  return {
    nodes,
    links,
    neighbors,
    groupBy,
    stats: { titles: rows.length, movies, series, genres: genres.length, sagas: sagas.length },
  };
}

function decadeOf(year) {
  const y = Number(year);
  return Number.isInteger(y) && y > 1800 ? Math.floor(y / 10) * 10 : null;
}

function decadeLabel(decade) {
  return decade >= 2000 ? `Años ${decade}` : `Años ${String(decade).slice(2)}`;
}

// De azul (antiguo) a coral (actual) pasando por verde y ámbar.
function decadeColor(index, total) {
  const t = total > 1 ? index / (total - 1) : 1;
  const hue = 215 - t * 205;
  return `hsl(${Math.round((hue + 360) % 360)} 85% 62%)`;
}

/** Nombre de cada tipo de hub, para la ficha y la leyenda. */
export const HUB_KIND_LABEL = { genre: "Género", saga: "Saga", decade: "Década" };

// Posiciones de partida: los géneros en círculo (los más grandes, repartidos),
// cada saga y cada título junto al centro de sus hubs. La simulación parte así
// casi ordenada y converge en muchos menos pasos que desde puntos al azar.
function seedPositions(nodes, neighbors) {
  const random = seeded(nodes.length * 2654435761);
  const isMainHub = (node) => node.kind === "genre" || node.kind === "decade";
  const hubCount = nodes.filter(isMainHub).length;
  const radius = 90 + 55 * Math.sqrt(Math.max(1, hubCount));
  const order = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => isMainHub(node))
    .sort((a, b) => b.node.degree - a.node.degree);
  order.forEach(({ node }, i) => {
    const angle = (i / Math.max(1, order.length)) * Math.PI * 2 + (i % 2) * 0.35;
    const dist = radius * (i % 2 ? 0.62 : 1);
    node.x = Math.cos(angle) * dist;
    node.y = Math.sin(angle) * dist;
  });
  const around = (index) => {
    const hubs = neighbors[index].filter((n) => isMainHub(nodes[n]));
    if (!hubs.length) return { x: (random() - 0.5) * radius * 2.4, y: (random() - 0.5) * radius * 2.4 };
    const x = hubs.reduce((sum, n) => sum + nodes[n].x, 0) / hubs.length;
    const y = hubs.reduce((sum, n) => sum + nodes[n].y, 0) / hubs.length;
    return { x, y };
  };
  nodes.forEach((node, index) => {
    if (isMainHub(node)) return;
    const center = around(index);
    const spread = node.kind === "saga" ? 20 : 45;
    node.x = center.x + (random() - 0.5) * spread;
    node.y = center.y + (random() - 0.5) * spread;
  });
}

const RECORD_FLAG = {
  watched: FLAG_WATCHED,
  rated: FLAG_RATED,
  favorite: FLAG_FAVORITE,
  pending: FLAG_WATCHLIST,
};

/** ¿Pasa este título los filtros? `type`: all|movie|tv; `record`: all|watched|rated|favorite|pending. */
export function titlePasses(node, { type = "all", record = "all" } = {}) {
  if (node.kind !== "title") return true;
  if (type !== "all" && node.title.mediaType !== type) return false;
  if (record !== "all" && !(node.title.flags & RECORD_FLAG[record])) return false;
  return true;
}

/**
 * Nodos visibles con los filtros (1/0 por índice). Un hub solo se ve si le
 * queda algún título visible: filtrar "Series" no deja sagas vacías flotando.
 */
export function computeVisibility(graph, filters = {}) {
  const visible = new Uint8Array(graph.nodes.length);
  graph.nodes.forEach((node, i) => {
    if (node.kind === "title") visible[i] = titlePasses(node, filters) ? 1 : 0;
  });
  graph.nodes.forEach((node, i) => {
    if (node.kind !== "title") visible[i] = graph.neighbors[i].some((n) => visible[n]) ? 1 : 0;
  });
  return visible;
}

/** Índices de los nodos cuyo nombre contiene la búsqueda (sin tildes). */
export function searchNodes(nodes, query, limit = 200) {
  const q = normalizeSearch(query);
  if (!q) return [];
  const out = [];
  for (let i = 0; i < nodes.length && out.length < limit; i += 1) {
    if (nodes[i].search?.includes(q)) out.push(i);
  }
  return out;
}

/** Encuadre (centro y zoom) que contiene los puntos dados. */
export function fitCamera(points, width, height, { padding = 60, minK = 0.08, maxK = 2.5 } = {}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y, r = 0 } of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, k: 1 };
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const k = Math.min(maxK, Math.max(minK, Math.min((width - padding * 2) / w, (height - padding * 2) / h)));
  return { x: 0 - ((minX + maxX) / 2) * k, y: 0 - ((minY + maxY) / 2) * k, k };
}
