"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, ArrowRight, Check, CreditCard, Loader2, Sparkles } from "lucide-react";

import useEntitlements from "@/hooks/useEntitlements";
import useBillingActions from "@/components/billing/useBillingActions";
import { INTERVAL_LABELS, PLANS, PRO_FEATURES, formatPrice, planName } from "@/lib/billing/plans";

const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function statusLine(subscription, entitlements) {
  if (!entitlements.billingEnabled) return "Mientras los planes no estén activos, todas las funciones son gratis.";
  if (entitlements.source === "grace") {
    return `Pro gratis por estar desde el principio, hasta el ${formatDate(entitlements.graceEndsAt)}.`;
  }
  if (!subscription || !ACTIVE_STATUSES.has(subscription.status)) return "Sin suscripción activa.";
  const end = formatDate(subscription.currentPeriodEnd);
  if (subscription.status === "trialing") return `Prueba gratuita hasta el ${end}.`;
  if (subscription.cancelAtPeriodEnd) return `Cancelada: mantienes el plan hasta el ${end}.`;
  const price = PLANS[subscription.plan]?.prices?.[subscription.interval];
  return `${price ? `${formatPrice(price)} / ${INTERVAL_LABELS[subscription.interval]} · ` : ""}se renueva el ${end}.`;
}

export default function SubscriptionPanel({ panelClassName = "" }) {
  const { entitlements, subscription, portalAvailable, ready, refresh } = useEntitlements();
  const { openPortal, pending, error } = useBillingActions();

  // Al volver del portal de Stripe el plan puede haber cambiado.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const plan = entitlements.plan;
  const isPro = plan === "pro";
  const hasSubscription = Boolean(subscription && ACTIVE_STATUSES.has(subscription.status));
  const pastDue = subscription?.status === "past_due";

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="subscription-current"
        className={`${panelClassName} rounded-3xl p-5 sm:p-6 ${isPro && entitlements.billingEnabled ? "border-emerald-400/30" : ""}`}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                isPro ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-zinc-300"
              }`}
            >
              {isPro ? <Sparkles className="h-5 w-5" aria-hidden="true" /> : <CreditCard className="h-5 w-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tu plan</p>
              <h3 id="subscription-current" className="text-xl font-bold text-white">
                {ready ? planName(plan) : <span className="text-zinc-500">Cargando…</span>}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400 sm:text-sm">{statusLine(subscription, entitlements)}</p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {hasSubscription && portalAvailable ? (
              <button
                type="button"
                data-online-only="true"
                onClick={openPortal}
                disabled={Boolean(pending)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/5 px-5 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending === "portal" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Gestionar
              </button>
            ) : null}
            {!isPro || entitlements.source === "grace" ? (
              <Link
                href="/planes"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 text-sm font-bold text-black transition hover:bg-emerald-300"
              >
                {entitlements.billingEnabled ? "Mejorar plan" : "Ver planes"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>

        {pastDue ? (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs text-amber-200 sm:text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            No hemos podido cobrar la última renovación. Actualiza tu método de pago en «Gestionar» para no perder el plan.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="subscription-features" className={`${panelClassName} rounded-3xl p-5 sm:p-6`}>
        <h3 id="subscription-features" className="text-xs font-bold uppercase tracking-widest text-emerald-400/80">
          Funciones Pro
        </h3>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {Object.entries(PRO_FEATURES).map(([id, feature]) => {
            const included = entitlements.features?.includes(id);
            return (
              <li key={id} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    included ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-zinc-600"
                  }`}
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-bold ${included ? "text-white" : "text-zinc-400"}`}>{feature.title}</span>
                  <span className="block text-xs text-zinc-500">{feature.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="px-1 text-xs leading-relaxed text-zinc-600">
        Los pagos se gestionan con Stripe. Puedes cancelar en cualquier momento desde «Gestionar»; mantienes el plan hasta el final del periodo pagado.
      </p>
    </div>
  );
}
