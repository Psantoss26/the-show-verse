// Entrada y salida del menú lateral móvil (drawer de Navbar).
//
// Antes el panel entraba con `x` y un muelle de framer: `x` se calcula en JS
// fotograma a fotograma (60-70 escrituras de `style` por apertura), así que
// cada pausa del hilo principal lo congelaba. Pasaba sobre todo al tocar una
// opción del menú (el cierre coincide con el render de la página nueva:
// pausas de 33-75 ms medidas en la app de Android) y en páginas pesadas: el
// menú se paraba y saltaba. Con `transform` como CADENA framer lo pasa a WAAPI
// y lo anima el compositor, sin depender del hilo principal (ver
// revealVariants.js). Los muelles no van al compositor: duración y curva, las
// de la hoja de filtros móvil (`.sv-options-sheet-in/out` en globals.css).
//
// El panel sale un 110 % de su ancho para que la sombra y el canto del cristal
// no asomen por el borde. Velo y panel comparten tiempos: una sola pieza.
const ENTER = { duration: 0.34, ease: [0.16, 1, 0.3, 1] };
const EXIT = { duration: 0.22, ease: [0.4, 0, 1, 1] };

const HIDDEN = "translate3d(-110%, 0px, 0px)";

export const mobileDrawerPanel = {
  initial: { transform: HIDDEN },
  animate: { transform: "translate3d(0%, 0px, 0px)", transition: ENTER },
  exit: { transform: HIDDEN, transition: EXIT },
};

export const mobileDrawerVeil = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: ENTER },
  exit: { opacity: 0, transition: EXIT },
};
