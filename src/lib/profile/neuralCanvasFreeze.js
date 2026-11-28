// Lienzo de la vista neuronal congelado mientras la cabecera del perfil hace
// su morph (ver headerMorph.js y NeuralGraphView).
//
// El morph no anima alturas: el marco del lienzo toma al empezar su tamaño
// final y se desplaza con transform desde donde estaba, mientras el lienzo
// (`data-header-morph-pin`) se desplaza al revés y queda quieto en pantalla.
//
// Congelado, el lienzo toma un alto fijo —el de la pantalla, que no es menor
// que el marco— anclado ABAJO del marco: no se redimensiona ni se redibuja
// durante el viaje. El fundido de arriba y abajo del móvil pasa del lienzo al
// MARCO, que es el que se mueve: así el borde fundido acompaña al marco en vez
// de quedarse quieto con el lienzo (y el marco lo recortaba en seco).

function maskOf(element, view) {
  const style = view.getComputedStyle(element);
  const mask = style.maskImage || style.webkitMaskImage || "none";
  return mask === "none" ? null : mask;
}

export function frozenCanvasStyle(stageHeight, viewportHeight, masked) {
  const style = {
    top: "auto",
    height: `${Math.ceil(Math.max(stageHeight, viewportHeight))}px`,
  };
  if (masked) {
    style.maskImage = "none";
    style.webkitMaskImage = "none";
  }
  return style;
}

// Congela el lienzo y devuelve la función que lo libera (deja sus estilos y
// los del marco como estaban: los del CSS).
export function freezeNeuralCanvas({ canvas, stage, viewportHeight, view = globalThis }) {
  const mask = maskOf(canvas, view);
  const canvasStyle = frozenCanvasStyle(stage.offsetHeight, viewportHeight, Boolean(mask));
  const stageStyle = mask ? { maskImage: mask, webkitMaskImage: mask } : {};
  Object.assign(canvas.style, canvasStyle);
  Object.assign(stage.style, stageStyle);
  return () => {
    for (const property of Object.keys(canvasStyle)) canvas.style[property] = "";
    for (const property of Object.keys(stageStyle)) stage.style[property] = "";
  };
}
