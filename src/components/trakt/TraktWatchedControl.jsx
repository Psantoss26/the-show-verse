// src/components/trakt/TraktWatchedControl.jsx
"use client";

import { Eye, EyeOff, MonitorPlay } from "lucide-react";
import LiquidButton from "../LiquidButton";

export default function TraktWatchedControl({
  connected,
  watched,
  plays,
  badge, // permite mostrar texto (ej: "47%") en el badge
  busy,
  loading = false,
  onOpen,
  // Progreso EXPLÍCITO del episodio/película en curso (ej: "4%"). Cuando se pasa,
  // el botón muestra ese % (con relleno) y aparece activo (verde) SIN depender del
  // estado de "visto" de Trakt. Lo usa "Continuar viendo" para reflejar el avance
  // del episodio/película concretos en el propio botón de visionado.
  progressOverride,
  // Porcentaje (1-99) si el contenido está AHORA en "Continuar viendo". El botón
  // adopta la identidad de esa sección —icono MonitorPlay y color esmeralda— y
  // se llena como una batería hasta ese punto. Tiene prioridad sobre "visto":
  // es el estado actual (también en un revisionado de algo ya visto).
  continueWatchingPercent,
  liquidGlass = false,
}) {
  // Deshabilitar mientras se está resolviendo el estado o hay una operación en curso
  const disabled = !!loading || !!busy;
  const visibleWatched = !loading && !!watched;

  const badgeStr = typeof badge === "string" ? badge.trim() : "";
  const isSeries = badgeStr.includes("%");

  const overrideStr =
    typeof progressOverride === "string" ? progressOverride.trim() : "";
  const hasOverride = !loading && overrideStr.includes("%");
  const cwPercent = Number(continueWatchingPercent);
  const isContinueWatching =
    !loading && Number.isFinite(cwPercent) && cwPercent > 0 && cwPercent < 100;

  const playsCount = hasOverride || isContinueWatching
    ? 0
    : !isSeries && visibleWatched && Number(plays || 0) > 0
      ? Number(plays)
      : 0;
  const progressPercent = isContinueWatching
    ? null
    : hasOverride
    ? overrideStr
    : isSeries && visibleWatched && badgeStr
      ? badgeStr
      : null;
  const fillPercentage = isContinueWatching
    ? Math.round(cwPercent)
    : progressPercent
      ? parseInt(progressPercent, 10)
      : undefined;

  return (
    <div className="relative flex-shrink-0">
      <LiquidButton
        liquidGlass={liquidGlass}
        onClick={(event) => onOpen?.(event)}
        disabled={disabled}
        active={isContinueWatching || hasOverride || visibleWatched}
        activeColor={isContinueWatching ? "emerald" : "green"}
        groupId="details-actions"
        loading={loading}
        title={
          loading
            ? "Cargando estado de Trakt..."
            : isContinueWatching
              ? `Continuar viendo: ${Math.round(cwPercent)}%`
              : hasOverride
              ? `Progreso: ${overrideStr}`
              : !connected
                ? "Inicia sesión para usar Vistos"
                : visibleWatched
                  ? "Ver historial de vistos (Trakt)"
                  : "Marcar / gestionar vistos (Trakt)"
        }
        playsCount={playsCount}
        progressPercent={progressPercent}
        fillPercentage={fillPercentage}
      >
        {isContinueWatching ? (
          <MonitorPlay className="w-6 h-6" />
        ) : visibleWatched ? (
          <Eye className="w-6 h-6" />
        ) : (
          <EyeOff className="w-6 h-6" />
        )}
      </LiquidButton>
    </div>
  );
}
