"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CONNECTION_EVENT, reportConnection } from "@/lib/offline/client";

const ServerStatusContext = createContext({ serverOnline: true, checkNow: async () => true });

export function ServerStatusProvider({ children }) {
  const [serverOnline, setServerOnline] = useState(true);
  const pending = useRef(null);
  const checkNow = useCallback(async () => {
    if (pending.current) return pending.current;
    pending.current = (async () => {
      let online = false;
      try {
        const res = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(5000) });
        const payload = await res.json();
        online = res.ok && payload?.ok === true;
      } catch { /* unreachable includes NAS/Cloudflare failures, not only Wi-Fi */ }
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
    const offline = () => { reportConnection(false); void run(); };
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
