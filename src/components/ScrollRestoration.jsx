"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const STORAGE_PREFIX = "showverse:scroll-position:";
const HISTORY_NAVIGATION_MARKER_KEY = "showverse:pending-history-navigation";
// En rutas dinámicas pesadas, el cambio de pathname puede llegar varios
// segundos después del `popstate`. Mantenemos la navegación marcada como
// historial durante ese tiempo para no tratar la vuelta como un push y mandar
// el documento al inicio.
const HISTORY_NAVIGATION_WINDOW_MS = 30_000;
// Ventana máxima durante la cual reaplicamos la posición guardada mientras el
// layout «se pone al día». En las páginas con contenido asíncrono (p. ej. el
// dashboard: "Continuar viendo" y "Para ti" aparecen tras hidratar la sesión,
// las filas perezosas se montan, las imágenes cargan…) la altura del documento
// crece DESPUÉS del primer frame; un único scrollTo se quedaría corto/recortado.
const RESTORE_MAX_MS = 5000;
// Nº de frames consecutivos en el objetivo (con la altura ya alcanzada) que
// consideramos «estable» para dar la restauración por terminada.
const RESTORE_STABLE_FRAMES = 3;
const POSITION_TOLERANCE_PX = 2;

function getCurrentRouteKey() {
  return `${window.location.pathname}${window.location.search}` || "/";
}

function getStorageKey(pathname) {
  return `${STORAGE_PREFIX}${pathname || "/"}`;
}

function markHistoryNavigation() {
  try {
    window.sessionStorage.setItem(
      HISTORY_NAVIGATION_MARKER_KEY,
      JSON.stringify({ route: getCurrentRouteKey(), at: Date.now() }),
    );
  } catch {
    // Session storage may be unavailable in private browsing.
  }
}

function clearHistoryNavigationMarker() {
  try {
    window.sessionStorage.removeItem(HISTORY_NAVIGATION_MARKER_KEY);
  } catch {
    // Session storage may be unavailable in private browsing.
  }
}

function documentScrollHeight() {
  return Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight || 0,
  );
}

function maxScrollTop() {
  return Math.max(0, documentScrollHeight() - window.innerHeight);
}

function readScrollPosition(pathname) {
  try {
    const raw = window.sessionStorage.getItem(getStorageKey(pathname));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const h = Number(parsed?.h);
    return {
      x: Math.max(0, x),
      y: Math.max(0, y),
      // Altura del documento cuando se guardó la posición. Sirve para saber
      // cuándo el layout ha recuperado su estado y la `y` vuelve a ser válida.
      h: Number.isFinite(h) && h > 0 ? h : 0,
    };
  } catch {
    return null;
  }
}

