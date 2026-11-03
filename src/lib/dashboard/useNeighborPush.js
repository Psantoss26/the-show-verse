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
// que la de unas vecinas que ya estaban pintadas. Por eso el empuje y el
// despliegue arrancan con la MISMA `startTime`, fijada a mano. Misma duración y
// curva: los bordes avanzan pegados.
//
// Esa hora se fija EN EL MISMO COMMIT y unos fotogramas por delante
// (`OPEN_LEAD_MS`), no esperando a que la vista previa la reciba. Medido en
// Chrome con GPU: al montar la vista previa el hilo principal queda ocupado
// ~90 ms; el despliegue avanzaba en el compositor, pero las vecinas, en pausa
// hasta leer esa hora desde el hilo principal, no se movían y luego saltaban
// ~130 px en un fotograma (las filas apaisadas no empujan y no lo sufrían).
// Con la hora fijada antes, las dos van enteras en el compositor desde el
// primer fotograma, esté como esté el hilo principal.
//
// El desplazamiento se MIDE (ancho de la imagen de la vista previa − ancho de la
// tarjeta), en lugar de depender de píxeles fijos por breakpoint:
//   - centrada: cada lado se aparta la mitad de esa diferencia,
//   - pegada a un borde: solo se apartan las del lado contrario, la diferencia
//     entera.

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  getPreviewMorphLead,
  startPreviewMorphAt,
} from "@/lib/dashboard/usePreviewMorph";
import {
  DASHBOARD_PREVIEW_ENTER_TRANSITION,
  DASHBOARD_PREVIEW_EXIT_TRANSITION,
} from "@/lib/dashboard/previewTiming";

const PUSH_ID = "sv-neighbor-push";
// Margen hasta el arranque conjunto al ABRIR: lo que tarda el compositor en
// rasterizar la capa nueva de la vista previa. Medido: los fotogramas que se
// pierden por eso caen en los primeros ~50 ms; con 34 ms a veces se comían los
// dos primeros del movimiento. Sin margen el primer fotograma ya saldría
// avanzado (la curva de entrada recorre ~25 % en 16 ms).
const OPEN_LEAD_MS = 50;

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
          // Con la hora de inicio por delante, hasta entonces se queda donde
          // estaba (sin esto saltaría al destino, que ya es su estilo).
          fill: "backwards",
        },
      );
      animation.id = PUSH_ID;
      if (leadTile) {
        animation.pause();
        pending.push(animation);
      }
    });

    if (pending.length) {
      const start = (startTime) => {
        for (const animation of pending) {
          if (animation.playState === "idle") continue;
          animation.startTime = startTime;
        }
      };
      // La vista previa ya ha creado su animación en este commit (sus efectos
      // de layout corren antes que los de la fila), aún sin hora: se fija la
      // misma para las dos. Al cerrar no hay capa nueva que rasterizar y
      // arrancan ya.
      const lead = getPreviewMorphLead(leadTile);
      if (lead && lead.startTime == null) {
        const startTime =
          Math.max(document.timeline.currentTime ?? 0, performance.now()) +
          (active ? OPEN_LEAD_MS : 0);
        startPreviewMorphAt(leadTile, startTime);
        start(startTime);
        return;
      }
      if (lead?.startTime != null) {
        start(lead.startTime);
        return;
      }
      // Sin animación todavía (en desarrollo StrictMode puede volver a montar
      // la vista previa): se busca fotograma a fotograma. `ready` no sirve: se
      // resuelve ANTES de que el compositor asigne la `startTime` (medido: aún
      // vale null). Sin vista previa, o si tarda demasiado, las vecinas salen
      // igualmente.
      let frames = 0;
      const sync = () => {
        const current = getPreviewMorphLead(leadTile);
        if (current?.startTime != null) return start(current.startTime);
        if (!current || frames++ > 10) return start(document.timeline.currentTime);
        requestAnimationFrame(sync);
      };
      requestAnimationFrame(sync);
    }
  }, [rowRef, index, alignment, enabled, reduceMotion]);
}
