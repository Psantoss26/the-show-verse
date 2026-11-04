// src/hooks/usePixelSnappedTop.js
"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * `ref` para un elemento pequeño con texto y formas (p. ej. la insignia del
 * plan) que debe quedar centrado al píxel. Chrome pinta el texto en una línea
 * de píxel entero pero las cajas y fondos en su posición real: si la maqueta
 * deja el elemento en y = 190,84, el texto «sube» o «baja» hasta 0,9 px
 * respecto a su icono. Aquí se mueve el elemento (`position: relative; top`,
 * que no toca la maqueta de alrededor) al píxel entero más cercano.
 *
 * Se recalcula al cambiar de tamaño `observe` (por defecto el padre: cubre el
 * cambio de tamaño del nombre con el ancho) o el documento, al redimensionar
 * la ventana y al cargar las fuentes. Si la insignia o un antecesor se está
 * animando (la entrada de la cabecera), espera a que termine. Mientras el
 * elemento está `inert` (capa oculta de la cabecera del perfil) no se mide: su
 * posición la mueve una transformación.
 */
export default function usePixelSnappedTop({ enabled = true, observe = null } = {}) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return undefined;

    let frame = 0;
    let cancelled = false;
    let waiting = false;
    // Animaciones en curso de la insignia o de sus antecesores (la entrada de
    // la cabecera la desplaza con `transform`): medir entonces daría una
    // posición que no es la final.
    const runningAnimations = () => {
      const list = [];
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        for (const animation of node.getAnimations?.() || []) {
          if (animation.playState === "running" || animation.playState === "pending") list.push(animation);
        }
      }
      return list;
    };
    const snap = () => {
      frame = 0;
      if (cancelled || el.closest("[inert]")) return;
      const animations = runningAnimations();
      if (animations.length) {
        if (!waiting) {
          waiting = true;
          Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
            waiting = false;
            schedule();
          });
        }
        return;
      }
      const current = Number.parseFloat(el.style.top) || 0;
      const top = el.getBoundingClientRect().top + window.scrollY - current;
      // En sesenta y cuatroavos de píxel, la unidad de maqueta de Chrome: un
      // desplazamiento redondeado a decimales (0,156 en vez de 0,15625) se
      // queda corto, deja la insignia en 190,984 y el texto cae al píxel de
      // arriba, peor que sin ajustar.
      const units = Math.round(top * 64);
      const offset = (Math.round(units / 64) * 64 - units) / 64;
      const next = offset === 0 ? "" : `${offset}px`;
      if (el.style.top !== next) el.style.top = next;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(snap);
    };

    el.style.position = "relative";
    snap();

    const target = (observe && el.closest(observe)) || el.parentElement;
    const ro = new ResizeObserver(schedule);
    if (target) ro.observe(target);
    // Lo que crece por encima (barra superior, avisos) la mueve sin cambiar
    // el tamaño de `target`, pero sí el alto del documento.
    ro.observe(document.documentElement);
    window.addEventListener("resize", schedule);
    document.fonts?.ready?.then(() => {
      if (!cancelled) schedule();
    });

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      el.style.top = "";
      el.style.position = "";
    };
  }, [enabled, observe]);

  return ref;
}
