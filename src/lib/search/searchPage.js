// Utilidades de la página de resultados completos de búsqueda (/search).

export const SEARCH_PAGE_TYPES = [
  "all",
  "movies",
  "series",
  "people",
  "collections",
  "users",
];

/** URL de una página de resultados. `type` y `page` se omiten si son los por defecto. */
export function buildSearchHref({ q, type = "all", page = 1 }) {
  const params = new URLSearchParams({ q: String(q || "").trim() });
  if (type && type !== "all" && SEARCH_PAGE_TYPES.includes(type)) {
    params.set("type", type);
  }
  if (page > 1) params.set("page", String(page));
  return `/search?${params.toString()}`;
}

/**
 * Páginas a enlazar: primera, última y dos a cada lado de la actual, con
 * `"gap"` donde se saltan páginas. Ej.: (7, 20) → [1, "gap", 5, 6, 7, 8, 9, "gap", 20]
 */
export function paginationWindow(page, totalPages) {
  if (!(totalPages > 0)) return [];
  const current = Math.min(Math.max(1, page), totalPages);
  const wanted = new Set([1, totalPages]);
  for (let p = current - 2; p <= current + 2; p += 1) {
    if (p >= 1 && p <= totalPages) wanted.add(p);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("gap");
    out.push(sorted[i]);
  }
  return out;
}
