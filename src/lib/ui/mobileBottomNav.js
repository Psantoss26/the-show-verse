// La barra inferior admite hasta seis accesos para conservar sus objetivos táctiles.
// Solo persistimos claves conocidas: así una preferencia antigua o manipulada no
// puede convertir la navegación en enlaces arbitrarios.
export const MOBILE_BOTTOM_NAV_ITEMS = [
  { key: "home", href: "/", labelKey: "nav_home", fallbackLabel: "Inicio", tone: "gold" },
  { key: "movies", href: "/movies", labelKey: "nav_movies", fallbackLabel: "Películas", tone: "blue" },
  { key: "series", href: "/series", labelKey: "nav_series", fallbackLabel: "Series", tone: "purple" },
  { key: "discover", href: "/discover", labelKey: "nav_discover", fallbackLabel: "Descubrir", tone: "indigo" },
  { key: "library", href: "/biblioteca", labelKey: "nav_library", fallbackLabel: "Biblioteca", tone: "gold" },
  { key: "social", href: "/social", labelKey: "nav_social", fallbackLabel: "Social", tone: "pink" },
  { key: "lists", href: "/lists", labelKey: "nav_lists", fallbackLabel: "Listas", tone: "purple" },
  { key: "in-progress", href: "/in-progress", labelKey: "nav_in_progress", fallbackLabel: "En Progreso", tone: "green" },
  { key: "history", href: "/history", labelKey: "nav_history", fallbackLabel: "Historial", tone: "green" },
  { key: "favorites", href: "/favorites", labelKey: "nav_favorites", fallbackLabel: "Favoritas", tone: "red" },
  { key: "watchlist", href: "/watchlist", labelKey: "nav_watchlist", fallbackLabel: "Pendientes", tone: "blue" },
  { key: "calendar", href: "/calendar", labelKey: "nav_calendar", fallbackLabel: "Calendario", tone: "gold" },
  { key: "recap", href: "/recap", labelKey: "nav_recap", fallbackLabel: "Recap", tone: "lime" },
  { key: "recommendations", href: "/recommendations", labelKey: "nav_recommendations", fallbackLabel: "Recomendaciones", tone: "green" },
];

export const DEFAULT_MOBILE_BOTTOM_NAV = ["social", "lists", "in-progress", "history", "favorites", "watchlist"];
export const MOBILE_BOTTOM_NAV_MAX_ITEMS = DEFAULT_MOBILE_BOTTOM_NAV.length;

const itemByKey = new Map(MOBILE_BOTTOM_NAV_ITEMS.map((item) => [item.key, item]));

// «Hoy» tuvo acceso propio y ahora es la vista por defecto de Social: quien lo
// había puesto en la barra conserva su configuración con Social en su lugar.
const LEGACY_KEYS = { today: "social" };

export function sanitizeMobileBottomNav(value) {
  if (!Array.isArray(value)) return DEFAULT_MOBILE_BOTTOM_NAV;

  const hadLegacy = value.some((key) => LEGACY_KEYS[key]);
  const mapped = value.map((key) => LEGACY_KEYS[key] || key);
  const keys = [...new Set(mapped.filter((key) => typeof key === "string" && itemByKey.has(key)))];
  // Una clave antigua puede coincidir con una que ya estaba (Hoy + Social):
  // ese duplicado se funde; cualquier otra rareza vuelve a la barra por defecto.
  const expected = hadLegacy ? new Set(mapped).size : value.length;
  return keys.length === expected && keys.length <= MOBILE_BOTTOM_NAV_MAX_ITEMS
    ? keys
    : DEFAULT_MOBILE_BOTTOM_NAV;
}

export function getMobileBottomNavItems(value) {
  return sanitizeMobileBottomNav(value).map((key) => itemByKey.get(key));
}

// BARRA LATERAL DE ESCRITORIO: las mismas secciones que la inferior del móvil,
// en vertical junto al borde izquierdo. Solo va en las páginas a pantalla
// completa (páginas de usuario, fichas, temporadas y episodios). Los dashboards
// ya tienen sus pestañas en la barra superior y su hero ocupa ese borde; el
// acceso y el alta no navegan por secciones, y la ficha del panel lateral
// (`/embed/details/...`) no lleva barras.
const DESKTOP_SIDE_NAV_HIDDEN = [
  /^\/$/,
  /^\/movies\/?$/,
  /^\/series\/?$/,
  /^\/dashboard(?:\/|$)/,
  /^\/login(?:\/|$)/,
  /^\/auth(?:\/|$)/,
  /^\/embed(?:\/|$)/,
];

export function showsDesktopSideNav(pathname) {
  const path = pathname || "/";
  return !DESKTOP_SIDE_NAV_HIDDEN.some((pattern) => pattern.test(path));
}
