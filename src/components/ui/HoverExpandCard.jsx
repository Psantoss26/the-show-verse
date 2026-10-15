"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import styles from "./HoverExpandCard.module.css";
import { applyTmdbResponsiveImage } from "@/lib/ui/tmdbResponsiveImage";
import {
  isDrawerResizeActive,
  onDrawerResize,
} from "@/lib/ui/drawerResizeEvents";

// Tarjeta de póster que se AMPLÍA al pasar el ratón: nítida y sin vibrar.
//
// Dos problemas que resolver a la vez:
//
// 1. NITIDEZ. Ampliar con `transform: scale(1.15)` dejaba en manos del
//    navegador volver a pintar la tarjeta a su nuevo tamaño, y Chrome no
//    siempre lo hacía (p. ej. con el indicador de cristal, que lleva
//    `backdrop-filter` y `will-change`): el póster quedaba pintado pequeño y
//    ESTIRADO, borroso.
// 2. FLUIDEZ. Animar el tamaño real (`inset`) lo arreglaba, pero en cada
//    fotograma la tarjeta se volvía a maquetar con tamaños de subpíxel que se
//    redondean distinto en cada paso: la imagen vibraba y se deformaba un poco
//    hasta quedarse quieta.
//
// Solución (FLIP): al entrar, la tarjeta toma DE GOLPE su tamaño ampliado real
// (un 15% más grande), así que el póster se pinta ya a ese
// tamaño. En el mismo instante se reduce con la escala inversa para que no se
// note el salto, y solo se anima esa transformación hasta 1. Transformar no
// vuelve a maquetar (no vibra) y se REDUCE una imagen pintada en grande (no se
// ve borrosa). Al salir se hace lo inverso: se anima la transformación de
// vuelta al tamaño original y, al terminar, la tarjeta recupera su tamaño.
//
// SIN SALTO AL TERMINAR. Dos detalles hacían que la imagen "cambiara" un poco
// en el último fotograma:
//   - `inset: -7.5%` daba posiciones con decimales (13,725px en una tarjeta de
//     183px). Durante la animación la tarjeta se pinta en una capa aparte con
//     precisión de subpíxel; al terminar se ajustaba a la rejilla de píxeles y
//     se desplazaba o afinaba un poco. Ahora el crecimiento se calcula en
//     PÍXELES ENTEROS por lado, y la escala inicial se ajusta a ellos en cada
//     eje, así que el arranque sigue siendo exacto.
//   - Al acabar la transición la tarjeta dejaba su capa y volvía a pintarse
//     con el resto de la página, de otra forma (y en reposo se veía algo más
//     blanda que ampliada). Ahora está SIEMPRE en su propia capa donde hay
//     hover (`will-change: transform`, ver el CSS module): reposo, animación y
//     ampliada se pintan igual.
//
// MISMA NITIDEZ EN REPOSO Y AMPLIADA. Los pósteres de TMDb de la tarjeta se
// piden con `srcset` + `sizes` al ancho de la tarjeta AMPLIADA: el navegador
// descarga el tamaño de TMDb justo por encima (p. ej. `w342` en pantallas 1x),
// en vez de uno enorme que tenía que reducir más de 4 veces y dejaba el texto
// del póster blando. Ver `tmdbResponsiveImage.js`.
//
// Solo con ratón: en táctil no hay hover. Con «reducir movimiento», sin
// animación.
//
// Props:
//   cellClassName: clases de la CELDA (su proporción, p. ej. `aspect-[2/3]`).
//   className:     clases de la TARJETA visible (fondo, bordes, `group`…).
//   enabled:       sin ampliación cuando es `false`.
//   zIndex:        capa de la tarjeta ampliada (por defecto 100).
//   as:            etiqueta de la tarjeta (`div` por defecto).

const EXPAND = 1.15;
const DURATION_MS = 360;
// Leve rebote, como el muelle que tenía la versión con Framer Motion.
const EASING = "cubic-bezier(0.34, 1.25, 0.64, 1)";

