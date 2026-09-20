export const EMBEDDED_DETAILS_PREFIX = "/embed/details/";
export const EMBEDDED_DETAILS_MESSAGE = "showverse:embedded-details";

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
