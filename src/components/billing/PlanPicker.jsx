"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronDown, Loader2, Minus, ShieldOff, Sparkles, Tv } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import useEntitlements from "@/hooks/useEntitlements";
import useBillingActions from "@/components/billing/useBillingActions";
import {
  COMPARISON_ROWS,
  INTERVAL_LABELS,
  PLAN_HIGHLIGHTS,
  PLAN_ORDER,
  PLANS,
  formatPrice,
  yearlySavings,
} from "@/lib/billing/plans";

// Selector mensual/anual, las tres tarjetas de planes (cada una con lo que
// añade al plan anterior) y debajo la comparativa completa con qué es cada
// cosa. Lo usan /planes y Ajustes → Suscripción.
//
// En el móvil las tarjetas se compactan (precio junto al nombre, sin bloque de
// precio grande) y la comparativa se pliega tras un botón.

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

function priceNote(plan, interval) {
  const cents = plan.prices[interval];
  const savings = interval === "year" ? yearlySavings(plan) : null;
  if (savings) return `${formatPrice(savings.monthly)} al mes`;
  if (cents) return `${formatPrice(plan.prices.year)} si pagas el año`;
  return "Sin tarjeta";
}

function Price({ plan, interval }) {
  const cents = plan.prices[interval];
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span className="text-5xl font-bold tracking-tight text-white tabular-nums">{formatPrice(cents)}</span>
        <span className="text-sm text-zinc-500">{cents ? `/ ${INTERVAL_LABELS[interval]}` : "para siempre"}</span>
      </p>
      <p className="mt-1.5 h-4 text-xs text-zinc-500">{priceNote(plan, interval)}</p>
    </div>
  );
}

// Precio compacto del móvil, a la derecha del nombre.
function CompactPrice({ plan, interval }) {
  const cents = plan.prices[interval];
  return (
    <div className="ml-auto shrink-0 text-right sm:hidden">
      <p className="flex items-baseline justify-end gap-1">
        <span className="text-2xl font-bold tracking-tight text-white tabular-nums">{formatPrice(cents)}</span>
        {cents ? <span className="text-xs text-zinc-500">/ {INTERVAL_LABELS[interval]}</span> : null}
      </p>
      <p className="text-[11px] text-zinc-500">{priceNote(plan, interval)}</p>
    </div>
  );
}

