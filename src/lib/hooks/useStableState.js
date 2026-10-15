"use client";

import { useCallback, useState } from "react";

// ¿Mismos DATOS? Comparación estructural de lo que guardan las páginas de
// usuario en su estado: primitivos, arrays, objetos planos, Map y Set.
// Cualquier otra instancia (Date, clases…) solo es igual a sí misma.
export function sameData(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!sameData(a[i], b[i])) return false;
    }
    return true;
  }
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !sameData(value, b.get(key))) return false;
    }
    return true;
  }
  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) return false;
    for (const value of a) if (!b.has(value)) return false;
    return true;
  }
  const protoA = Object.getPrototypeOf(a);
  if (protoA !== Object.prototype && protoA !== null) return false;
  if (Object.getPrototypeOf(b) !== protoA) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(b, key) || !sameData(a[key], b[key])) return false;
  }
  return true;
}

// useState que NO cambia la referencia si el valor nuevo trae los mismos datos.
//
// Al volver de una ficha la página reaparece de <Activity> (ver
// OverlayRouteHost) y React vuelve a ejecutar sus efectos: las cargas piden la
// lista otra vez y la guardan en un array NUEVO aunque sea idéntica. Eso
// renderizaba la página y TODAS sus tarjetas justo cuando el usuario ya movía
// el ratón, y el hover iba a tirones un par de segundos. Con este estado, una
// respuesta igual no provoca render; una distinta (algo añadido o quitado desde
// la ficha) se aplica como siempre.
export function useStableState(initialState) {
  const [state, setState] = useState(initialState);
  const setStableState = useCallback((update) => {
    setState((previous) => {
      const next = typeof update === "function" ? update(previous) : update;
      return sameData(previous, next) ? previous : next;
    });
  }, []);
  return [state, setStableState];
}
