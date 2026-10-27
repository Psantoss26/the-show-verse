"use client";

import { useEffect, useState } from "react";

const NOT_STUCK = { isSticky: false, isPinned: false };

/**
 * Reports whether a sticky toolbar has reached its computed `top` offset.
 *
 * - `isPinned`: está fijada, en CUALQUIER tamaño de pantalla. Es lo que activa
 *   el cristal del navbar sobre las superficies del menú (ver la regla
 *   `[data-menu-pinned="true"]` en globals.css).
 * - `isSticky`: está fijada Y la ventana es de móvil.
 * - `panelOverlay`: si el panel desplegable móvil (`MobileFiltersPanel`) va como
 *   overlay bajo la barra (`absolute top-full`) o en el flujo. Se decide AL
 *   ABRIRLO y no cambia mientras siga abierto o cerrándose: abierto con la barra
 *   ya fijada no empuja el contenido; abierto antes de fijarse sigue en el flujo
 *   al fijarse y el contenido pasa por debajo con el scroll normal. Antes se
 *   cambiaba a overlay justo al fijarse y el contenido de debajo subía de golpe
 *   la altura del panel (y bajaba de golpe al desfijarse).
 */
export default function useStickyToolbarState(toolbarRef, panelOpen = false) {
  const [state, setState] = useState(NOT_STUCK);
  const [panelOverlay, setPanelOverlay] = useState(false);
  const [panelWasOpen, setPanelWasOpen] = useState(panelOpen);

  // Ajuste durante el render (patrón de React para estado derivado de un
  // cambio de props): solo se toma la colocación en el instante de abrir.
  if (panelOpen !== panelWasOpen) {
    setPanelWasOpen(panelOpen);
    if (panelOpen && panelOverlay !== state.isSticky) setPanelOverlay(state.isSticky);
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mobileQuery = window.matchMedia("(max-width: 1023px)");
    let frameId = 0;

    const apply = (next) => {
      setState((current) =>
        current.isSticky === next.isSticky && current.isPinned === next.isPinned
          ? current
          : next,
      );
    };

    const measure = () => {
      const toolbar = toolbarRef.current;
      if (!toolbar) {
        apply(NOT_STUCK);
        return;
      }

      const topOffset = Number.parseFloat(window.getComputedStyle(toolbar).top);
      const isPinned =
        Number.isFinite(topOffset) &&
        toolbar.getBoundingClientRect().top <= topOffset + 1;

      apply({ isPinned, isSticky: isPinned && mobileQuery.matches });
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    const toolbar = toolbarRef.current;
    const resizeObserver =
      toolbar && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleMeasure)
        : null;

    resizeObserver?.observe(toolbar);
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    mobileQuery.addEventListener("change", scheduleMeasure);
    scheduleMeasure();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      mobileQuery.removeEventListener("change", scheduleMeasure);
    };
  }, [toolbarRef]);

  return { ...state, panelOverlay };
}
