"use client";

import { useEffect } from "react";
import { AlertTriangle, CreditCard, Loader2, Sparkles } from "lucide-react";

import useEntitlements from "@/hooks/useEntitlements";
import useBillingActions from "@/components/billing/useBillingActions";
import PlanPicker from "@/components/billing/PlanPicker";
import { INTERVAL_LABELS, PLANS, formatPrice, planName } from "@/lib/billing/plans";

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
  // Con los pagos apagados nadie ha contratado nada: todo está abierto.
  const currentLabel = entitlements.billingEnabled ? planName(plan) : "Acceso completo";
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
                {ready ? currentLabel : <span className="text-zinc-500">Cargando…</span>}
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

      <section aria-labelledby="subscription-plans" className="pt-2">
        <h3 id="subscription-plans" className="mb-5 text-xs font-bold uppercase tracking-widest text-emerald-400/80">
          Planes disponibles
        </h3>
        <PlanPicker loginNext="/profile/settings?tab=subscription" />
      </section>

      <p className="px-1 text-xs leading-relaxed text-zinc-600">
        Los pagos se gestionan con Stripe. Puedes cancelar en cualquier momento desde «Gestionar»; mantienes el plan hasta el final del periodo pagado.
      </p>
    </div>
  );
}
