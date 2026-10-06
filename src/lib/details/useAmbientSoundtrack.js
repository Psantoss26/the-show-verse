"use client";

// MODO SOUNDTRACK de la ficha: al entrar en un título suena su banda sonora
// (las previews de 30 s que ya trae /api/soundtrack), una pista detrás de otra
// y en bucle, a volumen bajo. Un solo <audio> fuera del DOM.
//
//   - Silenciar se recuerda en este navegador: con el soundtrack silenciado no
//     suena en ningún título hasta que se vuelva a activar.
//   - Se pausa mientras haya algo que tenga su propio sonido (tráiler, el
//     reproductor del soundtrack) y con la pestaña oculta, y sigue después.
//   - Los navegadores pueden bloquear el sonido sin un gesto previo (al abrir
//     la ficha directamente desde un enlace). Entonces espera al primer toque
//     o tecla en la página para empezar.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MUTED_KEY = "showverse:soundtrack:ambientMuted";
const VOLUME = 0.3;
const FADE_MS = 900;

function readMuted() {
  try {
    return window.localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(value) {
  try {
    window.localStorage.setItem(MUTED_KEY, value ? "1" : "0");
  } catch {
    /* sin almacenamiento: vale para esta visita */
  }
}

/** Pistas que se pueden reproducir aquí (con preview). */
export function ambientPlaylist(tracks) {
  return (Array.isArray(tracks) ? tracks : []).filter((track) => track?.previewUrl);
}

/**
 * @param tracks     pistas del soundtrack (las de /api/soundtrack).
 * @param suspended  hay otro sonido en la ficha: pausar sin silenciar.
 * @param resetKey   identidad del título: al cambiar, vuelve a la primera pista.
 * @returns {{ available, playing, muted, trackId, toggle }}
 *   available  hay pistas con preview;
 *   playing    está sonando (para animar el icono del altavoz);
 *   muted      el usuario lo ha silenciado;
 *   trackId    la pista que suena (el reproductor completo abre en ella);
 *   toggle     silenciar / activar (o empezar si el navegador lo bloqueó).
 */
export default function useAmbientSoundtrack({ tracks, suspended = false, resetKey = "" }) {
  const playlist = useMemo(() => ambientPlaylist(tracks), [tracks]);
  const playlistKey = playlist.map((track) => track.previewUrl).join("|");
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [trackUrl, setTrackUrl] = useState("");
  const audioRef = useRef(null);
  const indexRef = useRef(0);
  // La pista cargada en el <audio> (su previewUrl).
  const srcRef = useRef("");
  const fadeRef = useRef(0);
  const playlistRef = useRef(playlist);
  const wantRef = useRef(false);

  // Antes que el efecto que decide si suena (los efectos van en orden).
  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    setMuted(readMuted());
  }, []);

  const audio = useCallback(() => {
    if (!audioRef.current && typeof Audio !== "undefined") {
      const element = new Audio();
      element.preload = "auto";
      element.volume = 0;
      element.addEventListener("playing", () => setPlaying(true));
      element.addEventListener("pause", () => setPlaying(false));
      element.addEventListener("ended", () => {
        // Siguiente pista, en bucle.
        const list = playlistRef.current;
        if (!list.length) return;
        indexRef.current = (indexRef.current + 1) % list.length;
        srcRef.current = list[indexRef.current].previewUrl;
        element.src = srcRef.current;
        setTrackUrl(srcRef.current);
        if (wantRef.current) void element.play().catch(() => {});
      });
      audioRef.current = element;
    }
    return audioRef.current;
  }, []);

  const fadeTo = useCallback((element, target, done) => {
    cancelAnimationFrame(fadeRef.current);
    const from = element.volume;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / FADE_MS);
      element.volume = Math.max(0, Math.min(1, from + (target - from) * t));
      if (t < 1) fadeRef.current = requestAnimationFrame(step);
      else done?.();
    };
    fadeRef.current = requestAnimationFrame(step);
  }, []);

  // Empieza o sigue. Devuelve false si el navegador pide antes un gesto.
  const start = useCallback(async () => {
    const element = audio();
    const list = playlistRef.current;
    if (!element || !list.length) return true;
    // Sigue con la pista que sonaba si aún está en la lista; si no, la primera.
    const current = list.findIndex((track) => track.previewUrl === srcRef.current);
    if (current < 0) {
      indexRef.current = 0;
      srcRef.current = list[0].previewUrl;
      element.src = srcRef.current;
      setTrackUrl(srcRef.current);
    } else {
      indexRef.current = current;
    }
    try {
      await element.play();
      fadeTo(element, VOLUME);
      return true;
    } catch (error) {
      return error?.name !== "NotAllowedError";
    }
  }, [audio, fadeTo]);

  const stop = useCallback(() => {
    const element = audioRef.current;
    if (!element || element.paused) return;
    fadeTo(element, 0, () => element.pause());
  }, [fadeTo]);

  // Otro título: desde la primera pista. Va ANTES que el efecto que decide si
  // suena (los efectos corren en orden), que después arranca la nueva.
  useEffect(() => {
    indexRef.current = 0;
    srcRef.current = "";
    const element = audioRef.current;
    if (element) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
  }, [resetKey]);

  // Sonar o no según el estado; si el navegador lo bloquea, al primer gesto.
  useEffect(() => {
    const want = !muted && !suspended && playlist.length > 0;
    wantRef.current = want;
    if (!want) {
      stop();
      return undefined;
    }
    let cancelled = false;
    let cleanupGesture = null;
    const onHidden = () => {
      if (document.visibilityState === "hidden") stop();
      else if (wantRef.current) void start();
    };
    document.addEventListener("visibilitychange", onHidden);
    if (document.visibilityState !== "hidden") {
      void start().then((ok) => {
        if (ok || cancelled) return;
        const retry = () => {
          cleanupGesture?.();
          if (wantRef.current) void start();
        };
        const events = ["pointerdown", "keydown"];
        events.forEach((name) => window.addEventListener(name, retry, { once: true, capture: true }));
        cleanupGesture = () => events.forEach((name) => window.removeEventListener(name, retry, { capture: true }));
      });
    }
    return () => {
      cancelled = true;
      cleanupGesture?.();
      document.removeEventListener("visibilitychange", onHidden);
    };
    // `playlist` se sigue por su clave: la misma lista puede llegar en otro array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted, suspended, playlistKey, resetKey, start, stop]);

  // Al salir de la ficha, silencio.
  useEffect(
    () => () => {
      cancelAnimationFrame(fadeRef.current);
      const element = audioRef.current;
      if (element) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
      audioRef.current = null;
    },
    [],
  );

  const toggle = useCallback(() => {
    if (muted) {
      writeMuted(false);
      setMuted(false);
      // Dentro del gesto: así el navegador deja sonar aunque antes lo bloqueara.
      if (!suspended) void start();
      return;
    }
    const element = audioRef.current;
    if (!element || element.paused) {
      // Bloqueado por el navegador: este toque es el gesto que faltaba.
      void start();
      return;
    }
    writeMuted(true);
    setMuted(true);
  }, [muted, start, suspended]);

  const trackId = playlist.find((track) => track.previewUrl === trackUrl)?.id ?? null;
  return { available: playlist.length > 0, playing: playing && !muted, muted, trackId, toggle };
}
