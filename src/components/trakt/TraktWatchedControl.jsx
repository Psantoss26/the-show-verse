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

  let labelHighlight = null;
  let labelSub = null;

  if (watched) {
    if (isSeries && badgeStr) {
      labelHighlight = badgeStr;
      labelSub = "VISTO";
    } else {
      const p = Number(plays || 0);
      if (p > 0) {
        labelHighlight = String(p);
        labelSub = p === 1 ? "VEZ" : "VECES";
      } else {
        labelSub = "VISTO";
      }
    }
  }

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
      >
        {watched ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
      </LiquidButton>

      {(labelHighlight || labelSub) && (
        <span
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap 
            bg-black/40 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-lg
            px-1.5 py-[3px] flex items-center justify-center gap-1
            shadow-2xl pointer-events-none z-20 backdrop-blur-xl"
        >
          {labelHighlight && (
            <span className="text-[10px] font-black text-white leading-none drop-shadow-md">
              {labelHighlight}
            </span>
          )}
          {labelSub && (
            <span
              className={`${labelHighlight ? "text-[9px]" : "text-[10px]"} font-bold tracking-tight text-emerald-400 uppercase leading-none drop-shadow-md`}
            >
              {labelSub}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
