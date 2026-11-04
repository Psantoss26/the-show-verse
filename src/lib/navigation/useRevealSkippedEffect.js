"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { isScreenReveal } from "@/lib/navigation/screenReveal";

// `useEffect` que no se repite cuando su pantalla REAPARECE.
//
// OverlayRouteHost conserva la página de debajo de una ficha en <Activity
// hidden>; al volver atrás React repite todos sus efectos aunque nada haya
// cambiado. Para los de carga eso significa pedir de nuevo y sustituir lo que
// ya estaba pintado (en Descubrir, todas las tandas cargadas al desplazarse
// se cambiaban por la primera: la página se encogía y el scroll saltaba).
//
// Se salta la ejecución solo durante el revelado, si las dependencias son las
// de la última ejecución y su trabajo había terminado (`settled`: si se ocultó
// con una carga a medias, se repite). Es la versión sin sesión de
// `useRestorableEffect` (lib/details/detailsBackSnapshot), para páginas que no
// se restauran tras desmontarse.
export function useRevealSkippedEffect(effect, deps, settled = true) {
  const ranRef = useRef(null);
  useEffect(
    () => runUnlessRevealed(ranRef, effect, deps, settled),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );
}

// Lo mismo para los efectos de layout (las listas siembran su caché antes de
// pintar): el revelado ya está marcado durante su render, así que también los
// alcanza.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useRevealSkippedLayoutEffect(effect, deps, settled = true) {
  const ranRef = useRef(null);
  useIsomorphicLayoutEffect(
    () => runUnlessRevealed(ranRef, effect, deps, settled),
    deps,
  );
}

function runUnlessRevealed(ranRef, effect, deps, settled) {
  const ran = ranRef.current;
  ranRef.current = deps;
  if (
    settled &&
    ran &&
    isScreenReveal() &&
    ran.length === deps.length &&
    ran.every((value, index) => Object.is(value, deps[index]))
  ) {
    return undefined;
  }
  return effect();
}
