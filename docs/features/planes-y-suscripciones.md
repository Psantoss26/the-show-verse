---
tags: [area/features, type/referencia]
aliases: [Planes, Suscripciones, Pro, Facturación]
---
# Planes y suscripciones

Tres planes: **Gratis** (con anuncios), **Sin anuncios** y **Pro**. Todo está
detrás de `BILLING_ENABLED`: con el interruptor apagado (el estado actual) la
app se comporta como siempre, con todo desbloqueado y sin anuncios. Se
encenderá cuando exista el acuerdo comercial con TMDB.

Diseño y decisiones: [[2026-10-26-planes-de-pago-design]].

## Planes

| | Gratis | Sin anuncios | Pro |
|---|---|---|---|
| Precio | 0 € | 1,49 €/mes · 12 €/año | 3,49 €/mes · 29 €/año |
| Anuncios | Sí | No | No |
| Listas propias | 3 | 3 | Ilimitadas |
| Favoritos destacados del perfil | 3 + 3 | 3 + 3 | 5 + 5 |
| Estadísticas, recap, vista neuronal, Plex | — | — | Sí |

Pro tiene 7 días de prueba la primera vez. Quien se registró antes de
`BILLING_LAUNCH_AT` tiene Pro gratis `BILLING_GRACE_DAYS` días (30 por defecto)
desde el lanzamiento.

## Qué ve el usuario

- `/planes`: selector mensual/anual y tres tarjetas (precio, botón y la misma
  lista de características en el mismo orden, para comparar de un vistazo). Los botones abren Stripe Checkout; con una suscripción
  activa, el portal de cliente. Vuelve con `?checkout=success|cancel`.
- Ajustes → **Suscripción** (`?tab=subscription`): plan actual, renovación,
  cancelación programada o cobro pendiente, y botones «Gestionar» (portal de
  Stripe) y «Mejorar plan». La píldora de la cabecera de Ajustes abre esta
  pestaña.
- Bloqueos Pro (`ProGate` / `ProUpsell`): pestañas Estadísticas y Neuronal del
  perfil (cuenta el plan de quien **mira**), `/recap` (pantalla «Tu año es
  Pro»), Plex en Ajustes → Conexiones, huecos «Pro» en el editor de favoritos
  del perfil y aviso con enlace a `/planes` al pasar del límite de listas.
- Anuncios (`AdSlot`): cada 4 filas del dashboard y al final de la ficha. No
  pintan nada salvo que el plan lleve anuncios **y** haya red configurada
  (`NEXT_PUBLIC_ADSENSE_CLIENT` y el slot de la unidad);
  `NEXT_PUBLIC_ADS_PREVIEW=1` pinta un marcador para maquetar.

Mientras `/api/billing/me` no responde se pinta todo abierto (nunca un bloqueo
por un instante a quien sí tiene acceso).

## Código

- Catálogo y derechos: `backend/src/lib/billing/plans.js` (copia para pintar
  en `src/lib/billing/plans.js`: cambia las dos).
- Stripe: `backend/src/lib/billing/stripe.js`. Los webhooks escriben
  `subscriptions` y recalculan `users.plan` y `users.plan_expires_at` (fin del
  periodo + 2 días de margen); `getEntitlements` solo lee esos dos campos.
- Rutas: `backend/src/routes/billing.js` y proxies `src/app/api/billing/*`.
- Cliente: `src/hooks/useEntitlements.js` (una petición por sesión, compartida),
  `src/components/billing/*`, `src/components/settings/SubscriptionPanel.jsx`.
- Límites aplicados en el servidor: creación de listas (402 `plan_limit`) y
  `/api/plex/sync` (402 `plan_required`). Estadísticas, recap y vista neuronal
  solo se bloquean en el cliente.

## Puesta en marcha

1. En Stripe: crear los productos *Sin anuncios* y *Pro* con un precio mensual
   y otro anual cada uno, activar el portal de cliente (cambio de plan y
   cancelación) y, si se usa, Stripe Tax.
2. Webhook a `https://<web>/api/billing/webhook` con los eventos
   `checkout.session.completed` y `customer.subscription.created|updated|deleted`.
3. Variables del backend: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_{ADFREE,PRO}_{MONTH,YEAR}`, `STRIPE_AUTOMATIC_TAX`,
   `BILLING_LAUNCH_AT`, `BILLING_GRACE_DAYS` y, por último, `BILLING_ENABLED=1`.
4. Las suscripciones solo se venden en la web/PWA, no dentro de la app de
   Android.

## Relacionado
- [[Features]]
- [[backend_api_reference]]
- [[app-router-pages]]
- [[social-y-perfiles]]
- [[recap-anual]]
