"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useHydrationReady } from "@/lib/hooks/useHydrationReady";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import {
  resolveScrollRevealProps,
  resolveTopResetRevealProps,
} from "@/lib/motion/scrollRevealState";

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
//   - vuelta atrás/adelante → aparece sin animación (ver más abajo).
//   - aún sin scroll → forzado a "hidden".
//   - tras hacer scroll → se revela vía whileInView al entrar en la ventana.
export function useScrollRevealProps(margin = "-80px") {
  const reduceMotion = useReducedMotion();
  // Al VOLVER (atrás/adelante), el scroll se restaura ya desplazado: la fila
  // en la que el usuario hizo clic reaparece con la página YA posicionada
  // sobre ella (sin el gesto de scroll que normalmente cruza el margen de
  // `viewport`). `whileInView` + `once:true` solo evalúa la intersección
  // cuando arranca a observar: si en ESE instante la fila no cae del todo
  // dentro del margen reducido (-80px), nunca vuelve a comprobarlo -- el
  // título se queda oculto para siempre aunque las tarjetas (que no dependen
  // de esto) sí se vean. Se evita saltándose el gateo por scroll en este
  // montaje, igual que ya se hace en Historial/Favoritos.
  const isBackNav = useIsHistoryNavigation();
  const hasScrolled = useHasScrolled();
  const hydrationReady = useHydrationReady();

  return resolveScrollRevealProps({
    hydrationReady,
    reduceMotion: Boolean(reduceMotion),
    isBackNav,
    hasScrolled,
    margin,
  });
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
  // Al VOLVER (atrás/adelante) el scroll se restaura ya desplazado: si la
  // sección no cae dentro del margen del IntersectionObserver justo en ese
  // instante y el usuario no vuelve a hacer scroll, `revealed` se queda en
  // `false` para siempre (mismo problema que en `useScrollRevealProps`, ver
  // su comentario). Se salta el gateo por scroll en este montaje.
  const isBackNav = useIsHistoryNavigation();
  const hydrationReady = useHydrationReady();
  const hasScrolled = useHasScrolled(4, {
    resetAtTop: true,
    enabled: enabled && !isBackNav,
  });
  const isIntersectingRef = useRef(false);
  const [revealed, setRevealed] = useState(false);
  // ¿Cabe la sección de sobra SIN hacer scroll?
  //
  // Normalmente el hero ocupa casi toda la pantalla y de esta sección solo
  // asoma el borde: por eso se oculta hasta que el usuario hace scroll. Pero el
  // hero mide lo que su ANCHO (16:9), y cuando la página se estrecha —drawer de
  // la ficha acoplado, tablets en vertical— queda un hueco enorme debajo. Ahí
  // la sección no "asoma": ocupa media pantalla, y dejarla oculta dejaba esa
  // mitad vacía. Si lo que se ve de ella supera el umbral, se muestra ya.
  const [roomyFold, setRoomyFold] = useState(false);

  useEffect(() => {
    if (!enabled || isBackNav || typeof IntersectionObserver === "undefined")
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
  }, [enabled, isBackNav, margin, targetRef]);

  useEffect(() => {
    if (!enabled || isBackNav || typeof IntersectionObserver === "undefined")
      return undefined;
    const target = targetRef.current;
    if (!target || typeof window === "undefined") return undefined;

    let observer = null;
    const observe = () => {
      observer?.disconnect();
      // Hueco mínimo para considerarlo "mucho espacio": 200px o la cuarta
      // parte de la pantalla, lo que sea mayor. Un asomo de 60-120px (lo
      // habitual con el hero a pantalla casi completa) no llega.
      const fold = Math.round(Math.max(200, window.innerHeight * 0.25));
      observer = new IntersectionObserver(
        ([entry]) => setRoomyFold(entry.isIntersecting),
        { rootMargin: `0px 0px -${fold}px 0px`, threshold: 0 },
      );
      observer.observe(target);
    };
    observe();
    // El umbral depende del alto de la ventana; la posición de la sección la
    // sigue el propio observador (también cuando el hero cambia de alto al
    // acoplar o cerrar el drawer).
    window.addEventListener("resize", observe);
    return () => {
      window.removeEventListener("resize", observe);
      observer?.disconnect();
    };
  }, [enabled, isBackNav, targetRef]);

  useEffect(() => {
    if (!enabled || isBackNav) return;
    if (!hasScrolled) {
      setRevealed(false);
    } else if (isIntersectingRef.current) {
      setRevealed(true);
    }
  }, [enabled, isBackNav, hasScrolled]);

  return resolveTopResetRevealProps({
    enabled,
    hydrationReady,
    reduceMotion: Boolean(reduceMotion),
    isBackNav,
    // Con hueco de sobra bajo el hero, la sección cuenta como alcanzada.
    hasScrolled: hasScrolled || roomyFold,
    revealed: revealed || roomyFold,
  });
}
