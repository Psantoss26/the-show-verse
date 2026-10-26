// src/lib/billing/plans.js
// Catálogo de planes y derechos efectivos de cada usuario.
//
// La copia del frontend está en src/lib/billing/plans.js: si cambias precios,
// límites o funciones, cambia las dos.
//
// Con BILLING_ENABLED apagado todo el mundo tiene Pro sin anuncios: la app se
// comporta como antes de existir los planes.

export const PLAN_IDS = ['free', 'adfree', 'pro'];
export const PAID_PLAN_IDS = ['adfree', 'pro'];
export const INTERVALS = ['month', 'year'];

export const FEATURES = ['stats', 'recap', 'neural', 'plex', 'unlimitedLists', 'profileShowcase'];

export const PLANS = {
  free: {
    id: 'free',
    ads: true,
    features: [],
    limits: { lists: 3, profileFavoritesPerType: 3 },
    prices: { month: 0, year: 0 },
  },
  adfree: {
    id: 'adfree',
    ads: false,
    features: [],
    limits: { lists: 3, profileFavoritesPerType: 3 },
    // Céntimos de euro, IVA incluido.
    prices: { month: 149, year: 1200 },
  },
  pro: {
    id: 'pro',
    ads: false,
    features: [...FEATURES],
    limits: { lists: null, profileFavoritesPerType: 5 },
    prices: { month: 349, year: 2900 },
    trialDays: 7,
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function isBillingEnabled(env = process.env) {
  return env.BILLING_ENABLED === '1' || env.BILLING_ENABLED === 'true';
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Fin del periodo de gracia de quien ya estaba registrado al lanzar los planes.
export function graceEndsAt(user, env = process.env) {
  const launch = parseDate(env.BILLING_LAUNCH_AT);
  const createdAt = parseDate(user?.createdAt);
  if (!launch || !createdAt || createdAt >= launch) return null;
  const days = Number.parseInt(env.BILLING_GRACE_DAYS ?? '30', 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(launch.getTime() + days * DAY_MS);
}

function paidPlanOf(user, now) {
  const plan = PAID_PLAN_IDS.includes(user?.plan) ? user.plan : null;
  if (!plan) return null;
  const expiresAt = parseDate(user.planExpiresAt);
  if (expiresAt && expiresAt <= now) return null;
  return plan;
}

function describe(planId, extra) {
  const plan = PLANS[planId];
  return {
    plan: planId,
    ads: plan.ads,
    features: plan.features,
    limits: plan.limits,
    ...extra,
  };
}

/**
 * Derechos efectivos de un usuario (o de un visitante sin sesión si `user` es
 * null). `source` explica de dónde salen: 'billing_off' | 'subscription' |
 * 'grace' | 'free'.
 */
export function getEntitlements(user, { now = new Date(), env = process.env } = {}) {
  if (!isBillingEnabled(env)) {
    return describe('pro', { ads: false, billingEnabled: false, source: 'billing_off', graceEndsAt: null });
  }

  const paid = paidPlanOf(user, now);
  if (paid === 'pro') {
    return describe('pro', { billingEnabled: true, source: 'subscription', graceEndsAt: null });
  }

  const grace = graceEndsAt(user, env);
  if (grace && grace > now) {
    return describe('pro', { billingEnabled: true, source: 'grace', graceEndsAt: grace.toISOString() });
  }

  if (paid === 'adfree') {
    return describe('adfree', { billingEnabled: true, source: 'subscription', graceEndsAt: null });
  }

  return describe('free', { billingEnabled: true, source: 'free', graceEndsAt: null });
}

// Plan que se enseña de otro usuario (perfil, seguidores, miembros): solo el
// que paga de verdad. Ni el plan gratis ni la gracia de lanzamiento llevan
// insignia, y con la facturación apagada no la lleva nadie.
export function publicPlanBadge(user, { now = new Date(), env = process.env } = {}) {
  if (!isBillingEnabled(env)) return null;
  return paidPlanOf(user, now);
}

export function hasFeature(entitlements, feature) {
  return Boolean(entitlements?.features?.includes(feature));
}

export function publicCatalog(env = process.env) {
  return {
    billingEnabled: isBillingEnabled(env),
    currency: 'eur',
    plans: PLAN_IDS.map((id) => PLANS[id]),
  };
}

// Precio de Stripe configurado para un plan e intervalo (p. ej.
// STRIPE_PRICE_PRO_YEAR). null si falta.
export function stripePriceId(plan, interval, env = process.env) {
  if (!PAID_PLAN_IDS.includes(plan) || !INTERVALS.includes(interval)) return null;
  return env[`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`] || null;
}

// Plan e intervalo de un precio de Stripe, buscando en la configuración.
export function planForStripePrice(priceId, env = process.env) {
  if (!priceId) return null;
  for (const plan of PAID_PLAN_IDS) {
    for (const interval of INTERVALS) {
      if (stripePriceId(plan, interval, env) === priceId) return { plan, interval };
    }
  }
  return null;
}
