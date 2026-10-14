// Filtros de la sección de comentarios, compartidos por la ficha
// (DetailsClient), la vista de teléfono (PhoneDetailsSections) y la vista
// lateral (DetailsSectionSheets), para que no diverjan.
//
//   - Pestañas: «Populares» (me gusta + respuestas) y «Recientes» (por fecha).
//   - «Más likes»: reordena la pestaña por me gusta (en Recientes, los
//     recientes; ver backend/src/community/tabs.js).

export const COMMENT_TABS = [
  { id: "popular", label: "Populares" },
  { id: "recent", label: "Recientes" },
];

export const DEFAULT_COMMENT_TAB = "recent";

/**
 * Pestaña y orden válidos a partir de lo que haya guardado (estado restaurado,
 * cachés antiguas): «Top 30 días» pasa a Recientes por likes y «Top histórico»
 * a Populares.
 */
export function normalizeCommentFilters(tab, byLikes = false) {
  const value = String(tab || "").toLowerCase();
  if (value === "likes30" || value === "top30") return { tab: "recent", byLikes: true };
  if (value === "likesall" || value === "top" || value === "popular") return { tab: "popular", byLikes: !!byLikes };
  if (value === "recent" || value === "newest") return { tab: "recent", byLikes: !!byLikes };
  return { tab: DEFAULT_COMMENT_TAB, byLikes: !!byLikes };
}

/** Parámetros de /api/community/:type/:id/comments para ese filtro. */
export function commentFiltersQuery({ tab, byLikes }) {
  const { tab: safeTab, byLikes: likes } = normalizeCommentFilters(tab, byLikes);
  return likes ? `tab=${safeTab}&sort=likes` : `tab=${safeTab}`;
}

/** Sufijo de caché: cada combinación guarda su propia primera página. */
export function commentFiltersKey({ tab, byLikes }) {
  const { tab: safeTab, byLikes: likes } = normalizeCommentFilters(tab, byLikes);
  return likes ? `${safeTab}:likes` : safeTab;
}
