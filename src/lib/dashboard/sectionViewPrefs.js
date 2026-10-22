// Vista elegida en las páginas de sección del dashboard (lista / compacta /
// rejilla y póster / backdrop). Va también en una cookie, además de
// localStorage, para que el SERVIDOR pinte ya la vista del usuario: leída solo
// en el cliente, la página nacía en la vista por defecto y saltaba a la
// guardada tras hidratar (y las tarjetas se montaban dos veces).

// `_v2`: la vista por defecto pasó de compacta a rejilla (la de Favoritos). La
// cookie se escribía en cada visita aunque no se eligiera nada, así que la
// anterior no distingue una elección de la vista por defecto.
export const SECTION_VIEW_COOKIE = "showverse_section_view_v2";

const VIEW_MODES = new Set(["grid", "compact", "list"]);
const IMAGE_MODES = new Set(["poster", "backdrop"]);

export function isSectionViewMode(value) {
  return VIEW_MODES.has(value);
}

export function isSectionImageMode(value) {
  return IMAGE_MODES.has(value);
}

/** "compact.poster" → { viewMode, imageMode } (cada uno o null si no vale). */
export function readSectionViewPrefs(raw) {
  const [viewMode, imageMode] = String(raw || "").split(".");
  return {
    viewMode: isSectionViewMode(viewMode) ? viewMode : null,
    imageMode: isSectionImageMode(imageMode) ? imageMode : null,
  };
}

/** Escribe la cookie (solo cliente). Un año, para toda la web. */
export function writeSectionViewPrefsCookie(viewMode, imageMode) {
  if (typeof document === "undefined") return;
  if (!isSectionViewMode(viewMode) || !isSectionImageMode(imageMode)) return;
  try {
    document.cookie = `${SECTION_VIEW_COOKIE}=${viewMode}.${imageMode}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // Sin cookies: queda localStorage.
  }
}
