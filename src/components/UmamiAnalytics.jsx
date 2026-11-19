"use client";

import { useEffect } from "react";
import Script from "next/script";
import { useAuth } from "@/context/AuthContext";

// Estadísticas de visitas con Umami, autoalojado en el NAS (ver
// docs/infrastructure/03-nas-selfhosting.md). El script sale del propio dominio
// por los rewrites /u-stats/* de next.config.ts. Solo en producción y con
// NEXT_PUBLIC_UMAMI_WEBSITE_ID en el build.
//
// Con sesión, la visita se asocia al usuario (umami.identify) para ver en el
// panel quién entra; sin sesión queda como visitante anónimo.

const WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || "";
const ENABLED = Boolean(WEBSITE_ID) && process.env.NODE_ENV === "production";

function identify(user) {
  const umami = typeof window !== "undefined" ? window.umami : null;
  if (!umami?.identify) return false;
  if (user?.id) umami.identify(user.id, { username: user.username || "" });
  return true;
}

export default function UmamiAnalytics() {
  const { user } = useAuth();
  const userId = user?.id || "";
  const username = user?.username || "";

  useEffect(() => {
    if (!ENABLED || !userId) return undefined;
    const current = { id: userId, username };
    if (identify(current)) return undefined;
    // El script carga después de la hidratación: reintentar hasta que esté.
    const timer = window.setInterval(() => {
      if (identify(current)) window.clearInterval(timer);
    }, 1000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 30000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [userId, username]);

  if (!ENABLED) return null;
  return (
    <Script
      src="/u-stats/script.js"
      data-website-id={WEBSITE_ID}
      data-domains="theshowverse.com"
      strategy="afterInteractive"
    />
  );
}
