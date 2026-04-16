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
            bg-[#0d1f16]/95 border border-emerald-500/50 rounded-[5px] 
            px-1 py-[2px] flex items-center justify-center gap-1
            shadow-[0_2px_8px_rgba(16,185,129,0.3)] pointer-events-none z-20 backdrop-blur-md"
        >
          {labelHighlight && (
            <span className="text-[10px] font-black text-white leading-none">
              {labelHighlight}
            </span>
          )}
          {labelSub && (
            <span className="text-[8px] font-bold tracking-tight text-emerald-400 uppercase leading-none opacity-95">
              {labelSub}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
