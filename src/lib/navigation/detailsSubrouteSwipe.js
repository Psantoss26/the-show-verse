"use client";

import { useEffect } from "react";

// Anterior/siguiente de las fichas de temporada y episodio para el gesto móvil
// de MobileUserPageSwipeNavigation. A diferencia de la secuencia de títulos
// (userDetailsSequence), no sale de una lista guardada: la calcula la propia
// ficha con sus temporadas o episodios (lib/details/subrouteNavigation), así
// que la ficha la publica aquí mientras está montada.
const SUBROUTE_PATTERN = /^\/details\/tv\/[^/?#]+\/season\/[^/?#]+(?:\/episode\/[^/?#]+)?$/;

let current = null;
const listeners = new Set();

function normalizePathname(pathname) {
  if (typeof pathname !== "string") return "";
  return pathname.replace(/\/+$/, "") || "/";
}

function emit() {
  for (const listener of listeners) listener();
}

export function isDetailsSubroutePath(pathname) {
  return SUBROUTE_PATTERN.test(normalizePathname(pathname));
}

export function subscribeDetailsSubrouteSequence(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Devuelve el objeto guardado tal cual (estable entre lecturas) para que sirva
// como snapshot de useSyncExternalStore.
export function getDetailsSubrouteSnapshot() {
  return current;
}

export function getDetailsSubrouteSequence(pathname) {
  const path = normalizePathname(pathname);
  if (!current || current.pathname !== path) return null;
  return current;
}

/**
 * Publica el anterior/siguiente de la ficha montada. Se retira al desmontar
 * solo si nadie lo ha sustituido: al navegar, la ficha nueva monta antes de que
 * se desmonte la anterior.
 */
export function useDetailsSubrouteSwipe(pathname, previousHref, nextHref) {
  useEffect(() => {
    const path = normalizePathname(pathname);
    if (!isDetailsSubroutePath(path) || (!previousHref && !nextHref)) return undefined;

    const entry = { pathname: path, previous: previousHref || null, next: nextHref || null };
    current = entry;
    emit();
    return () => {
      if (current !== entry) return;
      current = null;
      emit();
    };
  }, [pathname, previousHref, nextHref]);
}
