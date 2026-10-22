"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useTrailerAutoDismiss from "@/hooks/useTrailerAutoDismiss";
import {
  PREVIEW_TRAILER_AUTOPLAY_DELAY_MS,
  markPreviewTrailerBroken,
  markPreviewTrailerPlayable,
  peekPreviewTrailer,
  prefetchPreviewTrailer,
  resolvePreviewTrailer,
} from "@/lib/dashboard/previewTrailer";

/**
 * Tráiler con autoplay de las vistas previas del dashboard. La tarjeta de la
 * preview se MONTA al hacer hover, así que montar = empezar el hover:
 *
 *  1. Al montar se empieza a resolver el tráiler (y la API de YouTube), en
 *     paralelo a la espera; antes se pedía cuando vencía el temporizador.
 *  2. Pasados PREVIEW_TRAILER_AUTOPLAY_DELAY_MS se monta el iframe, oculto tras
 *     el backdrop.
 *  3. El backdrop se funde solo cuando el vídeo se reproduce de verdad
 *     (`playing`, ver useTrailerAutoDismiss).
 *  4. Si YouTube no lo deja reproducir, se pasa al siguiente candidato SIN que
 *     se vea (el backdrop sigue cubriendo) y se recuerda entre visitas: la
 *     siguiente vez el tráiler bueno es el único intento.
 *
 * `onBeforeOpen`: lo que la tarjeta cierra al abrir el tráiler (el soundtrack).
 * `season`: el tráiler de esa temporada de la serie (Calendario: la del
 * episodio que se estrena), ver previewTrailer.js.
 */
export default function usePreviewAutoTrailer({
  id,
  mediaType,
  iframeRef,
  season = null,
  autoplay = true,
  onBeforeOpen,
}) {
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef({ id, mediaType, season });
  const onBeforeOpenRef = useRef(onBeforeOpen);
  useEffect(() => {
    titleRef.current = { id, mediaType, season };
    onBeforeOpenRef.current = onBeforeOpen;
  });

  // Otro título en la misma tarjeta: todo de cero.
  useEffect(() => {
    setShowTrailer(false);
    setTrailer(null);
    setTrailerLoading(false);
    setError("");
    if (id) prefetchPreviewTrailer(mediaType, id, season);
  }, [id, mediaType, season]);

  const openTrailer = useCallback(async () => {
    const { id: currentId, mediaType: currentType, season: currentSeason } =
      titleRef.current;
    if (!currentId) return;
    onBeforeOpenRef.current?.();
    setError("");
    // Ya resuelto (lo normal tras la espera): sin pasar por "cargando".
    const known = peekPreviewTrailer(currentType, currentId, currentSeason);
    if (known) {
      setTrailer(known);
      setShowTrailer(true);
      return;
    }
    setTrailerLoading(true);
    try {
      const resolved = await resolvePreviewTrailer(
        currentType,
        currentId,
        currentSeason,
      );
      // La tarjeta cambió de título mientras tanto: no es suyo.
      if (titleRef.current.id !== currentId) return;
      setTrailer(resolved || null);
      // Sin tráiler no hay aviso: en la preview no tenerlo no es un error.
      setShowTrailer(Boolean(resolved?.key));
    } catch {
      setTrailer(null);
      setShowTrailer(false);
      setError("No se pudo cargar el trailer.");
    } finally {
      setTrailerLoading(false);
    }
  }, []);

  const toggleTrailer = useCallback(
    (event) => {
      event?.stopPropagation?.();
      if (showTrailer) {
        setShowTrailer(false);
        return;
      }
      openTrailer();
    },
    [openTrailer, showTrailer],
  );

  // Autoplay poco después del hover. El cleanup lo cancela si la tarjeta se
  // desmonta antes (el ratón ya se fue). El ref lee el estado al vencer para
  // no reabrir un tráiler que el usuario haya cerrado o abierto a mano.
  const stateRef = useRef({ showTrailer, trailerLoading });
  useEffect(() => {
    stateRef.current = { showTrailer, trailerLoading };
  });
  const userToggledRef = useRef(false);
  useEffect(() => {
    if (!autoplay) return undefined;
    const timer = window.setTimeout(() => {
      const s = stateRef.current;
      if (!userToggledRef.current && !s.showTrailer && !s.trailerLoading) {
        openTrailer();
      }
    }, PREVIEW_TRAILER_AUTOPLAY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoplay, openTrailer, id]);

  const handleUnavailable = useCallback(() => {
    const { id: currentId, mediaType: currentType, season: currentSeason } =
      titleRef.current;
    const failed = trailer;
    markPreviewTrailerBroken(currentType, currentId, failed, currentSeason).then((next) => {
      if (titleRef.current.id !== currentId) return;
      if (next?.key && next.key !== failed?.key) {
        // El siguiente, oculto tras el backdrop hasta que se reproduzca.
        setTrailer(next);
      } else {
        setShowTrailer(false);
      }
    });
  }, [trailer]);

  const handlePlaying = useCallback(() => {
    const { id: currentId, mediaType: currentType, season: currentSeason } =
      titleRef.current;
    markPreviewTrailerPlayable(currentType, currentId, trailer, currentSeason);
  }, [trailer]);

  const { playing: trailerPlaying } = useTrailerAutoDismiss({
    open: showTrailer,
    iframeRef,
    videoKey: trailer?.key,
    onUnavailable: handleUnavailable,
    onPlaying: handlePlaying,
  });

  // Cerrar/abrir a mano cancela el autoplay pendiente.
  const setShowTrailerByUser = useCallback((value) => {
    userToggledRef.current = true;
    setShowTrailer(value);
  }, []);
  const toggleTrailerByUser = useCallback(
    (event) => {
      userToggledRef.current = true;
      toggleTrailer(event);
    },
    [toggleTrailer],
  );

  return {
    trailer,
    showTrailer,
    setShowTrailer: setShowTrailerByUser,
    trailerLoading,
    trailerPlaying,
    trailerError: error,
    toggleTrailer: toggleTrailerByUser,
  };
}
