"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Read all group positions together before committing any React updates.
const subscribers = new Set();
let frame = null;
function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    const commits = Array.from(subscribers, (read) => read());
    commits.forEach((commit) => commit?.());
  });
}

export default function useStickyGroup(mobileFiltersOpen, forceSticky) {
  const ref = useRef(null);
  const stickyRef = useRef(false);
  const [isSticky, setIsSticky] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const content = node.firstElementChild;
    // Keep the expanded footprint: shrinking the sticky surface must not
    // move the cards, trigger scroll anchoring or change the docking point.
    // The height comes from the ResizeObserver entry (its first notification
    // arrives before the first paint): reading the content height here, right
    // after another group wrote its `minHeight`, forced one full layout per
    // group inside the commit (~260 ms with CPU ×4 on Favorites "by year").
    const reserveHeight = (entry) => {
      if (stickyRef.current || forceSticky || !content) return;
      const height = entry?.borderBoxSize?.[0]?.blockSize;
      if (height > 0) node.style.minHeight = `${height}px`;
    };
    const read = () => {
      const top = node.getBoundingClientRect().top;
      const threshold = Number.parseFloat(getComputedStyle(node).top) || 0;
      const next = top <= threshold + (stickyRef.current ? 12 : 1);
      if (next === stickyRef.current) return null;
      return () => {
        stickyRef.current = next;
        setIsSticky(next);
      };
    };
    read()?.();
    const observer = new ResizeObserver((entries) => {
      reserveHeight(entries[entries.length - 1]);
      schedule();
    });
    if (content) observer.observe(content);
    if (!subscribers.size) {
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      window.addEventListener("showverse:scroll-restoration-complete", schedule);
    }
    subscribers.add(read);
    // Recheck at the end of the mobile filter's top transition, even if the
    // user is no longer scrolling.
    node.addEventListener("transitionend", schedule);
    return () => {
      observer.disconnect();
      node.removeEventListener("transitionend", schedule);
      subscribers.delete(read);
      if (!subscribers.size) {
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        window.removeEventListener("showverse:scroll-restoration-complete", schedule);
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
      }
    };
  }, [mobileFiltersOpen, forceSticky]);

  return { ref, isSticky };
}