// Crecimiento en píxeles ENTEROS por lado, a partir del tamaño real de la celda,
// y la escala que devuelve la tarjeta ampliada al tamaño exacto de la celda.
function measureExpansion(el) {
  const cell = el.parentElement;
  const width = cell?.offsetWidth || el.offsetWidth;
  const height = cell?.offsetHeight || el.offsetHeight;
  const dx = Math.round((width * (EXPAND - 1)) / 2);
  const dy = Math.round((height * (EXPAND - 1)) / 2);
  return {
    inset: `${-dy}px ${-dx}px`,
    shrunk: `scale(${width / (width + 2 * dx)}, ${height / (height + 2 * dy)})`,
  };
}

function canHover() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover) and (pointer: fine)").matches
  );
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function stopFixedSizeSync(frameRef) {
  if (frameRef.current) {
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }
}

function syncFixedSizeChildren(el, frameRef, duration) {
  if (!el) return;
  stopFixedSizeSync(frameRef);
  // Solo las tarjetas que los llevan (el Historial): `getComputedStyle` en cada
  // fotograma fuerza el estilo de la página, y tras volver de una ficha (estilo
  // de toda la página pendiente) cada hover costaba cientos de ms.
  if (!el.querySelector("[data-hover-expand-fixed-size]")) return;
  const startedAt = performance.now();

  const sync = (now) => {
    const transform = getComputedStyle(el).transform;
    const matrix = transform === "none"
      ? new DOMMatrixReadOnly()
      : new DOMMatrixReadOnly(transform);
    const scaleX = Math.hypot(matrix.a, matrix.b) || 1;
    const scaleY = Math.hypot(matrix.c, matrix.d) || 1;
    el.querySelectorAll("[data-hover-expand-fixed-size]").forEach((child) => {
      child.style.scale = `${1 / scaleX} ${1 / scaleY}`;
    });

    if (now - startedAt < duration) {
      frameRef.current = window.requestAnimationFrame(sync);
    } else {
      frameRef.current = null;
    }
  };

  frameRef.current = window.requestAnimationFrame(sync);
}

