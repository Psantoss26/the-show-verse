"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// Modo de la portada (póster 2:3 ↔ backdrop 16:9) de las páginas de listas y
// colecciones, con la MISMA preferencia global que DetailsClient
// (`showverse:global:posterViewMode`, valores "poster" | "preview"): cambiarlo
// en una ficha lo cambia aquí y al revés.
//
// Igual que en la ficha, solo en escritorio de verdad (ratón y viewport que no
// sea de móvil, > 640 px): en táctil la portada se queda siempre en póster.
export const GLOBAL_POSTER_VIEW_MODE_KEY = "showverse:global:posterViewMode";
const DESKTOP_QUERY = "(hover: hover) and (min-width: 641px)";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function usePosterViewMode() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setModeState] = useState("poster");

  // Antes del primer repintado, para no enseñar el póster y saltar al backdrop.
  useClientLayoutEffect(() => {
    const query = window.matchMedia?.(DESKTOP_QUERY);
    const sync = () => setEnabled(!!query?.matches);
    sync();
    try {
      const saved = window.localStorage.getItem(GLOBAL_POSTER_VIEW_MODE_KEY);
      if (saved === "poster" || saved === "preview") setModeState(saved);
    } catch {
      // localStorage no disponible: póster.
    }
    query?.addEventListener?.("change", sync);
    return () => {
      query?.removeEventListener?.("change", sync);
    };
  }, []);

  const setMode = useCallback((next) => {
    const value = next === "preview" ? "preview" : "poster";
    setModeState(value);
    try {
      window.localStorage.setItem(GLOBAL_POSTER_VIEW_MODE_KEY, value);
    } catch {
      // Sin persistencia: el cambio vale para esta página.
    }
  }, []);

  return { mode, setMode, enabled };
}
