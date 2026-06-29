"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

// Devuelve `true` en cuanto el usuario hace SCROLL VERTICAL (o si la página ya
// está desplazada al montar, p. ej. al restaurar el scroll en una vuelta atrás).
//
// Se usa para que las filas/secciones de los dashboards permanezcan OCULTAS al
// cargar —aunque alguna asome por debajo del hero— y solo se revelen, con su
// animación de apertura, cuando se hace scroll y entran en la ventana. Se
// reinicia en cada montaje, así que una navegación nueva (con el scroll arriba)
// vuelve a empezar en `false`.
export function useHasScrolled(
  threshold = 4,
  { resetAtTop = false, enabled = true } = {},
) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;

    const onScroll = () => {
      const nextScrolled = window.scrollY > threshold;

      if (resetAtTop) {
        setScrolled((current) =>
          current === nextScrolled ? current : nextScrolled,
        );
        return;
      }

      if (nextScrolled) {
        setScrolled(true);
        window.removeEventListener("scroll", onScroll);
      }
    };

    onScroll();
    if (!resetAtTop && window.scrollY > threshold) return undefined;

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled, resetAtTop, threshold]);

  return scrolled;
}

// Props para una fila/sección de dashboard que debe REVELARSE con animación al
// entrar en la ventana, pero solo DESPUÉS de que el usuario haga scroll (así no
// se ve nada bajo el hero al cargar, aunque asome). Se aplica con `{...props}` a
// un motion.div que tenga `variants` (p. ej. fadeInUp).
//   - reduced motion → aparece sin animación.
//   - aún sin scroll → forzado a "hidden".
//   - tras hacer scroll → se revela vía whileInView al entrar en la ventana.
export function useScrollRevealProps(margin = "-80px") {
  const reduceMotion = useReducedMotion();
  const hasScrolled = useHasScrolled();

  if (reduceMotion) return { initial: false, animate: "visible" };
  if (!hasScrolled) return { initial: "hidden", animate: "hidden" };
  return {
    initial: "hidden",
    whileInView: "visible",
    viewport: { once: true, margin },
  };
}

// Variante exclusiva para la primera sección de cada dashboard. Al regresar al
// tope rearma su estado oculto, pero mantiene el componente montado y solo
// reproduce la entrada cuando vuelve a alcanzar el área visible.
export function useTopResetRevealProps(
  targetRef,
  margin = "-80px",
  enabled = true,
) {
  const reduceMotion = useReducedMotion();
  const hasScrolled = useHasScrolled(4, { resetAtTop: true, enabled });
  const isIntersectingRef = useRef(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined")
      return undefined;

    const target = targetRef.current;
    if (!target) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isIntersectingRef.current = entry.isIntersecting;
        if (entry.isIntersecting && window.scrollY > 4) setRevealed(true);
      },
      {
        rootMargin: `${margin} 0px`,
        threshold: 0.01,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, margin, targetRef]);

  useEffect(() => {
    if (!enabled) return;
    if (!hasScrolled) {
      setRevealed(false);
    } else if (isIntersectingRef.current) {
      setRevealed(true);
    }
  }, [enabled, hasScrolled]);

  if (!enabled) return null;
  if (reduceMotion) {
    return {
      initial: false,
      animate: { opacity: hasScrolled && revealed ? 1 : 0, y: 0 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: "hidden",
    animate: hasScrolled && revealed ? "visible" : "hidden",
  };
}
