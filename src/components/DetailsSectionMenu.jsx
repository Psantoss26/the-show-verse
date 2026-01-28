"use client";

import React, { useMemo, useRef, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function DetailsSectionMenu({
  items = [],
  activeId,
  onChange,
  className = "",
  maxWidthClass = "max-w-[1400px]",
}) {
  const safeItems = useMemo(
    () => (Array.isArray(items) ? items.filter(Boolean) : []),
    [items],
  );

  const containerRef = useRef(null);
  const innerRef = useRef(null);

  const [scale, setScale] = useState(1);
  const [fits, setFits] = useState(true);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;

    let raf = 0;

    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const available = el.clientWidth || 0;

        inner.style.transform = "scale(1)";
        inner.style.transformOrigin = "center";

        const needed = inner.scrollWidth || 0;

        if (!available || !needed) {
          setFits(true);
          setScale(1);
          inner.style.transform = "scale(1)";
          return;
        }

        if (needed <= available) {
          setFits(true);
          setScale(1);
          inner.style.transform = "scale(1)";
        } else {
          const nextScale = Math.min(1, available / needed);
          setFits(false);
          setScale(nextScale);
          inner.style.transform = `scale(${nextScale})`;
          inner.style.transformOrigin = "center";
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
    <div className={["w-full", className].join(" ")}>
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
              "bg-gradient-to-br from-black/40 via-black/30 to-black/35",
              "border border-white/10",
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
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            className={[
                              "group relative flex items-center justify-center rounded-xl",
                              "px-3 py-2 sm:px-3.5 sm:py-2.5",
                              "transition-all duration-300 ease-out",
                              "outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50",
                              "whitespace-nowrap",
                              active ? "" : "hover:bg-white/5",
                            ].join(" ")}
                            title={item.label}
                            aria-label={item.label}
                          >
                            <AnimatePresence mode="wait">
                              {active && (
                                <motion.div
                                  layoutId="activeSectionBg"
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{
                                    type: "spring",
                                    stiffness: 800,
                                    damping: 20,
                                  }}
                                  className="absolute inset-0 rounded-xl bg-gradient-to-br from-yellow-500/15 via-yellow-400/8 to-orange-500/12 shadow-lg border border-yellow-500/20"
                                />
                              )}
                            </AnimatePresence>

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
                                        ? "text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.6)]"
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
                                  className="ml-1 rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-400 border border-yellow-500/30"
                                >
                                  {item.badge}
                                </motion.span>
                              )}
                            </div>

                            <AnimatePresence>
                              {active && (
                                <motion.span
                                  layoutId="activeSectionIndicator"
                                  initial={{ scaleX: 0, opacity: 0 }}
                                  animate={{ scaleX: 1, opacity: 1 }}
                                  exit={{ scaleX: 0, opacity: 0 }}
                                  transition={{
                                    type: "spring",
                                    stiffness: 800,
                                    damping: 20,
                                  }}
                                  className="absolute bottom-0 left-2 right-2 h-[2.5px] rounded-full bg-gradient-to-r from-yellow-500 via-yellow-400 to-orange-500 shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                                />
                              )}
                            </AnimatePresence>
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
    </div>
  );
}
