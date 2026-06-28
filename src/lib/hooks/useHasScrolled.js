"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

// Devuelve `true` en cuanto el usuario hace SCROLL VERTICAL (o si la página ya
// está desplazada al montar, p. ej. al restaurar el scroll en una vuelta atrás).
//
// Se usa para que las filas/secciones de los dashboards permanezcan OCULTAS al
// cargar —aunque alguna asome por debajo del hero— y solo se revelen, con su
// animación de apertura, cuando se hace scroll y entran en la ventana. Se
// reinicia en cada montaje, así que una navegación nueva (con el scroll arriba)
// vuelve a empezar en `false`.
export function useHasScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (window.scrollY > threshold) {
      setScrolled(true);
      return undefined;
    }
    const onScroll = () => {
      if (window.scrollY > threshold) {
        setScrolled(true);
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

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
