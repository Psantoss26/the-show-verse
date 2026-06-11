"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ImageOff } from "lucide-react";

export default function AnimatedPosterFrame({
  src,
  alt,
  aspect = "poster",
  className = "",
  imgClassName = "",
  loading = "eager",
  fetchPriority = "high",
  fallbackClassName = "",
}) {
  const wrapRef = useRef(null);
  const tiltRef = useRef(null);
  const rafRef = useRef(0);
  const targetRef = useRef({ rx: 0, ry: 0, s: 1 });
  const stateRef = useRef({ rx: 0, ry: 0, s: 1 });
  const lastInputRef = useRef(0);
  const shouldReduceMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (shouldReduceMotion || typeof window === "undefined") {
      setEnabled(false);
      return;
    }

    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setEnabled(media.matches);

    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [shouldReduceMotion]);

  const setTargetFromPointer = useCallback(
    (clientX, clientY) => {
      if (!enabled) return;
      const wrap = wrapRef.current;
      if (!wrap) return;

      const rect = wrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;

      targetRef.current = {
        rx: ((y - cy) / cy) * -10,
        ry: ((x - cx) / cx) * 10,
        s: 1.055,
      };
      lastInputRef.current =
        typeof performance !== "undefined" ? performance.now() : Date.now();
    },
    [enabled],
  );

  const resetTarget = useCallback(() => {
    targetRef.current = { rx: 0, ry: 0, s: 1 };
    lastInputRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();
  }, []);

  useEffect(() => {
    if (!enabled) {
      const el = tiltRef.current;
      if (el) {
        el.style.transform =
          "translateZ(0) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
      }
      return;
    }

    const el = tiltRef.current;
    if (!el) return;

    let mounted = true;
    const loop = (time) => {
      if (!mounted) return;

      const now =
        time ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
      const idle = now - lastInputRef.current > 220;
      let target = targetRef.current;

      if (idle) {
        const seconds = now / 1000;
        target = {
          rx: Math.sin(seconds * 1.05) * 4.8,
          ry: Math.cos(seconds * 0.9) * 7.2,
          s: 1.025 + Math.sin(seconds * 1.6) * 0.008,
        };
      }

      const current = stateRef.current;
      const easing = 0.14;
      current.rx += (target.rx - current.rx) * easing;
      current.ry += (target.ry - current.ry) * easing;
      current.s += (target.s - current.s) * easing;

      el.style.transform =
        `translateZ(0) rotateX(${current.rx.toFixed(3)}deg) rotateY(${current.ry.toFixed(3)}deg) ` +
        `scale3d(${current.s.toFixed(4)}, ${current.s.toFixed(4)}, ${current.s.toFixed(4)})`;

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [enabled, src]);

  const aspectClass = aspect === "video" ? "aspect-video" : "aspect-[2/3]";

  return (
    <div
      ref={wrapRef}
      onPointerMove={(event) =>
        setTargetFromPointer(event.clientX, event.clientY)
      }
      onPointerLeave={resetTarget}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setTargetFromPointer(event.clientX, event.clientY);
      }}
      className={`relative ${className}`}
      style={{
        perspective: enabled ? 1100 : undefined,
        transformStyle: "preserve-3d",
        touchAction: "none",
      }}
    >
      <div
        ref={tiltRef}
        className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/80 bg-black/40 will-change-transform"
        style={{
          transformStyle: "preserve-3d",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          outline: "1px solid transparent",
          isolation: "isolate",
          WebkitMaskImage: "-webkit-radial-gradient(white, black)",
        }}
      >
        {/* Borde premium suavizado en la capa superior para evitar entrecortados */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/15 z-30" />
        <div className={`relative bg-neutral-950 overflow-hidden ${aspectClass}`}>
          {src ? (
            <img
              src={src}
              alt={alt}
              className={`absolute inset-0 w-full h-full object-cover transform-gpu ${imgClassName}`}
              loading={loading}
              decoding="async"
              fetchPriority={fetchPriority}
              style={{ transform: "translateZ(0) scale(1.02)" }}
            />
          ) : (
            <div
              className={`absolute inset-0 flex items-center justify-center ${fallbackClassName}`}
            >
              <ImageOff className="w-10 h-10 text-neutral-700" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
