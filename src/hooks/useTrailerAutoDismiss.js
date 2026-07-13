"use client";

import { useEffect, useRef } from "react";

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

// Si un tráiler de YouTube NO se puede reproducir —restricción de edad /
// embedding desactivado (errores 101/150), vídeo no disponible (100) o error de
// reproducción (2/5)— la API IFrame emite `onError`. Lo escuchamos y llamamos a
// `onUnavailable` para OCULTAR el tráiler y volver al backdrop, en vez de dejar
// el mensaje de error de YouTube dentro de la tarjeta.
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

  useEffect(() => {
    if (!open || !videoKey || !iframeRef?.current) return undefined;

    let cancelled = false;
    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !YT?.Player || !iframeRef?.current) return;
      try {
        // Se engancha al iframe YA renderizado (no lo recarga); solo cablea el
        // onError. La reproducción/mute por postMessage sigue funcionando.
        // eslint-disable-next-line no-new
        new YT.Player(iframeRef.current, {
          events: {
            onError: () => {
              if (!cancelled) onUnavailableRef.current?.();
            },
          },
        });
      } catch {
        // API no disponible: se mantiene el comportamiento actual.
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, videoKey, iframeRef]);
}
