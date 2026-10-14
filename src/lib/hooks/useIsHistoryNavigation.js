"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { isHistoryNavigation } from "@/lib/navigation/historyNavigation";

export {
  isHistoryNavigation,
  notifyPushNavigation,
  syncHistoryPage,
  wasInPagePopState,
} from "@/lib/navigation/historyNavigation";

// Captura el valor en el PRIMER render del componente (su montaje) y lo mantiene
// estable durante toda su vida. Como las páginas re-montan al navegar, el valor
// refleja si ESTE montaje proviene de atrás/adelante. Úsalo para:
//   - saltar la animación de entrada:  initial={isBack ? false : "hidden"}
//   - renderizar el contenido completo: useState(isBack ? full : chunkInicial)
export function useIsHistoryNavigation() {
  // La ruta que se RENDERIZA, que puede no ser aún la de la URL (ver
  // `historyTargetPath`).
  const pathname = usePathname();
  const ref = useRef(null);
  if (ref.current === null) ref.current = isHistoryNavigation(pathname);
  return ref.current;
}

// ¿Debe MANTENERSE CONGELADO el orden actual del contenido?
//
// Problema: al VOLVER (atrás/adelante) a una página cuyo contenido está ordenado
// (p. ej. por mejor valoración), las puntuaciones/fechas que gobiernan el orden se
// refrescan de forma asíncrona tras el montaje; el memo de ordenación recalcula y
// las tarjetas (con `layout` de framer-motion) se DESLIZAN a su nueva posición. El
// usuario ve cómo los títulos "se reordenan" después de mostrarse la página.
//
// Regla de negocio: el contenido se ordena UNA sola vez —cuando el usuario cambia
// el tipo de ordenación— y debe permanecer FIJO al volver a la página.
//
// Este hook devuelve `true` mientras: (1) el montaje proviene de atrás/adelante y
// (2) los controles de orden NO han cambiado desde el montaje. Pásale una clave que
// represente el estado de ordenación (p. ej. `${sortBy}|${groupBy}`). En cuanto el
// usuario cambia la ordenación, la clave cambia y deja de congelar, de modo que el
// reordenamiento vuelve a permitirse solo ante una acción explícita del usuario.
//
// Úsalo para saltar los refrescos asíncronos que reordenan:
//   const freezeOrder = useBackNavOrderFreeze(`${sortBy}|${groupBy}`);
//   useEffect(() => { if (freezeOrder) return; loadScores(); }, [items, freezeOrder]);
export function useBackNavOrderFreeze(orderingKey) {
  const isBackNav = useIsHistoryNavigation();
  const capturedRef = useRef(false);
  const initialKeyRef = useRef(undefined);
  if (!capturedRef.current) {
    capturedRef.current = true;
    initialKeyRef.current = String(orderingKey);
  }
  return isBackNav && initialKeyRef.current === String(orderingKey);
}
