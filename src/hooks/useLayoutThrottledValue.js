"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { LAYOUT_SETTLE_MS, throttleDelay } from "@/lib/ui/layoutThrottle";

// Copia de `value` que cambia como mucho una vez cada `intervalMs` (ver
// layoutThrottle.js). El primer cambio pasa en el acto y el último siempre
// llega: solo se agrupan los intermedios. Se usa para lo que recoloca tarjetas
// (agrupar/ordenar), no para lo que se pinta en ellas.
export default function useLayoutThrottledValue(value, intervalMs = LAYOUT_SETTLE_MS) {
  const [applied, setApplied] = useState(value);
  const lastAppliedAtRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (Object.is(value, applied)) return undefined;
    const apply = () => {
      timerRef.current = null;
      lastAppliedAtRef.current = performance.now();
      startTransition(() => setApplied(value));
    };
    const delay = throttleDelay(lastAppliedAtRef.current, performance.now(), intervalMs);
    if (delay === 0) {
      apply();
      return undefined;
    }
    timerRef.current = setTimeout(apply, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [value, applied, intervalMs]);

  return applied;
}
