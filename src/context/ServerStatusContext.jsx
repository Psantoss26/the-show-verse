"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CONNECTION_EVENT, reportConnection } from "@/lib/offline/client";

const ServerStatusContext = createContext({ serverOnline: true, checkNow: async () => true });

// Una comprobación fallida no basta para pasar a solo lectura: al abrir la app
// (sobre todo la de Android) o volver a ella, la primera petición suele fallar
// mientras la red despierta o el servidor arranca en frío, y el aviso «Sin
// conexión · solo lectura» salía un instante para nada. Con el service worker
// controlando, él repite la sonda (public/sw.js, HEALTH_CONFIRM_MS); sin él,
// la repite esta página tras CONFIRM_MS.
const CONFIRM_MS = 2000;
// Cubre las dos sondas del service worker (4,5 s cada una) y su espera.
const HEALTH_TIMEOUT_MS = 12000;

async function probeHealth() {
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const payload = await res.json();
    return res.ok && payload?.ok === true;
  } catch { /* unreachable includes NAS/Cloudflare failures, not only Wi-Fi */ }
  return false;
}

export function ServerStatusProvider({ children }) {
  const [serverOnline, setServerOnline] = useState(true);
  const pending = useRef(null);
  const checkNow = useCallback(async () => {
    if (pending.current) return pending.current;
    pending.current = (async () => {
      let online = await probeHealth();
      if (!online && navigator.onLine !== false && !navigator.serviceWorker?.controller) {
        await new Promise((resolve) => setTimeout(resolve, CONFIRM_MS));
        online = await probeHealth();
      }
      reportConnection(online);
      return online;
    })().finally(() => { pending.current = null; });
    return pending.current;
  }, []);

  useEffect(() => {
    let timer;
    let cancelled = false;
    const connection = (event) => setServerOnline(event.detail.online);
    const message = (event) => {
      if (event.data?.type === "OFFLINE_CONNECTION") reportConnection(event.data.online);
    };
    const run = async () => {
      clearTimeout(timer);
      const online = await checkNow();
      if (!cancelled) timer = setTimeout(run, online ? 60000 : 15000);
    };
    const visible = () => { if (document.visibilityState === "visible") void run(); };
    // El evento `offline` llega también en falso (el WebView lo lanza un
    // instante al despertar la red): se comprueba antes de pasar a solo lectura.
    const offline = () => { void run(); };
    window.addEventListener(CONNECTION_EVENT, connection);
    navigator.serviceWorker?.addEventListener("message", message);
    window.addEventListener("online", run);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", visible);
    void run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(CONNECTION_EVENT, connection);
      navigator.serviceWorker?.removeEventListener("message", message);
      window.removeEventListener("online", run);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [checkNow]);

  return <ServerStatusContext.Provider value={{ serverOnline, checkNow }}>{children}</ServerStatusContext.Provider>;
}
export function useServerStatus() { return useContext(ServerStatusContext); }
export function useServerOnline() { return useContext(ServerStatusContext).serverOnline; }
