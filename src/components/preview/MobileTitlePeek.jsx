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
// Ir a la ficha (tocar la portada): la vista previa NO se cierra. En el mismo
// fotograma del toque la tarjeta se convierte en la cabecera de la ficha (su
// portada crece a todo el ancho, pegada arriba, y lo demás se desvanece; ver
// lib/navigation/peekHandoff) mientras la página de detrás se funde a oscuro
// (el color de la ficha), y se navega. Cuando la ficha está en pantalla con su
// imagen principal cargada, la tarjeta se ajusta al píxel a la portada de la
// ficha y se desvanece sobre ella (en el compositor): es la misma imagen en el
// mismo sitio. En la ficha de una película o serie, el logo, los botones y el
// marcador de la tarjeta vuelan antes a los de la ficha, que ya están pintados
// sin animación de entrada: no se ven desaparecer ni volver a entrar. Ya no
// vuelve a verse: tampoco al volver atrás.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";

import { useRouter } from "@/lib/offline/useOfflineRouter";
import {
  beginPeekHandoff,
  endPeekHandoff,
  findPeekHandoffTarget,
  peekHandoffPartsReady,
  revealPeekHandoffParts,
  settlePeekCard,
} from "@/lib/navigation/peekHandoff";

import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { PEEK_OVER_PAGE_Z, isInsidePageOverlay } from "@/lib/ui/pageModal";
import {
  warmDetailsChunks,
  warmDetailsChunksOnPress,
} from "@/lib/navigation/detailsWarmup";
import { dashboardDetailHref } from "@/lib/dashboard/detailHref";
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
// La portada de la tarjeta flotante se pide al apoyar el dedo, no al cumplirse
// la pulsación: así suele estar descargada cuando la tarjeta tiene que crecer
// (ver `requestModalHeroPoster`). Va en el mismo trozo que la ficha rápida.
const prewarmPeekPoster = (item) =>
  import("@/components/dashboard/useDetailModalData")
    .then((module) => module.prewarmModalHeroPoster(item))
    .catch(() => {});
// Las temporadas (sección Temporadas de la ficha de una serie) tienen su
// propia vista previa, con lo de arriba de la ficha de la temporada.
const loadSeasonPeek = () => import("@/components/preview/SeasonPeek");
const SeasonPeek = dynamic(loadSeasonPeek, { ssr: false });

// Tras soltar el dedo, cuánto dura el descarte del clic sintetizado (ms).
const CLICK_SUPPRESS_MS = 700;
// Si la ficha no llega a abrirse en este tiempo, la vista previa se retira
// igualmente (ms).
const LEAVE_MAX_WAIT_MS = 10000;
// Con la ficha ya en pantalla, cuánto se espera además a su imagen principal
// y a sus piezas (logo, botones, marcador) antes de desvanecer la vista previa
// (ms): sin ellas se vería el hero vacío.
const LEAVE_ART_MAX_WAIT_MS = 1200;
// Fundido a oscuro de la página de detrás al ir a la ficha y desvanecido de la
// vista previa cuando la ficha ya está (ms).
const LEAVE_SCRIM_MS = 260;
const LEAVE_FADE_MS = 300;
// Fondo de la ficha (DetailsClient y `details/loading.jsx`).
const DETAILS_SURFACE = "#101010";

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

// ¿Tiene ya la ficha a la vista su imagen principal? (`data-details-sequence-
// ready`, ver DetailsClient). Una ficha que no lo marca cuenta como lista.
function detailsArtReady() {
  const roots = document.querySelectorAll("[data-details-root]");
  for (const node of roots) {
    if (node.getClientRects().length === 0) continue;
    const ready = node.getAttribute("data-details-sequence-ready");
    if (ready !== null && ready !== "true") return false;
  }
  return true;
}

// ¿Está el teclado en pantalla? Lo dice el alto visible: el teclado encoge
// `visualViewport`, no la ventana.
const KEYBOARD_MIN_PX = 120;
function isKeyboardOpen() {
  const viewport = window.visualViewport;
  return Boolean(viewport) && window.innerHeight - viewport.height > KEYBOARD_MIN_PX;
}

