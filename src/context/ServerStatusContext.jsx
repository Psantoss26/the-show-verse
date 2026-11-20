"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CONNECTION_EVENT, isServerReachable, reportConnection } from "@/lib/offline/client";
import { checkConnection } from "@/lib/offline/connectionCheck";

const ServerStatusContext = createContext({ serverOnline: true, checkNow: async () => true });

// El aviso «Sin conexión · solo lectura» solo sale con el servidor confirmado
// como caído: ver lib/offline/connectionCheck.js. Al volver a la página tras un
// rato en segundo plano las primeras peticiones fallan aunque haya conexión, y
// antes eso dejaba el aviso puesto hasta recargar.
// Cubre las dos sondas del service worker (4,5 s cada una), su espera y el
// arranque del propio service worker.
const HEALTH_TIMEOUT_MS = 15000;
const ONLINE_RECHECK_MS = 60000;
const OFFLINE_RECHECK_MS = 15000;

async function probeHealth() {
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const payload = await res.json();
    return res.ok && payload?.ok === true;
  } catch { /* unreachable includes NAS/Cloudflare failures, not only Wi-Fi */ }
  return false;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isHidden = () => document.visibilityState === "hidden";
const isDeviceOffline = () => navigator.onLine === false;

export function ServerStatusProvider({ children }) {
  const [serverOnline, setServerOnline] = useState(true);
  const pending = useRef(null);
  // Cuenta las veces que la página ha pasado a segundo plano: una sonda que
  // empezó antes de una de ellas no sirve para declarar el servidor caído.
  const hiddenEpoch = useRef(0);
  const checkNow = useCallback(async () => {
    if (pending.current) return pending.current;
    pending.current = (async () => {
      const verdict = await checkConnection({
        probe: probeHealth, wait, isHidden, isDeviceOffline, hiddenEpoch: () => hiddenEpoch.current,
      });
      if (verdict === null) return isServerReachable();
      reportConnection(verdict);
      return verdict;
    })().finally(() => { pending.current = null; });
    return pending.current;
  }, []);

  useEffect(() => {
    let timer;
    let cancelled = false;
    const connection = (event) => setServerOnline(event.detail.online);
    const run = async () => {
      clearTimeout(timer);
      // Oculta no se sondea: al volver a primer plano se comprueba de nuevo.
      if (isHidden()) return;
      const online = await checkNow();
      if (!cancelled && !isHidden()) {
        clearTimeout(timer);
        timer = setTimeout(run, online ? ONLINE_RECHECK_MS : OFFLINE_RECHECK_MS);
      }
    };
    // El service worker avisa cuando su propia sonda falla, a menudo por una
    // petición cortada al congelar la página: es una pista, no un veredicto.
    // La página lo confirma con su comprobación antes de pasar a solo lectura.
    const message = (event) => {
      if (event.data?.type !== "OFFLINE_CONNECTION") return;
      if (event.data.online) reportConnection(true);
      else if (isServerReachable()) void run();
    };
    const visible = () => {
      if (isHidden()) { hiddenEpoch.current += 1; clearTimeout(timer); return; }
      void run();
    };
    const frozen = () => { hiddenEpoch.current += 1; };
    // El evento `offline` llega también en falso (el WebView lo lanza un
    // instante al despertar la red): se comprueba antes de pasar a solo lectura.
    window.addEventListener(CONNECTION_EVENT, connection);
    navigator.serviceWorker?.addEventListener("message", message);
    window.addEventListener("online", run);
    window.addEventListener("offline", run);
    window.addEventListener("focus", run);
    window.addEventListener("pageshow", run);
    document.addEventListener("visibilitychange", visible);
    document.addEventListener("freeze", frozen);
    document.addEventListener("resume", run);
    void run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(CONNECTION_EVENT, connection);
      navigator.serviceWorker?.removeEventListener("message", message);
      window.removeEventListener("online", run);
      window.removeEventListener("offline", run);
      window.removeEventListener("focus", run);
      window.removeEventListener("pageshow", run);
      document.removeEventListener("visibilitychange", visible);
      document.removeEventListener("freeze", frozen);
      document.removeEventListener("resume", run);
    };
  }, [checkNow]);

  return <ServerStatusContext.Provider value={{ serverOnline, checkNow }}>{children}</ServerStatusContext.Provider>;
}
export function useServerStatus() { return useContext(ServerStatusContext); }
export function useServerOnline() { return useContext(ServerStatusContext).serverOnline; }
