"use client";

import { useCallback, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const YOUTUBE_NOCOOKIE_ORIGIN = "https://www.youtube-nocookie.com";

function postYouTubeCommand(iframeRef, func, args = []) {
  try {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({ event: "command", func, args }),
      YOUTUBE_NOCOOKIE_ORIGIN,
    );
  } catch {
    // La preview puede desmontarse mientras el iframe termina de cargar.
  }
}

function syncAudioState(iframeRef, muted, volume) {
  if (muted) {
    postYouTubeCommand(iframeRef, "mute");
    return;
  }
  postYouTubeCommand(iframeRef, "unMute");
  postYouTubeCommand(iframeRef, "setVolume", [volume]);
}

export function usePreviewTrailerAudio(iframeRef, { volume = 30 } = {}) {
  const [muted, setMuted] = useState(true);

  const sync = useCallback(
    (nextMuted = muted) => {
      window.setTimeout(() => {
        syncAudioState(iframeRef, nextMuted, volume);
      }, 120);
    },
    [iframeRef, muted, volume],
  );

  const toggle = useCallback(
    (event) => {
      event?.stopPropagation?.();
      const nextMuted = !muted;
      setMuted(nextMuted);
      syncAudioState(iframeRef, nextMuted, volume);
    },
    [iframeRef, muted, volume],
  );

  return { muted, toggle, sync };
}

export default function PreviewTrailerAudioButton({
  muted,
  onToggle,
  className = "",
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),0_12px_28px_-14px_rgba(0,0,0,0.95)] backdrop-blur-xl transition hover:scale-105 hover:border-white/25 hover:bg-white/15 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${className}`}
      aria-label={muted ? "Activar sonido del tráiler" : "Silenciar tráiler"}
      aria-pressed={!muted}
    >
      {muted ? (
        <VolumeX className="h-[18px] w-[18px]" aria-hidden="true" />
      ) : (
        <Volume2 className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}
