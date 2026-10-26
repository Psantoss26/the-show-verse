// Catálogo de planes para pintar /planes, Ajustes y los bloqueos Pro.
//
// Es una copia de backend/src/lib/billing/plans.js (precios, límites y
// funciones): si cambias uno, cambia el otro. Los derechos de cada usuario los
// calcula SIEMPRE el backend (/api/billing/me); esto solo describe.

export const PLAN_ORDER = ["free", "adfree", "pro"];

export const PLANS = {
  free: {
    id: "free",
    name: "Gratis",
    tagline: "Todo lo esencial para seguir lo que ves.",
    ads: true,
    limits: { lists: 3, profileFavoritesPerType: 3 },
    prices: { month: 0, year: 0 },
  },
  adfree: {
    id: "adfree",
    name: "Sin anuncios",
    tagline: "La misma app, sin interrupciones.",
    ads: false,
    limits: { lists: 3, profileFavoritesPerType: 3 },
    prices: { month: 149, year: 1200 },
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Tus datos convertidos en historias.",
    ads: false,
    limits: { lists: null, profileFavoritesPerType: 5 },
    prices: { month: 349, year: 2900 },
    trialDays: 7,
    highlighted: true,
  },
};

// Funciones exclusivas de Pro: textos de /planes y de las tarjetas de bloqueo.
export const PRO_FEATURES = {
  stats: {
    title: "Estadísticas",
    description: "Gráficas de tus horas, géneros, décadas y rachas de visionado.",
  },
  recap: {
    title: "Recap anual",
    description: "Tu año en series y películas, listo para compartir.",
  },
  neural: {
    title: "Vista neuronal",
    description: "El mapa de conexiones entre todo lo que has visto.",
  },
  plex: {
    title: "Sincronización con Plex",
    description: "Lo que ves en tu servidor Plex entra solo en tu historial.",
  },
  unlimitedLists: {
    title: "Listas ilimitadas",
    description: "Crea todas las listas que quieras (gratis: hasta 3).",
  },
  profileShowcase: {
    title: "Página de usuario completa",
    description: "Destaca hasta 5 películas y 5 series en tu perfil (gratis: 3 y 3).",
  },
};

// Lo que ofrece cada plan, en el mismo orden en las tres tarjetas de /planes
// para compararlas de un vistazo. `values` por plan: true/false o un texto.
export const COMPARISON_ROWS = [
  { label: "Seguimiento, pendientes y calendario", values: { free: true, adfree: true, pro: true } },
  { label: "Importar de Trakt, IMDb y Letterboxd", values: { free: true, adfree: true, pro: true } },
  { label: "Sin anuncios", values: { free: false, adfree: true, pro: true } },
  { label: "Listas propias", values: { free: "3", adfree: "3", pro: "Ilimitadas" } },
  { label: "Favoritos en tu perfil", values: { free: "3 + 3", adfree: "3 + 3", pro: "5 + 5" } },
  { label: "Estadísticas", values: { free: false, adfree: false, pro: true } },
  { label: "Recap anual", values: { free: false, adfree: false, pro: true } },
  { label: "Vista neuronal", values: { free: false, adfree: false, pro: true } },
  { label: "Sincronización con Plex", values: { free: false, adfree: false, pro: true } },
];

export const INTERVAL_LABELS = { month: "mes", year: "año" };

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const euroRound = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function formatPrice(cents) {
  if (!cents) return "0 €";
  return cents % 100 === 0 ? euroRound.format(cents / 100) : euro.format(cents / 100);
}

// Precio mensual equivalente del plan anual y ahorro frente a pagar por meses.
export function yearlySavings(plan) {
  const { month, year } = plan.prices;
  if (!month || !year) return null;
  const monthly = Math.round(year / 12);
  const percent = Math.round((1 - year / (month * 12)) * 100);
  return { monthly, percent };
}

export function planName(id) {
  return PLANS[id]?.name || PLANS.free.name;
}

// Derechos con los que se pinta mientras /api/billing/me no ha respondido (o
// sin sesión): todo abierto y sin anuncios, como antes de existir los planes.
// Así nunca aparece un bloqueo por un instante a quien sí tiene acceso.
export const OPEN_ENTITLEMENTS = {
  plan: "pro",
  ads: false,
  features: Object.keys(PRO_FEATURES),
  limits: PLANS.pro.limits,
  billingEnabled: false,
  source: "billing_off",
  graceEndsAt: null,
};