export default function HoverExpandCard({
  as: Tag = "div",
  cellClassName = "",
  className = "",
  enabled = true,
  zIndex,
  style,
  onPointerEnter,
  onPointerLeave,
  children,
  ...props
}) {
  const cardRef = useRef(null);
  // Cada gesto invalida el cierre pendiente del anterior (entrar de nuevo a
  // mitad de la salida no debe acabar encogiendo la tarjeta).
  const gestureRef = useRef(0);
  const leaveTimerRef = useRef(null);
  const fixedSizeFrameRef = useRef(null);
  // Escala "encogida" del gesto en curso (la que iguala la celda).
  const shrunkRef = useRef("none");

  const clearLeaveTimer = () => {
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  // Algunos overlays (p. ej. el contador de episodios agrupados) deben
  // conservar su tamaño visual mientras la tarjeta ejecuta el FLIP. Se
  // compensa solo la escala heredada; la posición sigue acompañando a la
  // esquina de la tarjeta ampliada.
  useEffect(() => () => {
    clearLeaveTimer();
    stopFixedSizeSync(fixedSizeFrameRef);
  }, []);

  // AL OCULTARSE LA PÁGINA, A REPOSO. Pulsar la tarjeta abre la ficha y la
  // página queda oculta debajo (<Activity>, ver OverlayRouteHost): el puntero
  // ya no puede salir de la tarjeta, así que nunca llegaba `pointerleave` y al
  // volver seguía ampliada hasta mover el ratón. La limpieza de un efecto de
  // layout corre justo al ocultarse (y al desmontar), antes de pintar.
  useLayoutEffect(() => () => {
    const el = cardRef.current;
    if (!el) return;
    gestureRef.current += 1;
    clearLeaveTimer();
    el.style.transition = "none";
    el.style.transform = "";
    el.style.inset = "";
    el.classList.remove(styles.expanded);
  }, []);

  const expand = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    gestureRef.current += 1;
    clearLeaveTimer();

    const wasExpanded = el.classList.contains(styles.expanded);
    if (!wasExpanded) {
      const { inset, shrunk } = measureExpansion(el);
      shrunkRef.current = shrunk;
      el.style.transition = "none";
      el.style.inset = inset;
      el.classList.add(styles.expanded);
      if (prefersReducedMotion()) {
        el.style.transform = "";
        return;
      }
      // Tamaño final YA, compensado con la escala inversa: visualmente la
      // tarjeta sigue igual y el póster ya está pintado a tamaño ampliado.
      el.style.transform = shrunk;
      // Fuerza a aplicar ese estado antes de arrancar la transición.
      void el.offsetWidth;
    } else if (prefersReducedMotion()) {
      return;
    }
    el.style.transition = `transform ${DURATION_MS}ms ${EASING}`;
    el.style.transform = "";
    syncFixedSizeChildren(el, fixedSizeFrameRef, DURATION_MS + 50);
  }, []);

  const collapse = useCallback(() => {
    const el = cardRef.current;
    if (!el || !el.classList.contains(styles.expanded)) return;
    const gesture = (gestureRef.current += 1);

    const finish = () => {
      if (gestureRef.current !== gesture) return;
      clearLeaveTimer();
      el.style.transition = "none";
      el.classList.remove(styles.expanded);
      el.style.inset = "";
      el.style.transform = "";
    };

    if (prefersReducedMotion()) {
      finish();
      return;
    }

    el.style.transition = `transform ${Math.round(DURATION_MS * 0.8)}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    el.style.transform = shrunkRef.current;
    syncFixedSizeChildren(
      el,
      fixedSizeFrameRef,
      Math.round(DURATION_MS * 0.8) + 50,
    );
    // Al terminar la animación la tarjeta recupera su tamaño normal. Con un
    // temporizador y no con `transitionend`, que no llega si la transición se
    // interrumpe o no llega a arrancar.
    leaveTimerRef.current = window.setTimeout(finish, Math.round(DURATION_MS * 0.8) + 40);
  }, []);

  const handlePointerEnter = (event) => {
    onPointerEnter?.(event);
    if (!enabled || event.pointerType !== "mouse" || !canHover()) return;
    expand();
  };

  const handlePointerLeave = (event) => {
    onPointerLeave?.(event);
    if (!enabled) return;
    collapse();
  };

  // Pósteres al tamaño justo (ver la nota de arriba). Se aplica cuando aparece
  // una imagen, cuando cambia de `src` y cuando cambia el ancho de la celda.
  useEffect(() => {
    const card = cardRef.current;
    const cell = card?.parentElement;
    if (!card || !cell) return undefined;

    let frame = 0;
    // Arrastrando el tirador del panel lateral acoplado, TODAS las tarjetas de
    // la página cambian de tamaño en cada fotograma. Se espera al final del
    // gesto: una sola pasada con el ancho definitivo en vez de un rAF por
    // tarjeta y fotograma.
    let deferred = false;
    const update = () => {
      frame = 0;
      if (isDrawerResizeActive()) {
        deferred = true;
        return;
      }
      deferred = false;
      const width = cell.offsetWidth * (enabled ? EXPAND : 1);
      card.querySelectorAll("img").forEach((img) => {
        applyTmdbResponsiveImage(img, width);
      });
    };
    const schedule = () => {
      if (isDrawerResizeActive()) {
        deferred = true;
        return;
      }
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const stopDrawerResize = onDrawerResize((active) => {
      if (!active && deferred) schedule();
    });

    update();
    // Solo `src`: `srcset` y `sizes` los escribe `update`, y observarlos
    // provocaría un bucle.
    const mutations = new MutationObserver(schedule);
    mutations.observe(card, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });
    const resize =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    resize?.observe(cell);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      mutations.disconnect();
      resize?.disconnect();
      stopDrawerResize();
    };
  }, [enabled]);

  // Si se desactiva con la tarjeta ampliada, vuelve a su tamaño sin animar.
  useEffect(() => {
    if (enabled) return;
    const el = cardRef.current;
    if (!el) return;
    gestureRef.current += 1;
    clearLeaveTimer();
    el.style.transition = "none";
    el.style.transform = "";
    el.style.inset = "";
    el.classList.remove(styles.expanded);
  }, [enabled]);

  return (
    <div className={`relative ${cellClassName}`}>
      <Tag
        ref={cardRef}
        className={`absolute inset-0 ${enabled ? styles.expand : ""} ${className}`}
        style={
          zIndex != null
            ? { ...style, "--sv-hover-expand-z": zIndex }
            : style
        }
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        {...props}
      >
        {children}
      </Tag>
    </div>
  );
}
