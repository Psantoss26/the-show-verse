"use client";

import { useEffect } from "react";
import { prefetchRatingScores } from "@/lib/details/useRatingLinks";
import { ratingScoresTargetFromPath } from "@/lib/details/ratingScoresUrl";

const HOVER_DWELL_MS = 250;

function targetFrom(event) {
  const anchor = event.target?.closest?.("a[href]");
  if (!anchor) return null;
  let url;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }
  return url.origin === window.location.origin ? ratingScoresTargetFromPath(url.pathname) : null;
}

/**
 * Arranca la lectura de las notas del público en cuanto se TOCA un enlace a una
 * ficha (o se deja el ratón encima un momento), en paralelo con la navegación.
 * Al montar la ficha (o el modal), useRatingScores encuentra esas peticiones ya
 * en camino o resueltas. Sin esto salían después de que llegase la página y
 * se montase la ficha.
 */
export default function RatingScoresPrefetch() {
  useEffect(() => {
    let hoverTimer = 0;
    const onPointerDown = (event) => {
      const target = targetFrom(event);
      if (target) prefetchRatingScores(target);
    };
    const onPointerOver = (event) => {
      if (event.pointerType !== "mouse") return;
      const target = targetFrom(event);
      window.clearTimeout(hoverTimer);
      if (target) hoverTimer = window.setTimeout(() => prefetchRatingScores(target), HOVER_DWELL_MS);
    };
    const onPointerOut = () => window.clearTimeout(hoverTimer);
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
    return () => {
      window.clearTimeout(hoverTimer);
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
    };
  }, []);
  return null;
}
