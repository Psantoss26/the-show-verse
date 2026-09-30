"use client";

// /src/components/ui/MobileFiltersPanel.jsx
// Panel desplegable de los menús MÓVILES (filtros, orden, agrupar, vista…) de
// todas las páginas y de las secciones del Perfil. Una sola implementación para
// que la animación sea idéntica en todas partes.
//
// POR QUÉ ASÍ:
//   - La altura se anima con `grid-template-rows: 0fr -> 1fr` en CSS. Es la
//     forma Baseline de llegar a la altura natural del contenido (el objetivo
//     del proyecto es Baseline 2024; `interpolate-size` aún no lo es) y no
//     ejecuta JavaScript en cada fotograma, a diferencia de `height: "auto"` de
//     framer-motion, que era lo que daba tirones con la página ocupada.
//   - El contenido acompaña con un desplazamiento de 8px por `transform`. NUNCA
//     con `opacity`: un ancestro con opacidad < 1 aplana el `backdrop-filter`
//     de los controles de cristal durante toda la animación.
//   - Mientras anima, el panel recorta (si no, el contenido asomaría antes de
//     tener sitio). Al terminar de abrirse deja de recortar: los desplegables
//     de dentro (Ordenar, Agrupar…) cuelgan por debajo del panel y quedaban
//     cortados.
//   - El contenido solo está montado mientras el panel está abierto o
//     cerrándose, como antes con AnimatePresence: al cerrar se desmontan sus
//     desplegables y no queda ninguno abierto flotando.
//   - Sin animaciones con `prefers-reduced-motion`.
//
// El margen superior va DENTRO (`gapClassName`), no en el contenedor: así el
// hueco también se anima y cerrado no ocupa nada.

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export const MOBILE_FILTERS_PANEL_DURATION_MS = 280;
const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export default function MobileFiltersPanel({
  open,
  id,
  className = "",
  style,
  gapClassName = "pt-2",
  contentClassName = "",
  ref,
  children,
}) {
  const [present, setPresent] = useState(open);
  const [expanded, setExpanded] = useState(false);
  const [settled, setSettled] = useState(false);

  // Abrir: primero se monta cerrado (0fr) y, ya en el DOM, se expande. Forzar
  // el cálculo de estilos fija el de partida (0fr) para que la transición
  // arranque desde cero en vez de aparecer ya abierto.
  useLayoutEffect(() => {
    if (open) {
      if (!present) {
        setPresent(true);
        return;
      }
      if (!expanded) {
        document.documentElement.getBoundingClientRect();
        setExpanded(true);
      }
      return;
    }
    if (expanded) {
      setSettled(false);
      setExpanded(false);
    }
  }, [open, present, expanded]);

  const finish = useCallback(() => {
    if (expanded) setSettled(true);
    else setPresent(false);
  }, [expanded]);

  // Red de seguridad: sin `transitionend` (movimiento reducido, o el panel
  // oculto con `lg:hidden` al ensanchar la ventana) el estado final llega igual.
  useEffect(() => {
    if (!present) return undefined;
    if (!expanded && open) return undefined;
    const delay = prefersReducedMotion() ? 0 : MOBILE_FILTERS_PANEL_DURATION_MS + 60;
    const timer = window.setTimeout(finish, delay);
    return () => window.clearTimeout(timer);
  }, [present, expanded, open, finish]);

  if (!present) return null;

  const transition = `${MOBILE_FILTERS_PANEL_DURATION_MS}ms ${EASING}`;

  return (
    <div
      ref={ref}
      id={id}
      inert={!open || undefined}
      className={`grid motion-reduce:!transition-none ${className}`}
      style={{
        ...style,
        gridTemplateRows: expanded ? "1fr" : "0fr",
        transition: `grid-template-rows ${transition}`,
      }}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "grid-template-rows") {
          finish();
        }
      }}
    >
      <div className={`min-h-0 ${settled ? "overflow-visible" : "overflow-hidden"}`}>
        <div
          className={`${gapClassName} motion-reduce:!transition-none`}
          style={{
            transform: expanded ? "translateY(0)" : "translateY(-8px)",
            transition: `transform ${transition}`,
          }}
        >
          {contentClassName ? <div className={contentClassName}>{children}</div> : children}
        </div>
      </div>
    </div>
  );
}
