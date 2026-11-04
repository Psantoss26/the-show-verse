"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CreditCard, Info, Receipt, RotateCcw, Sparkles } from "lucide-react";

import useEntitlements from "@/hooks/useEntitlements";
import PlanPicker from "@/components/billing/PlanPicker";

export default function PlansClient() {
  const { billingEnabled, ready, refresh, entitlements } = useEntitlements();
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get("checkout");

  // Al volver de Stripe el webhook puede llegar un momento después: se
  // vuelven a pedir los derechos un par de veces.
  useEffect(() => {
    if (checkoutResult !== "success") return undefined;
    const timers = [1500, 5000].map((delay) => window.setTimeout(() => refresh(), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [checkoutResult, refresh]);

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

      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-6 sm:pt-10 lg:pt-16">
        <header className="mx-auto max-w-xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Elige tu plan<span className="text-emerald-500">.</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-400 sm:mt-3 sm:text-base">Lo esencial es gratis. Paga solo si quieres quitar los anuncios o ir a por todo.</p>
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

        <PlanPicker className="mt-8" />

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
