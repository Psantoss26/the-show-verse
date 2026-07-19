"use client";

// Estado de conexión CON EL SERVIDOR PROPIO (NAS), no con internet: en el escenario
// objetivo el dispositivo tiene internet pero el NAS está apagado, así que
// `navigator.onLine` (que solo mira la red) no sirve. Sondeamos /api/health: 200 =
// servidor arriba; fallo de red o 5xx (túnel Cloudflare con el origen caído) = caído.
// El sondeo es adaptativo: espaciado cuando está arriba, frecuente cuando está caído
// para reconectar rápido, y se fuerza al recuperar foco / volver la red.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const HEALTH_URL = "/api/health";
const POLL_ONLINE_MS = 120000;
const POLL_OFFLINE_MS = 15000;

const ServerStatusContext = createContext({
  serverOnline: true,
  checkNow: async () => true,
});

async function pingHealth(signal) {
  try {
    const res = await fetch(HEALTH_URL, {
      method: "GET",
      cache: "no-store",
      signal,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function ServerStatusProvider({ children }) {
  const [serverOnline, setServerOnline] = useState(true);
  const timerRef = useRef(null);
  const runRef = useRef(null);

  const checkNow = useCallback(async () => {
    const ok = await pingHealth();
    setServerOnline((prev) => (prev === ok ? prev : ok));
    return ok;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let controller = null;

    const run = async () => {
      controller = new AbortController();
      const ok = await pingHealth(controller.signal);
      if (cancelled) return;
      setServerOnline((prev) => (prev === ok ? prev : ok));
      timerRef.current = window.setTimeout(
        run,
        ok ? POLL_ONLINE_MS : POLL_OFFLINE_MS,
      );
    };
    runRef.current = run;

    run();

    const forceCheck = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (runRef.current) runRef.current();
    };
    window.addEventListener("focus", forceCheck);
    window.addEventListener("online", forceCheck);
    document.addEventListener("visibilitychange", forceCheck);

    return () => {
      cancelled = true;
      if (controller) controller.abort();
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.removeEventListener("focus", forceCheck);
      window.removeEventListener("online", forceCheck);
      document.removeEventListener("visibilitychange", forceCheck);
    };
  }, []);

  return (
    <ServerStatusContext.Provider value={{ serverOnline, checkNow }}>
      {children}
    </ServerStatusContext.Provider>
  );
}

export function useServerStatus() {
  return useContext(ServerStatusContext);
}

// Azúcar: true si el servidor propio responde; false si está caído (offline).
export function useServerOnline() {
  return useContext(ServerStatusContext).serverOnline;
}
