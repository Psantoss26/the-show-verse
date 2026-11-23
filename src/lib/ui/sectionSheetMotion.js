// Movimiento de la vista lateral de una sección (SectionSheet). Un único
// sitio para la duración y la curva de la entrada y la salida.

// Entrada: deceleración larga, sin rebote (la curva de las hojas de iOS). La
// salida es más corta y acelera al irse, pero arranca ya con velocidad: con
// una curva que sale parada (0.4, 0, 0.9, 0.6) en 50 ms solo había recorrido
// un 4 % y la X parecía tardar en responder; ahora un 16 %.
// También la usan las vistas previas de la ficha (DetailModal y su drawer, el
// panel de temporada/episodio y la vista previa móvil): todas se mueven igual.
const ENTER_CURVE = [0.32, 0.72, 0, 1];
const EXIT_CURVE = [0.2, 0.2, 0.9, 0.6];
const ENTER_MS = 420;
const EXIT_MS = 260;
const cubic = (curve) => `cubic-bezier(${curve.join(", ")})`;

// Para la API de animaciones (WAAPI): milisegundos y curva CSS.
export const SHEET_ENTER = { duration: ENTER_MS, easing: cubic(ENTER_CURVE) };
export const SHEET_EXIT = { duration: EXIT_MS, easing: cubic(EXIT_CURVE) };
// Lo mismo para las `transition` de framer-motion: segundos y curva en array.
export const SHEET_ENTER_FRAMER = { duration: ENTER_MS / 1000, ease: ENTER_CURVE };
export const SHEET_EXIT_FRAMER = { duration: EXIT_MS / 1000, ease: EXIT_CURVE };

// Fotogramas del panel (solo `transform`: un fundido de opacidad sobre el
// panel lo convertiría en raíz de backdrop y aplanaría su cristal).
export const SHEET_PANEL_FRAMES = [
  { transform: "translate3d(100%, 0, 0)" },
  { transform: "translate3d(0, 0, 0)" },
];

// Fotogramas del velo de detrás (este sí puede fundirse: no lleva cristal).
export const SHEET_SCRIM_FRAMES = [{ opacity: 0 }, { opacity: 1 }];
