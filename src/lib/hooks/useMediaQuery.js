"use client";

import { useEffect, useState } from "react";

// Hook reactivo de media query. Inicializa con el valor real en cliente (sin
// flash) y se actualiza al cambiar el tamaño/orientación de la ventana.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// Conveniencia: true en móvil (< 768px). El drawer lateral del DetailModal solo
// se usa en escritorio; en móvil la ficha se muestra centrada (como en Inicio).
export function useIsMobile() {
  return useMediaQuery("(max-width: 767px)");
}

// ¿El dispositivo PUEDE de verdad posar el puntero?
//
// Es la misma condición que decide el navbar de escritorio (ver la variante
// `desktop:` en globals.css). Hace falta en JS porque los efectos de hover
// movidos por código —las vistas previas de los dashboards, sobre todo— se
// disparan con `onMouseEnter`, y al tocar en una pantalla táctil el navegador
// SINTETIZA ese evento: la vista previa se abría en tablets con solo tocar.
// Comprobarlo por ancho no vale: hay tablets con más resolución que un monitor.
export function useHoverCapable() {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}
