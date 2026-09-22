"use client";

import { useCallback, useEffect, useRef } from "react";
import styles from "./HoverExpandCard.module.css";

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
// (`inset: -7.5%`, un 15% más grande), así que el póster se pinta ya a ese
// tamaño. En el mismo instante se reduce con `scale(1/1.15)` para que no se
// note el salto, y solo se anima esa transformación hasta 1. Transformar no
// vuelve a maquetar (no vibra) y se REDUCE una imagen pintada en grande (no se
// ve borrosa). Al salir se hace lo inverso: se anima la transformación de
// vuelta al tamaño original y, al terminar, la tarjeta recupera su tamaño.
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
const SHRUNK = `scale(${1 / EXPAND})`;
const DURATION_MS = 360;
// Leve rebote, como el muelle que tenía la versión con Framer Motion.
const EASING = "cubic-bezier(0.34, 1.25, 0.64, 1)";

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

  const clearLeaveTimer = () => {
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  useEffect(() => () => clearLeaveTimer(), []);

  const expand = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    gestureRef.current += 1;
    clearLeaveTimer();

    if (prefersReducedMotion()) {
      el.style.transition = "none";
      el.style.transform = "";
      el.classList.add(styles.expanded);
      return;
    }

    const wasExpanded = el.classList.contains(styles.expanded);
    if (!wasExpanded) {
      // Tamaño final YA, compensado con la escala inversa: visualmente la
      // tarjeta sigue igual y el póster ya está pintado a tamaño ampliado.
      el.style.transition = "none";
      el.classList.add(styles.expanded);
      el.style.transform = SHRUNK;
      // Fuerza a aplicar ese estado antes de arrancar la transición.
      void el.offsetWidth;
    }
    el.style.transition = `transform ${DURATION_MS}ms ${EASING}`;
    el.style.transform = "";
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
      el.style.transform = "";
    };

    if (prefersReducedMotion()) {
      finish();
      return;
    }

    el.style.transition = `transform ${Math.round(DURATION_MS * 0.8)}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    el.style.transform = SHRUNK;
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

  // Si se desactiva con la tarjeta ampliada, vuelve a su tamaño sin animar.
  useEffect(() => {
    if (enabled) return;
    const el = cardRef.current;
    if (!el) return;
    gestureRef.current += 1;
    clearLeaveTimer();
    el.style.transition = "none";
    el.style.transform = "";
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
