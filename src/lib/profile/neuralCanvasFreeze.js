// Lienzo de la vista neuronal congelado mientras la cabecera del perfil hace
// su morph (ver headerMorph.js y NeuralGraphView).
//
// Durante el morph el marco del lienzo cambia de alto en cada fotograma.
// Seguirlo obligaba a reasignar `canvas.width/height` (borra el lienzo y
// reserva su memoria de nuevo: ~13 MB a DPR 3 en el móvil) y a redibujar la
// red entera en cada fotograma: en la APK la transición iba a tirones.
//
// Congelado, el lienzo toma un alto fijo —el de la pantalla, que no es menor
// que el marco en ningún punto del morph— anclado ABAJO (el borde inferior del
// marco no se mueve) y el marco (overflow hidden) lo recorta por arriba: la red
// queda quieta sin redibujarse. La máscara de fundido del móvil se dimensiona
// al marco (`--neural-stage-h`, ver `syncFrozenStageHeight`) para que el borde
// de arriba siga fundido.

export const FROZEN_STAGE_HEIGHT_VAR = "--neural-stage-h";

export function frozenCanvasStyle(stageHeight, viewportHeight) {
  return {
    top: "auto",
    height: `${Math.ceil(Math.max(stageHeight, viewportHeight))}px`,
    maskSize: `100% var(${FROZEN_STAGE_HEIGHT_VAR}, 100%)`,
    maskPosition: "bottom",
    maskRepeat: "no-repeat",
  };
}

export function syncFrozenStageHeight(stage, stageHeight) {
  stage.style.setProperty(FROZEN_STAGE_HEIGHT_VAR, `${stageHeight}px`);
}

// Congela el lienzo y devuelve la función que lo libera (deja sus estilos
// como estaban: los del CSS).
export function freezeNeuralCanvas({ canvas, stage, viewportHeight }) {
  const stageHeight = stage.offsetHeight;
  const style = frozenCanvasStyle(stageHeight, viewportHeight);
  syncFrozenStageHeight(stage, stageHeight);
  Object.assign(canvas.style, style);
  return () => {
    stage.style.removeProperty(FROZEN_STAGE_HEIGHT_VAR);
    for (const property of Object.keys(style)) canvas.style[property] = "";
  };
}
