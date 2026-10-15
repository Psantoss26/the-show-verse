"use client";

import { useLayoutEffect } from "react";

// ANCHO DEL PANEL LATERAL EN `--sv-drawer-width` (en <html>).
//
// Mientras hay un panel lateral abierto, otros overlays superpuestos (p. ej. el
// modal de episodios agrupados del Historial) se centran en el espacio libre a
// su IZQUIERDA en vez de taparlo. En centrado/móvil nunca se pone: esos
// overlays ocupan la ventana completa como siempre.
//
// El "dueño" es COMÚN a todos los paneles (la ficha de título y la de temporada
// o episodio): al cambiar de uno a otro, AnimatePresence mantiene montado el
// saliente durante su salida y su limpieza llega DESPUÉS de que el entrante
// fijara la variable. Con un contador por tipo de panel, el saliente la borraba
// y el overlay se expandía tapando el panel que sigue abierto.
let seq = 0;
let owner = 0;

export function useDrawerWidthVar(active, width) {
  useLayoutEffect(() => {
    if (!active || typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const id = ++seq;
    owner = id;
    root.style.setProperty("--sv-drawer-width", `${width}px`);
    return () => {
      if (owner !== id) return;
      owner = 0;
      root.style.removeProperty("--sv-drawer-width");
    };
  }, [active, width]);
}
