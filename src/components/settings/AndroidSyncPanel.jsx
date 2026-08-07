"use client";

// Panel de sincronización de streaming DENTRO de la app de Android.
//
// En el navegador, vincular el móvil consiste en generar un token y lanzar un
// deep link con la esperanza de que el sistema abra la app companion. Dentro de
// la app oficial eso sobra: la web habla directamente con el nativo, así que
// aquí se ve el estado real (emparejamiento y permisos concedidos) y cada cosa
// que falta tiene su botón. Es lo que hace que se perciba UNA app y no una web
// metida en una ventana.
//
// Este componente solo se monta si `useAndroidApp()` es cierto; fuera de la app
// la tarjeta de Ajustes sigue funcionando exactamente igual que siempre.

import { CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";

import {
  openAccessibilitySettings,
  openNotificationAccessSettings,
  openSyncPanel,
  setAccessibilityDetection,
  setSyncPaused,
} from "@/lib/android/appBridge";

function Fila({ ok, titulo, detalle, accion, onAccion }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-bold text-white">{titulo}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
            {detalle}
          </p>
        </div>
      </div>
      {!ok && accion ? (
        <button
          type="button"
          onClick={onAccion}
          className="min-h-8 shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 text-[11px] font-bold text-emerald-200 transition hover:bg-emerald-500/25"
        >
          {accion}
        </button>
      ) : null}
    </div>
  );
}

export default function AndroidSyncPanel({
  status,
  onRefresh,
  onPair,
  pairing,
  error,
}) {
  const emparejado = !!status?.paired;
  const notificaciones = !!status?.notificationAccess;
  const a11yConcedida = !!status?.accessibilityGranted;
  const a11yActiva = a11yConcedida && !!status?.accessibilityEnabled;
  const pausada = !!status?.paused;

  return (
    <div className="space-y-2 border-t border-white/5 pt-4">
      <Fila
        ok={emparejado}
        titulo={emparejado ? "Dispositivo vinculado" : "Dispositivo sin vincular"}
        detalle={
          emparejado
            ? `Enviando a ${status?.origin || "tu servidor"}.`
            : "Vincula este móvil para que lo que veas en las apps de streaming llegue a tu historial."
        }
        accion={pairing ? undefined : "Vincular"}
        onAccion={onPair}
      />

      <Fila
        ok={notificaciones}
        titulo="Acceso a notificaciones"
        detalle="Necesario para leer qué se está reproduciendo en Netflix, Prime Video, Disney+…"
        accion="Conceder"
        onAccion={openNotificationAccessSettings}
      />

      <Fila
        ok={a11yActiva}
        titulo="Detección de fichas (opcional)"
        detalle="Detecta el título que abres en una app de streaming sin darle a reproducir, para ofrecerte su ficha aquí."
        accion={a11yConcedida ? "Activar" : "Conceder"}
        onAccion={() => {
          if (a11yConcedida) {
            setAccessibilityDetection(true);
            onRefresh?.();
          } else {
            openAccessibilitySettings();
          }
        }}
      />

      {pairing ? (
        <p className="flex items-center gap-2 text-[11px] text-zinc-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Vinculando este dispositivo…
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-2.5 text-xs text-red-400">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={openSyncPanel}
          className="flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3.5 text-xs font-bold text-zinc-300 transition hover:bg-white/10"
        >
          Panel de sincronización
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        {emparejado ? (
          <button
            type="button"
            onClick={() => {
              setSyncPaused(!pausada);
              onRefresh?.();
            }}
            className="min-h-9 rounded-lg border border-white/10 bg-white/5 px-3.5 text-xs font-bold text-zinc-300 transition hover:bg-white/10"
          >
            {pausada ? "Reanudar sincronización" : "Pausar sincronización"}
          </button>
        ) : null}
      </div>

      <p className="text-[10px] leading-relaxed text-zinc-500">
        Los permisos se conceden en los Ajustes de Android; al volver aquí el
        estado se actualiza solo.
      </p>
    </div>
  );
}
