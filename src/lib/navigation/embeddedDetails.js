export const EMBEDDED_DETAILS_PREFIX = "/embed/details/";
export const EMBEDDED_DETAILS_MESSAGE = "showverse:embedded-details";

// Parámetros de la URL embebida que adelantan el estado de favorito/pendiente/
// puntuación -- lo que el DetailModal de escritorio YA sabe (getBackendItemStatus)
// en el momento de montar la ficha móvil -- para que sus botones de acción no
// esperen a su propia petición de red. Ver `buildEmbeddedDetailsHref` /
// `readEmbeddedDetailsSeed`.
const SEED_PARAM_FAVORITE = "sf";
const SEED_PARAM_WATCHLIST = "sw";
const SEED_PARAM_RATING = "sr";

// `seed` es opcional: sin él (o `null`), el resultado es idéntico al `.replace`
// de siempre.
export function buildEmbeddedDetailsHref(href, seed) {
  const embeddedHref = href.replace("/details/", EMBEDDED_DETAILS_PREFIX);
  if (!seed) return embeddedHref;

  const [beforeHash, hash = ""] = embeddedHref.split("#");
  const [pathname, search = ""] = beforeHash.split("?");
  const params = new URLSearchParams(search);
  if (typeof seed.favorite === "boolean") {
    params.set(SEED_PARAM_FAVORITE, seed.favorite ? "1" : "0");
  }
  if (typeof seed.watchlist === "boolean") {
    params.set(SEED_PARAM_WATCHLIST, seed.watchlist ? "1" : "0");
  }
  if (typeof seed.rating === "number" && Number.isFinite(seed.rating)) {
    params.set(SEED_PARAM_RATING, String(seed.rating));
  }
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}

// Lado servidor: lee esos mismos parámetros en `/details/[type]/[id]/page.jsx`
// (visitado directamente o vía `/embed/details/...`) y construye el
// `initialTraktStatus` semilla que espera `DetailsClient`.
//
// `connected: false` es el caso normal -- esta app no depende de Trakt para
// favorito/pendiente/puntuación (ver `/api/backend/item/status`, "SIN usar
// Trakt en ningún momento") -- y `hasResolvedTraktBootstrap` lo trata como "ya
// resuelto": los botones de acción no se quedan esperando a la red.
export function readEmbeddedDetailsSeed(searchParams) {
  if (!searchParams) return null;
  const sf = searchParams[SEED_PARAM_FAVORITE];
  const sw = searchParams[SEED_PARAM_WATCHLIST];
  const sr = searchParams[SEED_PARAM_RATING];
  if (sf == null && sw == null && sr == null) return null;

  const rating = sr != null ? Number(sr) : NaN;
  return {
    connected: false,
    favorite: sf === "1",
    inWatchlist: sw === "1",
    rating: Number.isFinite(rating) ? rating : null,
  };
}

export function canonicalDetailsHref(href, origin) {
  const url = new URL(href, origin);
  if (url.pathname.startsWith(EMBEDDED_DETAILS_PREFIX)) {
    url.pathname = url.pathname.replace("/embed/details/", "/details/");
  }
  const next = url.searchParams.get("next");
  if (next?.startsWith(EMBEDDED_DETAILS_PREFIX)) {
    url.searchParams.set("next", next.replace("/embed/details/", "/details/"));
  }
  return url;
}

export function sendEmbeddedDetailsAction(action, href, detail) {
  if (
    typeof window === "undefined" ||
    window.parent === window ||
    !window.location.pathname.startsWith(EMBEDDED_DETAILS_PREFIX)
  ) return false;
  window.parent.postMessage(
    { type: EMBEDDED_DETAILS_MESSAGE, action, href, detail },
    window.location.origin,
  );
  return true;
}
