// Reglas PURAS de la vista neuronal del perfil (sin React ni canvas).
//
// El backend manda una carga compacta (backend/src/lib/neuralGraphCore.js):
//   genres: [[id, nombre]], sagas: [[id, nombre]], lists: [[id, nombre, tipo]],
//   titles: [[tmdbId, esSerie, título, póster, año, [géneros], saga, vistas,
//             nota, flags, [meses AAAAMM], [listas], presupuesto, recaudación,
//             nota de TMDb]]
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

// Agrupaciones de la red. Cada una decide a qué HUBS se une cada título:
//   genre-saga  géneros y sagas            genre    solo géneros
//   decade      década de estreno          watched  año y mes de visionado
//   lists       listas propias, de la comunidad guardadas y colecciones
//   money       presupuesto y recaudación  ratings  tu nota y la de TMDb
// Los hubs `main` forman los racimos (y la leyenda); los `sub` (sagas, meses)
// se quedan dentro del racimo de sus títulos, con enlaces cortos.
export const GROUP_BY_VALUES = ["genre-saga", "genre", "decade", "watched", "lists", "money", "ratings"];

/** Nombre de cada tipo de hub, para la ficha y la leyenda. */
export const HUB_KIND_LABEL = {
  genre: "Género",
  saga: "Saga",
  decade: "Década",
  year: "Año de visionado",
  month: "Mes de visionado",
  list: "Tu lista",
  community: "Lista de la comunidad",
  collection: "Colección",
  budget: "Presupuesto",
  revenue: "Recaudación",
  rating: "Tu nota",
  tmdb: "Nota de TMDb",
};

