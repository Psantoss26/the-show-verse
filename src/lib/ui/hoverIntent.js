// HOVER CON INTENCIÓN para las tarjetas de las páginas de usuario (Favoritos,
// Pendientes, Historial, En progreso).
//
// Con `:hover` la tarjeta reaccionaba en cuanto el cursor la ROZABA: al cruzar
// la cuadrícula camino de otra parte, cada tarjeta del recorrido empezaba a
// ampliarse, encendía el anillo de color y mostraba su indicador, y se
// deshacía un instante después. Aquí el hover se activa solo cuando el cursor
// se PARA sobre la tarjeta (o se queda mucho rato encima moviéndose muy
// despacio), y se quita en cuanto sale.
//
// Cómo se usa:
// - La tarjeta lleva `data-sv-hover-card`. Al reposar el cursor recibe
//   `data-sv-hover` y el evento `sv-hoverintent`; al salir pierde el atributo y
//   recibe `sv-hoverintentend`.
// - El CSS cuelga de ese atributo con las variantes de Tailwind `intent:` y
//   `group-intent:` (globals.css) en lugar de `hover:` y `group-hover:`.
// - `HoverExpandCard` con `hoverIntent` se amplía con el evento.
// - `useHoverIntent()` instala los oyentes (una sola vez para toda la app):
//   delegados en el documento, sin estado de React ni renders por tarjeta.
//
// Solo ratón: en táctil no hay hover y nada de esto se activa.

import { useEffect } from "react";

// Quieto así de tiempo (con temblor de hasta HOVER_TOLERANCE_PX) = intención.
export const HOVER_REST_MS = 100;
export const HOVER_TOLERANCE_PX = 6;
// Encima tanto tiempo, aunque se mueva despacio, también cuenta: cruzar una
// tarjeta de lado a lado tan lento ya es detenerse en ella. Solo si va DESPACIO
// (menos de HOVER_SLOW_PX_PER_MS en los últimos HOVER_SPEED_WINDOW_MS): las
// filas de la vista de lista son tan anchas que cruzarlas deprisa también
// lleva más de 450 ms.
export const HOVER_MAX_MS = 450;
export const HOVER_SLOW_PX_PER_MS = 0.35;
export const HOVER_SPEED_WINDOW_MS = 100;

export const HOVER_CARD_ATTR = "data-sv-hover-card";
export const HOVER_ACTIVE_ATTR = "data-sv-hover";
export const HOVER_INTENT_EVENT = "sv-hoverintent";
export const HOVER_INTENT_END_EVENT = "sv-hoverintentend";

// Detector de reposo, sin DOM (se prueba con temporizadores falsos).
export function createRestDetector({
  restMs = HOVER_REST_MS,
  tolerancePx = HOVER_TOLERANCE_PX,
  maxMs = HOVER_MAX_MS,
  slowPxPerMs = HOVER_SLOW_PX_PER_MS,
  speedWindowMs = HOVER_SPEED_WINDOW_MS,
  now = () => performance.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  onRest,
}) {
  let restTimer = null;
  let maxTimer = null;
  let anchorX = 0;
  let anchorY = 0;
  let active = false;
  let fired = false;
  // Posiciones recientes para medir la velocidad: [t, x, y].
  let samples = [];

  const record = (x, y) => {
    const t = now();
    samples.push([t, x, y]);
    while (samples.length > 2 && t - samples[1][0] >= speedWindowMs) samples.shift();
  };
  // Velocidad media en la ventana; quieto desde hace rato = 0.
  const speed = () => {
    const t = now();
    const last = samples[samples.length - 1];
    if (!last || t - last[0] >= speedWindowMs) return 0;
    const first = samples[0];
    const span = Math.max(t - first[0], 1);
    return Math.hypot(last[1] - first[1], last[2] - first[2]) / span;
  };

  const clear = () => {
    if (restTimer != null) clearTimer(restTimer);
    if (maxTimer != null) clearTimer(maxTimer);
    restTimer = null;
    maxTimer = null;
  };
  const fire = () => {
    if (!active || fired) return;
    fired = true;
    clear();
    onRest?.();
  };
  const checkMax = () => {
    maxTimer = null;
    if (!active || fired) return;
    if (speed() <= slowPxPerMs) fire();
    else maxTimer = setTimer(checkMax, 50);
  };
  const scheduleRest = () => {
    if (restTimer != null) clearTimer(restTimer);
    restTimer = setTimer(fire, restMs);
  };

  return {
    enter(x, y) {
      clear();
      active = true;
      fired = false;
      anchorX = x;
      anchorY = y;
      samples = [];
      record(x, y);
      scheduleRest();
      maxTimer = setTimer(checkMax, maxMs);
    },
    move(x, y) {
      if (!active || fired) return;
      record(x, y);
      if (Math.hypot(x - anchorX, y - anchorY) <= tolerancePx) return;
      anchorX = x;
      anchorY = y;
      scheduleRest();
    },
    leave() {
      clear();
      active = false;
      fired = false;
      samples = [];
    },
  };
}

let installed = false;

function installHoverIntent() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  let current = null;

  const end = () => {
    const card = current;
    current = null;
    detector.leave();
    if (card?.hasAttribute(HOVER_ACTIVE_ATTR)) {
      card.removeAttribute(HOVER_ACTIVE_ATTR);
      card.dispatchEvent(new CustomEvent(HOVER_INTENT_END_EVENT));
    }
  };

  const detector = createRestDetector({
    onRest: () => {
      const card = current;
      if (!card?.isConnected) return;
      card.setAttribute(HOVER_ACTIVE_ATTR, "");
      card.dispatchEvent(new CustomEvent(HOVER_INTENT_EVENT));
    },
  });

  const onOver = (event) => {
    if (event.pointerType !== "mouse") return;
    const card = event.target?.closest?.(`[${HOVER_CARD_ATTR}]`) || null;
    if (card === current) return;
    if (current) end();
    if (!card) return;
    current = card;
    detector.enter(event.clientX, event.clientY);
  };
  const onMove = (event) => {
    if (current && event.pointerType === "mouse") {
      detector.move(event.clientX, event.clientY);
    }
  };
  // Sale de la ventana (o el puntero se pierde): no queda nada encendido.
  const onOut = (event) => {
    if (current && !event.relatedTarget) end();
  };

  const opts = { capture: true, passive: true };
  document.addEventListener("pointerover", onOver, opts);
  document.addEventListener("pointermove", onMove, opts);
  document.addEventListener("pointerout", onOut, opts);
  document.addEventListener("pointercancel", end, opts);
  window.addEventListener("blur", end);
}

// Instala los oyentes (idempotente). Lo llaman las páginas con tarjetas de
// hover con intención y `HoverExpandCard` cuando lo usa.
export function useHoverIntent(enabled = true) {
  useEffect(() => {
    if (enabled) installHoverIntent();
  }, [enabled]);
}
