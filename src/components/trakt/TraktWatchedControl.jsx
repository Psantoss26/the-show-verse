// src/components/trakt/TraktWatchedControl.jsx
"use client";

import { Eye, EyeOff } from "lucide-react";
import LiquidButton from "../LiquidButton";

export default function TraktWatchedControl({
  connected,
  watched,
  plays,
  badge, // ✅ NUEVO: permite mostrar texto (ej: "47%") en el badge
  busy,
  onOpen,
}) {
  // Solo deshabilitar si está ocupado Y conectado (no deshabilitar cuando no está conectado)
  const disabled = connected && !!busy;

  const badgeText =
    typeof badge === "string" && badge.trim().length > 0
      ? badge.trim()
      : Number(plays || 0) > 0
        ? String(plays)
        : null;

  return (
    <div className="relative">
      <LiquidButton
        onClick={() => onOpen?.()}
        disabled={disabled}
        active={watched}
        activeColor="green"
        groupId="details-actions"
        className="flex-shrink-0"
        title={
          !connected
            ? "Conecta Trakt para usar Vistos"
            : watched
              ? "Ver historial de vistos (Trakt)"
              : "Marcar / gestionar vistos (Trakt)"
        }
      >
        {watched ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
      </LiquidButton>

      {badgeText && (
        <span
          className="absolute -bottom-1 -right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold
            bg-black/70 border border-black/70 text-white flex items-center justify-center z-10 pointer-events-none"
          aria-label={`Progreso: ${badgeText}`}
        >
          {badgeText}
        </span>
      )}
    </div>
  );
}