function saveScrollPosition(pathname) {
  if (!pathname) return;

  try {
    window.sessionStorage.setItem(
      getStorageKey(pathname),
      JSON.stringify({
        x: window.scrollX,
        y: window.scrollY,
        h: documentScrollHeight(),
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Session storage may be unavailable in private browsing.
  }
}

function scrollToPageStart() {
  // "instant" (no "auto"): con `html { scroll-behavior: smooth }` global, un
  // `behavior: "auto"` heredaría el smooth del CSS y ANIMARÍA el salto al top.
  // La restauración debe ser instantánea y limpia.
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

export default function ScrollRestoration() {
  const pathname = usePathname() || "/";
  const currentRouteKeyRef = useRef(null);
  const navigationModeRef = useRef("push");
  const historyNavigationUntilRef = useRef(0);
  const saveFrameRef = useRef(0);
  // Limpieza de la restauración en curso (cancela el bucle de rAF + listeners).
  const restoreCleanupRef = useRef(null);
  // Mientras restauramos hacemos scroll programático: NO debemos guardar esas
  // posiciones intermedias (machacarían la posición correcta que restauramos).
  const isRestoringRef = useRef(false);

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return undefined;

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    currentRouteKeyRef.current = getCurrentRouteKey();
  }, [pathname]);

  useEffect(() => {
    const scheduleSave = () => {
      if (saveFrameRef.current) return;

      saveFrameRef.current = window.requestAnimationFrame(() => {
        saveFrameRef.current = 0;
        if (isRestoringRef.current) return;
        saveScrollPosition(currentRouteKeyRef.current);
      });
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function pushState(...args) {
      saveScrollPosition(currentRouteKeyRef.current);
      clearHistoryNavigationMarker();
      navigationModeRef.current = "push";
      return originalPushState.apply(this, args);
    };

    window.history.replaceState = function replaceState(...args) {
      saveScrollPosition(currentRouteKeyRef.current);
      if (window.performance.now() <= historyNavigationUntilRef.current) {
        navigationModeRef.current = "history";
      } else {
        navigationModeRef.current = "push";
      }
      return originalReplaceState.apply(this, args);
    };

    const handlePopState = () => {
      saveScrollPosition(currentRouteKeyRef.current);
      // `popstate` ya se ejecuta con la URL de DESTINO. Persistimos esa ruta
      // para que la página que monte después sepa con certeza que debe usar su
      // snapshot cacheado, aunque el commit del App Router llegue tarde.
      markHistoryNavigation();
      navigationModeRef.current = "history";
      historyNavigationUntilRef.current =
        window.performance.now() + HISTORY_NAVIGATION_WINDOW_MS;
    };

    const handlePageHide = () => {
      saveScrollPosition(currentRouteKeyRef.current);
    };

    window.addEventListener("scroll", scheduleSave, { passive: true });
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      if (saveFrameRef.current) {
        window.cancelAnimationFrame(saveFrameRef.current);
        saveFrameRef.current = 0;
      }

      if (!isRestoringRef.current) {
        saveScrollPosition(currentRouteKeyRef.current);
      }
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("scroll", scheduleSave);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, []);

  useLayoutEffect(() => {
    const routeKey = getCurrentRouteKey();
    if (currentRouteKeyRef.current === routeKey) return undefined;

    currentRouteKeyRef.current = routeKey;
    const mode = navigationModeRef.current;
    navigationModeRef.current = "push";

    // Cancelar cualquier restauración anterior aún en curso.
    if (restoreCleanupRef.current) {
      restoreCleanupRef.current();
      restoreCleanupRef.current = null;
    }

    if (window.location.hash) return undefined;

    if (mode !== "history") {
      // Navegación nueva (push): arriba del todo.
      window.requestAnimationFrame(scrollToPageStart);
      return undefined;
    }

    const savedPosition = readScrollPosition(routeKey);
    if (!savedPosition) {
      window.requestAnimationFrame(scrollToPageStart);
      return undefined;
    }

    // Restauración RESILIENTE: reaplicamos la posición guardada en cada frame
    // hasta que (a) el layout ha recuperado su altura (el contenido asíncrono —
    // "Continuar viendo", "Para ti", filas perezosas, imágenes — ya se montó) y
    // (b) estamos sobre el objetivo y se mantiene estable. Así no nos quedamos
    // «lejos del punto exacto» cuando el documento crece tras el primer frame.
    isRestoringRef.current = true;
    const startedAt = window.performance.now();
    let rafId = 0;
    let stableFrames = 0;
    let interrupted = false;

    // RESERVA DE ALTURA para una restauración INSTANTÁNEA (sin el "salto").
    // Problema: al restaurar (antes del primer paint) el contenido asíncrono/
    // perezoso aún no tiene la altura guardada, así que `scrollTo(savedY)` se
    // RECORTA cerca del top y el bucle lo baja después → el parpadeo/movimiento
    // visible que se ve en muchas páginas al volver.
    // Solución: un spacer invisible al final del <body> rellena el documento hasta
    // la altura guardada, de modo que `savedY` ya es una posición válida en el
    // PRIMER frame. El spacer se ENCOGE conforme el contenido real crece y se
    // retira al alcanzarlo (o al interrumpir/agotar el tiempo).
    let spacer = null;
    // Ajusta el spacer para que el documento mida al menos `savedPosition.h` y
    // devuelve la altura del contenido REAL (lo que hay por ENCIMA del spacer).
    const reserveHeight = () => {
      if (!(savedPosition.h > 0)) return documentScrollHeight();
      if (!spacer) {
        spacer = document.createElement("div");
        spacer.setAttribute("aria-hidden", "true");
        spacer.style.cssText =
          "width:1px;height:0;margin:0;padding:0;border:0;flex:0 0 auto;visibility:hidden;pointer-events:none;";
        document.body.appendChild(spacer);
      }
      // `offsetTop` del spacer = altura del contenido que tiene por encima.
      const contentHeight = spacer.offsetTop;
      spacer.style.height = `${Math.max(0, savedPosition.h - contentHeight)}px`;
      return contentHeight;
    };
    const removeSpacer = () => {
      if (spacer && spacer.parentNode) spacer.parentNode.removeChild(spacer);
      spacer = null;
    };

    // Reserva ANTES del scroll síncrono: así `savedY` no se recorta y la página se
    // pinta ya EXACTAMENTE en la posición guardada desde el primer frame.
    reserveHeight();

    // Posicionamiento SÍNCRONO inmediato, dentro del layout effect (ANTES del
    // primer paint): la página se pinta ya en la posición guardada — o lo más
    // cerca que permita la altura disponible en este instante — en lugar de
    // pintarse en el top y saltar después desde el rAF. Es lo que elimina el
    // "salto al inicio". El bucle de rAF de abajo solo AFINA la posición
    // mientras el contenido asíncrono crece; ya no es quien la fija por primera
    // vez. `behavior: "instant"` para no heredar el smooth global del CSS.
    window.scrollTo({
      top: Math.min(savedPosition.y, maxScrollTop()),
      left: savedPosition.x,
      behavior: "instant",
    });

    const onUserIntent = () => {
      // Si el usuario hace scroll/teclea durante la restauración, respetamos su
      // intención y dejamos de reposicionar.
      interrupted = true;
    };

    const cleanup = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      removeSpacer();
      window.removeEventListener("wheel", onUserIntent);
      window.removeEventListener("touchstart", onUserIntent);
      window.removeEventListener("keydown", onUserIntent);
      isRestoringRef.current = false;
      restoreCleanupRef.current = null;
    };

    window.addEventListener("wheel", onUserIntent, { passive: true });
    window.addEventListener("touchstart", onUserIntent, { passive: true });
    window.addEventListener("keydown", onUserIntent);

    const step = () => {
      if (interrupted) {
        cleanup();
        return;
      }

      // Re-reserva y mide el contenido REAL (por encima del spacer). El spacer se
      // encoge conforme el contenido crece; cuando lo alcanza, mide 0 y se retira.
      const contentHeight = reserveHeight();
      const clampedTarget = Math.min(savedPosition.y, maxScrollTop());
      window.scrollTo({
        top: clampedTarget,
        left: savedPosition.x,
        // "instant": nunca smooth. Cada reaplicación mientras el layout crece es
        // un ajuste seco (imperceptible a 60fps), no una animación suave que se
        // reinicia en cada frame (origen del tirón/salto).
        behavior: "instant",
      });

      // ¿El layout ha alcanzado el estado de cuando se guardó? Si conocemos la
      // altura guardada, EXIGIMOS que el documento la recupere: es la señal de
      // que el contenido asíncrono de ARRIBA (p. ej. "Continuar viendo") ya se
      // montó y la `y` guardada vuelve a apuntar al mismo contenido. (No vale
      // con que el documento «dé para llegar» a la `y`: el relleno de abajo lo
      // cumple desde el primer frame y nos asentaríamos demasiado pronto, antes
      // de que apareciera el contenido superior → nos quedaríamos arriba.)
      const heightCaughtUp =
        savedPosition.h > 0
          ? contentHeight >= savedPosition.h - POSITION_TOLERANCE_PX
          : maxScrollTop() >= savedPosition.y - POSITION_TOLERANCE_PX;
      const atTarget =
        Math.abs(window.scrollY - clampedTarget) <= POSITION_TOLERANCE_PX;

      if (heightCaughtUp && atTarget) {
        stableFrames += 1;
        if (stableFrames >= RESTORE_STABLE_FRAMES) {
          cleanup();
          return;
        }
      } else {
        stableFrames = 0;
      }

      if (window.performance.now() - startedAt < RESTORE_MAX_MS) {
        rafId = window.requestAnimationFrame(step);
      } else {
        cleanup();
      }
    };

    rafId = window.requestAnimationFrame(step);
    restoreCleanupRef.current = cleanup;

    return () => {
      cleanup();
    };
  }, [pathname]);

  return null;
}
