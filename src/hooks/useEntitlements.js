"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/context/AuthContext";
import { OPEN_ENTITLEMENTS, PLANS } from "@/lib/billing/plans";

// Derechos del plan del usuario actual (/api/billing/me), compartidos por toda
// la app: una sola petición por sesión y un único estado para todos los
// componentes que los consultan. Sin sesión se pide el catálogo público para
// saber si la facturación está activa (y entonces el visitante es «Gratis»).
//
// Mientras no hay respuesta se usa OPEN_ENTITLEMENTS (todo abierto, sin
// anuncios): nunca se enseña un bloqueo a quien sí tiene acceso.

const store = {
  key: null,
  promise: null,
  data: { entitlements: OPEN_ENTITLEMENTS, subscription: null, portalAvailable: false, ready: false },
  listeners: new Set(),
};

function emit(data) {
  store.data = data;
  for (const listener of store.listeners) listener();
}

function subscribe(listener) {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

function snapshot() {
  return store.data;
}

function anonymousEntitlements(billingEnabled) {
  if (!billingEnabled) return OPEN_ENTITLEMENTS;
  return {
    plan: "free",
    ads: true,
    features: [],
    limits: PLANS.free.limits,
    billingEnabled: true,
    source: "free",
    graceEndsAt: null,
  };
}

async function fetchEntitlements(userId) {
  if (!userId) {
    const res = await fetch("/api/billing/plans", { cache: "no-store" });
    const json = res.ok ? await res.json() : null;
    return { entitlements: anonymousEntitlements(Boolean(json?.billingEnabled)), subscription: null, portalAvailable: false };
  }
  const res = await fetch("/api/billing/me", { cache: "no-store" });
  if (!res.ok) throw new Error(`billing/me ${res.status}`);
  const json = await res.json();
  return {
    entitlements: json.entitlements || OPEN_ENTITLEMENTS,
    subscription: json.subscription || null,
    portalAvailable: Boolean(json.portalAvailable),
  };
}

function load(key, userId, { force = false } = {}) {
  if (!force && store.key === key && store.promise) return store.promise;
  // Cambio de cuenta: los derechos de la anterior no valen ni un instante.
  if (store.key !== null && store.key !== key) {
    emit({ entitlements: OPEN_ENTITLEMENTS, subscription: null, portalAvailable: false, ready: false });
  }
  store.key = key;
  store.promise = fetchEntitlements(userId)
    .then((data) => {
      if (store.key === key) emit({ ...data, ready: true });
    })
    .catch(() => {
      // Sin backend (o sin conexión): se queda abierto, nunca bloquea.
      if (store.key === key) {
        store.promise = null;
        emit({ ...store.data, ready: true });
      }
    });
  return store.promise;
}

export default function useEntitlements() {
  const { user, hydrated } = useAuth();
  const userId = user?.id || null;
  const key = hydrated ? userId || "anonymous" : null;
  const data = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (key) load(key, userId);
  }, [key, userId]);

  const refresh = useCallback(() => (key ? load(key, userId, { force: true }) : Promise.resolve()), [key, userId]);
  const has = useCallback((feature) => data.entitlements.features?.includes(feature), [data.entitlements]);

  return {
    ...data,
    // Datos de otra sesión (cambio de cuenta) no cuentan como listos.
    ready: data.ready && store.key === key,
    plan: data.entitlements.plan,
    ads: data.entitlements.ads,
    billingEnabled: data.entitlements.billingEnabled,
    limits: data.entitlements.limits,
    has,
    refresh,
  };
}
