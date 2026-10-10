"use client";

// /src/lib/dashboard/useNeighborPush.js
// Empuje de las tarjetas vecinas en las filas de pósters: se apartan para dejar
// el hueco justo de la vista previa que se abre y vuelven al cerrarse.
//
// Va con Web Animations, no con una transición CSS, para arrancar EN EL MISMO
// INSTANTE que el despliegue de la vista previa (`usePreviewMorph`). Medido: con
// una transición CSS las vecinas empezaban a moverse un fotograma antes que la
// vista previa, y el hueco entre ellas se abría hasta 46 px en vez de los 20 de
// la separación normal. Tampoco basta con crearlas en el mismo commit: la
// vista previa es una capa NUEVA que el compositor tiene que rasterizar antes de
// presentarla, y su animación recibe la hora de inicio un fotograma más tarde
// que la de unas vecinas que ya estaban pintadas. Por eso el empuje se crea en
// pausa y arranca con la MISMA `startTime` que la animación de la vista previa
// cuando esta queda lista. Misma duración y curva: los bordes avanzan pegados.
//
// El desplazamiento se MIDE (ancho de la imagen de la vista previa − ancho de la
// tarjeta), en lugar de depender de píxeles fijos por breakpoint:
//   - centrada: cada lado se aparta la mitad de esa diferencia,
//   - pegada a un borde: solo se apartan las del lado contrario, la diferencia
//     entera.

import { useEffect, useLayoutEffect, useRef } from "react";
import { getPreviewMorphLead } from "@/lib/dashboard/usePreviewMorph";
import {
  DASHBOARD_PREVIEW_ENTER_TRANSITION,
  DASHBOARD_PREVIEW_EXIT_TRANSITION,
} from "@/lib/dashboard/previewTiming";

const PUSH_ID = "sv-neighbor-push";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const toCubicBezier = (ease) => `cubic-bezier(${ease.join(", ")})`;

function readTranslateX(el) {
  const value = getComputedStyle(el).translate;
  if (!value || value === "none") return 0;
  return parseFloat(value) || 0;
}

export default function useNeighborPush(
  rowRef,
  { index = null, alignment = "center", enabled = true, reduceMotion = false } = {},
) {
  // Tarjeta cuya vista previa manda en este movimiento: la que se abre o, al
  // cerrar, la que se estaba mostrando.
  const lastActiveRef = useRef(null);

  useIsomorphicLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || !enabled) return;
    const tiles = [...row.querySelectorAll("[data-preview-tile]")];
    const active = index != null && index >= 0 ? tiles[index] : null;
    const leadTile = active || lastActiveRef.current;
    lastActiveRef.current = active;
    const pending = [];

    let gap = 0;
    if (active) {
      const tileW = active.offsetWidth;
      const previewW =
        active.querySelector("[data-preview-media]")?.offsetWidth ||
        (active.offsetHeight * 16) / 9;
      gap = Math.max(0, previewW - tileW);
    }

    const timing = active
      ? DASHBOARD_PREVIEW_ENTER_TRANSITION
      : DASHBOARD_PREVIEW_EXIT_TRANSITION;

    tiles.forEach((el, i) => {
      let target = 0;
      if (active && i !== index) {
        if (alignment === "left") target = i > index ? gap : 0;
        else if (alignment === "right") target = i < index ? -gap : 0;
        else target = i < index ? -gap / 2 : gap / 2;
      }

      // Posición de ESTE instante, también a mitad de un empuje anterior: el
      // siguiente sale de ahí y nunca salta.
      const current = readTranslateX(el);
      for (const running of el.getAnimations()) {
        if (running.id === PUSH_ID) running.cancel();
      }
      if (target) el.style.translate = `${target}px 0px`;
      else el.style.removeProperty("translate");

      if (reduceMotion || Math.abs(current - target) < 0.5) return;
      const animation = el.animate(
        [{ translate: `${current}px 0px` }, { translate: `${target}px 0px` }],
        {
          duration: timing.duration * 1000,
          easing: toCubicBezier(timing.ease),
        },
      );
      animation.id = PUSH_ID;
      if (leadTile) {
        animation.pause();
        pending.push(animation);
      }
    });

    if (pending.length) {
      // La animación de la vista previa se busca AL SINCRONIZAR, no ahora: en
      // desarrollo StrictMode vuelve a montar la vista previa (no esta fila) y
      // la animación que existe en este instante se cancela enseguida.
      // `ready` tampoco sirve: se resuelve ANTES de que el compositor asigne la
      // `startTime` (medido: aún vale null), así que se espera fotograma a
      // fotograma a que exista. Sin vista previa, o si tarda demasiado, las
      // vecinas salen igualmente.
      let frames = 0;
      const start = (startTime) => {
        for (const animation of pending) {
          if (animation.playState === "idle") continue;
          animation.startTime = startTime;
        }
      };
      const sync = () => {
        const lead = getPreviewMorphLead(leadTile);
        if (lead?.startTime != null) return start(lead.startTime);
        if (!lead || frames++ > 10) return start(document.timeline.currentTime);
        requestAnimationFrame(sync);
      };
      requestAnimationFrame(sync);
    }
  }, [rowRef, index, alignment, enabled, reduceMotion]);
}
