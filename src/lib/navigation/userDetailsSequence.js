const STORAGE_KEY = "showverse:user-details-sequence:v1";
const MAX_ITEMS = 240;

function normalizeDetailsHref(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^\/details\/(movie|tv)\/([^/?#]+)\/?(?:[?#].*)?$/);
  if (!match) return null;
  return `/details/${match[1]}/${match[2]}`;
}

function uniqueDetailsHrefs(links) {
  const seen = new Set();
  const hrefs = [];
  for (const link of links) {
    const href = normalizeDetailsHref(link.getAttribute("href"));
    if (!href || seen.has(href)) continue;
    seen.add(href);
    hrefs.push(href);
    if (hrefs.length === MAX_ITEMS) break;
  }
  return hrefs;
}

/**
 * Guarda la secuencia que el usuario ve en una página de perfil. La secuencia
 * se toma después de filtros, grupos y ordenación, por lo que DetailsClient no
 * necesita reproducir esa lógica ni volver a pedir la lista.
 */
export function saveUserDetailsSequenceFromLink(link) {
  if (typeof window === "undefined" || !(link instanceof HTMLAnchorElement)) {
    return;
  }

  const selectedHref = normalizeDetailsHref(link.getAttribute("href"));
  if (!selectedHref) return;

  const scope =
    link.closest("[data-user-details-sequence]") || link.closest("section");
  if (!scope) return;

  const hrefs = uniqueDetailsHrefs(scope.querySelectorAll('a[href^="/details/"]'));
  if (hrefs.length < 2 || !hrefs.includes(selectedHref)) return;

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hrefs, savedAt: Date.now() }),
    );
  } catch {
    // Si el almacenamiento no está disponible, abrir la ficha sigue funcionando.
  }
}

export function getUserDetailsSequence(currentHref) {
  if (typeof window === "undefined") return null;
  const current = normalizeDetailsHref(currentHref);
  if (!current) return null;

  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");
    const hrefs = Array.isArray(stored?.hrefs)
      ? stored.hrefs.map(normalizeDetailsHref).filter(Boolean)
      : [];
    const index = hrefs.indexOf(current);
    if (index < 0 || hrefs.length < 2) return null;

    return {
      previous: hrefs[index - 1] || null,
      next: hrefs[index + 1] || null,
    };
  } catch {
    return null;
  }
}

export function getUserDetailsSequenceHref(type, id) {
  return normalizeDetailsHref(`/details/${type}/${id}`);
}
