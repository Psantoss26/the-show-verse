// Variantes de la entrada de filas y secciones de los dashboards (Inicio,
// Películas, Series y sus filas de fondos / «Continuar viendo»).
//
// El desplazamiento y la escala se animan con `transform` como CADENA, no con
// `y`/`scale`: framer solo pasa a WAAPI (compositor) la opacidad y `transform`;
// `y` y `scale` los calcula en JS fotograma a fotograma. Al hacer scroll, la
// fila siguiente se monta (Swiper + tarjetas, 40-60 ms de render) justo cuando
// la anterior está entrando: con `y` en JS el movimiento se congelaba mientras
// la opacidad (ya en el compositor) seguía, y la fila llegaba a trompicones y
// desacompasada. Con todo en WAAPI la entrada no depende del hilo principal.
//
// La animación termina en `translateY(0px)`/`scale(1)` y `transitionEnd` deja
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

export const scaleIn = {
  hidden: { opacity: 0, transform: "scale(0.95)" },
  visible: {
    opacity: 1,
    transform: "scale(1)",
    transition: { duration: 0.4, ease: REVEAL_EASE },
    transitionEnd: { transform: "none" },
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
