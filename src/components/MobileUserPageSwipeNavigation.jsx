"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getMobileUserPageSwipeDestination,
  MOBILE_USER_PAGE_SWIPE_IGNORE_SELECTOR,
} from "@/lib/navigation/mobileUserPageSwipe";

function preservesNestedGesture(target) {
  return (
    target instanceof Element &&
    Boolean(target.closest(MOBILE_USER_PAGE_SWIPE_IGNORE_SELECTOR))
  );
}

/**
 * Permite recorrer las vistas personales de la barra inferior sin convertir
 * cada página en un carrusel. Replica la captura táctil del Perfil: se puede
 * empezar en cualquier zona de la pantalla y solo las superficies que tienen
 * un gesto horizontal propio conservan prioridad.
 */
export default function MobileUserPageSwipeNavigation({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const navigatingToRef = useRef(null);
  const pageSwipe = useRef(null);
  const hasAdjacentPage = Boolean(
    getMobileUserPageSwipeDestination(pathname, "left") ||
      getMobileUserPageSwipeDestination(pathname, "right"),
  );

  useEffect(() => {
    navigatingToRef.current = null;
  }, [pathname]);

  const navigate = useCallback(
    (direction) => {
      const destination = getMobileUserPageSwipeDestination(pathname, direction);
      if (!destination || navigatingToRef.current) return;

      navigatingToRef.current = destination;
      router.prefetch(destination);
      router.push(destination);
    },
    [pathname, router],
  );

  const handleTouchStart = useCallback((event) => {
    // Mismo límite que el Perfil: solo teléfonos. Los layouts de tabletas y
    // escritorio conservan sus propios desplazamientos horizontales.
    if (window.matchMedia("(min-width: 640px)").matches || event.touches.length !== 1) {
      pageSwipe.current = null;
      return;
    }

    pageSwipe.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      preservesNestedGesture: preservesNestedGesture(event.target),
    };
  }, []);

  const handleTouchEnd = useCallback(
    (event) => {
      const gesture = pageSwipe.current;
      pageSwipe.current = null;
      if (
        !gesture ||
        gesture.preservesNestedGesture ||
        event.changedTouches.length !== 1
      ) {
        return;
      }

      const deltaX = event.changedTouches[0].clientX - gesture.x;
      const deltaY = event.changedTouches[0].clientY - gesture.y;
      // Umbral y proporción idénticos a Perfil: evita confundir un scroll
      // vertical, pero permite cambiar de sección desde toda la superficie.
      if (Math.abs(deltaX) < 64 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) {
        return;
      }

      navigate(deltaX < 0 ? "left" : "right");
    },
    [navigate],
  );

  const swipeHandlers = hasAdjacentPage
    ? {
        onTouchStartCapture: handleTouchStart,
        onTouchEndCapture: handleTouchEnd,
        onTouchCancelCapture: () => {
          pageSwipe.current = null;
        },
      }
    : {};

  return (
    <div className="min-h-screen" {...swipeHandlers} data-mobile-user-page-swipe>
      {children}
    </div>
  );
}
