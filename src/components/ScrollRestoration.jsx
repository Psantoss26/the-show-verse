"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const STORAGE_PREFIX = "showverse:scroll-position:";
const HISTORY_NAVIGATION_WINDOW_MS = 1200;

function getCurrentRouteKey() {
  return `${window.location.pathname}${window.location.search}` || "/";
}

function getStorageKey(pathname) {
  return `${STORAGE_PREFIX}${pathname || "/"}`;
}

function readScrollPosition(pathname) {
  try {
    const raw = window.sessionStorage.getItem(getStorageKey(pathname));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return { x: Math.max(0, x), y: Math.max(0, y) };
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

function scrollToPosition(position) {
  if (!position) {
    scrollToPageStart();
    return;
  }

  window.scrollTo({
    top: position.y,
    left: position.x,
    behavior: "auto",
  });
}

export default function ScrollRestoration() {
  const pathname = usePathname() || "/";
  const currentRouteKeyRef = useRef(null);
  const navigationModeRef = useRef("push");
  const historyNavigationUntilRef = useRef(0);
  const scrollFrameRef = useRef(0);
  const saveFrameRef = useRef(0);

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

      saveScrollPosition(currentRouteKeyRef.current);
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

    if (window.location.hash) return undefined;

    if (scrollFrameRef.current) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    const savedPosition =
      mode === "history" ? readScrollPosition(routeKey) : null;

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = 0;
      if (mode === "history") {
        scrollToPosition(savedPosition);
      } else {
        scrollToPageStart();
      }
    });

    return () => {
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = 0;
      }
    };
  }, [pathname]);

  return null;
}
