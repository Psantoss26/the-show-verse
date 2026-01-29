"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useTraktAuth } from "@/lib/trakt/useTraktAuth";

/**
 * Modal compacto de conexión a Trakt que usa Device Flow.
 * Muestra el código de activación y espera a que el usuario autorice.
 */
export default function TraktConnectModal({ open, onClose, onSuccess }) {
  const { setTokens } = useTraktAuth();

  const [device, setDevice] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | waiting | success | error
  const [error, setError] = useState("");

  const pollRef = useRef(null);
  const deadlineRef = useRef(0);

  const canPoll = useMemo(
    () => device?.device_code && device?.interval && device?.expires_in,
    [device],
  );

  // Limpiar polling al desmontar
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Iniciar el proceso cuando se abre el modal
  useEffect(() => {
    if (open && status === "idle") {
      startAuth();
    }
  }, [open]);

  async function startAuth() {
    setError("");
    setStatus("waiting");

    const r = await fetch("/api/trakt/device/code", { method: "POST" });
    const data = await r.json().catch(() => null);

    if (!r.ok || !data?.device_code) {
      setStatus("error");
      setError(data?.error || "No se pudo iniciar Trakt Device Flow.");
      return;
    }

    setDevice(data);
    deadlineRef.current = Date.now() + data.expires_in * 1000;

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(
      () => pollOnce(data.device_code),
      data.interval * 1000,
    );
  }

  async function pollOnce(device_code) {
    if (Date.now() > deadlineRef.current) {
      if (pollRef.current) clearInterval(pollRef.current);
      setStatus("error");
      setError("Código expirado. Cierra y vuelve a intentar.");
      return;
    }

    const r = await fetch("/api/trakt/device/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code }),
    });

    if (r.status === 200) {
      const tokens = await r.json().catch(() => null);
      if (pollRef.current) clearInterval(pollRef.current);
      if (tokens?.access_token) {
        setTokens(tokens);
        setStatus("success");

        // Esperar un momento antes de cerrar para mostrar el éxito
        setTimeout(() => {
          if (onSuccess) onSuccess();
          handleClose();
        }, 1500);
      } else {
        setStatus("error");
        setError("Token inválido.");
      }
      return;
    }

    // 400 suele ser "pending", seguimos sin hacer ruido
    if (r.status === 400) return;

    const data = await r.json().catch(() => ({}));
    if (pollRef.current) clearInterval(pollRef.current);
    setStatus("error");
    setError(
      data?.error_description || data?.error || `Error Trakt (${r.status})`,
    );
  }

  function handleClose() {
    if (pollRef.current) clearInterval(pollRef.current);
    setDevice(null);
    setStatus("idle");
    setError("");
    if (onClose) onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md bg-neutral-900 rounded-2xl border border-white/10 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón cerrar */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-white/10 transition-colors"
          title="Cerrar"
        >
          <X className="w-5 h-5 text-white/70" />
        </button>

        {/* Contenido */}
        <div className="space-y-4">
          {/* Título */}
          <div className="flex items-center gap-3">
            <img src="/logo-Trakt.png" alt="Trakt" className="w-8 h-8" />
            <h2 className="text-xl font-bold text-white">Conectar con Trakt</h2>
          </div>

          {/* Estado: Waiting */}
          {status === "waiting" && (
            <>
              <p className="text-sm text-white/70">
                Ve a{" "}
                <a
                  className="underline text-emerald-400 hover:text-emerald-300"
                  href={device?.verification_url || "https://trakt.tv/activate"}
                  target="_blank"
                  rel="noreferrer"
                >
                  {device?.verification_url || "https://trakt.tv/activate"}
                </a>{" "}
                e introduce el código:
              </p>

              <div className="flex items-center justify-center py-6">
                <div className="text-4xl font-black tracking-[0.5em] text-emerald-400 bg-emerald-400/10 px-6 py-4 rounded-xl border-2 border-emerald-400/30">
                  {device?.user_code || "…"}
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-white/50">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Esperando autorización...</span>
              </div>
            </>
          )}

          {/* Estado: Success */}
          {status === "success" && (
            <div className="py-8 text-center space-y-3">
              <div className="w-16 h-16 mx-auto bg-emerald-500/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-lg font-semibold text-emerald-400">
                ¡Conectado exitosamente!
              </p>
              <p className="text-sm text-white/60">Cerrando...</p>
            </div>
          )}

          {/* Estado: Error */}
          {status === "error" && (
            <div className="space-y-4">
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-sm text-red-400">{error}</p>
              </div>
              <button
                onClick={startAuth}
                className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
