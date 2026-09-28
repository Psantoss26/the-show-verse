"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { rememberLocalActivity, showToast } from "@/lib/notifications/actionFeedbackClient";

// Sondeo de lo que sincroniza la extensión de Netflix: refresca las páginas que
// dependen del historial y avisa con la ventana emergente común de la app
// (InAppNotifications), con el mismo cristal que el resto de avisos.
function syncedText(item) {
  if (item.mediaType !== "tv") return "Película sincronizada desde Netflix";
  if (item.season == null || item.episode == null) return "Serie sincronizada desde Netflix";
  const pad = (n) => String(n).padStart(2, "0");
  return `S${pad(item.season)}E${pad(item.episode)} sincronizado desde Netflix`;
}

export default function NetflixSyncListener() {
  const { authenticated, hydrated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
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

        // Avisar y despachar el evento global para que las páginas recarguen.
        json.results.forEach((item) => {
          window.localStorage?.removeItem("showverse:profile:stats:v8");
          window.localStorage?.removeItem("showverse:profile:data:v8");
          window.dispatchEvent(new CustomEvent("netflix-sync-update", { detail: item }));

          const tmdbId = Number(item.tmdbId);
          // La campana traerá este visto como actividad propia: ya está avisado.
          rememberLocalActivity("watched", item.mediaType === "tv" ? "tv" : "movie", tmdbId);
          showToast({
            icon: "progress",
            label: "Netflix",
            title: item.title || null,
            text: syncedText(item),
            posterPath: typeof item.posterPath === "string" && item.posterPath.startsWith("/") ? item.posterPath : null,
            image: typeof item.posterPath === "string" && /^https?:/.test(item.posterPath) ? item.posterPath : null,
            ...(Number.isInteger(tmdbId) && tmdbId > 0
              ? { tmdbId, mediaType: item.mediaType === "tv" ? "tv" : "movie", season: item.season ?? null, episode: item.episode ?? null }
              : {}),
            key: `netflix:${item.mediaType}:${item.tmdbId}:${item.season ?? ""}:${item.episode ?? ""}`,
          });
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

  return null;
}
