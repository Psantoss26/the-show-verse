"use client";

import { useEffect, useRef, useState } from "react";
import { loadYouTubeIframeApi } from "@/lib/dashboard/previewTrailer";

// Tiempo de vídeo que tiene que haber corrido para revelarlo: con el primer
// PLAYING el reproductor aún puede estar pintando negro (o el póster de
// YouTube). Unas décimas después ya hay imagen de verdad.
const REVEAL_MIN_CURRENT_TIME_S = 0.12;
const POLL_MS = 120;
// Red de seguridad SOLO si la API de YouTube no llega a engancharse (sin ella
// no hay forma de saber si se reproduce). Con la API enganchada no se revela
// nada que no esté reproduciéndose.
const API_FALLBACK_MS = 4000;

// Engancha la API IFrame de YouTube al iframe del tráiler para saber dos cosas:
//
//  1. `onError`: el vídeo NO se puede reproducir —restricción de edad / inserción
//     desactivada (101/150), no disponible (100), error de reproducción (2/5)—.
//     Se llama a `onUnavailable(code)` para que el consumidor pase a otro vídeo
//     o vuelva al backdrop.
//
//  2. `playing`: el vídeo se reproduce DE VERDAD (estado PLAYING y unas
//     décimas de vídeo corridas). Antes se esperaba al evento PLAYING, que se
//     PERDÍA cuando el vídeo arrancaba antes de engancharse la API (vídeo en
//     caché: lo habitual al volver a una tarjeta) y entonces el tráiler no se
//     revelaba hasta la red de seguridad de 3 s. Ahora, además del evento, se
//     consulta el estado del reproductor hasta confirmarlo.
//
// El consumidor mantiene el BACKDROP cubriendo el iframe hasta que `playing`
// sea true: un error de YouTube nunca llega a verse, ni un fotograma negro.
//
// El iframe debe llevar `enablejsapi=1` (ya lo llevan las previews del dashboard).
export default function useTrailerAutoDismiss({
  open,
  iframeRef,
  videoKey,
  onUnavailable,
  onPlaying,
}) {
  const onUnavailableRef = useRef(onUnavailable);
  const onPlayingRef = useRef(onPlaying);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
    onPlayingRef.current = onPlaying;
  });
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    // Cada vez que se abre/cambia el tráiler, se parte de "no reproduciendo": el
    // backdrop vuelve a cubrir hasta confirmar de nuevo la reproducción.
    setPlaying(false);
    if (!open || !videoKey || !iframeRef?.current) return undefined;

    let cancelled = false;
    let attached = false;
    let revealed = false;
    let poll = 0;

    const reveal = () => {
      if (cancelled || revealed) return;
      revealed = true;
      window.clearInterval(poll);
      setPlaying(true);
      onPlayingRef.current?.();
    };

    const fallback = window.setTimeout(() => {
      if (!attached) reveal();
    }, API_FALLBACK_MS);
    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !YT?.Player || !iframeRef?.current) return;
      // 1 = YT.PlayerState.PLAYING (por si el enum no estuviera disponible).
      const PLAYING = YT.PlayerState?.PLAYING ?? 1;
      try {
        // Se engancha al iframe YA renderizado (no lo recarga); solo cablea los
        // eventos. La reproducción/mute por postMessage sigue funcionando.
        const player = new YT.Player(iframeRef.current, {
          events: {
            onReady: () => {
              attached = true;
              const check = () => {
                if (cancelled || revealed) return;
                try {
                  if (
                    player.getPlayerState?.() === PLAYING &&
                    (player.getCurrentTime?.() ?? 0) >= REVEAL_MIN_CURRENT_TIME_S
                  ) {
                    reveal();
                  }
                } catch {
                  // Reproductor a medio montar: se reintenta en la siguiente.
                }
              };
              check();
              poll = window.setInterval(check, POLL_MS);
            },
            onError: (event) => {
              if (cancelled) return;
              window.clearInterval(poll);
              onUnavailableRef.current?.(event?.data);
            },
            onStateChange: (event) => {
              attached = true;
              if (event?.data !== PLAYING) return;
              // El primer PLAYING puede llegar con 0 s corridos: lo confirma
              // la consulta periódica (o este mismo atajo si ya hay vídeo).
              try {
                if ((player.getCurrentTime?.() ?? 0) >= REVEAL_MIN_CURRENT_TIME_S) {
                  reveal();
                }
              } catch {
                // Se confirma en la consulta periódica.
              }
            },
          },
        });
      } catch {
        // API no disponible: decide la red de seguridad.
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      window.clearInterval(poll);
    };
  }, [open, videoKey, iframeRef]);

  return { playing };
}
