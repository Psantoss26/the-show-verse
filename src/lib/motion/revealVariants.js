// Variantes de la entrada de filas y secciones de los dashboards (Inicio,
// Películas, Series y sus filas de fondos / «Continuar viendo»).
//
// El desplazamiento se anima con `transform` como CADENA, no con
// `y`: framer solo pasa a WAAPI (compositor) la opacidad y `transform`;
// `y` lo calcula en JS fotograma a fotograma. Al hacer scroll, la
// fila siguiente se monta (Swiper + tarjetas, 40-60 ms de render) justo cuando
// la anterior está entrando: con `y` en JS el movimiento se congelaba mientras
// la opacidad (ya en el compositor) seguía, y la fila llegaba a trompicones y
// desacompasada. Con todo en WAAPI la entrada no depende del hilo principal.
//
// La animación termina en `translateY(0px)` y `transitionEnd` deja
// después `none`: así la fila no se queda con un `transform` que crearía
// contexto de apilamiento y bloque contenedor para las vistas previas que
// sobresalen de ella. No se puede animar directamente HACIA `none`: framer
// mezcla la cadena con la plantilla de origen y deja `scale(0)` al acabar.
const REVEAL_EASE = [0.22, 1, 0.36, 1];

export const fadeInUp = {
  hidden: { opacity: 0, transform: "translateY(40px)" },
  visible: {
    opacity: 1,
    transform: "translateY(0px)",
    transition: { duration: 0.6, ease: REVEAL_EASE },
    transitionEnd: { transform: "none" },
  },
};

// Títulos de las secciones (antetítulo con línea + título): SOLO opacidad. La
// fila que los contiene ya entra subiendo con `fadeInUp`; antes llevaban además
// `scale(0.95) → scale(1)` y, al reescalar, la línea de 1 px y las mayúsculas
// de 11-12 px del antetítulo se remuestreaban en cada fotograma y vibraban.
export const titleReveal = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.4, ease: REVEAL_EASE },
  },
};

export const staggerContainer = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};
