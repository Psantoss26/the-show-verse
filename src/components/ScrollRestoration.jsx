"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const STORAGE_PREFIX = "showverse:scroll-position:";
const HISTORY_NAVIGATION_WINDOW_MS = 1200;
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
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
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

    const onUserIntent = () => {
      // Si el usuario hace scroll/teclea durante la restauración, respetamos su
      // intención y dejamos de reposicionar.
      interrupted = true;
    };

    const cleanup = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
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

      const clampedTarget = Math.min(savedPosition.y, maxScrollTop());
      window.scrollTo({
        top: clampedTarget,
        left: savedPosition.x,
        behavior: "auto",
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
          ? documentScrollHeight() >= savedPosition.h - POSITION_TOLERANCE_PX
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
