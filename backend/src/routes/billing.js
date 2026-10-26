// src/routes/billing.js
// Planes de pago (ver lib/billing/).
//
//   GET  /billing/plans     → catálogo y si la facturación está activa (público)
//   GET  /billing/me        → derechos efectivos del usuario y su suscripción
//   POST /billing/checkout  → { plan, interval } → URL de Stripe Checkout
//   POST /billing/portal    → URL del portal de cliente de Stripe
//   POST /billing/webhook   → eventos de Stripe (firma sobre el cuerpo crudo)

import { z } from 'zod';

import { getEntitlements, INTERVALS, isBillingEnabled, PAID_PLAN_IDS, publicCatalog, stripePriceId } from '../lib/billing/plans.js';
import {
  createCheckoutSession,
  createPortalSession,
  getStripe,
  handleStripeEvent,
  readSubscriptionSummary,
} from '../lib/billing/stripe.js';

const checkoutSchema = z.object({
  plan: z.enum(PAID_PLAN_IDS),
  interval: z.enum(INTERVALS),
});

function unavailable(reply, message = 'Billing is not enabled') {
  return reply.status(503).send({ error: message, code: 'billing_unavailable' });
}

// El webhook necesita el cuerpo tal cual llegó para verificar la firma. Va en
// su propio contexto para que el parser crudo no afecte al resto de rutas.
async function webhookRoutes(fastify) {
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  fastify.post('/webhook', { config: { rateLimit: false } }, async (req, reply) => {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) return unavailable(reply);

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
    } catch (err) {
      req.log.warn({ err: err.message }, 'stripe webhook: firma inválida');
      return reply.status(400).send({ error: 'Invalid signature' });
    }

    try {
      await handleStripeEvent(stripe, event);
    } catch (err) {
      // 500 → Stripe reintenta el evento más tarde.
      req.log.error({ err, type: event.type }, 'stripe webhook: error al procesar');
      return reply.status(500).send({ error: 'Webhook handler failed' });
    }
    return reply.send({ received: true });
  });
}

export default async function billingRoutes(fastify) {
  fastify.get('/plans', async () => publicCatalog());

  fastify.get('/me', { preHandler: fastify.requireAuth }, async (req) => ({
    entitlements: getEntitlements(req.user),
    subscription: await readSubscriptionSummary(req.user.id),
    portalAvailable: Boolean(getStripe()),
  }));

  fastify.post('/checkout', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }
    const stripe = getStripe();
    if (!isBillingEnabled() || !stripe) return unavailable(reply);

    const { plan, interval } = parsed.data;
    const priceId = stripePriceId(plan, interval);
    if (!priceId) return unavailable(reply, `Price for ${plan}/${interval} is not configured`);

    const url = await createCheckoutSession(stripe, req.user, { plan, interval, priceId });
    return reply.send({ url });
  });

  fastify.post('/portal', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const stripe = getStripe();
    if (!stripe) return unavailable(reply);
    const url = await createPortalSession(stripe, req.user.id);
    if (!url) return reply.status(404).send({ error: 'No billing account yet', code: 'no_customer' });
    return reply.send({ url });
  });

  await fastify.register(webhookRoutes);
}
