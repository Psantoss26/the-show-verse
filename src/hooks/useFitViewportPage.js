"use client";

import { useLayoutEffect } from "react";

/**
 * La página solo se desplaza si su contenido no cabe en pantalla.
 *
 * El layout raíz da al contenedor de las páginas `min-h-[100svh]` (fondo y
 * restauración del scroll al retroceder), pero la barra superior es `sticky` y
 * ocupa su propio alto en el flujo: el documento mide como mínimo 100svh + la
 * barra, así que hasta una página corta se podía arrastrar. Mientras la página
 * que usa este hook está montada, `html[data-fit-viewport]` (globals.css)
 * descuenta la barra de ese mínimo. Solo para rutas con la barra de 64px (las
 * fichas nacen compactas y no lo usan).
 */
export default function useFitViewportPage() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-fit-viewport", "");
    return () => root.removeAttribute("data-fit-viewport");
  }, []);
}
