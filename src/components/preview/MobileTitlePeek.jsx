"use client";

// /src/components/preview/MobileTitlePeek.jsx
// VISTA PREVIA DE PULSACIÓN LARGA en el móvil, para toda la app.
//
// Mantener el dedo sobre la tarjeta de un título (cualquier enlace a su ficha o
// cualquier tarjeta de un dashboard marcada con `data-sv-peek`, ver
// lib/navigation/titlePeek) o de una temporada (preview/SeasonPeek) abre encima de la página, con el fondo difuminado,
// una tarjeta flotante con la portada y su logo, la fila de botones y el
// marcador. La tarjeta crece desde la que se ha pulsado y vuelve a ella al
// cerrarse. Es la ficha rápida (DetailModal) en su modo `peek`: los botones
// son los mismos y abren los mismos modales.
//
// Se monta una sola vez en el layout raíz y escucha en el documento, así que
// las páginas no tienen que hacer nada para tenerla.
//
// El gesto:
//   - Solo pantallas de móvil táctiles (`max-width: 767px` y puntero grueso).
//   - Hay que mantener el dedo TITLE_PEEK_HOLD_MS sin moverlo más de
//     TITLE_PEEK_MOVE_TOLERANCE px: desplazar la página o un carrusel lo cancela.
//   - Mientras se mantiene, la tarjeta se hunde un poco (ver `pressTarget`).
//   - El menú del sistema para enlaces e imágenes no llega a abrirse
//     (`contextmenu`); si el navegador lo dispara antes que el temporizador,
//     es la propia señal de pulsación larga y la vista previa se abre ya.
//   - Al soltar no se sigue el enlace ni se abre la ficha: el clic que el
//     navegador sintetiza se descarta.
//
// Ir a la ficha (tocar la portada): la vista previa NO se cierra. Se navega y
// se queda tal cual encima mientras la ficha carga; cuando la ficha está en
// pantalla (ya sin su pantalla de carga) se retira de golpe, sin animación de
// salida, y ya no vuelve a verse: tampoco al volver atrás.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";

import { useRouter } from "@/lib/offline/useOfflineRouter";

import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import useModalGuard from "@/hooks/useModalGuard";
import {
  TITLE_PEEK_ATTR,
  TITLE_PEEK_HOLD_MS,
  TITLE_PEEK_SELECTOR,
  exceedsPeekMoveTolerance,
  titlePeekItemFromAttr,
  titlePeekItemFromHref,
} from "@/lib/navigation/titlePeek.mjs";

const loadDetailModal = () => import("@/components/dashboard/DetailModal");
// La ficha rápida es grande: solo se descarga cuando alguien empieza una
// pulsación sobre un título (ver `onTouchStart`), no con cada página.
const DetailModal = dynamic(loadDetailModal, { ssr: false });
// Las temporadas (sección Temporadas de la ficha de una serie) tienen su
// propia vista previa, con lo de arriba de la ficha de la temporada.
const loadSeasonPeek = () => import("@/components/preview/SeasonPeek");
const SeasonPeek = dynamic(loadSeasonPeek, { ssr: false });

// Tras soltar el dedo, cuánto dura el descarte del clic sintetizado (ms).
const CLICK_SUPPRESS_MS = 700;
// Si la ficha no llega a abrirse en este tiempo, la vista previa se retira
// igualmente (ms).
const LEAVE_MAX_WAIT_MS = 10000;

// ¿Está ya la ficha de `href` en pantalla? Su ruta es la de la URL y no queda a
// la vista ninguna pantalla de carga de ficha (`details/loading.jsx`). Las
// pantallas ocultas de la pila de navegación (OverlayRouteHost) no cuentan:
// están en `display: none` y no tienen cajas.
function detailsShown(href) {
  if (window.location.pathname !== new URL(href, window.location.origin).pathname) {
    return false;
  }
  const loading = document.querySelectorAll('[data-details-root][aria-busy="true"]');
  for (const node of loading) {
    if (node.getClientRects().length > 0) return false;
  }
  return true;
}

function resolvePeekTarget(node) {
  const target = node?.closest?.(TITLE_PEEK_SELECTOR);
  if (!target || target.closest("[data-sv-no-peek]")) return null;
  const item = target.hasAttribute(TITLE_PEEK_ATTR)
    ? titlePeekItemFromAttr(target.getAttribute(TITLE_PEEK_ATTR))
    : titlePeekItemFromHref(target.getAttribute("href"), window.location.origin);
  return item ? { target, item } : null;
}

