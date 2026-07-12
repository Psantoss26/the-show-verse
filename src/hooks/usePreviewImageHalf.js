"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Mide el ancho del panel de preview y devuelve la MITAD de la altura de su
// imagen backdrop (aspect-video 16:9 a ancho completo → alto = ancho·9/16).
//
// El consumidor lo usa para anclar el popover por la IMAGEN (no el panel entero):
//   ref={ref}
//   style={{ marginTop: -imgHalf, transformOrigin: `${horiz} ${imgHalf}px` }}
// El panel va con `top: 50%` (centro de la tarjeta); `marginTop: -imgHalf` lo
// sube media imagen, así el CENTRO de la imagen cae sobre el centro de la
// tarjeta y la info fluye debajo. El origen de la escala en `imgHalf px` hace que
// la apertura crezca desde ese mismo centro.
//
// Se usa solo donde el ancho es DINÁMICO (BackdropPreviewCard). Su motion.div NO
// es hijo directo de AnimatePresence, así que llevar ref aquí no dispara el aviso
// "Accessing element.ref" de React 19. Devuelve [ref, imgHalf].
export default function usePreviewImageHalf(active = true) {
  const ref = useRef(null);
  const [imgHalf, setImgHalf] = useState(0);

  useLayoutEffect(() => {
    if (!active) return undefined;
    const el = ref.current;
    if (!el) return undefined;

    const measure = () => {
      const width = el.offsetWidth;
      if (width) setImgHalf(Math.round((width * 9) / 16 / 2));
    };
    measure();

    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  return [ref, imgHalf];
}
