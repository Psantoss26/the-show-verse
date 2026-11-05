"use client";

// Desplazamiento de las filas de los dashboards en pantallas TÁCTILES.
//
// Antes cada fila movía su carril con el gesto de Swiper: JS en cada
// `touchmove`, el carril corría 1,5 veces más que el dedo (`touchRatio`) y la
// inercia la calculaba Swiper en el hilo principal. En un dashboard con
// decenas de filas y React renderizando a la vez, eso daba tirones y una
// sensación poco natural (el contenido se escapaba del dedo).
//
// En táctil usamos el desplazamiento NATIVO del navegador (`cssMode` de
// Swiper: el carril es un `overflow-x: auto`), como las filas de la web móvil
// de Netflix: el carril sigue al dedo 1:1, la inercia la pone el sistema en el
// compositor (no la frena un render) y el navegador decide solo si el gesto es
// horizontal (fila) o vertical (página). Sin imán entre tarjetas (`freeMode`).
//
// Con ratón/trackpad se mantiene el arrastre de Swiper de siempre.

import { useEffect, useState } from "react";

const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

/**
 * ¿El puntero principal es táctil? Empieza en `false` (igual que el servidor)
 * y se corrige en un efecto; así el cambio cae en el mismo render que el de
 * `useIsMobileLayout` y la fila no se remonta dos veces al hidratar.
 */
export function useTouchRowScroll() {
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(TOUCH_QUERY);
    const update = () => setTouch(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return touch;
}

/**
 * Props de desplazamiento para el `<Swiper>` de una fila.
 * - `nativeTouch`: resultado de `useTouchRowScroll()`.
 * - `isMobile`: layout estrecho (umbral/ratio del arrastre con ratón).
 *
 * `cssMode` no se puede cambiar en caliente: incluye `nativeTouch` en la `key`
 * del Swiper (con `rowSwiperKeySuffix`) y añade `rowSwiperTouchClass`.
 */
export function rowSwiperScrollProps(nativeTouch, isMobile) {
  if (nativeTouch) {
    return {
      cssMode: true,
      freeMode: { enabled: true },
      threshold: 0,
      touchRatio: 1,
    };
  }
  return {
    cssMode: false,
    freeMode: { enabled: true, momentum: true, momentumRatio: 0.55 },
    threshold: isMobile ? 2 : 5,
    touchRatio: isMobile ? 1.5 : 1,
  };
}

/** Clase extra del `<Swiper>` (overscroll contenido, ver globals.css). */
export const rowSwiperTouchClass = (nativeTouch) =>
  nativeTouch ? "sv-touch-row" : "";

export const rowSwiperKeySuffix = (nativeTouch) => (nativeTouch ? "-t" : "");
