"use client";

import { useLayoutEffect, useRef } from "react";
import { runSiblingToolbarShift } from "@/lib/ui/siblingToolbarShift";

// Pasado este tiempo desde el montaje ya no es la llegada: no se anima.
const LATE_ROW_MS = 300;

// Relevo de la barra móvil al llegar desde la página hermana (ver
// siblingToolbarShift.js). `rowRef`: la fila con los `data-sibling-shift`.
// Solo una vez, al llegar, y solo si `active` (se llegó desde la hermana).
// `onDone` se llama al acabar (o al no animar), p. ej. para quitar la copia
// del botón que se va.
export function useSiblingToolbarShift(rowRef, { active, delta, onDone }) {
  const startedRef = useRef(false);
  const mountedAtRef = useRef(null);
  const onDoneRef = useRef(onDone);

  // Sin dependencias: la fila puede montarse un render después (barra detrás
  // de la sesión).
  useLayoutEffect(() => {
    onDoneRef.current = onDone;
    if (!active || startedRef.current) return;
    mountedAtRef.current ??= performance.now();
    const row = rowRef.current;
    if (!row) {
      if (performance.now() - mountedAtRef.current > LATE_ROW_MS) {
        startedRef.current = true;
        onDoneRef.current?.();
      }
      return;
    }
    startedRef.current = true;
    runSiblingToolbarShift(row, delta).then(() => onDoneRef.current?.());
  });
}
