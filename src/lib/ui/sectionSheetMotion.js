// Movimiento y colocación de la vista lateral de una sección (SectionSheet).
// Un único sitio para la duración y la curva de la entrada y la salida, y
// para decidir dónde empieza el panel en el teléfono cuando la página tiene
// un menú de secciones que debe seguir a la vista (`data-sv-sheet-anchor`).

// Entrada: deceleración larga, sin rebote (la curva de las hojas de iOS). La
// salida es más corta y acelera al irse: así el cierre se siente inmediato
// sin cortar el gesto de golpe.
// También la usan las vistas previas de la ficha (DetailModal y su drawer, el
// panel de temporada/episodio y la vista previa móvil): todas se mueven igual.
const ENTER_CURVE = [0.32, 0.72, 0, 1];
const EXIT_CURVE = [0.4, 0, 0.9, 0.6];
const ENTER_MS = 420;
const EXIT_MS = 260;
const cubic = (curve) => `cubic-bezier(${curve.join(", ")})`;

// Para la API de animaciones (WAAPI): milisegundos y curva CSS.
export const SHEET_ENTER = { duration: ENTER_MS, easing: cubic(ENTER_CURVE) };
export const SHEET_EXIT = { duration: EXIT_MS, easing: cubic(EXIT_CURVE) };
// Lo mismo para las `transition` de framer-motion: segundos y curva en array.
export const SHEET_ENTER_FRAMER = { duration: ENTER_MS / 1000, ease: ENTER_CURVE };
export const SHEET_EXIT_FRAMER = { duration: EXIT_MS / 1000, ease: EXIT_CURVE };

// Por debajo de este ancho el panel ocupa todo el ancho (teléfono) y se
// coloca bajo el menú de secciones en vez de tapar la pantalla entera.
export const SHEET_ANCHOR_MAX_WIDTH = 639.98;

// Fotogramas del panel (solo `transform`: un fundido de opacidad sobre el
// panel lo convertiría en raíz de backdrop y aplanaría su cristal).
export const SHEET_PANEL_FRAMES = [
  { transform: "translate3d(100%, 0, 0)" },
  { transform: "translate3d(0, 0, 0)" },
];

// Fotogramas del velo de detrás (este sí puede fundirse: no lleva cristal).
export const SHEET_SCRIM_FRAMES = [{ opacity: 0 }, { opacity: 1 }];

/**
 * Dónde empieza el panel en el teléfono.
 *
 * @param {{ top: number, bottom: number }} anchorRect  caja del contenedor
 *   sticky del menú de secciones, medida ahora.
 * @param {number} stickyTop  su `top` de sticky (donde se queda pegado).
 * @param {number} viewportHeight
 * @returns {{ scrollBy: number, top: number } | null}  `scrollBy`: cuánto
 *   desplazar la página antes de abrir para que el menú quede pegado bajo la
 *   barra (si aún está más abajo); `top`: borde superior del panel tras ese
 *   desplazamiento. `null` si no hay menú visible: panel a pantalla completa.
 */
export function sheetAnchorPlacement(anchorRect, stickyTop, viewportHeight) {
  if (!anchorRect || !Number.isFinite(anchorRect.top) || !Number.isFinite(anchorRect.bottom)) return null;
  const height = anchorRect.bottom - anchorRect.top;
  if (!(height > 0) || !(viewportHeight > 0)) return null;
  const pinnedTop = Number.isFinite(stickyTop) ? stickyTop : anchorRect.top;
  // Menú por encima de la pantalla (no debería pasar con sticky): sin anclar.
  if (anchorRect.bottom <= 0) return null;
  // Menú aún sin pegar (la cabecera de la ficha sigue a la vista): se sube la
  // página lo justo para que quede pegado y el panel tenga todo el alto.
  const scrollBy = anchorRect.top > pinnedTop + 1 ? Math.round(anchorRect.top - pinnedTop) : 0;
  const top = Math.round(anchorRect.bottom - scrollBy);
  // Si ni así cabe un panel útil (pantalla muy baja), a pantalla completa.
  if (viewportHeight - top < viewportHeight * 0.4) return null;
  return { scrollBy, top };
}
