"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getTitleNamesVersion, requestTitleNames, subscribeTitleNames } from "./titleNames.js";

/**
 * Activa la búsqueda por el nombre en inglés y en español en una página:
 * mientras haya texto en el buscador, pide los nombres de `items` que falten.
 * Devuelve una versión que cambia al llegar nombres nuevos; va en las
 * dependencias del filtro para que se vuelva a calcular con ellos.
 */
export function useTitleNameSearch(items, query) {
  const active = Boolean(String(query || "").trim());
  useEffect(() => {
    if (active) requestTitleNames(items);
  }, [active, items]);
  return useSyncExternalStore(subscribeTitleNames, getTitleNamesVersion, () => 0);
}