/** Cómo se llaman los grupos de cada agrupación en el pie de la vista. */
export const GROUP_NOUN = {
  "genre-saga": "géneros",
  genre: "géneros",
  decade: "décadas",
  watched: "años",
  lists: "listas y colecciones",
  money: "rangos",
  ratings: "notas",
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

// Rangos en dólares: [desde, etiqueta]. Se elige el último cuyo "desde" no
// supera la cifra.
const BUDGET_RANGES = [[0, "< 1 M$"], [1e6, "1-10 M$"], [1e7, "10-50 M$"], [5e7, "50-100 M$"], [1e8, "100-200 M$"], [2e8, "> 200 M$"]];
const REVENUE_RANGES = [[0, "< 10 M$"], [1e7, "10-100 M$"], [1e8, "100-500 M$"], [5e8, "500 M$-1.000 M$"], [1e9, "> 1.000 M$"]];
const TMDB_RANGES = [[0, "< 5"], [5, "5-6"], [6, "6-7"], [7, "7-8"], [8, "8-9"], [9, "9-10"]];

function rangeIndex(ranges, value) {
  let index = 0;
  ranges.forEach(([from], i) => {
    if (value >= from) index = i;
  });
  return index;
}

// Escalas de color: de frío (antiguo, poco) a cálido (reciente, mucho), y las
// notas de rojo (baja) a verde (alta).
function gradientColor(index, total, { from = 215, to = 10, sat = 85, light = 62 } = {}) {
  const t = total > 1 ? index / (total - 1) : 1;
  const hue = from + (to - from) * t;
  return `hsl(${Math.round((hue + 360) % 360)} ${sat}% ${light}%)`;
}
const scoreColor = (score) => gradientColor(Math.max(0, Math.min(10, score)), 11, { from: 0, to: 135, sat: 78, light: 58 });

// Listas: tonos repartidos por el círculo, separados de los de la comunidad.
const LIST_COLORS = ["#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#fb7185", "#2dd4bf", "#c084fc", "#facc15", "#4ade80"];
const COMMUNITY_COLORS = ["#38bdf8", "#818cf8", "#22d3ee", "#93c5fd", "#67e8f9"];

/**
 * Expande la carga del backend a un grafo.
 * @returns {{
 *   nodes: Array<{ kind, tier?: "main"|"sub", label, color, r, degree, x, y,
 *                  search, order?, href?, title? }>,
 *   links: Array<[number, number]>,
 *   neighbors: Array<number[]>,
 *   stats: { titles, movies, series, genres, sagas },
 * }}
 * Los nodos van en orden: hubs (en el orden en que aparecen) y títulos.
 */
export function buildNeuralGraph(payload, { groupBy = "genre-saga" } = {}) {
  const genres = Array.isArray(payload?.genres) ? payload.genres : [];
  const sagas = Array.isArray(payload?.sagas) ? payload.sagas : [];
  const lists = Array.isArray(payload?.lists) ? payload.lists : [];
  const rows = Array.isArray(payload?.titles) ? payload.titles : [];
  const mode = GROUP_BY_VALUES.includes(groupBy) ? groupBy : "genre-saga";

  const nodes = [];
  const links = [];
  const hubIndex = new Map();
  const hub = (kind, id) => hubIndex.get(`${kind}:${id}`);
  const addHub = (kind, id, label, color, { tier = "main", order, href } = {}) => {
    const key = `${kind}:${id}`;
    if (hubIndex.has(key)) return hubIndex.get(key);
    hubIndex.set(key, nodes.length);
    nodes.push({ kind, tier, id, label, color, degree: 0, ...(order != null ? { order } : {}), ...(href ? { href } : {}) });
    return nodes.length - 1;
  };
  const hubLinks = [];

  // ── Hubs de la agrupación, antes que los títulos ──────────────────────────
  if (mode === "genre-saga" || mode === "genre") {
    for (const [id, name] of genres) addHub("genre", id, name, GENRE_COLORS[id] || UNKNOWN_COLOR);
  }
  if (mode === "genre-saga") {
    for (const [id, name] of sagas) addHub("saga", id, name, SAGA_COLOR, { tier: "sub", href: `/lists/collection/${id}` });
  }
  if (mode === "decade") {
    // De la más antigua a la más reciente, de color frío a cálido.
    const decades = [...new Set(rows.map((row) => decadeOf(row[4])).filter((d) => d != null))].sort((x, y) => x - y);
    decades.forEach((decade, i) => addHub("decade", decade, decadeLabel(decade), decadeColor(i, decades.length), { order: decade }));
  }
  if (mode === "watched") {
    // Un hub por año con visionados y, dentro, uno por mes.
    const months = [...new Set(rows.flatMap((row) => watchMonths(row)))].sort((x, y) => x - y);
    const years = [...new Set(months.map((m) => Math.floor(m / 100)))];
    years.forEach((year, i) => addHub("year", year, String(year), gradientColor(i, years.length), { order: year }));
    for (const month of months) {
      const year = Math.floor(month / 100);
      const index = addHub("month", month, `${MONTHS[(month % 100) - 1] || "?"} ${year}`, nodes[hub("year", year)].color, { tier: "sub", order: month });
      hubLinks.push([hub("year", year), index]);
    }
  }
  if (mode === "lists") {
    let own = 0;
    let community = 0;
    for (const [id, name, kind] of lists) {
      if (kind === "community") {
        addHub("community", id, name, COMMUNITY_COLORS[community % COMMUNITY_COLORS.length], { href: `/lists/community/${encodeURIComponent(id)}` });
        community += 1;
      } else {
        addHub("list", id, name, LIST_COLORS[own % LIST_COLORS.length], { href: `/lists/${encodeURIComponent(id)}` });
        own += 1;
      }
    }
    for (const [id, name] of sagas) addHub("collection", id, name, SAGA_COLOR, { href: `/lists/collection/${id}` });
  }
  if (mode === "money") {
    BUDGET_RANGES.forEach(([, label], i) => {
      if (rows.some((row) => rangeOf(BUDGET_RANGES, row[12]) === i)) {
        addHub("budget", i, `Presupuesto ${label}`, gradientColor(i, BUDGET_RANGES.length, { from: 170, to: 95, light: 55 }), { order: i });
      }
    });
    REVENUE_RANGES.forEach(([, label], i) => {
      if (rows.some((row) => rangeOf(REVENUE_RANGES, row[13]) === i)) {
        addHub("revenue", i, `Recaudación ${label}`, gradientColor(i, REVENUE_RANGES.length, { from: 50, to: 15, light: 58 }), { order: 100 + i });
      }
    });
  }
  if (mode === "ratings") {
    for (let score = 10; score >= 1; score -= 1) {
      if (rows.some((row) => userScore(row) === score)) {
        addHub("rating", score, `Tu nota ${score}`, scoreColor(score), { order: 10 - score });
      }
    }
    for (let i = TMDB_RANGES.length - 1; i >= 0; i -= 1) {
      if (rows.some((row) => rangeOf(TMDB_RANGES, row[14]) === i)) {
        const [from, label] = TMDB_RANGES[i];
        addHub("tmdb", i, `TMDb ${label}`, scoreColor(from + 0.5), { order: 100 + (TMDB_RANGES.length - i) });
      }
    }
  }

  // ── Títulos ────────────────────────────────────────────────────────────────
  let movies = 0;
  let series = 0;
  for (const row of rows) {
    const [tmdbId, isTv, title, posterPath, year, genreIdx, sagaIdx, plays, rating, flags] = row;
    const index = nodes.length;
    const mediaType = isTv ? "tv" : "movie";
    if (isTv) series += 1;
    else movies += 1;

    // Hubs de este título, el primero da el color.
    const targets = [];
    const push = (target) => {
      if (target != null && !targets.includes(target)) targets.push(target);
    };
    if (mode === "genre-saga" || mode === "genre") {
      for (const g of genreIdx || []) if (g >= 0 && g < genres.length) push(hub("genre", genres[g][0]));
      if (mode === "genre-saga" && sagaIdx >= 0 && sagaIdx < sagas.length) push(hub("saga", sagas[sagaIdx][0]));
    } else if (mode === "decade") {
      push(hub("decade", decadeOf(year)));
    } else if (mode === "watched") {
      // Del más reciente al más antiguo (como mucho doce): el color es el del
      // último año en que lo vio.
      for (const month of watchMonths(row).slice(-12).reverse()) push(hub("month", month));
    } else if (mode === "lists") {
      for (const l of Array.isArray(row[11]) ? row[11] : []) if (l >= 0 && l < lists.length) push(hub(lists[l][2] === "community" ? "community" : "list", lists[l][0]));
      if (sagaIdx >= 0 && sagaIdx < sagas.length) push(hub("collection", sagas[sagaIdx][0]));
    } else if (mode === "money") {
      push(hub("budget", rangeOf(BUDGET_RANGES, row[12])));
      push(hub("revenue", rangeOf(REVENUE_RANGES, row[13])));
    } else if (mode === "ratings") {
      push(hub("rating", userScore(row)));
      push(hub("tmdb", rangeOf(TMDB_RANGES, row[14])));
    }

    const onlyPending = (flags & FLAG_WATCHLIST) && !(flags & (FLAG_WATCHED | FLAG_RATED | FLAG_FAVORITE));
    const r = onlyPending
      ? 2.6
      : Math.min(9, 3 + 1.1 * Math.log2(1 + Math.max(0, plays)) + (flags & FLAG_FAVORITE ? 0.8 : 0));
    // En géneros, el color es el del género principal aunque no tenga hub.
    const primary = Array.isArray(genreIdx) && genreIdx.length ? genres[genreIdx[0]]?.[0] : null;
    const color = mode === "genre-saga" || mode === "genre"
      ? primary ? GENRE_COLORS[primary] || UNKNOWN_COLOR : UNKNOWN_COLOR
      : targets.length ? nodes[targets[0]].color : UNKNOWN_COLOR;
    nodes.push({
      kind: "title",
      id: `${mediaType}:${tmdbId}`,
      label: title || "Sin título",
      color,
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
    for (const target of targets) links.push([target, index]);
  }
  links.push(...hubLinks);

  const neighbors = nodes.map(() => []);
  for (const [a, b] of links) {
    neighbors[a].push(b);
    neighbors[b].push(a);
    nodes[a].degree += 1;
    nodes[b].degree += 1;
  }
  for (const node of nodes) {
    if (node.kind === "title") continue;
    node.r = node.tier === "sub" ? 4.5 + 1.2 * Math.sqrt(node.degree) : 7 + 1.5 * Math.sqrt(node.degree);
    node.search = normalizeSearch(node.label);
  }

  seedPositions(nodes, neighbors);
  return {
    nodes,
    links,
    neighbors,
    groupBy: mode,
    stats: { titles: rows.length, movies, series, genres: genres.length, sagas: sagas.length },
  };
}

// Meses (AAAAMM) en que se vio un título; vacío en cargas antiguas.
function watchMonths(row) {
  return Array.isArray(row?.[10]) ? row[10].filter((m) => Number.isInteger(m) && m > 180001) : [];
}

// Rango de una cifra, o undefined si no la hay (series, sin datos).
function rangeOf(ranges, value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? rangeIndex(ranges, n) : undefined;
}

// Tu nota en entero (8,5 → 8), o undefined si no lo has puntuado.
function userScore(row) {
  const n = Number(row?.[8]);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(10, Math.floor(n))) : undefined;
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
  return gradientColor(index, total);
}

// Posiciones de partida: los géneros en círculo (los más grandes, repartidos),
// cada saga y cada título junto al centro de sus hubs. La simulación parte así
// casi ordenada y converge en muchos menos pasos que desde puntos al azar.
function seedPositions(nodes, neighbors) {
  const random = seeded(nodes.length * 2654435761);
  const isMainHub = (node) => node.kind !== "title" && node.tier !== "sub";
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
  // Primero los hubs secundarios (junto a su hub principal) y después los
  // títulos, junto a todos sus hubs ya colocados.
  const placed = new Uint8Array(nodes.length);
  nodes.forEach((node, index) => {
    if (isMainHub(node)) placed[index] = 1;
  });
  const around = (index) => {
    const hubs = neighbors[index].filter((n) => placed[n] && nodes[n].kind !== "title");
    if (!hubs.length) return { x: (random() - 0.5) * radius * 2.4, y: (random() - 0.5) * radius * 2.4 };
    const x = hubs.reduce((sum, n) => sum + nodes[n].x, 0) / hubs.length;
    const y = hubs.reduce((sum, n) => sum + nodes[n].y, 0) / hubs.length;
    return { x, y };
  };
  const place = (node, index) => {
    const center = around(index);
    const spread = node.tier === "sub" ? 20 : 45;
    node.x = center.x + (random() - 0.5) * spread;
    node.y = center.y + (random() - 0.5) * spread;
    placed[index] = 1;
  };
  nodes.forEach((node, index) => {
    if (node.kind !== "title" && !isMainHub(node)) place(node, index);
  });
  nodes.forEach((node, index) => {
    if (node.kind === "title") place(node, index);
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
  // Primero los hubs con títulos visibles; después los que solo se unen a
  // otros hubs (un año, por sus meses).
  graph.nodes.forEach((node, i) => {
    if (node.kind !== "title") {
      visible[i] = graph.neighbors[i].some((n) => graph.nodes[n].kind === "title" && visible[n]) ? 1 : 0;
    }
  });
  graph.nodes.forEach((node, i) => {
    if (node.kind !== "title" && !visible[i]) {
      visible[i] = graph.neighbors[i].some((n) => graph.nodes[n].kind !== "title" && visible[n]) ? 1 : 0;
    }
  });
  return visible;
}

/**
 * Títulos de un hub: los suyos y, en un hub principal, también los de sus hubs
 * secundarios (los de un año están en sus meses). Sin repetir.
 */
export function hubTitleIndices(graph, index) {
  const out = new Set();
  for (const n of graph.neighbors[index] || []) {
    const node = graph.nodes[n];
    if (node.kind === "title") out.add(n);
    else if (node.tier === "sub" && graph.nodes[index].tier !== "sub") {
      for (const m of graph.neighbors[n]) if (graph.nodes[m].kind === "title") out.add(m);
    }
  }
  return [...out];
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
