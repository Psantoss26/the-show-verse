"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, LogOut, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import useModalGuard from "@/hooks/useModalGuard";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";

/**
 * Confirmación de CIERRE DE SESIÓN, la misma en todas las páginas de usuario
 * (Historial, En progreso, Pendientes, Favoritas, Estadísticas, Perfil).
 *
 * Diseño: el de los modales de los botones de acción de la ficha
 * (TraktWatchedModal, AddToListModal…): fondo oscurecido y desenfocado, panel de
 * cristal líquido `rounded-[2rem]` con sus capas ópticas, cabecera de cristal y
 * botones redondeados en mayúsculas. La acción es destructiva, así que su botón
 * lleva el rojo de "salir" en lugar del verde de aquellos modales.
 *
 * Al confirmar se cierra la sesión de The Show Verse con `logout()` y se vuelve
 * a /login. `onBeforeLogout` (opcional): limpieza propia de la página antes de
 * salir (cachés de sesión, cookies heredadas…); si falla, se sale igual.
 */
export default function LogoutConfirmModal({ open, onClose, onBeforeLogout }) {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => setPortalReady(true), []);
  useEffect(() => {
    if (open) setError("");
  }, [open]);

  const close = () => {
    if (!busy) onClose?.();
  };
  useModalGuard({ open, onClose: close });

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await Promise.resolve(onBeforeLogout?.()).catch(() => {});
      await logout({ redirectTo: "/login" });
    } catch {
      setBusy(false);
      setError("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    }
  };

  if (!portalReady || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10060] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in"
        onClick={close}
        aria-hidden="true"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
        aria-describedby="logout-confirm-text"
        className={`relative isolate w-full max-w-sm overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL} shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.15),0_30px_80px_-15px_rgba(0,0,0,0.95)] animate-in zoom-in-95 duration-300 ease-out`}
      >
        <LiquidGlassOpticalLayers />

        {/* Cabecera de cristal, como la de los modales de la ficha */}
        <div className="relative z-10 flex items-center justify-between gap-3 bg-white/[0.035] px-6 py-5 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="logout-confirm-title"
                className="text-sm font-black uppercase tracking-wide text-white drop-shadow-md"
              >
                Cerrar sesión
              </h2>
              <p className="mt-1 text-xs font-semibold text-red-200/90">The Show Verse</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative z-10 px-6 pb-6 pt-5">
          <p id="logout-confirm-text" className="text-sm leading-relaxed text-zinc-300">
            ¿Seguro que quieres cerrar sesión? Tu historial, listas y progreso se
            quedan guardados en tu cuenta; para verlos tendrás que volver a
            iniciar sesión.
          </p>

          {error ? (
            <p
              className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex gap-2 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="flex-1 rounded-2xl bg-white/[0.08] bg-gradient-to-b from-white/[0.16] to-white/[0.04] py-3 text-xs font-bold uppercase tracking-wide text-white/90 shadow-sm backdrop-blur-xl transition hover:bg-white/[0.14] hover:text-white active:scale-[0.98] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-online-only="true"
              onClick={confirm}
              disabled={busy}
              autoFocus
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500/85 bg-gradient-to-b from-red-400/90 to-red-600/90 py-3 text-xs font-bold uppercase tracking-wide text-white shadow-[0_0_18px_rgba(239,68,68,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)] transition hover:from-red-400 hover:to-red-500 active:scale-[0.98] disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {busy ? "Cerrando…" : "Cerrar sesión"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
