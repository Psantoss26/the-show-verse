"use client";

import { useEffect, useRef, useState } from "react";

// Carga (una sola vez) la API IFrame de YouTube.
let youtubeIframeApiPromise = null;
function loadYouTubeIframeApi() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };
    if (
      document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]',
      )
    ) {
      return;
    }
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });

  return youtubeIframeApiPromise;
}

// Engancha la API IFrame de YouTube al iframe del tráiler para saber dos cosas:
//
//  1. `onError`: el vídeo NO se puede reproducir —restricción de edad / embedding
//     desactivado (101/150), no disponible (100), error de reproducción (2/5)—.
//     Llamamos a `onUnavailable` para retirar el iframe (fallback al backdrop).
//
//  2. `onStateChange` → PLAYING: el vídeo se está reproduciendo DE VERDAD. Se
//     expone como `playing` en el valor de retorno.
//
// El consumidor mantiene el BACKDROP cubriendo el iframe hasta que `playing` sea
// true. Así, si el vídeo no está disponible, el backdrop NUNCA se descubre y el
// mensaje de error de YouTube no llega a verse (ni siquiera un instante). Si el
// vídeo se reproduce, el backdrop se desvanece y se revela el tráiler.
//
// El iframe debe llevar `enablejsapi=1` (ya lo llevan las previews del dashboard).
export default function useTrailerAutoDismiss({
  open,
  iframeRef,
  videoKey,
  onUnavailable,
}) {
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    // Cada vez que se abre/cambia el tráiler, se parte de "no reproduciendo": el
    // backdrop vuelve a cubrir hasta confirmar de nuevo el PLAYING.
    setPlaying(false);
    if (!open || !videoKey || !iframeRef?.current) return undefined;

    let cancelled = false;

    // Red de seguridad: si el evento PLAYING llegara ANTES de que la API se
    // enganche (raro), el backdrop cubriría un tráiler válido para siempre. Si
    // pasado este tiempo no ha habido error ni PLAYING, se revela igualmente. Si
    // hubo error, el consumidor ya cerró el tráiler (open=false) y el efecto se
    // limpia, cancelando este timeout: así el fallback SOLO revela vídeos que no
    // han dado error (los que están reproduciéndose o buffering, nunca el error).
    const revealFallback = window.setTimeout(() => {
      if (!cancelled) setPlaying(true);
    }, 3000);

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !YT?.Player || !iframeRef?.current) return;
      // 1 = YT.PlayerState.PLAYING (por si el enum no estuviera disponible).
      const PLAYING = YT.PlayerState?.PLAYING ?? 1;
      try {
        // Se engancha al iframe YA renderizado (no lo recarga); solo cablea los
        // eventos. La reproducción/mute por postMessage sigue funcionando.
        // eslint-disable-next-line no-new
        new YT.Player(iframeRef.current, {
          events: {
            onError: () => {
              if (!cancelled) onUnavailableRef.current?.();
            },
            onStateChange: (event) => {
              if (!cancelled && event?.data === PLAYING) setPlaying(true);
            },
          },
        });
      } catch {
        // API no disponible: se mantiene el comportamiento actual.
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(revealFallback);
    };
  }, [open, videoKey, iframeRef]);

  return { playing };
}