// Llama a `done` cuando el teclado ha bajado del todo (el alto visible deja de
// cambiar con el teclado ya fuera), con un tope para no quedarse esperando si
// el sistema no avisa. Devuelve la cancelación.
const KEYBOARD_CLOSE_SETTLE_MS = 80;
const KEYBOARD_CLOSE_MAX_MS = 700;
function waitForKeyboardClose(done) {
  const viewport = window.visualViewport;
  let settleTimer = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(settleTimer);
    window.clearTimeout(maxTimer);
    viewport?.removeEventListener("resize", onResize);
    done();
  };
  const onResize = () => {
    window.clearTimeout(settleTimer);
    if (!isKeyboardOpen()) settleTimer = window.setTimeout(finish, KEYBOARD_CLOSE_SETTLE_MS);
  };
  const maxTimer = window.setTimeout(finish, KEYBOARD_CLOSE_MAX_MS);
  viewport?.addEventListener("resize", onResize);
  return () => {
    finished = true;
    window.clearTimeout(settleTimer);
    window.clearTimeout(maxTimer);
    viewport?.removeEventListener("resize", onResize);
  };
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
      beginPeekHandoff(href);
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
    const leaving = leavingRef.current;
    if (leaving && new URL(leaving, window.location.origin).pathname === pathname) {
      return;
    }
    // Atrás a mitad del relevo (la tarjeta, ya crecida a cabecera, seguía
    // encima de la ficha): se retira al instante. Con `setPeek(null)` hacía su
    // animación de salida y volvía a verse la portada encogiéndose hasta la
    // tarjeta sobre la página recuperada.
    if (leaving) {
      endPeekHandoff();
      removeInstantly();
      return;
    }
    setPeek(null);
  }, [pathname, removeInstantly]);
  // Atrás ANTES de que la ficha llegue a la ruta (el toque y el gesto de
  // volver casi a la vez): la ruta no cambia y el efecto anterior no corre.
  const leavingTo = peek?.leavingTo || null;
  useEffect(() => {
    if (!leavingTo) return undefined;
    const target = new URL(leavingTo, window.location.origin).pathname;
    const onPopState = () => {
      if (window.location.pathname === target) return;
      endPeekHandoff();
      removeInstantly();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [leavingTo, removeInstantly]);

  // Ida a la ficha: la página de detrás se funde a oscuro (`scrimRef`) y,
  // cuando la ficha ya está en pantalla con su imagen y se ha pintado al
  // menos un fotograma con ella debajo, la vista previa entera (`layerRef`) se
  // desvanece sobre la ficha y se retira. Todo con la API de animaciones y
  // solo `opacity`: la ficha monta justo entonces y el hilo principal va
  // cargado, pero el compositor no se frena.
  const layerRef = useRef(null);
  const scrimRef = useRef(null);
  const leaveFadeRef = useRef(null);
  useLayoutEffect(() => {
    const scrim = scrimRef.current;
    if (!leavingTo || !scrim || typeof scrim.animate !== "function") return;
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduceMotion ? 120 : LEAVE_SCRIM_MS,
      easing: "ease-out",
    });
  }, [leavingTo, reduceMotion]);
  useEffect(() => {
    if (!leavingTo) return undefined;
    let frame = 0;
    let cancelled = false;
    const startedAt = performance.now();
    let shownAt = 0;
    const fadeOut = () => {
      const layer = layerRef.current;
      if (!layer || typeof layer.animate !== "function") {
        endPeekHandoff();
        removeInstantly();
        return;
      }
      layer.style.pointerEvents = "none";
      // La tarjeta, ya convertida en cabecera, se ajusta a la portada real de
      // la ficha y sus piezas, a las de la ficha. Las de la ficha aparecen ya
      // debajo (la capa de la vista previa es opaca: no se ven dobles) y, al
      // llegar, la vista previa entera se desvanece encima: es lo mismo en el
      // mismo sitio. El desvanecido se programa ya con su retardo: así empieza
      // a tiempo en el compositor aunque la ficha, recién montada, tenga el
      // hilo principal ocupado.
      const card = layer.querySelector("[data-peek-card]");
      const cover = layer.querySelector("[data-peek-cover]");
      const settleMs = settlePeekCard(card, cover, findPeekHandoffTarget(), {
        fullPoster: cover?.hasAttribute("data-peek-full-poster"),
        reduceMotion,
      });
      revealPeekHandoffParts();
      const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: reduceMotion ? 120 : LEAVE_FADE_MS,
        delay: settleMs,
        easing: "cubic-bezier(0.33, 0, 0.2, 1)",
        fill: "forwards",
      });
      leaveFadeRef.current = fade;
      const done = () => {
        endPeekHandoff();
        if (!cancelled) removeInstantly();
      };
      fade.finished.then(done, done);
    };
    const check = () => {
      if (cancelled) return;
      const now = performance.now();
      if (!shownAt && detailsShown(leavingTo)) shownAt = now;
      if (
        (shownAt &&
          ((detailsArtReady() && peekHandoffPartsReady()) ||
            now - shownAt > LEAVE_ART_MAX_WAIT_MS)) ||
        now - startedAt > LEAVE_MAX_WAIT_MS
      ) {
        frame = window.requestAnimationFrame(() => {
          frame = window.requestAnimationFrame(() => {
            if (!cancelled) fadeOut();
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
  }, [leavingTo, removeInstantly, reduceMotion]);
  // Retirada ya la vista previa, la capa vuelve a estar visible para la
  // siguiente (antes de pintar: no hay fotograma intermedio).
  useLayoutEffect(() => {
    if (!peek) endPeekHandoff();
    if (peek || !leaveFadeRef.current) return;
    leaveFadeRef.current.cancel();
    leaveFadeRef.current = null;
    if (layerRef.current) layerRef.current.style.pointerEvents = "";
  }, [peek]);

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
    let disposed = false;
    let pendingOpenCancel = null;

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
      releasePress(gesture);
      // Mientras el dedo siga apoyado no hay clic que dejar pasar.
      suppressClickUntilRef.current = Number.POSITIVE_INFINITY;
      try {
        navigator.vibrate?.(10);
      } catch {
        // Sin vibración (iOS, permisos): no pasa nada.
      }
      const { target, item } = gesture;
      const open = () => {
        if (disposed) return;
        const rect = target.getBoundingClientRect();
        setPeek({
          key: `${item.media_type}:${item.id}:${Date.now()}`,
          item,
          origin: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          // Pulsada dentro de un modal o un desplegable (episodios agrupados,
          // vista lateral de Temporadas, alertas del navbar, resultados de la
          // búsqueda…): encima de todo.
          overModal: isInsidePageOverlay(target),
        });
      };
      // TECLADO ABIERTO (resultados de la búsqueda con el campo enfocado): la
      // vista previa mide su tarjeta UNA vez, al abrirse, con el alto visible
      // (`visualViewport`), que con el teclado es la mitad: salía compactada.
      // Se baja el teclado y se abre cuando la pantalla ha recuperado su alto.
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        focused.matches("input, textarea")
      ) {
        focused.blur();
        if (isKeyboardOpen()) {
          pendingOpenCancel = waitForKeyboardClose(() => {
            pendingOpenCancel = null;
            open();
          });
          return;
        }
      }
      open();
    };

    const onTouchStart = (event) => {
      cancelGesture();
      if (peekOpenRef.current || event.touches.length !== 1) return;
      const resolved = resolvePeekTarget(event.target);
      if (!resolved) return;
      if (resolved.item.media_type === "season") loadSeasonPeek();
      else {
        loadDetailModal();
        prewarmPeekPoster(resolved.item);
      }
      // Un toque en un título suele acabar en su ficha: su JS, ya (ver
      // detailsWarmup; normalmente ya está desde el reposo).
      if (resolved.item.media_type !== "season") {
        warmDetailsChunksOnPress(
          resolved.target.getAttribute("href") ||
            dashboardDetailHref(resolved.item, resolved.item.media_type),
        );
      }
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
      disposed = true;
      pendingOpenCancel?.();
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

  // Los trozos de JS de la ficha, descargados y evaluados en reposo: tocar un
  // título ya no espera a bajarlos (ver detailsWarmup).
  useEffect(() => {
    if (!canPeek) return undefined;
    return warmDetailsChunks();
  }, [canPeek]);

  // Si la pantalla deja de ser de móvil (girar una tablet, por ejemplo).
  useEffect(() => {
    if (!canPeek) setPeek(null);
  }, [canPeek]);

  if (!portalReady) return null;

  // La capa lleva su propio z-index: su desvanecido final (`opacity`) la
  // convierte en contexto de apilamiento y, sin él, caería al nivel 0 de la
  // página. El navbar y la barra superior, por encima, aparecían de golpe
  // sobre la vista previa en vez de verse a través de ella.
  // `data-detail-modal-layer`: con la vista lateral abierta (SectionSheet,
  // `data-sv-sheet-open`) globals.css quita el desenfoque a todo lo que cuelga
  // de <body> salvo las capas de modal; sin la marca, el fondo difuminado y el
  // cristal de la tarjeta se quedaban transparentes.
  return createPortal(
    <div
      data-sv-no-peek=""
      data-detail-modal-layer=""
      ref={layerRef}
      className="relative"
      style={{ zIndex: peek?.overModal ? PEEK_OVER_PAGE_Z : 9999 }}
    >
      {/* Detrás de la vista previa mientras se va a la ficha: tapa la página
          que se deja y la pantalla de carga con el fondo de la ficha. */}
      {leavingTo && (
        <div
          ref={scrimRef}
          aria-hidden="true"
          className="fixed inset-0 z-[9998]"
          style={{ backgroundColor: DETAILS_SURFACE }}
        />
      )}
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
            overModal={peek.overModal}
          />
        ) : null}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
