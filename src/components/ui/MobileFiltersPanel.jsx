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
//
// SEPARACIÓN HEREDADA DEL CONTENEDOR. Casi todas las barras apilan sus filas
// con `space-y-*` (o `gap`): mientras el panel está montado, la fila de encima
// conserva su margen inferior aunque el panel mida 0, y al desmontarse ese
// margen desaparece de golpe. Eso era el "bache" al final del cierre (y un
// salto al empezar a abrir) en todas las páginas salvo las que envuelven el
// panel en un contenedor propio sin separación. Al montarse, el panel mide el
// hueco que le deja el hermano anterior, lo anula con un margen negativo y lo
// reproduce DENTRO, en la parte que se anima: montado y desmontado miden lo
// mismo y la separación entra y sale con el resto del movimiento.

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export const MOBILE_FILTERS_PANEL_DURATION_MS = 280;
const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

// Hueco entre el hermano visible anterior y el panel (sin contar el margen que
// pone el propio panel). Fuera de flujo (panel fijado como overlay) no hay
// nada que compensar.
function inheritedLeadingGap(el) {
  const own = window.getComputedStyle(el);
  if (own.position === "absolute" || own.position === "fixed") return 0;
  let prev = el.previousElementSibling;
  while (prev) {
    const ps = window.getComputedStyle(prev);
    if (ps.display !== "none" && ps.position !== "absolute" && ps.position !== "fixed") break;
    prev = prev.previousElementSibling;
  }
  if (!prev) return 0;
  const previousMargin = el.style.marginTop;
  el.style.marginTop = "0px";
  const gap = el.getBoundingClientRect().top - prev.getBoundingClientRect().bottom;
  el.style.marginTop = previousMargin;
  return Math.max(0, Math.round(gap));
}

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
  const rootRef = useRef(null);
  const [present, setPresent] = useState(open);
  const [expanded, setExpanded] = useState(false);
  const [settled, setSettled] = useState(false);
  const [leadingGap, setLeadingGap] = useState(0);

  useImperativeHandle(ref, () => rootRef.current);

  // Se vuelve a medir si cambia la colocación (p. ej. al fijarse la barra el
  // panel pasa a overlay y deja de haber hueco que compensar).
  useLayoutEffect(() => {
    if (!present || !rootRef.current) return;
    const gap = inheritedLeadingGap(rootRef.current);
    setLeadingGap((current) => (current === gap ? current : gap));
  }, [present, className]);

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
      ref={rootRef}
      id={id}
      inert={!open || undefined}
      className={`grid motion-reduce:!transition-none ${className}`}
      style={{
        ...style,
        marginTop: leadingGap ? -leadingGap : style?.marginTop,
        gridTemplateRows: expanded ? "1fr" : "0fr",
        // La única columna se ajusta al ancho disponible. Sin esto (columna
        // `auto` y celda sin `min-w-0`) el panel tomaba el ancho mínimo de su
        // contenido: en móviles estrechos se salía por la derecha y sus filas a
        // mitades no cuadraban con la barra de arriba (Historial, 390 px).
        gridTemplateColumns: "minmax(0, 1fr)",
        transition: `grid-template-rows ${transition}`,
      }}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "grid-template-rows") {
          finish();
        }
      }}
    >
      <div className={`min-h-0 min-w-0 ${settled ? "overflow-visible" : "overflow-hidden"}`}>
        <div
          className={`${gapClassName} motion-reduce:!transition-none`}
          style={{
            transform: expanded ? "translateY(0)" : "translateY(-8px)",
            transition: `transform ${transition}`,
          }}
        >
          {leadingGap ? <div aria-hidden="true" style={{ height: leadingGap }} /> : null}
          {contentClassName ? <div className={contentClassName}>{children}</div> : children}
        </div>
      </div>
    </div>
  );
}
