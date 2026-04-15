// src/components/details/AnimatedSection.jsx
"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";

function baseTransition(
  delay = 0,
  duration = 0.55,
  shouldReduceMotion = false,
) {
  if (shouldReduceMotion) return { duration: 0 };
  return {
    duration,
    delay,
    ease: [0.22, 1, 0.36, 1],
  };
}

export function AnimatedSection({
  children,
  className = "",
  delay = 0,
  margin = "0px 0px 18% 0px",
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin });
  const shouldReduceMotion = useReducedMotion();

  const hidden = shouldReduceMotion
    ? { opacity: 1, y: 0 }
    : { opacity: 0, y: 18 };

  return (
    <motion.div
      ref={ref}
      initial={hidden}
      animate={isInView || shouldReduceMotion ? { opacity: 1, y: 0 } : hidden}
      transition={baseTransition(delay, 0.46, shouldReduceMotion)}
      style={{ willChange: shouldReduceMotion ? "auto" : "transform, opacity" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function FadeIn({
  children,
  className = "",
  delay = 0,
  direction = "up",
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const shouldReduceMotion = useReducedMotion();

  const directions = {
    up: { y: 20 },
    down: { y: -20 },
    left: { x: 20 },
    right: { x: -20 },
  };

  const initial = shouldReduceMotion
    ? { opacity: 1, x: 0, y: 0 }
    : { opacity: 0, ...directions[direction] };

  const animate =
    isInView || shouldReduceMotion ? { opacity: 1, y: 0, x: 0 } : initial;

  return (
    <motion.div
      ref={ref}
      initial={initial}
      animate={animate}
      transition={baseTransition(delay, 0.6, shouldReduceMotion)}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function ScaleIn({ children, className = "", delay = 0 }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const shouldReduceMotion = useReducedMotion();

  const initial = shouldReduceMotion
    ? { opacity: 1, scale: 1, y: 0 }
    : { opacity: 0, scale: 0.985, y: 10 };

  return (
    <motion.div
      ref={ref}
      initial={initial}
      animate={
        isInView || shouldReduceMotion
          ? { opacity: 1, scale: 1, y: 0 }
          : initial
      }
      transition={baseTransition(delay, 0.38, shouldReduceMotion)}
      style={{ willChange: shouldReduceMotion ? "auto" : "transform, opacity" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({
  children,
  className = "",
  staggerDelay = 0.1,
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView || shouldReduceMotion ? "visible" : "hidden"}
      variants={{
        hidden: { opacity: shouldReduceMotion ? 1 : 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: shouldReduceMotion ? 0 : staggerDelay,
            delayChildren: shouldReduceMotion ? 0 : 0.02,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "" }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={{
        hidden: shouldReduceMotion
          ? { opacity: 1, y: 0 }
          : { opacity: 0, y: 10 },
        visible: {
          opacity: 1,
          y: 0,
          transition: baseTransition(0, 0.34, shouldReduceMotion),
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SlideInFromSide({
  children,
  from = "left",
  className = "",
  delay = 0,
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const shouldReduceMotion = useReducedMotion();

  const initial = shouldReduceMotion
    ? { opacity: 1, x: 0 }
    : from === "left"
      ? { opacity: 0, x: -26 }
      : { opacity: 0, x: 26 };

  return (
    <motion.div
      ref={ref}
      initial={initial}
      animate={isInView || shouldReduceMotion ? { opacity: 1, x: 0 } : initial}
      transition={baseTransition(delay, 0.46, shouldReduceMotion)}
      style={{ willChange: shouldReduceMotion ? "auto" : "transform, opacity" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