export default function MobileTitlePeek() {
  const canPeek = useMediaQuery(
    "(max-width: 767px) and (hover: none) and (pointer: coarse)",
  );
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const pathname = usePathname();
  const router = useRouter();
  const [peek, setPeek] = useState(null);
  const [portalReady, setPortalReady] = useState(false);
  // Cambiarla monta un AnimatePresence nuevo: la vista previa desaparece al
  // instante, sin su animación de salida.
  const [presenceKey, setPresenceKey] = useState(0);

  const close = useCallback(() => setPeek(null), []);
  const removeInstantly = useCallback(() => {
    setPresenceKey((key) => key + 1);
    setPeek(null);
  }, []);
  // Mientras se va a la ficha la página ya no es de la vista previa: ni
  // bloqueo del scroll ni Escape.
  useModalGuard({ open: !!peek && !peek.leavingTo, onClose: close });

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const leavingRef = useRef(null);
  const openFull = useCallback(
    (href) => {
      // Un segundo toque en la portada mientras se navega no hace nada.
      if (leavingRef.current) return;
      leavingRef.current = href;
      setPeek((current) =>
        current && !current.leavingTo ? { ...current, leavingTo: href } : current,
      );
      router.push(href);
    },
    [router],
  );

  // Cambiar de página la cierra, salvo cuando es la ida a la ficha desde la
  // propia vista previa: entonces la ruta cambia ya con la pantalla de carga y
  // la vista previa tiene que seguir encima hasta que llegue la ficha.
  useEffect(() => {
    leavingRef.current = peek?.leavingTo || null;
  }, [peek]);
  useEffect(() => {
    if (
      leavingRef.current &&
      new URL(leavingRef.current, window.location.origin).pathname === pathname
    ) {
      return;
    }
    setPeek(null);
  }, [pathname]);

  // Ida a la ficha: se retira cuando la ficha ya está en pantalla y se ha
  // pintado al menos un fotograma con ella debajo.
  const leavingTo = peek?.leavingTo || null;
  useEffect(() => {
    if (!leavingTo) return undefined;
    let frame = 0;
    let cancelled = false;
    const startedAt = performance.now();
    const check = () => {
      if (cancelled) return;
      if (
        detailsShown(leavingTo) ||
        performance.now() - startedAt > LEAVE_MAX_WAIT_MS
      ) {
        frame = window.requestAnimationFrame(() => {
          frame = window.requestAnimationFrame(() => {
            if (!cancelled) removeInstantly();
          });
        });
        return;
      }
      frame = window.requestAnimationFrame(check);
    };
    frame = window.requestAnimationFrame(check);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [leavingTo, removeInstantly]);

  // Estado del gesto en curso. En un ref: cambia en cada `touchmove` y no debe
  // re-renderizar nada.
  const gestureRef = useRef(null);
  const suppressClickUntilRef = useRef(0);
  const peekOpenRef = useRef(false);
  useEffect(() => {
    peekOpenRef.current = !!peek;
  }, [peek]);

  useEffect(() => {
    if (!canPeek) return undefined;

    const releasePress = (gesture) => {
      const animation = gesture?.pressAnimation;
      if (!animation) return;
      gesture.pressAnimation = null;
      // De vuelta a su tamaño con la misma curva; si ya se abrió la vista
      // previa, la tarjeta queda tapada por el fondo y basta con soltarla.
      if (gesture.fired) {
        animation.cancel();
        return;
      }
      animation.reverse();
      animation.finished.then(() => animation.cancel()).catch(() => {});
    };

    const cancelGesture = () => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      window.clearTimeout(gesture.timer);
      releasePress(gesture);
      gestureRef.current = null;
      // El dedo se ha levantado (o el sistema ha cortado el toque) con la
      // vista previa ya abierta: el clic rezagado sigue sin valer.
      if (gesture.fired) {
        suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;
      }
    };

    const fire = () => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.fired) return;
      window.clearTimeout(gesture.timer);
      gesture.fired = true;
      const rect = gesture.target.getBoundingClientRect();
      releasePress(gesture);
      // Mientras el dedo siga apoyado no hay clic que dejar pasar.
      suppressClickUntilRef.current = Number.POSITIVE_INFINITY;
      try {
        navigator.vibrate?.(10);
      } catch {
        // Sin vibración (iOS, permisos): no pasa nada.
      }
      setPeek({
        key: `${gesture.item.media_type}:${gesture.item.id}:${Date.now()}`,
        item: gesture.item,
        origin: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      });
    };

    const onTouchStart = (event) => {
      cancelGesture();
      if (peekOpenRef.current || event.touches.length !== 1) return;
      const resolved = resolvePeekTarget(event.target);
      if (!resolved) return;
      if (resolved.item.media_type === "season") loadSeasonPeek();
      else loadDetailModal();
      const touch = event.touches[0];
      const gesture = {
        ...resolved,
        start: { x: touch.clientX, y: touch.clientY },
        fired: false,
        pressAnimation: null,
        timer: window.setTimeout(fire, TITLE_PEEK_HOLD_MS),
      };
      // La tarjeta se hunde mientras se mantiene, para que se note que algo va
      // a pasar. Con la API de animaciones y la propiedad `scale` (no
      // `transform`), que se suma a la transformación que ya tenga la tarjeta
      // sin pisarla ni tocar sus clases.
      if (!reduceMotion && typeof resolved.target.animate === "function") {
        try {
          gesture.pressAnimation = resolved.target.animate(
            [{ scale: 1 }, { scale: 0.96 }],
            {
              duration: TITLE_PEEK_HOLD_MS,
              delay: 80,
              easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
              fill: "forwards",
            },
          );
        } catch {
          gesture.pressAnimation = null;
        }
      }
      gestureRef.current = gesture;
    };

    const onTouchMove = (event) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.fired) return;
      const touch = event.touches[0];
      if (
        event.touches.length !== 1 ||
        exceedsPeekMoveTolerance(gesture.start, {
          x: touch.clientX,
          y: touch.clientY,
        })
      ) {
        cancelGesture();
      }
    };

    const onTouchEnd = (event) => {
      const gesture = gestureRef.current;
      // Sin esto el navegador sigue el enlace o abre la ficha al soltar.
      if (gesture?.fired && event.cancelable) event.preventDefault();
      cancelGesture();
    };

    const onContextMenu = (event) => {
      const gesture = gestureRef.current;
      if (gesture && !gesture.fired && gesture.target.contains(event.target)) {
        event.preventDefault();
        fire();
        return;
      }
      if (gesture?.fired || resolvePeekTarget(event.target)) {
        event.preventDefault();
      }
    };

    const onClick = (event) => {
      if (Date.now() > suppressClickUntilRef.current) return;
      suppressClickUntilRef.current = 0;
      event.preventDefault();
      event.stopPropagation();
    };

    // Arrastrar el enlace o la imagen (Android lo empieza con la pulsación
    // larga) cancelaría los eventos táctiles.
    const onDragStart = (event) => {
      if (gestureRef.current) event.preventDefault();
    };

    const onScroll = () => {
      if (!gestureRef.current?.fired) cancelGesture();
    };

    const passive = { capture: true, passive: true };
    const active = { capture: true, passive: false };
    document.addEventListener("touchstart", onTouchStart, passive);
    document.addEventListener("touchmove", onTouchMove, passive);
    document.addEventListener("touchend", onTouchEnd, active);
    document.addEventListener("touchcancel", cancelGesture, passive);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dragstart", onDragStart, true);
    window.addEventListener("scroll", onScroll, passive);
    return () => {
      cancelGesture();
      document.removeEventListener("touchstart", onTouchStart, passive);
      document.removeEventListener("touchmove", onTouchMove, passive);
      document.removeEventListener("touchend", onTouchEnd, active);
      document.removeEventListener("touchcancel", cancelGesture, passive);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dragstart", onDragStart, true);
      window.removeEventListener("scroll", onScroll, passive);
    };
  }, [canPeek, reduceMotion]);

  // Si la pantalla deja de ser de móvil (girar una tablet, por ejemplo).
  useEffect(() => {
    if (!canPeek) setPeek(null);
  }, [canPeek]);

  if (!portalReady) return null;

  return createPortal(
    <div data-sv-no-peek="">
      <AnimatePresence key={presenceKey}>
        {peek?.item.media_type === "season" ? (
          <SeasonPeek
            key={peek.key}
            item={peek.item}
            origin={peek.origin}
            onClose={close}
            onOpenFull={openFull}
          />
        ) : peek ? (
          <DetailModal
            key={peek.key}
            item={peek.item}
            onClose={close}
            onPeekOpenFull={openFull}
            peek
            peekOrigin={peek.origin}
          />
        ) : null}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
