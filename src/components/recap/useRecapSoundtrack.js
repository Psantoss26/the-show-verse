"use client";

// Banda sonora de "Tu año en The Show Verse". Cada pantalla dice qué título
// suena (`sound` en recapModel); aquí se resuelve la pista con /api/soundtrack
// (Spotify → iTunes → Deezer, solo fragmentos de 30 s) y se pasa de una a otra
// con un fundido cruzado entre DOS elementos <audio>.
//
// Navegadores: el audio solo puede empezar tras un gesto del usuario. `unlock()`
// se llama dentro del clic de "Empezar" y arranca la pista si ya está resuelta;
// si no, deja el elemento desbloqueado para cuando llegue.

import { useCallback, useEffect, useRef, useState } from "react";

// Volumen de la banda sonora: 20 % en la vista de ordenador (el marco con
// flechas a partir de 640 px, el `sm:` de RecapStory) y 55 % en móvil, donde
// los altavoces suenan mucho más bajos. Se lee en cada fundido para seguir al
// tamaño de la ventana si cambia a mitad del resumen.
const DESKTOP_VOLUME = 0.2;
const MOBILE_VOLUME = 0.55;
const DESKTOP_QUERY = "(min-width: 640px)";

function targetVolume() {
  if (typeof window === "undefined" || !window.matchMedia) return MOBILE_VOLUME;
  return window.matchMedia(DESKTOP_QUERY).matches ? DESKTOP_VOLUME : MOBILE_VOLUME;
}
const FADE_MS = 900;

function yearOf(card) {
  const year = Number(card?.year);
  return Number.isInteger(year) ? year : null;
}

