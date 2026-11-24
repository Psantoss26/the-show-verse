// Acabado de los botones de acción en las imágenes compartibles (ActionButton
// de ogKit.jsx): la MISMA receta que los botones de acción de la ficha
// (LiquidButton `liquidGlass` + `.sv-lg-btn` de globals.css), traducida a lo que
// Satori sabe pintar, que es una lista de fondos y una sombra.
//
// Capas, de arriba abajo, como en la página:
//   - `.sv-lg-sheen`: lóbulo de luz arriba y penumbra abajo (volumen sin aro).
//   - `.sv-lg-tint` (activo): el cristal teñido del color de la acción.
//   - LiquidGlassOpticalLayers SIN el canto de refracción (`.sv-glass-rim`
//     va oculto en los botones: en una pieza pequeña se lee como un aro claro).
//   - LIQUID_GLASS_CARD: tinte negro y degradado vertical del cristal.
// SIN BORDES: nada sigue el contorno (ni `inset`, ni aro de color en el
// activo). El límite del botón es solo el cambio de cristal a fondo, y el
// activo se separa con el halo de su color.

const rgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

const SHEEN =
  "radial-gradient(90% 60% at 50% 12%, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 55%, rgba(255,255,255,0) 100%), " +
  "radial-gradient(100% 55% at 50% 100%, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 100%)";
// `[data-solid]`: sobre blanco solo la penumbra, en oscuro.
const SHEEN_SOLID = "radial-gradient(100% 55% at 50% 100%, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0) 100%)";
const OPTICAL =
  "radial-gradient(130% 100% at 50% 0%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 68%), " +
  "linear-gradient(125deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 16%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.02) 86%, rgba(255,255,255,0.04) 100%)";
const CARD = "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 50%, rgba(0,0,0,0.15) 100%)";
const TINT = "rgba(0, 0, 0, 0.15)"; // bg-black/15

// La ficha usa `radial-gradient(120% 95% at 50% 0%, … 0%, … 48%, … 100%)`.
// Satori solo pinta un degradado radial DENTRO de su elipse (no extiende el
// último color como el navegador): con 95 % de alto, el 5 % inferior del botón
// quedaba sin tinte y se veía cortado en recto. Elipse mayor que el botón
// (×1,37) con los cortes reescalados: mismo color en cada punto y sin hueco.
const tint = (color) =>
  `radial-gradient(164% 130% at 50% 0%, ${rgba(color.secondary, 0.34)} 0%, ${rgba(color.rgb, 0.26)} 35%, ${rgba(color.rgb, 0.16)} 73%)`;

/**
 * Fondo y sombra de un botón de la fila.
 * @param {{ variant?: string }} button
 * @param {{ rgb: number[], secondary: number[] } | undefined} color
 * @param {(value: number) => number} px  escala de la imagen (1 px de la ficha)
 */
export function actionButtonSurface(button, color, px) {
  const isSolid = button.variant === "solid";
  const isActive = button.variant === "active" && !!color;
  const isDisabled = button.variant === "disabled";

  const elevation = `0 ${px(16)}px ${px(40)}px -${px(8)}px rgba(0,0,0,0.75)`;
  const boxShadow = isDisabled
    ? undefined
    : isActive
      ? `${elevation}, 0 0 ${px(24)}px -${px(2)}px ${rgba(color.rgb, 0.42)}`
      : `${elevation}, 0 0 ${px(32)}px rgba(255,255,255,0.06)`;

  const layers = [isSolid ? SHEEN_SOLID : SHEEN, isActive ? tint(color) : null, OPTICAL, CARD]
    .filter(Boolean)
    .join(", ");

  return {
    backgroundColor: isSolid ? "#ffffff" : TINT,
    backgroundImage: layers,
    ...(boxShadow ? { boxShadow } : {}),
  };
}

/** Relleno de progreso (estilo batería), como `fillPercentage` en la ficha. */
export function actionButtonFill(color, px) {
  return {
    backgroundImage: `linear-gradient(to top, ${rgba(color.rgb, 0.4)}, ${rgba(color.rgb, 0.15)})`,
    boxShadow: `0 -${px(2)}px ${px(10)}px ${rgba(color.secondary, 0.3)}`,
  };
}