function PlanCard({ plan, interval, current, action }) {
  const style = PLAN_STYLE[plan.id];
  const Icon = style.icon;
  const highlighted = plan.highlighted;
  const highlights = PLAN_HIGHLIGHTS[plan.id];
  const badge = current ? "Tu plan" : highlighted ? `${plan.trialDays} días gratis` : null;
  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className={`relative flex flex-col rounded-3xl p-5 sm:p-7 ${
        highlighted
          ? "bg-gradient-to-b from-emerald-500/[0.13] to-white/[0.02] ring-1 ring-emerald-400/40 shadow-[0_0_70px_-25px_rgba(16,185,129,0.6)]"
          : "bg-white/[0.03] ring-1 ring-white/[0.07]"
      }`}
    >
      {badge ? (
        <span
          className={`absolute -top-2.5 left-5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase leading-none tracking-wider sm:left-7 ${
            current ? "bg-zinc-200 text-black" : "bg-emerald-400 text-black"
          }`}
        >
          {badge}
        </span>
      ) : null}

      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${style.tile}`}>
          <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id={`plan-${plan.id}`} className="text-base font-bold leading-tight text-white sm:text-lg">
            {plan.name}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400 sm:hidden">{plan.tagline}</p>
        </div>
        <CompactPrice plan={plan} interval={interval} />
      </div>
      <p className="mt-3 hidden text-sm text-zinc-400 sm:block">{plan.tagline}</p>

      <div className="mt-6 hidden sm:block">
        <Price plan={plan} interval={interval} />
      </div>

      <div className="mt-4 sm:mt-6">{action}</div>

      <div className="mt-4 sm:mt-6">
        {highlights.intro ? <p className="mb-2 text-xs font-bold text-zinc-300 sm:text-sm">{highlights.intro}</p> : null}
        <ul className="space-y-1.5 sm:space-y-2.5">
          {highlights.items.map((item) => {
            const included = item.included !== false;
            return (
              <li key={item.text} className="flex items-start gap-2.5 text-sm">
                {included ? (
                  <Check className={`mt-0.5 h-4 w-4 shrink-0 ${style.check}`} aria-hidden="true" />
                ) : (
                  <Minus className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" aria-hidden="true" />
                )}
                <span className={included ? "text-zinc-200" : "text-zinc-500"}>{item.text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

function ComparisonValue({ value, planId }) {
  if (value === true) {
    return <Check className={`mx-auto h-4 w-4 ${PLAN_STYLE[planId].check}`} aria-label="Incluido" />;
  }
  if (value === false) {
    return <Minus className="mx-auto h-4 w-4 text-zinc-700" aria-label="No incluido" />;
  }
  return <span className="text-sm font-bold text-white tabular-nums">{value}</span>;
}

// Tabla con todo lo que trae cada plan y qué es cada cosa. En el móvil va
// plegada (el botón solo existe ahí); desde sm siempre abierta.
function PlanComparison() {
  const [open, setOpen] = useState(false);
  const grid = "grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem_3.25rem] items-center gap-x-1 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] sm:gap-x-2";
  return (
    <section aria-labelledby="plan-comparison" className="mx-auto mt-6 max-w-4xl sm:mt-14">
      <h2 id="plan-comparison" className="hidden text-center text-xl font-bold text-white sm:block">
        Qué incluye cada plan
      </h2>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="plan-comparison-table"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold text-zinc-300 ring-1 ring-inset ring-white/[0.08] transition-colors hover:text-white sm:hidden"
      >
        {open ? "Ocultar comparativa" : "Comparar planes en detalle"}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      <div id="plan-comparison-table" className={`${open ? "block" : "hidden"} mt-4 sm:mt-6 sm:block`} role="table" aria-label="Comparativa de planes">
        <div role="row" className={`${grid} border-b border-white/[0.08] pb-3`}>
          {/* sr-only va dentro: suelto saldría del flujo del grid y movería las columnas. */}
          <span role="columnheader">
            <span className="sr-only">Función</span>
          </span>
          {PLAN_ORDER.map((id) => (
            <span key={id} role="columnheader" className="text-center text-[11px] font-bold leading-tight text-zinc-300 sm:text-sm">
              {PLANS[id].name}
            </span>
          ))}
        </div>
        {COMPARISON_ROWS.map((row) => (
          <div key={row.label} role="row" className={`${grid} border-b border-white/[0.05] py-3`}>
            <div role="rowheader" className="min-w-0 pr-2">
              <p className="text-sm font-bold text-zinc-200">{row.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-zinc-500">{row.description}</p>
            </div>
            {PLAN_ORDER.map((id) => (
              <div key={id} role="cell" className="text-center">
                <ComparisonValue value={row.values[id]} planId={id} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PlanPicker({ loginNext = "/planes", className = "" }) {
  const { authenticated, hydrated } = useAuth();
  const { plan: currentPlan, billingEnabled, subscription, ready } = useEntitlements();
  const { checkout, openPortal, pending, error } = useBillingActions();
  const [interval, setBillingInterval] = useState("year");

  const hasSubscription = Boolean(subscription && ACTIVE_STATUSES.has(subscription.status));
  // Con la facturación apagada nadie tiene «su plan»: todo está abierto.
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
        <Link href={`/login?next=${encodeURIComponent(loginNext)}`} className={style}>
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

  return (
    <div className={className}>
      <div className="flex justify-center">
        <IntervalSwitch value={interval} onChange={setBillingInterval} />
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-center text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 sm:gap-5 md:grid-cols-3">
        {PLAN_ORDER.map((id) => (
          <PlanCard key={id} plan={PLANS[id]} interval={interval} current={knownPlan === id} action={actionFor(PLANS[id])} />
        ))}
      </div>

      <PlanComparison />
    </div>
  );
}
