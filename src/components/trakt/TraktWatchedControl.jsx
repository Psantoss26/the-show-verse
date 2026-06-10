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
  loading = false,
  onOpen,
}) {
  // Deshabilitar mientras se está resolviendo el estado o hay una operación en curso
  const disabled = !!loading || !!busy;

  const badgeStr = typeof badge === "string" ? badge.trim() : "";
  const isSeries = badgeStr.includes("%");

  const playsCount =
    !isSeries && watched && Number(plays || 0) > 0 ? Number(plays) : 0;
  const progressPercent = isSeries && watched && badgeStr ? badgeStr : null;
  const fillPercentage = progressPercent
    ? parseInt(progressPercent, 10)
    : undefined;

  return (
    <div className="relative flex-shrink-0">
      <LiquidButton
        onClick={() => onOpen?.()}
        disabled={disabled}
        active={watched}
        activeColor="green"
        groupId="details-actions"
        title={
          loading
            ? "Cargando estado de Trakt..."
            : !connected
              ? "Conecta Trakt para usar Vistos"
              : watched
                ? "Ver historial de vistos (Trakt)"
                : "Marcar / gestionar vistos (Trakt)"
        }
        playsCount={playsCount}
        progressPercent={progressPercent}
        fillPercentage={fillPercentage}
      >
        {watched ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
      </LiquidButton>
    </div>
  );
}
