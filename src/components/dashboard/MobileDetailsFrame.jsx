"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import {
  buildEmbeddedDetailsHref,
  canonicalDetailsHref,
  EMBEDDED_DETAILS_MESSAGE,
  EMBEDDED_DETAILS_PREFIX,
} from "@/lib/navigation/embeddedDetails";

// `seed` (favorito/pendiente/puntuación, ya conocidos por el DetailModal de
// escritorio) solo se aplica en el PRIMER render de cada `href`: si llegara más
// tarde (todavía no había resuelto al montar), cambiar `src` para incorporarlo
// recargaría el documento entero por segunda vez -- justo el coste que se
// quiere evitar. Mejor abrir sin semilla esa vez que duplicar la carga.
export default function MobileDetailsFrame({ href, seed, title, onClose, onFrameReady }) {
  const frameRef = useRef(null);
  const router = useRouter();
  // Deliberadamente memoizado SOLO por `href`: si `seed` cambia (o llega tarde)
  // para el mismo `href`, no debe recalcularse, o `src` cambiaría y recargaría
  // el documento entero por segunda vez.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const src = useMemo(() => buildEmbeddedDetailsHref(href, seed), [href]);

  // `onFrameReady` se dispara UNA vez por `src`: con el mensaje "hero-ready"
  // que envía `DetailsClient` en cuanto pinta el póster del hero (señal
  // precisa), o -- red de seguridad -- pasado un margen tras el `load` nativo
  // del iframe, para que la previsualización nunca se quede pegada si esa
  // página no llega a montar `DetailsClient` (redirección de login, error...).
  const readyFiredRef = useRef(false);
  const readyTimeoutRef = useRef(null);
  useEffect(() => {
    readyFiredRef.current = false;
    if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current);
    return () => {
      if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current);
    };
  }, [src]);
  const fireReady = useCallback(() => {
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    onFrameReady?.();
  }, [onFrameReady]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== EMBEDDED_DETAILS_MESSAGE) return;
      if (event.data.action === "hero-ready") fireReady();
      if (event.data.action === "close") onClose();
      if (event.data.action === "list-changed") {
        window.dispatchEvent(new CustomEvent("showverse:list-changed", { detail: event.data.detail || {} }));
      }
      if (event.data.action === "navigate" && typeof event.data.href === "string") {
        const target = canonicalDetailsHref(event.data.href, window.location.origin);
        if (target.origin === window.location.origin) router.push(target.pathname + target.search + target.hash);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onClose, router, fireReady]);

  const onLoad = () => {
    readyTimeoutRef.current = setTimeout(fireReady, 2500);
    // También recoge las redirecciones completas (por ejemplo, iniciar sesión).
    try {
      const location = frameRef.current.contentWindow.location;
      if (location.origin !== window.location.origin || location.pathname.startsWith(EMBEDDED_DETAILS_PREFIX)) return;
      const target = canonicalDetailsHref(location.href, window.location.origin);
      router.replace(target.pathname + target.search + target.hash);
    } catch {
      // Un destino externo nunca se inspecciona ni se ejecuta en la página padre.
    }
  };

  return (
    <iframe
      ref={frameRef}
      title={`Ficha móvil: ${title || "Detalles"}`}
      src={src}
      onLoad={onLoad}
      className="h-full w-full border-0 bg-[#101010]"
      allow="fullscreen; clipboard-write; web-share"
    />
  );
}
