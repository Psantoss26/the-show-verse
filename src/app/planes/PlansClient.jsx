"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CheckCircle2, CreditCard, Info, Loader2, Receipt, RotateCcw, ShieldOff, Sparkles, Tv, X } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import useEntitlements from "@/hooks/useEntitlements";
import useBillingActions from "@/components/billing/useBillingActions";
import { COMPARISON_ROWS, INTERVAL_LABELS, PLAN_ORDER, PLANS, formatPrice, yearlySavings } from "@/lib/billing/plans";

const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

const MAX_YEARLY_SAVING = Math.max(...PLAN_ORDER.map((id) => yearlySavings(PLANS[id])?.percent || 0));

// Acento de cada plan: icono, color del icono y de las marcas de la lista.
const PLAN_STYLE = {
  free: { icon: Tv, tile: "bg-white/[0.06] text-zinc-300", check: "text-zinc-300" },
  adfree: { icon: ShieldOff, tile: "bg-sky-400/10 text-sky-300", check: "text-sky-300" },
  pro: { icon: Sparkles, tile: "bg-emerald-400/15 text-emerald-300", check: "text-emerald-400" },
};

function IntervalSwitch({ value, onChange }) {
  const options = [
    { id: "month", label: "Mensual" },
    { id: "year", label: "Anual", badge: `−${MAX_YEARLY_SAVING} %` },
  ];
  return (
    <div role="radiogroup" aria-label="Periodo de facturación" className="inline-flex rounded-full bg-white/[0.05] p-1">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={`inline-flex h-9 items-center gap-2 rounded-full px-5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
              active ? "bg-white text-black" : "text-zinc-400 hover:text-white"
            }`}
          >
            {option.label}
            {option.badge ? (
              <span className={`text-[11px] ${active ? "text-emerald-600" : "text-emerald-400"}`}>{option.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function Price({ plan, interval }) {
  const cents = plan.prices[interval];
  const savings = interval === "year" ? yearlySavings(plan) : null;
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span className="text-5xl font-bold tracking-tight text-white tabular-nums">{formatPrice(cents)}</span>
        <span className="text-sm text-zinc-500">{cents ? `/ ${INTERVAL_LABELS[interval]}` : "para siempre"}</span>
      </p>
      <p className="mt-1.5 h-4 text-xs text-zinc-500">
        {savings ? `${formatPrice(savings.monthly)} al mes` : cents ? `${formatPrice(plan.prices.year)} si pagas el año` : "Sin tarjeta"}
      </p>
    </div>
  );
}

function FeatureRow({ row, planId }) {
  const value = row.values[planId];
  const included = value !== false;
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className={included ? "text-zinc-200" : "text-zinc-600"}>{row.label}</span>
      {value === true ? (
        <Check className={`h-4 w-4 shrink-0 ${PLAN_STYLE[planId].check}`} aria-label="Incluido" />
      ) : value === false ? (
        <X className="h-4 w-4 shrink-0 text-zinc-700" aria-label="No incluido" />
      ) : (
        <span className="shrink-0 text-sm font-bold text-white">{value}</span>
      )}
    </li>
  );
}

function PlanCard({ plan, interval, current, action }) {
  const style = PLAN_STYLE[plan.id];
  const Icon = style.icon;
  const highlighted = plan.highlighted;
  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className={`relative flex flex-col rounded-3xl p-6 sm:p-7 ${
        highlighted
          ? "bg-gradient-to-b from-emerald-500/[0.13] to-white/[0.02] ring-1 ring-emerald-400/40 shadow-[0_0_70px_-25px_rgba(16,185,129,0.6)]"
          : "bg-white/[0.03] ring-1 ring-white/[0.07]"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${style.tile}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 id={`plan-${plan.id}`} className="text-lg font-bold text-white">
          {plan.name}
        </h2>
        {current ? (
          <span className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-200">Tu plan</span>
        ) : highlighted ? (
          <span className="ml-auto rounded-full bg-emerald-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
            {plan.trialDays} días gratis
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-zinc-400">{plan.tagline}</p>

      <div className="mt-6">
        <Price plan={plan} interval={interval} />
      </div>

      <div className="mt-6">{action}</div>

      <ul className="mt-6 divide-y divide-white/[0.06] border-t border-white/[0.06]">
        {COMPARISON_ROWS.map((row) => (
          <FeatureRow key={row.label} row={row} planId={plan.id} />
        ))}
      </ul>
    </article>
  );
}

export default function PlansClient() {
  const { authenticated, hydrated } = useAuth();
  const { plan: currentPlan, billingEnabled, subscription, ready, refresh, entitlements } = useEntitlements();
  const { checkout, openPortal, pending, error } = useBillingActions();
  const [interval, setBillingInterval] = useState("year");
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get("checkout");

  // Al volver de Stripe el webhook puede llegar un momento después: se
  // vuelven a pedir los derechos un par de veces.
  useEffect(() => {
    if (checkoutResult !== "success") return undefined;
    const timers = [1500, 5000].map((delay) => window.setTimeout(() => refresh(), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [checkoutResult, refresh]);

  const hasSubscription = Boolean(subscription && ACTIVE_STATUSES.has(subscription.status));
  const knownPlan = billingEnabled && ready ? currentPlan : null;

  function actionFor(plan) {
    const base =
      "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-50";
    const primary = `${base} bg-emerald-400 text-black hover:bg-emerald-300`;
    const secondary = `${base} bg-white/[0.07] text-white hover:bg-white/[0.12]`;
    const style = plan.highlighted ? primary : secondary;

    if (plan.id === "free") {
      return (
        <span className={`${base} bg-transparent text-zinc-500 ring-1 ring-inset ring-white/[0.08]`}>
          {knownPlan === "free" ? "Tu plan actual" : "Incluido al registrarte"}
        </span>
      );
    }
    if (!billingEnabled) {
      return (
        <button type="button" disabled className={style}>
          Muy pronto
        </button>
      );
    }
    if (hydrated && !authenticated) {
      return (
        <Link href="/login?next=/planes" className={style}>
          Inicia sesión para empezar
        </Link>
      );
    }
    if (hasSubscription) {
      const isCurrent = subscription.plan === plan.id;
      return (
        <button type="button" onClick={openPortal} disabled={Boolean(pending)} className={isCurrent ? secondary : style}>
          {pending === "portal" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {isCurrent ? "Gestionar suscripción" : `Cambiar a ${plan.name}`}
        </button>
      );
    }
    const key = `${plan.id}:${interval}`;
    return (
      <button type="button" onClick={() => checkout(plan.id, interval)} disabled={Boolean(pending) || !ready} className={style}>
        {pending === key ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {plan.trialDays ? `Probar ${plan.trialDays} días gratis` : `Elegir ${plan.name}`}
      </button>
    );
  }

  // Un solo aviso a la vez, del más relevante al menos.
  const notice =
    checkoutResult === "success"
      ? { tone: "success", icon: CheckCircle2, text: "¡Gracias! Tu suscripción se está activando; en unos segundos verás tu nuevo plan." }
      : checkoutResult === "cancel"
        ? { tone: "neutral", icon: Info, text: "No se ha hecho ningún cargo. Puedes elegir un plan cuando quieras." }
        : entitlements.source === "grace" && entitlements.graceEndsAt
          ? {
              tone: "success",
              icon: Sparkles,
              text: `Por estar desde el principio, tienes Pro gratis hasta el ${new Date(entitlements.graceEndsAt).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}.`,
            }
          : !billingEnabled && ready
            ? { tone: "neutral", icon: Info, text: "Los planes de pago llegarán pronto. Mientras tanto, todo es gratis para todos." }
            : null;

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-black text-zinc-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_55%_55%_at_50%_0%,rgba(16,185,129,0.14),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-10 lg:pt-16">
        <header className="mx-auto max-w-xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Elige tu plan<span className="text-emerald-500">.</span>
          </h1>
          <p className="mt-3 text-base text-zinc-400">Lo esencial es gratis. Paga solo si quieres quitar los anuncios o ir a por todo.</p>
        </header>

        {notice ? (
          <div
            role="status"
            className={`mx-auto mt-6 flex max-w-xl items-center justify-center gap-2.5 rounded-2xl px-4 py-3 text-sm ${
              notice.tone === "success" ? "bg-emerald-500/10 text-emerald-100" : "bg-white/[0.04] text-zinc-300"
            }`}
          >
            <notice.icon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>{notice.text}</span>
          </div>
        ) : null}

        <div className="mt-8 flex justify-center">
          <IntervalSwitch value={interval} onChange={setBillingInterval} />
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-center text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PLAN_ORDER.map((id) => (
            <PlanCard key={id} plan={PLANS[id]} interval={interval} current={knownPlan === id} action={actionFor(PLANS[id])} />
          ))}
        </div>

        <ul className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-zinc-500">
          <li className="flex items-center gap-2">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Cancela cuando quieras
          </li>
          <li className="flex items-center gap-2">
            <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
            IVA incluido
          </li>
          <li className="flex items-center gap-2">
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            Pago seguro con Stripe
          </li>
        </ul>
      </div>
    </main>
  );
}
