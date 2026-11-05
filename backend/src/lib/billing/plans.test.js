// src/lib/billing/plans.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { getEntitlements, hasFeature, planForStripePrice, publicPlanBadge, stripePriceId } from './plans.js';

const now = new Date('2027-02-01T00:00:00Z');
const on = { BILLING_ENABLED: '1' };

test('con la facturación apagada todo el mundo tiene Pro sin anuncios', () => {
  const ent = getEntitlements(null, { now, env: {} });
  assert.equal(ent.plan, 'pro');
  assert.equal(ent.ads, false);
  assert.equal(ent.billingEnabled, false);
  assert.ok(hasFeature(ent, 'stats'));
});

test('sin suscripción: plan gratis con anuncios y límite de listas', () => {
  const ent = getEntitlements({ plan: 'free', createdAt: '2027-01-15' }, { now, env: on });
  assert.equal(ent.plan, 'free');
  assert.equal(ent.ads, true);
  assert.equal(ent.limits.lists, 3);
  assert.equal(hasFeature(ent, 'stats'), false);
});

test('una suscripción caducada vuelve al plan gratis', () => {
  const ent = getEntitlements({ plan: 'pro', planExpiresAt: '2027-01-31T00:00:00Z' }, { now, env: on });
  assert.equal(ent.plan, 'free');
});

test('sin anuncios solo quita los anuncios', () => {
  const ent = getEntitlements({ plan: 'adfree', planExpiresAt: '2027-03-01' }, { now, env: on });
  assert.equal(ent.plan, 'adfree');
  assert.equal(ent.ads, false);
  assert.equal(hasFeature(ent, 'neural'), false);
});

test('quien ya estaba registrado tiene Pro durante la gracia y luego no', () => {
  const env = { ...on, BILLING_LAUNCH_AT: '2027-01-20T00:00:00Z', BILLING_GRACE_DAYS: '30' };
  const veteran = { plan: 'free', createdAt: '2026-05-01T00:00:00Z' };
  const during = getEntitlements(veteran, { now, env });
  assert.equal(during.plan, 'pro');
  assert.equal(during.source, 'grace');

  const after = getEntitlements(veteran, { now: new Date('2027-03-01T00:00:00Z'), env });
  assert.equal(after.plan, 'free');

  const newcomer = getEntitlements({ plan: 'free', createdAt: '2027-01-25' }, { now, env });
  assert.equal(newcomer.plan, 'free');
});

test('los precios de Stripe se buscan en ambos sentidos', () => {
  const env = { STRIPE_PRICE_PRO_YEAR: 'price_pro_y', STRIPE_PRICE_ADFREE_MONTH: 'price_af_m' };
  assert.equal(stripePriceId('pro', 'year', env), 'price_pro_y');
  assert.equal(stripePriceId('free', 'year', env), null);
  assert.deepEqual(planForStripePrice('price_af_m', env), { plan: 'adfree', interval: 'month' });
  assert.equal(planForStripePrice('price_desconocido', env), null);
});

test('la insignia pública es el plan que se paga o Gratis', () => {
  const env = { ...on, BILLING_LAUNCH_AT: '2027-01-20T00:00:00Z' };
  assert.equal(publicPlanBadge({ plan: 'pro', planExpiresAt: '2027-03-01' }, { now, env }), 'pro');
  assert.equal(publicPlanBadge({ plan: 'adfree', planExpiresAt: null }, { now, env }), 'adfree');
  assert.equal(publicPlanBadge({ plan: 'free' }, { now, env }), 'free');
  assert.equal(publicPlanBadge(null, { now }), 'free');
  // Caducada o en la gracia de lanzamiento: Gratis.
  assert.equal(publicPlanBadge({ plan: 'pro', planExpiresAt: '2027-01-01' }, { now }), 'free');
  assert.equal(publicPlanBadge({ plan: 'free', createdAt: '2026-01-01' }, { now }), 'free');
  // Con la facturación apagada se enseña igual.
  assert.equal(publicPlanBadge({ plan: 'pro', planExpiresAt: '2027-03-01' }, { now }), 'pro');
});

test('las cuentas VIP llevan la insignia VIP sea cual sea su plan', () => {
  assert.equal(publicPlanBadge({ username: 'pablosantos', plan: 'free' }, { now, env: {} }), 'vip');
  assert.equal(publicPlanBadge({ username: 'PabloSantos', plan: 'pro', planExpiresAt: '2027-03-01' }, { now, env: {} }), 'vip');
  assert.equal(publicPlanBadge({ username: 'otra', plan: 'free' }, { now, env: {} }), 'free');
  // VIP_USERNAMES añade cuentas.
  assert.equal(publicPlanBadge({ username: 'otra', plan: 'free' }, { now, env: { VIP_USERNAMES: ' Otra , mas' } }), 'vip');
});
