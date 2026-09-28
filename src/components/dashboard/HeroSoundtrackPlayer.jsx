"use client";

import OptimizedImage from "@/components/OptimizedImage";
import {
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect } from "react";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

function formatTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function HeroSoundtrackPlayer({
  track,
  isPlaying,
  progress,
  duration,
  volume,
  muted,
  position,
  total,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onTogglePlayback,
  onSeek,
  onToggleMute,
  onVolumeChange,
  onInteractionChange,
}) {
  useEffect(
    () => () => {
      onInteractionChange?.(false);
    },
    [onInteractionChange],
  );

  if (!track) return null;

  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;
  const volumePercent = (muted ? 0 : Math.min(1, Math.max(0, volume))) * 100;
  const playing = isPlaying && !muted;

  // MISMO DISEÑO QUE SoundtrackModal, en compacto: el cristal de los modales
  // (LIQUID_GLASS_PANEL, sin bordes), la portada con sombra profunda, la barra
  // de progreso con brillo, los saltos de pista sin fondo y el botón de
  // reproducir de cristal. En horizontal (portada a la izquierda) para ocupar
  // una esquina del hero sin taparlo, y con los controles siempre a la vista.
  //
  // POSICIÓN: 96px sobre el borde inferior. Más abajo chocaba con el botón
  // flotante de instalar la app (PwaManager: fijo a 16px del borde, 48px de
  // alto) en la misma esquina.
  return (
    <aside
      data-hero-soundtrack-player
      aria-label={`Reproductor de ${track.trackName || "soundtrack"}`}
      onPointerEnter={() => onInteractionChange?.(true)}
      onPointerLeave={(event) => {
        onInteractionChange?.(false);
        if (
          typeof document !== "undefined" &&
          document.activeElement &&
          event.currentTarget.contains(document.activeElement)
        ) {
          document.activeElement.blur();
        }
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onInteractionChange?.(true);
      }}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onFocusCapture={() => onInteractionChange?.(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onInteractionChange?.(false);
        }
      }}
      className={`hero-nowplaying pointer-events-auto absolute bottom-24 right-6 z-40 hidden w-[20rem] overflow-hidden rounded-[1.75rem] p-3 text-white sm:block ${LIQUID_GLASS_PANEL}`}
    >
      {/* --- PORTADA E INFO --- */}
      <div className="flex items-center gap-3">
        <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-2xl bg-white/5 shadow-[0_16px_32px_-10px_rgba(0,0,0,0.9)]">
          {track.artworkUrl ? (
            <OptimizedImage
              src={track.artworkUrl}
              alt={`Portada de ${track.trackName || "soundtrack"}`}
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Music2 className="h-7 w-7 text-yellow-300/50" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 select-none">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
            Soundtrack · {position} de {total}
          </p>
          <h3
            className="mt-1 truncate text-sm font-black leading-snug text-white drop-shadow-sm"
            title={track.trackName}
          >
            {track.trackName || "Soundtrack"}
          </h3>
          {track.artistName ? (
            <p
              className="truncate text-xs font-medium text-white/70 drop-shadow-sm"
              title={track.artistName}
            >
              {track.artistName}
            </p>
          ) : null}
        </div>
      </div>

      {/* --- PROGRESO --- */}
      <div className="mt-3 flex items-center gap-2">
        <span className="w-8 text-right text-[10px] font-semibold tabular-nums text-white/50">
          {formatTime(progress)}
        </span>
        <div className="relative flex h-4 min-w-0 flex-1 items-center">
          <div className="pointer-events-none absolute inset-x-0 h-1 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-white/60 to-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={Math.min(progress, duration || 100)}
            onChange={onSeek}
            aria-label="Progreso de la preview"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <span className="w-8 text-[10px] font-semibold tabular-nums text-white/50">
          {formatTime(duration)}
        </span>
      </div>

      {/* --- CONTROLES Y VOLUMEN --- */}
      <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted || volume === 0 ? "Activar sonido" : "Silenciar"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:text-white"
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          <div className="group/volume relative flex h-4 w-11 items-center">
            <div className="pointer-events-none absolute inset-x-0 h-1 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-white/70 transition-colors group-hover/volume:bg-white"
                style={{ width: `${volumePercent}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={onVolumeChange}
              aria-label="Volumen de la preview"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label="Pista anterior"
            className="text-white/70 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-white/70"
          >
            <SkipBack className="h-5 w-5 fill-current" />
          </button>
          <button
            type="button"
            onClick={onTogglePlayback}
            aria-label={playing ? "Pausar preview" : "Reproducir preview"}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white shadow-[0_10px_40px_-10px_rgba(255,255,255,0.2)] backdrop-blur-xl transition hover:scale-105 hover:bg-white/20 active:scale-95"
          >
            {playing ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            )}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Pista siguiente"
            className="text-white/70 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-white/70"
          >
            <SkipForward className="h-5 w-5 fill-current" />
          </button>
        </div>

        <div aria-hidden="true" />
      </div>
    </aside>
  );
}
