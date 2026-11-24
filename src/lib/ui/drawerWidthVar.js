"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

// ANCHO DEL PANEL LATERAL ABIERTO.
//
// Mientras hay un panel lateral abierto, otros overlays superpuestos (p. ej. el
// modal de episodios agrupados del Historial) se centran en el espacio libre a
// su IZQUIERDA en vez de taparlo. En centrado/móvil nunca se publica: esos
// overlays ocupan la ventana completa como siempre.
//
// Vive en un almacén de módulo y no en una variable CSS de <html>: escribir una
// propiedad personalizada en <html> obliga a recalcular el estilo de TODO el
// documento (se hereda), ~55 ms con una página de usuario llena de tarjetas, y
// pasaba justo al abrir el panel, en el fotograma en que arranca su entrada.
// Solo la leen un par de overlays, que se suscriben con `useDrawerWidth`.
//
// El "dueño" es COMÚN a todos los paneles (la ficha de título y la de temporada
// o episodio): al cambiar de uno a otro, AnimatePresence mantiene montado el
// saliente durante su salida y su limpieza llega DESPUÉS de que el entrante
// fijara el ancho. Con un contador por tipo de panel, el saliente lo borraba
// y el overlay se expandía tapando el panel que sigue abierto.
let seq = 0;
let owner = 0;
let current = 0;
const listeners = new Set();

function publish(width) {
  if (width === current) return;
  current = width;
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => current;
const getServerSnapshot = () => 0;

export function useDrawerWidthVar(active, width) {
  useLayoutEffect(() => {
    if (!active || typeof document === "undefined") return undefined;
    const id = ++seq;
    owner = id;
    publish(width);
    return () => {
      if (owner !== id) return;
      owner = 0;
      publish(0);
    };
  }, [active, width]);
}

// Ancho en px del panel lateral abierto (0 si no hay ninguno).
export function useDrawerWidth() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
