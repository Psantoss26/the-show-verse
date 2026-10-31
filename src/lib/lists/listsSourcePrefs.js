// Pestaña elegida en /lists (Mis listas / Comunidad / Colecciones). Va también
// en una cookie, además de localStorage, para que el SERVIDOR pinte ya la
// pestaña del usuario: leída solo en el cliente, al recargar estando en
// Colecciones el HTML salía con la pestaña por defecto («Listas de la
// comunidad») hasta hidratar.

export const LISTS_SOURCE_COOKIE = "showverse_lists_source";

export const DEFAULT_LISTS_SOURCE = "trakt";

const SOURCES = new Set(["personal", "trakt", "collections"]);

export function isListsSource(value) {
  return SOURCES.has(value);
}

/** Valor de la cookie → pestaña válida (la de por defecto si no vale). */
export function readListsSource(raw) {
  return isListsSource(raw) ? raw : DEFAULT_LISTS_SOURCE;
}

/** Escribe la cookie (solo cliente). Un año, para toda la web. */
export function writeListsSourceCookie(source) {
  if (typeof document === "undefined" || !isListsSource(source)) return;
  try {
    document.cookie = `${LISTS_SOURCE_COOKIE}=${source}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // Sin cookies: queda localStorage.
  }
}
