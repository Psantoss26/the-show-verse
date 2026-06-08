"use client";

import React, { useMemo, useRef, useLayoutEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export default function DetailsSectionMenu({
  items = [],
  activeId,
  onChange,
  className = "",
  maxWidthClass = "max-w-[1400px]",
  colorScheme = "yellow",
}) {
  const safeItems = useMemo(
    () => (Array.isArray(items) ? items.filter(Boolean) : []),
    [items],
  );

  const containerRef = useRef(null);
  const innerRef = useRef(null);
  const shouldReduceMotion = useReducedMotion();

  const [scale, setScale] = useState(1);
  const [fits, setFits] = useState(true);

  const colors = useMemo(() => {
    if (colorScheme === "emerald") {
      return {
        focusRing: "focus-visible:ring-emerald-500/50",
        activeBg:
          "from-emerald-500/15 via-emerald-400/8 to-teal-500/12 border-emerald-500/20",
        iconActive:
          "text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]",
        badgeBg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        indicator:
          "from-emerald-500 via-emerald-400 to-teal-500 shadow-[0_0_8px_rgba(52,211,153,0.5)]",
      };
    }
    return {
      focusRing: "focus-visible:ring-yellow-500/50",
      activeBg:
        "from-yellow-500/15 via-yellow-400/8 to-orange-500/12 border-yellow-500/20",
      iconActive: "text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.6)]",
      badgeBg: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      indicator:
        "from-yellow-500 via-yellow-400 to-orange-500 shadow-[0_0_8px_rgba(250,204,21,0.5)]",
    };
  }, [colorScheme]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;

    let raf = 0;

    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const available = el.clientWidth || 0;
        const needed = inner.scrollWidth || 0;

        if (!available || !needed) {
          setFits(true);
          setScale(1);
        } else if (needed <= available) {
          setFits(true);
          setScale(1);
        } else {
          setFits(false);
          setScale(Math.min(1, available / needed));
        }
      });
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(inner);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [safeItems.length]);

  if (safeItems.length === 0) return null;

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.4,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={["w-full", className].join(" ")}
    >
      <nav className={["mx-auto w-full", maxWidthClass].join(" ")}>
        <div
          className={[
            "relative isolate overflow-hidden rounded-2xl sm:rounded-3xl",
            "shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
            "transform-gpu",
          ].join(" ")}
          style={{ contain: "layout style" }}
        >
          <div
            className={[
              "absolute inset-0 rounded-[inherit] backdrop-blur-2xl",
              "bg-gradient-to-br from-white/[0.075] via-black/24 to-white/[0.045]",
              "border border-white/[0.14]",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
            ].join(" ")}
          />

          <div className="relative">
            <div>
              <div className="py-2.5">
                <div ref={containerRef} className="w-full overflow-hidden">
                  <div className="flex w-full justify-center">
                    <div
                      ref={innerRef}
                      className={[
                        "flex flex-nowrap items-center whitespace-nowrap",
                        fits
                          ? "w-full justify-between"
                          : "w-max justify-center",
                        "gap-1.5 sm:gap-2",
                        "px-5 sm:px-7",
                      ].join(" ")}
                      style={{
                        transform: `scale(${scale})`,
                        transformOrigin: "center",
                        willChange: "transform",
                      }}
                    >
                      {safeItems.map((item, index) => {
                        const Icon = item.icon;
                        const active = item.id === activeId;

                        return (
                          <motion.button
                            key={item.id}
                            onClick={() => onChange?.(item.id)}
                            type="button"
                            aria-current={active ? "page" : undefined}
                            initial={
                              shouldReduceMotion
                                ? false
                                : { opacity: 0, y: 6, scale: 0.99 }
                            }
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{
                              duration: shouldReduceMotion ? 0 : 0.32,
                              delay: shouldReduceMotion
                                ? 0
                                : 0.03 + index * 0.035,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            className={[
                              "group relative flex items-center justify-center overflow-hidden rounded-xl",
                              "px-3 py-2 sm:px-3.5 sm:py-2.5",
                              "transition-all duration-300 ease-out",
                              "outline-none focus-visible:ring-2",
                              colors.focusRing,
                              "whitespace-nowrap",
                              active ? "" : "hover:bg-white/5",
                            ].join(" ")}
                            title={item.label}
                            aria-label={item.label}
                          >
                            {active && (
                              <>
                                <motion.div
                                  aria-hidden="true"
                                  className={`absolute inset-0 rounded-xl bg-gradient-to-br shadow-lg border ${colors.activeBg}`}
                                  initial={false}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{
                                    duration: shouldReduceMotion ? 0 : 0.16,
                                    ease: "easeOut",
                                  }}
                                />
                                <motion.span
                                  aria-hidden="true"
                                  className={`absolute bottom-0 left-2 right-2 h-[2.5px] rounded-full bg-gradient-to-r ${colors.indicator}`}
                                  initial={false}
                                  animate={{ opacity: 1, scaleX: 1 }}
                                  transition={{
                                    duration: shouldReduceMotion ? 0 : 0.16,
                                    ease: "easeOut",
                                  }}
                                />
                              </>
                            )}
                            <div className="relative z-10 flex items-center gap-2">
                              {Icon && (
                                <motion.div
                                  animate={{
                                    scale: active ? 1.08 : 1,
                                    rotate: active ? [0, -3, 3, 0] : 0,
                                  }}
                                  transition={{
                                    duration: 0.2,
                                    ease: "easeOut",
                                  }}
                                >
                                  <Icon
                                    className={[
                                      "h-5 w-5 transition-all duration-300",
                                      active
                                        ? colors.iconActive
                                        : "text-zinc-400 group-hover:text-zinc-200",
                                    ].join(" ")}
                                  />
                                </motion.div>
                              )}

                              <motion.span
                                animate={{
                                  scale: active ? 1.02 : 1,
                                }}
                                transition={{ duration: 0.3 }}
                                className={[
                                  "hidden sm:inline",
                                  "text-sm font-semibold tracking-wider uppercase transition-all duration-300",
                                  active
                                    ? "text-white font-bold"
                                    : "text-zinc-400 group-hover:text-zinc-200",
                                ].join(" ")}
                              >
                                {item.label}
                              </motion.span>

                              {item.badge && (
                                <motion.span
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{
                                    duration: 0.15,
                                    ease: "easeOut",
                                  }}
                                  className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold border ${colors.badgeBg}`}
                                >
                                  {item.badge}
                                </motion.span>
                              )}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </motion.div>
  );
}
