"use client";

import { Component, createRef } from "react";

// Recolocación animada de tarjetas cuando cambia el ORDEN de una lista
// (ordenar, filtrar, llegada de puntuaciones que reordenan).
//
// Técnica FLIP con Web Animations: justo antes de que React aplique el nuevo
// orden al DOM (`getSnapshotBeforeUpdate`) se mide dónde se VE cada tarjeta; tras
// el commit se mide dónde ha quedado y se anima `translate` desde la posición
// antigua hasta la nueva.
//
// Por qué no `layout` de framer-motion: su proyección calcula y escribe la
// posición de CADA tarjeta en JavaScript en cada fotograma. Con cientos de
// tarjetas el hilo principal se satura (medido: fotogramas de 90-160 ms) y la
// recolocación se ve a tirones, ralentizada. Aquí la animación corre en el
// compositor y solo se anima lo que está a la vista.
//
// Se anima `translate` (propiedad individual) y no `transform`: framer usa
// `transform` para la entrada de las tarjetas (y/scale) y ambas se componen sin
// pisarse.

const FLIP_DURATION_MS = 320;
// Arranque rápido y frenada suave (ease-out), sin cola eterna.
const FLIP_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
// Margen fuera de la pantalla desde el que entra una tarjeta que venía de lejos.
const OFFSCREEN_ENTRY_MARGIN_PX = 24;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

// Clave estable por tarjeta. Un título puede salir en varios grupos (géneros,
// plataformas): la n-ésima aparición de una clave se empareja con la n-ésima.
function collectItems(container, selector) {
  const items = new Map();
  const seen = new Map();
  for (const el of container.querySelectorAll(selector)) {
    const base = el.getAttribute("data-flip-key");
    if (!base) continue;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    items.set(`${base}#${n}`, el);
  }
  return items;
}

export default class FlipReorder extends Component {
  containerRef = createRef();
  // Recolocaciones en curso que lanzó este componente. Se guardan aquí en vez de
  // consultar `el.getAnimations()`: esa llamada en cientos de tarjetas costaba
  // ~60 ms (medido) justo en el fotograma en que debía empezar el movimiento.
  running = new Set();

  componentWillUnmount() {
    for (const animation of this.running) animation.cancel();
    this.running.clear();
  }

  getSnapshotBeforeUpdate(prevProps) {
    if (this.props.disabled) return null;
    if (prevProps.orderKey === this.props.orderKey) return null;
    if (prefersReducedMotion()) return null;
    const container = this.containerRef.current;
    if (!container) return null;

    // Posición VISUAL (incluye una recolocación en curso, para encadenar sin
    // saltos si el orden vuelve a cambiar a mitad), en coordenadas de documento.
    const { scrollX, scrollY } = window;
    const rects = new Map();
    for (const [key, el] of collectItems(container, this.props.itemSelector)) {
      const r = el.getBoundingClientRect();
      rects.set(key, { x: r.left + scrollX, y: r.top + scrollY });
    }
    return rects;
  }

  componentDidUpdate(_prevProps, _prevState, snapshot) {
    if (!snapshot) return;
    const container = this.containerRef.current;
    if (!container) return;

    // Primero se quitan las recolocaciones en curso: la medida nueva debe ser la
    // posición de layout, no la visual.
    for (const animation of this.running) animation.cancel();
    this.running.clear();
    const items = collectItems(container, this.props.itemSelector);

    const { scrollX, scrollY, innerHeight: vh, innerWidth: vw } = window;
    const isOnScreen = (left, top, width, height) =>
      top < vh && top + height > 0 && left < vw && left + width > 0;

    for (const [key, el] of items) {
      const from = snapshot.get(key);
      if (!from) continue; // tarjeta nueva: la anima su propia entrada
      const r = el.getBoundingClientRect();
      const toX = r.left + scrollX;
      const toY = r.top + scrollY;
      const dx = from.x - toX;
      let dy = from.y - toY;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      const oldLeft = from.x - scrollX;
      const oldTop = from.y - scrollY;
      const wasOnScreen = isOnScreen(oldLeft, oldTop, r.width, r.height);
      const isNowOnScreen = isOnScreen(r.left, r.top, r.width, r.height);
      // Fuera de la pantalla antes y después: nadie la ve moverse.
      if (!wasOnScreen && !isNowOnScreen) continue;

      // Borde de la pantalla por el que entra o sale una tarjeta que viene de
      // (o va a) una posición fuera de la vista.
      const edgeOffset = (top) =>
        (top < 0
          ? -r.height - OFFSCREEN_ENTRY_MARGIN_PX
          : vh + OFFSCREEN_ENTRY_MARGIN_PX) - r.top;

      let keyframes = [
        { translate: `${dx}px ${dy}px` },
        { translate: "0px 0px" },
      ];
      if (!wasOnScreen) {
        // Viene de lejos (p. ej. del final de la lista al invertir el orden):
        // entra desde justo fuera del borde por el que venía, con fundido, en
        // vez de cruzar miles de píxeles en un fotograma.
        dy = edgeOffset(oldTop);
        keyframes = [
          { translate: `${dx}px ${dy}px`, opacity: 0 },
          { translate: "0px 0px", opacity: 1 },
        ];
      } else if (!isNowOnScreen) {
        // Se va lejos: sale desde donde estaba hasta justo fuera del borde, con
        // fundido. Antes recorría miles de píxeles en uno o dos fotogramas y
        // parecía desaparecer de golpe. Al terminar queda en su sitio real, ya
        // fuera de la vista.
        const exitDy = r.top < 0 ? edgeOffset(-1) : edgeOffset(vh);
        keyframes = [
          { translate: `${dx}px ${dy}px`, opacity: 1 },
          { translate: `0px ${exitDy}px`, opacity: 0 },
        ];
      }

      const animation = el.animate(keyframes, {
        duration: FLIP_DURATION_MS,
        easing: FLIP_EASING,
      });
      this.running.add(animation);
      animation.onfinish = () => this.running.delete(animation);
    }
  }

  render() {
    const { className, children } = this.props;
    return (
      <div ref={this.containerRef} className={className}>
        {children}
      </div>
    );
  }
}
