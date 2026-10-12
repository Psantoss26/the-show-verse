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

export function sanitizeMobileBottomNav(value) {
  if (!Array.isArray(value)) return DEFAULT_MOBILE_BOTTOM_NAV;

  const keys = [...new Set(value.filter((key) => typeof key === "string" && itemByKey.has(key)))];
  return keys.length === value.length && keys.length <= MOBILE_BOTTOM_NAV_MAX_ITEMS
    ? keys
    : DEFAULT_MOBILE_BOTTOM_NAV;
}

export function getMobileBottomNavItems(value) {
  return sanitizeMobileBottomNav(value).map((key) => itemByKey.get(key));
}
