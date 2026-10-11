"use client";

import { useEffect, useLayoutEffect } from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const ANIMATION_ID = "spotlight-expansion";

// Swiper keeps its original slide sizes. Only the clipped card surface grows;
// neighboring tiles move on the same animation timeline, including reversals.
export default function useSpotlightExpansion(rowRef, { index, enabled, reduceMotion }) {
  useClientLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || !enabled) return;
    const update = () => {
      const tiles = [...row.querySelectorAll("[data-preview-tile]")];
      const active = index == null ? null : tiles[index];
      const rowRect = row.getBoundingClientRect();
      const previewWidth = active ? Math.min(rowRect.width, active.offsetHeight * 16 / 9) : 0;
      const extra = active ? Math.max(0, previewWidth - active.offsetWidth) : 0;
      // Measure the unshifted slot, not a tile still moving from a previous hover.
      const slot = active?.closest(".swiper-slide").getBoundingClientRect();
      const shift = slot ? Math.max(0, Math.min(extra, slot.left + active.offsetWidth + extra - rowRect.right)) : 0;
      const changes = [];
      tiles.forEach((tile, i) => {
        const shell = tile.querySelector("[data-spotlight-shell]");
        if (!shell) return;
        if (tile === active) shell.style.setProperty("--spotlight-preview-width", `${previewWidth}px`);
        const targetX = active ? (i < index ? -shift : i > index ? extra - shift : -shift) : 0;
        changes.push([tile, "translate", `${targetX}px 0px`]);
        changes.push([shell, "width", `${tile.offsetWidth + (tile === active ? extra : 0)}px`]);
      });
      // Read every current value before cancelling any animation or writing styles.
      const frames = changes.map(([el, property, target]) => [el, property, getComputedStyle(el)[property], target]);
      const startTime = document.timeline.currentTime;
      frames.forEach(([el, property, from, to]) => {
        el.getAnimations().filter((animation) => animation.id === ANIMATION_ID).forEach((animation) => animation.cancel());
        el.style[property] = to;
        if (reduceMotion || from === to) return;
        const animation = el.animate([{ [property]: from }, { [property]: to }], {
          duration: 420,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
        animation.id = ANIMATION_ID;
        animation.startTime = startTime;
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [rowRef, index, enabled, reduceMotion]);

  useClientLayoutEffect(() => {
    const row = rowRef.current;
    return () => {
      row?.querySelectorAll("[data-preview-tile], [data-spotlight-shell]").forEach((el) => {
        el.getAnimations().filter((animation) => animation.id === ANIMATION_ID).forEach((animation) => animation.cancel());
        if (el.hasAttribute("data-spotlight-shell")) el.style.removeProperty("width");
        else if (enabled) el.style.removeProperty("translate");
      });
    };
  }, [rowRef, enabled]);
}
