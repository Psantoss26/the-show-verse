// src/components/trakt/TraktWatchedControl.jsx
"use client";

import { Eye, EyeOff } from "lucide-react";
import LiquidButton from "../LiquidButton";

export default function TraktWatchedControl({
  connected,
  watched,
  plays,
  badge, // permite mostrar texto (ej: "47%") en el badge
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

  // Ajustar el padding en función de la longitud: "1" -> más cuadrado, "100%" -> más alargado
  const chars = badgeText ? badgeText.length : 0;
  const paddingX = chars >= 3 ? "px-1.5" : "px-0.5";

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
          className={`absolute -bottom-1 -right-1.5 min-w-[18px] h-[18px] ${paddingX} 
            rounded-full text-[10px] font-bold tracking-tight leading-none
            bg-zinc-800/90 backdrop-blur-md text-white flex items-center justify-center 
            z-10 pointer-events-none shadow-md`}
          aria-label={`Progreso: ${badgeText}`}
        >
          {badgeText}
        </span>
      )}
    </div>
  );
}
