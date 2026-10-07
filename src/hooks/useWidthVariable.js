"use client";

import { useCallback, useRef } from "react";

// Publica el ancho de un elemento como variable CSS en un contenedor
// antepasado, y lo mantiene al día con un ResizeObserver (solo cambia al
// redimensionar, nunca por fotograma).
//
// Uso: las filas del desplegable móvil de Historial y Listas alinean su
// columna derecha con la parte derecha de la barra de arriba (secciones,
// calendario, botón del menú), aunque no sea una mitad exacta:
//
//   const rightRef = useWidthVariable("--x", "[data-toolbar]");
//   <div data-toolbar>
//     <div ref={rightRef}>…</div>
//     <div style={{ flex: "0 0 var(--x, calc(50% - 4px))" }}>…</div>
//   </div>
//
// Es una ref de callback y no un efecto de montaje: la barra puede no existir
// al montar la página (estado de carga) y un efecto no volvería a medir.
export default function useWidthVariable(variableName, containerSelector) {
  const observerRef = useRef(null);
  return useCallback(
    (element) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!element || typeof ResizeObserver === "undefined") return;
      const container = element.closest(containerSelector);
      if (!container) return;
      const sync = () => {
        const width = element.getBoundingClientRect().width;
        // Oculto (p. ej. `lg:hidden` en escritorio) mide 0: se conserva el
        // último valor válido.
        if (width > 0) {
          container.style.setProperty(variableName, `${width}px`);
        }
      };
      sync();
      const observer = new ResizeObserver(sync);
      observer.observe(element);
      observerRef.current = observer;
    },
    [variableName, containerSelector],
  );
}
