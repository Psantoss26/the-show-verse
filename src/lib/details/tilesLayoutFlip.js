// Lógica pura de los bloques del marcador (Plataformas, Actividad, Enlaces,
// Compartir) al cambiar de título. La usan `useFollowingActivityState` y
// `<TilesLayoutFlip>`.

// Mientras no se sabe si el título nuevo lleva Actividad (primera visita, sin
// copia guardada) se conservan los bloques del título anterior; al saberlo,
// manda el nuevo y `<TilesLayoutFlip>` anima el cambio si lo hay.
export function shownActivityTile({ resolved, hasActivity, previous }) {
  return resolved ? Boolean(hasActivity) : Boolean(previous);
}

const round = (n) => Math.round(n * 1000) / 1000;

// Fotogramas FLIP de un bloque que pasa de `from` a `to` (rects de pantalla).
// El bloque se dibuja en su sitio nuevo pero arranca trasladado y escalado a su
// caja anterior; su contenido (icono y nombre) aplica la escala inversa para no
// deformarse. Solo `transform`: la opacidad en el bloque apagaría su cristal.
// `null` si no hay nada que animar.
export function flipFrames(from, to) {
  if (!from || !to || !to.width || !to.height) return null;
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
    return null;
  }
  return {
    tile: [
      { transformOrigin: "0 0", transform: `translate(${round(dx)}px, ${round(dy)}px) scale(${round(sx)}, ${round(sy)})` },
      { transformOrigin: "0 0", transform: "translate(0px, 0px) scale(1, 1)" },
    ],
    content: [
      { transform: `scale(${round(1 / sx)}, ${round(1 / sy)})` },
      { transform: "scale(1, 1)" },
    ],
  };
}
