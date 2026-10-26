// src/lib/billing/stripe.js
// Integración con Stripe: Checkout, portal de cliente y sincronización de
// suscripciones desde los webhooks. `users.plan` y `users.plan_expires_at`
// son el resultado: getEntitlements (plans.js) solo lee esos dos campos.

import Stripe from 'stripe';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '../../db/client.js';
import { subscriptions, users } from '../../db/schema.js';
import { PLANS, planForStripePrice } from './plans.js';

// Estados de Stripe en los que la suscripción sigue dando acceso. En
// `past_due` Stripe aún reintenta el cobro: se mantiene el acceso hasta el fin
// del periodo pagado.
const ACCESS_STATUSES = ['trialing', 'active', 'past_due'];

// Margen sobre el fin del periodo: la renovación llega por webhook y puede
// tardar; sin él, el acceso se cortaba unos minutos en cada renovación.
const RENEWAL_SLACK_MS = 2 * 24 * 60 * 60 * 1000;

let client = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

function toDate(seconds) {
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

function frontendUrl(path) {
  const base = String(process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/+$/, '');
  return `${base}${path}`;
}

async function findCustomerId(userId) {
  const [row] = await db
    .select({ customerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row?.customerId || null;
}

async function hasSubscribedBefore(userId) {
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return Boolean(row);
}

export async function createCheckoutSession(stripe, user, { plan, interval, priceId }) {
  const customer = await findCustomerId(user.id);
  const trialDays = PLANS[plan]?.trialDays && !(await hasSubscribedBefore(user.id)) ? PLANS[plan].trialDays : 0;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...(customer ? { customer } : { customer_email: user.email }),
    client_reference_id: user.id,
    allow_promotion_codes: true,
    automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === '1' },
    ...(customer && process.env.STRIPE_AUTOMATIC_TAX === '1' ? { customer_update: { address: 'auto' } } : {}),
    subscription_data: {
      metadata: { userId: user.id, plan, interval },
      ...(trialDays ? { trial_period_days: trialDays } : {}),
    },
    metadata: { userId: user.id, plan, interval },
    success_url: frontendUrl('/planes?checkout=success'),
    cancel_url: frontendUrl('/planes?checkout=cancel'),
  });
  return session.url;
}

export async function createPortalSession(stripe, userId) {
  const customer = await findCustomerId(userId);
  if (!customer) return null;
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: frontendUrl('/profile/settings?tab=subscription'),
  });
  return session.url;
}

// Recalcula users.plan a partir de todas las suscripciones del usuario: gana
// la mejor que siga dando acceso (Pro sobre Sin anuncios).
export async function refreshUserPlan(userId) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ACCESS_STATUSES)));

  const rank = { pro: 2, adfree: 1 };
  const best = rows
    .filter((row) => rank[row.plan])
    .sort((a, b) => rank[b.plan] - rank[a.plan] || (b.currentPeriodEnd?.getTime() || 0) - (a.currentPeriodEnd?.getTime() || 0))[0];

  const plan = best ? best.plan : 'free';
  const planExpiresAt = best?.currentPeriodEnd ? new Date(best.currentPeriodEnd.getTime() + RENEWAL_SLACK_MS) : null;

  await db.update(users).set({ plan, planExpiresAt, updatedAt: new Date() }).where(eq(users.id, userId));
  return { plan, planExpiresAt };
}

async function userIdForSubscription(sub) {
  if (sub.metadata?.userId) return sub.metadata.userId;
  const [row] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, sub.id))
    .limit(1);
  if (row) return row.userId;
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customer) return null;
  const [byCustomer] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customer))
    .limit(1);
  return byCustomer?.userId || null;
}

// Guarda una suscripción de Stripe y actualiza el plan del usuario.
export async function syncSubscription(sub, { userId: hintedUserId = null } = {}) {
  const userId = hintedUserId || (await userIdForSubscription(sub));
  if (!userId) return null;

  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id;
  const mapped = planForStripePrice(priceId) || {
    plan: sub.metadata?.plan,
    interval: sub.metadata?.interval || item?.price?.recurring?.interval,
  };
  if (!PLANS[mapped.plan] || mapped.plan === 'free') return null;

  // Desde la API 2025 el periodo vive en cada línea; antes, en la suscripción.
  const periodStart = toDate(sub.current_period_start ?? item?.current_period_start);
  const periodEnd = toDate(sub.current_period_end ?? item?.current_period_end);
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null;

  const values = {
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    plan: mapped.plan,
    status: sub.status,
    billingInterval: mapped.interval || null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelledAt: toDate(sub.canceled_at),
  };

  // stripe_customer_id es UNIQUE: un mismo cliente con una segunda suscripción
  // reutiliza la fila en lugar de fallar.
  const [existing] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(customerId ? eq(subscriptions.stripeCustomerId, customerId) : eq(subscriptions.stripeSubscriptionId, sub.id))
    .limit(1);

  if (existing) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
  } else {
    await db.insert(subscriptions).values(values);
  }

  return refreshUserPlan(userId);
}

export async function handleStripeEvent(stripe, event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription' || !session.subscription) return;
      const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subId);
      await syncSubscription(sub, { userId: session.client_reference_id || session.metadata?.userId || null });
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncSubscription(event.data.object);
      return;
    default:
  }
}

export async function readSubscriptionSummary(userId) {
  const [row] = await db
    .select({
      plan: subscriptions.plan,
      status: subscriptions.status,
      interval: subscriptions.billingInterval,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row || null;
}
