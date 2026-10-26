"use client";

import { useCallback, useState } from "react";

// Abre Stripe Checkout o el portal de cliente. Devuelve `pending` (qué acción
// está en curso, para el spinner del botón) y el último error legible.
export default function useBillingActions() {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  const go = useCallback(async (kind, path, body) => {
    setPending(kind);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) {
        throw new Error(
          json?.code === "billing_unavailable"
            ? "Los pagos todavía no están disponibles."
            : json?.code === "no_customer"
              ? "Aún no tienes ninguna suscripción que gestionar."
              : "No se ha podido abrir el pago. Inténtalo de nuevo.",
        );
      }
      window.location.assign(json.url);
    } catch (err) {
      setError(err.message);
      setPending(null);
    }
  }, []);

  const checkout = useCallback(
    (plan, interval) => go(`${plan}:${interval}`, "/api/billing/checkout", { plan, interval }),
    [go],
  );
  const openPortal = useCallback(() => go("portal", "/api/billing/portal"), [go]);

  return { checkout, openPortal, pending, error };
}
