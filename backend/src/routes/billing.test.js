// src/routes/billing.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import Stripe from 'stripe';

import billingRoutes from './billing.js';

async function buildApp() {
  const app = Fastify();
  app.decorateRequest('user', null);
  app.decorate('requireAuth', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized' });
  });
  await app.register(billingRoutes, { prefix: '/billing' });
  return app;
}

function withEnv(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  return fn().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('el catálogo es público y dice si la facturación está activa', async () => {
  await withEnv({ BILLING_ENABLED: '1' }, async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/billing/plans' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.billingEnabled, true);
    assert.deepEqual(body.plans.map((plan) => plan.id), ['free', 'adfree', 'pro']);
  });
});

test('el webhook rechaza una firma que no es de Stripe', async () => {
  await withEnv({ STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: 'whsec_test' }, async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=falsa' },
      payload: JSON.stringify({ type: 'customer.subscription.updated' }),
    });
    assert.equal(res.statusCode, 400);
  });
});

test('el webhook acepta un evento firmado sobre el cuerpo crudo', async () => {
  await withEnv({ STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: 'whsec_test' }, async () => {
    const app = await buildApp();
    // Un evento que el manejador ignora: así no toca la base de datos.
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'invoice.created', data: { object: {} } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });
    const res = await app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      payload,
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { received: true });
  });
});

test('sin facturación activa, el checkout responde 503', async () => {
  await withEnv({ BILLING_ENABLED: '0' }, async () => {
    const app = Fastify();
    app.decorateRequest('user', null);
    app.addHook('onRequest', async (req) => { req.user = { id: 'u1', email: 'a@b.c' }; });
    app.decorate('requireAuth', async () => {});
    await app.register(billingRoutes, { prefix: '/billing' });
    const res = await app.inject({ method: 'POST', url: '/billing/checkout', payload: { plan: 'pro', interval: 'year' } });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().code, 'billing_unavailable');
  });
});
