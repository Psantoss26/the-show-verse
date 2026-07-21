"use client";

import { useEffect, useState } from "react";

/**
 * Reports whether a mobile sticky toolbar has reached its computed `top` offset.
 *
 * A toolbar can then keep expandable controls in normal document flow before it
 * sticks, while preserving an overlay once it is pinned below the mobile nav.
 */
export default function useStickyToolbarState(toolbarRef) {
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mobileQuery = window.matchMedia("(max-width: 1023px)");
    let frameId = 0;

    const measure = () => {
      const toolbar = toolbarRef.current;
      if (!toolbar || !mobileQuery.matches) {
        setIsSticky((current) => (current ? false : current));
        return;
      }

      const topOffset = Number.parseFloat(window.getComputedStyle(toolbar).top);
      const nextSticky =
        Number.isFinite(topOffset) &&
        toolbar.getBoundingClientRect().top <= topOffset + 1;

      setIsSticky((current) => (current === nextSticky ? current : nextSticky));
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    const toolbar = toolbarRef.current;
    const resizeObserver =
      toolbar && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleMeasure)
        : null;

    resizeObserver?.observe(toolbar);
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    mobileQuery.addEventListener("change", scheduleMeasure);
    scheduleMeasure();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      mobileQuery.removeEventListener("change", scheduleMeasure);
    };
  }, [toolbarRef]);

  return isSticky;
}
