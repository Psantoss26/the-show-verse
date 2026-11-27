"use client";

import { Component, createRef } from "react";
import { flipFrames } from "@/lib/details/tilesLayoutFlip";

// Contenedor de los bloques del marcador (Plataformas, Actividad, Enlaces,
// Compartir) o de su fila de iconos del teléfono. Cuando cambia `layoutKey`
// (entra o sale Actividad) los bloques no saltan a su distribución nueva: cada
// uno viaja con FLIP desde su caja anterior (sitio y tamaño), el que entra
// crece desde su centro y el que se va encoge en una copia que se retira al
// acabar.
//
// `snapshotTiles` + `playTilesFlip` sirven también a `useScoreRowFit`: cuando
// el reparto marcador / bloques de DetailModal se suelta al acabar de cargar
// las puntuaciones, los bloques pasan a su ancho final con el mismo FLIP.
//
// Solo `transform` con Web Animations (compositor): la opacidad en el bloque o
// en un ancestro apaga el cristal (`backdrop-filter`) de sus capas.
//
// Clase y no hook: la caja anterior se mide en `getSnapshotBeforeUpdate`, justo
// antes de que React aplique la distribución nueva.

export const TILES_RELAYOUT_EVENT = "sv-tiles-relayout";

const DURATION_MS = 340;
const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
// Icono y nombre del bloque (y el icono de la píldora): deshacen la escala.
const CONTENT_SELECTOR = ":scope > svg, :scope > .sv-score-tile-label";

// Animaciones y copias en curso de cada contenedor: un cambio nuevo las corta
// y arranca desde donde se veían (la caja VISUAL medida en la instantánea).
const flipState = new WeakMap();

function stateOf(container) {
  let state = flipState.get(container);
  if (!state) {
    state = { running: new Set(), ghosts: new Set() };
    flipState.set(container, state);
  }
  return state;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Clave de cada bloque: su `aria-label` (Compartir lo cambia al copiar, pero
// eso no coincide con un cambio de distribución).
function tileKey(el) {
  return el.getAttribute("data-tile-key") || el.getAttribute("aria-label") || "";
}

function collect(container) {
  const map = new Map();
  for (const el of container.children) {
    if (el.hasAttribute("data-tile-ghost")) continue;
    const key = tileKey(el);
    if (key) map.set(key, el);
  }
  return map;
}

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

// Corta lo que estuviera en marcha. Las copias de un bloque que se iba solo se
// retiran si se pide (`ghosts`): un cambio de ancho no las toca.
export function stopTilesFlip(container, { ghosts = true } = {}) {
  if (!container) return;
  const state = stateOf(container);
  for (const animation of state.running) animation.cancel();
  state.running.clear();
  if (!ghosts) return;
  for (const ghost of state.ghosts) ghost.remove();
  state.ghosts.clear();
}

// Caja visual de cada bloque antes del cambio. `null` si no hay nada que animar.
export function snapshotTiles(container) {
  if (!container || prefersReducedMotion()) return null;
  // Oculto (`hidden` en el teléfono, o fuera de la vista): nada que animar.
  if (!container.getClientRects().length) return null;
  const tiles = new Map();
  for (const [key, el] of collect(container)) tiles.set(key, { el, rect: rectOf(el) });
  return { tiles };
}

// Con la distribución nueva ya aplicada, cada bloque arranca en su caja de la
// instantánea y viaja a la suya.
export function playTilesFlip(container, snapshot) {
  if (!container || !snapshot) return;
  const state = stateOf(container);
  const track = (animation) => {
    state.running.add(animation);
    const done = () => state.running.delete(animation);
    animation.onfinish = done;
    animation.oncancel = done;
    return animation;
  };
  const now = collect(container);
  const options = { duration: DURATION_MS, easing: EASING };

  for (const [key, el] of now) {
    const before = snapshot.tiles.get(key);
    if (!before) {
      // Entra (Actividad): crece desde su centro, ya en su sitio.
      track(el.animate(
        [{ transformOrigin: "50% 50%", transform: "scale(0)" }, { transformOrigin: "50% 50%", transform: "scale(1)" }],
        options,
      ));
      continue;
    }
    const frames = flipFrames(before.rect, rectOf(el));
    if (!frames) continue;
    track(el.animate(frames.tile, options));
    for (const child of el.querySelectorAll(CONTENT_SELECTOR)) {
      track(child.animate(frames.content, options));
    }
  }

  // Se va: una copia en su caja anterior encoge hasta desaparecer.
  const box = container.getBoundingClientRect();
  for (const [key, { el, rect }] of snapshot.tiles) {
    if (now.has(key)) continue;
    const ghost = el.cloneNode(true);
    ghost.setAttribute("data-tile-ghost", "");
    ghost.setAttribute("aria-hidden", "true");
    ghost.removeAttribute("id");
    ghost.tabIndex = -1;
    Object.assign(ghost.style, {
      position: "absolute",
      left: `${rect.x - box.left}px`,
      top: `${rect.y - box.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      pointerEvents: "none",
      // Sin la entrada en cascada de la fila del teléfono.
      animation: "none",
    });
    container.appendChild(ghost);
    state.ghosts.add(ghost);
    const animation = ghost.animate(
      [{ transformOrigin: "50% 50%", transform: "scale(1)" }, { transformOrigin: "50% 50%", transform: "scale(0)" }],
      { ...options, fill: "forwards" },
    );
    const remove = () => {
      ghost.remove();
      state.ghosts.delete(ghost);
    };
    animation.finished.then(remove, remove);
  }
}

export default class TilesLayoutFlip extends Component {
  containerRef = createRef();

  componentWillUnmount() {
    stopTilesFlip(this.containerRef.current);
  }

  getSnapshotBeforeUpdate(prevProps) {
    if (prevProps.layoutKey === this.props.layoutKey) return null;
    return snapshotTiles(this.containerRef.current);
  }

  componentDidUpdate(_prevProps, _prevState, snapshot) {
    if (!snapshot) return;
    const container = this.containerRef.current;
    if (!container) return;
    stopTilesFlip(container);
    // La fila de DetailModal (`useScoreRowFit`) aplica aquí, sin animar, su
    // reparto final si estaba esperando: este FLIP cubre ancho y número de
    // bloques en un solo movimiento.
    container.dispatchEvent(new CustomEvent(TILES_RELAYOUT_EVENT, { bubbles: true }));
    playTilesFlip(container, snapshot);
  }

  render() {
    const { className = "", children, ...rest } = this.props;
    delete rest.layoutKey;
    return (
      <div ref={this.containerRef} className={`relative ${className}`} {...rest}>
        {children}
      </div>
    );
  }
}
