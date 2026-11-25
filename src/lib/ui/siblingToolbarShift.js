// Relevo de la barra móvil entre páginas hermanas que no tienen los mismos
// botones (Historial lleva el del calendario; Continuar viendo, no).
//
// Antes el hueco del botón se abría o cerraba con un muelle de framer sobre
// `width` y `margin-left`: cálculo en JS y layout de toda la fila en cada
// fotograma, justo mientras se monta la página nueva. En la app de Android
// (WebView) el buscador y el selector de sección iban a tirones, y el selector
// se movía con una curva distinta de la de su pastilla.
//
// Ahora la fila se pinta ya en su sitio final y solo se anima el camino desde
// donde estaba, con propiedades del compositor (FLIP):
//   - "follow": lo que se desplaza (el selector) → `transform`.
//   - "glass": el cristal del buscador, que crece o encoge → `clip-path` sobre
//     una capa que se alarga a la derecha mientras dura el relevo.
//   - "fade-in" / "fade-out": el botón que aparece, o su copia que se va →
//     `opacity`.
// Misma duración y curva que la pastilla (useSlidingSectionIndicator), para
// que pastilla y selector se muevan como una sola cosa.

export const SLIDE_MS = 460;
export const SLIDE_EASING = "cubic-bezier(0.25, 0.6, 0.3, 1)";

// `delta`: posición anterior menos la final del selector, en px (positivo si
// el selector se desplaza a la izquierda porque aparece un botón a su
// derecha). El buscador cambia de ancho en lo mismo: `delta` > 0 encoge.
export function siblingShiftKeyframes(delta, radius = "1rem") {
  const d = Number(delta) || 0;
  // La capa del cristal mide el ancho final más lo que sobresale el anterior
  // (si era mayor) y se recorta para enseñar primero el ancho anterior.
  const extend = Math.max(d, 0);
  const clip = (right) => `inset(0px ${right}px 0px 0px round ${radius})`;
  return {
    extend,
    follow: [{ transform: `translate3d(${d}px,0,0)` }, { transform: "translate3d(0px,0,0)" }],
    glass: [{ clipPath: clip(extend - d) }, { clipPath: clip(extend) }],
    fadeIn: [{ opacity: 0, transform: "scale(0.85)" }, { opacity: 1, transform: "scale(1)" }],
    fadeOut: [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.85)" }],
  };
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Lanza el relevo en `row` (llamar en un useLayoutEffect, antes de pintar).
// Devuelve una promesa que se resuelve al acabar (o al instante si no anima).
export function runSiblingToolbarShift(row, delta) {
  if (!row || !delta || typeof row.animate !== "function" || prefersReducedMotion()) {
    return Promise.resolve();
  }
  const frames = siblingShiftKeyframes(delta);
  const options = { duration: SLIDE_MS, easing: SLIDE_EASING };
  const animations = [];
  const cleanups = [];
  const each = (role, fn) => row.querySelectorAll(`[data-sibling-shift="${role}"]`).forEach(fn);

  each("follow", (el) => animations.push(el.animate(frames.follow, options)));
  each("glass", (el) => {
    if (frames.extend) {
      el.style.right = `-${frames.extend}px`;
      cleanups.push(() => el.style.removeProperty("right"));
    }
    animations.push(el.animate(frames.glass, options));
  });
  each("fade-in", (el) => animations.push(el.animate(frames.fadeIn, options)));
  each("fade-out", (el) =>
    animations.push(el.animate(frames.fadeOut, { ...options, fill: "forwards" })),
  );

  const done = () => cleanups.forEach((fn) => fn());
  return Promise.all(animations.map((a) => a.finished.catch(() => {}))).then(done);
}
