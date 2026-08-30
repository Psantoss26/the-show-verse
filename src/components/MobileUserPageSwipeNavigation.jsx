"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getMobileUserPageSwipeDestination,
  isMobileUserPageSwipeRoute,
  MOBILE_USER_PAGE_SWIPE_IGNORE_SELECTOR,
} from "@/lib/navigation/mobileUserPageSwipe";
import {
  getUserDetailsSequence,
  saveUserDetailsSequenceFromLink,
} from "@/lib/navigation/userDetailsSequence";

function preservesNestedGesture(target) {
  return (
    target instanceof Element &&
    Boolean(target.closest(MOBILE_USER_PAGE_SWIPE_IGNORE_SELECTOR))
  );
}

function getSwipeDestination(pathname, direction) {
  const pageDestination = getMobileUserPageSwipeDestination(pathname, direction);
  if (pageDestination) return pageDestination;

  // Las fichas no forman parte del orden fijo del navbar, pero al venir de una
  // página de usuario sí tienen una secuencia persistida con el mismo contrato
  // izquierda = siguiente, derecha = anterior.
  const detailsSequence = getUserDetailsSequence(pathname);
  return direction === "left"
    ? detailsSequence?.next || null
    : direction === "right"
      ? detailsSequence?.previous || null
      : null;
}

function isDetailsInitialHeroVisible() {
  const secondaryTrigger = document.querySelector(
    "[data-details-mobile-secondary-trigger]",
  );
  if (!secondaryTrigger) return false;

  // Es el mismo umbral que DetailsClient usa para revelar el marcador y las
  // pestañas. Hasta entonces la portada sigue siendo la superficie principal;
  // al cruzarlo, el gesto horizontal pertenece a las secciones de contenido.
  return secondaryTrigger.getBoundingClientRect().top >= window.innerHeight - 88;
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
    getSwipeDestination(pathname, "left") ||
      getSwipeDestination(pathname, "right"),
  );

  useEffect(() => {
    navigatingToRef.current = null;
  }, [pathname]);

  const navigate = useCallback(
    (direction) => {
      const destination = getSwipeDestination(pathname, direction);
      if (!destination || navigatingToRef.current) return;

      navigatingToRef.current = destination;
      router.prefetch(destination);
      router.push(destination);
    },
    [pathname, router],
  );

  // La navegación entre títulos necesita la lista ordenada de la página desde
  // la que se abrió la ficha. Perfil ya tiene un ámbito propio; las páginas
  // personales del navbar no, así que la capturamos aquí antes de que Link o
  // una preview cambien de ruta.
  const captureDetailsSequence = useCallback(
    (event) => {
      if (!isMobileUserPageSwipeRoute(pathname)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      saveUserDetailsSequenceFromLink(
        target.closest('a[href^="/details/"]'),
        event.currentTarget,
      );
    },
    [pathname],
  );

  const handleTouchStart = useCallback((event) => {
    // Mismo límite que el Perfil: solo teléfonos. Los layouts de tabletas y
    // escritorio conservan sus propios desplazamientos horizontales.
    if (
      window.matchMedia("(min-width: 640px)").matches ||
      event.touches.length !== 1 ||
      (getUserDetailsSequence(pathname) && !isDetailsInitialHeroVisible())
    ) {
      pageSwipe.current = null;
      return;
    }

    pageSwipe.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      preservesNestedGesture: preservesNestedGesture(event.target),
    };
  }, [pathname]);

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
    <div
      className="min-h-screen"
      {...swipeHandlers}
      onClickCapture={captureDetailsSequence}
      data-mobile-user-page-swipe
    >
      {children}
    </div>
  );
}
