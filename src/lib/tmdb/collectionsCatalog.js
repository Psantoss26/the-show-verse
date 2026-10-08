// Orden y paginación del catálogo de colecciones de TMDb
// (src/data/tmdbCollectionsCatalog.json, generado por
// scripts/build-collections-catalog.mjs). Puro, sin red: lo usa la ruta
// /api/tmdb/collections/catalog y se prueba aparte.
//
// Cada entrada: [id, nombre, nº de películas, votos].

export const CATALOG_PAGE_SIZE = 24;

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const ID = 0;
const NAME = 1;
const ITEMS = 2;
const VOTES = 3;

// Los órdenes del menú de /lists. Las colecciones no tienen «me gusta»: ahí
// «Más/Menos likes» ordena por lo conocidas que son (votos).
const COMPARATORS = {
  items_desc: (a, b) => b[ITEMS] - a[ITEMS] || b[VOTES] - a[VOTES],
  items_asc: (a, b) => a[ITEMS] - b[ITEMS] || b[VOTES] - a[VOTES],
  likes_desc: (a, b) => b[VOTES] - a[VOTES] || a[ID] - b[ID],
  likes_asc: (a, b) => a[VOTES] - b[VOTES] || a[ID] - b[ID],
  name_asc: (a, b) => collator.compare(a[NAME], b[NAME]) || a[ID] - b[ID],
  name_desc: (a, b) => collator.compare(b[NAME], a[NAME]) || a[ID] - b[ID],
};

export function normalizeCatalogSort(sort) {
  return Object.hasOwn(COMPARATORS, sort) ? sort : "items_desc";
}

/**
 * Página `page` (desde 1) del catálogo, sin los ids de `exclude` (las
 * destacadas, que el índice ya enseña primero), en el orden `sort`.
 */
export function catalogPage(entries, { sort, page = 1, pageSize = CATALOG_PAGE_SIZE, exclude = [] } = {}) {
  const excluded = new Set(exclude.map(Number));
  const sorted = (Array.isArray(entries) ? entries : [])
    .filter((entry) => Array.isArray(entry) && !excluded.has(Number(entry[ID])))
    .sort(COMPARATORS[normalizeCatalogSort(sort)]);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(Number(page) || 1)), totalPages);
  const start = (current - 1) * pageSize;
  return {
    page: current,
    totalPages,
    total,
    entries: sorted.slice(start, start + pageSize),
  };
}