async function resolveTrack(card, signal) {
  const params = new URLSearchParams({
    title: card.title || "",
    type: card.mediaType === "movie" ? "movie" : "tv",
    country: "ES",
    tmdbId: String(card.tmdbId || ""),
  });
  if (card.originalTitle && card.originalTitle !== card.title) params.set("originalTitle", card.originalTitle);
  const year = yearOf(card);
  if (year) params.set("year", String(year));
  const res = await fetch(`/api/soundtrack?${params.toString()}`, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  const track = Array.isArray(data?.tracks) ? data.tracks.find((item) => item?.previewUrl) : null;
  if (!track) return null;
  return {
    key: card.key,
    previewUrl: track.previewUrl,
    trackName: track.trackName || track.name || "Banda sonora",
    artistName: track.artistName || "",
    artworkUrl: track.artworkUrl || "",
    titleName: card.title,
  };
}

function fade(audio, to, ms, onDone) {
  if (!audio) return () => {};
  const from = audio.volume;
  const start = performance.now();
  let frame = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t < 1) frame = requestAnimationFrame(step);
    else onDone?.();
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

// Operaciones sobre los elementos <audio> (fuera del hook: son objetos del DOM,
// no estado de React).
function createPlayer() {
  const audio = new Audio();
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = 0;
  return audio;
}

function disposePlayer(audio) {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

function loadTrack(audio, url) {
  audio.src = url;
  audio.currentTime = 0;
  audio.volume = 0;
  return audio.play();
}

// Un play/pause silencioso dentro del gesto del usuario desbloquea el elemento
// para reproducir más tarde sin otro gesto.
function silentUnlock(audio) {
  audio.muted = true;
  audio
    .play()
    .catch(() => {})
    .finally(() => {
      audio.pause();
      audio.muted = false;
    });
}

/**
 * @param {object} options
 * @param {Array} options.subjects   tarjetas de título (key, title, tmdbId, mediaType…)
 * @param {string|null} options.activeKey  título que debe sonar ahora
 * @param {boolean} options.enabled  la experiencia ha empezado (hubo gesto)
 * @param {boolean} options.muted
 * @param {string[]} [options.upcomingKeys]  títulos de las próximas pantallas (precarga)
 */
export default function useRecapSoundtrack({ subjects, activeKey, enabled, muted, upcomingKeys = [] }) {
  const tracks = useRef(new Map()); // key -> track | null (sin pista) | Promise
  const players = useRef([]);
  const current = useRef({ index: 0, key: null });
  const fades = useRef([]);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [, setVersion] = useState(0);

  // Dos reproductores, creados solo en el cliente.
  useEffect(() => {
    players.current = [createPlayer(), createPlayer()];
    const timers = fades.current;
    return () => {
      timers.forEach((cancel) => cancel());
      players.current.forEach(disposePlayer);
      players.current = [];
    };
  }, []);

  const ensure = useCallback((key) => {
    if (!key || tracks.current.has(key)) return;
    const card = (subjects || []).find((subject) => subject.key === key);
    if (!card) {
      tracks.current.set(key, null);
      return;
    }
    const controller = new AbortController();
    const promise = resolveTrack(card, controller.signal)
      .catch(() => null)
      .then((track) => {
        tracks.current.set(key, track);
        setVersion((v) => v + 1);
        return track;
      });
    tracks.current.set(key, promise);
  }, [subjects]);

  // Precarga: el título activo y los de las próximas pantallas, para que al
  // pasar de pantalla la canción nueva ya esté resuelta.
  const upcoming = upcomingKeys.filter(Boolean).join("|");
  useEffect(() => {
    if (!subjects?.length) return;
    ensure(activeKey || subjects[0].key);
    for (const key of upcoming ? upcoming.split("|") : []) ensure(key);
  }, [subjects, activeKey, upcoming, ensure]);

  const playKey = useCallback((key) => {
    const track = tracks.current.get(key);
    if (!track || track instanceof Promise) return false;
    const [a, b] = players.current;
    if (!a || !b) return false;
    if (current.current.key === key) {
      const active = players.current[current.current.index];
      if (active.paused) {
        active.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        fades.current.push(fade(active, targetVolume(), FADE_MS));
      }
      return true;
    }
    const outgoing = players.current[current.current.index];
    const nextIndex = current.current.key ? 1 - current.current.index : current.current.index;
    const incoming = players.current[nextIndex];
    if (outgoing && outgoing !== incoming && !outgoing.paused) {
      fades.current.push(fade(outgoing, 0, FADE_MS, () => outgoing.pause()));
    }
    loadTrack(incoming, track.previewUrl)
      .then(() => {
        setPlaying(true);
        fades.current.push(fade(incoming, targetVolume(), FADE_MS));
      })
      .catch(() => setPlaying(false));
    current.current = { index: nextIndex, key };
    setNowPlaying(track);
    return true;
  }, []);

  /** Debe llamarse dentro del gesto del usuario que arranca la experiencia. */
  const unlock = useCallback(() => {
    const key = activeKey || subjects?.[0]?.key;
    if (key && playKey(key)) return;
    // Sin pista todavía: se desbloquean los elementos para cuando llegue.
    players.current.forEach(silentUnlock);
  }, [activeKey, subjects, playKey]);

  // Sigue al título activo (si no tiene pista, sigue sonando la anterior).
  useEffect(() => {
    if (!enabled || muted || !activeKey) return;
    playKey(activeKey);
  });

  // Silencio y pestaña oculta.
  useEffect(() => {
    const active = players.current[current.current.index];
    if (!active) return undefined;
    if (muted || !enabled) {
      fades.current.push(fade(active, 0, 300, () => active.pause()));
      setPlaying(false);
    }
    return undefined;
  }, [muted, enabled]);

  useEffect(() => {
    const onVisibility = () => {
      const active = players.current[current.current.index];
      if (!active) return;
      if (document.visibilityState === "hidden") {
        active.pause();
        setPlaying(false);
      } else if (enabled && !muted && current.current.key) {
        active.play().then(() => setPlaying(true)).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, muted]);

  return { nowPlaying, playing, unlock };
}
