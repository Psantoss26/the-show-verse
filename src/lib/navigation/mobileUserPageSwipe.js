export const MOBILE_USER_PAGE_SWIPE_ROUTES = Object.freeze([
  "/social",
  "/lists",
  "/in-progress",
  "/history",
  "/favorites",
  "/watchlist",
  "/profile",
]);

// La navegación se inicia sobre cualquier parte de la pantalla, igual que las
// secciones de Perfil. Solo las superficies que ya tienen un gesto horizontal
// propio pueden pedir prioridad explícitamente.
export const MOBILE_USER_PAGE_SWIPE_IGNORE_SELECTOR =
  "[data-mobile-page-swipe-ignore]";

function normalizePathname(pathname) {
  if (!pathname) return "";
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

export function getMobileUserPageSwipeDestination(pathname, direction) {
  const currentIndex = MOBILE_USER_PAGE_SWIPE_ROUTES.indexOf(
    normalizePathname(pathname),
  );
  if (currentIndex === -1) return null;

  const offset = direction === "left" ? 1 : direction === "right" ? -1 : 0;
  return MOBILE_USER_PAGE_SWIPE_ROUTES[currentIndex + offset] || null;
}
