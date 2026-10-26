"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";

import useEntitlements from "@/hooks/useEntitlements";
import { PLANS, PRO_FEATURES } from "@/lib/billing/plans";

// Tarjeta «Esta función es Pro». Se pinta en lugar del contenido bloqueado.
export function ProUpsell({ feature, className = "", compact = false }) {
  const info = PRO_FEATURES[feature] || { title: "Función Pro", description: "" };
  return (
    <section
      aria-labelledby={`pro-upsell-${feature}`}
      className={`relative isolate overflow-hidden rounded-3xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.12] via-black/40 to-black/60 text-center backdrop-blur-xl ${
        compact ? "px-5 py-6" : "px-6 py-12 sm:py-16"
      } ${className}`}
    >
      <div aria-hidden="true" className="absolute -top-24 left-1/2 -z-10 h-48 w-48 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
        <Lock className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-emerald-400">Incluido en Pro</p>
      <h2 id={`pro-upsell-${feature}`} className="mt-1 text-xl font-bold text-white sm:text-2xl">
        {info.title}
      </h2>
      {info.description ? <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">{info.description}</p> : null}
      <Link
        href="/planes"
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-emerald-400 px-6 text-sm font-bold text-black transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Probar Pro {PLANS.pro.trialDays} días gratis
      </Link>
    </section>
  );
}

// Muestra `children` si el plan del usuario incluye `feature`; si no, la
// tarjeta de mejora (o `fallback`). Mientras se cargan los derechos, se
// enseña el contenido: nunca un bloqueo por un instante.
export default function ProGate({ feature, children, fallback, className, compact }) {
  const { has } = useEntitlements();
  if (has(feature)) return children;
  return fallback ?? <ProUpsell feature={feature} className={className} compact={compact} />;
}
