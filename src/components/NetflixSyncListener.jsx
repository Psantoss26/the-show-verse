"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Tv, Film, CheckCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function NetflixSyncListener() {
  const { authenticated, hydrated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [toasts, setToasts] = useState([]);
  const sinceRef = useRef(new Date().toISOString());
  const pollingIntervalRef = useRef(null);

  // 1. Verificar si Netflix está conectado
  const checkConnection = async () => {
    if (!authenticated) {
      setIsConnected(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/connections", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json.connections)) {
        const netflixConn = json.connections.find((c) => c.provider === "netflix");
        setIsConnected(!!netflixConn?.connected);
      }
    } catch (err) {
      console.warn("[Netflix Listener] Error checking connection", err);
    }
  };

  // Escuchar cambios de conexión gatillados por la UI
  useEffect(() => {
    const handleConnectionChange = (e) => {
      const { connected } = e.detail || {};
      setIsConnected(!!connected);
      if (connected) {
        sinceRef.current = new Date().toISOString();
      }
    };
    window.addEventListener("netflix-connection-changed", handleConnectionChange);
    return () => {
      window.removeEventListener("netflix-connection-changed", handleConnectionChange);
    };
  }, []);

  // Verificar estado inicial al montar o autenticarse
  useEffect(() => {
    if (hydrated) {
      checkConnection();
    }
  }, [authenticated, hydrated]);

  // 2. Polling de nuevos visionados
  const pollNetflixActivity = async () => {
    if (!authenticated || !isConnected) return;
    try {
      const sinceStr = sinceRef.current;
      const res = await fetch(`/api/netflix/poll?since=${encodeURIComponent(sinceStr)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && Array.isArray(json.results) && json.results.length > 0) {
        // Actualizar el puntero temporal con la fecha del poll
        sinceRef.current = new Date().toISOString();

        // Disparar notificaciones por cada elemento nuevo
        json.results.forEach((item) => {
          // Agregar a toasts flotantes
          const id = `${item.id || Math.random()}`;
          setToasts((prev) => [...prev, { ...item, toastId: id }]);

          // Despachar evento global para que las páginas recarguen los datos
          window.sessionStorage?.removeItem("showverse:profile:stats:v7");
          window.sessionStorage?.removeItem("showverse:profile:data:v7");
          window.dispatchEvent(new CustomEvent("netflix-sync-update", { detail: item }));

          // Auto-eliminar toast tras 7 segundos
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.toastId !== id));
          }, 7000);
        });
      }
    } catch (err) {
      console.warn("[Netflix Listener] Polling error", err);
    }
  };

  // Configurar timer de polling
  useEffect(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (authenticated && isConnected) {
      // Poll inicial a los 2 segundos, luego cada 10 segundos
      const initialTimeout = setTimeout(pollNetflixActivity, 2000);
      pollingIntervalRef.current = setInterval(pollNetflixActivity, 10000);

      return () => {
        clearTimeout(initialTimeout);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    }
    return undefined;
  }, [authenticated, isConnected]);

  const dismissToast = (toastId) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  };

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((item) => {
          const isShow = item.mediaType === "tv";
          const posterUrl = item.posterPath
            ? item.posterPath.startsWith("/")
              ? `https://image.tmdb.org/t/p/w92${item.posterPath}`
              : item.posterPath
            : null;

          return (
            <motion.div
              key={item.toastId}
              initial={{ opacity: 0, y: 50, scale: 0.9, rotate: -2 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-red-500/20 bg-zinc-950/90 text-white shadow-2xl backdrop-blur-xl flex items-stretch"
            >
              {/* Indicador rojo Netflix */}
              <div className="w-1.5 bg-[#E50914] shrink-0" />

              <div className="p-4 flex-1 flex gap-3.5 items-center">
                {/* Poster / Miniatura */}
                <div className="relative h-16 w-11 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 shrink-0">
                  {posterUrl ? (
                    <img src={posterUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-zinc-500">
                      {isShow ? <Tv className="h-5 w-5" /> : <Film className="h-5 w-5" />}
                    </div>
                  )}
                </div>

                {/* Texto */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 uppercase">
                      Netflix Sync
                    </span>
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-emerald-400" />
                      Auto
                    </span>
                  </div>
                  <h4 className="mt-1 text-sm font-extrabold text-white truncate leading-tight">
                    {item.title}
                  </h4>
                  <p className="mt-0.5 text-xs text-zinc-400 font-medium">
                    {isShow
                      ? `Temporada ${item.season} • Episodio ${item.episode}`
                      : "Película"}
                  </p>
                </div>

                {/* Dismiss */}
                <button
                  type="button"
                  onClick={() => dismissToast(item.toastId)}
                  className="p-1 rounded-full text-zinc-500 hover:text-white hover:bg-white/5 transition-colors self-start shrink-0"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
