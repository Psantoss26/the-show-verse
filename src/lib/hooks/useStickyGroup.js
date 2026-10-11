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
    const reserveHeight = () => {
      // Keep the expanded footprint: shrinking the sticky surface must not
      // move the cards, trigger scroll anchoring or change the docking point.
      if (!stickyRef.current && !forceSticky && content) {
        node.style.minHeight = `${content.offsetHeight}px`;
      }
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
    reserveHeight();
    read()?.();
    const observer = new ResizeObserver(() => {
      reserveHeight();
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
