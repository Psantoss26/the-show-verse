"use client";


import OptimizedImage from "@/components/OptimizedImage";
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
  // Contenido opcional superpuesto DENTRO del marco (recortado por las esquinas
  // redondeadas y con la misma inclinación 3D). El overlay controla su propia
  // aparición con `group-hover/still:` (el wrapper expone el grupo `still`).
  // Es SOLO visual (sin eventos): se inclina con la imagen para quedar integrado.
  overlay = null,
  // Capa clicable opcional, FIJA (fuera del marco 3D): no se mueve con la
  // inclinación, por lo que el clic se registra siempre. Aquí van los enlaces /
  // botones (un elemento que se mueve entre mousedown y mouseup no dispara
  // `click`). El botón play va centrado = eje de giro, así coincide con el
  // botón visible del `overlay`.
  hitLayer = null,
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
      // En reposo (sin mover el puntero) volvemos a PLANO y nos QUEDAMOS quietos,
      // en vez de flotar sin parar. El overlay va DENTRO del marco (se inclina con
      // la imagen = integrado); si el marco no parase, se movería cada frame y el
      // clic sobre el botón no se registraría. Así, al pausar para pulsar, el
      // marco está plano y quieto → clicable e integrado.
      const idle = now - lastInputRef.current > 140;
      const target = idle ? { rx: 0, ry: 0, s: 1 } : targetRef.current;

      const current = stateRef.current;
      const easing = 0.16;
      current.rx += (target.rx - current.rx) * easing;
      current.ry += (target.ry - current.ry) * easing;
      current.s += (target.s - current.s) * easing;
      // Snap: al acercarse al objetivo, fijar exactamente para que el transform
      // DEJE de cambiar (el asíntota dejaría el elemento "moviéndose" y Playwright
      // y el navegador no registrarían el clic).
      if (Math.abs(target.rx - current.rx) < 0.02) current.rx = target.rx;
      if (Math.abs(target.ry - current.ry) < 0.02) current.ry = target.ry;
      if (Math.abs(target.s - current.s) < 0.0008) current.s = target.s;

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
      className={`group/still relative ${className}`}
      style={{
        touchAction: "none",
      }}
    >
      {/* Contexto 3D acotado SOLO al marco: así el overlay (hermano de este
          contenedor, fuera del preserve-3d) no entra en el orden 3D y no queda
          tapado por la imagen inclinada. */}
      <div
        className="relative"
        style={{
          perspective: enabled ? 1100 : undefined,
          transformStyle: "preserve-3d",
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
            <OptimizedImage
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

          {/* Overlay DENTRO del marco: se inclina con la imagen (integrado). El
              contenedor no captura eventos (así el hover/tilt de la portada sigue
              activo); solo el enlace/botón del overlay reciben clic al hover. El
              marco queda plano y quieto en reposo, por lo que el clic se registra. */}
          {overlay ? (
            <div className="pointer-events-none absolute inset-0 z-20">
              {overlay}
            </div>
          ) : null}
        </div>
      </div>
      </div>

      {/* Capa clicable FIJA (hermana del contexto 3D, fuera del preserve-3d):
          no se inclina ni se mueve, así el clic siempre se registra. El
          contenedor no captura eventos; solo sus hijos (enlaces/botones) los
          reciben, al hover, vía `group-hover/still:`. */}
      {hitLayer ? (
        <div className="pointer-events-none absolute inset-0 z-40">
          {hitLayer}
        </div>
      ) : null}
    </div>
  );
}
