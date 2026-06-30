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

  return (
    <aside
      data-hero-soundtrack-player
      aria-label={`Reproductor de ${track.trackName || "soundtrack"}`}
      onPointerEnter={() => onInteractionChange?.(true)}
      onPointerLeave={() => onInteractionChange?.(false)}
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
      className="hero-nowplaying group pointer-events-auto absolute bottom-4 right-4 z-40 w-48 overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.14),0_12px_36px_-12px_rgba(0,0,0,0.85)] backdrop-blur-3xl transition-all duration-300 sm:bottom-6 sm:right-6 sm:w-56 p-2"
    >
      {/* Background artwork blur */}
      {track.artworkUrl && (
        <OptimizedImage
          src={track.artworkUrl}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full scale-150 object-cover opacity-20 blur-2xl"
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-black/50 bg-gradient-to-b from-transparent to-black/80"
      />

      <div className="relative flex flex-col h-full z-10">
        {/* Cover Art container */}
        <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-md group/cover">
          {track.artworkUrl ? (
            <OptimizedImage
              src={track.artworkUrl}
              alt={`Portada de ${track.trackName || "soundtrack"}`}
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Music2
                className="h-10 w-10 text-white/35"
                aria-hidden="true"
              />
            </span>
          )}

          {/* Hover Controls Overlay */}
          <div className="absolute inset-0 bg-black/70 flex flex-col justify-between p-3 opacity-0 group-hover:opacity-100 group-hover/cover:opacity-100 focus-within:opacity-100 transition-opacity duration-300 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto">
            {/* Top Row: Track Position & Mute */}
            <div className="flex justify-between items-center w-full">
              <span className="text-[10px] sm:text-xs font-semibold text-white/80 bg-black/40 px-2 py-0.5 rounded-md backdrop-blur-sm select-none">
                {position}/{total}
              </span>
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted || volume === 0 ? "Activar sonido" : "Silenciar"}
                className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-md bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition"
              >
                {muted || volume === 0 ? (
                  <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                )}
              </button>
            </div>

            {/* Middle Row: Playback Controls */}
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={onPrevious}
                disabled={!hasPrevious}
                aria-label="Pista anterior"
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/10 text-white/85 hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-20 transition"
              >
                <SkipBack className="h-4 w-4 sm:h-4.5 sm:w-4.5 fill-current" />
              </button>

              <button
                type="button"
                onClick={onTogglePlayback}
                aria-label={isPlaying && !muted ? "Pausar preview" : "Reproducir preview"}
                className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition shadow-sm"
              >
                {isPlaying && !muted ? (
                  <Pause className="h-4.5 w-4.5 sm:h-5.5 sm:w-5.5 fill-current" />
                ) : (
                  <Play className="ml-0.5 h-4.5 w-4.5 sm:h-5.5 sm:w-5.5 fill-current" />
                )}
              </button>

              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                aria-label="Pista siguiente"
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/10 text-white/85 hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-20 transition"
              >
                <SkipForward className="h-4 w-4 sm:h-4.5 sm:w-4.5 fill-current" />
              </button>
            </div>

            {/* Bottom Row: Progress */}
            <div className="flex w-full items-center gap-1.5">
              <span className="w-6 text-right text-[9px] sm:text-[10px] font-medium tabular-nums text-white/70">
                {formatTime(progress)}
              </span>
              <div className="group/progress relative flex h-3 min-w-0 flex-1 items-center">
                <div className="pointer-events-none absolute inset-x-0 h-0.5 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white"
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
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 z-20"
                />
              </div>
              <span className="w-6 text-[9px] sm:text-[10px] font-medium tabular-nums text-white/70">
                {formatTime(duration)}
              </span>
            </div>
          </div>
        </div>

        {/* Text Metadata (Fixed Height to prevent size changes) */}
        <div className="h-16 flex flex-col justify-center px-1 pt-2">
          <h3
            className="truncate text-xs font-bold leading-snug text-white select-none sm:text-sm"
            title={track.trackName}
          >
            {track.trackName || "Soundtrack"}
          </h3>
          {track.artistName && (
            <p
              className="truncate text-[10px] font-medium text-white/50 select-none mt-0.5 sm:text-xs"
              title={track.artistName}
            >
              {track.artistName}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

