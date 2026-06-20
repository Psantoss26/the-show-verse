"use client";

import { useEffect, useRef } from "react";

const STORAGE_PREFIX = "showverse:scroll-position:";
const USER_SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  " ",
]);

function getCurrentRouteKey() {
  return `${window.location.pathname}${window.location.search}` || "/";
}

function getCurrentPathKey() {
  return window.location.pathname || "/";
}

function getStorageKey(routeKey) {
  return `${STORAGE_PREFIX}${routeKey}`;
}

function readScrollPosition(routeKey) {
  if (!routeKey) return null;

  try {
    const raw = window.sessionStorage.getItem(getStorageKey(routeKey));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return { x, y };
  } catch {
    return null;
  }
}

function saveScrollPosition(routeKey) {
  if (!routeKey) return;

  try {
    window.sessionStorage.setItem(
      getStorageKey(routeKey),
      JSON.stringify({
        x: window.scrollX,
        y: window.scrollY,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Storage can be unavailable in private browsing or constrained webviews.
  }
}

function scrollToPageStart() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function scrollToSavedPosition(position) {
  if (!position) {
    scrollToPageStart();
    return;
  }

  window.scrollTo({
    top: Math.max(0, position.y),
    left: Math.max(0, position.x),
    behavior: "auto",
  });
}

export default function ScrollRestoration() {
  const currentRouteKeyRef = useRef("");
  const currentPathKeyRef = useRef("");
  const visitedPathKeysRef = useRef(new Set());
  const scrollSaveRafRef = useRef(0);
  const scrollSaveLockRef = useRef(null);
  const urlChangeRafRef = useRef(0);
  const historyNavigationUntilRef = useRef(0);
  const navigationScrollRafRef = useRef(0);
  const ignoreScrollEventsUntilRef = useRef(0);

  useEffect(() => {
    currentRouteKeyRef.current = getCurrentRouteKey();
    currentPathKeyRef.current = getCurrentPathKey();
    visitedPathKeysRef.current.add(currentPathKeyRef.current);

    const previousScrollRestoration = "scrollRestoration" in window.history
      ? window.history.scrollRestoration
      : null;
    if (previousScrollRestoration != null) {
      window.history.scrollRestoration = "manual";
    }

    const clearScheduledNavigationScroll = () => {
      if (navigationScrollRafRef.current) {
        window.cancelAnimationFrame(navigationScrollRafRef.current);
        navigationScrollRafRef.current = 0;
      }
    };

    const lockCurrentRouteAgainstAutomaticTopSave = () => {
      scrollSaveLockRef.current = {
        routeKey: currentRouteKeyRef.current,
        expiresAt: window.performance.now() + 1500,
      };
    };

    const shouldSkipCurrentPositionSave = () => {
      const lock = scrollSaveLockRef.current;
      if (!lock) return false;

      if (window.performance.now() > lock.expiresAt) {
        scrollSaveLockRef.current = null;
        return false;
      }

      return (
        lock.routeKey === currentRouteKeyRef.current &&
        (lock.skipAll ||
          (window.scrollX === 0 &&
            window.scrollY === 0))
      );
    };

    const saveCurrentPosition = ({ lockAfterSave = false } = {}) => {
      saveScrollPosition(currentRouteKeyRef.current);
      if (lockAfterSave) lockCurrentRouteAgainstAutomaticTopSave();
    };

    const applyNavigationScroll = (callback) => {
      clearScheduledNavigationScroll();
      navigationScrollRafRef.current = window.requestAnimationFrame(() => {
        navigationScrollRafRef.current = 0;
        ignoreScrollEventsUntilRef.current = window.performance.now() + 250;
        callback();
      });
    };

    const runNavigationScroll = (mode) => {
      const nextRouteKey = getCurrentRouteKey();
      if (nextRouteKey === currentRouteKeyRef.current) return;

      clearScheduledNavigationScroll();

      const previousPathKey = currentPathKeyRef.current;
      const nextPathKey = getCurrentPathKey();
      const isSamePageUpdate = nextPathKey === previousPathKey;
      const hasVisitedPath = visitedPathKeysRef.current.has(nextPathKey);

      currentRouteKeyRef.current = nextRouteKey;
      currentPathKeyRef.current = nextPathKey;
      visitedPathKeysRef.current.add(nextPathKey);

      if (mode === "history") {
        const savedPosition = readScrollPosition(nextRouteKey);
        scrollSaveLockRef.current = {
          routeKey: nextRouteKey,
          expiresAt: window.performance.now() + 900,
          skipAll: true,
        };

        applyNavigationScroll(() => scrollToSavedPosition(savedPosition));
        return;
      }

      scrollSaveLockRef.current = null;

      if (isSamePageUpdate) return;

      if (hasVisitedPath) {
        const savedPosition = readScrollPosition(nextRouteKey);
        if (savedPosition) {
          applyNavigationScroll(() => scrollToSavedPosition(savedPosition));
        }
        return;
      }

      applyNavigationScroll(scrollToPageStart);
    };

    const scheduleNavigationScroll = (mode) => {
      if (urlChangeRafRef.current) {
        window.cancelAnimationFrame(urlChangeRafRef.current);
      }

      urlChangeRafRef.current = window.requestAnimationFrame(() => {
        urlChangeRafRef.current = 0;
        runNavigationScroll(mode);
      });
    };

    const scheduleCurrentPositionSave = () => {
      if (scrollSaveRafRef.current) return;

      scrollSaveRafRef.current = window.requestAnimationFrame(() => {
        scrollSaveRafRef.current = 0;
        if (window.performance.now() <= ignoreScrollEventsUntilRef.current) {
          return;
        }
        if (shouldSkipCurrentPositionSave()) return;
        saveCurrentPosition();
      });
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function pushState(...args) {
      saveCurrentPosition({ lockAfterSave: true });
      const result = originalPushState.apply(this, args);
      scheduleNavigationScroll("push");
      return result;
    };

    window.history.replaceState = function replaceState(...args) {
      const previousRouteKey = getCurrentRouteKey();
      const result = originalReplaceState.apply(this, args);
      if (getCurrentRouteKey() !== previousRouteKey) {
        const mode =
          window.performance.now() <= historyNavigationUntilRef.current
            ? "history"
            : "replace";
        scheduleNavigationScroll(mode);
      }
      return result;
    };

    const handlePopState = () => {
      saveCurrentPosition({ lockAfterSave: true });
      historyNavigationUntilRef.current = window.performance.now() + 1500;
      scheduleNavigationScroll("history");
    };

    const handleDocumentClick = () => {
      clearScheduledNavigationScroll();
      saveCurrentPosition({ lockAfterSave: true });
    };

    const handleUserScrollIntent = (event) => {
      if (event.type === "keydown" && !USER_SCROLL_KEYS.has(event.key)) return;
      clearScheduledNavigationScroll();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveCurrentPosition();
    };

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("wheel", handleUserScrollIntent, {
      passive: true,
      capture: true,
    });
    window.addEventListener("touchstart", handleUserScrollIntent, {
      passive: true,
      capture: true,
    });
    window.addEventListener("pointerdown", handleUserScrollIntent, {
      passive: true,
      capture: true,
    });
    window.addEventListener("keydown", handleUserScrollIntent, true);
    window.addEventListener("scroll", scheduleCurrentPositionSave, {
      passive: true,
    });
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pagehide", saveCurrentPosition);
    window.addEventListener("beforeunload", saveCurrentPosition);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (scrollSaveRafRef.current) {
        window.cancelAnimationFrame(scrollSaveRafRef.current);
        scrollSaveRafRef.current = 0;
      }
      if (urlChangeRafRef.current) {
        window.cancelAnimationFrame(urlChangeRafRef.current);
        urlChangeRafRef.current = 0;
      }

      clearScheduledNavigationScroll();
      saveCurrentPosition();

      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      if (previousScrollRestoration != null) {
        window.history.scrollRestoration = previousScrollRestoration;
      }

      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("wheel", handleUserScrollIntent, true);
      window.removeEventListener("touchstart", handleUserScrollIntent, true);
      window.removeEventListener("pointerdown", handleUserScrollIntent, true);
      window.removeEventListener("keydown", handleUserScrollIntent, true);
      window.removeEventListener("scroll", scheduleCurrentPositionSave);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pagehide", saveCurrentPosition);
      window.removeEventListener("beforeunload", saveCurrentPosition);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
