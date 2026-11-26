"use client";

// /src/hooks/useActionModalMotion.js
// Entrada y salida animadas de los modales de los botones de acción de las
// fichas. El panel nace del botón pulsado y vuelve a él al cerrar; el fondo se
// funde. Ver src/lib/ui/actionModalMotion.js para el diseño y sus reglas.
//
// Uso:
//   const { present, closing, panelRef, backdropRef } = useActionModalMotion(open);
//   if (!present) return null;
//   <div className={closing ? "pointer-events-none" : ""}>
//     <div ref={backdropRef} … />
//     <div ref={panelRef} … />
//
// `present` sigue en true mientras dura la salida, así que el modal se
// desmonta solo cuando el panel ya ha vuelto al botón.

import { useLayoutEffect, useRef, useState } from "react";
import { BACK_PANEL_ATTR, takeBackGesture } from "@/lib/navigation/modalBackGesture";
import { ORIGIN_MAX_AGE_MS, buildModalMotion } from "@/lib/ui/actionModalMotion";

// ---- Origen: el último botón pulsado ------------------------------------
// Un único escuchador en captura (antes que el onClick del botón) recuerda el
// elemento pulsado. Así cualquier botón de cualquier ficha (DetailsClient,
// DetailModal, temporada, episodio) sirve de origen sin tocar cada botón.
let lastPress = null;
let trackerInstalled = false;

function recordPress(event) {
  const target = event.target;
  const el = target?.closest?.('[data-action-modal-origin], button, [role="button"], a');
  if (el) lastPress = { el, time: performance.now() };
}

function ensurePressTracker() {
  if (trackerInstalled || typeof document === "undefined") return;
  trackerInstalled = true;
  document.addEventListener("pointerdown", recordPress, true);
  document.addEventListener("click", recordPress, true);
}

function recentOriginElement() {
  if (!lastPress) return null;
  if (performance.now() - lastPress.time > ORIGIN_MAX_AGE_MS) return null;
  return lastPress.el?.isConnected ? lastPress.el : null;
}

function rectOf(el) {
  if (!el?.isConnected) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function canAnimate(el) {
  return !!el && typeof el.animate === "function";
}

// `anchor: "below"`: para desplegables que cuelgan de un botón de la barra
// superior. El panel nace y vuelve bajo el botón (su borde superior no se
// mueve) en vez de encogerse hasta el centro del botón, encima de la barra.
export default function useActionModalMotion(open, { anchor = "center" } = {}) {
  const [present, setPresent] = useState(!!open);
  const panelRef = useRef(null);
  const backdropRef = useRef(null);
  const originElRef = useRef(null);
  const runningRef = useRef([]);

  // Estado derivado: al abrir se monta en el mismo render (sin esperar a un
  // efecto), para que el efecto de abajo ya encuentre el panel en el DOM.
  if (open && !present) setPresent(true);

  useLayoutEffect(() => {
    ensurePressTracker();
  }, []);

  useLayoutEffect(() => {
    if (!open && !present) return undefined;

    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    let cancelled = false;

    // Panel que mueve el gesto de atrás de la app de Android (modalBackGesture).
    // Si la salida viene de ese gesto, la recoge: parte de donde lo dejó el dedo.
    if (open) panel?.setAttribute(BACK_PANEL_ATTR, "");
    const gestureTransform = open ? null : takeBackGesture(panel);

    // Donde esté AHORA el panel (p. ej. a mitad de una salida que se
    // interrumpe reabriendo): la nueva animación parte de ahí, sin saltos.
    const currentTransform =
      panel && runningRef.current.length ? getComputedStyle(panel).transform : null;
    for (const a of runningRef.current) a.cancel();
    runningRef.current = [];

    if (open) originElRef.current = recentOriginElement() ?? originElRef.current;

    if (!canAnimate(panel)) {
      if (!open) setPresent(false);
      return undefined;
    }

    const plan = buildModalMotion({
      phase: open ? "enter" : "exit",
      panelRect: rectOf(panel),
      originRect: rectOf(originElRef.current),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      reducedMotion: prefersReducedMotion(),
      anchor,
    });

    const anims = [];
    if (plan.panel) {
      const keyframes = plan.panel.keyframes.map((k) => ({ ...k }));
      if (currentTransform && currentTransform !== "none") keyframes[0].transform = currentTransform;
      else if (gestureTransform) keyframes[0].transform = gestureTransform;
      anims.push(panel.animate(keyframes, plan.panel.options));
    }
    if (plan.panelFade) anims.push(panel.animate(plan.panelFade.keyframes, plan.panelFade.options));
    if (plan.backdrop && canAnimate(backdrop)) {
      anims.push(backdrop.animate(plan.backdrop.keyframes, plan.backdrop.options));
    }
    runningRef.current = anims;

    if (!open) {
      Promise.all(anims.map((a) => a.finished))
        .then(() => {
          if (cancelled) return;
          runningRef.current = [];
          originElRef.current = null;
          setPresent(false);
        })
        .catch(() => {});
    } else {
      Promise.all(anims.map((a) => a.finished))
        .then(() => {
          if (cancelled) return;
          runningRef.current = [];
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
    // `present` no es dependencia a propósito: solo el cambio de `open` lanza
    // una fase nueva; el montaje que provoca `present` ya llega con `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Al desmontar el componente entero, nada sigue animando.
  useLayoutEffect(
    () => () => {
      for (const a of runningRef.current) a.cancel();
      runningRef.current = [];
    },
    [],
  );

  return { present, closing: present && !open, panelRef, backdropRef };
}
