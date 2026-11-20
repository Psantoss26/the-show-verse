"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isAndroidApp, notifyBackPainted } from "@/lib/android/appBridge";
import { popStateNeedsRouteCommit } from "@/lib/android/backPaintSignal";

// AVISO DE «PÁGINA ANTERIOR PINTADA» para la transición de atrás de la app de
// Android (android-companion/…/AtrasPredictivo.kt).
//
// Al volver atrás, la app pone encima una captura de la página que se va y
// llama a `goBack()`. Next tarda unos fotogramas en pintar la anterior (el
// `popstate` se procesa en una transición; con fichas superpuestas, revelar la
// pantalla oculta): si la captura saliera ya, debajo se vería la misma ficha
// duplicada o un estado intermedio. La app espera a este aviso, que llega dos
// fotogramas después del commit de la ruta de destino (el primero la pinta).
//
// Al montar también se avisa: una vuelta que carga un documento nuevo llega
// así, y la app sabe además que esta web manda el aviso (sin él espera poco).
// Fuera de la app no hace nada.

function afterPaint(fn) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(fn));
}

export default function AndroidBackPaintSignal() {
  const pathname = usePathname() || "/";
  const committedRef = useRef(pathname);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!isAndroidApp()) return undefined;
    const onPopState = () => {
      if (popStateNeedsRouteCommit(window.location.pathname, committedRef.current)) {
        pendingRef.current = true;
      } else {
        afterPaint(notifyBackPainted);
      }
    };
    window.addEventListener("popstate", onPopState);
    afterPaint(notifyBackPainted);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useLayoutEffect(() => {
    committedRef.current = pathname;
    if (!pendingRef.current) return;
    pendingRef.current = false;
    afterPaint(notifyBackPainted);
  }, [pathname]);

  return null;
}
