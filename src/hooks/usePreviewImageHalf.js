"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Ancla vertical de los popovers de vista previa del dashboard.
//
// Mide el ancho del panel de preview y devuelve la MITAD de la altura de su
// imagen backdrop (aspect-video 16:9 a ancho completo → alto = ancho·9/16).
//
// Con ese valor, el consumidor posiciona el popover para que la IMAGEN (no el
// panel entero) quede centrada sobre la tarjeta inicial:
//   style={{ marginTop: -imgHalf, transformOrigin: `${horiz} ${imgHalf}px` }}
// El panel va con `top: 50%` (centro de la tarjeta); `marginTop: -imgHalf` lo
// sube media imagen, así el CENTRO de la imagen cae sobre el centro de la
// tarjeta y la info fluye debajo. El transform-origin en `imgHalf px` hace que
// la escala de apertura crezca desde ese mismo centro (sensación de que la
// tarjeta inicial se amplía).
//
// Vale para anchos fijos y dinámicos (mide el real). Devuelve [ref, imgHalf].
// `externalRef` permite reutilizar un ref que el panel ya tenga (p. ej. cuando
// el motion.div ya usa un ref para otra cosa: no se pueden poner dos refs).
export default function usePreviewImageHalf(active = true, externalRef = null) {
  const internalRef = useRef(null);
  const ref = externalRef || internalRef;
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
