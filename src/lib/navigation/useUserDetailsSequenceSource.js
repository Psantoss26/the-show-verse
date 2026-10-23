"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { setUserDetailsSequenceSource } from "./userDetailsSequence";

/**
 * Publica el orden completo de una página personal (tras filtros, orden y
 * grupos) para Anterior/Siguiente de la ficha. Devuelve un ref para el
 * contenedor de las tarjetas, que debe llevar `data-user-details-sequence`.
 * Hace falta en las páginas que montan sus tarjetas por tandas: el DOM solo
 * tiene las primeras y la secuencia se cortaba en la última montada.
 */
export default function useUserDetailsSequenceSource(hrefs) {
  const nodeRef = useRef(null);
  const hrefsRef = useRef(hrefs);

  useLayoutEffect(() => {
    hrefsRef.current = hrefs;
    if (nodeRef.current) setUserDetailsSequenceSource(nodeRef.current, hrefs);
  }, [hrefs]);

  return useCallback((node) => {
    if (nodeRef.current && nodeRef.current !== node) {
      setUserDetailsSequenceSource(nodeRef.current, null);
    }
    nodeRef.current = node;
    if (node) setUserDetailsSequenceSource(node, hrefsRef.current);
  }, []);
}
