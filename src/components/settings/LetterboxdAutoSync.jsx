"use client";

// Sincronización completa diaria con Letterboxd: si la cuenta tiene Letterboxd
// conectado y la extensión de The Show Verse está en este navegador, una vez al
// día (al abrir la app, en segundo plano) se descarga la exportación oficial y
// se importa lo nuevo o cambiado: visionados, películas vistas y cambios de
// puntuación que el RSS no trae. Ver lib/letterboxd/sync.

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  LETTERBOXD_AUTO_SYNC_MS,
  detectShowVerseExtension,
  isLetterboxdSyncRunning,
  readLastAutoSync,
  syncLetterboxdWithExtension,
  writeLastAutoSync,
} from "@/lib/letterboxd/sync";

const START_DELAY_MS = 15000;

export default function LetterboxdAutoSync() {
  const { account, hydrated } = useAuth();
  const accountId = account?.id || null;

  useEffect(() => {
    if (!hydrated || !accountId) return undefined;
    if (Date.now() - readLastAutoSync() < LETTERBOXD_AUTO_SYNC_MS) return undefined;
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      if (cancelled || document.visibilityState === "hidden" || navigator.onLine === false) return;
      if (isLetterboxdSyncRunning()) return;
      // Se anota antes de empezar: un fallo (sin sesión en Letterboxd, sin
      // extensión…) no se reintenta en cada página, sino al día siguiente.
      writeLastAutoSync();
      try {
        const res = await fetch("/api/letterboxd/connection", { cache: "no-store", priority: "low" });
        const connection = res.ok ? await res.json() : null;
        if (cancelled || !connection?.connected || !connection.username) return;
        if (!(await detectShowVerseExtension())) return;
        await syncLetterboxdWithExtension({ username: connection.username, isCancelled: () => cancelled });
      } catch {
        /* silencioso: Ajustes → Conexiones muestra el estado y permite reintentar */
      }
    }, START_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accountId, hydrated]);

  return null;
}
